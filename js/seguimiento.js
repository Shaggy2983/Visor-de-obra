/* Seguimiento de obra (seguimiento.html): avance por partida con curva S,
   minutas de reunión con acuerdos y días afectados.

   Rutas: #/avance · #/minutas · #/minuta/ID · #/dias
   Todo se guarda en el teléfono según se escribe (partes.js) y, en una
   obra compartida, se sincroniza con el equipo. Cálculos en
   js/seguimiento-datos.js. */

import {
  listarProgramas, leerPrograma, guardarPrograma,
  listarMinutas, leerMinuta, guardarMinuta, borrarMinuta,
  listarVisitas, listarRepasos, listarInspecciones, listarVaciados
} from './partes.js';
import { avisar as avisarEn } from './interfaz.js';
import { el, nuevoId, hoy, ahora, fechaLarga, plural, mismaObra } from './utiles.js';
import {
  CAUSAS, diasAfectados, totalesPorCausa,
  idPrograma, nuevoPrograma, pesoTotal, programadoPartida, realPartida, curva, anotarAvance, indicadores, sumarDias, diasEntre,
  nuevaMinuta, nuevoAcuerdo, numeroDe, codigo, vencido, acuerdosAbiertos, resumenSeguimiento
} from './seguimiento-datos.js';
import { documento, dato, cifra, cabecera, pie, cajaFirma, imprimir } from './impreso.js';
import { seccionFirmas, firmasAsistentes, celdaFirmaAsistente, urlFirma } from './firmas.js';

const papelesMinuta = (m) => [{ papel: 'convoca', titulo: 'Convoca', nombre: () => m.convoca }, { papel: 'contratista', titulo: 'Por la contratista' }];
import { equipo } from './equipo.js';

const $ = (id) => document.getElementById(id);
const CLAVE_OBRA = 'crd-obra-seguimiento';
const nodos = {
  lista: $('vista-lista'), ficha: $('vista-ficha'), form: $('ficha'), contenido: $('contenido'),
  filtro: $('filtro-obras'), accion: $('btn-accion'), estado: $('estado-guardado'),
  aviso: $('aviso'), dialogo: $('dialogo'), informe: $('informe'), obras: $('obras-conocidas')
};
const avisar = (t, ms) => avisarEn(nodos.aviso, t, ms);

let seccion = 'avance';
let obraSel = leerObra();
let actual = null;            // minuta abierta
let programa = null;          // programa de la obra en pantalla
let datosDias = [];           // días afectados en pantalla (para el PDF)
const sucios = new Map();     // registro → función de guardado
let temporizador = null;

function leerObra() { try { return localStorage.getItem(CLAVE_OBRA) || ''; } catch (e) { return ''; } }
function ponerObra(o) { obraSel = o; try { localStorage.setItem(CLAVE_OBRA, o); } catch (e) { /* nada */ } }

const fmt = (n, d = 0) => (n == null || !Number.isFinite(n) ? '—' : Number(n).toLocaleString('es-DO', { maximumFractionDigits: d, minimumFractionDigits: d }));
const fechaCorta = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};
const autorActual = () => (equipo.usuario && (equipo.usuario.displayName || equipo.usuario.email)) || '';

/* ------------------------------------------------------------------ */
/* guardado                                                            */
/* ------------------------------------------------------------------ */

function cambiado(registro, guardar) {
  registro.modificado = Date.now();
  sucios.set(registro, guardar);
  nodos.estado.textContent = 'Guardando…';
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarYa, 500);
}
const cambioPrograma = () => programa && cambiado(programa, guardarPrograma);
const cambioMinuta = () => actual && cambiado(actual, guardarMinuta);

async function guardarYa() {
  clearTimeout(temporizador);
  const lote = [...sucios.entries()];
  sucios.clear();
  for (const [r, guardar] of lote) {
    try {
      await guardar(r);
    } catch (e) {
      sucios.set(r, guardar);
      avisar('No se ha podido guardar. ¿Queda espacio en el teléfono?', 5000);
    }
  }
  if (lote.length) nodos.estado.textContent = `Guardado ${ahora()}`;
}

/* ------------------------------------------------------------------ */
/* rutas y lista                                                       */
/* ------------------------------------------------------------------ */

