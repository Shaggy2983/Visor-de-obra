/* Dictado por voz: un botón de micrófono en cada cuadro de texto de la
   visita (trabajos, maquinaria, materiales, observaciones, incidencias,
   notas de plano, repasos…). Lo dicho se escribe en el cuadro y se guarda
   como si se hubiera tecleado.

   Usa el reconocimiento de voz del propio navegador (Chrome en Android),
   sin servicios de pago. Necesita señal; sin señal, el micrófono del
   teclado (Gboard) sigue sirviendo si tiene el español descargado.

   Órdenes de puntuación: «punto y seguido», «punto y aparte»,
   «nueva línea», «coma», «dos puntos», «punto final». */

import { avisar } from './interfaz.js';
import { ahora } from './utiles.js';
import { marcarHora } from './horas.js';

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;

/* Dónde el dictado de la página no es fiable: Samsung Internet y los
   WebView declaran el reconocimiento de voz, pero en algunos teléfonos la
   pestaña se bloquea al usarlo («La pestaña se ha bloqueado»). Ahí el 🎤
   lleva al dictado del teclado (Gboard o Samsung Keyboard). Si la página
   se cae a mitad de un arranque, el teléfono lo recuerda 7 días. */
const UA = navigator.userAgent || '';
const NAVEGADOR_SIN_DICTADO = /SamsungBrowser|; wv\)|Version\/[\d.]+ Chrome\/[\d.]+ Mobile/.test(UA);
const CHROME_DE_VERDAD = /Chrome\/\d+/.test(UA) && !/SamsungBrowser|EdgA|OPR|YaBrowser|; wv\)/.test(UA);
const CLAVE_ARRANQUE = 'crd-dictado-arranque';
const CLAVE_ROTO = 'crd-dictado-roto';
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const poner = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
(() => {
  const arranque = Number(leer(CLAVE_ARRANQUE));
  if (arranque && Date.now() - arranque < 10 * 60 * 1000) poner(CLAVE_ROTO, String(Date.now()));
  poner(CLAVE_ARRANQUE, null);
})();
function dictadoRoto() {
  const t = Number(leer(CLAVE_ROTO));
  if (t && Date.now() - t > 7 * 24 * 3600 * 1000) { poner(CLAVE_ROTO, null); return false; }
  return Boolean(t);
}
const modoTeclado = () => !Reconocedor || NAVEGADOR_SIN_DICTADO || dictadoRoto();

const ORDENES = [
  [/\s*\b(punto y aparte|nueva l[ií]nea|nuevo p[aá]rrafo)\b\s*/gi, '.\n'],
  [/\s*\b(punto y seguido|punto final)\b\s*/gi, '. '],
  [/\s*\bdos puntos\b\s*/gi, ': '],
  [/\s*\bcoma\b\s*/gi, ', '],
  [/\s*\bsigno de interrogaci[oó]n\b\s*/gi, '? ']
];

let activo = null;   // { area, boton, rec }

function idioma() {
  const n = (navigator.language || '').toLowerCase();
  return n.startsWith('es') ? navigator.language : 'es-DO';
}

function limpiar(texto) {
  let t = ` ${texto} `;
  for (const [patron, signo] of ORDENES) t = t.replace(patron, signo);
  return t.replace(/\.\n\./g, '.\n').replace(/\s+([.,:?])/g, '$1').replace(/[ \t]+/g, ' ').trim()
    .replace(/([.?]\s+)(\p{Ll})/gu, (_, signo, letra) => signo + letra.toLocaleUpperCase('es'));
}

