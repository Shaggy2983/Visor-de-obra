/* Texto predictivo y corrector.

   1. Corrector: activa la revisión ortográfica del teclado en todos los
      campos de texto. El teclado del teléfono (Gboard) subraya y corrige en
      español e inglés si tiene los dos idiomas activados.
   2. Predictivo: aprende de las visitas y repasos guardados en el teléfono.
      - Empresa, oficio, obra, autor, zona y responsable: lista desplegable
        con lo ya escrito antes.
      - Cuadros de texto: al empezar a escribir una línea, propone hasta
        tres frases ya usadas que empiezan igual; al tocar una, se completa.
   Todo funciona sin señal: no sale nada del teléfono. */

import { listarVisitas, listarRepasos } from './partes.js';

const MIN_LETRAS = 2;
const MAX_SUGERENCIAS = 3;
const VIGENCIA = 60 * 1000;

let corpus = null;      // { campo: Map(normalizado → { texto, veces, ultima }) }
let listas = null;      // { empresa: [...], oficio: [...], ... }
let leido = 0;
let leyendo = null;

const quitarTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t) => quitarTildes(String(t || '').toLowerCase()).replace(/\s+/g, ' ').trim();

function trozos(texto) {
  return String(texto || '')
    .split(/\n|(?<=[.;])\s+/)
    .map((t) => t.trim().replace(/[.;]+$/, ''))
    .filter((t) => t.length >= 3 && t.length <= 160);
}

function anotar(mapa, texto, cuando) {
  const k = norm(texto);
  if (!k) return;
  const e = mapa.get(k);
  if (e) { e.veces++; if (cuando > e.ultima) { e.ultima = cuando; e.texto = texto; } }
  else mapa.set(k, { texto, veces: 1, ultima: cuando });
}

function ordenados(mapa) {
  return [...mapa.values()].sort((a, b) => b.veces - a.veces || b.ultima - a.ultima);
}

async function leer() {
  const [visitas, repasos] = await Promise.all([listarVisitas(), listarRepasos().catch(() => [])]);
  const c = {};
  const campo = (k) => (c[k] ||= new Map());
  const l = { empresa: new Map(), oficio: new Map(), obra: new Map(), autor: new Map(), zona: new Map(), responsable: new Map() };
  for (const v of visitas) {
    const t = v.modificada || v.creada || 0;
    for (const k of ['trabajos', 'maquinaria', 'materiales', 'observaciones']) {
      for (const f of trozos(v[k])) { anotar(campo(k), f, t); anotar(campo('general'), f, t); }
    }
    for (const i of v.incidencias || []) for (const f of trozos(i.texto)) { anotar(campo('incidencias'), f, t); anotar(campo('general'), f, t); }
    for (const n of v.notas || []) for (const f of trozos(n.texto)) { anotar(campo('notas'), f, t); anotar(campo('general'), f, t); }
    for (const p of v.personal || []) { if (p.empresa) anotar(l.empresa, p.empresa.trim(), t); if (p.oficio) anotar(l.oficio, p.oficio.trim(), t); }
    if (v.obra) anotar(l.obra, v.obra.trim(), t);
    if (v.autor) anotar(l.autor, v.autor.trim(), t);
  }
  for (const r of repasos) {
    const t = r.modificado || r.creado || 0;
    for (const f of trozos(r.texto)) { anotar(campo('repasos'), f, t); anotar(campo('general'), f, t); }
    if (r.zona) anotar(l.zona, r.zona.trim(), t);
    if (r.responsable) { anotar(l.responsable, r.responsable.trim(), t); anotar(l.empresa, r.responsable.trim(), t); }
  }
  corpus = c;
  listas = Object.fromEntries(Object.entries(l).map(([k, m]) => [k, ordenados(m).slice(0, 60).map((e) => e.texto)]));
  leido = Date.now();
  pintarListas();
}

function actualizar() {
  if (leyendo || Date.now() - leido < VIGENCIA) return leyendo;
  leyendo = leer().catch(() => {}).finally(() => { leyendo = null; });
  return leyendo;
}

/* ---------- listas desplegables ---------- */

function pintarListas() {
  for (const [clave, valores] of Object.entries(listas || {})) {
    const id = `sug-${clave}`;
    let dl = document.getElementById(id);
    if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.append(dl); }
    dl.replaceChildren(...valores.map((v) => Object.assign(document.createElement('option'), { value: v })));
  }
}

const LISTA_POR_PLACEHOLDER = { Empresa: 'empresa', Oficio: 'oficio' };
const LISTA_POR_CAMPO = { obra: 'obra', autor: 'autor' };

function listaDe(input) {
  if (input.getAttribute('list')) return null;   // ya tiene la suya
  const ph = (input.placeholder || '').trim();
  if (LISTA_POR_PLACEHOLDER[ph]) return LISTA_POR_PLACEHOLDER[ph];
  if (LISTA_POR_CAMPO[input.dataset.campo]) return LISTA_POR_CAMPO[input.dataset.campo];
  if (/^Planta, apto/.test(ph)) return 'zona';
  return null;
}

/* ---------- sugerencias en los cuadros de texto ---------- */

let caja = null;
let areaActiva = null;