async function enrutar() {
  await guardarYa();
  const m = location.hash.match(/^#\/minuta\/([^/]+)$/);
  if (m) {
    const r = await leerMinuta(decodeURIComponent(m[1]));
    if (r) return abrirMinuta(r);
  }
  const s = (location.hash.match(/^#\/(avance|minutas|dias)$/) || [])[1];
  if (!s) history.replaceState(null, '', `#/${seccion}`);
  seccion = s || seccion;
  if (!sucios.size) programa = null;   // ya guardado: al volver se relee
  return mostrar();
}

async function obrasConocidas() {
  const nombres = new Map();
  const poner = (n) => { const t = (n || '').trim(); if (t && !nombres.has(t.toLowerCase())) nombres.set(t.toLowerCase(), t); };
  const listas = await Promise.all([listarProgramas(), listarMinutas(), listarVisitas(), listarRepasos(), listarInspecciones(), listarVaciados()]);
  for (const l of listas) for (const r of l) poner(r.obra);
  for (const o of equipo.obras || []) poner(o.nombre);
  return [...nombres.values()];
}

async function mostrar() {
  actual = null;
  nodos.ficha.hidden = true;
  nodos.lista.hidden = false;
  const titulos = { avance: 'Avance', minutas: 'Minutas', dias: 'Días afectados' };
  document.querySelector('.titulo-seccion').textContent = titulos[seccion];
  for (const s of ['avance', 'minutas', 'dias']) {
    const p = $(`pestana-${s}`);
    p.classList.toggle('activa', s === seccion);
    p.setAttribute('aria-selected', s === seccion ? 'true' : 'false');
  }
  resumenSeguimiento().catch(() => {});
  const obras = await obrasConocidas();
  nodos.obras.replaceChildren(...obras.map((o) => el('option', { value: o })));
  const conTodas = seccion !== 'avance';
  // Una obra recién escrita (aún sin nada guardado) también vale para el avance.
  if (!conTodas && obraSel && !obras.some((o) => mismaObra(o, obraSel))) obras.push(obraSel);
  if (!conTodas && !obraSel) obraSel = obras[0] || '';
  if (conTodas && obraSel && !obras.some((o) => mismaObra(o, obraSel))) obraSel = '';
  nodos.filtro.hidden = obras.length < (conTodas ? 2 : 1);
  nodos.filtro.replaceChildren(...[...(conTodas ? [''] : []), ...obras].map((o) => el('button', {
    type: 'button', class: `chip${mismaObra(o, obraSel) ? ' activo' : ''}`,
    onclick: () => { ponerObra(o); mostrar(); }
  }, o || 'Todas')));

  nodos.accion.hidden = seccion === 'dias' || (seccion === 'avance' && !programa && !obraSel);
  nodos.accion.textContent = seccion === 'minutas' ? '+ Minuta' : seccion === 'avance' ? 'Informe PDF' : '';
  if (seccion === 'avance') return pintarAvance(obras);
  if (seccion === 'minutas') return pintarMinutas();
  return pintarDias();
}

nodos.accion.addEventListener('click', () => {
  if (seccion === 'minutas') return nuevaMinutaDialogo();
  if (seccion === 'avance' && programa) return informeAvance(programa);
  if (seccion === 'dias' && datosDias.length) return diasPdf(datosDias, obraSel);
  return null;
});

/* ------------------------------------------------------------------ */
/* avance y curva S                                                    */
/* ------------------------------------------------------------------ */

async function pintarAvance(obras) {
  const y = scrollY;
  // Se relee de la base sólo al cambiar de obra (o al llegar cambios del
  // equipo): lo que hay en pantalla puede tener cambios aún sin guardar.
  if (!obraSel) programa = null;
  else if (!programa || programa.id !== idPrograma(obraSel)) programa = await leerPrograma(idPrograma(obraSel));
  nodos.accion.hidden = !programa;
  if (!obraSel) {
    nodos.contenido.replaceChildren(el('p', { class: 'vacio' }, obras.length
      ? 'Elige una obra.'
      : 'Todavía no hay obras. Empieza una visita, una inspección o una minuta con el nombre de la obra y aparecerá aquí.'),
    crearObraNueva());
    return;
  }
  if (!programa) return nodos.contenido.replaceChildren(crearPrograma(obraSel));
  const ind = indicadores(programa);
  const desvClase = ind.desviacion <= -10 ? 'mal' : ind.desviacion < -3 ? 'regular' : 'bien';
  const total = pesoTotal(programa);
  const plazo = diasEntre(programa.inicio, programa.fin) || 1;
  const transcurrido = Math.max(0, Math.min(1, diasEntre(programa.inicio, hoy()) / plazo));
  nodos.contenido.replaceChildren(
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, programa.obra), el('span', { class: 'pie' }, `${fechaCorta(programa.inicio)} → ${fechaCorta(programa.fin)} · ${Math.round(transcurrido * 100)} % del plazo`)),
      el('div', { class: 'indicadores' },
        indicador(`${fmt(ind.programado)} %`, 'Programado hoy'),
        indicador(`${fmt(ind.real)} %`, 'Avance real'),
        indicador(`${ind.desviacion >= 0 ? '+' : ''}${fmt(ind.desviacion)} pts`, ind.desviacion >= 0 ? 'Adelantada' : 'Atrasada', desvClase),
        indicador(ind.spi == null ? '—' : fmt(ind.spi, 2), 'Índice de cumplimiento', ind.spi == null ? '' : ind.spi < 0.9 ? 'mal' : ind.spi < 0.97 ? 'regular' : 'bien'))),
    el('section', { class: 'grupo' },
      el('h2', {}, 'Curva S'),
      graficoCurva(curva(programa))),
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Avance de hoy por partida'), el('span', { class: 'pie' }, fechaCorta(hoy()))),
      el('p', { class: 'pie' }, 'Mueve la barra al % ejecutado acumulado de cada partida. Se guarda con la fecha de hoy.'),
      el('div', { class: 'partidas' }, ...programa.partidas.map(filaPartida)),
      total !== 100 ? el('p', { class: 'pie aviso-texto' }, `Los pesos suman ${fmt(total, 1)} %: el avance se calcula en proporción, pero conviene que sumen 100.`) : null),
    editorPrograma(programa));
  scrollTo(0, y);
}

function indicador(valor, texto, clase = '') {
  return el('div', { class: `indicador ${clase}` }, el('strong', {}, valor), el('span', {}, texto));
}

function crearObraNueva() {
  const entrada = el('input', { class: 'campo', 'data-campo': 'obra', placeholder: 'Nombre de la obra', list: 'obras-conocidas' });
  return el('section', { class: 'grupo' }, el('h2', {}, 'Programa de una obra nueva'),
    el('label', {}, 'Obra', entrada),
    el('div', { class: 'fila-botones' }, el('button', {
      type: 'button', class: 'boton boton-destacado', onclick: () => {
        const o = entrada.value.trim();
        if (!o) return entrada.focus();
        ponerObra(o);
        return mostrar();
      }
    }, 'Seguir')));
}

function crearPrograma(obra) {
  const inicio = el('input', { class: 'campo', type: 'date', value: hoy() });
  const fin = el('input', { class: 'campo', type: 'date', value: sumarDias(hoy(), 180) });
  const crear = async (tipicas) => {
    if (!inicio.value || !fin.value || fin.value <= inicio.value) return avisar('La fecha de fin tiene que ser posterior a la de inicio.', 3500);
    const p = nuevoPrograma({ obra, inicio: inicio.value, fin: fin.value, tipicas });
    await guardarPrograma(p);
    mostrar();
  };
  return el('section', { class: 'grupo' },
    el('h2', {}, `Programa de ${obra}`),
    el('p', { class: 'pie' }, 'Con el programa por partidas (peso y fechas de cada una) la app dibuja la curva S programada y la compara con el avance que anotes en obra.'),
    el('div', { class: 'dos' }, el('label', {}, 'Inicio de obra', inicio), el('label', {}, 'Fin previsto', fin)),
    el('div', { class: 'fila-botones' },
      el('button', { type: 'button', class: 'boton boton-destacado', onclick: () => crear(true) }, 'Crear con partidas típicas de edificación'),
      el('button', { type: 'button', class: 'boton', onclick: () => crear(false) }, 'Empezar vacío')),
    el('p', { class: 'pie' }, 'Las partidas típicas traen pesos y fechas de referencia repartidos en el plazo: cámbialos por los de tu presupuesto y cronograma.'));
}

