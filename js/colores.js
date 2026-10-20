/* Colorear el modelo por una propiedad, como el Appearance Profiler de
   Navisworks: se elige una propiedad (categoría, planta, tipo, material o
   cualquiera de un Pset) y cada valor sale de un color, con su leyenda.
   Si los valores son números y hay muchos, se reparten en tramos con una
   escala de frío a cálido. Desde la leyenda se oculta cada valor.

   Las propiedades de los Pset las lee el worker la primera vez que se
   piden; las de categoría, planta y clase ya están en el hilo principal. */

import * as THREE from 'three';

const PALETA = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#1f77b4', '#2ca02c', '#d62728', '#9467bd', '#17becf', '#bcbd22', '#8c564b'
];
const ESCALA = ['#2c7bb6', '#00a6ca', '#00ccbc', '#90eb9d', '#f9d057', '#f29e2e', '#e76818', '#d7191c'];
const SIN_VALOR = '#c3c8d0';
const TRAMOS = 6;
const MAX_FILAS = 60;

/* Color n de la paleta; pasados los 16, se reparten tonos por el ángulo áureo. */
function colorCategoria(n) {
  if (n < PALETA.length) return PALETA[n];
  const tono = (n * 137.508) % 360;
  return `hsl(${tono.toFixed(0)}, 55%, ${n % 2 ? 48 : 62}%)`;
}

function colorEscala(t) {
  const x = Math.min(1, Math.max(0, t)) * (ESCALA.length - 1);
  const i = Math.floor(x);
  const a = new THREE.Color(ESCALA[i]);
  return i >= ESCALA.length - 1 ? a : a.lerp(new THREE.Color(ESCALA[i + 1]), x - i);
}

const comoNumero = (v) => Number(String(v).replace(',', '.'));
const formato = (n) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 });

export class Colores {
  /* incorporados: { nombre: (id) → valor } calculados aquí.
     ids(): todos los expressID con geometría. pedir(orden): al worker. */
  constructor(visor, { selector, leyenda, quitar, incorporados, ids, pedir, alCambiar, avisar }) {
    this.visor = visor;
    this.selector = selector;
    this.leyenda = leyenda;
    this.botonQuitar = quitar;
    this.incorporados = incorporados;
    this.ids = ids;
    this.pedir = pedir;
    this.alCambiar = alCambiar;
    this.avisar = avisar;
    this.reiniciar();
    selector.addEventListener('focus', () => this.cargarClaves());
    selector.addEventListener('change', () => this.elegir(selector.value));
    quitar.addEventListener('click', () => this.quitar());
  }

  reiniciar() {
    this.clave = '';
    this.grupos = [];            // {etiqueta, color, ids:Set, visible}
    this.grupoDe = new Map();    // id → grupo
    this.claves = null;          // null: sin pedir; []: pedidas
    this.esperando = null;
    this.visor.colorear(null);
    this.pintarSelector();
    this.pintarLeyenda();
  }

  activo() {
    return !!this.clave;
  }

  /* Para el filtro de visibilidad del visor. */
  oculto(id) {
    const g = this.grupoDe.get(id);
    return !!(g && !g.visible);
  }

  cargarClaves() {
    if (this.claves !== null) return;
    this.claves = [];
    this.pintarSelector('Leyendo propiedades del modelo…');
    this.pedir({ tipo: 'claves' });
  }

  recibir(m) {
    if (m.tipo === 'claves') {
      this.claves = m.claves;
      this.pintarSelector();
    } else if (m.tipo === 'valores' && m.clave === this.esperando) {
      this.esperando = null;
      this.aplicar(new Map(m.valores));
    }
  }

  pintarSelector(cargando) {
    const s = this.selector;
    const opcion = (valor, texto) => {
      const o = document.createElement('option');
      o.value = valor;
      o.textContent = texto;
      return o;
    };
    const grupo = (titulo, opciones) => {
      const g = document.createElement('optgroup');
      g.label = titulo;
      g.append(...opciones);
      return g;
    };
    const hijos = [
      opcion('', 'Colores del modelo'),
      grupo('Del modelo', Object.keys(this.incorporados).map((k) => opcion(`*${k}`, k)))
    ];
    if (cargando) {
      const o = opcion('…', cargando);
      o.disabled = true;
      hijos.push(o);
    }
    // Las propiedades de Pset se agrupan por conjunto («Pset_WallCommon · FireRating»).
    const porConjunto = new Map();
    for (const [clave, cuantos, distintos] of this.claves || []) {
      const corte = clave.indexOf(' · ');
      const conjunto = corte > 0 ? clave.slice(0, corte) : 'Generales';
      const nombre = corte > 0 ? clave.slice(corte + 3) : clave;
      if (!porConjunto.has(conjunto)) porConjunto.set(conjunto, []);
      porConjunto.get(conjunto).push(opcion(clave, `${nombre} (${distintos} ${distintos === 1 ? 'valor' : 'valores'})`));
    }
    const conjuntos = [...porConjunto.keys()].sort((a, b) =>
      (a === 'Generales' ? -1 : b === 'Generales' ? 1 : a.localeCompare(b, 'es')));
    for (const c of conjuntos) hijos.push(grupo(c, porConjunto.get(c)));
    if (this.claves && this.claves.length === 0 && !cargando) {
      const o = opcion('…', 'El modelo no trae más propiedades');
      o.disabled = true;
      hijos.push(o);
    }
    s.replaceChildren(...hijos);
    s.value = this.clave;
  }

