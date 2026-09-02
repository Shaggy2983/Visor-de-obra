#!/usr/bin/env python3
"""Escribe ejemplo.ifc: una caseta de obra de dos plantas.

Sirve para probar el visor en un teléfono sin tener a mano un modelo real,
y como banco de pruebas del lector. Ejecutar desde la raíz:

    python3 herramientas/ejemplo.py
"""
import math
import pathlib

ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

lineas = []
siguiente = [0]


def guid(n):
    """Identificador de 22 caracteres con el alfabeto que usa IFC."""
    salida = ''
    for i in range(22):
        salida += ALFABETO[(n * 7 + i * 13 + 5) % 64]
    return salida


def linea(texto):
    siguiente[0] += 1
    n = siguiente[0]
    lineas.append(f'#{n}={texto};')
    return f'#{n}'


def punto(x, y, z=None):
    if z is None:
        return linea(f'IFCCARTESIANPOINT(({x:.6f},{y:.6f}))')
    return linea(f'IFCCARTESIANPOINT(({x:.6f},{y:.6f},{z:.6f}))')


def direccion(*c):
    valores = ','.join(f'{v:.6f}' for v in c)
    return linea(f'IFCDIRECTION(({valores}))')


def colocacion(x=0.0, y=0.0, z=0.0, angulo=None):
    p = punto(x, y, z)
    ref = direccion(math.cos(angulo), math.sin(angulo), 0.0) if angulo is not None else '$'
    return linea(f'IFCAXIS2PLACEMENT3D({p},$,{ref})')


def local(padre, sitio):
    return linea(f'IFCLOCALPLACEMENT({padre},{sitio})')


def caja(contexto, ancho, fondo, alto, dz=0.0):
    """Prisma recto: perfil rectangular centrado, extruido en Z."""
    origen2d = punto(0.0, 0.0)
    sitio2d = linea(f'IFCAXIS2PLACEMENT2D({origen2d},$)')
    perfil = linea(f"IFCRECTANGLEPROFILEDEF(.AREA.,$,{sitio2d},{ancho:.6f},{fondo:.6f})")
    base = colocacion(0.0, 0.0, dz)
    arriba = direccion(0.0, 0.0, 1.0)
    solido = linea(f'IFCEXTRUDEDAREASOLID({perfil},{base},{arriba},{alto:.6f})')
    forma = linea(f"IFCSHAPEREPRESENTATION({contexto},'Body','SweptSolid',({solido}))")
    return linea(f'IFCPRODUCTDEFINITIONSHAPE($,$,({forma}))')


def conjunto_propiedades(nombre, valores, elemento, n):
    refs = []
    for clave, valor in valores:
        if isinstance(valor, (int, float)):
            texto = f'IFCREAL({valor:.6f})'
        else:
            texto = f"IFCLABEL('{valor}')"
        refs.append(linea(f"IFCPROPERTYSINGLEVALUE('{clave}',$,{texto},$)"))
    pset = linea(f"IFCPROPERTYSET('{guid(n)}',$,'{nombre}',$,({','.join(refs)}))")
    linea(f"IFCRELDEFINESBYPROPERTIES('{guid(n + 1)}',$,$,$,({elemento}),{pset})")