function filaPartida(x) {
  const prog = programadoPartida(x, hoy());
  const re = realPartida(x, hoy());
  const ultimo = (x.avances || []).at(-1);
  const valor = el('output', { class: 'partida-valor' }, `${re} %`);
  // Una sola barra: el deslizador se rellena hasta el avance real y la raya
  // naranja encima marca lo programado para hoy.
  const rango = el('input', { type: 'range', min: 0, max: 100, step: 5, value: re, 'aria-label': `Avance de ${x.nombre}`, style: `--v:${re}%` });
  rango.addEventListener('input', () => {
    valor.textContent = `${rango.value} %`;
    rango.style.setProperty('--v', `${rango.value}%`);
  });
  rango.addEventListener('change', () => {
    anotarAvance(x, rango.value, hoy(), autorActual());
    cambioPrograma();
    pintarAvance([]);
  });
  const barra = el('div', { class: 'partida-deslizador' }, rango,
    el('span', { class: 'partida-prog', style: `--p:${prog}`, title: `Programado hoy: ${Math.round(prog)} %`, 'aria-hidden': 'true' }));
  const atraso = re < prog - 10;
  return el('div', { class: `partida${atraso ? ' atrasada' : ''}` },
    el('div', { class: 'partida-cab' },
      el('strong', {}, x.nombre || 'Partida sin nombre'),
      valor),
    barra,
    el('p', { class: 'pie' }, [
      `peso ${fmt(Number(x.peso) || 0, 1)} %`,
      `programado hoy ${fmt(prog)} %`,
      ultimo ? `anotado ${fechaCorta(ultimo.fecha)}` : 'sin anotar',
      atraso && 'atrasada'
    ].filter(Boolean).join(' · ')));
}

function editorPrograma(p) {
  const campoFecha = (obj, clave) => {
    const c = el('input', { class: 'campo', type: 'date', value: obj[clave] || '' });
    c.addEventListener('change', () => { obj[clave] = c.value; cambioPrograma(); pintarAvance([]); });
    return c;
  };
  const filas = p.partidas.map((x, i) => {
    const nombre = el('input', { class: 'campo', value: x.nombre, placeholder: 'Partida' });
    nombre.addEventListener('input', () => { x.nombre = nombre.value; cambioPrograma(); });
    nombre.addEventListener('change', () => pintarAvance([]));
    const peso = el('input', { class: 'campo', value: x.peso, inputmode: 'decimal', 'aria-label': 'Peso %' });
    peso.addEventListener('input', () => { x.peso = parseFloat(peso.value.replace(',', '.')) || 0; cambioPrograma(); });
    peso.addEventListener('change', () => pintarAvance([]));
    return el('div', { class: 'fila-programa' },
      el('span', { class: 'camion-n' }, String(i + 1)),
      nombre,
      el('label', {}, 'Peso %', peso),
      el('label', {}, 'Inicio', campoFecha(x, 'inicio')),
      el('label', {}, 'Fin', campoFecha(x, 'fin')),
      el('button', {
        type: 'button', class: 'boton quitar', 'aria-label': 'Quitar partida',
        onclick: () => { if (!confirm(`¿Quitar «${x.nombre}» y su avance anotado?`)) return; p.partidas = p.partidas.filter((z) => z !== x); p.borradas = [...new Set([...(p.borradas || []), x.id])]; cambioPrograma(); pintarAvance([]); }
      }, '✕'));
  });
  const abierto = sessionStorage.getItem('crd-editar-programa') === '1';
  const caja = el('details', { class: 'grupo editor-programa', open: abierto },
    el('summary', {}, 'Editar programa: partidas, pesos y fechas'),
    el('div', { class: 'dos' }, el('label', {}, 'Inicio de obra', campoFecha(p, 'inicio')), el('label', {}, 'Fin previsto', campoFecha(p, 'fin'))),
    el('div', { class: 'filas-programa' }, ...filas),
    el('p', { class: 'pie' }, `Total de pesos: ${fmt(pesoTotal(p), 1)} %`),
    el('div', { class: 'fila-botones' },
      el('button', {
        type: 'button', class: 'boton', onclick: () => {
          const ultima = p.partidas.at(-1);
          p.partidas.push({ id: nuevoId(), nombre: '', peso: 0, inicio: ultima ? ultima.inicio : p.inicio, fin: ultima ? ultima.fin : p.fin, avances: [] });
          cambioPrograma(); pintarAvance([]);
        }
      }, '+ Partida')));
  caja.addEventListener('toggle', () => { try { sessionStorage.setItem('crd-editar-programa', caja.open ? '1' : '0'); } catch (e) { /* nada */ } });
  return caja;
}

/* Curva S: programado (naranja, discontinua) y real (azul, continua),
   con la línea de hoy, etiquetas directas al final, una línea que sigue
   al dedo con el valor de las dos series y la tabla para leerla sin
   gráfico. Colores validados para daltonismo (tokens --serie-*). */
const SVG = 'http://www.w3.org/2000/svg';
function s(etiqueta, atributos = {}, ...hijos) {
  const n = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v != null) n.setAttribute(k, v);
  for (const h of hijos) if (h != null) n.append(h);
  return n;
}

