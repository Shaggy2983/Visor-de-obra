/* Worker de lectura de IFC.
   Todo el trabajo pesado —abrir el archivo, teselar la geometría y leer
   propiedades— ocurre aquí para que la pantalla no se congele en el móvil.

   La geometría no se manda elemento por elemento: se agrupa por color en
   lotes grandes y se envía como buffers transferibles. Cada lote lleva una
   tabla de rangos (expressID, inicio, longitud) que permite al hilo
   principal saber qué triángulo pertenece a qué elemento. */

import {
  IfcAPI,
  IFCRELCONTAINEDINSPATIALSTRUCTURE,
  IFCRELAGGREGATES,
  IFCBUILDINGSTOREY
} from '../vendor/web-ifc/web-ifc-api.js';

const api = new IfcAPI();
let iniciado = false;
let modelo = -1;

/* Vértices por lote. Un valor alto reduce llamadas de dibujo; uno
   demasiado alto retrasa la aparición del primer trozo de modelo. */
const VERTICES_POR_LOTE = 180000;

/* ------------------------------------------------------------------ */
/* buffers que crecen solos                                            */
/* ------------------------------------------------------------------ */

function Cinta(Tipo, inicial = 1 << 15) {
  this.Tipo = Tipo;
  this.a = new Tipo(inicial);
  this.n = 0;
}

Cinta.prototype.reservar = function (cuantos) {
  if (this.n + cuantos <= this.a.length) return;
  let cap = this.a.length;
  while (cap < this.n + cuantos) cap *= 2;
  const nueva = new this.Tipo(cap);
  nueva.set(this.a.subarray(0, this.n));
  this.a = nueva;
};

Cinta.prototype.recortar = function () {
  return this.a.slice(0, this.n);
};

/* ------------------------------------------------------------------ */
/* lotes                                                               */
/* ------------------------------------------------------------------ */

function Lote(color) {
  this.color = color;              // {r, g, b, a}
  this.pos = new Cinta(Float32Array);
  this.nor = new Cinta(Float32Array);
  this.idx = new Cinta(Uint32Array);
  this.rangos = [];                // [expressID, inicio, longitud, ...]
  this.vertices = 0;
}

function enviarLote(lote) {
  if (lote.idx.n === 0) return;
  const posiciones = lote.pos.recortar();
  const normales = lote.nor.recortar();
  const indices = lote.idx.recortar();
  const rangos = Uint32Array.from(lote.rangos);
  self.postMessage(
    { tipo: 'lote', color: lote.color, posiciones, normales, indices, rangos },
    [posiciones.buffer, normales.buffer, indices.buffer, rangos.buffer]
  );
}

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

function claveColor(c) {
  return [c.x, c.y, c.z, c.w].map((v) => Math.round(v * 255)).join(',');
}

function valorPlano(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}

/* ------------------------------------------------------------------ */
/* carga del modelo                                                    */
/* ------------------------------------------------------------------ */

async function iniciar() {
  if (iniciado) return;
  // Ruta absoluta al .wasm calculada desde la del propio worker: así
  // funciona igual servido desde GitHub Pages que dentro de un APK.
  api.SetWasmPath(new URL('../vendor/web-ifc/', import.meta.url).href, true);
  // Un solo hilo: GitHub Pages no envía las cabeceras COOP/COEP que
  // necesitaría la versión multihilo.
  await api.Init(undefined, true);
  iniciado = true;
}

function avisar(texto, porcentaje) {
  self.postMessage({ tipo: 'estado', texto, porcentaje });
}

