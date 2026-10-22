/* Cuentas del panel del administrador: resumen de un día y de una semana
   a partir de las visitas y repasos de una o varias obras. Sólo cálculo,
   sin pantalla (panel.js y perfil.js pintan). Fechas en «AAAA-MM-DD». */

const dos = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const deIso = (t) => { const [a, m, d] = t.split('-').map(Number); return new Date(a, m - 1, d); };

export function sumarDias(fecha, n) {
  const d = deIso(fecha);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/* Lunes de la semana de una fecha. */
export function lunes(fecha) {
  const d = deIso(fecha);
  const dia = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dia);
  return iso(d);
}

export const diasDeSemana = (inicio) => Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));

const entre = (f, desde, hasta) => Boolean(f) && f >= desde && f <= hasta;
const fechaDeMs = (ms) => (ms ? iso(new Date(ms)) : '');

export const personasDe = (v) => (v.personal || []).reduce((s, p) => s + (Number(p.numero) || 0), 0);
export const firmada = (v) => Boolean(v.firmaRuta || v.firma);
export const autorDe = (v, nombreDe) => (v.autor || '').trim() || (nombreDe && nombreDe(v._autor)) || 'Sin autor';

export function estadoRepaso(r, fecha) {
  if (r.cerrado && r.cerrado <= fecha) return 'cerrado';
  if (r.corregido && r.corregido <= fecha) return 'corregido';
  return 'pendiente';
}
const altaRepaso = (r) => r.desde || fechaDeMs(r.creado);

/* Primeras líneas de los trabajos, sin la hora delante. */
export function extracto(texto, lineas = 3) {
  return String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, lineas);
}

/* Incidencias únicas de una obra (viajan de visita en visita con el mismo
   id): el estado de cada una es el de la última visita hasta «hasta». */
export function incidencias(visitas, hasta) {
  const mapa = new Map();
  const ordenadas = visitas.filter((v) => v.fecha && v.fecha <= hasta)
    .sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  for (const v of ordenadas) {
    for (const i of v.incidencias || []) {
      if (!i.texto && !i.id) continue;
      const previa = mapa.get(i.id);
      mapa.set(i.id, {
        ...i,
        alta: (previa && previa.alta) || i.desde || v.fecha,
        obra: v.obra,
        ultimaVisita: v.fecha
      });
    }
  }
  return [...mapa.values()];
}

const abierta = (i) => i.estado !== 'cerrada';

/* ---------------- día ---------------- */

/* obras: [{ obra: {id, nombre}, visitas, repasos }] */
export function resumenDia(obras, fecha, nombreDe) {
  const filas = obras.map(({ obra, visitas, repasos }) => {
    const delDia = visitas.filter((v) => v.fecha === fecha)
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    const inc = incidencias(visitas, fecha);
    const reps = repasos.filter((r) => altaRepaso(r) <= fecha);
    return {
      obra,
      visitas: delDia.map((v) => ({
        id: v.id, hora: v.hora || '', autor: autorDe(v, (u) => nombreDe(obra, u)),
        personas: personasDe(v), firmada: firmada(v), clima: v.clima || [], temperatura: v.temperatura || '',
        jornada: v.jornada || 'Normal', trabajos: extracto(v.trabajos, 4), fotos: (v.fotos || []).length,
        incidenciasAbiertas: (v.incidencias || []).filter(abierta).length
      })),
      personas: Math.max(0, ...delDia.map(personasDe)),
      incNuevas: inc.filter((i) => i.alta === fecha),
      incResueltas: inc.filter((i) => !abierta(i) && i.resueltaFecha === fecha),
      incAbiertas: inc.filter(abierta),
      repNuevos: reps.filter((r) => altaRepaso(r) === fecha).length,
      repCorregidos: reps.filter((r) => r.corregido === fecha).length,
      repCerrados: reps.filter((r) => r.cerrado === fecha).length,
      repAbiertos: reps.filter((r) => estadoRepaso(r, fecha) !== 'cerrado').length
    };
  });
  const suma = (f) => filas.reduce((s, x) => s + f(x), 0);
  return {
    fecha,
    obras: filas,
    sinVisita: filas.filter((x) => !x.visitas.length).map((x) => x.obra),
    total: {
      visitas: suma((x) => x.visitas.length),
      firmadas: suma((x) => x.visitas.filter((v) => v.firmada).length),
      personas: suma((x) => x.personas),
      incNuevas: suma((x) => x.incNuevas.length),
      incAbiertas: suma((x) => x.incAbiertas.length),
      graves: suma((x) => x.incAbiertas.filter((i) => i.gravedad === 'grave').length),
      repAbiertos: suma((x) => x.repAbiertos)
    }
  };
}

/* ---------------- semana ---------------- */