function graficoCurva(puntos, { interactivo = true } = {}) {
  if (puntos.length < 2) return el('p', { class: 'pie' }, 'Faltan fechas de inicio y fin.');
  const W = 640, H = 280, m = { l: 40, r: 58, t: 14, b: 30 };
  const t0 = puntos[0].fecha, total = Math.max(1, diasEntre(t0, puntos.at(-1).fecha));
  const X = (f) => m.l + (diasEntre(t0, f) / total) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
  const linea = (lista, clave) => lista.filter((p) => p[clave] != null).map((p, i) => `${i ? 'L' : 'M'}${X(p.fecha).toFixed(1)},${Y(p[clave]).toFixed(1)}`).join('');
  const dia = hoy();
  const reales = puntos.filter((p) => p.real != null);
  const ultimo = reales.at(-1);
  const progHoy = puntos.find((p) => p.fecha === dia) || puntos.filter((p) => p.fecha <= dia).at(-1);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'curva-svg', role: 'img', 'aria-label': `Curva S: programado ${fmt(progHoy?.programado)} %, real ${fmt(ultimo?.real)} % hoy` });
  for (const v of [0, 25, 50, 75, 100]) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v ? 'curva-rejilla' : 'curva-base' }),
      s('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'curva-eje' }, `${v} %`));
  }
  const n = Math.min(6, puntos.length);
  for (let i = 0; i < n; i++) {
    const p = puntos[Math.round((i / (n - 1)) * (puntos.length - 1))];
    svg.append(s('text', { x: X(p.fecha), y: H - 10, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', class: 'curva-eje' }, fechaCorta(p.fecha)));
  }
  if (dia >= t0 && dia <= puntos.at(-1).fecha) {
    svg.append(s('line', { x1: X(dia), x2: X(dia), y1: m.t, y2: H - m.b, class: 'curva-hoy' }),
      s('text', { x: X(dia) + 4, y: m.t + 10, class: 'curva-eje' }, 'Hoy'));
  }
  svg.append(s('path', { d: linea(puntos, 'programado'), class: 'curva-prog' }));
  if (reales.length) svg.append(s('path', { d: linea(puntos, 'real'), class: 'curva-real' }));
  // Etiquetas directas: la última de cada serie.
  const fin = puntos.at(-1);
  svg.append(s('text', { x: W - m.r + 6, y: Y(fin.programado) + 4, class: 'curva-etiqueta prog' }, 'Prog.'));
  if (ultimo) {
    svg.append(s('circle', { cx: X(ultimo.fecha), cy: Y(ultimo.real), r: 4.5, class: 'curva-punto' }),
      s('text', { x: X(ultimo.fecha) + 8, y: Y(ultimo.real) - 8, class: 'curva-etiqueta real' }, `${fmt(ultimo.real)} %`));
  }

  const caja = el('div', { class: 'curva' });
  const leyenda = el('div', { class: 'curva-leyenda' },
    el('span', {}, el('i', { class: 'clave prog' }), 'Programado'),
    el('span', {}, el('i', { class: 'clave real' }), 'Real'));
  caja.append(leyenda, el('div', { class: 'curva-lienzo' }, svg));

  if (interactivo) {
    const guia = s('line', { y1: m.t, y2: H - m.b, class: 'curva-cursor', visibility: 'hidden' });
    const pp = s('circle', { r: 4.5, class: 'curva-punto prog', visibility: 'hidden' });
    const pr = s('circle', { r: 4.5, class: 'curva-punto', visibility: 'hidden' });
    svg.append(guia, pp, pr);
    const globo = el('div', { class: 'curva-globo', hidden: true });
    caja.querySelector('.curva-lienzo').append(globo);
    let indice = -1;
    const ver = (i) => {
      indice = Math.max(0, Math.min(puntos.length - 1, i));
      const p = puntos[indice];
      const x = X(p.fecha);
      guia.setAttribute('x1', x); guia.setAttribute('x2', x); guia.setAttribute('visibility', 'visible');
      pp.setAttribute('cx', x); pp.setAttribute('cy', Y(p.programado)); pp.setAttribute('visibility', 'visible');
      if (p.real != null) { pr.setAttribute('cx', x); pr.setAttribute('cy', Y(p.real)); pr.setAttribute('visibility', 'visible'); } else pr.setAttribute('visibility', 'hidden');
      globo.replaceChildren(
        el('span', { class: 'curva-globo-fecha' }, fechaLarga(p.fecha)),
        el('span', {}, el('i', { class: 'clave real' }), el('strong', {}, p.real == null ? '—' : `${fmt(p.real, 1)} %`), ' real'),
        el('span', {}, el('i', { class: 'clave prog' }), el('strong', {}, `${fmt(p.programado, 1)} %`), ' programado'));
      globo.hidden = false;
      const r = svg.getBoundingClientRect();
      const px = (x / W) * r.width;
      globo.style.left = `${Math.min(r.width - 150, Math.max(0, px + 10))}px`;
    };
    const ocultar = () => { guia.setAttribute('visibility', 'hidden'); pp.setAttribute('visibility', 'hidden'); pr.setAttribute('visibility', 'hidden'); globo.hidden = true; };
    const cerca = (ev) => {
      const r = svg.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * W;
      let mejor = 0, d = Infinity;
      puntos.forEach((p, i) => { const dd = Math.abs(X(p.fecha) - x); if (dd < d) { d = dd; mejor = i; } });
      return mejor;
    };
    svg.addEventListener('pointermove', (ev) => ver(cerca(ev)));
    svg.addEventListener('pointerdown', (ev) => ver(cerca(ev)));
    svg.addEventListener('pointerleave', ocultar);
    caja.tabIndex = 0;
    caja.setAttribute('aria-label', 'Curva S. Flechas izquierda y derecha para recorrer las fechas.');
    caja.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight') { ev.preventDefault(); ver(indice + 1); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); ver(indice < 0 ? puntos.length - 1 : indice - 1); }
      if (ev.key === 'Escape') ocultar();
    });
    caja.addEventListener('blur', ocultar);
    caja.append(el('details', { class: 'curva-tabla' },
      el('summary', {}, 'Ver como tabla'),
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Fecha'), el('th', {}, 'Programado'), el('th', {}, 'Real'))),
        el('tbody', {}, ...puntos.map((p) => el('tr', {}, el('td', {}, fechaCorta(p.fecha)), el('td', {}, `${fmt(p.programado, 1)} %`), el('td', {}, p.real == null ? '—' : `${fmt(p.real, 1)} %`)))))));
  }
  return caja;
}