async function cargar(datos) {
  await iniciar();
  if (modelo !== -1) {
    api.CloseModel(modelo);
    modelo = -1;
  }

  avisar('Leyendo el archivo…', 5);
  modelo = api.OpenModel(new Uint8Array(datos), {
    COORDINATE_TO_ORIGIN: true,
    CIRCLE_SEGMENTS: 12
  });

  const esquema = api.GetModelSchema(modelo);
  avisar('Generando la geometría…', 10);

  const lotes = new Map();
  const elementos = new Map();     // expressID → {tipo, nombre, guid}
  let ultimoAviso = 0;

  api.StreamAllMeshes(modelo, (malla, indice, total) => {
    const expressID = malla.expressID;
    const geometrias = malla.geometries;
    const cuantas = geometrias.size();
    // Lotes tocados por este elemento: lote → índice de inicio.
    const inicios = new Map();

    for (let g = 0; g < cuantas; g++) {
      const colocada = geometrias.get(g);
      const color = colocada.color;
      const clave = claveColor(color);

      let lote = lotes.get(clave);
      if (!lote) {
        lote = new Lote({ r: color.x, g: color.y, b: color.z, a: color.w });
        lotes.set(clave, lote);
      }
      if (!inicios.has(lote)) inicios.set(lote, lote.idx.n);

      const geo = api.GetGeometry(modelo, colocada.geometryExpressID);
      const verts = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      const indices = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      geo.delete();

      const m = colocada.flatTransformation;   // 4x4 por columnas

      // Matriz de cofactores para transformar las normales: sus columnas
      // son los productos vectoriales de las otras dos columnas de m.
      const c0x = m[5] * m[10] - m[6] * m[9];
      const c0y = m[6] * m[8] - m[4] * m[10];
      const c0z = m[4] * m[9] - m[5] * m[8];
      const c1x = m[9] * m[2] - m[10] * m[1];
      const c1y = m[10] * m[0] - m[8] * m[2];
      const c1z = m[8] * m[1] - m[9] * m[0];
      const c2x = m[1] * m[6] - m[2] * m[5];
      const c2y = m[2] * m[4] - m[0] * m[6];
      const c2z = m[0] * m[5] - m[1] * m[4];
      const det = m[0] * c0x + m[1] * c0y + m[2] * c0z;
      const signo = det < 0 ? -1 : 1;

      const nVerts = verts.length / 6;
      const base = lote.pos.n / 3;

      lote.pos.reservar(nVerts * 3);
      lote.nor.reservar(nVerts * 3);
      const P = lote.pos.a, N = lote.nor.a;
      let p = lote.pos.n, q = lote.nor.n;

      for (let v = 0; v < nVerts; v++) {
        const o = v * 6;
        const x = verts[o], y = verts[o + 1], z = verts[o + 2];
        const nx = verts[o + 3], ny = verts[o + 4], nz = verts[o + 5];

        P[p++] = m[0] * x + m[4] * y + m[8] * z + m[12];
        P[p++] = m[1] * x + m[5] * y + m[9] * z + m[13];
        P[p++] = m[2] * x + m[6] * y + m[10] * z + m[14];

        let ax = (c0x * nx + c1x * ny + c2x * nz) * signo;
        let ay = (c0y * nx + c1y * ny + c2y * nz) * signo;
        let az = (c0z * nx + c1z * ny + c2z * nz) * signo;
        const largo = Math.hypot(ax, ay, az) || 1;
        N[q++] = ax / largo;
        N[q++] = ay / largo;
        N[q++] = az / largo;
      }
      lote.pos.n = p;
      lote.nor.n = q;
      lote.vertices += nVerts;

      lote.idx.reservar(indices.length);
      const I = lote.idx.a;
      let k = lote.idx.n;
      if (signo < 0) {
        // La transformación invierte el espejo: hay que dar la vuelta a
        // los triángulos o las caras quedarían del revés.
        for (let t = 0; t < indices.length; t += 3) {
          I[k++] = base + indices[t + 2];
          I[k++] = base + indices[t + 1];
          I[k++] = base + indices[t];
        }
      } else {
        for (let t = 0; t < indices.length; t++) I[k++] = base + indices[t];
      }
      lote.idx.n = k;
    }

    // Ojo: la malla que entrega StreamAllMeshes la libera el propio
    // web-ifc al salir del callback; no lleva delete().

    for (const [lote, inicio] of inicios) {
      const largo = lote.idx.n - inicio;
      if (largo > 0) lote.rangos.push(expressID, inicio, largo);
    }

    // Ficha mínima del elemento, leída en crudo (rápido).
    if (!elementos.has(expressID)) {
      try {
        const cruda = api.GetRawLineData(modelo, expressID);
        elementos.set(expressID, {
          tipo: api.GetNameFromTypeCode(cruda.type),
          nombre: String(valorPlano(cruda.arguments[2]) || ''),
          guid: String(valorPlano(cruda.arguments[0]) || '')
        });
      } catch (e) {
        elementos.set(expressID, { tipo: 'IFCPRODUCT', nombre: '', guid: '' });
      }
    }

    // Vaciar lotes llenos, siempre entre elementos para no partir un rango.
    for (const [clave, lote] of lotes) {
      if (lote.vertices >= VERTICES_POR_LOTE) {
        enviarLote(lote);
        lotes.delete(clave);
      }
    }

    const ahora = Date.now();
    if (total && ahora - ultimoAviso > 200) {
      ultimoAviso = ahora;
      avisar('Generando la geometría…', 10 + Math.round((indice / total) * 75));
    }
  });

  for (const lote of lotes.values()) enviarLote(lote);
  lotes.clear();

  avisar('Ordenando plantas y categorías…', 90);
  const plantas = leerPlantas(elementos);

  self.postMessage({
    tipo: 'listo',
    esquema,
    elementos: Array.from(elementos, ([id, e]) => [id, e.tipo, e.nombre, e.guid]),
    plantas
  });
}

