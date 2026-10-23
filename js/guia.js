/* Recorridos guiados: iluminan los botones de verdad de la app y explican
   cada uno en un globo (Siguiente / Atrás / Salir).

   Uso:  window.crdGuia.empezar('visita')   o   pagina.html?guia=visita
   Un recorrido puede seguir en otra página (sessionStorage «crd-guia»).
   La visita de ejemplo (id «guia-ejemplo», datos inventados) sirve para
   practicar sin tocar las visitas reales; al final se ofrece borrarla.
   La primera vez que se abre la app se ofrece el recorrido de inicio
   (localStorage «crd-guia-ofrecida»). */

const EJEMPLO = 'guia-ejemplo';
const pagina = (location.pathname.split('/').pop() || 'index.html').replace(/\?.*$/, '');
const $ = (s) => (typeof s === 'function' ? s() : document.querySelector(s));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (n) => n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';

async function hasta(sel, ms = 6000) {
  const fin = performance.now() + ms;
  while (performance.now() < fin) {
    const n = $(sel);
    if (visible(n)) return n;
    await esperar(120);
  }
  return null;
}

/* --- visita de ejemplo --- */

async function crearEjemplo() {
  const { guardarVisita, leerVisita } = await import('./partes.js');
  if (await leerVisita(EJEMPLO)) return;
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  const ahora = Date.now();
  await guardarVisita({
    id: EJEMPLO,
    fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`,
    hora: '08:00',
    obra: 'Obra de ejemplo (guía)',
    obraId: null,
    autor: 'Tu nombre – Supervisor',
    clima: ['Soleado'],
    temperatura: '24 / 31 °C',
    jornada: 'Normal',
    personal: [
      { id: 'g1', empresa: 'Constructora Ejemplo', oficio: 'Albañiles', numero: '8' },
      { id: 'g2', empresa: 'Instalaciones Ejemplo', oficio: 'Electricistas', numero: '3' }
    ],
    trabajos: '08:15 · Replanteo de muros en planta 2\n10:30 · Vaciado de columnas eje B',
    maquinaria: 'Mezcladora, andamios',
    materiales: '20 sacos de cemento',
    incidencias: [{ id: 'gi1', texto: 'Falta acero en la columna C-4 (ejemplo)', gravedad: 'media', estado: 'abierta', desde: '', hora: '09:10' }],
    fotos: [], notas: [], trazos: [], medidas: [],
    observaciones: 'Esta visita es de práctica: puedes escribir, probar y borrarla al final.',
    firma: null,
    creada: ahora,
    modificada: ahora
  });
}

async function borrarEjemplo() {
  const { borrarVisita } = await import('./partes.js');
  await borrarVisita(EJEMPLO).catch(() => {});
  if (location.hash.includes(EJEMPLO)) location.hash = '';
}

/* --- recorridos ---
   paso: { sel, titulo, texto, antes?: async fn, centrado?, final? } */

const RECORRIDOS = {
  inicio: {
    pagina: 'visita.html',
    titulo: 'Primeros pasos',
    pasos: [
      { titulo: 'Bienvenido a COORDINATE · Obra', texto: 'En un minuto te enseño lo principal. Todo se guarda en el teléfono según escribes, aunque no haya señal.', centrado: true },
      { sel: '#btn-nueva', titulo: 'Nueva visita', texto: 'Empieza el parte del día. Copia la obra, el personal y las incidencias abiertas de la visita anterior.' },
      { sel: '#buscar', titulo: 'Buscar', texto: 'Busca por obra, trabajos, incidencias, notas de planos o pinturas.' },
      { sel: '#lista', titulo: 'Tus visitas', texto: 'Cada tarjeta es un parte. Las de tu equipo llevan la etiqueta «Nueva» o «Actualizada».' },
      { sel: '#grupo-equipo', titulo: 'Cuenta y equipo', texto: 'Entra con tu cuenta para compartir obras, invitar a tu equipo con un papel (administrador, editor, lector o contratista) y crear equipos de trabajo.' },
      { sel: '#avisos-calidad', titulo: 'Avisos de calidad', texto: 'Probetas que toca romper hoy o vencidas, y protocolos de inspección sin cerrar.' },
      { sel: '.barra-superior .boton-menu', titulo: 'El menú', texto: 'Toca el símbolo de COORDINATE: abre todas las funciones (visitas, inspecciones, vaciados, modelo 3D, panel, perfil, cuentas vinculadas, copia de seguridad) y el modo claro u oscuro. Un punto rojo avisa de novedades o roturas.' },
      { titulo: '¿Seguimos con una visita?', texto: 'Te abro una visita de ejemplo (datos inventados) para enseñarte cada parte del parte de obra.', centrado: true, siguiente: 'visita' }
    ]
  },

  visita: {
    pagina: 'visita.html',
    titulo: 'El parte de visita',
    preparar: async () => {
      await crearEjemplo();
      if (!location.hash.includes(EJEMPLO)) location.hash = `#/v/${EJEMPLO}`;
      await hasta('#vista-ficha');
      await esperar(300);
    },
    pasos: [
      { titulo: 'Visita de ejemplo', texto: 'Es una visita de práctica con datos inventados. Toca y escribe lo que quieras: al final te ofrezco borrarla.', centrado: true },
      { sel: '#ficha [data-campo="fecha"]', titulo: 'Fecha y hora', texto: 'Se ponen solas al crear la visita; puedes cambiarlas.' },
      { sel: '#ficha [data-campo="obra"]', titulo: 'Obra y autor', texto: 'El nombre de la obra une las visitas, repasos y planos. Si compartes la obra, se sincroniza con tu equipo.' },
      { sel: '#btn-clima', titulo: 'Tiempo del lugar', texto: 'Toma la temperatura y el tiempo de donde estás (ubicación aproximada). Al abrir la visita del día lo hace solo.' },
      { sel: '#jornadas', titulo: 'Jornada', texto: 'Normal, parcial o sin actividad. Si se perdió tiempo, marca la causa (lluvia, paro…) y las horas: se suman en Seguimiento → Días afectados.' },
      { sel: '#personal', titulo: 'Personal en obra', texto: 'Empresa, oficio y número de personas. La app te propone las empresas y oficios que ya has escrito.' },
      { sel: '#ficha [data-campo="trabajos"]', titulo: 'Trabajos realizados', texto: 'Cada línea nueva empieza con la hora del teléfono, así queda la línea de tiempo del día. El corrector y las sugerencias te ayudan a escribir.' },
      { sel: () => document.querySelector('#ficha [data-campo="trabajos"]')?.closest('.con-dictado')?.querySelector('.boton-dictado'), titulo: 'Dictado por voz', texto: 'Toca el micrófono y habla. Di «coma», «punto y seguido» o «punto y aparte» para puntuar.' },
      { sel: '#incidencias', titulo: 'Incidencias', texto: 'Con su gravedad y hora. Las que no marques como resueltas pasan solas a la visita siguiente.' },
      { sel: '#repasos', titulo: 'Punch list (repasos)', texto: 'Defectos de terminación con zona, responsable y fotos de antes y después. Siguen abiertos de visita en visita hasta cerrarlos.' },
      { sel: '#btn-plano', titulo: 'Planos y notas', texto: 'Carga un PDF, un DXF o una imagen. Encima pones notas numeradas con fotos, dibujas a mano y mides distancias y áreas (botón 📏).' },
      { sel: '#btn-camara', titulo: 'Fotos', texto: 'Desde la cámara o la galería; se guardan reducidas para no llenar el teléfono.' },
      { sel: '#firma-caja', titulo: 'Firma', texto: 'Bloqueada hasta pulsar «Firmar», para que un roce no deje trazos. También puedes adjuntar una foto de tu firma y guardarla como «mi firma».' },
      { sel: '#btn-informe', titulo: 'Informe en PDF', texto: 'Parte profesional con número de documento, ficha, línea de tiempo, incidencias, planos con notas y medidas, fotos y firmas.' },
      { sel: '#btn-interactivo', titulo: 'Informe interactivo', texto: 'Un archivo .html para enviar: el cliente toca las notas del plano y ve sus fotos.' },
      { sel: '#btn-correo', titulo: 'Enviar y guardar', texto: 'Por correo con tu Gmail u Outlook, a tu Drive u OneDrive, o «Compartir resumen» por WhatsApp.' },
      { titulo: 'Listo', texto: '¿Borro la visita de ejemplo? Si quieres seguir practicando, déjala y bórrala luego desde la propia visita.', centrado: true, final: 'ejemplo' }
    ]
  },

  plano: {
    pagina: 'visita.html',
    titulo: 'Planos: notas, dibujo y medidas',
    pasos: [
      { sel: '#plano-marco', titulo: 'Moverse por el plano', texto: 'Arrastra con un dedo, pellizca con dos para acercar, doble toque para ampliar.' },
      { sel: '#plano-modo', titulo: 'Notas', texto: 'Pulsa «+ Nota» y toca el sitio. Cada nota lleva número, tipo, texto, fotos, tonos de pintura y enlaces.' },
      { sel: '#plano-dibujar', titulo: 'Dibujar', texto: 'Marca a mano alzada con colores y grosores; con la goma borras trazos.' },
      { sel: '#plano-medir', titulo: 'Medir', texto: 'Distancia, recorrido o área. Un PDF necesita escala: elige 1:50, 1:100… o «Calibrar con una cota» tocando los extremos de una medida conocida. Los DXF ya traen la escala.' },
      { sel: '#plano-cerrar', titulo: 'Volver', texto: 'Las notas, dibujos y medidas son de esta visita y salen en sus informes.' }
    ]
  },

  modelo: {
    pagina: 'index.html',
    titulo: 'Modelo 3D y planos DXF',
    pasos: [
      { sel: '#btn-abrir-2', titulo: 'Abrir', texto: 'Un modelo IFC (exportado de Revit u otro programa) o un plano DXF de AutoCAD. El último IFC queda guardado y se abre solo.' },
      { sel: '#btn-ejemplo', titulo: 'Modelo de ejemplo', texto: 'Para practicar. Lo abro ahora.', despues: async () => { $('#btn-ejemplo')?.click(); await hasta('#btn-panel:not([disabled])', 20000); await esperar(800); } },
      { sel: '#btn-panel', titulo: 'Panel', texto: 'Filtra por planta y categoría, busca elementos, mira sus propiedades, colorea por propiedad y ajusta la vista.' },
      { sel: '#btn-encuadrar', titulo: 'Encuadrar', texto: 'Vuelve a ver el modelo entero.' },
      { sel: '#btn-medir', titulo: 'Medir', texto: 'Distancias entre puntos del modelo, con enganche a vértices y aristas.' },
      { sel: '#btn-cortes', titulo: 'Cortes', texto: 'Planos de corte y caja de sección para ver por dentro.' },
      { sel: '#btn-vista', titulo: 'Vista', texto: 'Fondos, transparencias, aristas, luz y rejilla.' },
      { sel: '#lienzo', titulo: 'Tocar un elemento', texto: 'Muestra su ficha: aislar, ocultar, transparentar, rayos X y todas sus propiedades.', centrado: true },
      { sel: '#btn-ar', titulo: 'Ver en obra', texto: 'Realidad aumentada en los teléfonos que la admiten: el modelo sobre el terreno.' },
      { sel: '#btn-abrir', titulo: 'Planos DXF', texto: 'Al abrir un .dxf se ve en 2D con sus capas y puedes medir con enganche, como en AutoCAD. (Desde AutoCAD: Guardar como → AutoCAD DXF.)' }
    ]
  },

  panel: {
    pagina: 'panel.html',
    titulo: 'Panel del equipo',
    pasos: [
      { sel: '#pestanas', titulo: 'Diario y semanal', texto: 'El resumen del día (quién fue, trabajos, incidencias) o de la semana (por día, por persona, incidencias, repasos, personal y clima).' },
      { sel: '#obra', titulo: 'Obra', texto: 'Todas tus obras o una sola.' },
      { sel: '.panel-fecha', titulo: 'Fecha', texto: 'Cambia de día o de semana con las flechas.' },
      { sel: '#imprimir', titulo: 'Reporte en PDF', texto: 'Guarda o imprime el resumen con la marca de COORDINATE.' },
      { sel: '#novedades', titulo: 'Novedades', texto: 'Las bitácoras de tu equipo que aún no has abierto.' }
    ]
  },

  calidad: {
    pagina: 'calidad.html',
    titulo: 'Inspecciones y vaciados',
    pasos: [
      { sel: '.pestanas-calidad', titulo: 'Inspecciones y vaciados', texto: 'Dos registros de calidad por obra: los protocolos de inspección con su liberación y los vaciados de hormigón con sus probetas.' },
      { sel: '#btn-nuevo', titulo: 'Nueva inspección', texto: 'Elige la partida (acero, encofrado, liberación para vaciar, instalaciones, impermeabilización, drywall, cerámica, pintura o libre). Cada punto se marca Cumple / No cumple / N/A, con nota y foto.' },
      { titulo: 'Liberar o rechazar', texto: 'Con el checklist revisado, marca el resultado y firma la liberación. Los «No cumple» pasan al punch list con un toque y el acta sale en PDF.', centrado: true },
      { sel: '#pestana-vaciados', titulo: 'Vaciados de hormigón', texto: 'Elemento, f\'c, revenimiento y volumen; cada camión con su conduce, m³, hora y revenimiento medido (avisa si se sale ±1").', antes: async () => { if (!location.hash.startsWith('#/vaciado')) location.hash = '#/vaciados'; await esperar(400); } },
      { sel: () => document.querySelector('#agenda:not([hidden])') || document.querySelector('#lista'), titulo: 'Probetas y roturas', texto: '«+ Juego» crea las probetas de 7 y 28 días. El día de cada rotura sale el aviso aquí, en el inicio y en el menú; anota el resultado y la app calcula el % de f\'c.' }
    ]
  },

  seguimiento: {
    pagina: 'seguimiento.html',
    titulo: 'Avance, minutas y días afectados',
    pasos: [
      { sel: '.pestanas-calidad', titulo: 'Seguimiento de la obra', texto: 'Avance por partida con su curva S, minutas de reunión con acuerdos y días afectados por lluvia, paros u otras causas.', antes: async () => { if (location.hash !== '#/avance') location.hash = '#/avance'; await esperar(500); } },
      { sel: '#filtro-obras', titulo: 'Obra', texto: 'Cada obra tiene su programa: partidas con peso y fechas.' },
      { sel: () => document.querySelector('.indicadores') || document.querySelector('#contenido .grupo'), titulo: 'Programado frente a real', texto: 'Crea el programa (con partidas típicas o las tuyas). Luego verás lo programado hoy, el avance real, la desviación y el índice de cumplimiento.' },
      { sel: '.curva', titulo: 'Curva S', texto: 'Naranja discontinua: programado. Azul: real. Toca la curva para ver los valores de cada fecha.' },
      { sel: '.partidas', titulo: 'Anotar el avance', texto: 'Mueve la barra de cada partida al % ejecutado: se guarda con la fecha de hoy. La raya naranja es lo que tocaba.' },
      { sel: '#pestana-minutas', titulo: 'Minutas', texto: 'Cada reunión con asistentes, temas y acuerdos con responsable y fecha. Los abiertos pasan a la siguiente; los vencidos avisan en el inicio.', antes: async () => { location.hash = '#/minutas'; await esperar(500); } },
      { sel: '#pestana-dias', titulo: 'Días afectados', texto: 'Se suman de las visitas con jornada parcial o sin actividad, por causa. Relación en PDF para pedir prórroga.', antes: async () => { location.hash = '#/dias'; await esperar(500); } }
    ]
  },

  perfil: {
    pagina: 'perfil.html',
    titulo: 'Perfil y obras',
    pasos: [
      { sel: '#mi-perfil', titulo: 'Tu perfil', texto: 'Nombre, cargo, empresa y foto: lo ven los miembros de tus obras. El teléfono sólo lo ves tú.' },
      { sel: '#mis-obras', titulo: 'Tus obras', texto: 'Con tu papel en cada una. «Espacio de la obra» muestra su equipo, cifras, bitácoras recientes e incidencias abiertas.' },
      { sel: '#mis-bitacoras', titulo: 'Tus bitácoras', texto: 'Las últimas que has hecho, en todas tus obras.' },
      { sel: '#grupo-equipo', titulo: 'Cuenta y equipo', texto: 'Entrar desde el ordenador, compartir obras, invitar y gestionar equipos de trabajo.' }
    ]
  }
};

