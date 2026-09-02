/* Service worker: deja la aplicación entera en el teléfono para que abra
   sin cobertura. El modelo IFC no se guarda aquí sino en IndexedDB, que
   admite archivos grandes sin límites de caché. */

const VERSION = 'e04-v1';
const PIEZAS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './js/app.js',
  './js/visor.js',
  './js/ar.js',
  './js/interfaz.js',
  './js/almacen.js',
  './js/ifc-worker.js',
  './vendor/three/three.module.min.js',
  './vendor/three/three.core.min.js',
  './vendor/three/OrbitControls.js',
  './vendor/web-ifc/web-ifc-api.js',
  './vendor/web-ifc/web-ifc.wasm',
  './ejemplo.ifc',
  './icono-192.png',
  './icono-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cacheado = await caches.open(VERSION);
    // Una pieza que falle no debe tumbar la instalación entera.
    await Promise.all(PIEZAS.map((p) => cacheado.add(p).catch(() => {})));
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

  ev.respondWith((async () => {
    const guardado = await caches.match(peticion, { ignoreSearch: true });
    if (guardado) return guardado;
    try {
      const respuesta = await fetch(peticion);
      if (respuesta.ok && respuesta.type === 'basic') {
        const cacheado = await caches.open(VERSION);
        cacheado.put(peticion, respuesta.clone());
      }
      return respuesta;
    } catch (e) {
      if (peticion.mode === 'navigate') {
        const inicio = await caches.match('./index.html');
        if (inicio) return inicio;
      }
      throw e;
    }
  })());
});
