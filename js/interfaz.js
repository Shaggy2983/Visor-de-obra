/* Piezas de interfaz: nombres en castellano de las clases IFC, listas con
   casillas de visibilidad, ficha de propiedades y avisos. */

const NOMBRES = {
  IFCWALL: 'Muros',
  IFCWALLSTANDARDCASE: 'Muros',
  IFCWALLELEMENTEDCASE: 'Muros',
  IFCCURTAINWALL: 'Muros cortina',
  IFCSLAB: 'Losas y forjados',
  IFCROOF: 'Cubiertas',
  IFCBEAM: 'Vigas',
  IFCCOLUMN: 'Pilares',
  IFCFOOTING: 'Cimentaciones',
  IFCPILE: 'Pilotes',
  IFCDOOR: 'Puertas',
  IFCWINDOW: 'Ventanas',
  IFCSTAIR: 'Escaleras',
  IFCSTAIRFLIGHT: 'Tramos de escalera',
  IFCRAMP: 'Rampas',
  IFCRAMPFLIGHT: 'Tramos de rampa',
  IFCRAILING: 'Barandillas',
  IFCCOVERING: 'Acabados',
  IFCPLATE: 'Chapas',
  IFCMEMBER: 'Montantes',
  IFCSPACE: 'Espacios',
  IFCSITE: 'Terreno',
  IFCOPENINGELEMENT: 'Huecos',
  IFCANNOTATION: 'Anotaciones',
  IFCFURNITURE: 'Mobiliario',
  IFCFURNISHINGELEMENT: 'Mobiliario',
  IFCBUILDINGELEMENTPROXY: 'Elementos genéricos',
  IFCELEMENTASSEMBLY: 'Conjuntos',
  IFCREINFORCINGBAR: 'Armaduras',
  IFCREINFORCINGMESH: 'Mallazos',
  IFCTRANSPORTELEMENT: 'Ascensores y cintas',
  IFCSHADINGDEVICE: 'Protección solar',
  IFCCHIMNEY: 'Chimeneas',
  IFCSANITARYTERMINAL: 'Aparatos sanitarios',
  IFCLIGHTFIXTURE: 'Luminarias',
  IFCDUCTSEGMENT: 'Conductos',
  IFCDUCTFITTING: 'Accesorios de conducto',
  IFCPIPESEGMENT: 'Tuberías',
  IFCPIPEFITTING: 'Accesorios de tubería',
  IFCCABLECARRIERSEGMENT: 'Bandejas de cable',
  IFCCABLESEGMENT: 'Cableado',
  IFCFLOWSEGMENT: 'Conductos y tuberías',
  IFCFLOWFITTING: 'Accesorios de instalación',
  IFCFLOWTERMINAL: 'Terminales de instalación',
  IFCFLOWCONTROLLER: 'Válvulas y control',
  IFCFLOWMOVINGDEVICE: 'Bombas y ventiladores',
  IFCENERGYCONVERSIONDEVICE: 'Equipos de climatización',
  IFCDISTRIBUTIONELEMENT: 'Instalaciones',
  IFCDISTRIBUTIONCONTROLELEMENT: 'Control de instalaciones',
  IFCBUILDINGELEMENTPART: 'Piezas de elemento',
  IFCMECHANICALFASTENER: 'Fijaciones',
  IFCDISCRETEACCESSORY: 'Accesorios',
  IFCVOIDINGFEATURE: 'Rebajes'
};

/* "IfcWallStandardCase" → "Muros"; si no está en la tabla, "Wallstandardcase".
   web-ifc devuelve los nombres en mayúsculas y minúsculas mezcladas, así que
   la búsqueda se hace siempre en mayúsculas. */
export function nombreDeClase(tipo) {
  const clave = String(tipo || '').toUpperCase();
  if (NOMBRES[clave]) return NOMBRES[clave];
  const limpio = clave.replace(/^IFC/, '').toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/* --------------------------------------------------------------- */

export function fila({ etiqueta, cuenta, marcada, alCambiar }) {
  const div = document.createElement('label');
  div.className = 'fila';

  const casilla = document.createElement('input');
  casilla.type = 'checkbox';
  casilla.checked = marcada;
  casilla.addEventListener('change', () => alCambiar(casilla.checked));

  const texto = document.createElement('span');
  texto.className = 'fila-texto';
  texto.textContent = etiqueta;

  div.append(casilla, texto);

  if (cuenta !== undefined) {
    const n = document.createElement('span');
    n.className = 'fila-cuenta';
    n.textContent = cuenta;
    div.append(n);
  }
  return div;
}

export function filaResultado({ etiqueta, detalle, alTocar }) {
  const div = document.createElement('div');
  div.className = 'fila resultado';
  div.tabIndex = 0;

  const texto = document.createElement('span');
  texto.className = 'fila-texto';
  texto.textContent = etiqueta;

  const sub = document.createElement('span');
  sub.className = 'fila-cuenta';
  sub.textContent = detalle;

  div.append(texto, sub);
  div.addEventListener('click', alTocar);
  return div;
}

export function pintarPropiedades(contenedor, grupos) {
  contenedor.textContent = '';
  if (!grupos || !grupos.length) {
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = 'Este elemento no trae datos asociados.';
    contenedor.append(p);
    return;
  }
  for (const grupo of grupos) {
    const h = document.createElement('h3');
    h.textContent = grupo.titulo;
    const dl = document.createElement('dl');
    for (const [clave, valor] of grupo.filas) {
      const dt = document.createElement('dt');
      dt.textContent = clave;
      const dd = document.createElement('dd');
      dd.textContent = valor;
      dl.append(dt, dd);
    }
    contenedor.append(h, dl);
  }
}

/* Resumen corto para la tarjeta que se ve dentro de la realidad aumentada. */
export function resumenAR(grupos) {
  const trozos = [];
  const elemento = grupos.find((g) => g.titulo === 'Elemento');
  if (elemento) {
    for (const [clave, valor] of elemento.filas) {
      if (['Tipo', 'Nombre', 'Tipo de objeto', 'Etiqueta'].includes(clave)) {
        trozos.push(`<strong>${escapar(clave)}</strong> ${escapar(valor)}`);
      }
    }
  }
  for (const grupo of grupos) {
    if (grupo.titulo === 'Elemento') continue;
    for (const [clave, valor] of grupo.filas.slice(0, 4)) {
      trozos.push(`<strong>${escapar(clave)}</strong> ${escapar(valor)}`);
    }
    if (trozos.length > 10) break;
  }
  return trozos.slice(0, 10).join('<br>') || 'Sin datos asociados.';
}

function escapar(t) {
  return String(t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

let temporizadorAviso = 0;
export function avisar(nodo, texto, milisegundos = 2600) {
  nodo.textContent = texto;
  nodo.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { nodo.hidden = true; }, milisegundos);
}
