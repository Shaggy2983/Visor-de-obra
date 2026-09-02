/* Realidad aumentada sobre WebXR.

   Flujo en obra: se abre la cámara, se busca una superficie (el suelo),
   aparece una retícula, y al tocar la pantalla el modelo queda anclado ahí.
   A partir de ese momento tocar la pantalla selecciona elementos, igual
   que en la vista 3D normal.

   Requiere un navegador con WebXR e 'immersive-ar' (Chrome sobre Android
   con ARCore). El WebView de un APK hecho con Capacitor normalmente NO lo
   expone: para eso está la ruta TWA descrita en apk/LEEME-APK.md. */

import * as THREE from 'three';

export async function arDisponible() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch (e) {
    return false;
  }
}

export class RealidadAumentada {
  constructor(visor, elementos) {
    this.visor = visor;
    this.capa = elementos.capa;
    this.mensaje = elementos.mensaje;
    this.ficha = elementos.ficha;
    this.alSeleccionar = elementos.alSeleccionar || (() => {});

    this.sesion = null;
    this.fuenteHit = null;
    this.colocado = false;
    this.escala = 1;

    this.reticula = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.11, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf0a04b, side: THREE.DoubleSide })
    );
    this.reticula.matrixAutoUpdate = false;
    this.reticula.visible = false;
    this.visor.escena.add(this.reticula);

    // Un toque sobre los botones del panel no debe colocar el modelo.
    this.capa.addEventListener('beforexrselect', (ev) => {
      if (ev.target.closest && ev.target.closest('button, .ar-ficha')) {
        ev.preventDefault();
      }
    });
  }

  async iniciar() {
    if (this.sesion) return;
    const sesion = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor', 'light-estimation'],
      domOverlay: { root: this.capa }
    });
    this.sesion = sesion;

    this.visor.render.xr.setReferenceSpaceType('local');
    await this.visor.render.xr.setSession(sesion);

    const espacioVisor = await sesion.requestReferenceSpace('viewer');
    this.fuenteHit = await sesion.requestHitTestSource({ space: espacioVisor });

    this.colocado = false;
    this.visor.modoAR(true);
    this.visor.ancla.visible = false;
    this.capa.hidden = false;
    this.decir('Apunta al suelo y mueve el teléfono despacio.');

    this.alTocar = (ev) => this.tocar(ev);
    sesion.addEventListener('select', this.alTocar);
    sesion.addEventListener('end', () => this.limpiar());

    this.visor.alDibujar = (t, marco) => this.marco(marco);
  }

  terminar() {
    if (this.sesion) this.sesion.end().catch(() => {});
  }

  limpiar() {
    this.sesion = null;
    this.fuenteHit = null;
    this.reticula.visible = false;
    this.visor.alDibujar = null;
    this.visor.ancla.visible = true;
    this.visor.modoAR(false);
    this.visor.ancla.position.set(0, 0, 0);
    this.visor.ancla.rotation.set(0, 0, 0);
    this.visor.ancla.scale.set(1, 1, 1);
    this.visor.redimensionar();
    this.capa.hidden = true;
    this.ficha.hidden = true;
    if (this.alTerminar) this.alTerminar();
  }

  decir(texto) {
    this.mensaje.textContent = texto;
  }

  marco(marco) {
    if (!marco || !this.fuenteHit || this.colocado) return;
    const espacio = this.visor.render.xr.getReferenceSpace();
    const golpes = marco.getHitTestResults(this.fuenteHit);
    if (!golpes.length) {
      this.reticula.visible = false;
      return;
    }
    const pose = golpes[0].getPose(espacio);
    if (!pose) return;
    this.reticula.visible = true;
    this.reticula.matrix.fromArray(pose.transform.matrix);
    this.ultimaPose = pose;
  }

  tocar(ev) {
    if (!this.colocado) {
      if (!this.reticula.visible || !this.ultimaPose) {
        this.decir('Todavía no encuentro una superficie. Mueve el teléfono.');
        return;
      }
      this.colocar();
      return;
    }
    this.seleccionarConRayo(ev);
  }

  colocar() {
    const m = new THREE.Matrix4().fromArray(this.ultimaPose.transform.matrix);
    const posicion = new THREE.Vector3().setFromMatrixPosition(m);

    const ancla = this.visor.ancla;
    ancla.position.copy(posicion);
    ancla.scale.setScalar(this.escala);

    // Girar el modelo para que su frente mire hacia quien sostiene el móvil.
    const camara = this.visor.render.xr.getCamera();
    const haciaCamara = new THREE.Vector3().setFromMatrixPosition(camara.matrixWorld).sub(posicion);
    ancla.rotation.set(0, Math.atan2(haciaCamara.x, haciaCamara.z), 0);

    ancla.visible = true;
    this.colocado = true;
    this.reticula.visible = false;
    this.decir('Colocado. Toca un elemento para ver sus datos.');
  }

  recolocar() {
    this.colocado = false;
    this.visor.ancla.visible = false;
    this.ficha.hidden = true;
    this.decir('Apunta al suelo y toca para colocarlo de nuevo.');
  }

  ponerEscala(escala) {
    this.escala = escala;
    if (this.colocado) this.visor.ancla.scale.setScalar(escala);
  }

  girar(radianes) {
    this.visor.ancla.rotation.y += radianes;
  }

  subir(metros) {
    this.visor.ancla.position.y += metros;
  }

  seleccionarConRayo(ev) {
    const marco = ev.frame;
    const espacio = this.visor.render.xr.getReferenceSpace();
    if (!marco || !ev.inputSource || !ev.inputSource.targetRaySpace) return;
    const pose = marco.getPose(ev.inputSource.targetRaySpace, espacio);
    if (!pose) return;

    const origen = new THREE.Vector3().copy(pose.transform.position);
    const direccion = new THREE.Vector3(0, 0, -1).applyQuaternion(
      new THREE.Quaternion().copy(pose.transform.orientation)
    );

    const golpe = this.visor.apuntarRayo(origen, direccion);
    this.alSeleccionar(golpe ? golpe.id : null);
  }
}
