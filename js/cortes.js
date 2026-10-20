/* Cortes del modelo: planta (horizontal), alzados en X y en Z, un corte
   paralelo a cualquier cara que se toque, y caja de sección. Todos se
   mueven con deslizadores y se pueden invertir. El plano activo se ve
   como una lámina azul translúcida (o las aristas de la caja). */

import * as THREE from 'three';
import { metros } from './medir.js';

const TIPOS = {
  ninguno: 'Sin corte',
  planta: 'Planta',
  x: 'Alzado X',
  z: 'Alzado Z',
  cara: 'Por cara',
  caja: 'Caja'
};

const EJES = { planta: new THREE.Vector3(0, 1, 0), x: new THREE.Vector3(1, 0, 0), z: new THREE.Vector3(0, 0, 1) };
const COMPONENTE = { planta: 'y', x: 'x', z: 'z' };
const PASOS = 1000;

export class Cortes {
  constructor(visor, { tipos, controles, relleno, verPlano, avisar, alPedirCara }) {
    this.visor = visor;
    this.nodos = { tipos, controles, relleno, verPlano };
    this.avisar = avisar;
    this.alPedirCara = alPedirCara;
    this.tipo = 'ninguno';
    this.invertido = false;
    this.posicion = 0.5;          // 0..1 dentro del modelo
    this.cara = null;             // {punto, normal} para el corte por cara
    this.desfase = 0;             // metros hacia dentro desde la cara
    this.caja = null;             // límites de la caja de sección
    this.esperandoCara = false;
    this.limites = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));

    const material = new THREE.MeshBasicMaterial({
      color: 0x62a0e8, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false
    });
    this.lamina = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.borde = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: 0x62a0e8, transparent: true, opacity: 0.8 })
    );
    this.lamina.add(this.borde);
    this.marcoCaja = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x62a0e8 })
    );
    for (const o of [this.lamina, this.marcoCaja]) {
      o.visible = false;
      o.renderOrder = 3;
      visor.escena.add(o);
    }

    relleno.addEventListener('change', () => visor.ponerRelleno(relleno.checked));
    verPlano.addEventListener('change', () => this.aplicar());
    this.pintarTipos();
  }

  /* Al cargar un modelo: los deslizadores recorren su caja. */
  preparar() {
    const caja = this.visor.cajaModelo();
    if (!caja.isEmpty()) {
      const margen = caja.getSize(new THREE.Vector3()).length() * 0.01;
      this.limites.copy(caja).expandByScalar(margen);
    }
    this.poner('ninguno');
  }

  poner(tipo) {
    this.tipo = tipo;
    this.invertido = false;
    this.esperandoCara = false;
    if (tipo === 'planta') this.posicion = 0.55;
    else if (tipo === 'x' || tipo === 'z') this.posicion = 0.5;
    if (tipo === 'caja') this.caja = this.limites.clone();
    if (tipo === 'cara') {
      this.cara = null;
      this.desfase = 0;
      this.esperandoCara = true;
      this.alPedirCara();
    }
    this.pintarTipos();
    this.pintarControles();
    this.aplicar();
  }

  /* El corte por cara recibe el golpe del toque sobre el modelo. */
  tocar(golpe) {
    if (!golpe) {
      this.avisar('Toca una cara del modelo.');
      return;
    }
    this.cara = { punto: golpe.punto.clone(), normal: golpe.normal.clone().normalize() };
    this.desfase = 0;
    this.esperandoCara = false;
    this.pintarControles();
    this.aplicar();
  }

  get activo() {
    return this.tipo !== 'ninguno';
  }

  /* --- planos --- */

  planos() {
    const L = this.limites;
    if (this.tipo === 'planta' || this.tipo === 'x' || this.tipo === 'z') {
      const c = COMPONENTE[this.tipo];
      const valor = L.min[c] + this.posicion * (L.max[c] - L.min[c]);
      // Se ve lo que queda por debajo (o detrás) del valor; invertido, lo contrario.
      const normal = EJES[this.tipo].clone().multiplyScalar(this.invertido ? 1 : -1);
      return [new THREE.Plane(normal, this.invertido ? -valor : valor)];
    }
    if (this.tipo === 'cara' && this.cara) {
      // La normal mira hacia quien tocó: se quita lo que hay delante de la cara.
      const normal = this.cara.normal.clone().multiplyScalar(this.invertido ? 1 : -1);
      const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.cara.punto);
      plano.constant -= this.invertido ? -this.desfase : this.desfase;
      return [plano];
    }
    if (this.tipo === 'caja' && this.caja) {
      const { min, max } = this.caja;
      return [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -min.x), new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -min.y), new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -min.z), new THREE.Plane(new THREE.Vector3(0, 0, -1), max.z)
      ];
    }
    return [];
  }

  aplicar() {
    const planos = this.planos();
    this.visor.ponerCortes(planos);
    const ver = this.nodos.verPlano.checked;
    this.lamina.visible = ver && planos.length === 1;
    this.marcoCaja.visible = ver && this.tipo === 'caja';
    if (this.lamina.visible) {
      const plano = planos[0];
      const lado = this.limites.getSize(new THREE.Vector3()).length() * 1.05;
      const centro = this.limites.getCenter(new THREE.Vector3());
      plano.projectPoint(centro, this.lamina.position);
      this.lamina.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plano.normal);
      this.lamina.scale.set(lado, lado, 1);
    }
    if (this.marcoCaja.visible) {
      this.caja.getCenter(this.marcoCaja.position);
      this.caja.getSize(this.marcoCaja.scale);
    }
  }

  /* --- interfaz --- */

  pintarTipos() {
    this.nodos.tipos.replaceChildren(...Object.entries(TIPOS).map(([clave, texto]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = clave === this.tipo ? 'chip activo' : 'chip';
      b.textContent = texto;
      b.setAttribute('aria-pressed', String(clave === this.tipo));
      b.addEventListener('click', () => this.poner(clave));
      return b;
    }));
  }

  deslizador(etiqueta, valor, alCambiar, texto) {
    const caja = document.createElement('label');
    caja.className = 'corte-control';
    const cabecera = document.createElement('span');
    cabecera.className = 'corte-etiqueta';
    const nombre = document.createElement('span');
    nombre.textContent = etiqueta;
    const lectura = document.createElement('span');
    lectura.className = 'corte-valor';
    lectura.textContent = texto(valor);
    cabecera.append(nombre, lectura);
    const entrada = document.createElement('input');
    entrada.type = 'range';
    entrada.className = 'deslizador';
    entrada.min = '0';
    entrada.max = String(PASOS);
    entrada.value = String(Math.round(valor * PASOS));
    entrada.addEventListener('input', () => {
      const t = Number(entrada.value) / PASOS;
      alCambiar(t);
      lectura.textContent = texto(t);
      this.aplicar();
    });
    caja.append(cabecera, entrada);
    return caja;
  }

  boton(texto, alTocar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'boton';
    b.textContent = texto;
    b.addEventListener('click', alTocar);
    return b;
  }

  pintarControles() {
    const L = this.limites;
    const c = this.nodos.controles;
    c.replaceChildren();
    const ayuda = (t) => {
      const p = document.createElement('p');
      p.className = 'pie';
      p.textContent = t;
      return p;
    };
    // Las cotas se cuentan desde la base del modelo, que está apoyada en 0.
    const cota = (comp) => (t) => metros(L.min[comp] + t * (L.max[comp] - L.min[comp]));
    const invertir = this.boton('Invertir lado', () => { this.invertido = !this.invertido; this.aplicar(); });

    if (this.tipo === 'ninguno') {
      c.append(ayuda('Elige un tipo de corte. Planta corta en horizontal; los alzados, en vertical según los ejes del modelo; «Por cara» corta paralelo a la superficie que toques.'));
    } else if (this.tipo === 'planta' || this.tipo === 'x' || this.tipo === 'z') {
      const comp = COMPONENTE[this.tipo];
      const texto = this.tipo === 'planta' ? (t) => `cota ${cota(comp)(t)}` : cota(comp);
      c.append(this.deslizador('Posición del corte', this.posicion, (t) => { this.posicion = t; }, texto), invertir);
    } else if (this.tipo === 'cara') {
      if (this.esperandoCara || !this.cara) {
        c.append(ayuda('Toca una cara del modelo: un muro, una losa, un plafón… El corte se pone paralelo a ella.'));
      } else {
        const lado = L.getSize(new THREE.Vector3()).length();
        c.append(
          this.deslizador('Profundidad', 0.25, (t) => { this.desfase = (t - 0.25) * lado * 0.8; },
            (t) => metros((t - 0.25) * lado * 0.8)),
          invertir,
          this.boton('Elegir otra cara', () => this.poner('cara'))
        );
      }
    } else if (this.tipo === 'caja') {
      for (const [comp, nombre] of [['x', 'X'], ['y', 'Altura'], ['z', 'Z']]) {
        const desde = (t) => L.min[comp] + t * (L.max[comp] - L.min[comp]);
        c.append(
          this.deslizador(`${nombre} desde`, 0, (t) => {
            this.caja.min[comp] = Math.min(desde(t), this.caja.max[comp] - 0.01);
          }, (t) => metros(desde(t))),
          this.deslizador(`${nombre} hasta`, 1, (t) => {
            this.caja.max[comp] = Math.max(desde(t), this.caja.min[comp] + 0.01);
          }, (t) => metros(desde(t)))
        );
      }
      c.append(this.boton('Ajustar al elemento seleccionado', () => this.cajaAlElemento()));
    }
  }

  /* La caja se ciñe al elemento seleccionado, con un margen. */
  cajaAlElemento() {
    const id = this.visor.seleccion;
    const caja = id != null && this.visor.cajaDeElemento(id);
    if (!caja) {
      this.avisar('Selecciona antes un elemento del modelo.');
      return;
    }
    const margen = Math.max(caja.getSize(new THREE.Vector3()).length() * 0.15, 0.3);
    this.caja = caja.clone().expandByScalar(margen).intersect(this.limites);
    this.pintarControlesCaja();
    this.aplicar();
  }

  /* Recoloca los deslizadores de la caja después de ajustarla. */
  pintarControlesCaja() {
    const L = this.limites;
    const entradas = this.nodos.controles.querySelectorAll('input[type=range]');
    const valores = [];
    for (const comp of ['x', 'y', 'z']) {
      const t = (v) => (v - L.min[comp]) / (L.max[comp] - L.min[comp]);
      valores.push(t(this.caja.min[comp]), t(this.caja.max[comp]));
    }
    entradas.forEach((e, i) => {
      e.value = String(Math.round(valores[i] * PASOS));
      const lectura = e.parentNode.querySelector('.corte-valor');
      const comp = ['x', 'y', 'z'][i >> 1];
      lectura.textContent = metros(i % 2 ? this.caja.max[comp] : this.caja.min[comp]);
    });
  }

  quitar() {
    this.poner('ninguno');
  }

  /* En realidad aumentada no hay cortes ni lámina. */
  ocultarAyudas(si) {
    if (si) {
      this.lamina.visible = false;
      this.marcoCaja.visible = false;
    } else {
      this.aplicar();
    }
  }
}