/* --- pantalla --- */

let capa = null, foco = null, globo = null;
let actual = null;   // { id, i }
let direccion = 1;   // al saltar pasos sin botón visible

function montar() {
  if (capa) return;
  capa = document.createElement('div');
  capa.className = 'guia-capa';
  foco = document.createElement('div');
  foco.className = 'guia-foco';
  globo = document.createElement('div');
  globo.className = 'guia-globo';
  globo.setAttribute('role', 'dialog');
  globo.setAttribute('aria-live', 'polite');
  capa.append(foco, globo);
  document.body.appendChild(capa);
  addEventListener('resize', () => actual && colocar());
  addEventListener('scroll', () => actual && colocar(), true);
  document.addEventListener('keydown', (ev) => {
    if (!actual) return;
    if (ev.key === 'Escape') terminar();
    if (ev.key === 'ArrowRight') ir(1);
    if (ev.key === 'ArrowLeft') ir(-1);
  });
}

function boton(texto, clase, accion) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clase;
  b.textContent = texto;
  b.onclick = accion;
  return b;
}

let objetivo = null;
function colocar() {
  const r = objetivo && visible(objetivo) ? objetivo.getBoundingClientRect() : null;
  const m = 6;
  if (r) {
    foco.hidden = false;
    foco.style.left = `${r.left - m}px`;
    foco.style.top = `${r.top - m}px`;
    foco.style.width = `${r.width + m * 2}px`;
    foco.style.height = `${r.height + m * 2}px`;
  } else {
    foco.hidden = true;
  }
  capa.classList.toggle('sin-foco', !r);
  const ancho = Math.min(360, innerWidth - 24);
  globo.style.width = `${ancho}px`;
  const g = globo.getBoundingClientRect();
  let x, y;
  if (!r) {
    x = (innerWidth - ancho) / 2;
    y = Math.max(16, (innerHeight - g.height) / 2);
  } else {
    x = Math.min(innerWidth - ancho - 12, Math.max(12, r.left + r.width / 2 - ancho / 2));
    const abajo = r.bottom + m + 12, arriba = r.top - m - 12 - g.height;
    y = abajo + g.height < innerHeight - 8 ? abajo : arriba > 8 ? arriba : Math.max(8, innerHeight - g.height - 8);
  }
  globo.style.left = `${x}px`;
  globo.style.top = `${y}px`;
}

