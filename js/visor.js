/* Escena 3D.

   La geometría llega del worker en lotes agrupados por color. Cada lote es
   una sola malla de three.js, así un modelo de decenas de miles de piezas
   se dibuja con unas pocas llamadas y el teléfono aguanta.

   Para saber qué elemento se ha tocado, cada lote guarda una tabla de
   rangos dentro de su buffer de índices. El mismo mecanismo sirve para
   ocultar elementos: se reescribe el buffer de índices dejando fuera los
   rangos que no toca mostrar. Y para transparentarlos: cada lote tiene una
   malla «fantasma» con su propio buffer de índices, que dibuja con poca
   opacidad los elementos que toca ver en transparente.

   Los cortes son planos de recorte en los materiales del modelo (no en
   todo el renderizador, para que las cotas de medir no se corten). Una
   malla de relleno que sólo pinta caras traseras rellena de color lo
   cortado, como el poché de un plano. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const COLOR_SELECCION = 0x8ebdf0;   // acento 400 de la paleta Acero
const OPACIDAD_FANTASMA = 0.14;
const COLOR_RELLENO = 0x3d4a5f;
const ANGULO_ARISTA = 30;           // grados entre caras para dibujar arista

/* Fondos del visor. «oscuro» decide los colores de la rejilla. */
export const FONDOS = {
  acero: { nombre: 'Acero', color: '#1c2433', oscuro: true },
  degradado: { nombre: 'Azul noche', degradado: ['#2b4c7e', '#0b0f18'], oscuro: true },
  cielo: { nombre: 'Cielo', degradado: ['#8fbbe8', '#f1f5fa'], oscuro: false },
  gris: { nombre: 'Gris claro', color: '#d3d9e2', oscuro: false },
  blanco: { nombre: 'Blanco', color: '#ffffff', oscuro: false },
  negro: { nombre: 'Negro', color: '#06080c', oscuro: true }
};

/* Direcciones de cámara de las vistas rápidas (desde el centro del modelo). */
const VISTAS = {
  iso: [0.7, 0.55, 0.8],
  superior: [0, 1, 0.0001],
  frente: [0, 0.08, 1],
  detras: [0, 0.08, -1],
  derecha: [1, 0.08, 0],
  izquierda: [-1, 0.08, 0]
};