function informeAvance(p) {
  const { titulo } = documento();
  const ind = indicadores(p);
  const dia = hoy();
  imprimir(nodos.informe, `Avance ${p.obra} ${dia}`, [
    ...cabecera('Informe de avance de obra', `AV-${dia.replaceAll('-', '')}`, 'Avance físico de obra', p.obra),
    el('div', { class: 'informe-ficha' },
      dato('Fecha de corte', fechaLarga(dia)),
      dato('Inicio de obra', fechaLarga(p.inicio)),
      dato('Fin previsto', fechaLarga(p.fin)),
      dato('Plazo transcurrido', `${fmt(Math.max(0, Math.min(100, (diasEntre(p.inicio, dia) / (diasEntre(p.inicio, p.fin) || 1)) * 100)))} %`),
      dato('Partidas', String(p.partidas.length)),
      dato('Índice de cumplimiento', ind.spi == null ? '—' : fmt(ind.spi, 2))),
    el('div', { class: 'informe-cifras' },
      cifra(`${fmt(ind.programado)} %`, 'programado'),
      cifra(`${fmt(ind.real)} %`, 'avance real'),
      cifra(`${ind.desviacion >= 0 ? '+' : ''}${fmt(ind.desviacion)}`, 'puntos de desviación', ind.desviacion <= -10 ? 'alerta' : ind.desviacion < -3 ? 'aviso' : ''),
      cifra(ind.spi == null ? '—' : fmt(ind.spi, 2), 'índice real / programado')),
    el('section', {}, titulo('Curva S'), graficoCurva(curva(p), { interactivo: false })),
    el('section', { class: 'informe-larga' },
      titulo('Avance por partida'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Partida'), el('th', { class: 'num' }, 'Peso'), el('th', {}, 'Fechas'), el('th', { class: 'num' }, 'Prog.'), el('th', { class: 'num' }, 'Real'), el('th', { class: 'num' }, 'Desv.'))),
        el('tbody', {}, ...p.partidas.map((x, i) => {
          const pr = programadoPartida(x, dia), re = realPartida(x, dia);
          return el('tr', {}, el('td', { class: 'num' }, String(i + 1)), el('td', {}, x.nombre),
            el('td', { class: 'num' }, `${fmt(Number(x.peso) || 0, 1)} %`), el('td', {}, `${fechaCorta(x.inicio)} – ${fechaCorta(x.fin)}`),
            el('td', { class: 'num' }, `${fmt(pr)} %`), el('td', { class: 'num' }, `${fmt(re)} %`),
            el('td', { class: 'num' }, `${re - pr >= 0 ? '+' : ''}${fmt(re - pr)}`));
        })))),
    pie()
  ], { pagina: 'seguimiento' });
}

/* ------------------------------------------------------------------ */
/* minutas                                                             */
/* ------------------------------------------------------------------ */

async function pintarMinutas() {
  const todas = (await listarMinutas()).filter((m) => !obraSel || mismaObra(m.obra, obraSel));
  const abiertos = acuerdosAbiertos(todas).sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.acuerdo.limite || '9').localeCompare(b.acuerdo.limite || '9'));
  nodos.contenido.replaceChildren(
    abiertos.length ? el('section', { class: 'agenda' },
      el('h2', {}, `Acuerdos abiertos (${abiertos.length})`),
      el('div', { class: 'agenda-lista' }, ...abiertos.slice(0, 12).map(({ minuta: m, acuerdo: a, vencido: v }) => el('a', {
        class: `agenda-item ${v ? 'vencida' : a.limite === hoy() ? 'hoy' : ''}`, href: `#/minuta/${encodeURIComponent(m.id)}`
      },
        el('span', { class: 'agenda-fecha' }, a.limite ? (v ? 'Vencido' : fechaCorta(a.limite)) : 'Sin fecha'),
        el('span', { class: 'agenda-texto' }, el('strong', {}, a.texto || 'Acuerdo sin texto'), el('span', { class: 'pie' }, [a.responsable, m.obra].filter(Boolean).join(' · ')))))),
      abiertos.length > 12 ? el('p', { class: 'pie' }, `y ${abiertos.length - 12} más en la última minuta de cada obra.`) : null) : null,
    todas.length
      ? el('div', { class: 'tarjetas' }, ...todas.map(tarjetaMinuta))
      : el('p', { class: 'vacio' }, 'Todavía no hay minutas. Toca ', el('strong', {}, '+ Minuta'), ' al empezar la reunión de obra: asistentes, temas y acuerdos con responsable y fecha. Los acuerdos abiertos pasan solos a la siguiente reunión.'));
}

function tarjetaMinuta(m) {
  const abiertos = m.acuerdos.filter((a) => a.estado !== 'cumplido');
  const vencidos = abiertos.filter((a) => vencido(a));
  return el('a', { class: 'tarjeta', href: `#/minuta/${encodeURIComponent(m.id)}` },
    el('div', { class: 'tarjeta-fecha' }, `${codigo('MR', m.numero)} · ${fechaLarga(m.fecha)}`),
    el('div', { class: 'tarjeta-obra' }, `🗒️ ${m.obra || 'Obra sin nombre'}`),
    m.temas ? el('div', { class: 'tarjeta-texto' }, m.temas.split('\n')[0]) : null,
    el('div', { class: 'tarjeta-datos' },
      el('span', {}, plural(m.asistentes.filter((a) => a.presente !== false).length, 'asistente', 'asistentes')),
      el('span', {}, plural(m.acuerdos.length, 'acuerdo', 'acuerdos')),
      abiertos.length ? el('span', {}, `${abiertos.length} abiertos`) : null,
      vencidos.length ? el('span', { class: 'tarjeta-alerta' }, `${vencidos.length} vencido${vencidos.length === 1 ? '' : 's'}`) : null));
}