  elegir(valor) {
    if (!valor) return this.quitar();
    this.clave = valor;
    if (valor.startsWith('*')) {
      const leer = this.incorporados[valor.slice(1)];
      const mapa = new Map();
      for (const id of this.ids()) {
        const v = leer(id);
        if (v) mapa.set(id, v);
      }
      this.aplicar(mapa);
    } else {
      this.esperando = valor;
      this.leyenda.replaceChildren(this.texto('Leyendo valores…'));
      this.pedir({ tipo: 'valores', clave: valor });
    }
  }

  /* mapa: id → valor (texto). */
  aplicar(mapa) {
    const conteo = new Map();
    for (const v of mapa.values()) conteo.set(v, (conteo.get(v) || 0) + 1);
    const distintos = [...conteo.keys()];
    const numerico = distintos.length > 7 && distintos.every((v) => Number.isFinite(comoNumero(v)));
    const grupos = [];
    const grupoDeValor = new Map();

    if (numerico) {
      const nums = distintos.map(comoNumero);
      const min = Math.min(...nums), max = Math.max(...nums);
      const paso = (max - min) / TRAMOS || 1;
      for (let i = 0; i < TRAMOS; i++) {
        const desde = min + i * paso, hasta = i === TRAMOS - 1 ? max : desde + paso;
        grupos.push({
          etiqueta: `${formato(desde)} – ${formato(hasta)}`,
          color: colorEscala(i / (TRAMOS - 1)),
          ids: new Set(),
          visible: true
        });
      }
      for (const v of distintos) {
        const i = Math.min(TRAMOS - 1, Math.floor((comoNumero(v) - min) / paso));
        grupoDeValor.set(v, grupos[i]);
      }
    } else {
      // Los más frecuentes, primero: se llevan los colores más distinguibles.
      distintos.sort((a, b) => conteo.get(b) - conteo.get(a) || String(a).localeCompare(String(b), 'es'));
      distintos.forEach((v, n) => {
        const g = { etiqueta: v, color: new THREE.Color(colorCategoria(n)), ids: new Set(), visible: true };
        grupos.push(g);
        grupoDeValor.set(v, g);
      });
    }

    const sinValor = { etiqueta: 'Sin valor', color: new THREE.Color(SIN_VALOR), ids: new Set(), visible: true, sinValor: true };
    this.grupoDe = new Map();
    for (const id of this.ids()) {
      const v = mapa.get(id);
      const g = v !== undefined ? grupoDeValor.get(v) : sinValor;
      g.ids.add(id);
      this.grupoDe.set(id, g);
    }
    this.grupos = grupos.filter((g) => g.ids.size).concat(sinValor.ids.size ? [sinValor] : []);
    this.visor.colorear((id) => {
      const g = this.grupoDe.get(id);
      return g ? g.color : null;
    });
    this.pintarLeyenda();
    this.alCambiar();
    if (!mapa.size) this.avisar('Ningún elemento con geometría tiene esa propiedad.');
  }

  /* «Todo» de la barra: vuelven a verse todos los valores. */
  mostrarTodo() {
    for (const g of this.grupos) g.visible = true;
    this.pintarLeyenda();
  }

  quitar() {
    this.clave = '';
    this.grupos = [];
    this.grupoDe = new Map();
    this.visor.colorear(null);
    this.selector.value = '';
    this.pintarLeyenda();
    this.alCambiar();
  }

  texto(t) {
    const p = document.createElement('p');
    p.className = 'pie';
    p.textContent = t;
    return p;
  }

  pintarLeyenda() {
    this.botonQuitar.hidden = !this.clave;
    if (!this.clave) {
      this.leyenda.replaceChildren(this.texto('Elige una propiedad y cada valor saldrá de un color. Con la casilla de cada fila se oculta ese valor.'));
      return;
    }
    const filas = this.grupos.slice(0, MAX_FILAS).map((g) => {
      const fila = document.createElement('label');
      fila.className = 'fila leyenda-fila';
      const casilla = document.createElement('input');
      casilla.type = 'checkbox';
      casilla.checked = g.visible;
      casilla.addEventListener('change', () => { g.visible = casilla.checked; this.alCambiar(); });
      const muestra = document.createElement('span');
      muestra.className = 'leyenda-muestra';
      muestra.style.background = `#${g.color.getHexString()}`;
      const texto = document.createElement('span');
      texto.className = 'fila-texto';
      texto.textContent = g.etiqueta;
      if (g.sinValor) texto.classList.add('vacio');
      const n = document.createElement('span');
      n.className = 'fila-cuenta';
      n.textContent = g.ids.size;
      fila.append(casilla, muestra, texto, n);
      return fila;
    });
    const resto = this.grupos.length - MAX_FILAS;
    if (resto > 0) filas.push(this.texto(`Y ${resto} valores más.`));
    const todos = document.createElement('div');
    todos.className = 'grupo-cabecera';
    const mostrar = document.createElement('button');
    mostrar.type = 'button';
    mostrar.className = 'enlace';
    mostrar.textContent = 'Ver todos';
    mostrar.addEventListener('click', () => {
      for (const g of this.grupos) g.visible = true;
      this.pintarLeyenda();
      this.alCambiar();
    });
    const resumen = document.createElement('span');
    resumen.className = 'pie';
    resumen.textContent = `${this.grupos.length} ${this.grupos.length === 1 ? 'valor' : 'valores'}`;
    todos.append(resumen, mostrar);
    this.leyenda.replaceChildren(todos, ...filas);
  }
}
