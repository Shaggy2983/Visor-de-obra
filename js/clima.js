/* Tiempo del lugar de la obra: la ubicación aproximada del teléfono y el
   servicio libre Open-Meteo (sin clave ni pago). Devuelve la temperatura
   actual y los estados de la lista de la visita (Soleado, Nublado…).

   La ubicación se redondea a 2 decimales (~1 km) antes de enviarla y no se
   guarda en ningún sitio: sólo se usa para preguntar el tiempo. */

const SERVICIO = 'https://api.open-meteo.com/v1/forecast';

function posicion() {
  return new Promise((resolver, rechazar) => {
    if (!navigator.geolocation) { rechazar(new Error('sin-ubicacion')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolver(p.coords),
      (e) => rechazar(new Error(e.code === 1 ? 'permiso' : 'ubicacion')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30 * 60 * 1000 }
    );
  });
}

/* Códigos WMO de Open-Meteo → estados de la visita. */
function estados(codigo, viento, temperatura) {
  const lista = [];
  if (codigo <= 1) lista.push('Soleado');
  else if (codigo <= 3) lista.push('Nublado');
  else if (codigo === 45 || codigo === 48) lista.push('Niebla');
  else if ((codigo >= 51 && codigo <= 67) || (codigo >= 80 && codigo <= 82) || codigo >= 95) lista.push('Lluvia');
  if (viento >= 35) lista.push('Viento');
  if (temperatura >= 32) lista.push('Calor');
  if (temperatura <= 0) lista.push('Helada');
  return lista;
}

/* ¿Se puede pedir sin molestar? 'denied' = el usuario dijo que no. */
export async function permisoUbicacion() {
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' });
    return p.state;
  } catch {
    return 'prompt';
  }
}

export async function climaActual() {
  if (!navigator.onLine) throw new Error('sin-senal');
  const c = await posicion();
  const lat = c.latitude.toFixed(2);
  const lon = c.longitude.toFixed(2);
  const url = `${SERVICIO}?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto';
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('servicio');
  const d = (await r.json()).current;
  const t = Math.round(d.temperature_2m);
  return {
    temperatura: `${t} °C`,
    clima: estados(d.weather_code, d.wind_speed_10m, d.temperature_2m)
  };
}
