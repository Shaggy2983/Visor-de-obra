/* Informe interactivo: un único .html autosuficiente (planos, fotos y
   tipografía van dentro en base64) que se puede mandar por correo o
   WhatsApp y abrir en cualquier navegador, sin la app y sin conexión.
   En él se tocan los números del plano para ver cada nota con sus fotos. */

import { aDatos, reducirImagen, fechaLarga } from './utiles.js';
import { TIPOS_NOTA, COLOR_NOTA } from './planos.js';

const LADO_PLANO_INFORME = 3000;   // equilibrio entre detalle y peso del archivo

const SIMBOLO = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 6V58M6 32H58" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><g fill="#62a0e8"><circle cx="32" cy="6" r="4.5"/><circle cx="58" cy="32" r="4.5"/><circle cx="32" cy="58" r="4.5"/><circle cx="6" cy="32" r="4.5"/><circle cx="32" cy="32" r="6.5"/></g></svg>';

async function fuenteInter() {
  try {
    const r = await fetch(new URL('../vendor/inter/inter-latin-wght-normal.woff2', import.meta.url));
    return await aDatos(await r.blob());
  } catch (e) {
    return null;   // sin la fuente el informe usa la del sistema
  }
}

/* planos: los registros de plano que tienen notas en esta visita. */
export async function generarInformeInteractivo(v, planos, { contacto, lema }) {
  const fotos = [];
  for (const f of v.fotos) {
    fotos.push({ src: await aDatos(f.blob), pie: f.pie || '', hora: f.hora || '', nota: f.nota || null });
  }
  const datosPlanos = [];
  for (const p of planos) {
    const reducido = await reducirImagen(p.blob, LADO_PLANO_INFORME, 0.85);
    datosPlanos.push({ id: p.id, nombre: p.nombre, src: await aDatos(reducido.blob), ancho: reducido.ancho, alto: reducido.alto });
  }
  const datos = {
    visita: {
      fecha: fechaLarga(v.fecha), hora: v.hora, obra: v.obra, autor: v.autor,
      tiempo: [v.clima.join(', '), v.temperatura].filter(Boolean).join(' · '),
      jornada: v.jornada,
      personal: v.personal.filter((p) => p.empresa || p.oficio || p.numero),
      trabajos: v.trabajos, maquinaria: v.maquinaria, materiales: v.materiales,
      incidencias: v.incidencias, observaciones: v.observaciones
    },
    planos: datosPlanos,
    notas: v.notas
      .filter((n) => planos.some((p) => p.id === n.plano))
      .sort((a, b) => a.numero - b.numero),
    fotos,
    firma: v.firma ? await aDatos(v.firma) : null,
    tipos: TIPOS_NOTA,
    colores: COLOR_NOTA,
    contacto,
    lema
  };
  // Dentro de <script> no puede aparecer "</script>": se escapa el "<".
  const json = JSON.stringify(datos).replace(/</g, '\\u003c');
  const inter = await fuenteInter();
  const titulo = `Visita ${v.fecha} ${v.obra || ''}`.trim();
  const html = plantilla({ titulo, json, inter });
  return new Blob([html], { type: 'text/html' });
}

