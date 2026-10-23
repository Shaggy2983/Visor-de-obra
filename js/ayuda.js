/* Guía de uso (ayuda.html): todas las funciones con sus pasos, buscador y
   enlace a los recorridos interactivos de js/guia.js. */

import { el } from './utiles.js';

const SECCIONES = [
  {
    titulo: 'Parte de visita', icono: '📋', recorrido: 'visita',
    temas: [
      { t: 'Crear una visita', p: ['En Visitas pulsa «Nueva visita».', 'Se copian la obra, el autor, el personal y las incidencias abiertas de la visita anterior.', 'Todo se guarda solo según escribes, aunque no haya señal.'] },
      { t: 'Tiempo del lugar', p: ['Al abrir la visita del día, la app toma la temperatura y el tiempo de donde estás.', 'Para repetirlo: «📍 Tomar del lugar». Usa una ubicación aproximada.'] },
      { t: 'Personal en obra', p: ['«+ Añadir empresa u oficio» y el número de personas.', 'La app te propone las empresas y oficios que ya has escrito.'] },
      { t: 'Línea de tiempo de los trabajos', p: ['En «Trabajos realizados» cada línea nueva empieza con la hora («08:15 · …»).', 'Pulsa Intro para la siguiente actividad: queda el registro del día.'] },
      { t: 'Dictado por voz', p: ['Toca el micrófono 🎤 de cualquier cuadro de texto y habla.', 'Di «coma», «dos puntos», «punto y seguido» o «punto y aparte».', 'Necesita señal; la primera vez pide permiso del micrófono.'] },
      { t: 'Corrector y texto predictivo', p: ['El teclado corrige en español e inglés.', 'Al escribir aparecen frases que ya usaste: tócalas para completarlas.'] },
      { t: 'Incidencias', p: ['«+ Añadir incidencia» con su gravedad (leve, media, grave).', 'Marca «Resuelta» cuando se arregle: guarda la hora.', 'Las abiertas pasan solas a la visita siguiente.'] },
      { t: 'Fotos', p: ['«Hacer foto» o «De la galería».', 'Puedes ligar fotos a una nota del plano.'] },
      { t: 'Firma', p: ['Pulsa «✍ Firmar», firma con el dedo y «Listo» (queda bloqueada).', '«📎 Adjuntar firma» usa una foto de tu firma en papel; «Guardar como mi firma» la deja lista para «⭐ Usar mi firma».', 'En una obra compartida, al firmar se ofrece enviar el parte al administrador.'] },
      { t: 'Informes', p: ['«Informe en PDF»: parte con número, ficha, cifras, trabajos por hora, incidencias, repasos, planos con notas y medidas, fotos y firmas.', '«Informe interactivo»: archivo .html donde se tocan las notas del plano y se ven sus fotos.'] },
      { t: 'Enviar y compartir', p: ['«Enviar por correo» con tu Gmail u Outlook vinculado (con el informe adjunto).', '«Guardar en la nube»: a tu Drive u OneDrive.', '«Compartir resumen»: texto para WhatsApp.'] }
    ]
  },
  {
    titulo: 'Planos, notas y medidas', icono: '📐', recorrido: 'visita',
    temas: [
      { t: 'Cargar un plano', p: ['En la visita: «+ Cargar plano» y elige un PDF, un DXF o una imagen.', 'El plano queda en la obra y sirve para todas sus visitas.'] },
      { t: 'Notas numeradas', p: ['En el plano pulsa «+ Nota» y toca el sitio.', 'Cada nota lleva tipo, texto, fotos, tonos de pintura y enlaces (fichas técnicas, catálogos).'] },
      { t: 'Dibujar a mano alzada', p: ['«✎ Dibujar», elige color y grosor y dibuja con un dedo.', 'Con dos dedos sigues moviendo el plano; «Goma» borra trazos.'] },
      { t: 'Medir distancias y áreas', p: ['En el plano pulsa 📏 y elige Distancia, Recorrido o Área.', 'Toca los puntos; puedes arrastrarlos para afinar. «Terminar» cierra recorridos y áreas.', 'Toca una medida para borrarla. Salen en el informe.'] },
      { t: 'Escala de un PDF', p: ['Si el PDF se imprimió a escala, elige 1:50, 1:100… en «Escala».', 'Si no, «Calibrar con una cota»: toca los extremos de una medida conocida y escribe cuánto mide.', 'También sirve para fotos y planos escaneados.'] },
      { t: 'Planos DXF', p: ['En AutoCAD: Guardar como → «AutoCAD 2018 DXF».', 'En la visita el DXF entra ya con su escala.', 'Une antes las referencias externas (BIND); sombreados e imágenes no se dibujan.'] }
    ]
  },
  {
    titulo: 'Punch list de terminaciones', icono: '✅', recorrido: 'visita',
    temas: [
      { t: 'Apuntar un repaso', p: ['En la visita: «+ Repaso con foto» (o sin foto).', 'Zona, tipo (pintura, pañete, cerámica…), qué corregir, responsable y prioridad.'] },
      { t: 'Estados', p: ['Pendiente → Corregido (al subir la foto de después) → Cerrado (cuando lo verificas).', 'Los no cerrados siguen en las próximas visitas de la obra.'] },
      { t: 'PDF para contratistas', p: ['«Punch list en PDF» con fotos de antes y después.', 'Con papel de contratista, cada uno ve y corrige sólo sus repasos.'] }
    ]
  },
  {
    titulo: 'Equipo y obras compartidas', icono: '👥', recorrido: 'inicio',
    temas: [
      { t: 'Cuenta', p: ['En Visitas → «Cuenta y equipo» → Entrar o Crear cuenta (o con Google).', 'Verifica tu correo para poder recibir invitaciones.'] },
      { t: 'Compartir una obra', p: ['«+ Compartir una obra» con el nombre de la obra.', 'Invita por correo con un papel: administrador, editor, solo lectura o contratista.', 'Avísale con «Enviar aviso» (WhatsApp o correo).'] },
      { t: 'Equipos de trabajo', p: ['«+ Crear un equipo» y añade a su gente.', 'Vincula el equipo a una obra con un papel: entran todos de una vez.'] },
      { t: 'Novedades', p: ['El botón 👥 de arriba muestra las bitácoras nuevas o cambiadas de tu equipo.', 'En la lista llevan la etiqueta «Nueva» o «Actualizada».'] },
      { t: 'Sincronización', p: ['Con señal se sincroniza al guardar, al volver la cobertura y cada 2 minutos.', 'Sin señal sigues trabajando: se sube después.'] }
    ]
  },
  {
    titulo: 'Panel y perfil', icono: '📊', recorrido: 'panel',
    temas: [
      { t: 'Resumen diario', p: ['Panel → Diario: bitácoras del día por obra, quién y a qué hora, firmadas, personal, trabajos e incidencias.', 'Avisa de las obras sin bitácora.'] },
      { t: 'Resumen semanal', p: ['Panel → Semanal: visitas por día y por persona, incidencias, repasos por responsable, personal y clima.', '«Reporte semanal en PDF» para enviarlo.'] },
      { t: 'Perfil', p: ['Perfil → «Editar perfil»: nombre, cargo, empresa, teléfono y foto.', 'Tus obras con tu papel y el espacio de cada obra (equipo, cifras, bitácoras).'], recorrido: 'perfil' }
    ]
  },
  {
    titulo: 'Modelo 3D y planos DXF', icono: '🧊', recorrido: 'modelo',
    temas: [
      { t: 'Abrir un modelo IFC', p: ['Modelo 3D → «Abrir» y elige el .ifc (exportado de Revit u otro programa).', 'Queda guardado y se abre solo la próxima vez.'] },
      { t: 'Explorar el modelo', p: ['Toca un elemento: ficha, propiedades, aislar, ocultar, transparentar, rayos X.', 'Panel: plantas, categorías, buscar y colorear por propiedad.'] },
      { t: 'Medir, cortar y vista', p: ['«Medir» entre puntos del modelo.', '«Cortes»: planos y caja de sección.', '«Vista»: fondos, aristas, transparencia y luz.'] },
      { t: 'Ver en obra (realidad aumentada)', p: ['«Ver en obra» en los teléfonos que lo admiten: el modelo sobre el sitio real.'] },
      { t: 'Planos DXF en 2D', p: ['«Abrir» y elige un .dxf: se ve con sus capas (botón «Capas»).', '📏 Medir con enganche a extremos, centros y puntos medios: medida exacta.', 'Los DWG no se abren: guárdalos como DXF.'] }
    ]
  },
  {
    titulo: 'Ajustes y copia de seguridad', icono: '⚙️', recorrido: 'inicio',
    temas: [
      { t: 'Modo claro u oscuro', p: ['⚙️ → Aspecto: oscuro, claro o como el teléfono.', 'Si sigue oscuro, quita en el navegador del teléfono el «tema oscuro para sitios».'] },
      { t: 'Actualizaciones', p: ['Cuando sale «Hay una versión nueva · Tocar para actualizar», tócalo.'] },
      { t: 'Copia de seguridad', p: ['Visitas → «Exportar copia»: un archivo con todo (visitas, fotos, planos, repasos).', '«Importar copia» en otro teléfono, o «En la nube…» con tu cuenta vinculada.'] },
      { t: 'Cuentas vinculadas', p: ['Vincula Google (Gmail y Drive) o Microsoft (Outlook y OneDrive) para enviar y guardar los partes.'] }
    ]
  }
];

const quitarTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function pintar(filtro = '') {
  const f = quitarTildes(filtro.trim());
  const palabras = f.split(/\s+/).filter(Boolean);
  let hay = 0;
  const nodos = SECCIONES.map((s) => {
    // Cada palabra por su raíz («medir» encuentra «medidas»).
    const temas = s.temas.filter((x) => {
      const texto = quitarTildes(`${s.titulo} ${x.t} ${x.p.join(' ')}`);
      return !palabras.length || palabras.every((w) => texto.includes(w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) : w));
    });
    if (!temas.length) return null;
    hay += temas.length;
    return el('section', { class: 'grupo ayuda-seccion' },
      el('div', { class: 'grupo-cabecera' },
        el('h2', {}, `${s.icono} ${s.titulo}`),
        el('button', { type: 'button', class: 'enlace', 'data-recorrido': s.recorrido }, '▶ Ver recorrido')),
      ...temas.map((x) => el('details', { class: 'ayuda-tema', open: palabras.length > 0 },
        el('summary', {}, x.t),
        el('ol', {}, ...x.p.map((paso) => el('li', {}, paso))),
        x.recorrido && el('button', { type: 'button', class: 'enlace', 'data-recorrido': x.recorrido }, '▶ Ver recorrido'))));
  }).filter(Boolean);
  document.getElementById('temas').replaceChildren(...nodos);
  document.getElementById('sin-resultados').hidden = hay > 0;
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-recorrido]');
  if (!b) return;
  const id = b.dataset.recorrido;
  if (window.crdGuia) window.crdGuia.empezar(id);
  else location.href = `./visita.html?guia=${id}`;
});
document.getElementById('buscar-ayuda').addEventListener('input', (ev) => pintar(ev.target.value));
pintar();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
