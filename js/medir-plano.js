/* Medir sobre los planos de la visita (PDF, imagen o DXF).

   Un plano guardado es una imagen; para medir necesita su escala:
     plano.mPorPx       metros que mide un píxel de la imagen
     plano.papelMmPorPx milímetros de papel por píxel (planos de PDF: sale
                        del tamaño de la hoja), para calibrar con «1:100»
     plano.escalaTexto  cómo se calibró («1:100», «cota de 6,00 m», «DXF, m»)
   Los DXF llegan ya calibrados (sus coordenadas son reales).

   Las medidas son de la visita, como las notas y los dibujos:
     v.medidas = [{ id, plano, tipo: 'distancia'|'longitud'|'area',
                    puntos: [[x, y]…] (0–1 sobre la imagen), hora }]
   El valor se calcula al pintar: si se corrige la escala, se corrigen. */

export const ESCALAS = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000];
export const TIPOS_MEDIDA = { distancia: 'Distancia', longitud: 'Recorrido', area: 'Área' };
export const COLOR_MEDIDA = '#ff6b2c';

const coma = (n, d) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

export function formatoMedida(valor, tipo) {
  if (valor == null || !isFinite(valor)) return '—';
  if (tipo === 'area') return valor < 1 ? `${coma(valor * 10000, 0)} cm²` : `${coma(valor, 2)} m²`;
  if (valor < 1) return `${coma(valor * 100, 1)} cm`;
  return `${coma(valor, 2)} m`;
}

export function longitud(puntos, cerrado = false) {
  let s = 0;
  for (let i = 1; i < puntos.length; i++) s += Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]);
  if (cerrado && puntos.length > 2) s += Math.hypot(puntos[0][0] - puntos.at(-1)[0], puntos[0][1] - puntos.at(-1)[1]);
  return s;
}

export function area(puntos) {
  let s = 0;
  for (let i = 0; i < puntos.length; i++) {
    const [x1, y1] = puntos[i], [x2, y2] = puntos[(i + 1) % puntos.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/* Puntos normalizados (0–1) → píxeles de la imagen del plano. */
export const enPx = (plano, puntos) => puntos.map(([x, y]) => [x * plano.ancho, y * plano.alto]);

export function valorMedida(plano, m) {
  if (!plano || !plano.mPorPx) return null;
  const px = enPx(plano, m.puntos);
  if (m.tipo === 'area') return px.length > 2 ? area(px) * plano.mPorPx * plano.mPorPx : null;
  return px.length > 1 ? longitud(px) * plano.mPorPx : null;
}

export const textoMedida = (plano, m) => formatoMedida(valorMedida(plano, m), m.tipo);

/* Dónde va la etiqueta: en medio del último tramo o en el centro del área. */
export function puntoEtiqueta(m) {
  const p = m.puntos;
  if (m.tipo === 'area' && p.length > 2) {
    return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  }
  if (p.length < 2) return p[0] || [0, 0];
  const a = p[p.length - 2], b = p[p.length - 1];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/* Pinta las medidas en un lienzo del tamaño (w, h) — para el informe. */
export function pintarMedidas(ctx, plano, medidas, w, h) {
  const grosor = Math.max(2, Math.max(w, h) * 0.0016);
  const fuente = Math.max(12, Math.max(w, h) * 0.011);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const m of medidas) {
    const pts = m.puntos.map(([x, y]) => [x * w, y * h]);
    if (pts.length < 2) continue;
    ctx.strokeStyle = COLOR_MEDIDA;
    ctx.lineWidth = grosor;
    ctx.setLineDash(m.tipo === 'area' ? [] : [grosor * 3, grosor * 2]);
    ctx.beginPath();
    pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
    if (m.tipo === 'area') {
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,107,44,.14)';
      ctx.fill();
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of pts) {
      ctx.beginPath(); ctx.arc(x, y, grosor * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_MEDIDA; ctx.fill();
    }
    const [ex, ey] = puntoEtiqueta(m);
    const texto = textoMedida(plano, m);
    ctx.font = `700 ${Math.round(fuente)}px Inter, Arial, sans-serif`;
    const ancho = ctx.measureText(texto).width + fuente * 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = COLOR_MEDIDA;
    ctx.lineWidth = Math.max(1, grosor * 0.6);
    ctx.beginPath();
    ctx.roundRect(ex * w - ancho / 2, ey * h - fuente * 0.8, ancho, fuente * 1.6, fuente * 0.35);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#121826';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, ex * w, ey * h + fuente * 0.05);
  }
  ctx.restore();
}