/* ------------------------------------------------------------------ */
/* plantas (IfcBuildingStorey)                                         */
/* ------------------------------------------------------------------ */

function leerPlantas(elementos) {
  const nombres = new Map();       // idPlanta → {nombre, cota}
  const deElemento = new Map();    // expressID → idPlanta
  try {
    const ids = api.GetLineIDsWithType(modelo, IFCBUILDINGSTOREY);
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      const l = api.GetLine(modelo, id);
      nombres.set(id, {
        nombre: String(valorPlano(l.Name) || `Planta ${id}`),
        cota: Number(valorPlano(l.Elevation)) || 0
      });
    }

    // Quién agrega a quién, para resolver espacios y elementos anidados.
    const padre = new Map();
    const agregados = api.GetLineIDsWithType(modelo, IFCRELAGGREGATES);
    for (let i = 0; i < agregados.size(); i++) {
      const l = api.GetLine(modelo, agregados.get(i));
      const arriba = valorPlano(l.RelatingObject);
      const hijos = l.RelatedObjects || [];
      for (const h of hijos) padre.set(valorPlano(h), arriba);
    }

    const contenedor = new Map();
    const rels = api.GetLineIDsWithType(modelo, IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < rels.size(); i++) {
      const l = api.GetLine(modelo, rels.get(i));
      const sitio = valorPlano(l.RelatingStructure);
      const hijos = l.RelatedElements || [];
      for (const h of hijos) contenedor.set(valorPlano(h), sitio);
    }

    const resolver = (id) => {
      let actual = contenedor.get(id);
      if (actual === undefined) actual = padre.get(id);
      let saltos = 0;
      while (actual !== undefined && !nombres.has(actual) && saltos++ < 20) {
        actual = contenedor.get(actual) !== undefined
          ? contenedor.get(actual)
          : padre.get(actual);
      }
      return nombres.has(actual) ? actual : undefined;
    };

    for (const id of elementos.keys()) {
      const planta = resolver(id);
      if (planta !== undefined) deElemento.set(id, planta);
    }
  } catch (e) {
    // Un modelo sin estructura espacial sigue siendo utilizable.
  }

  return {
    lista: Array.from(nombres, ([id, p]) => [id, p.nombre, p.cota])
      .sort((a, b) => a[2] - b[2]),
    porElemento: Array.from(deElemento)
  };
}

/* ------------------------------------------------------------------ */
/* propiedades bajo demanda                                            */
/* ------------------------------------------------------------------ */

function comoTexto(v) {
  const x = valorPlano(v);
  if (x === '' || x === null || x === undefined) return '';
  if (typeof x === 'number') {
    return Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000);
  }
  if (typeof x === 'boolean') return x ? 'Sí' : 'No';
  if (Array.isArray(x)) return x.map(comoTexto).filter(Boolean).join(', ');
  if (typeof x === 'object') return '';
  return String(x);
}

