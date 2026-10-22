/* Tema de la app: «oscuro» (por defecto), «claro» o «auto» (el del
   teléfono). Se carga en el <head> antes que la página para que no
   parpadee. Se guarda sólo en este teléfono. */
(function () {
  var CLAVE = 'crd-tema';
  var TEMAS = ['oscuro', 'claro', 'auto'];
  var NOMBRES = { oscuro: 'Modo oscuro', claro: 'Modo claro', auto: 'Como el teléfono' };
  var ICONOS = { oscuro: '🌙', claro: '☀️', auto: '◐' };
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
    var b = document.getElementById('btn-tema');
    if (b) { b.textContent = ICONOS[t]; b.title = NOMBRES[t] + ' · tocar para cambiar'; b.setAttribute('aria-label', NOMBRES[t]); }
  }

  aplicar(leer());
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: light)');
    var cambio = function () { if (leer() === 'auto') aplicar('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', cambio); else if (mq.addListener) mq.addListener(cambio);
  }

  window.crdTema = {
    actual: leer,
    nombre: function (t) { return NOMBRES[t || leer()]; },
    siguiente: function () {
      var t = TEMAS[(TEMAS.indexOf(leer()) + 1) % TEMAS.length];
      try { localStorage.setItem(CLAVE, t); } catch (e) { /* sin almacenamiento: sólo esta vez */ }
      aplicar(t);
      return t;
    },
    pintarBoton: function () { aplicar(leer()); }
  };
})();