export class Visor {
  constructor(lienzo) {
    this.lienzo = lienzo;

    this.render = new THREE.WebGLRenderer({
      canvas: lienzo,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.render.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.render.localClippingEnabled = true;
    this.render.xr.enabled = true;
    this.render.toneMapping = THREE.NeutralToneMapping;
    this.render.toneMappingExposure = 1.05;

    this.escena = new THREE.Scene();
    this.fondo = 'acero';
    this.texturaFondo = null;

    this.camara = new THREE.PerspectiveCamera(60, 1, 0.05, 3000);
    this.camara.position.set(12, 10, 12);

    this.controles = new OrbitControls(this.camara, lienzo);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.screenSpacePanning = false;
    this.controles.maxPolarAngle = Math.PI * 0.495;

    // Luz de cielo y suelo, sol, un relleno desde el lado contrario para
    // que las fachadas en sombra no se queden planas, y una luz suave que
    // sale de la cámara para ver bien los interiores.
    this.cielo = new THREE.HemisphereLight(0xe4eef8, 0x4b4a44, 1.9);
    this.escena.add(this.cielo);
    this.sol = new THREE.DirectionalLight(0xfff2e0, 2.1);
    this.sol.position.set(1, 2, 1.5);
    this.escena.add(this.sol);
    this.relleno = new THREE.DirectionalLight(0xc8daf0, 0.55);
    this.relleno.position.set(-1.2, 0.8, -1);
    this.escena.add(this.relleno);
    this.luzCamara = new THREE.DirectionalLight(0xffffff, 0.45);
    this.luzCamara.position.set(0, 0, 1);
    this.camara.add(this.luzCamara);
    this.escena.add(this.camara);

    // ancla ← raíz (recentra el modelo) ← pivote ← mallas.
    // web-ifc ya devuelve la geometría con la Y hacia arriba, de modo que
    // aquí no hace falta ningún giro de ejes.
    this.ancla = new THREE.Group();
    this.raiz = new THREE.Group();
    this.pivote = new THREE.Group();
    this.raiz.add(this.pivote);
    this.ancla.add(this.raiz);
    this.escena.add(this.ancla);

    this.rejilla = null;
    this.lotes = [];
    this.porElemento = new Map();   // expressID → [{malla, inicio, largo}]
    this.resaltados = [];
    this.seleccion = null;
    this.aislado = false;
    this.esVisible = () => true;

    this.planos = [];               // planos de corte activos
    this.conRelleno = true;
    this.opacidad = 1;              // opacidad general del modelo
    this.esTransparente = () => false;
    this.aristas = null;            // null: sin calcular
    this.verAristas = false;
    this.materialArista = new THREE.LineBasicMaterial({ color: 0x0a0e15, transparent: true, opacity: 0.5 });
    this.materialRelleno = new THREE.MeshBasicMaterial({
      color: COLOR_RELLENO,
      side: THREE.BackSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    });

    this.materialResalte = new THREE.MeshLambertMaterial({
      color: COLOR_SELECCION,
      emissive: 0x22436f,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    this.rayo = new THREE.Raycaster();
    this.caja = new THREE.Box3();

    this._alRedimensionar = () => this.redimensionar();
    addEventListener('resize', this._alRedimensionar);
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', this._alRedimensionar);
    }
    this.redimensionar();

    this.render.setAnimationLoop((t, marco) => this.dibujar(t, marco));
    this.alDibujar = null;
    this.trasDibujar = [];          // funciones que siguen a la cámara (etiquetas)
    this.ponerFondo(this.fondo);
  }

  dibujar(tiempo, marco) {
    if (this.alDibujar) this.alDibujar(tiempo, marco);
    if (!this.render.xr.isPresenting) this.controles.update();
    this.render.render(this.escena, this.camara);
    for (const f of this.trasDibujar) f();
  }

  redimensionar() {
    const ancho = this.lienzo.clientWidth || innerWidth;
    const alto = this.lienzo.clientHeight || innerHeight;
    this.render.setSize(ancho, alto, false);
    this.camara.aspect = ancho / Math.max(alto, 1);
    this.camara.updateProjectionMatrix();
  }

  /* --------------------------------------------------------------- */
  /* carga de lotes                                                   */
  /* --------------------------------------------------------------- */

  vaciar() {
    for (const m of this.lotes) {
      const { fantasma, relleno } = m.userData;
      this.pivote.remove(m, fantasma, relleno);
      m.geometry.dispose();
      m.material.dispose();
      fantasma.geometry.dispose();
      fantasma.material.dispose();
    }
    this.quitarAristas();
    this.quitarResalte();
    this.lotes = [];
    this.porElemento.clear();
    this.seleccion = null;
    this.aislado = false;
    this.esVisible = () => true;
    this.esTransparente = () => false;
    this.planos = [];
    this.quitarRejilla();
  }

  quitarRejilla() {
    if (!this.rejilla) return;
    this.escena.remove(this.rejilla);
    this.rejilla.geometry.dispose();
    this.rejilla.material.dispose();
    this.rejilla = null;
  }

  anadirLote({ color, posiciones, normales, indices, rangos }) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normales, 3));
    geo.setIndex(new THREE.BufferAttribute(indices.slice(), 1));

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.color.setRGB(color.r, color.g, color.b, THREE.SRGBColorSpace);
    mat.userData.opacidad = color.a;
    mat.userData.color = mat.color.clone();

    const malla = new THREE.Mesh(geo, mat);
    malla.frustumCulled = false;
    malla.userData.indicesOriginales = indices;
    malla.userData.rangos = rangos;
    malla.userData.rangosVisibles = rangos;

    // Misma geometría, otro buffer de índices: lo que se ve en transparente.
    const geoFantasma = new THREE.BufferGeometry();
    geoFantasma.setAttribute('position', geo.attributes.position);
    geoFantasma.setAttribute('normal', geo.attributes.normal);
    const fantasma = new THREE.Mesh(geoFantasma, new THREE.MeshLambertMaterial({
      color: mat.color, side: THREE.DoubleSide, transparent: true,
      opacity: OPACIDAD_FANTASMA, depthWrite: false
    }));
    fantasma.frustumCulled = false;
    fantasma.visible = false;
    fantasma.renderOrder = 1;

    // Comparte la geometría de la malla: oculta y muestra lo mismo que ella.
    const relleno = new THREE.Mesh(geo, this.materialRelleno);
    relleno.frustumCulled = false;
    relleno.visible = false;

    malla.userData.fantasma = fantasma;
    malla.userData.relleno = relleno;
    this.pivote.add(malla, fantasma, relleno);
    this.lotes.push(malla);
    this.ajustarMaterial(mat);
    this.ajustarCortes(fantasma.material);

    for (let i = 0; i < rangos.length; i += 3) {
      const id = rangos[i];
      let trozos = this.porElemento.get(id);
      if (!trozos) this.porElemento.set(id, (trozos = []));
      trozos.push({ malla, inicio: rangos[i + 1], largo: rangos[i + 2] });
    }
  }