async function mostrar() {
  const rec = RECORRIDOS[actual.id];
  const paso = rec.pasos[actual.i];
  montar();
  capa.hidden = false;
  document.documentElement.classList.add('con-guia');
  if (paso.antes) await paso.antes();
  objetivo = paso.sel && !paso.centrado ? await hasta(paso.sel, 900) : null;
  // Un botón que no está en pantalla (p. ej. 👥 sin cuenta): se salta el paso.
  if (paso.sel && !paso.centrado && !objetivo) {
    const i = actual.i + direccion;
    if (i >= 0 && i < rec.pasos.length) { actual.i = i; guardarEstado(); return mostrar(); }
  }
  if (objetivo) {
    objetivo.scrollIntoView({ block: 'center', behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    await esperar(60);
  }
  const total = rec.pasos.length;
  globo.replaceChildren();
  const cab = document.createElement('div');
  cab.className = 'guia-cabecera';
  cab.append(Object.assign(document.createElement('span'), { className: 'guia-contador', textContent: `${rec.titulo} · ${actual.i + 1} de ${total}` }),
    boton('✕', 'guia-cerrar', terminar));
  const h = Object.assign(document.createElement('h3'), { textContent: paso.titulo });
  const p = Object.assign(document.createElement('p'), { textContent: paso.texto });
  const fila = document.createElement('div');
  fila.className = 'guia-botones';
  if (actual.i > 0) fila.append(boton('Atrás', 'boton', () => ir(-1)));
  else if (total > 1 && !paso.siguiente) fila.append(boton('Ahora no', 'boton', terminar));
  if (paso.final === 'ejemplo') {
    fila.append(boton('Dejarla', 'boton', terminar),
      boton('Borrar el ejemplo', 'boton boton-destacado', async () => { await borrarEjemplo(); terminar(); }));
  } else if (paso.siguiente) {
    fila.append(boton('Ahora no', 'boton', terminar), boton('Sí, sigamos', 'boton boton-destacado', () => empezar(paso.siguiente)));
  } else {
    fila.append(boton(actual.i === total - 1 ? 'Terminar' : 'Siguiente', 'boton boton-destacado', () => ir(1)));
  }
  globo.append(cab, h, p, fila);
  colocar();
  globo.querySelector('.boton-destacado')?.focus({ preventScroll: true });
}

async function ir(delta) {
  if (!actual) return;
  const rec = RECORRIDOS[actual.id];
  const paso = rec.pasos[actual.i];
  if (delta > 0 && paso.despues) await paso.despues();
  const i = actual.i + delta;
  direccion = delta < 0 ? -1 : 1;
  if (i < 0) return;
  if (i >= rec.pasos.length) return terminar();
  actual.i = i;
  guardarEstado();
  mostrar();
}

function guardarEstado() {
  try { sessionStorage.setItem('crd-guia', JSON.stringify(actual)); } catch (e) { /* sin memoria */ }
}

function terminar() {
  actual = null;
  objetivo = null;
  try { sessionStorage.removeItem('crd-guia'); } catch (e) { /* nada */ }
  if (capa) capa.hidden = true;
  document.documentElement.classList.remove('con-guia');
}

export async function empezar(id, i = 0) {
  const rec = RECORRIDOS[id];
  if (!rec) return;
  try { localStorage.setItem('crd-guia-ofrecida', '1'); } catch (e) { /* nada */ }
  if (rec.pagina !== pagina) {
    try { sessionStorage.setItem('crd-guia', JSON.stringify({ id, i })); } catch (e) { /* nada */ }
    location.href = `./${rec.pagina}`;
    return;
  }
  actual = { id, i };
  direccion = 1;
  guardarEstado();
  if (rec.preparar) {
    montar();
    capa.hidden = false;
    globo.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Preparando…' }));
    objetivo = null;
    colocar();
    await rec.preparar();
  }
  mostrar();
}

export const recorridos = () => Object.entries(RECORRIDOS).map(([id, r]) => ({ id, titulo: r.titulo, pagina: r.pagina, pasos: r.pasos.length }));

window.crdGuia = { empezar, recorridos, borrarEjemplo };

/* --- arranque: seguir un recorrido, ?guia=…, o ofrecer el de inicio --- */

(async function arrancar() {
  await esperar(400);
  const pedido = new URLSearchParams(location.search).get('guia');
  if (pedido && RECORRIDOS[pedido]) {
    history.replaceState(null, '', location.pathname + location.hash);
    return empezar(pedido);
  }
  let pendiente = null;
  try { pendiente = JSON.parse(sessionStorage.getItem('crd-guia')); } catch (e) { /* nada */ }
  if (pendiente && RECORRIDOS[pendiente.id] && RECORRIDOS[pendiente.id].pagina === pagina) {
    return empezar(pendiente.id, pendiente.i || 0);
  }
  // Primera vez en la app: se ofrece el recorrido (tras la bienvenida).
  let ofrecida = true;
  try { ofrecida = Boolean(localStorage.getItem('crd-guia-ofrecida')); } catch (e) { /* nada */ }
  if (!ofrecida && pagina === 'visita.html' && !location.hash) {
    await hasta(() => { const b = document.getElementById('bienvenida'); return !b || b.hidden ? document.body : null; }, 9000);
    await esperar(500);
    if (actual) return;
    empezar('inicio');
  }
}());