async function propiedades(id) {
  if (modelo === -1) return { tipo: 'propiedades', id, grupos: [] };
  const grupos = [];

  try {
    const linea = api.GetLine(modelo, id, true);
    const cabecera = [];
    const meter = (clave, valor) => {
      const t = comoTexto(valor);
      if (t) cabecera.push([clave, t]);
    };
    meter('Tipo', api.GetNameFromTypeCode(linea.type));
    meter('Nombre', linea.Name);
    meter('Descripción', linea.Description);
    meter('Tipo de objeto', linea.ObjectType);
    meter('Etiqueta', linea.Tag);
    meter('GUID', linea.GlobalId);
    cabecera.push(['Nº interno', String(id)]);
    grupos.push({ titulo: 'Elemento', filas: cabecera });
  } catch (e) { /* elemento sin línea legible */ }

  try {
    const tipos = await api.properties.getTypeProperties(modelo, id, false);
    for (const t of tipos) {
      const filas = [];
      const n = comoTexto(t.Name);
      if (n) filas.push(['Nombre del tipo', n]);
      const d = comoTexto(t.Description);
      if (d) filas.push(['Descripción', d]);
      const e = comoTexto(t.ElementType);
      if (e) filas.push(['Clase', e]);
      if (filas.length) {
        grupos.push({ titulo: api.GetNameFromTypeCode(t.type), filas });
      }
    }
  } catch (e) { /* sin tipo asociado */ }

  try {
    // Ojo: getPropertySets con includeTypeProperties=true devuelve SOLO los
    // conjuntos heredados del tipo, no los del propio elemento. Hay que
    // pedir las dos cosas por separado y unirlas.
    const propios = await api.properties.getPropertySets(modelo, id, true, false);
    const heredados = await api.properties.getPropertySets(modelo, id, true, true);
    const vistos = new Set();
    const conjuntos = [];
    for (const c of propios.concat(heredados)) {
      if (c && !vistos.has(c.expressID)) { vistos.add(c.expressID); conjuntos.push(c); }
    }
    for (const c of conjuntos) {
      const filas = [];
      for (const p of c.HasProperties || []) {
        const clave = comoTexto(p.Name);
        let valor = comoTexto(p.NominalValue);
        if (!valor && p.EnumerationValues) valor = comoTexto(p.EnumerationValues);
        if (!valor && p.ListValues) valor = comoTexto(p.ListValues);
        if (clave && valor) filas.push([clave, valor]);
      }
      for (const q of c.Quantities || []) {
        const clave = comoTexto(q.Name);
        const valor = comoTexto(
          q.LengthValue ?? q.AreaValue ?? q.VolumeValue ??
          q.CountValue ?? q.WeightValue ?? q.TimeValue
        );
        if (clave && valor) filas.push([clave, valor]);
      }
      if (filas.length) {
        grupos.push({ titulo: comoTexto(c.Name) || 'Propiedades', filas });
      }
    }
  } catch (e) { /* sin conjuntos de propiedades */ }

  try {
    const propios = await api.properties.getMaterialsProperties(modelo, id, true, false);
    const heredados = await api.properties.getMaterialsProperties(modelo, id, true, true);
    const materiales = propios.concat(heredados);
    const filas = [];
    const anotar = (m) => {
      if (!m) return;
      const n = comoTexto(m.Name);
      if (n) filas.push(['Material', n]);
      for (const capa of m.MaterialLayers || m.ForLayerSet?.MaterialLayers || []) {
        const nombre = comoTexto(capa.Material?.Name);
        const grosor = comoTexto(capa.LayerThickness);
        if (nombre) filas.push([nombre, grosor ? `${grosor} m` : '']);
      }
      for (const sub of m.Materials || []) anotar(sub);
    };
    for (const m of materiales) anotar(m);
    if (filas.length) grupos.push({ titulo: 'Materiales', filas });
  } catch (e) { /* sin materiales */ }

  return { tipo: 'propiedades', id, grupos };
}

/* ------------------------------------------------------------------ */

self.onmessage = async (ev) => {
  const orden = ev.data;
  try {
    if (orden.tipo === 'cargar') {
      await cargar(orden.datos);
    } else if (orden.tipo === 'propiedades') {
      self.postMessage(await propiedades(orden.id));
    } else if (orden.tipo === 'cerrar') {
      if (modelo !== -1) api.CloseModel(modelo);
      modelo = -1;
    }
  } catch (e) {
    self.postMessage({ tipo: 'error', mensaje: String(e && e.message ? e.message : e) });
  }
};