def main():
    # --- cabecera del proyecto -------------------------------------
    origen = colocacion()
    contexto = linea(
        f"IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,{origen},$)")
    metro = linea('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')
    metro2 = linea('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')
    metro3 = linea('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')
    unidades = linea(f'IFCUNITASSIGNMENT(({metro},{metro2},{metro3}))')
    proyecto = linea(
        f"IFCPROJECT('{guid(1)}',$,'E04 · caseta de obra',$,$,$,$,({contexto}),{unidades})")

    sitio_pl = local('$', colocacion())
    solar = linea(
        f"IFCSITE('{guid(2)}',$,'Solar',$,$,{sitio_pl},$,$,.ELEMENT.,$,$,$,$,$)")
    edificio_pl = local(sitio_pl, colocacion())
    edificio = linea(
        f"IFCBUILDING('{guid(3)}',$,'Caseta',$,$,{edificio_pl},$,$,.ELEMENT.,$,$,$)")

    plantas = []
    for i, (nombre, cota) in enumerate([('Planta baja', 0.0), ('Planta primera', 3.0)]):
        pl = local(edificio_pl, colocacion(0.0, 0.0, cota))
        ref = linea(
            f"IFCBUILDINGSTOREY('{guid(10 + i)}',$,'{nombre}',$,$,{pl},$,$,.ELEMENT.,{cota:.6f})")
        plantas.append((ref, pl))

    linea(f"IFCRELAGGREGATES('{guid(20)}',$,$,$,{proyecto},({solar}))")
    linea(f"IFCRELAGGREGATES('{guid(21)}',$,$,$,{solar},({edificio}))")
    linea(f"IFCRELAGGREGATES('{guid(22)}',$,$,$,{edificio},"
          f"({','.join(p[0] for p in plantas)}))")

    ancho, fondo, alto, grueso = 8.0, 6.0, 3.0, 0.25
    contador = [100]

    def elemento(clase, nombre, planta_idx, x, y, z, angulo, dims, tipo, psets=None):
        contador[0] += 3
        n = contador[0]
        sitio = local(plantas[planta_idx][1], colocacion(x, y, z, angulo))
        forma = caja(contexto, dims[0], dims[1], dims[2])
        ref = linea(f"IFC{clase}('{guid(n)}',$,'{nombre}',$,$,{sitio},{forma},"
                    f"'{nombre}',{tipo})")
        if psets:
            conjunto_propiedades(psets[0], psets[1], ref, n + 1)
        return ref

    baja, primera = [], []

    # planta baja: solera, cuatro muros y un pilar
    baja.append(elemento('SLAB', 'Solera', 0, 0, 0, -0.25, None,
                         (ancho, fondo, 0.25), '.FLOOR.',
                         ('Pset_SlabCommon', [('Reference', 'HA-25'),
                                              ('LoadBearing', 'T'),
                                              ('Thickness', 0.25)])))
    muros = [
        ('Muro sur', 0.0, -fondo / 2, 0.0, ancho),
        ('Muro norte', 0.0, fondo / 2, 0.0, ancho),
        ('Muro oeste', -ancho / 2, 0.0, math.pi / 2, fondo),
        ('Muro este', ancho / 2, 0.0, math.pi / 2, fondo)
    ]
    for nombre, x, y, angulo, largo in muros:
        baja.append(elemento('WALL', nombre, 0, x, y, 0.0, angulo,
                             (largo, grueso, alto), '.STANDARD.',
                             ('Pset_WallCommon', [('Reference', 'M-1'),
                                                  ('IsExternal', 'T'),
                                                  ('ThermalTransmittance', 0.42)])))
    baja.append(elemento('COLUMN', 'Pilar central', 0, 0.0, 0.0, 0.0, None,
                         (0.4, 0.4, alto), '.COLUMN.',
                         ('Pset_ColumnCommon', [('Reference', 'P-1'),
                                                ('LoadBearing', 'T')])))

    # planta primera: forjado y peto
    primera.append(elemento('SLAB', 'Forjado de cubierta', 1, 0, 0, 0.0, None,
                            (ancho, fondo, 0.3), '.ROOF.',
                            ('Pset_SlabCommon', [('Reference', 'F-1'),
                                                 ('Thickness', 0.30)])))
    primera.append(elemento('WALL', 'Peto sur', 1, 0.0, -fondo / 2, 0.3, 0.0,
                            (ancho, grueso, 0.9), '.PARAPET.', None))
    primera.append(elemento('WALL', 'Peto norte', 1, 0.0, fondo / 2, 0.3, 0.0,
                            (ancho, grueso, 0.9), '.PARAPET.', None))

    for i, grupo in enumerate([baja, primera]):
        linea(f"IFCRELCONTAINEDINSPATIALSTRUCTURE('{guid(60 + i)}',$,$,$,"
              f"({','.join(grupo)}),{plantas[i][0]})")

    cuerpo = '\n'.join(lineas)
    texto = f"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('ejemplo.ifc','2026-01-01T00:00:00',(''),(''),'visor-de-obra','herramientas/ejemplo.py','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
{cuerpo}
ENDSEC;
END-ISO-10303-21;
"""
    destino = pathlib.Path(__file__).resolve().parent.parent / 'ejemplo.ifc'
    destino.write_text(texto, encoding='utf-8')
    print(f'{destino.name}: {len(lineas)} líneas')


if __name__ == '__main__':
    main()