  /* Recentra el modelo sobre el origen, apoyado en el suelo, y prepara
     la rejilla y el encuadre. Se llama una vez terminada la carga. */
  asentar() {
    this.raiz.position.set(0, 0, 0);
    this.ancla.position.set(0, 0, 0);
    this.ancla.scale.set(1, 1, 1);
    this.ancla.quaternion.identity();
    this.pivote.updateMatrixWorld(true);

    const caja = new THREE.Box3().setFromObject(this.pivote);
    if (caja.isEmpty()) return { tamano: 1, alto: 1 };

    const centro = caja.getCenter(new THREE.Vector3());
    this.raiz.position.set(-centro.x, -caja.min.y, -centro.z);

    const medidas = caja.getSize(new THREE.Vector3());
    const tamano = Math.max(medidas.x, medidas.y, medidas.z, 1);
    this.tamano = tamano;
    this.alto = medidas.y;

    this.camara.far = tamano * 30;
    this.camara.near = Math.max(tamano / 5000, 0.02);
    this.camara.updateProjectionMatrix();
    this.sol.position.set(tamano, tamano * 1.6, tamano * 0.8);

    this.crearRejilla();
    this.encuadrar();
    return { tamano, alto: medidas.y };
  }

  crearRejilla() {
    const visible = this.rejilla ? this.rejilla.visible : true;
    this.quitarRejilla();
    if (!this.tamano) return;
    const paso = Math.pow(10, Math.round(Math.log10(this.tamano / 10)));
    const lado = Math.ceil((this.tamano * 2) / paso) * paso;
    const [fuerte, suave] = FONDOS[this.fondo].oscuro ? [0x3a4a66, 0x263147] : [0x8a97ab, 0xb9c2cf];
    this.rejilla = new THREE.GridHelper(lado, Math.min(lado / paso, 200), fuerte, suave);
    this.rejilla.material.transparent = true;
    this.rejilla.material.opacity = 0.5;
    this.rejilla.visible = visible && !this.render.xr.isPresenting;
    this.escena.add(this.rejilla);
  }

  /* Caja del modelo en coordenadas de mundo (lo que esté a la vista). */
  cajaModelo() {
    this.pivote.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    for (const m of this.lotes) caja.expandByObject(m);
    return caja;
  }

  /* --------------------------------------------------------------- */
  /* entorno: fondo, rejilla, vistas                                  */
  /* --------------------------------------------------------------- */

  ponerFondo(clave) {
    const fondo = FONDOS[clave] || FONDOS.acero;
    this.fondo = FONDOS[clave] ? clave : 'acero';
    if (this.texturaFondo) { this.texturaFondo.dispose(); this.texturaFondo = null; }
    if (fondo.degradado) {
      const lienzo = document.createElement('canvas');
      lienzo.width = 2;
      lienzo.height = 256;
      const ctx = lienzo.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, fondo.degradado[0]);
      g.addColorStop(1, fondo.degradado[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 2, 256);
      this.texturaFondo = new THREE.CanvasTexture(lienzo);
      this.texturaFondo.colorSpace = THREE.SRGBColorSpace;
    }
    if (!this.render.xr.isPresenting) {
      this.escena.background = this.texturaFondo || new THREE.Color(fondo.color);
    }
    // Sobre fondo claro las aristas negras se ven de más: se aclaran.
    this.materialArista.opacity = fondo.oscuro ? 0.55 : 0.4;
    if (this.rejilla) this.crearRejilla();
  }

  mostrarRejilla(si) {
    if (this.rejilla) this.rejilla.visible = si;
  }