export function resumenSemana(obras, inicio, nombreDe) {
  const dias = diasDeSemana(inicio);
  const fin = dias[6];
  const porObra = obras.map(({ obra, visitas, repasos }) => {
    const semana = visitas.filter((v) => entre(v.fecha, inicio, fin));
    const nombre = (u) => nombreDe(obra, u);

    const porDia = dias.map((d) => {
      const vs = semana.filter((v) => v.fecha === d);
      return {
        fecha: d,
        visitas: vs.length,
        autores: [...new Set(vs.map((v) => autorDe(v, nombre)))],
        personas: Math.max(0, ...vs.map(personasDe)),
        clima: [...new Set(vs.flatMap((v) => v.clima || []))],
        temperatura: vs.map((v) => v.temperatura).filter(Boolean)[0] || '',
        sinActividad: vs.length > 0 && vs.every((v) => v.jornada === 'Sin actividad'),
        parcial: vs.some((v) => v.jornada === 'Parcial')
      };
    });

    const personas = new Map();
    for (const v of semana) {
      const k = autorDe(v, nombre);
      const p = personas.get(k) || { nombre: k, visitas: 0, firmadas: 0, dias: new Set() };
      p.visitas++;
      if (firmada(v)) p.firmadas++;
      p.dias.add(v.fecha);
      personas.set(k, p);
    }

    const inc = incidencias(visitas, fin);
    const reps = repasos.filter((r) => altaRepaso(r) <= fin);
    const abiertosFin = reps.filter((r) => estadoRepaso(r, fin) !== 'cerrado');
    const porResponsable = new Map();
    for (const r of abiertosFin) {
      const k = (r.asignadoNombre || r.responsable || 'Sin responsable').trim() || 'Sin responsable';
      const x = porResponsable.get(k) || { responsable: k, pendiente: 0, corregido: 0 };
      x[estadoRepaso(r, fin)]++;
      porResponsable.set(k, x);
    }

    const conVisita = porDia.filter((d) => d.visitas);
    return {
      obra,
      visitas: semana.length,
      firmadas: semana.filter(firmada).length,
      diasConVisita: conVisita.length,
      porDia,
      porPersona: [...personas.values()].map((p) => ({ ...p, dias: p.dias.size }))
        .sort((a, b) => b.visitas - a.visitas),
      personal: {
        total: conVisita.reduce((s, d) => s + d.personas, 0),
        promedio: conVisita.length ? Math.round(conVisita.reduce((s, d) => s + d.personas, 0) / conVisita.length) : 0,
        maximo: Math.max(0, ...conVisita.map((d) => d.personas))
      },
      clima: {
        lluvia: conVisita.filter((d) => d.clima.includes('Lluvia')).length,
        sinActividad: conVisita.filter((d) => d.sinActividad).length,
        parcial: conVisita.filter((d) => d.parcial).length
      },
      incidencias: {
        nuevas: inc.filter((i) => entre(i.alta, inicio, fin)),
        resueltas: inc.filter((i) => !abierta(i) && entre(i.resueltaFecha, inicio, fin)),
        abiertas: inc.filter(abierta).sort((a, b) => ({ grave: 0, media: 1, leve: 2 }[a.gravedad] ?? 3) - ({ grave: 0, media: 1, leve: 2 }[b.gravedad] ?? 3))
      },
      repasos: {
        nuevos: reps.filter((r) => entre(altaRepaso(r), inicio, fin)).length,
        corregidos: reps.filter((r) => entre(r.corregido, inicio, fin)).length,
        cerrados: reps.filter((r) => entre(r.cerrado, inicio, fin)).length,
        abiertos: abiertosFin.length,
        porResponsable: [...porResponsable.values()].sort((a, b) => (b.pendiente + b.corregido) - (a.pendiente + a.corregido))
      }
    };
  });
  const suma = (f) => porObra.reduce((s, x) => s + f(x), 0);
  return {
    inicio, fin, dias,
    obras: porObra,
    total: {
      visitas: suma((x) => x.visitas),
      firmadas: suma((x) => x.firmadas),
      incNuevas: suma((x) => x.incidencias.nuevas.length),
      incResueltas: suma((x) => x.incidencias.resueltas.length),
      incAbiertas: suma((x) => x.incidencias.abiertas.length),
      repCerrados: suma((x) => x.repasos.cerrados),
      repAbiertos: suma((x) => x.repasos.abiertos),
      personasDia: suma((x) => x.personal.total)
    }
  };
}

/* Última bitácora de cada persona en una obra (uid o nombre → fecha). */
export function ultimaPorPersona(visitas) {
  const m = new Map();
  for (const v of visitas) {
    if (!v._autor || !v.fecha) continue;
    if (!m.has(v._autor) || m.get(v._autor) < v.fecha) m.set(v._autor, v.fecha);
  }
  return m;
}
