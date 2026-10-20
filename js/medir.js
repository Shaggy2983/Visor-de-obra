/* Medir sobre el modelo: distancias entre dos puntos y áreas de un
   contorno. Los puntos se pegan a la esquina o al borde más cercano del
   triángulo tocado si el dedo cae cerca, que es lo que se quiere casi
   siempre (grueso de un muro, luz de un hueco).

   Las cotas se dibujan en una capa SVG por encima del lienzo, proyectando
   cada punto en cada fotograma: así se leen igual de grandes con
   cualquier zoom y ningún corte las tapa. */

import * as THREE from 'three';

const IMAN = 22;   // píxeles: distancia a la que el punto salta a una esquina

const NS = 'http://www.w3.org/2000/svg';

function svg(etiqueta, atributos = {}) {
  const n = document.createElementNS(NS, etiqueta);
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, v);
  return n;
}

export function metros(m) {
  return `${m.toLocaleString('es-ES', { minimumFractionDigits: m < 10 ? 3 : 2, maximumFractionDigits: m < 10 ? 3 : 2 })} m`;
}

function metrosCuadrados(m2) {
  return `${m2.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

/* Área de un polígono en 3D (fórmula de Newell): vale aunque no sea
   horizontal, por ejemplo el paño de un muro. */
function area(puntos) {
  const n = new THREE.Vector3();
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i], b = puntos[(i + 1) % puntos.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.length() / 2;
}

function perimetro(puntos, cerrado) {
  let total = 0;
  const fin = cerrado ? puntos.length : puntos.length - 1;
  for (let i = 0; i < fin; i++) total += puntos[i].distanceTo(puntos[(i + 1) % puntos.length]);
  return total;
}

export class Medidor {
  constructor(visor, { capa, barra, ayuda, avisar }) {
    this.visor = visor;
    this.capa = capa;
    this.barra = barra;
    this.ayuda = ayuda;
    this.avisar = avisar;
    this.activo = false;
    this.modo = 'distancia';
    this.medidas = [];       // {tipo, puntos, cerrada}
    this.actual = null;      // medida a medio hacer

    this.dibujo = svg('svg', { class: 'medidas-svg' });
    this.etiquetas = document.createElement('div');
    this.etiquetas.className = 'medidas-etiquetas';
    this.capa.append(this.dibujo, this.etiquetas);

    this.v = new THREE.Vector3();
    visor.trasDibujar.push(() => this.pintar());
  }

  encender(si) {
    this.activo = si;
    this.barra.hidden = !si;
    if (!si) this.terminar();
    this.explicar();
  }

  ponerModo(modo) {
    this.terminar();
    this.modo = modo;
    this.marcarModo();
    this.explicar();
  }

  marcarModo() {
    for (const b of this.barra.querySelectorAll('[data-medir]')) {
      b.classList.toggle('activo', b.dataset.medir === this.modo);
    }
  }

  explicar() {
    if (!this.activo) return;
    const n = this.actual ? this.actual.puntos.length : 0;
    if (this.modo === 'distancia') {
      this.ayuda.textContent = n ? 'Toca el segundo punto.' : 'Toca el primer punto. Se pega a esquinas y bordes.';
    } else {
      this.ayuda.textContent = n < 3
        ? `Toca los vértices del contorno (${n} de al menos 3).`
        : 'Sigue tocando vértices o pulsa «Cerrar área».';
    }
    const cerrar = this.barra.querySelector('[data-accion=cerrar]');
    if (cerrar) cerrar.hidden = !(this.modo === 'area' && n >= 3);
  }

  /* x, y: punto de pantalla normalizado (-1..1); px, py: en píxeles del lienzo. */
  tocar(x, y, px, py) {
    const golpe = this.visor.apuntar(x, y);
    if (!golpe) {
      this.avisar('Toca sobre el modelo.');
      return;
    }
    const punto = this.iman(golpe, px, py);
    if (!this.actual) {
      this.actual = { tipo: this.modo, puntos: [], cerrada: false };
      this.medidas.push(this.actual);
    }
    this.actual.puntos.push(punto);
    if (this.modo === 'distancia' && this.actual.puntos.length === 2) {
      this.actual = null;
    }
    this.explicar();
  }

  /* Esquina del triángulo, o punto del borde, si caen cerca del dedo. */
  iman(golpe, px, py) {
    const caja = this.visor.lienzo.getBoundingClientRect();
    const enPantalla = (p) => {
      this.v.copy(p).project(this.visor.camara);
      return [(this.v.x + 1) / 2 * caja.width, (1 - this.v.y) / 2 * caja.height];
    };
    let mejor = null, distancia = IMAN;
    for (const vertice of golpe.triangulo) {
      const [sx, sy] = enPantalla(vertice);
      const d = Math.hypot(sx - px, sy - py);
      if (d < distancia) { distancia = d; mejor = vertice; }
    }
    if (mejor) return mejor.clone();
    const linea = new THREE.Line3();
    const cerca = new THREE.Vector3();
    distancia = IMAN * 0.6;
    for (let i = 0; i < 3; i++) {
      linea.set(golpe.triangulo[i], golpe.triangulo[(i + 1) % 3]);
      linea.closestPointToPoint(golpe.punto, true, cerca);
      const [sx, sy] = enPantalla(cerca);
      const d = Math.hypot(sx - px, sy - py);
      if (d < distancia) { distancia = d; mejor = cerca.clone(); }
    }
    return mejor || golpe.punto.clone();
  }

  cerrarArea() {
    if (this.actual && this.actual.tipo === 'area' && this.actual.puntos.length >= 3) {
      this.actual.cerrada = true;
      this.actual = null;
    }
    this.explicar();
  }

  /* Una medida a medias no sirve: se descarta al cambiar de modo o salir. */
  terminar() {
    if (this.actual) {
      if (this.actual.tipo === 'area' && this.actual.puntos.length >= 3) this.actual.cerrada = true;
      else this.medidas = this.medidas.filter((m) => m !== this.actual);
    }
    this.actual = null;
  }

  deshacer() {
    const ultima = this.medidas[this.medidas.length - 1];
    if (!ultima) return;
    ultima.puntos.pop();
    ultima.cerrada = false;
    if (!ultima.puntos.length) {
      this.medidas.pop();
      this.actual = null;
    } else {
      // Se retoma la última medida para poner el punto quitado de nuevo.
      this.modo = ultima.tipo;
      this.marcarModo();
      this.actual = ultima;
    }
    this.explicar();
  }

  borrar() {
    this.medidas = [];
    this.actual = null;
    this.explicar();
  }

  /* --- dibujo, en cada fotograma --- */

  pintar() {
    const oculta = this.visor.render.xr.isPresenting || !this.medidas.length;
    this.capa.hidden = oculta;
    if (oculta) return;
    const caja = this.visor.lienzo.getBoundingClientRect();
    const camara = this.visor.camara;
    const proyectar = (p) => {
      this.v.copy(p).project(camara);
      // Detrás de la cámara no se dibuja.
      if (this.v.z > 1) return null;
      return [(this.v.x + 1) / 2 * caja.width, (1 - this.v.y) / 2 * caja.height];
    };
    const trazos = [];
    const rotulos = [];
    for (const m of this.medidas) {
      const pantalla = m.puntos.map(proyectar);
      if (pantalla.some((p) => !p)) continue;
      const cerrada = m.tipo === 'area' && m.cerrada;
      const unidos = cerrada ? pantalla.concat([pantalla[0]]) : pantalla;
      if (unidos.length > 1) {
        const puntos = unidos.map((p) => p.join(',')).join(' ');
        if (cerrada) trazos.push(svg('polygon', { points: pantalla.map((p) => p.join(',')).join(' '), class: 'medida-area' }));
        trazos.push(svg('polyline', { points: puntos, class: 'medida-fondo' }));
        trazos.push(svg('polyline', { points: puntos, class: 'medida-linea' }));
      }
      for (const [x, y] of pantalla) trazos.push(svg('circle', { cx: x, cy: y, r: 5, class: 'medida-punto' }));

      if (m.tipo === 'distancia' && m.puntos.length === 2) {
        const [a, b] = m.puntos;
        const vertical = Math.abs(b.y - a.y);
        const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
        rotulos.push({
          x: (pantalla[0][0] + pantalla[1][0]) / 2,
          y: (pantalla[0][1] + pantalla[1][1]) / 2,
          texto: metros(a.distanceTo(b)),
          detalle: vertical > 0.005 && horizontal > 0.005 ? `↔ ${metros(horizontal)} · ↕ ${metros(vertical)}` : ''
        });
      } else if (m.tipo === 'area' && m.puntos.length >= 3) {
        const cx = pantalla.reduce((s, p) => s + p[0], 0) / pantalla.length;
        const cy = pantalla.reduce((s, p) => s + p[1], 0) / pantalla.length;
        rotulos.push({
          x: cx, y: cy,
          texto: metrosCuadrados(area(m.puntos)),
          detalle: `Perímetro ${metros(perimetro(m.puntos, true))}`
        });
      }
    }
    this.dibujo.replaceChildren(...trazos);
    // Las etiquetas se reutilizan para no crear nodos en cada fotograma.
    while (this.etiquetas.children.length > rotulos.length) this.etiquetas.lastChild.remove();
    rotulos.forEach((r, i) => {
      let nodo = this.etiquetas.children[i];
      if (!nodo) {
        nodo = document.createElement('div');
        nodo.className = 'medida-rotulo';
        nodo.append(document.createElement('strong'), document.createElement('span'));
        this.etiquetas.append(nodo);
      }
      nodo.style.transform = `translate(${r.x}px, ${r.y}px) translate(-50%, -130%)`;
      if (nodo.firstChild.textContent !== r.texto) nodo.firstChild.textContent = r.texto;
      if (nodo.lastChild.textContent !== r.detalle) nodo.lastChild.textContent = r.detalle;
    });
  }
}