function escapar(texto) {
  return texto.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function plantilla({ titulo, json, inter }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · COORDINATE</title>
<style>
${inter ? `@font-face{font-family:"Inter";src:url(${inter}) format("woff2");font-weight:100 900;font-display:swap}` : ''}
:root{--bg:#eef1f6;--surface:#fff;--text:#121826;--text-2:#4a5a72;--accent:#3d7cc4;--accent-300:#bcd6f3;--section:#1b3560;--borde:#d5dce8}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.banda{background:var(--section);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.marca{display:inline-flex;align-items:center;font-weight:500;letter-spacing:.12em;font-size:17px;white-space:nowrap}
.marca svg{width:.92em;height:.92em;margin:0 .1em 0 .02em}
.banda small{color:var(--accent-300);letter-spacing:.14em;text-transform:uppercase;font-size:11px}
main{max-width:980px;margin:0 auto;padding:16px}
h1{margin:6px 0 0;font-size:24px;color:var(--section)}
.obra{margin:0 0 12px;font-size:17px;font-weight:600;color:var(--accent)}
h2{margin:28px 0 10px;padding-bottom:4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--section);border-bottom:2px solid var(--accent)}
.tarjeta{background:var(--surface);border:1px solid var(--borde);border-radius:10px;padding:12px 14px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--borde)}
thead th{background:var(--bg);color:var(--section);font-size:12px}
.datos th{width:32%;color:var(--text-2);font-weight:500}
.num{text-align:right}
.parrafo{white-space:pre-wrap;margin:0}
.plano{position:relative;margin:0;background:#fff;border:1px solid var(--borde);border-radius:10px;overflow:hidden;cursor:zoom-in}
.plano img{display:block;width:100%;height:auto}
.pin{position:absolute;transform:translate(-50%,-50%);min-width:28px;height:28px;padding:0 6px;border-radius:14px;border:2px solid #fff;color:#fff;font:700 13px/24px "Inter",system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.35)}
.pin.activo{outline:3px solid #121826;z-index:2;transform:translate(-50%,-50%) scale(1.25)}
.plano-pie{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:8px 0 4px;color:var(--text-2);font-size:13px}
.boton{appearance:none;border:1px solid var(--borde);background:#fff;color:var(--section);font:inherit;font-size:13px;padding:6px 10px;border-radius:8px;cursor:pointer}
.notas{display:grid;gap:8px;margin-top:8px}
.nota{display:flex;gap:10px;align-items:flex-start;text-align:left;width:100%;background:#fff;border:1px solid var(--borde);border-radius:10px;padding:10px;cursor:pointer;font:inherit;color:inherit}
.nota.activa{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-300)}
.nota .pin{position:static;transform:none;flex:0 0 auto}
.nota p{margin:2px 0 0;white-space:pre-wrap}
.etiqueta{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
.miniaturas{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.miniaturas img{width:64px;height:48px;object-fit:cover;border-radius:6px}
.fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.fotos figure{margin:0;background:#fff;border:1px solid var(--borde);border-radius:10px;overflow:hidden}
.fotos img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;cursor:zoom-in}
.fotos figcaption{padding:8px 10px;font-size:13px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.ir{appearance:none;border:0;border-radius:12px;color:#fff;font:600 12px "Inter",system-ui,sans-serif;padding:3px 9px;cursor:pointer;white-space:nowrap}
.capa{position:fixed;inset:0;z-index:20;background:rgba(10,14,24,.94);display:flex;flex-direction:column}
.capa[hidden]{display:none}
.capa-barra{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;color:#fff}
.capa-cuerpo{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}
.capa-cuerpo>img{display:block;max-width:100%;max-height:100%;margin:auto}
.foto-capa .capa-cuerpo{display:flex;align-items:center;justify-content:center}
.zoom .plano{cursor:default;border-radius:0;margin:0 auto}
.pie-informe{margin:32px 0 8px;padding:10px 14px;background:#fff;border-top:2px solid var(--section);display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:12px;color:#22436f}
.firma img{max-height:110px;max-width:280px}
.vacio{color:var(--text-2)}
@media print{.capa,.boton,.ir{display:none!important}.plano,.nota,.fotos figure{break-inside:avoid}body{background:#fff}}
</style>
</head>
<body>
<div class="banda"><span class="marca" aria-label="COORDINATE">C${SIMBOLO}ORDINATE</span><small>Informe de visita</small></div>
<main id="raiz"></main>
<div id="capa-plano" class="capa zoom" hidden>
  <div class="capa-barra"><strong id="capa-titulo"></strong>
    <span><button class="boton" data-zoom="0.8">−</button> <button class="boton" data-zoom="1.25">+</button> <button class="boton" id="capa-cerrar">Cerrar</button></span></div>
  <div class="capa-cuerpo" id="capa-cuerpo"></div>
</div>
<div id="capa-foto" class="capa foto-capa" hidden>
  <div class="capa-barra"><span id="foto-texto"></span><button class="boton" id="foto-cerrar">Cerrar</button></div>
  <div class="capa-cuerpo"><img id="foto-img" alt=""></div>
</div>
<script id="datos" type="application/json">${json}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('datos').textContent);
  var V = D.visita;
  function h(tag, attrs) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      var val = attrs[k];
      if (val == null || val === false) continue;
      if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), val);
      else if (k === 'class') n.className = val;
      else if (k === 'style') n.style.cssText = val;
      else n.setAttribute(k, val);
    }
    for (var i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (c) {
        if (c == null || c === false) return;
        n.append(c instanceof Node ? c : String(c));
      });
    }
    return n;
  }
  var raiz = document.getElementById('raiz');
  function seccion(titulo) { var s = h('section', {}, h('h2', {}, titulo)); raiz.append(s); return s; }
  function texto(titulo, t) { if (t && t.trim()) seccion(titulo).append(h('div', { class: 'tarjeta' }, h('p', { class: 'parrafo' }, t))); }
  function fotosDe(id) { return D.fotos.filter(function (f) { return f.nota === id; }); }
  function color(n) { return D.colores[n.tipo] || D.colores.observacion; }
  function pin(n, extra) {
    return h('button', Object.assign({ class: 'pin', style: 'background:' + color(n), 'data-nota': n.id, title: 'Nota ' + n.numero }, extra || {}), n.numero);
  }

  raiz.append(h('h1', {}, 'Parte de visita de obra'), h('p', { class: 'obra' }, V.obra || 'Obra sin nombre'));
  raiz.append(h('div', { class: 'tarjeta' }, h('table', { class: 'datos' }, h('tbody', {},
    h('tr', {}, h('th', {}, 'Fecha'), h('td', {}, V.fecha + (V.hora ? ' · ' + V.hora : ''))),
    h('tr', {}, h('th', {}, 'Realizada por'), h('td', {}, V.autor || '—')),
    h('tr', {}, h('th', {}, 'Tiempo'), h('td', {}, V.tiempo || '—')),
    h('tr', {}, h('th', {}, 'Jornada'), h('td', {}, V.jornada || '—')),
    h('tr', {}, h('th', {}, 'Notas en plano'), h('td', {}, String(D.notas.length))),
    h('tr', {}, h('th', {}, 'Fotos'), h('td', {}, String(D.fotos.length)))
  ))));

  /* --- planos con sus notas --- */
  var activa = null;
  function abrirNota(id, desplazar) {
    activa = id;
    document.querySelectorAll('[data-nota]').forEach(function (e) {
      e.classList.toggle(e.classList.contains('nota') ? 'activa' : 'activo', e.getAttribute('data-nota') === id);
    });
    var tarjeta = document.querySelector('.nota[data-nota="' + id + '"]');
    if (desplazar && tarjeta) {
      var plano = tarjeta.closest('section').querySelector('.plano');
      (plano || tarjeta).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (tarjeta) {
      tarjeta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function figuraPlano(p, alTocarFondo) {
    var fig = h('figure', { class: 'plano', style: 'aspect-ratio:' + p.ancho + '/' + p.alto },
      h('img', { src: p.src, alt: p.nombre }));
    D.notas.filter(function (n) { return n.plano === p.id; }).forEach(function (n) {
      fig.append(pin(n, { style: 'background:' + color(n) + ';left:' + (n.x * 100) + '%;top:' + (n.y * 100) + '%' }));
    });
    fig.addEventListener('click', function (ev) {
      var b = ev.target.closest('.pin');
      if (b) { ev.stopPropagation(); cerrarCapa(); abrirNota(b.getAttribute('data-nota'), false); }
      else if (alTocarFondo) alTocarFondo();
    });
    return fig;
  }

  if (D.planos.length) {
    D.planos.forEach(function (p) {
      var s = seccion('Plano · ' + p.nombre);
      var notas = D.notas.filter(function (n) { return n.plano === p.id; });
      s.append(figuraPlano(p, function () { ampliarPlano(p); }));
      s.append(h('div', { class: 'plano-pie' },
        h('span', {}, notas.length + (notas.length === 1 ? ' nota' : ' notas') + ' · toca un número para ver la nota'),
        h('button', { class: 'boton', onclick: function () { ampliarPlano(p); } }, 'Ampliar plano')));
      s.append(h('div', { class: 'notas' }, notas.map(function (n) {
        var fs = fotosDe(n.id);
        return h('div', { class: 'nota', 'data-nota': n.id, role: 'button', tabindex: '0', onclick: function () { abrirNota(n.id, true); } },
          pin(n),
          h('div', {},
            h('span', { class: 'etiqueta', style: 'color:' + color(n) }, D.tipos[n.tipo] || n.tipo),
            n.hora ? h('span', { class: 'vacio' }, ' · ' + n.hora) : null,
            h('p', {}, n.texto || h('span', { class: 'vacio' }, 'Sin texto')),
            fs.length ? h('div', { class: 'miniaturas' }, fs.map(function (f) {
              return h('img', { src: f.src, alt: f.pie, onclick: function (ev) { ev.stopPropagation(); verFoto(f); } });
            })) : null));
      })));
    });
  }

  /* --- resto del parte --- */
  if (V.personal.length) {
    var total = V.personal.reduce(function (s, p) { return s + (Number(p.numero) || 0); }, 0);
    seccion('Personal en obra (' + total + ')').append(h('div', { class: 'tarjeta' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Empresa'), h('th', {}, 'Oficio'), h('th', { class: 'num' }, 'Nº'))),
      h('tbody', {}, V.personal.map(function (p) { return h('tr', {}, h('td', {}, p.empresa), h('td', {}, p.oficio), h('td', { class: 'num' }, p.numero)); })))));
  }
  texto('Trabajos realizados', V.trabajos);
  texto('Maquinaria y medios', V.maquinaria);
  texto('Materiales recibidos', V.materiales);
  if (V.incidencias.length) {
    var G = { leve: 'Leve', media: 'Media', grave: 'Grave' };
    seccion('Incidencias').append(h('div', { class: 'tarjeta' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Descripción'), h('th', {}, 'Gravedad'), h('th', {}, 'Estado'))),
      h('tbody', {}, V.incidencias.map(function (i) {
        return h('tr', {}, h('td', {}, i.texto), h('td', {}, G[i.gravedad] || i.gravedad), h('td', {}, i.estado === 'cerrada' ? 'Resuelta' : 'Abierta'));
      })))));
  }
  texto('Observaciones e instrucciones', V.observaciones);

  if (D.fotos.length) {
    seccion('Fotos').append(h('div', { class: 'fotos' }, D.fotos.map(function (f, i) {
      var n = f.nota && D.notas.filter(function (k) { return k.id === f.nota; })[0];
      return h('figure', {},
        h('img', { src: f.src, alt: f.pie, onclick: function () { verFoto(f); } }),
        h('figcaption', {},
          h('span', {}, (i + 1) + (f.pie ? ' · ' + f.pie : '') + (f.hora ? ' · ' + f.hora : '')),
          n ? h('button', { class: 'ir', style: 'background:' + color(n), onclick: function () { abrirNota(n.id, true); } }, 'Nota ' + n.numero + ' en plano') : null));
    })));
  }
  if (D.firma) seccion('Firma').append(h('div', { class: 'tarjeta firma' }, h('img', { src: D.firma, alt: 'Firma' }), h('p', {}, V.autor || '')));
  raiz.append(h('footer', { class: 'pie-informe' }, h('span', {}, D.lema), h('span', {}, D.contacto)));

  /* --- capas: plano ampliado y foto --- */
  var capa = document.getElementById('capa-plano'), cuerpo = document.getElementById('capa-cuerpo'), ancho = 100;
  function ampliarPlano(p) {
    ancho = 200;
    document.getElementById('capa-titulo').textContent = p.nombre;
    var fig = figuraPlano(p, null);
    fig.style.width = ancho + '%';
    cuerpo.replaceChildren(fig);
    capa.hidden = false;
  }
  function cerrarCapa() { capa.hidden = true; cuerpo.replaceChildren(); }
  document.getElementById('capa-cerrar').onclick = cerrarCapa;
  capa.querySelectorAll('[data-zoom]').forEach(function (b) {
    b.onclick = function () {
      ancho = Math.max(100, Math.min(800, ancho * Number(b.getAttribute('data-zoom'))));
      var fig = cuerpo.querySelector('.plano'); if (fig) fig.style.width = ancho + '%';
    };
  });
  var capaFoto = document.getElementById('capa-foto');
  function verFoto(f) {
    document.getElementById('foto-img').src = f.src;
    var n = f.nota && D.notas.filter(function (k) { return k.id === f.nota; })[0];
    document.getElementById('foto-texto').textContent = [n ? 'Nota ' + n.numero : '', f.pie, f.hora].filter(Boolean).join(' · ');
    capaFoto.hidden = false;
  }
  document.getElementById('foto-cerrar').onclick = function () { capaFoto.hidden = true; };
  capaFoto.addEventListener('click', function (ev) { if (ev.target.id !== 'foto-texto') capaFoto.hidden = true; });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { cerrarCapa(); capaFoto.hidden = true; } });
})();
</script>
</body>
</html>
`;
}