  vista(nombre) {
    const d = VISTAS[nombre];
    if (!d) return;
    const caja = this.cajaModelo();
    if (caja.isEmpty()) return;
    const centro = caja.getCenter(new THREE.Vector3());
    const radio = Math.max(caja.getSize(new THREE.Vector3()).length() / 2, 0.5);
    const vertical = (this.camara.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camara.aspect);
    const distancia = (radio / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.1;
    const direccion = new THREE.Vector3(...d).normalize();
    this.camara.position.copy(centro).addScaledVector(direccion, distancia);
    this.controles.target.copy(centro);
    this.controles.update();
  }

  /* --------------------------------------------------------------- */
  /* materiales: opacidad general y planos de corte                    */
  /* --------------------------------------------------------------- */

  ajustarMaterial(mat) {
    const opacidad = mat.userData.opacidad * this.opacidad;
    const transparente = opacidad < 0.98;
    if (mat.transparent !== transparente) mat.needsUpdate = true;
    mat.transparent = transparente;
    mat.opacity = opacidad;
    mat.depthWrite = !transparente;
    this.ajustarCortes(mat);
  }

  ajustarCortes(mat) {
    const planos = this.planos.length ? this.planos : null;
    const antes = mat.clippingPlanes ? mat.clippingPlanes.length : 0;
    if (antes !== this.planos.length) mat.needsUpdate = true;
    mat.clippingPlanes = planos;
  }

  /* 0.1 (casi invisible) … 1 (opaco). */
  ponerOpacidad(valor) {
    this.opacidad = Math.min(1, Math.max(0.05, valor));
    for (const m of this.lotes) this.ajustarMaterial(m.material);
  }

  /* planos: THREE.Plane en coordenadas de mundo; se ve lo que queda del
     lado positivo de todos. [] quita el corte. */
  ponerCortes(planos) {
    this.planos = planos || [];
    for (const m of this.lotes) {
      this.ajustarCortes(m.material);
      this.ajustarCortes(m.userData.fantasma.material);
    }
    this.ajustarCortes(this.materialRelleno);
    this.ajustarCortes(this.materialResalte);
    this.ajustarCortes(this.materialArista);
    this.refrescarRelleno();
  }

  ponerRelleno(si) {
    this.conRelleno = si;
    this.refrescarRelleno();
  }

  refrescarRelleno() {
    const ver = this.conRelleno && this.planos.length > 0 && !this.aislado;
    for (const m of this.lotes) m.userData.relleno.visible = ver && m.visible;
  }

  /* El punto se ve si no lo quita ningún plano de corte. */
  dentroDelCorte(punto) {
    return this.planos.every((p) => p.distanceToPoint(punto) >= -1e-4);
  }

  encuadrar(objeto) {
    const caja = objeto
      ? this.cajaDeElemento(objeto)
      : new THREE.Box3().setFromObject(this.ancla);
    if (!caja || caja.isEmpty()) return;

    const centro = caja.getCenter(new THREE.Vector3());
    const radio = Math.max(caja.getSize(new THREE.Vector3()).length() / 2, 0.5);

    // En un teléfono en vertical el campo de visión horizontal es mucho más
    // estrecho que el vertical: si sólo se mira el vertical, el modelo se
    // sale por los lados. Manda el más estrecho de los dos.
    const vertical = (this.camara.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camara.aspect);
    const distancia = (radio / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.2;

    const direccion = new THREE.Vector3(0.7, 0.55, 0.8).normalize();
    this.camara.position.copy(centro).addScaledVector(direccion, distancia);
    this.controles.target.copy(centro);
    this.controles.update();
  }

  cajaDeElemento(id) {
    const trozos = this.porElemento.get(id);
    if (!trozos || !trozos.length) return null;
    const caja = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const t of trozos) {
      const pos = t.malla.geometry.attributes.position.array;
      const ind = t.malla.userData.indicesOriginales;
      for (let i = t.inicio; i < t.inicio + t.largo; i++) {
        const o = ind[i] * 3;
        caja.expandByPoint(v.set(pos[o], pos[o + 1], pos[o + 2]));
      }
    }
    this.pivote.updateMatrixWorld(true);
    return caja.applyMatrix4(this.pivote.matrixWorld);
  }

  /* --------------------------------------------------------------- */
  /* visibilidad                                                      */
  /* --------------------------------------------------------------- */

  /* esVisible(id): se dibuja; esTransparente(id): se dibuja en fantasma.
     Sin argumentos se reaplican los criterios que ya había. */
  aplicarVisibilidad(esVisible = this.esVisible, esTransparente = this.esTransparente) {
    this.esVisible = esVisible || (() => true);
    this.esTransparente = esTransparente || (() => false);
    for (const malla of this.lotes) {
      const orig = malla.userData.indicesOriginales;
      const rangos = malla.userData.rangos;
      const solido = new Uint32Array(orig.length);
      const tenue = new Uint32Array(orig.length);
      const visibles = new Uint32Array(rangos.length);
      let n = 0, t = 0, v = 0;
      for (let i = 0; i < rangos.length; i += 3) {
        const id = rangos[i], inicio = rangos[i + 1], largo = rangos[i + 2];
        if (!this.esVisible(id)) continue;
        if (this.esTransparente(id)) {
          tenue.set(orig.subarray(inicio, inicio + largo), t);
          t += largo;
          continue;
        }
        solido.set(orig.subarray(inicio, inicio + largo), n);
        visibles[v++] = id;
        visibles[v++] = n;
        visibles[v++] = largo;
        n += largo;
      }
      malla.userData.rangosVisibles = visibles.subarray(0, v);
      if (n > 0) {
        malla.geometry.setIndex(new THREE.BufferAttribute(solido.subarray(0, n), 1));
        malla.geometry.setDrawRange(0, n);
      } else {
        malla.geometry.setDrawRange(0, 0);
      }
      const fantasma = malla.userData.fantasma;
      if (t > 0) {
        fantasma.geometry.setIndex(new THREE.BufferAttribute(tenue.subarray(0, t), 1));
        fantasma.geometry.setDrawRange(0, t);
      }
      malla.userData.hayFantasma = t > 0;
    }
    this.refrescarVisibles();
    this.filtrarAristas();
    if (this.seleccion !== null && !this.esVisible(this.seleccion)) {
      this.seleccionar(null);
    }
  }

  refrescarVisibles() {
    for (const m of this.lotes) {
      m.visible = !this.aislado && m.geometry.drawRange.count !== 0;
      m.userData.fantasma.visible = !this.aislado && m.userData.hayFantasma;
    }
    if (this.aristas) {
      for (const a of this.aristas) a.visible = this.verAristas && !this.aislado && a.geometry.drawRange.count !== 0;
    }
    this.refrescarRelleno();
  }

  aislar(encendido) {
    this.aislado = !!encendido && this.seleccion !== null;
    this.refrescarVisibles();
    if (this.aislado) this.encuadrar(this.seleccion);
    return this.aislado;
  }

  /* --------------------------------------------------------------- */
  /* colorear por propiedad                                           */
  /* --------------------------------------------------------------- */

  /* colorDe(id) → THREE.Color, o null para dejar su color propio.
     Sin función se vuelve a los colores del modelo. Se pinta con colores
     por vértice: la geometría de cada elemento es suya en el lote. */
  colorear(colorDe) {
    const blanco = new THREE.Color(1, 1, 1);
    for (const m of this.lotes) {
      const geo = m.geometry;
      const original = m.material.userData.color;
      if (colorDe) {
        let atributo = geo.attributes.color;
        if (!atributo) {
          atributo = new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3);
          geo.setAttribute('color', atributo);
          m.userData.fantasma.geometry.setAttribute('color', atributo);
        }
        const c = atributo.array;
        const ind = m.userData.indicesOriginales;
        const rangos = m.userData.rangos;
        for (let i = 0; i < rangos.length; i += 3) {
          const color = colorDe(rangos[i]) || original;
          for (let k = rangos[i + 1], fin = k + rangos[i + 2]; k < fin; k++) {
            const o = ind[k] * 3;
            c[o] = color.r; c[o + 1] = color.g; c[o + 2] = color.b;
          }
        }
        atributo.needsUpdate = true;
      }
      for (const mat of [m.material, m.userData.fantasma.material]) {
        if (mat.vertexColors !== !!colorDe) mat.needsUpdate = true;
        mat.vertexColors = !!colorDe;
        mat.color.copy(colorDe ? blanco : original);
      }
    }
  }

