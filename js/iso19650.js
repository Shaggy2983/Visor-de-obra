/* Código de documento según la nomenclatura de COORDINATE (ISO 19650):
   PROYECTO-CRD-VOLUMEN-NIVEL-TIPO-DISCIPLINA-NÚMERO.
   · PROYECTO: código corto de la obra (se puede fijar en la visita; si no,
     se saca de las iniciales del nombre). Se guarda en este teléfono.
   · CRD: COORDINATE como autor. VOLUMEN y NIVEL: ZZ (todo el proyecto).
   · TIPO: código ISO del documento (RP informe, MI minuta, RI consulta…).
   · DISCIPLINA: ARQ, EST, HDS, SAN, ELE, MEC, PCI, FAC, URB.
   · NÚMERO: el correlativo del registro, a 4 cifras (o fecha y hora). */

const CLAVE = 'crd-codigos-proyecto';
export const DISCIPLINAS = ['ARQ', 'EST', 'HDS', 'SAN', 'ELE', 'MEC', 'PCI', 'FAC', 'URB'];

const llave = (obra) => String(obra || '').trim().toLowerCase();

function tabla() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; }
}

export const limpiarCodigo = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/* Iniciales de las palabras con contenido; con una sola palabra, sus primeras letras. */
export function codigoSugerido(obra) {
  const palabras = String(obra || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ').split(/[^A-Za-z0-9]+/)
    .filter((p) => p && !/^(de|del|la|las|el|los|y|en)$/i.test(p));
  if (!palabras.length) return 'OBRA';
  if (palabras.length === 1) return limpiarCodigo(palabras[0]).slice(0, 4) || 'OBRA';
  return limpiarCodigo(palabras.map((p) => (/^\d+$/.test(p) ? p : p[0])).join('')).slice(0, 6);
}

export function codigoProyecto(obra) {
  return tabla()[llave(obra)] || codigoSugerido(obra);
}

export function codigoGuardado(obra) {
  return tabla()[llave(obra)] || '';
}

export function guardarCodigoProyecto(obra, codigo) {
  if (!llave(obra)) return;
  const t = tabla();
  const c = limpiarCodigo(codigo);
  if (c) t[llave(obra)] = c; else delete t[llave(obra)];
  try { localStorage.setItem(CLAVE, JSON.stringify(t)); } catch { /* sin espacio: se usa la sugerencia */ }
}

/* Tipo ISO de cada documento que emite la app. */
const TIPOS = [
  [/parte|visita|informe de visita/i, 'RP'],
  [/plano/i, 'DR'],
  [/minuta/i, 'MI'],
  [/rfi|solicitud de informaci/i, 'RI'],
  [/orden de cambio/i, 'CO'],
  [/d[ií]as afectados/i, 'SH'],
  [/recepci[oó]n de materiales/i, 'SH'],
  [/repasos|punch/i, 'SH'],
  [/.*/, 'RP']
];
export const tipoISO = (tipoDoc) => TIPOS.find(([re]) => re.test(tipoDoc || ''))[1];

/* Disciplina por plantilla de inspección o tipo de documento. */
const POR_PARTIDA = {
  acero: 'EST', encofrado: 'EST', liberacion: 'EST', vaciado: 'EST',
  sanitaria: 'SAN', electrica: 'ELE'
};
export function disciplinaDe({ disciplina, plantilla, tipoDoc } = {}) {
  const d = String(disciplina || '').toUpperCase();
  if (DISCIPLINAS.includes(d)) return d;
  if (plantilla && POR_PARTIDA[plantilla]) return POR_PARTIDA[plantilla];
  if (/hormig[oó]n/i.test(tipoDoc || '')) return 'EST';
  return 'ARQ';
}

/* Número a 4 cifras: el correlativo («IN-007-…» → 0007) o, en documentos
   sin correlativo («PV-20261119-0745»), mes, día y hora (11190745). */
export function numeroISO(numeroDoc) {
  const s = String(numeroDoc || '');
  const corr = s.match(/^[A-Z]+-(\d{1,5})(?:-|$)/);
  if (corr) return corr[1].padStart(4, '0');
  const digitos = s.replace(/\D/g, '');
  if (digitos.length >= 8) return digitos.slice(4);
  return (digitos || '0').padStart(4, '0');
}

export function codigoISO({ obra, tipoDoc, numeroDoc, disciplina, plantilla }) {
  return [
    codigoProyecto(obra), 'CRD', 'ZZ', 'ZZ',
    tipoISO(tipoDoc), disciplinaDe({ disciplina, plantilla, tipoDoc }), numeroISO(numeroDoc)
  ].join('-');
}