function campoDe(area) {
  if (area.dataset.campo) return area.dataset.campo;
  if (area.closest('.incidencia')) return 'incidencias';
  if (area.closest('.repaso, .repasos, .tarjeta-repaso')) return 'repasos';
  if (area.closest('.hoja-nota, .nota, .plano')) return 'notas';
  return 'general';
}

/* Lo que se está escribiendo: desde el último salto de línea o punto. */
function fragmento(area) {
  const hasta = area.selectionStart ?? area.value.length;
  const antes = area.value.slice(0, hasta);
  let corte = antes.lastIndexOf('\n');
  const punto = antes.match(/[.;]\s+(?=[^.;\n]*$)/);
  if (punto) corte = Math.max(corte, punto.index + 1);
  const texto = antes.slice(corte + 1).replace(/^\s+/, '');
  return { inicio: hasta - texto.length, hasta, texto };
}

function candidatos(area) {
  if (!corpus) return [];
  const { texto } = fragmento(area);
  const f = norm(texto);
  if (f.length < MIN_LETRAS) return [];
  const yaEscrito = norm(area.value);
  const vistos = new Set();
  const salida = [];
  const buscar = (mapa, prueba) => {
    for (const e of ordenados(mapa)) {
      const k = norm(e.texto);
      if (k === f || vistos.has(k) || !prueba(k) || yaEscrito.includes(k)) continue;
      vistos.add(k);
      salida.push(e.texto);
      if (salida.length >= MAX_SUGERENCIAS) return;
    }
  };
  const propio = corpus[campoDe(area)];
  if (propio) buscar(propio, (k) => k.startsWith(f));
  if (salida.length < MAX_SUGERENCIAS && corpus.general) buscar(corpus.general, (k) => k.startsWith(f));
  if (salida.length < MAX_SUGERENCIAS && f.length >= 4 && corpus.general) buscar(corpus.general, (k) => k.includes(` ${f}`));
  return salida;
}

function cerrar() {
  if (caja) caja.hidden = true;
}

function completar(area, texto) {
  const { inicio, hasta } = fragmento(area);
  const despues = area.value.slice(hasta);
  area.value = area.value.slice(0, inicio) + texto + despues;
  const pos = inicio + texto.length;
  area.selectionStart = area.selectionEnd = pos;
  area.dispatchEvent(new Event('input', { bubbles: true }));
  area.focus({ preventScroll: true });
  cerrar();
}

function mostrar(area) {
  const lista = candidatos(area);
  if (!lista.length) { cerrar(); return; }
  if (!caja) {
    caja = document.createElement('div');
    caja.className = 'sugerencias';
    caja.setAttribute('role', 'listbox');
    caja.setAttribute('aria-label', 'Sugerencias');
  }
  const ancla = area.closest('.con-dictado') || area;
  if (ancla.nextElementSibling !== caja) ancla.after(caja);
  caja.replaceChildren(...lista.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sugerencia';
    b.setAttribute('role', 'option');
    b.textContent = t;
    b.addEventListener('pointerdown', (ev) => ev.preventDefault());
    b.addEventListener('click', () => completar(area, t));
    return b;
  }));
  caja.hidden = false;
}

/* ---------- preparar campos ---------- */

function preparar(nodo) {
  if (nodo.dataset.predictivo) return;
  const esTexto = nodo.tagName === 'TEXTAREA' || (nodo.tagName === 'INPUT' && (!nodo.type || nodo.type === 'text' || nodo.type === 'search'));
  if (!esTexto || !nodo.classList.contains('campo')) return;
  if (nodo.getAttribute('spellcheck') === 'false' || nodo.getAttribute('autocapitalize') === 'off') return;   // correos, URLs, claves
  nodo.dataset.predictivo = '1';
  nodo.spellcheck = true;
  nodo.setAttribute('autocorrect', 'on');
  if (nodo.tagName === 'TEXTAREA') nodo.setAttribute('autocapitalize', 'sentences');
  else if (!nodo.getAttribute('autocapitalize')) nodo.setAttribute('autocapitalize', 'words');
  const lista = nodo.tagName === 'INPUT' && listaDe(nodo);
  if (lista) { nodo.setAttribute('list', `sug-${lista}`); nodo.setAttribute('autocomplete', 'off'); }
}

function recorrer(raiz) {
  if (raiz.matches?.('.campo')) preparar(raiz);
  raiz.querySelectorAll?.('textarea.campo, input.campo').forEach(preparar);
}

recorrer(document.body);
new MutationObserver((cambios) => {
  for (const c of cambios) c.addedNodes.forEach((n) => { if (n.nodeType === 1) recorrer(n); });
}).observe(document.body, { childList: true, subtree: true });

document.addEventListener('focusin', (ev) => {
  const t = ev.target;
  if (t.matches?.('.campo')) actualizar();
  if (t.matches?.('textarea.campo')) { areaActiva = t; }
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.matches?.('textarea.campo') && ev.isTrusted) { areaActiva = t; mostrar(t); }
});
document.addEventListener('focusout', (ev) => {
  if (ev.target === areaActiva) setTimeout(() => { if (document.activeElement !== areaActiva) cerrar(); }, 150);
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrar(); });

actualizar();
