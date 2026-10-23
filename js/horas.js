/* Línea de tiempo en «Trabajos realizados»: cada línea nueva empieza con la
   hora del teléfono («08:15 · …»), para ir completando la visita durante
   el día y que las horas salgan en todos los informes.

   La hora se pone cuando el cursor queda en una línea vacía (al entrar en el
   cuadro vacío o al tocar Intro), nunca mientras el teclado está componiendo
   una palabra. Al salir del cuadro se quitan las horas que quedaron sin
   texto. */

import { ahora } from './utiles.js';

export const PREFIJO = /^(\d{1,2}:\d{2}) · /;
const SOLO_HORA = /^\d{1,2}:\d{2} · ?$/;
const CAMPOS = 'textarea[data-campo="trabajos"]';

function lineaDelCursor(area) {
  const pos = area.selectionStart ?? area.value.length;
  const inicio = area.value.lastIndexOf('\n', pos - 1) + 1;
  let fin = area.value.indexOf('\n', pos);
  if (fin < 0) fin = area.value.length;
  return { inicio, fin, texto: area.value.slice(inicio, fin), pos };
}

/* Pone la hora si el cursor está en una línea vacía. Devuelve true si la puso. */
export function marcarHora(area) {
  if (!area.matches?.(CAMPOS) || area.readOnly) return false;
  const { inicio, texto } = lineaDelCursor(area);
  if (texto.trim() !== '') return false;
  const marca = `${ahora()} · `;
  area.value = area.value.slice(0, inicio) + marca + area.value.slice(inicio + texto.length);
  area.selectionStart = area.selectionEnd = inicio + marca.length;
  return true;
}

function limpiar(area) {
  // Si se pegó un texto que ya traía su hora, se queda la del texto.
  const lineas = area.value.split('\n').map((l) => l.replace(/^\d{1,2}:\d{2} · (\d{1,2}:\d{2} · )/, '$1'));
  const quedan = lineas.filter((l) => !SOLO_HORA.test(l.trim()));
  // Si al final queda una línea vacía tras una con texto, también fuera.
  while (quedan.length && quedan[quedan.length - 1].trim() === '' && quedan.length > 1) quedan.pop();
  const nuevo = quedan.join('\n');
  if (nuevo !== area.value) {
    area.value = nuevo;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

document.addEventListener('focusin', (ev) => {
  const a = ev.target;
  if (!a.matches?.(CAMPOS)) return;
  // Al tocar un cuadro vacío, el cursor queda al final: hora para la primera línea.
  setTimeout(() => {
    if (document.activeElement === a && marcarHora(a)) a.dispatchEvent(new Event('input', { bubbles: true }));
  }, 0);
});

document.addEventListener('input', (ev) => {
  const a = ev.target;
  if (!a.matches?.(CAMPOS) || ev.isComposing || !ev.isTrusted) return;
  if (ev.inputType === 'insertLineBreak' || ev.inputType === 'insertParagraph' ||
      (ev.inputType === 'insertText' && ev.data == null)) {
    if (marcarHora(a)) a.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

// Teclados que no informan del Intro como inputType: se detecta por la tecla.
document.addEventListener('keyup', (ev) => {
  const a = ev.target;
  if (!a.matches?.(CAMPOS) || ev.key !== 'Enter') return;
  if (marcarHora(a)) a.dispatchEvent(new Event('input', { bubbles: true }));
});

document.addEventListener('focusout', (ev) => {
  if (ev.target.matches?.(CAMPOS)) limpiar(ev.target);
});