/* Pega lo dictado donde está el cursor, con espacio y mayúscula si toca. */
function insertar(area, texto) {
  if (!texto) return;
  // Sin foco (no se abre el teclado mientras se dicta) se escribe al final.
  if (document.activeElement !== area) area.selectionStart = area.selectionEnd = area.value.length;
  if (area.dataset.campo === 'trabajos' && /(^|\n)$/.test(area.value.slice(0, area.selectionStart))) marcarHora(area);
  const ini = area.selectionStart ?? area.value.length;
  const fin = area.selectionEnd ?? area.value.length;
  const antes = area.value.slice(0, ini);
  const despues = area.value.slice(fin);
  // En «Trabajos realizados» cada línea nueva lleva su hora (js/horas.js).
  if (area.dataset.campo === 'trabajos') texto = texto.replace(/\n/g, `\n${ahora()} · `);
  const inicioFrase = antes.trim() === '' || /[.!?\n]\s*$/.test(antes) || /(^|\n)\d{1,2}:\d{2} · $/.test(antes);
  if (inicioFrase) texto = texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
  const hueco = antes && !/[\s\n]$/.test(antes) ? ' ' : '';
  const nuevo = antes + hueco + texto;
  area.value = nuevo + despues;
  area.selectionStart = area.selectionEnd = nuevo.length;
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

function aviso(texto) {
  const nodo = document.getElementById('aviso');
  if (nodo) avisar(nodo, texto, 4500);
}

/* Vista previa de lo que va oyendo, bajo el cuadro. */
function vista(area, texto) {
  const ancla = area.closest('.con-dictado') || area;
  let v = ancla.parentElement?.querySelector(':scope > .dictado-vista');
  if (!texto) { v?.remove(); return; }
  if (!v) { v = document.createElement('div'); v.className = 'dictado-vista'; ancla.after(v); }
  v.textContent = texto;
}

function parar() {
  if (!activo) return;
  const { boton, rec, area, vigia } = activo;
  if (activo.vivo) { const t = activo.vivo.texto; quitarVivo(area, activo); insertar(area, limpiar(t)); }
  activo = null;
  poner(CLAVE_ARRANQUE, null);
  clearTimeout(vigia);
  boton.classList.remove('escuchando', 'oyendo');
  boton.setAttribute('aria-pressed', 'false');
  boton.title = 'Dictar';
  vista(area, '');
  try { rec.abort(); } catch { /* ya parado */ }
}

/* ¿Reconocimiento en el propio teléfono? (Chrome reciente con el idioma
   descargado). Es más rápido y funciona sin señal. */
let local = null;
async function hayLocal() {
  if (local !== null) return local;
  local = false;
  if (!CHROME_DE_VERDAD) return local;
  try {
    if (Reconocedor.available) {
      const r = await Reconocedor.available({ langs: [idioma()], processLocally: true });
      local = r === 'available';
      if (r === 'downloadable' && Reconocedor.install) Reconocedor.install({ langs: [idioma()], processLocally: true }).catch(() => {});
    }
  } catch { local = false; }
  return local;
}

/* Pide el micrófono de forma explícita: en la app instalada (TWA) es lo
   que hace aparecer el aviso de permiso de Android/Chrome. */
let micOk = false;
async function pedirMicrofono() {
  if (micOk || !navigator.mediaDevices?.getUserMedia) return true;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    micOk = true;
    return true;
  } catch (e) {
    aviso(e && e.name === 'NotAllowedError'
      ? 'Sin permiso de micrófono. Actívalo en Ajustes → Apps → Chrome → Permisos → Micrófono, y vuelve a tocar 🎤.'
      : 'No se encuentra el micrófono del teléfono.');
    return false;
  }
}

/* Texto en vivo: lo provisional se escribe ya en el cuadro (sin guardar)
   y se sustituye por la versión final al acabar la frase. */
function ponerVivo(area, estado, texto) {
  const t = limpiar(texto);
  if (!estado.vivo) {
    if (document.activeElement !== area) area.selectionStart = area.selectionEnd = area.value.length;
    if (area.dataset.campo === 'trabajos' && /(^|\n)$/.test(area.value.slice(0, area.selectionStart))) marcarHora(area);
    const ini = area.selectionStart;
    const antes = area.value.slice(0, ini);
    const hueco = antes && !/[\s\n]$/.test(antes) ? ' ' : '';
    estado.vivo = { inicio: ini, largo: 0, hueco, texto: '' };
  }
  const v = estado.vivo;
  const nuevo = v.hueco + t;
  area.value = area.value.slice(0, v.inicio) + nuevo + area.value.slice(v.inicio + v.largo);
  v.largo = nuevo.length;
  v.texto = texto;
  area.selectionStart = area.selectionEnd = v.inicio;
  area.classList.add('dictando');
}

function quitarVivo(area, estado) {
  const v = estado.vivo;
  if (!v) return;
  area.value = area.value.slice(0, v.inicio) + area.value.slice(v.inicio + v.largo);
  area.selectionStart = area.selectionEnd = v.inicio;
  estado.vivo = null;
  area.classList.remove('dictando');
}

/* Android escucha mejor frase a frase: cada vez que termina una frase se
   vuelve a arrancar hasta que se toca de nuevo el botón. */