  /* --------------------------------------------------------------- */
  /* aristas: se calculan la primera vez que se piden                 */
  /* --------------------------------------------------------------- */

  quitarAristas() {
    for (const a of this.aristas || []) {
      this.pivote.remove(a);
      a.geometry.dispose();
    }
    this.aristas = null;
  }

  async mostrarAristas(si, alAvanzar) {
    this.verAristas = si;
    if (si && !this.aristas) {
      const aristas = [];
      const limite = Math.cos((ANGULO_ARISTA * Math.PI) / 180);
      for (let i = 0; i < this.lotes.length; i++) {
        aristas.push(aristasDeLote(this.lotes[i], limite));
        if (alAvanzar) alAvanzar(Math.round(((i + 1) / this.lotes.length) * 100));
        // Un respiro entre lotes para que la pantalla no se congele.
        await new Promise((cumplir) => setTimeout(cumplir, 0));
        if (!this.verAristas || !this.lotes.length) return;
      }
      this.aristas = aristas.map(({ posiciones, rangos }) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
        const lineas = new THREE.LineSegments(geo, this.materialArista);
        lineas.frustumCulled = false;
        lineas.userData.rangos = rangos;
        lineas.renderOrder = 1;
        this.pivote.add(lineas);
        return lineas;
      });
      this.filtrarAristas();
    }
    this.refrescarVisibles();
  }

  filtrarAristas() {
    if (!this.aristas) return;
    for (const lineas of this.aristas) {
      const rangos = lineas.userData.rangos;
      const total = lineas.geometry.attributes.position.count;
      const indices = new Uint32Array(total);
      let n = 0;
      for (let i = 0; i < rangos.length; i += 3) {
        const id = rangos[i];
        if (!this.esVisible(id) || this.esTransparente(id)) continue;
        for (let k = rangos[i + 1], fin = k + rangos[i + 2]; k < fin; k++) indices[n++] = k;
      }
      lineas.geometry.setIndex(new THREE.BufferAttribute(indices.subarray(0, n), 1));
      lineas.geometry.setDrawRange(0, n);
    }
  }

  /* --------------------------------------------------------------- */
  /* selección                                                        */
  /* --------------------------------------------------------------- */

  quitarResalte() {
    for (const r of this.resaltados) {
      this.pivote.remove(r);
      r.geometry.dispose();
    }
    this.resaltados = [];
  }

  seleccionar(id) {
    this.quitarResalte();
    this.seleccion = id;
    if (id === null || id === undefined) {
      if (this.aislado) this.aislar(false);
      return;
    }
    const trozos = this.porElemento.get(id);
    if (!trozos) return;

    const porMalla = new Map();
    for (const t of trozos) {
      let lista = porMalla.get(t.malla);
      if (!lista) porMalla.set(t.malla, (lista = []));
      lista.push(t);
    }

    for (const [malla, lista] of porMalla) {
      let total = 0;
      for (const t of lista) total += t.largo;
      const indices = new Uint32Array(total);
      const orig = malla.userData.indicesOriginales;
      let n = 0;
      for (const t of lista) {
        indices.set(orig.subarray(t.inicio, t.inicio + t.largo), n);
        n += t.largo;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', malla.geometry.attributes.position);
      geo.setAttribute('normal', malla.geometry.attributes.normal);
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      const resalte = new THREE.Mesh(geo, this.materialResalte);
      resalte.frustumCulled = false;
      resalte.renderOrder = 2;
      this.pivote.add(resalte);
      this.resaltados.push(resalte);
    }
  }

  /* Devuelve el expressID bajo un punto de pantalla normalizado (-1..1),
     o null si no hay nada. */
  apuntar(x, y) {
    this.rayo.setFromCamera(new THREE.Vector2(x, y), this.camara);
    return this.primerElemento();
  }

  /* Igual, pero con un rayo dado en coordenadas de mundo (se usa en AR). */
  apuntarRayo(origen, direccion) {
    this.rayo.set(origen, direccion);
    return this.primerElemento();
  }

  primerElemento() {
    const objetivos = this.aislado ? this.resaltados : this.lotes;
    const choques = this.rayo.intersectObjects(objetivos.filter((o) => o.visible), false);
    for (const c of choques) {
      if (!this.dentroDelCorte(c.point)) continue;
      const id = this.aislado ? this.seleccion : this.elementoDeCara(c.object, c.faceIndex);
      if (id === null) continue;
      // Normal y vértices del triángulo tocado, en mundo: para cortar por
      // una cara y para que la regla se pegue a las esquinas.
      const mundo = c.object.matrixWorld;
      const pos = c.object.geometry.attributes.position;
      const vertice = (i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mundo);
      const normal = c.face.normal.clone().transformDirection(mundo);
      if (normal.dot(this.rayo.ray.direction) > 0) normal.negate();
      return {
        id,
        punto: c.point,
        normal,
        triangulo: [vertice(c.face.a), vertice(c.face.b), vertice(c.face.c)]
      };
    }
    return null;
  }

  elementoDeCara(malla, cara) {
    const rangos = malla.userData.rangosVisibles;
    if (!rangos) return null;
    const posicion = cara * 3;
    let bajo = 0;
    let alto = rangos.length / 3 - 1;
    while (bajo <= alto) {
      const medio = (bajo + alto) >> 1;
      const inicio = rangos[medio * 3 + 1];
      const largo = rangos[medio * 3 + 2];
      if (posicion < inicio) alto = medio - 1;
      else if (posicion >= inicio + largo) bajo = medio + 1;
      else return rangos[medio * 3];
    }
    return null;
  }

  modoAR(encendido) {
    if (encendido) {
      this.escena.background = null;
      this.rejillaAntesAR = this.rejilla ? this.rejilla.visible : true;
      if (this.rejilla) this.rejilla.visible = false;
      this.cortesAntesAR = this.planos;
      this.ponerCortes([]);
    } else {
      this.ponerFondo(this.fondo);
      if (this.rejilla) this.rejilla.visible = this.rejillaAntesAR !== false;
      if (this.cortesAntesAR) this.ponerCortes(this.cortesAntesAR);
      this.cortesAntesAR = null;
    }
    this.controles.enabled = !encendido;
  }
}

