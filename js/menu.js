/* Menú principal: el símbolo de COORDINATE (anillo de ocho nodos con el
   centro azul) es el botón. Al tocarlo los nodos giran (tres octavos de vuelta),
   el centro late y baja una hoja con todas las funciones agrupadas y el
   aspecto (oscuro / claro / como el teléfono).

   Se pone solo en la cabecera de cada página (.barra-superior) y en
   cualquier [data-menu] (la portada del visor 3D). Con «reducir movimiento»
   del teléfono no hay animaciones.

   window.crdMenu:
     · equipo(activo, n): enseña «Novedades» con su número (visita.js).
     · alNovedades: función que abre las novedades en esta página; si no
       hay, el enlace lleva a visita.html#/novedades.
     · abrir() / cerrar(). */
(function () {
  var NODOS = [[32, 14.67], [44.25, 19.75], [49.33, 32], [44.25, 44.25], [32, 49.33], [19.75, 44.25], [14.67, 32], [19.75, 19.75]];
  var SIMBOLO = '<svg class="menu-simbolo" viewBox="10 10 44 44" aria-hidden="true"><g class="menu-nodos">'
    + NODOS.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.53"/>'; }).join('')
    + '</g><circle class="menu-centro" cx="32" cy="32" r="6"/></svg>';

  var GRUPOS = [
    ['Obra', [
      ['visita.html', '📋', 'Visitas diarias', 'Parte de obra, incidencias, repasos y planos'],
      ['index.html', '🧊', 'Modelo 3D y planos DXF', 'IFC, medir, cortes y realidad aumentada']
    ]],
    ['Calidad', [
      ['calidad.html#/inspecciones', '✅', 'Inspecciones y liberaciones', 'Checklist por partida con firma'],
      ['calidad.html#/vaciados', '🧱', 'Vaciados de hormigón', 'Conduces, slump y roturas de probetas', 'roturas']
    ]],
    ['Seguimiento', [
      ['seguimiento.html#/avance', '📈', 'Avance y curva S', 'Programado frente a real por partida'],
      ['seguimiento.html#/minutas', '🗒️', 'Minutas de reunión', 'Asistentes, temas y acuerdos', 'acuerdos'],
      ['seguimiento.html#/dias', '🌧️', 'Días afectados', 'Lluvia, paros y horas perdidas']
    ]],
    ['Control', [
      ['control.html#/rfi', '❓', 'Consultas (RFI)', 'Preguntas al proyectista con su respuesta', 'control'],
      ['control.html#/cambios', '📝', 'Órdenes de cambio', 'Adicionales, deductivos y plazo'],
      ['control.html#/materiales', '📦', 'Recepción de materiales', 'Conduces, faltantes y rechazos'],
      ['control.html#/sst', '🦺', 'Seguridad (SST)', 'Charlas, EPP, permisos e incidentes']
    ]],
    ['Equipo', [
      ['#novedades', '👥', 'Novedades del equipo', 'Bitácoras nuevas o cambiadas', 'novedades'],
      ['panel.html', '📊', 'Panel diario y semanal', 'Resumen y reporte en PDF'],
      ['perfil.html', '👤', 'Mi perfil y mis obras', 'Ficha, obras y equipos']
    ]],
    ['Datos', [
      ['visita.html#/cuentas', '🔗', 'Cuentas vinculadas', 'Gmail, Drive, Outlook y OneDrive'],
      ['visita.html#/copia', '💾', 'Copia de seguridad', 'Exportar o importar todo'],
      ['visita.html#/exportar', '📊', 'Exportar a Excel (CSV)', 'Tablas de todos los registros']
    ]]
  ];
  var TEMAS = [['oscuro', '🌙', 'Oscuro'], ['claro', '☀️', 'Claro'], ['auto', '◐', 'Teléfono']];

  var estado = { equipo: false, novedades: 0 };
  var hoja = null, velo = null, botones = [], abierto = false, ultimo = null;
  var quieto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function nodo(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function roturas() {
    // calidad.js deja aquí cuántas probetas toca romper hoy o están vencidas.
    try {
      var r = JSON.parse(localStorage.getItem('crd-roturas') || 'null');
      return r ? (r.hoy || 0) + (r.vencidas || 0) : 0;
    } catch (e) { return 0; }
  }

  function acuerdos() {
    // seguimiento-datos.js deja aquí cuántos acuerdos de minuta están vencidos.
    try { return Number(localStorage.getItem('crd-acuerdos-vencidos')) || 0; } catch (e) { return 0; }
  }

  function control() {
    // control-datos.js: RFI vencidas y permisos de trabajo sin cerrar.
    try { return Number(localStorage.getItem('crd-control-avisos')) || 0; } catch (e) { return 0; }
  }

  function pagina() { return location.pathname.split('/').pop() || 'index.html'; }

  function esActual(href) {
    var partes = href.split('#');
    if ((partes[0] || pagina()) !== pagina()) return false;
    var h = partes[1] ? '#' + partes[1] : '';
    if (pagina() === 'control.html') return location.hash.indexOf(h) === 0 || location.hash.indexOf('#/r/' + h.slice(2) + '/') === 0;
    if (pagina() === 'calidad.html' || pagina() === 'seguimiento.html') return location.hash.indexOf(h) === 0 || (h === '#/minutas' && location.hash.indexOf('#/minuta/') === 0);
    return h ? location.hash === h : !/^#\/(cuentas|copia|exportar)/.test(location.hash);
  }

  function construir() {
    velo = nodo('div', 'menu-velo');
    velo.hidden = true;
    velo.addEventListener('click', cerrar);
    hoja = nodo('nav', 'menu-hoja');
    hoja.id = 'menu-principal';
    hoja.hidden = true;
    hoja.setAttribute('aria-label', 'Menú principal');
    hoja.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrar(); }
    });
    document.body.appendChild(velo);
    document.body.appendChild(hoja);
  }

  function pintar() {
    hoja.textContent = '';
    var i = 0;
    GRUPOS.forEach(function (g) {
      var visibles = g[1].filter(function (a) { return a[4] !== 'novedades' || estado.equipo; });
      if (!visibles.length) return;
      hoja.appendChild(nodo('h3', 'menu-grupo', g[0]));
      visibles.forEach(function (a) {
        var href = a[0];
        var enlace = nodo('a', 'menu-item' + (esActual(href) ? ' actual' : ''));
        if (href === '#novedades') {
          href = window.crdMenu.alNovedades ? '#' : './visita.html#/novedades';
          enlace.addEventListener('click', function (ev) {
            if (!window.crdMenu.alNovedades) return;
            ev.preventDefault();
            cerrar(true);
            window.crdMenu.alNovedades();
          });
        } else {
          href = './' + href;
          enlace.addEventListener('click', function () {
            // Mismo documento con otro #: el menú se cierra y la página se encarga.
            setTimeout(function () { cerrar(true); }, 0);
          });
        }
        enlace.href = href;
        enlace.style.setProperty('--i', i++);
        enlace.appendChild(nodo('span', 'menu-icono', a[1]));
        var textos = nodo('span', 'menu-textos');
        textos.appendChild(nodo('strong', '', a[2]));
        textos.appendChild(nodo('span', 'menu-ayuda', a[3]));
        enlace.appendChild(textos);
        var n = a[4] === 'novedades' ? estado.novedades : a[4] === 'roturas' ? roturas() : a[4] === 'acuerdos' ? acuerdos() : a[4] === 'control' ? control() : 0;
        if (n) {
          var c = nodo('span', 'menu-contador', n > 99 ? '99+' : String(n));
          c.title = a[4] === 'roturas' ? 'Probetas por romper hoy o vencidas' : a[4] === 'acuerdos' ? 'Acuerdos vencidos' : a[4] === 'control' ? 'RFI vencidas y permisos sin cerrar' : 'Novedades sin abrir';
          enlace.appendChild(c);
        }
        hoja.appendChild(enlace);
      });
    });

    hoja.appendChild(nodo('h3', 'menu-grupo', 'Aspecto'));
    var temas = nodo('div', 'menu-temas');
    temas.setAttribute('role', 'radiogroup');
    temas.setAttribute('aria-label', 'Aspecto');
    var actual = window.crdTema ? window.crdTema.actual() : 'oscuro';
    TEMAS.forEach(function (t) {
      var b = nodo('button', 'menu-tema' + (t[0] === actual ? ' activo' : ''));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', t[0] === actual ? 'true' : 'false');
      b.appendChild(nodo('span', '', t[1]));
      b.appendChild(nodo('span', '', t[2]));
      b.addEventListener('click', function () {
        if (window.crdTema) window.crdTema.poner(t[0]);
        pintar();
        var activo = hoja.querySelector('.menu-tema.activo');
        if (activo) activo.focus();
      });
      temas.appendChild(b);
    });
    hoja.appendChild(temas);

    var pie = nodo('div', 'menu-pie');
    var guia = nodo('a', 'menu-enlace', '❓ Guía de uso');
    guia.href = './ayuda.html';
    var priv = nodo('a', 'menu-enlace', 'Privacidad');
    priv.href = './privacidad.html';
    pie.appendChild(guia);
    pie.appendChild(priv);
    pie.appendChild(nodo('span', 'menu-marca', 'hola@coordinate.do'));
    hoja.appendChild(pie);
  }

  function pintarBotones() {
    var n = estado.novedades + roturas() + acuerdos() + control();
    botones.forEach(function (b) {
      b.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      b.classList.toggle('abierto', abierto);
      var c = b.querySelector('.menu-aviso');
      c.hidden = !n;
      b.setAttribute('aria-label', n ? 'Menú · ' + n + ' avisos' : 'Menú');
    });
  }

  function abrir(desde) {
    if (!hoja) construir();
    ultimo = desde || botones[0];
    pintar();
    abierto = true;
    // La hoja sale justo debajo del botón que la abre.
    var r = ultimo ? ultimo.getBoundingClientRect() : { left: 8, bottom: 56 };
    hoja.style.left = Math.max(8, Math.min(r.left, innerWidth - Math.min(352, innerWidth - 16) - 8)) + 'px';
    hoja.style.top = (r.bottom + 6) + 'px';
    hoja.style.maxHeight = (innerHeight - r.bottom - 18) + 'px';
    // El velo empieza bajo el botón: así se ve girar y un segundo toque cierra.
    velo.style.top = Math.max(0, r.bottom + 2) + 'px';
    velo.hidden = false;
    hoja.hidden = false;
    hoja.classList.remove('entra');
    void hoja.offsetWidth;   // reinicia la animación de entrada
    hoja.classList.add('entra');
    pintarBotones();
    var primero = hoja.querySelector('.menu-item.actual') || hoja.querySelector('.menu-item');
    if (primero) primero.focus({ preventScroll: true });
  }

  function cerrar(sinFoco) {
    if (!abierto) return;
    abierto = false;
    pintarBotones();
    hoja.classList.remove('entra');
    var fin = function () { if (!abierto) { hoja.hidden = true; velo.hidden = true; } };
    if (quieto) fin(); else { hoja.classList.add('sale'); setTimeout(function () { hoja.classList.remove('sale'); fin(); }, 160); }
    if (!sinFoco && ultimo) ultimo.focus({ preventScroll: true });
  }

  function crearBoton(dentro) {
    var b = nodo('button', 'boton-menu');
    b.type = 'button';
    b.setAttribute('aria-haspopup', 'true');
    b.setAttribute('aria-controls', 'menu-principal');
    b.title = 'Menú';
    b.innerHTML = SIMBOLO + '<span class="menu-aviso" hidden></span>';
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      // Un toque rápido reinicia el latido aunque ya estuviera en marcha.
      b.classList.remove('toque');
      void b.offsetWidth;
      b.classList.add('toque');
      if (abierto) cerrar(); else abrir(b);
    });
    dentro.prepend ? dentro.prepend(b) : dentro.insertBefore(b, dentro.firstChild);
    botones.push(b);
    return b;
  }

  function iniciar() {
    document.querySelectorAll('.barra-superior').forEach(function (barra) {
      if (!barra.querySelector('.boton-menu')) crearBoton(barra);
    });
    document.querySelectorAll('[data-menu]').forEach(function (sitio) {
      var b = crearBoton(sitio.parentNode);
      sitio.parentNode.replaceChild(b, sitio);
      b.classList.add('boton-menu-suelto');
    });
    pintarBotones();
    addEventListener('resize', function () { if (abierto) cerrar(true); });
    addEventListener('hashchange', function () { if (abierto) cerrar(true); });
    addEventListener('storage', function (ev) { if (ev.key === 'crd-roturas' || ev.key === 'crd-acuerdos-vencidos' || ev.key === 'crd-control-avisos') pintarBotones(); });
  }

  window.crdMenu = {
    alNovedades: null,
    equipo: function (activo, n) {
      estado.equipo = Boolean(activo);
      estado.novedades = activo ? (n || 0) : 0;
      pintarBotones();
      if (abierto) pintar();
    },
    avisos: pintarBotones,
    abrir: function () { abrir(botones[0]); },
    cerrar: cerrar,
    get abierto() { return abierto; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
