/* Tema de la app y ventana de Ajustes.

   Tema: «oscuro» (por defecto), «claro» o «auto» (el del teléfono). Se
   carga en el <head> antes que la página para que no parpadee. Se guarda
   sólo en este teléfono (localStorage «crd-tema»).

   Ajustes: el botón ⚙️ de la cabecera (#btn-tema) abre una ventana con el
   aspecto (tres opciones a la vista) y accesos a Visitas, Panel, Perfil y
   Modelo 3D. Es independiente de cada página: sirve igual en todas. */
(function () {
  var CLAVE = 'crd-tema';
  var TEMAS = ['oscuro', 'claro', 'auto'];
  var NOMBRES = { oscuro: 'Modo oscuro', claro: 'Modo claro', auto: 'Como el teléfono' };
  var ICONOS = { oscuro: '🌙', claro: '☀️', auto: '◐' };
  var AYUDA = {
    oscuro: 'Fondo oscuro: descansa la vista y gasta menos batería.',
    claro: 'Fondo claro: se lee mejor a pleno sol.',
    auto: 'Cambia solo según el modo del teléfono.'
  };
  var ATAJOS = [
    ['visita.html', '📋', 'Visitas'],
    ['panel.html', '📊', 'Panel del equipo'],
    ['perfil.html', '👤', 'Mi perfil y mis obras'],
    ['index.html', '🧊', 'Modelo 3D (IFC)'],
    ['ayuda.html', '❓', 'Guía de uso']
  ];
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
    var b = document.getElementById('btn-tema');
    if (b) { b.textContent = '⚙️'; b.title = 'Ajustes · ' + NOMBRES[t]; b.setAttribute('aria-label', 'Ajustes'); }
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

  /* --- ventana de Ajustes --- */

  function nodo(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  var dialogo = null;
  function abrirAjustes() {
    if (!dialogo) {
      dialogo = nodo('dialog', 'ajustes');
      dialogo.setAttribute('aria-label', 'Ajustes');
      dialogo.addEventListener('click', function (ev) { if (ev.target === dialogo) dialogo.close(); });
      document.body.appendChild(dialogo);
    }
    var actual = leer();
    dialogo.textContent = '';

    var cabecera = nodo('div', 'ajustes-cabecera');
    cabecera.appendChild(nodo('h2', '', 'Ajustes'));
    var cerrar = nodo('button', 'boton', '✕');
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.onclick = function () { dialogo.close(); };
    cabecera.appendChild(cerrar);
    dialogo.appendChild(cabecera);

    var cuerpo = nodo('div', 'ajustes-cuerpo');
    cuerpo.appendChild(nodo('h3', '', 'Aspecto'));
    var opciones = nodo('div', 'ajustes-temas');
    opciones.setAttribute('role', 'radiogroup');
    TEMAS.forEach(function (t) {
      var b = nodo('button', 'ajustes-tema' + (t === actual ? ' activo' : ''));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', t === actual ? 'true' : 'false');
      b.appendChild(nodo('span', 'ajustes-icono', ICONOS[t]));
      b.appendChild(nodo('strong', '', NOMBRES[t]));
      b.appendChild(nodo('span', 'ajustes-ayuda', AYUDA[t]));
      b.onclick = function () { poner(t); abrirAjustes(); };
      opciones.appendChild(b);
    });
    cuerpo.appendChild(opciones);
    cuerpo.appendChild(nodo('p', 'ajustes-nota', 'Se guarda en este teléfono.'));

    cuerpo.appendChild(nodo('h3', '', 'Ir a'));
    var atajos = nodo('div', 'ajustes-atajos');
    var aqui = (location.pathname.split('/').pop() || 'index.html');
    ATAJOS.forEach(function (a) {
      if (a[0] === aqui) return;
      var enlace = nodo('a', 'boton', a[1] + ' ' + a[2]);
      enlace.href = './' + a[0];
      atajos.appendChild(enlace);
    });
    cuerpo.appendChild(atajos);

    var pie = nodo('p', 'ajustes-nota');
    var priv = nodo('a', '', 'Política de privacidad');
    priv.href = './privacidad.html';
    pie.appendChild(priv);
    pie.appendChild(document.createTextNode(' · COORDINATE · hola@coordinate.do'));
    cuerpo.appendChild(pie);
    dialogo.appendChild(cuerpo);

    if (!dialogo.open) dialogo.showModal();
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('#btn-tema, [data-ajustes]');
    if (b) { ev.preventDefault(); abrirAjustes(); }
  });

  window.crdTema = {
    actual: leer,
    nombre: function (t) { return NOMBRES[t || leer()]; },
    poner: poner,
    abrirAjustes: abrirAjustes,
    siguiente: function () {
      var t = TEMAS[(TEMAS.indexOf(leer()) + 1) % TEMAS.length];
      poner(t);
      return t;
    },
    pintarBoton: function () { aplicar(leer()); }
  };
})();