async function nuevaMinutaDialogo() {
  const obras = await obrasConocidas();
  const campoObra = el('input', { class: 'campo', 'data-campo': 'obra', value: obraSel || obras[0] || '', placeholder: 'Nombre o código de la obra', list: 'obras-conocidas' });
  const crear = async () => {
    const obra = campoObra.value.trim();
    if (!obra) return campoObra.focus();
    nodos.dialogo.close();
    const todas = await listarMinutas();
    const anterior = todas.filter((m) => mismaObra(m.obra, obra)).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))[0] || null;
    const m = nuevaMinuta({ obra, numero: numeroDe(todas, obra), anterior, convoca: autorActual() });
    await guardarMinuta(m);
    location.hash = `#/minuta/${m.id}`;
    return null;
  };
  nodos.dialogo.replaceChildren(
    el('div', { class: 'dialogo-cabecera' }, el('h2', {}, 'Nueva minuta'), el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Cerrar', onclick: () => nodos.dialogo.close() }, '✕')),
    el('div', { class: 'dialogo-cuerpo' },
      el('label', { class: 'etiqueta-campo' }, 'Obra', campoObra),
      el('p', { class: 'pie' }, 'Trae los asistentes y los acuerdos abiertos de la reunión anterior de la obra.'),
      el('div', { class: 'fila-botones' }, el('button', { type: 'button', class: 'boton boton-destacado', onclick: crear }, 'Crear la minuta'))));
  nodos.dialogo.showModal();
}

function abrirMinuta(m) {
  actual = { asistentes: [], acuerdos: [], temas: '', proxima: '', observaciones: '', ...m };
  nodos.lista.hidden = true;
  nodos.ficha.hidden = false;
  nodos.accion.hidden = true;
  nodos.estado.textContent = '';
  document.querySelector('.titulo-seccion').textContent = codigo('MR', actual.numero);
  pintarMinuta();
  scrollTo(0, 0);
}

function entrada(obj, clave, { tipo = 'text', placeholder = '', alCambiar = cambioMinuta, datos } = {}) {
  const atributos = { class: 'campo', type: tipo, value: obj[clave] ?? '', placeholder };
  if (datos) atributos['data-campo'] = datos;
  const n = el('input', atributos);
  n.addEventListener('input', () => { obj[clave] = n.value; alCambiar(); });
  return n;
}
function area(obj, clave, placeholder, filas = 3) {
  const t = el('textarea', { class: 'campo', rows: filas, placeholder });
  t.value = obj[clave] || '';
  t.addEventListener('input', () => { obj[clave] = t.value; cambioMinuta(); });
  return t;
}

function pintarMinuta() {
  const m = actual;
  const y = scrollY;
  const filaAsistente = (a) => el('div', { class: 'asistente' },
    el('label', { class: 'casilla', title: 'Presente' }, (() => {
      const c = el('input', { type: 'checkbox', checked: a.presente !== false });
      c.addEventListener('change', () => { a.presente = c.checked; cambioMinuta(); });
      return c;
    })()),
    entrada(a, 'nombre', { placeholder: 'Nombre' }),
    entrada(a, 'empresa', { placeholder: 'Empresa / cargo' }),
    el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Quitar asistente', onclick: () => { m.asistentes = m.asistentes.filter((x) => x !== a); cambioMinuta(); pintarMinuta(); } }, '✕'));

  const filaAcuerdo = (a, i) => {
    const texto = el('textarea', { class: 'campo', rows: 2, placeholder: 'Qué se acordó' });
    texto.value = a.texto || '';
    texto.addEventListener('input', () => { a.texto = texto.value; cambioMinuta(); });
    const hecho = el('input', { type: 'checkbox', checked: a.estado === 'cumplido' });
    hecho.addEventListener('change', () => {
      a.estado = hecho.checked ? 'cumplido' : 'abierto';
      a.cumplido = hecho.checked ? m.fecha : null;
      cambioMinuta(); pintarMinuta();
    });
    const v = vencido(a, m.fecha);
    return el('div', { class: `acuerdo${a.estado === 'cumplido' ? ' cumplido' : ''}${v ? ' vencido' : ''}` },
      el('div', { class: 'acuerdo-cab' },
        el('span', { class: 'punto-n' }, String(i + 1)),
        a.origen && a.origen !== m.numero ? el('span', { class: 'etiqueta atencion' }, `de ${codigo('MR', a.origen)}`) : el('span', { class: 'etiqueta ok' }, 'Nuevo'),
        v ? el('span', { class: 'etiqueta gravedad-grave' }, 'Vencido') : null,
        el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Quitar acuerdo', onclick: () => { if (!confirm('¿Quitar este acuerdo?')) return; m.acuerdos = m.acuerdos.filter((x) => x !== a); cambioMinuta(); pintarMinuta(); } }, '✕')),
      texto,
      el('div', { class: 'acuerdo-datos' },
        el('label', {}, 'Responsable', entrada(a, 'responsable', { placeholder: 'Quién' })),
        el('label', {}, 'Fecha límite', (() => { const f = entrada(a, 'limite', { tipo: 'date' }); f.addEventListener('change', pintarMinuta); return f; })()),
        el('label', { class: 'casilla' }, hecho, 'Cumplido')));
  };

  const abiertos = m.acuerdos.filter((a) => a.estado !== 'cumplido').length;
  nodos.form.replaceChildren(
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, `🗒️ ${codigo('MR', m.numero)}`), el('span', { class: 'pie' }, fechaLarga(m.fecha))),
      el('label', {}, 'Obra', entrada(m, 'obra', { datos: 'obra' })),
      el('div', { class: 'dos' }, el('label', {}, 'Fecha', entrada(m, 'fecha', { tipo: 'date' })), el('label', {}, 'Hora', entrada(m, 'hora', { tipo: 'time' }))),
      el('div', { class: 'dos' }, el('label', {}, 'Lugar', entrada(m, 'lugar', { placeholder: 'Caseta de obra, oficina…' })), el('label', {}, 'Convoca', entrada(m, 'convoca', { placeholder: 'Nombre y cargo', datos: 'autor' })))),
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Asistentes'), el('span', { class: 'pie' }, plural(m.asistentes.filter((a) => a.presente !== false).length, 'presente', 'presentes'))),
      el('div', { class: 'asistentes' }, ...m.asistentes.map(filaAsistente)),
      el('div', { class: 'fila-botones' }, el('button', {
        type: 'button', class: 'boton', onclick: () => {
          m.asistentes.push({ id: nuevoId(), nombre: '', empresa: '', presente: true });
          cambioMinuta(); pintarMinuta();
          const n = nodos.form.querySelectorAll('.asistente input[type=text], .asistente input:not([type])');
          n[n.length - 2]?.focus();
        }
      }, '+ Asistente'))),
    el('section', { class: 'grupo' },
      el('h2', {}, 'Temas tratados'),
      area(m, 'temas', 'Un tema por línea: avance, calidad, seguridad, planos, pagos…', 5)),
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Acuerdos'), el('span', { class: 'pie' }, `${abiertos} abiertos · ${m.acuerdos.length - abiertos} cumplidos`)),
      el('div', { class: 'acuerdos' }, ...m.acuerdos.map(filaAcuerdo)),
      el('div', { class: 'fila-botones' }, el('button', {
        type: 'button', class: 'boton boton-destacado', onclick: () => {
          m.acuerdos.push(nuevoAcuerdo(m.numero));
          cambioMinuta(); pintarMinuta();
          const t = nodos.form.querySelectorAll('.acuerdo textarea');
          t[t.length - 1]?.focus();
        }
      }, '+ Acuerdo')),
      el('p', { class: 'pie' }, 'Los no cumplidos pasan a la próxima minuta de la obra. Los vencidos salen en el inicio.')),
    el('section', { class: 'grupo' },
      el('h2', {}, 'Próxima reunión y observaciones'),
      el('label', {}, 'Próxima reunión', entrada(m, 'proxima', { placeholder: 'p. ej. jueves 29, 9:00, en obra' })),
      area(m, 'observaciones', 'Observaciones', 2)),
    firmasAsistentes(m, m.asistentes.filter((a) => a.presente !== false), cambioMinuta),
    seccionFirmas(m, papelesMinuta(m), { titulo: 'Conformidad', alCambiar: cambioMinuta }),
    el('section', { class: 'grupo acciones-ficha' },
      el('button', { type: 'button', class: 'boton boton-destacado grande', onclick: () => minutaPdf(m) }, 'Minuta en PDF'),
      el('button', {
        type: 'button', class: 'boton boton-peligro grande', onclick: async () => {
          if (!confirm('¿Borrar esta minuta? No se puede deshacer.')) return;
          sucios.delete(m);
          actual = null;
          await borrarMinuta(m.id);
          location.hash = '#/minutas';
        }
      }, 'Borrar esta minuta')));
  scrollTo(0, y);
}

