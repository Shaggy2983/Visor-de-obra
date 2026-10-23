/* Tema de la app y aviso de versión nueva.

   Tema: «oscuro» (por defecto), «claro» o «auto» (el del teléfono). Se
   carga en el <head> antes que la página para que no parpadee. Se guarda
   sólo en este teléfono (localStorage «crd-tema»).

   El aspecto se elige en el menú del símbolo de COORDINATE (js/menu.js). */
(function () {
  var CLAVE = 'crd-tema';
  var TEMAS = ['oscuro', 'claro', 'auto'];
  var NOMBRES = { oscuro: 'Modo oscuro', claro: 'Modo claro', auto: 'Como el teléfono' };
  var raiz = document.documentElement;

  function leer() {
    try { var t = localStorage.getItem(CLAVE); return TEMAS.indexOf(t) >= 0 ? t : 'oscuro'; } catch (e) { return 'oscuro'; }
  }
  function esClaro(t) {
    return t === 'claro' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
  }
  function aplicar(t) {
    raiz.dataset.tema = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', esClaro(t) ? '#eef1f6' : '#121826');
    // Chrome en Android con «tema oscuro para sitios» oscurece por su cuenta
    // las páginas claras; «only light» se lo impide.
    var esquema = document.querySelector('meta[name="color-scheme"]');
    if (!esquema) {
      esquema = document.createElement('meta');
      esquema.name = 'color-scheme';
      (document.head || raiz).appendChild(esquema);
    }
    esquema.setAttribute('content', esClaro(t) ? 'only light' : 'dark');
  }
  function poner(t) {
    try { localStorage.setItem(CLAVE, t); } catch (e) { /* sin almacenamiento: sólo esta vez */ }
    aplicar(t);
  }

  aplicar(leer());
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: light)');
    var cambio = function () { if (leer() === 'auto') aplicar('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', cambio); else if (mq.addListener) mq.addListener(cambio);
  }

  /* --- versión nueva de la app ---
     El service worker sirve primero lo guardado (para ir sin señal); al
     publicarse una versión nueva, se instala en segundo plano. Cuando toma
     el control se ofrece recargar (sin cortar lo que se esté escribiendo:
     la visita se guarda al salir de la página). */
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    var avisado = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (avisado) return;
      avisado = true;
      var barra = document.createElement('button');
      barra.type = 'button';
      barra.className = 'aviso-version';
      barra.textContent = 'Hay una versión nueva de la app · Tocar para actualizar';
      barra.onclick = function () { location.reload(); };
      document.body.appendChild(barra);
    });
  }

  window.crdTema = {
    actual: leer,
    nombre: function (t) { return NOMBRES[t || leer()]; },
    poner: poner,
    abrirAjustes: function () { if (window.crdMenu) window.crdMenu.abrir(); },
    siguiente: function () {
      var t = TEMAS[(TEMAS.indexOf(leer()) + 1) % TEMAS.length];
      poner(t);
      return t;
    },
    pintarBoton: function () { aplicar(leer()); }
  };
})();
