/* Lector de planos DXF, en un worker para no congelar la pantalla.

   Recibe el texto del DXF y devuelve la geometría lista para pintar:
   polilíneas agrupadas por capa y color (coordenadas relativas a un
   origen, en Float32), textos, puntos de enganche para medir y las
   unidades del dibujo. Usa dxf-parser (MIT, vendor/dxf).

   Se dibuja el espacio modelo: líneas, polilíneas (con arcos), arcos,
   círculos, elipses, splines, textos, cotas (su bloque), sólidos y
   bloques (INSERT, también en matriz), con capas y colores ACI o
   verdaderos. Sombreados e imágenes no se dibujan. */

/* global DxfParser */
importScripts('../vendor/dxf/dxf-parser.js');

const UNIDADES = { 1: ['in', 0.0254], 2: ['ft', 0.3048], 4: ['mm', 0.001], 5: ['cm', 0.01], 6: ['m', 1] };
const MAX_PUNTOS = 4e6;
const MAX_TEXTOS = 40000;
const MAX_ENGANCHES = 400000;
const PROFUNDIDAD = 12;

const hex = (n) => `#${(n >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;

self.onmessage = (ev) => {
  try {
    const resultado = leer(ev.data.texto);
    const transferir = [];
    for (const g of resultado.grupos) transferir.push(g.puntos.buffer, g.cortes.buffer);
    transferir.push(resultado.enganches.buffer);
    self.postMessage({ ok: true, resultado }, transferir);
  } catch (e) {
    self.postMessage({ ok: false, error: e && e.message ? e.message : String(e) });
  }
};

function leer(texto) {
  const dxf = new DxfParser().parseSync(texto);
  if (!dxf || !dxf.entities) throw new Error('No es un DXF válido');
  const tablaCapas = (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) || {};
  const bloques = dxf.blocks || {};

  const capas = [];
  const indiceCapa = new Map();
  function capa(nombre) {
    nombre = nombre || '0';
    if (indiceCapa.has(nombre)) return indiceCapa.get(nombre);
    const t = tablaCapas[nombre] || {};
    const i = capas.length;
    capas.push({
      nombre,
      color: hex(t.color != null ? t.color : 0xffffff),
      visible: t.visible !== false && !t.frozen
    });
    indiceCapa.set(nombre, i);
    return i;
  }

  // Grupos de polilíneas por capa y color.
  const grupos = new Map();
  let totalPuntos = 0;
  function grupo(c, color) {
    const k = `${c}|${color}`;
    let g = grupos.get(k);
    if (!g) { g = { capa: c, color, xy: [], cortes: [] }; grupos.set(k, g); }
    return g;
  }
  const textos = [];
  const enganches = [];
  const omitidas = {};
  let entidades = 0;

  const aplicar = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const componer = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
  ];
  const IDENTIDAD = [1, 0, 0, 1, 0, 0];
  const escalaDe = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

  function trazar(m, puntos, cerrado, c, color) {
    if (puntos.length < 2 || totalPuntos > MAX_PUNTOS) return;
    const g = grupo(c, color);
    g.cortes.push(g.xy.length / 2);
    for (const [x, y] of puntos) { const p = aplicar(m, x, y); g.xy.push(p[0], p[1]); }
    if (cerrado) { const p = aplicar(m, puntos[0][0], puntos[0][1]); g.xy.push(p[0], p[1]); }
    totalPuntos += puntos.length + (cerrado ? 1 : 0);
  }
  function enganche(m, x, y) {
    if (enganches.length / 2 >= MAX_ENGANCHES) return;
    const p = aplicar(m, x, y);
    enganches.push(p[0], p[1]);
  }

  function pasosArco(barrido, radio, m) {
    const r = radio * escalaDe(m);
    return Math.max(6, Math.min(256, Math.ceil(Math.abs(barrido) / (Math.PI * 2) * (r > 0 ? 48 + Math.log10(1 + r) * 16 : 48))));
  }
  function arco(cx, cy, r, a0, a1, m) {
    let barrido = a1 - a0;
    while (barrido <= 0) barrido += Math.PI * 2;
    const n = pasosArco(barrido, r, m);
    const p = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + barrido * i / n;
      p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return p;
  }

  // Polilínea con «bulge» (arcos entre vértices).
  function conCurvas(vs, cerrado, m) {
    const p = [];
    const n = vs.length;
    for (let i = 0; i < n; i++) {
      const a = vs[i];
      p.push([a.x, a.y]);
      const b = vs[(i + 1) % n];
      if (i === n - 1 && !cerrado) break;
      const bulge = a.bulge || 0;
      if (Math.abs(bulge) < 1e-9) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const cuerda = Math.hypot(dx, dy);
      if (cuerda < 1e-12) continue;
      const theta = 4 * Math.atan(bulge);
      const r = cuerda / (2 * Math.sin(Math.abs(theta) / 2));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const h = r * Math.cos(theta / 2);
      const sgn = bulge > 0 ? 1 : -1;
      const cx = mx - sgn * h * dy / cuerda, cy = my + sgn * h * dx / cuerda;
      const a0 = Math.atan2(a.y - cy, a.x - cx);
      const pasos = pasosArco(theta, Math.abs(r), m);
      for (let k = 1; k < pasos; k++) {
        const ang = a0 + theta * k / pasos;
        p.push([cx + Math.abs(r) * Math.cos(ang), cy + Math.abs(r) * Math.sin(ang)]);
      }
    }
    return p;
  }

  // B-spline por de Boor (sin pesos racionales).
  function spline(e) {
    const ctrl = (e.controlPoints || []).map((q) => [q.x, q.y]);
    if (ctrl.length < 2) return (e.fitPoints || []).map((q) => [q.x, q.y]);
    const k = e.degreeOfSplineCurve || 3;
    const t = e.knotValues || [];
    if (t.length !== ctrl.length + k + 1) return ctrl;
    const t0 = t[k], t1 = t[ctrl.length];
    const n = Math.min(400, ctrl.length * 10);
    const salida = [];
    for (let s = 0; s <= n; s++) {
      const u = Math.min(t0 + (t1 - t0) * s / n, t1 - 1e-12);
      let i = k;
      while (i < ctrl.length - 1 && u >= t[i + 1]) i++;
      const d = [];
      for (let j = 0; j <= k; j++) d.push([...ctrl[i - k + j]]);
      for (let r = 1; r <= k; r++) {
        for (let j = k; j >= r; j--) {
          const idx = i - k + j;
          const den = t[idx + k - r + 1] - t[idx];
          const alfa = den ? (u - t[idx]) / den : 0;
          d[j] = [(1 - alfa) * d[j - 1][0] + alfa * d[j][0], (1 - alfa) * d[j - 1][1] + alfa * d[j][1]];
        }
      }
      salida.push(d[k]);
    }
    return salida;
  }

  function limpiarMtext(t) {
    return String(t || '')
      .replace(/\\P/g, '\n')
      .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '')
      .replace(/\\[LlOoKk]/g, '')
      .replace(/\\S([^;]*)[\^#/]([^;]*);/g, '$1/$2')
      .replace(/[{}]/g, '')
      .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
      .replace(/\\~/g, ' ')
      .trim();
  }

  function ponerTexto(m, e, c, color, ocs) {
    if (textos.length >= MAX_TEXTOS) return;
    let x, y, h, rot = 0, cadena, alinH = 0, alinV = 0;
    if (e.type === 'TEXT' || e.type === 'ATTRIB' || e.type === 'ATTDEF') {
      const usarFin = (e.halign > 0 || e.valign > 0) && e.endPoint;
      const p = usarFin ? e.endPoint : (e.startPoint || {});
      x = p.x; y = p.y; h = e.textHeight || 1; rot = (e.rotation || 0) * Math.PI / 180;
      cadena = String(e.text || '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '');
      alinH = e.halign === 1 || e.halign === 4 ? 1 : e.halign === 2 ? 2 : 0;
      alinV = e.valign === 3 ? 0 : e.valign === 2 || e.halign === 4 ? 1 : 3;
    } else {
      const p = e.position || {};
      x = p.x; y = p.y; h = e.height || 1;
      rot = e.directionVector ? Math.atan2(e.directionVector.y, e.directionVector.x) : (e.rotation || 0) * Math.PI / 180;
      cadena = limpiarMtext(e.text);
      const ap = (e.attachmentPoint || 1) - 1;
      alinH = ap % 3; alinV = Math.floor(ap / 3); // 0 arriba, 1 medio, 2 abajo
    }
    if (!cadena || x == null) return;
    if (ocs) x = -x;
    const p = aplicar(m, x, y);
    const ex = escalaDe(m);
    const angM = Math.atan2(m[1], m[0]);
    textos.push({ capa: c, color, x: p[0], y: p[1], h: h * ex, rot: rot + angM, texto: cadena.slice(0, 500), alinH, alinV, mtext: e.type === 'MTEXT' });
  }

  function colorDe(e, c, heredado) {
    if (e.colorIndex === 0) return heredado || capas[c].color;      // ByBlock
    if (e.colorIndex === 256 || e.color == null) return capas[c].color;  // ByLayer
    return hex(e.color);
  }

  function dibujar(lista, m, capaPadre, colorPadre, nivel) {
    for (const e of lista || []) {
      if (e.inPaperSpace) continue;
      if (e.visible === false) continue;
      entidades++;
      // En los bloques, lo de la capa 0 toma la capa del bloque.
      const c = (e.layer === '0' || !e.layer) && capaPadre != null ? capaPadre : capa(e.layer);
      const color = colorDe(e, c, colorPadre);
      const ocs = e.extrusionDirectionZ != null ? e.extrusionDirectionZ < 0 : (e.extrusionDirection && e.extrusionDirection.z < 0);
      const mo = ocs ? componer(m, [-1, 0, 0, 1, 0, 0]) : m;
      switch (e.type) {
        case 'LINE': {
          const [a, b] = e.vertices || [];
          if (!a || !b) break;
          trazar(m, [[a.x, a.y], [b.x, b.y]], false, c, color);
          enganche(m, a.x, a.y); enganche(m, b.x, b.y);
          enganche(m, (a.x + b.x) / 2, (a.y + b.y) / 2);
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          if (e.isPolyfaceMesh || e.is3dPolygonMesh) { omitidas[e.type + ' 3D'] = (omitidas[e.type + ' 3D'] || 0) + 1; break; }
          const vs = (e.vertices || []).filter((v) => v && v.x != null);
          if (vs.length < 2) break;
          trazar(mo, conCurvas(vs, e.shape, mo), e.shape, c, color);
          for (const v of vs) enganche(mo, v.x, v.y);
          break;
        }
        case 'CIRCLE': {
          const k = e.center; if (!k) break;
          trazar(mo, arco(k.x, k.y, e.radius, 0, Math.PI * 2, mo), false, c, color);
          enganche(mo, k.x, k.y);
          for (let q = 0; q < 4; q++) enganche(mo, k.x + e.radius * Math.cos(q * Math.PI / 2), k.y + e.radius * Math.sin(q * Math.PI / 2));
          break;
        }
        case 'ARC': {
          const k = e.center; if (!k) break;
          const p = arco(k.x, k.y, e.radius, e.startAngle, e.endAngle, mo);
          trazar(mo, p, false, c, color);
          enganche(mo, k.x, k.y); enganche(mo, p[0][0], p[0][1]); enganche(mo, p[p.length - 1][0], p[p.length - 1][1]);
          break;
        }
        case 'ELLIPSE': {
          const k = e.center, a = e.majorAxisEndPoint; if (!k || !a) break;
          const r = e.axisRatio || 1;
          let t0 = e.startAngle || 0, t1 = e.endAngle != null ? e.endAngle : Math.PI * 2;
          while (t1 <= t0) t1 += Math.PI * 2;
          const n = pasosArco(t1 - t0, Math.hypot(a.x, a.y), mo);
          const p = [];
          for (let i = 0; i <= n; i++) {
            const t = t0 + (t1 - t0) * i / n;
            p.push([k.x + a.x * Math.cos(t) - r * a.y * Math.sin(t), k.y + a.y * Math.cos(t) + r * a.x * Math.sin(t)]);
          }
          trazar(mo, p, false, c, color);
          enganche(mo, k.x, k.y);
          break;
        }
        case 'SPLINE': {
          const p = spline(e);
          trazar(m, p, Boolean(e.closed), c, color);
          if (p.length) { enganche(m, p[0][0], p[0][1]); enganche(m, p[p.length - 1][0], p[p.length - 1][1]); }
          break;
        }
        case 'SOLID':
        case '3DFACE': {
          const vs = (e.points || e.vertices || []).filter(Boolean);
          if (vs.length < 3) break;
          const orden = e.type === 'SOLID' && vs.length === 4 ? [vs[0], vs[1], vs[3], vs[2]] : vs;
          trazar(mo, orden.map((v) => [v.x, v.y]), true, c, color);
          break;
        }
        case 'TEXT':
        case 'MTEXT':
        case 'ATTRIB':
          ponerTexto(m, e, c, color, ocs);
          break;
        case 'DIMENSION': {
          const b = e.block && bloques[e.block];
          if (b && nivel < PROFUNDIDAD) dibujar(b.entities, m, c, color, nivel + 1);
          break;
        }
        case 'INSERT': {
          const b = bloques[e.name];
          if (!b || nivel >= PROFUNDIDAD) break;
          const base = b.position || { x: 0, y: 0 };
          const sx = e.xScale != null ? e.xScale : 1, sy = e.yScale != null ? e.yScale : 1;
          const rot = (e.rotation || 0) * Math.PI / 180;
          const cos = Math.cos(rot), sin = Math.sin(rot);
          const filas = Math.max(1, e.rowCount || 1), columnas = Math.max(1, e.columnCount || 1);
          for (let f = 0; f < filas; f++) {
            for (let k = 0; k < columnas; k++) {
              const ox = k * (e.columnSpacing || 0), oy = f * (e.rowSpacing || 0);
              const px = e.position.x + cos * ox - sin * oy, py = e.position.y + sin * ox + cos * oy;
              // T(pos) · R(rot) · S(sx,sy) · T(-base)
              let mi = [cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0];
              mi[4] = px - (mi[0] * base.x + mi[2] * base.y);
              mi[5] = py - (mi[1] * base.x + mi[3] * base.y);
              dibujar(b.entities, componer(mo, mi), c, color, nivel + 1);
            }
          }
          break;
        }
        case 'POINT':
          if (e.position) enganche(m, e.position.x, e.position.y);
          break;
        default:
          omitidas[e.type] = (omitidas[e.type] || 0) + 1;
      }
    }
  }

  dibujar(dxf.entities, IDENTIDAD, null, null, 0);

  // Encuadre robusto: sin los puntos sueltos muy lejos (percentiles).
  const xs = [], ys = [];
  for (const g of grupos.values()) {
    const paso = Math.max(1, Math.floor(g.xy.length / 2 / 5000));
    for (let i = 0; i < g.xy.length; i += 2 * paso) { xs.push(g.xy[i]); ys.push(g.xy[i + 1]); }
  }
  for (const t of textos) { xs.push(t.x); ys.push(t.y); }
  if (!xs.length) throw new Error('El DXF no tiene nada que dibujar en el espacio modelo');
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.floor(f * (a.length - 1))))];
  const recorte = xs.length > 200 ? 0.002 : 0;
  const caja = { x0: q(xs, recorte), x1: q(xs, 1 - recorte), y0: q(ys, recorte), y1: q(ys, 1 - recorte) };
  const ox = (caja.x0 + caja.x1) / 2, oy = (caja.y0 + caja.y1) / 2;

  const salida = [];
  for (const g of grupos.values()) {
    const puntos = new Float32Array(g.xy.length);
    for (let i = 0; i < g.xy.length; i += 2) { puntos[i] = g.xy[i] - ox; puntos[i + 1] = g.xy[i + 1] - oy; }
    salida.push({ capa: g.capa, color: g.color, puntos, cortes: Uint32Array.from(g.cortes) });
  }
  for (const t of textos) { t.x -= ox; t.y -= oy; }
  const eng = new Float32Array(enganches.length);
  for (let i = 0; i < enganches.length; i += 2) { eng[i] = enganches[i] - ox; eng[i + 1] = enganches[i + 1] - oy; }

  const u = UNIDADES[dxf.header && dxf.header.$INSUNITS];
  const ancho = caja.x1 - caja.x0, alto = caja.y1 - caja.y0;
  // Sin unidades declaradas: un dibujo de más de 2000 de ancho suele estar en mm.
  const supuesta = Math.max(ancho, alto) > 2000 ? ['mm', 0.001] : ['m', 1];
  return {
    unidades: u ? u[0] : supuesta[0],
    metrosPorUnidad: u ? u[1] : supuesta[1],
    unidadesDeclaradas: Boolean(u),
    origen: [ox, oy],
    caja: { x0: caja.x0 - ox, x1: caja.x1 - ox, y0: caja.y0 - oy, y1: caja.y1 - oy },
    capas,
    grupos: salida,
    textos,
    enganches: eng,
    entidades,
    puntos: totalPuntos,
    recortado: totalPuntos > MAX_PUNTOS,
    omitidas
  };
}