async function minutaPdf(m) {
  await guardarYa();
  const { titulo } = documento();
  const presentes = m.asistentes.filter((a) => a.presente !== false);
  imprimir(nodos.informe, `Minuta ${codigo('MR', m.numero)} ${m.obra} ${m.fecha}`, [
    ...cabecera('Minuta de reunión de obra', `${codigo('MR', m.numero)}-${(m.fecha || '').replaceAll('-', '')}`, 'Minuta de reunión', m.obra),
    el('div', { class: 'informe-ficha' },
      dato('Fecha', `${fechaLarga(m.fecha)}${m.hora ? ` · ${m.hora}` : ''}`),
      dato('Lugar', m.lugar),
      dato('Convoca', m.convoca),
      dato('Asistentes', String(presentes.length)),
      dato('Acuerdos', `${m.acuerdos.length} (${m.acuerdos.filter((a) => a.estado !== 'cumplido').length} abiertos)`),
      dato('Próxima reunión', m.proxima)),
    el('section', {},
      titulo('Asistentes'),
      el('table', { class: 'informe-tabla informe-asistentes' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Nombre'), el('th', {}, 'Empresa / cargo'), el('th', {}, 'Firma'))),
        el('tbody', {}, ...presentes.map((a) => el('tr', {}, el('td', {}, a.nombre || '—'), el('td', {}, a.empresa || '—'), celdaFirmaAsistente(m, a)))))),
    m.temas?.trim() ? el('section', {}, titulo('Temas tratados'), el('ol', { class: 'informe-lista' }, ...m.temas.trim().split('\n').filter((t) => t.trim()).map((t) => el('li', {}, t.trim())))) : null,
    m.acuerdos.length ? el('section', {},
      titulo('Acuerdos'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Acuerdo'), el('th', {}, 'Responsable'), el('th', {}, 'Fecha límite'), el('th', {}, 'Estado'))),
        el('tbody', {}, ...m.acuerdos.map((a, i) => el('tr', {},
          el('td', { class: 'num' }, String(i + 1)),
          el('td', {}, a.texto || '—', a.origen && a.origen !== m.numero ? el('span', { class: 'informe-nota' }, ` (de ${codigo('MR', a.origen)})`) : null),
          el('td', {}, a.responsable || '—'),
          el('td', { class: 'informe-hora' }, a.limite || '—'),
          el('td', {}, el('span', { class: `informe-estado ${a.estado === 'cumplido' ? 'si' : vencido(a, m.fecha) ? 'no' : 'pendiente'}` },
            a.estado === 'cumplido' ? 'Cumplido' : vencido(a, m.fecha) ? 'Vencido' : 'Abierto'))))))) : null,
    m.observaciones?.trim() ? el('section', {}, titulo('Observaciones'), el('p', { class: 'parrafo' }, m.observaciones.trim())) : null,
    el('section', { class: 'informe-firma' },
      titulo('Conformidad'),
      el('div', { class: 'informe-firmas' }, ...papelesMinuta(m).map((p) => cajaFirma(urlFirma(m, p.papel), (p.nombre && p.nombre()) || (m.firmas && m.firmas[p.papel] && m.firmas[p.papel].nombre) || '', p.titulo)))),
    pie()
  ], { pagina: 'seguimiento' });
}

/* ------------------------------------------------------------------ */
/* días afectados                                                      */
/* ------------------------------------------------------------------ */

async function pintarDias() {
  const dias = diasAfectados(await listarVisitas(), obraSel);
  const total = dias.reduce((s, d) => s + d.dias, 0);
  const porCausa = totalesPorCausa(dias);
  const max = Math.max(1, ...porCausa.map(([, n]) => n));
  nodos.accion.hidden = !dias.length;
  nodos.accion.textContent = 'Relación en PDF';
  datosDias = dias;
  nodos.contenido.replaceChildren(
    el('section', { class: 'grupo' },
      el('div', { class: 'indicadores' },
        indicador(fmt(total, 1), 'días equivalentes perdidos', total ? 'regular' : ''),
        indicador(String(dias.filter((d) => d.jornada === 'Sin actividad').length), 'días sin actividad'),
        indicador(String(dias.filter((d) => d.jornada === 'Parcial').length), 'jornadas parciales')),
      porCausa.length ? el('div', { class: 'causas' }, ...porCausa.map(([k, n]) => el('div', { class: 'causa' },
        el('span', { class: 'causa-nombre' }, CAUSAS[k] || 'Sin causa anotada'),
        el('span', { class: 'causa-barra' }, el('span', { style: `width:${(n / max) * 100}%` })),
        el('strong', {}, fmt(n, 1))))) : null,
      el('p', { class: 'pie' }, 'Sale de las visitas con jornada «Parcial» o «Sin actividad»: un día sin actividad cuenta 1; uno parcial, las horas perdidas entre 8 (o medio día si no se anotaron). Sirve para justificar una prórroga del plazo.')),
    dias.length
      ? el('div', { class: 'tarjetas' }, ...dias.map((d) => el('a', { class: 'tarjeta', href: `./visita.html#/v/${encodeURIComponent(d.visita)}` },
        el('div', { class: 'tarjeta-fecha' }, `${fechaLarga(d.fecha)} `, el('span', { class: `etiqueta ${d.jornada === 'Sin actividad' ? 'gravedad-grave' : 'atencion'}` }, d.jornada)),
        el('div', { class: 'tarjeta-obra' }, CAUSAS[d.causa] || 'Sin causa anotada'),
        el('div', { class: 'tarjeta-texto' }, [d.obra, d.nota].filter(Boolean).join(' · ')),
        el('div', { class: 'tarjeta-datos' }, el('span', {}, `${fmt(d.dias, 2)} día${d.dias === 1 ? '' : 's'}`), d.horas != null ? el('span', {}, `${fmt(d.horas, 1)} h perdidas`) : null, d.autor ? el('span', {}, d.autor) : null))))
      : el('p', { class: 'vacio' }, 'Ningún día afectado. Cuando una jornada sea parcial o sin actividad, márcalo en la visita del día (Tiempo y jornada) con su causa y las horas perdidas.'));
}

function diasPdf(dias, obra) {
  const { titulo } = documento();
  const total = dias.reduce((s, d) => s + d.dias, 0);
  const desde = dias.at(-1)?.fecha, hasta = dias[0]?.fecha;
  imprimir(nodos.informe, `Días afectados ${obra || 'obras'} ${hoy()}`, [
    ...cabecera('Relación de días afectados', `DA-${hoy().replaceAll('-', '')}`, 'Días afectados', obra || 'Todas las obras'),
    el('div', { class: 'informe-ficha' },
      dato('Periodo', desde ? `${fechaLarga(desde)} – ${fechaLarga(hasta)}` : '—'),
      dato('Días equivalentes', fmt(total, 1)),
      dato('Registros', String(dias.length))),
    el('section', {},
      titulo('Por causa'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Causa'), el('th', { class: 'num' }, 'Días'))),
        el('tbody', {}, ...totalesPorCausa(dias).map(([k, n]) => el('tr', {}, el('td', {}, CAUSAS[k] || 'Sin causa anotada'), el('td', { class: 'num' }, fmt(n, 2))))))),
    el('section', { class: 'informe-larga' },
      titulo('Detalle'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Fecha'), el('th', {}, 'Jornada'), el('th', {}, 'Causa'), el('th', { class: 'num' }, 'Horas'), el('th', { class: 'num' }, 'Días'), el('th', {}, 'Detalle'))),
        el('tbody', {}, ...dias.map((d) => el('tr', {},
          el('td', { class: 'informe-hora' }, d.fecha), el('td', {}, d.jornada), el('td', {}, CAUSAS[d.causa] || '—'),
          el('td', { class: 'num' }, d.horas != null ? fmt(d.horas, 1) : '—'), el('td', { class: 'num' }, fmt(d.dias, 2)),
          el('td', {}, [obra ? '' : d.obra, d.nota].filter(Boolean).join(' · ') || '—')))))),
    el('p', { class: 'informe-legal' }, 'Relación tomada de los reportes diarios de visita. Un día sin actividad cuenta 1; uno parcial, las horas perdidas entre 8.'),
    el('section', { class: 'informe-firma' },
      titulo('Conformidad'),
      el('div', { class: 'informe-firmas' }, cajaFirma(null, '', 'Supervisión'), cajaFirma(null, '', 'Contratista'))),
    pie()
  ], { pagina: 'seguimiento' });
}

/* ------------------------------------------------------------------ */
/* arranque                                                            */
/* ------------------------------------------------------------------ */

addEventListener('hashchange', enrutar);
addEventListener('visibilitychange', () => { if (document.hidden) guardarYa(); });
addEventListener('pagehide', guardarYa);
addEventListener('crd-remoto', async (ev) => {
  const ids = new Set(ev.detail.ids);
  if (actual) {
    if (ids.has(actual.id) && !sucios.has(actual)) {
      const fresca = await leerMinuta(actual.id);
      if (fresca) { actual = fresca; pintarMinuta(); }
    }
    return;
  }
  if (!sucios.size) { programa = null; mostrar(); }
});

if (equipo.activo) equipo.iniciar().catch(() => {});
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

enrutar();
