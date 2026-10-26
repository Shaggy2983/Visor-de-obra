/* Service worker: deja la aplicación entera en el teléfono para que abra
   sin cobertura. El modelo IFC no se guarda aquí sino en IndexedDB, que
   admite archivos grandes sin límites de caché. */

const VERSION = 'crd-v44';
const PIEZAS = [
  './',
  './index.html',
  './visita.html',
  './oauth.html',
  './mudanza.html',
  './js/mudanza.js',
  './privacidad.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './css/visita.css',
  './js/app.js',
  './js/visor.js',
  './js/ar.js',
  './js/interfaz.js',
  './js/almacen.js',
  './js/partes.js',
  './js/visita.js',
  './js/utiles.js',
  './js/planos.js',
  './js/repasos.js',
  './js/medir.js',
  './js/cortes.js',
  './js/colores.js',
  './js/bienvenida.js',
  './js/firebase-config.js',
  './js/firebase-app.js',
  './js/equipo.js',
  './js/equipo-ui.js',
  './js/mis-repasos.js',
  './vendor/firebase/firebase.js',
  './js/informe-interactivo.js',
  './js/cuentas.js',
  './js/cuentas-config.js',
  './js/nube.js',
  './js/dictado.js',
  './js/predictivo.js',
  './js/clima.js',
  './js/horas.js',
  './js/tema.js',
  './js/menu.js',
  './calidad.html',
  './css/calidad.css',
  './js/calidad.js',
  './js/calidad-datos.js',
  './js/impreso.js',
  './js/firmas.js',
  './seguimiento.html',
  './css/seguimiento.css',
  './js/seguimiento.js',
  './js/seguimiento-datos.js',
  './control.html',
  './css/control.css',
  './js/control.js',
  './js/control-datos.js',
  './js/exportar.js',
  './ayuda.html',
  './js/ayuda.js',
  './js/guia.js',
  './js/dxf.js',
  './js/dxf-worker.js',
  './js/medir-plano.js',
  './vendor/dxf/dxf-parser.js',
  './panel.html',
  './perfil.html',
  './css/panel.css',
  './js/panel.js',
  './js/perfil.js',
  './js/resumen.js',
  './js/novedades.js',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './js/ifc-worker.js',
  './vendor/three/three.module.min.js',
  './vendor/three/three.core.min.js',
  './vendor/three/OrbitControls.js',
  './vendor/web-ifc/web-ifc-api.js',
  './vendor/web-ifc/web-ifc.wasm',
  './ejemplo.ifc',
  './vendor/inter/inter-latin-wght-normal.woff2',
  './marca/favicon.svg',
  './icono-192.png',
  './icono-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cacheado = await caches.open(VERSION);
    // Cada pieza se pide con «?v=VERSION»: así ni la caché del navegador ni
    // la de GitHub Pages (CDN, hasta 10 min) devuelven la copia anterior
    // justo después de publicar. Se guarda con su dirección limpia.
    // Una pieza que falle no debe tumbar la instalación entera.
    await Promise.all(PIEZAS.map(async (p) => {
      try {
        const url = `${p}${p.includes('?') ? '&' : '?'}v=${VERSION}`;
        const r = await fetch(new Request(url, { cache: 'reload' }));
        if (r.ok) await cacheado.put(new Request(p), r);
      } catch (e) { /* se pedirá cuando haga falta */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    for (const nombre of await caches.keys()) {
      if (nombre !== VERSION) await caches.delete(nombre);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const peticion = ev.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== location.origin) return;

  // Páginas: primero la red (con señal se ve siempre lo último publicado);
  // sin señal o si tarda más de 4 s, lo guardado.
  if (peticion.mode === 'navigate') {
    ev.respondWith((async () => {
      const guardado = caches.match(peticion, { ignoreSearch: true });
      try {
        const red = fetch(peticion, { cache: 'no-cache' });
        const respuesta = await Promise.race([red, new Promise((_, no) => setTimeout(() => no(new Error('lento')), 4000))]);
        if (respuesta.ok && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(VERSION).then((c) => c.put(peticion, copia)).catch(() => {});
          return respuesta;
        }
        return (await guardado) || respuesta;
      } catch (e) {
        return (await guardado) || (await caches.match('./visita.html')) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // El resto (código, estilos, librerías): lo guardado de esta versión.
  ev.respondWith((async () => {
    const guardado = await caches.match(peticion, { ignoreSearch: true });
    if (guardado) return guardado;
    const respuesta = await fetch(peticion);
    if (respuesta.ok && respuesta.type === 'basic') {
      const cacheado = await caches.open(VERSION);
      cacheado.put(peticion, respuesta.clone());
    }
    return respuesta;
  })());
});
