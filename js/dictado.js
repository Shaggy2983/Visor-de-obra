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

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;

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
  const ini = area.selectionStart ?? area.value.length;
  const fin = area.selectionEnd ?? area.value.length;
  const antes = area.value.slice(0, ini);
  const despues = area.value.slice(fin);
  const inicioFrase = antes.trim() === '' || /[.!?\n]\s*$/.test(antes);
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

function parar() {
  if (!activo) return;
  const { boton, rec } = activo;
  activo = null;
  boton.classList.remove('escuchando');
  boton.setAttribute('aria-pressed', 'false');
  boton.title = 'Dictar';
  try { rec.stop(); } catch { /* ya parado */ }
}

function empezar(area, boton) {
  if (activo && activo.area === area) { parar(); return; }
  parar();
  const rec = new Reconocedor();
  rec.lang = idioma();
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) insertar(area, limpiar(ev.results[i][0].transcript));
    }
  };
  rec.onerror = (ev) => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      aviso('Permite el micrófono para dictar (Ajustes de la app → Permisos).');
    } else if (ev.error === 'network') {
      aviso('El dictado necesita señal. Sin señal, usa el micrófono del teclado.');
    } else if (ev.error === 'language-not-supported') {
      aviso('Este teléfono no reconoce el español para dictar.');
    } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
      aviso('No se ha podido dictar. Prueba otra vez.');
    }
    parar();
  };
  rec.onend = () => { if (activo && activo.rec === rec) parar(); };
  activo = { area, boton, rec };
  boton.classList.add('escuchando');
  boton.setAttribute('aria-pressed', 'true');
  boton.title = 'Parar dictado';
  try {
    rec.start();
    area.focus({ preventScroll: true });
  } catch {
    parar();
  }
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

if (Reconocedor) {
  recorrer(document.body);
  new MutationObserver((cambios) => {
    for (const c of cambios) c.addedNodes.forEach((n) => { if (n.nodeType === 1) recorrer(n); });
  }).observe(document.body, { childList: true, subtree: true });
  // Al cambiar de pantalla o bloquear el teléfono, se deja de escuchar.
  document.addEventListener('visibilitychange', () => { if (document.hidden) parar(); });
}