function escuchar(area, boton) {
  const rec = new Reconocedor();
  rec.lang = idioma();
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  if (activo.local) rec.processLocally = true;   // en el teléfono, sin ir a internet
  const estado = activo;
  estado.rec = rec;
  rec.onaudiostart = () => { boton.classList.add('oyendo'); clearTimeout(estado.vigia); poner(CLAVE_ARRANQUE, null); };
  rec.onresult = (ev) => {
    let provisional = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) { quitarVivo(area, estado); insertar(area, limpiar(r[0].transcript)); }
      else provisional += r[0].transcript;
    }
    if (provisional) ponerVivo(area, estado, provisional);
  };
  rec.onerror = (ev) => {
    if (ev.error === 'no-speech' || ev.error === 'aborted') return;   // se reintenta en onend
    // Si el reconocimiento en el teléfono falla, se sigue con el de Google.
    if (estado.local && ev.error !== 'not-allowed') { local = false; estado.local = false; return; }
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      aviso('Sin permiso de micrófono o de voz de Google. Ajustes → Apps → Chrome → Permisos → Micrófono.');
    } else if (ev.error === 'network') {
      aviso('El dictado necesita señal. Sin señal, usa el micrófono del teclado.');
    } else if (ev.error === 'language-not-supported') {
      aviso('Este teléfono no reconoce el español para dictar.');
    } else if (ev.error === 'audio-capture') {
      aviso('Otra app está usando el micrófono. Ciérrala y vuelve a probar.');
    } else {
      aviso(`No se ha podido dictar (${ev.error}). Prueba otra vez.`);
    }
    estado.fallo = true;
    parar();
  };
  rec.onend = () => {
    // Si la frase acabó sin «final», lo provisional se queda como texto.
    if (estado.vivo) { const t = estado.vivo.texto; quitarVivo(area, estado); insertar(area, limpiar(t)); }
    if (activo !== estado || estado.fallo) return;
    try { escuchar(area, boton); } catch { parar(); }   // siguiente frase
  };
  rec.start();
}

/* Dictado con el teclado: se abre el teclado en el cuadro y se explica. */
function conTeclado(area) {
  area.focus();
  aviso('Para dictar aquí, toca el 🎤 del teclado (Gboard o Samsung Keyboard). Para usar el dictado de la app, abre la app en Chrome.');
}

async function empezar(area, boton) {
  if (modoTeclado()) { conTeclado(area); return; }
  if (activo && activo.area === area) { parar(); return; }
  parar();
  activo = { area, boton, rec: null, vigia: 0, fallo: false };
  boton.classList.add('escuchando');
  boton.setAttribute('aria-pressed', 'true');
  boton.title = 'Parar dictado';
  const estado = activo;
  if (!(await pedirMicrofono()) || activo !== estado) { if (activo === estado) parar(); return; }
  // Si la pestaña se cae entre aquí y el primer sonido, al recargar se sabrá.
  poner(CLAVE_ARRANQUE, String(Date.now()));
  estado.local = await hayLocal();
  // Si en 6 s no llega sonido, algo bloquea el reconocimiento.
  estado.vigia = setTimeout(() => {
    if (activo !== estado || boton.classList.contains('oyendo')) return;
    aviso('No llega sonido al dictado. Revisa el permiso de micrófono y que «Voz de Google» esté instalada y actualizada.');
    parar();
  }, 6000);
  try { escuchar(area, boton); } catch { aviso('Este teléfono no permite el dictado aquí. Usa el micrófono del teclado.'); parar(); }
}

function preparar(area) {
  if (area.dataset.dictado || area.readOnly || area.disabled || area.dataset.sinDictado != null) return;
  area.dataset.dictado = '1';
  const teniaFoco = document.activeElement === area;
  const envoltura = document.createElement('span');
  envoltura.className = 'con-dictado';
  area.replaceWith(envoltura);
  envoltura.append(area);
  if (teniaFoco) area.focus({ preventScroll: true });
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton-dictado';
  boton.title = 'Dictar';
  boton.setAttribute('aria-label', 'Dictar con la voz');
  boton.setAttribute('aria-pressed', 'false');
  boton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';
  // Que el toque no quite el foco al cuadro (en el móvil se cerraría el teclado).
  boton.addEventListener('pointerdown', (ev) => ev.preventDefault());
  boton.addEventListener('click', () => empezar(area, boton));
  envoltura.append(boton);
}

function recorrer(raiz) {
  if (raiz.matches?.('textarea.campo')) preparar(raiz);
  raiz.querySelectorAll?.('textarea.campo').forEach(preparar);
}

// El 🎤 se pone siempre: donde la app no puede dictar, lleva al del teclado.
{
  recorrer(document.body);
  new MutationObserver((cambios) => {
    for (const c of cambios) c.addedNodes.forEach((n) => { if (n.nodeType === 1) recorrer(n); });
  }).observe(document.body, { childList: true, subtree: true });
  // Al cambiar de pantalla o bloquear el teléfono, se deja de escuchar.
  document.addEventListener('visibilitychange', () => { if (document.hidden) parar(); });
}
