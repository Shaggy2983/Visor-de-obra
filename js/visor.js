/* Escena 3D.

   La geometría llega del worker en lotes agrupados por color. Cada lote es
   una sola malla de three.js, así un modelo de decenas de miles de piezas
   se dibuja con unas pocas llamadas y el teléfono aguanta.

   Para saber qué elemento se ha tocado, cada lote guarda una tabla de
   rangos dentro de su buffer de índices. El mismo mecanismo sirve para
   ocultar elementos: se reescribe el buffer de índices dejando fuera los
   rangos que no toca mostrar. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const COLOR_SELECCION = 0x4ec9f0;

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

    this.escena = new THREE.Scene();
    this.escena.background = new THREE.Color(0x1b2127);

    this.camara = new THREE.PerspectiveCamera(60, 1, 0.05, 3000);
    this.camara.position.set(12, 10, 12);

    this.controles = new OrbitControls(this.camara, lienzo);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.screenSpacePanning = false;
    this.controles.maxPolarAngle = Math.PI * 0.495;

    const cielo = new THREE.HemisphereLight(0xd7e6f2, 0x3a3a34, 2.4);
    this.escena.add(cielo);
    this.sol = new THREE.DirectionalLight(0xfff4e6, 2.2);
    this.sol.position.set(1, 2, 1.5);
    this.escena.add(this.sol);

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

    this.plano = new THREE.Plane(new THREE.Vector3(0, -1, 0), Infinity);
    this.cortando = false;

    this.materialResalte = new THREE.MeshLambertMaterial({
      color: COLOR_SELECCION,
      emissive: 0x0d3a45,
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
  }

  dibujar(tiempo, marco) {
    if (this.alDibujar) this.alDibujar(tiempo, marco);
    if (!this.render.xr.isPresenting) this.controles.update();
    this.render.render(this.escena, this.camara);
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
      this.pivote.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.quitarResalte();
    this.lotes = [];
    this.porElemento.clear();
    this.seleccion = null;
    this.aislado = false;
    if (this.rejilla) {
      this.escena.remove(this.rejilla);
      this.rejilla.geometry.dispose();
      this.rejilla.material.dispose();
      this.rejilla = null;
    }
  }

  anadirLote({ color, posiciones, normales, indices, rangos }) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normales, 3));
    geo.setIndex(new THREE.BufferAttribute(indices.slice(), 1));

    const transparente = color.a < 0.98;
    const mat = new THREE.MeshLambertMaterial({
      side: THREE.DoubleSide,
      transparent: transparente,
      opacity: color.a,
      depthWrite: !transparente
    });
    mat.color.setRGB(color.r, color.g, color.b, THREE.SRGBColorSpace);

    const malla = new THREE.Mesh(geo, mat);
    malla.frustumCulled = false;
    malla.userData.indicesOriginales = indices;
    malla.userData.rangos = rangos;
    malla.userData.rangosVisibles = rangos;
    this.pivote.add(malla);
    this.lotes.push(malla);

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

    const paso = Math.pow(10, Math.round(Math.log10(tamano / 10)));
    const lado = Math.ceil((tamano * 2) / paso) * paso;
    this.rejilla = new THREE.GridHelper(lado, Math.min(lado / paso, 200), 0x3a4652, 0x2a333c);
    this.rejilla.material.transparent = true;
    this.rejilla.material.opacity = 0.5;
    this.escena.add(this.rejilla);

    this.encuadrar();
    return { tamano, alto: medidas.y };
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

  aplicarVisibilidad(esVisible) {
    this.esVisible = esVisible || (() => true);
    for (const malla of this.lotes) {
      const orig = malla.userData.indicesOriginales;
      const rangos = malla.userData.rangos;
      const nuevo = new Uint32Array(orig.length);
      const visibles = new Uint32Array(rangos.length);
      let n = 0;
      let v = 0;
      for (let i = 0; i < rangos.length; i += 3) {
        const id = rangos[i], inicio = rangos[i + 1], largo = rangos[i + 2];
        if (!this.esVisible(id)) continue;
        nuevo.set(orig.subarray(inicio, inicio + largo), n);
        visibles[v++] = id;
        visibles[v++] = n;
        visibles[v++] = largo;
        n += largo;
      }
      malla.userData.rangosVisibles = visibles.subarray(0, v);
      if (n > 0) {
        malla.geometry.setIndex(new THREE.BufferAttribute(nuevo.subarray(0, n), 1));
        malla.geometry.setDrawRange(0, n);
      }
      malla.visible = n > 0 && !this.aislado;
    }
    if (this.seleccion !== null && !this.esVisible(this.seleccion)) {
      this.seleccionar(null);
    }
  }

  aislar(encendido) {
    this.aislado = !!encendido && this.seleccion !== null;
    for (const m of this.lotes) {
      m.visible = !this.aislado && m.geometry.drawRange.count !== 0;
    }
    if (this.aislado) this.encuadrar(this.seleccion);
    return this.aislado;
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
    const choques = this.rayo.intersectObjects(objetivos, false);
    for (const c of choques) {
      if (this.cortando && this.plano.distanceToPoint(c.point) < 0) continue;
      const id = this.elementoDeCara(c.object, c.faceIndex);
      if (id !== null) return { id, punto: c.point };
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

  /* --------------------------------------------------------------- */
  /* corte horizontal                                                 */
  /* --------------------------------------------------------------- */

  cortar(altura) {
    if (altura === null) {
      this.cortando = false;
      this.render.clippingPlanes = [];
      return;
    }
    this.cortando = true;
    this.plano.constant = altura;
    this.render.clippingPlanes = [this.plano];
  }

  modoAR(encendido) {
    this.escena.background = encendido ? null : new THREE.Color(0x1b2127);
    if (this.rejilla) this.rejilla.visible = !encendido;
    this.controles.enabled = !encendido;
    if (encendido) this.cortar(null);
  }
}