/* Aristas de un lote: los bordes entre caras que forman más de
   ANGULO_ARISTA grados, y los bordes sueltos. Se buscan elemento por
   elemento (así se pueden ocultar con él) uniendo los vértices repetidos
   por posición, que web-ifc duplica en cada cara. */
function aristasDeLote(malla, limite) {
  const pos = malla.geometry.attributes.position.array;
  const ind = malla.userData.indicesOriginales;
  const rangos = malla.userData.rangos;
  const salida = [];
  const rangosSalida = [];
  const ids = new Map();
  const lados = new Map();
  const normales = [];
  for (let r = 0; r < rangos.length; r += 3) {
    const inicio = rangos[r + 1], fin = inicio + rangos[r + 2];
    ids.clear();
    lados.clear();
    normales.length = 0;
    const primero = [];
    const idDe = (v) => {
      const o = v * 3;
      const clave = `${Math.round(pos[o] * 1000)},${Math.round(pos[o + 1] * 1000)},${Math.round(pos[o + 2] * 1000)}`;
      let id = ids.get(clave);
      if (id === undefined) { id = ids.size; ids.set(clave, id); primero.push(o); }
      return id;
    };
    for (let i = inicio; i < fin; i += 3) {
      const a = ind[i] * 3, b = ind[i + 1] * 3, c = ind[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;   // triángulo degenerado
      nx /= l; ny /= l; nz /= l;
      const cara = normales.length;
      normales.push(nx, ny, nz);
      const v = [idDe(ind[i]), idDe(ind[i + 1]), idDe(ind[i + 2])];
      for (let k = 0; k < 3; k++) {
        const p = v[k], q = v[(k + 1) % 3];
        if (p === q) continue;
        const clave = p < q ? p * 2097152 + q : q * 2097152 + p;
        const lado = lados.get(clave);
        if (lado === undefined) {
          lados.set(clave, { p, q, cara, veces: 1, vivo: true });
        } else {
          lado.veces++;
          const o = lado.cara * 3;
          const dot = normales[o] * nx + normales[o + 1] * ny + normales[o + 2] * nz;
          lado.vivo = lado.veces > 2 || Math.abs(dot) < limite;
        }
      }
    }
    const desde = salida.length / 3;
    for (const lado of lados.values()) {
      if (lado.veces > 1 && !lado.vivo) continue;
      const a = primero[lado.p], b = primero[lado.q];
      salida.push(pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2]);
    }
    const cuantos = salida.length / 3 - desde;
    if (cuantos) rangosSalida.push(rangos[r], desde, cuantos);
  }
  return { posiciones: new Float32Array(salida), rangos: rangosSalida };
}
