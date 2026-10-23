/* Guía de uso (ayuda.html): todas las funciones con sus pasos, buscador y
   enlace a los recorridos interactivos de js/guia.js. */

import { el } from './utiles.js';

const SECCIONES = [
  {
    titulo: 'Reporte de visita', icono: '📋', recorrido: 'visita',
    temas: [
      { t: 'Crear una visita', p: ['En Visitas toca «Nueva visita».', 'Se copian la obra, el autor, el personal y las incidencias abiertas de la visita anterior.', 'Todo se guarda solo según escribes, aunque no haya señal.'] },
      { t: 'Jornada afectada', p: ['Si la jornada es «Parcial» o «Sin actividad», marca la causa (lluvia, paro, falta de material…), las horas perdidas y un detalle.', 'Se suman en Seguimiento → Días afectados.'] },
      { t: 'Borrar varias visitas', p: ['En la lista de Visitas toca «Seleccionar varias» y toca las que quieras (o «Todas»: respeta lo que hayas buscado).', '«Borrar» pide confirmación; en obras compartidas también se borran para el equipo.'] },
      { t: 'Tiempo del lugar', p: ['Al abrir la visita del día, la app toma la temperatura y el tiempo de donde estás.', 'Para repetirlo: «📍 Tomar del lugar». Usa una ubicación aproximada.'] },
      { t: 'Personal en obra', p: ['«+ Añadir empresa u oficio» y el número de personas.', 'La app te propone las empresas y oficios que ya has escrito.'] },
      { t: 'Línea de tiempo de los trabajos', p: ['En «Trabajos realizados» cada línea nueva empieza con la hora («08:15 · …»).', 'Toca Enter (salto de línea) para la siguiente actividad: queda el registro del día.'] },
      { t: 'Dictado por voz', p: ['Toca el micrófono 🎤 de cualquier cuadro de texto y habla.', 'Di «coma», «dos puntos», «punto y seguido» o «punto y aparte».', 'Necesita señal; la primera vez pide permiso del micrófono.'] },
      { t: 'Corrector y texto predictivo', p: ['El teclado corrige en español e inglés.', 'Al escribir aparecen frases que ya usaste: tócalas para completarlas.'] },
      { t: 'Incidencias', p: ['«+ Añadir incidencia» con su gravedad (leve, media, grave).', 'Marca «Resuelta» cuando se arregle: guarda la hora.', 'Las abiertas pasan solas a la visita siguiente.'] },
      { t: 'Fotos', p: ['«Tomar foto» o «De la galería».', 'Puedes vincular fotos a una nota del plano.'] },
      { t: 'Firma', p: ['Toca «✍ Firmar», firma con el dedo y «Listo» (queda bloqueada).', '«📎 Adjuntar firma» usa una foto de tu firma en papel; «Guardar como mi firma» la deja lista para «⭐ Usar mi firma».', 'En una obra compartida, al firmar se ofrece enviar el reporte al administrador.'] },
      { t: 'Informes', p: ['«Informe en PDF»: reporte con número, ficha, cifras, trabajos por hora, incidencias, repasos, planos con notas y medidas, fotos y firmas.', '«Informe interactivo»: archivo .html donde se tocan las notas del plano y se ven sus fotos.'] },
      { t: 'Enviar y compartir', p: ['«Enviar por correo» con tu Gmail u Outlook vinculado (con el informe adjunto).', '«Guardar en la nube»: a tu Drive u OneDrive.', '«Compartir resumen»: texto para WhatsApp.'] }
    ]
  },
  {
    titulo: 'Planos, notas y medidas', icono: '📐', recorrido: 'visita',
    temas: [
      { t: 'Cargar un plano', p: ['En la visita: «+ Cargar plano» y elige un PDF, un DXF o una imagen.', 'El plano queda en la obra y sirve para todas sus visitas.'] },
      { t: 'Notas numeradas', p: ['En el plano toca «+ Nota» y toca el sitio.', 'Cada nota lleva tipo, texto, fotos, tonos de pintura y enlaces (fichas técnicas, catálogos).'] },
      { t: 'Dibujar a mano alzada', p: ['«✎ Dibujar», elige color y grosor y dibuja con un dedo.', 'Con dos dedos sigues moviendo el plano; «Goma» borra trazos.'] },
      { t: 'Medir distancias y áreas', p: ['En el plano toca 📏 y elige Distancia, Recorrido o Área.', 'Toca los puntos; puedes arrastrarlos para afinar. «Terminar» cierra recorridos y áreas.', 'Toca una medida para borrarla. Salen en el informe.'] },
      { t: 'Escala de un PDF', p: ['Si el PDF se imprimió a escala, elige 1:50, 1:100… en «Escala».', 'Si no, «Calibrar con una cota»: toca los extremos de una medida conocida y escribe cuánto mide.', 'También sirve para fotos y planos escaneados.'] },
      { t: 'Planos DXF', p: ['En AutoCAD: Guardar como → «AutoCAD 2018 DXF».', 'En la visita el DXF entra ya con su escala.', 'Une antes las referencias externas (BIND); sombreados e imágenes no se dibujan.'] }
    ]
  },
  {
    titulo: 'Punch list de terminaciones', icono: '✅', recorrido: 'visita',
    temas: [
      { t: 'Apuntar un repaso', p: ['En la visita: «+ Repaso con foto» (o sin foto).', 'Zona, tipo (pintura, pañete, cerámica…), qué corregir, responsable y prioridad.'] },
      { t: 'Repasos en el plano', p: ['Abre el repaso y toca «📍 Marcar en el plano»; elige el plano si la obra tiene varios y toca el sitio.', 'En el plano salen como cuadrados «R3»: rojo por corregir, naranja corregido, verde cerrado. Tócalo para ir a su ficha.', 'Salen marcados en el informe PDF y en el PDF del punch list.'] },
      { t: 'Estados', p: ['Pendiente → Corregido (al subir la foto de después) → Cerrado (cuando lo verificas).', 'Los no cerrados siguen en las próximas visitas de la obra.'] },
      { t: 'PDF para contratistas', p: ['«Punch list en PDF» con fotos de antes y después.', 'Con papel de contratista, cada uno ve y corrige sólo sus repasos.'] }
    ]
  },
  {
    titulo: 'Calidad: inspecciones y vaciados', icono: '🧱', recorrido: 'calidad',
    temas: [
      { t: 'Nueva inspección', p: ['Menú (símbolo de COORDINATE) → «Inspecciones y liberaciones» → «+ Inspección».', 'Elige la obra y la partida: acero, encofrado, liberación para vaciar, mampostería, instalación sanitaria o eléctrica, impermeabilización, drywall, cerámica, pintura o libre.', 'Escribe la zona o elemento y el contratista.'] },
      { t: 'Checklist', p: ['Marca cada punto Cumple, No cumple o N/A. Con «No cumple» escribe qué falla.', '📷 en cada punto para su foto; «+ Añadir punto» para lo que no esté en la plantilla.', '«Marcar el resto como Cumple» cuando todo lo demás está bien.'] },
      { t: 'Liberar y firmar', p: ['Resultado: Liberada, Liberada con observaciones o Rechazada (la app propone uno según el checklist).', 'Firma con el dedo o «⭐ Usar mi firma». Escribe quién libera.', '«Acta en PDF»: acta con checklist, fotos y firmas del inspector y del contratista.'] },
      { t: 'No cumple → punch list', p: ['«Pasar al punch list» crea un repaso por cada punto que no cumple, con su foto como «antes», prioridad alta y el contratista como responsable.', 'Se siguen en las visitas como cualquier repaso.'] },
      { t: 'Registrar un vaciado', p: ['Menú → «Vaciados de hormigón» → «+ Vaciado».', "Elemento, nivel y ejes, f'c (kg/cm², psi o MPa), revenimiento especificado, volumen previsto, planta y colocación.", 'Si hiciste la liberación para vaciar, enlázala en «Liberación previa».'] },
      { t: 'Camiones y revenimiento', p: ['«+ Camión» por cada uno: nº de conduce, m³, hora y revenimiento medido.', 'La app suma el volumen y marca en naranja los revenimientos fuera de ±1".'] },
      { t: 'Probetas y roturas', p: ['«+ Juego (7 · 28 · 28 días)» crea tres probetas con su código; «+ Probeta» para otra edad.', 'El día de la rotura sale el aviso en el inicio, en la lista de vaciados y con un punto rojo en el menú.', "Anota el resultado del laboratorio: la app calcula el % de f'c y si cumple a 28 días.", '«Registro en PDF» con camiones, probetas y resultados.'] },
      { t: 'En el reporte diario', p: ['Las inspecciones y vaciados de la misma obra y día salen en el informe PDF de la visita.'] }
    ]
  },
  {
    titulo: 'Seguimiento: avance, minutas y días afectados', icono: '📈', recorrido: 'seguimiento',
    temas: [
      { t: 'Crear el programa de avance', p: ['Menú → «Avance y curva S», elige la obra y pon el inicio y el fin previstos.', '«Crear con partidas típicas de edificación» trae 12 partidas con pesos y fechas de referencia; o «Empezar vacío».', 'En «Editar programa» pon tus partidas, su peso (% de la obra, del presupuesto) y sus fechas. Los pesos deben sumar 100.'] },
      { t: 'Anotar el avance', p: ['En «Avance de hoy por partida» mueve la barra al % ejecutado acumulado.', 'La raya naranja marca lo programado para hoy; si vas 10 puntos por detrás, la partida sale como atrasada.'] },
      { t: 'Curva S e indicadores', p: ['Programado hoy, avance real, desviación en puntos e índice de cumplimiento (real entre programado).', 'Curva programada (naranja, discontinua) y real (azul). Toca la curva para ver los valores de cada fecha; «Ver como tabla» para leerla sin gráfico.', '«Informe PDF» con indicadores, curva y tabla por partida.'] },
      { t: 'Minutas de reunión', p: ['Menú → «Minutas de reunión» → «+ Minuta».', 'Trae los asistentes y los acuerdos abiertos de la reunión anterior de la obra.', 'Marca quién vino, escribe los temas (uno por línea) y los acuerdos con responsable y fecha límite.'] },
      { t: 'Seguimiento de acuerdos', p: ['Marca «Cumplido» cuando se cumpla; los demás pasan a la siguiente minuta.', 'Los vencidos salen en el inicio, en la lista de minutas y con un punto rojo en el menú.', '«Minuta en PDF» con hoja de firmas de asistentes y tabla de acuerdos.'] },
      { t: 'Firmar la minuta en el teléfono', p: ['Al final de la minuta, «Firmas de asistentes»: pasa el teléfono y cada presente toca «✍ Firmar» en su línea.', 'En «Conformidad» firman quien convoca y la contratista (con su nombre). «⭐ Mi firma» pone la tuya guardada.', 'Las firmas salen en la hoja de asistencia y en el PDF; también se puede imprimir sin firmar y firmar a mano.'] },
      { t: 'Dos personas anotando avance', p: ['Si dos teléfonos anotan avance a la vez en la misma obra, al sincronizar se juntan partida a partida: no se pierde lo de ninguno.'] },
      { t: 'Días afectados', p: ['En la visita del día, en Tiempo y jornada, marca «Parcial» o «Sin actividad»: aparecen la causa (lluvia, paro, falta de material…), las horas perdidas y un detalle.', 'Menú → «Días afectados»: días equivalentes perdidos por obra y por causa, con la relación en PDF para pedir una prórroga.'] }
    ]
  },
  {
    titulo: 'Control: RFI, cambios, materiales y seguridad', icono: '🦺', recorrido: 'control',
    temas: [
      { t: 'Hacer una consulta (RFI)', p: ['Menú → «Consultas (RFI)» → «+ RFI».', 'Asunto, disciplina (ARQ, EST, HDS…), plano o especificación de referencia, a quién va dirigida y para cuándo necesitas la respuesta.', 'Escribe la pregunta, tu propuesta si la tienes y añade fotos. «RFI en PDF» para enviarla.'] },
      { t: 'Anotar la respuesta', p: ['Marca «Respondida» o «Cerrada», copia la respuesta, quién responde y la fecha.', 'La app cuenta los días de espera; las vencidas avisan en el inicio y en el menú.', 'Si impacta el costo o el plazo: «Crear orden de cambio».'] },
      { t: 'Orden de cambio', p: ['Menú → «Órdenes de cambio» → «+ Orden»: título, origen, tipo (adicional, deductivo o sin costo) y descripción.', 'Partidas con unidad, cantidad y precio (RD$ o USD); la app suma el total. Montos antes de ITBIS.', 'Días de impacto en el plazo, estado (borrador, enviada, aprobada, rechazada) y quién aprueba. PDF para firmar.'] },
      { t: 'Firmas en el teléfono', p: ['Cada registro de control tiene al final su sección «Firmas»: RFI (solicita y responde), orden de cambio (solicita y aprueba), recepción (recibe y entrega el proveedor), permisos (solicita y autoriza), charlas, EPP e incidentes.', 'Toca «✍ Firmar»: se abre una hoja grande para firmar con el dedo; «Aceptar firma» la guarda. «⭐ Mi firma» usa la guardada en este teléfono.', 'Las firmas salen en el PDF y se sincronizan con la obra compartida (en la nube vinculada del autor).'] },
      { t: 'Recepción de materiales', p: ['Menú → «Recepción de materiales» → «+ Recepción»: proveedor, conduce y orden de compra.', 'Cada material con lo pedido, lo recibido y lo rechazado: la app marca los faltantes.', 'Haz foto del conduce firmado y de lo rechazado. PDF de recepción.'] },
      { t: 'Charla de 5 minutos', p: ['Menú → «Seguridad (SST)» → «+ Registro» → Charla.', 'Tema, quién la imparte, duración y asistentes.', 'Cada asistente firma en el teléfono en «Firmas de asistentes» (pasa el teléfono), o a mano en la columna del PDF.'] },
      { t: 'Revisión de EPP', p: ['Casco, chaleco, botas, guantes, lentes, protección auditiva, arnés y mascarilla: Cumple / No cumple / N/A.', 'Frente o zona y personas revisadas; nota en lo que falta.'] },
      { t: 'Permisos de trabajo', p: ['Altura, caliente, espacio confinado, excavación, eléctrico o izaje: cada uno trae sus controles.', 'Trabajo, zona, quién ejecuta, horario y quién autoriza. Ciérralo al terminar: los de otro día sin cerrar avisan en el inicio.'] },
      { t: 'Incidentes', p: ['Casi accidente, daño material o accidente (con o sin baja): qué pasó, causas, acciones, responsable y fecha.', 'La pestaña muestra los días sin accidentes de la obra.'] }
    ]
  },
  {
    titulo: 'Equipo y obras compartidas', icono: '👥', recorrido: 'inicio',
    temas: [
      { t: 'Cuenta', p: ['En Visitas → «Cuenta y equipo» → Entrar o Crear cuenta (o con Google).', 'Verifica tu correo para poder recibir invitaciones.'] },
      { t: 'Compartir una obra', p: ['«+ Compartir una obra» con el nombre de la obra.', 'Invita por correo con un papel: administrador, editor, solo lectura o contratista.', 'Avísale con «Enviar aviso» (WhatsApp o correo).'] },
      { t: 'Equipos de trabajo', p: ['«+ Crear un equipo» y añade a su gente.', 'Vincula el equipo a una obra con un papel: entran todos de una vez.'] },
      { t: 'Novedades', p: ['Menú → «Novedades del equipo»: bitácoras, repasos y registros de calidad, seguimiento y control nuevos o cambiados de tu equipo (el punto rojo del menú avisa).', 'En la lista llevan la etiqueta «Nueva» o «Actualizada».'] },
      { t: 'Sincronización', p: ['Visitas, repasos, planos y todos los registros de calidad, seguimiento y control (con sus firmas) de las obras compartidas.', 'Con señal se sincroniza al guardar, al volver la cobertura y cada 2 minutos.', 'Sin señal sigues trabajando: se sube después.'] },
      { t: 'Fotos del equipo en tu nube', p: ['En las obras compartidas, tus fotos, firmas y planos se suben a tu Google Drive u OneDrive vinculado (carpeta «COORDINATE Visitas / Obras / obra»).', 'La carpeta se comparte, sólo para ver, con los miembros de la obra.', 'Tus compañeros ven «📷 Ver foto en la nube»; en el panel, «📷 Fotos».', 'Sin cuenta vinculada, los archivos se quedan en tu teléfono: vincúlala en «Cuentas vinculadas».'] }
    ]
  },
  {
    titulo: 'Panel y perfil', icono: '📊', recorrido: 'panel',
    temas: [
      { t: 'Resumen diario', p: ['Panel → Diario: bitácoras del día por obra, quién y a qué hora, firmadas, personal, trabajos e incidencias.', 'Debajo, «Calidad, seguimiento y control»: avance real frente a programado, inspecciones, vaciados, RFI, cambios, recepciones y seguridad del día.', 'Avisa de las obras sin bitácora y de lo vencido: probetas sin romper, acuerdos, RFI sin respuesta y permisos sin cerrar.'] },
      { t: 'Resumen semanal', p: ['Panel → Semanal: visitas por día y por persona, incidencias, repasos por responsable, personal y clima.', 'Y además: 6. Calidad (inspecciones, vaciados, roturas), 7. Avance, reuniones y días afectados, 8. RFI, cambios y materiales, 9. Seguridad, y la lista de pendientes y vencidos.', '«Reporte semanal en PDF» para enviarlo.'] },
      { t: 'Perfil', p: ['Perfil → «Editar perfil»: nombre, cargo, empresa, teléfono y foto.', 'Tus obras con tu papel y el espacio de cada obra (equipo, cifras, calidad, avance, RFI y seguridad, bitácoras).'], recorrido: 'perfil' }
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
    titulo: 'Menú, aspecto y copia de seguridad', icono: '◎', recorrido: 'inicio',
    temas: [
      { t: 'El menú', p: ['Toca el símbolo de COORDINATE (arriba a la izquierda): los nodos giran y se abre el menú con todas las funciones.', 'Obra: visitas, inspecciones, vaciados y modelo 3D. Equipo: novedades, panel y perfil. Datos: cuentas vinculadas y copia de seguridad.', 'Un punto rojo en el símbolo avisa de novedades o probetas por romper.'] },
      { t: 'Modo claro u oscuro', p: ['Menú → Aspecto: oscuro, claro o como el teléfono.', 'Si sigue oscuro, quita en el navegador del teléfono el «tema oscuro para sitios».'] },
      { t: 'Actualizaciones', p: ['Cuando sale «Hay una versión nueva · Tocar para actualizar», tócalo.'] },
      { t: 'Exportar a Excel', p: ['Menú → «Exportar a Excel (CSV)»: elige una obra o todas.', 'Una tabla por tipo: visitas, incidencias, personal, repasos, inspecciones, vaciados, probetas, avance, acuerdos, RFI, cambios, materiales y seguridad.', '«Descargar todo» baja todas las tablas; se abren en Excel, Google Sheets o LibreOffice.'] },
      { t: 'Copia de seguridad', p: ['Menú → «Copia de seguridad» → «Exportar copia»: un archivo con todo (visitas, fotos, planos, repasos, inspecciones y vaciados).', '«Importar copia» en otro teléfono, o «En la nube…» con tu cuenta vinculada.'] },
      { t: 'Cuentas vinculadas', p: ['Menú → «Cuentas vinculadas»: Google (Gmail y Drive) o Microsoft (Outlook y OneDrive) para enviar y guardar los reportes.'] }
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
