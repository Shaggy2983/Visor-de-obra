/* Exportar a BCF 2.1 (.bcfzip): las incidencias de las visitas y los
   repasos del punch list como «topics» que abren Revit (BCF Manager),
   Navisworks, BIMcollab, Solibri o Trimble Connect. La incidencia que
   viene del modelo (incidencia.elemento.guid) lleva un punto de vista con
   ese GlobalId seleccionado, así el programa la ubica en el elemento.
   Los Guid salen del id del registro: al volver a exportar se actualizan
   los mismos temas en lugar de duplicarse. */

import { crearZip } from './zip.js';

const xml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Guid estable (formato UUID) a partir de un texto. */
export async function guidDe(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`crd-bcf:${texto}`)));
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const fechaIso = (dia, hora) => {
  if (!dia) return new Date().toISOString();
  const d = new Date(`${dia}T${/^\d{1,2}:\d{2}$/.test(hora || '') ? hora.padStart(5, '0') : '12:00'}:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};
const PRIORIDAD = { alta: 'High', media: 'Normal', baja: 'Low' };

/* Temas a partir de visitas y repasos. Una incidencia pasa de visita en visita
   con el mismo id: se toma su última aparición (estado más reciente). */
export function temas({ visitas = [], repasos = [] }) {
  const porId = new Map();
  for (const v of [...visitas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`))) {
    for (const i of v.incidencias || []) {
      porId.set(`inc:${i.id || i.texto}`, {
        clave: `inc:${i.id || i.texto}`, tipo: 'Issue', obra: v.obra,
        titulo: i.texto, descripcion: i.texto,
        estado: i.estado === 'cerrada' ? 'Closed' : 'Open',
        prioridad: PRIORIDAD[i.gravedad] || 'Normal',
        creado: fechaIso(i.desde || v.fecha, i.hora), autor: v.autor || 'COORDINATE',
        modificado: fechaIso(v.fecha, i.resuelta || v.hora),
        etiquetas: ['Incidencia', 'Visita de obra'],
        comentarios: i.estado === 'cerrada' ? [{ texto: `Resuelta${i.resuelta ? ` a las ${i.resuelta}` : ''} (visita del ${v.fecha}).`, fecha: fechaIso(v.fecha, i.resuelta), autor: v.autor }] : [],
        elemento: i.elemento?.guid ? i.elemento : null
      });
    }
  }
  const lista = [...porId.values()];
  for (const r of repasos) {
    const estado = r.cerrado ? 'Closed' : r.corregido ? 'Resolved' : 'Open';
    const titulo = `R${r.numero || ''} · ${r.zona ? `${r.zona}: ` : ''}${r.texto || ''}`.trim();
    lista.push({
      clave: `rep:${r.id}`, tipo: 'Punch list', obra: r.obra, titulo, descripcion: [r.texto, r.responsable ? `Responsable: ${r.responsable}` : ''].filter(Boolean).join('\n'),
      estado, prioridad: PRIORIDAD[r.prioridad] || 'Normal',
      creado: fechaIso(r.desde), autor: r.responsable || 'COORDINATE', modificado: fechaIso(r.cerrado || r.corregido || r.desde),
      etiquetas: ['Repaso', r.categoria].filter(Boolean),
      comentarios: [r.corregido && { texto: `Corregido el ${r.corregido}.`, fecha: fechaIso(r.corregido) }, r.cerrado && { texto: `Cerrado el ${r.cerrado}.`, fecha: fechaIso(r.cerrado) }].filter(Boolean),
      elemento: r.elemento?.guid ? r.elemento : null
    });
  }
  return lista;
}

const etiqueta = (nombre, valor) => (valor ? `    <${nombre}>${xml(valor)}</${nombre}>\n` : '');

async function markup(t, guid, vpGuid) {
  const comentarios = await Promise.all(t.comentarios.map(async (c, n) => `  <Comment Guid="${await guidDe(`${t.clave}:c${n}`)}">
    <Date>${c.fecha}</Date>
    <Author>${xml(c.autor || t.autor)}</Author>
    <Comment>${xml(c.texto)}</Comment>${vpGuid ? `\n    <Viewpoint Guid="${vpGuid}" />` : ''}
  </Comment>`));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Topic Guid="${guid}" TopicType="${xml(t.tipo)}" TopicStatus="${t.estado}">
    <Title>${xml(String(t.titulo).slice(0, 255))}</Title>
    <Priority>${t.prioridad}</Priority>
${t.etiquetas.map((e) => etiqueta('Labels', e)).join('')}    <CreationDate>${t.creado}</CreationDate>
    <CreationAuthor>${xml(t.autor)}</CreationAuthor>
    <ModifiedDate>${t.modificado}</ModifiedDate>
${etiqueta('Description', [t.descripcion, t.obra ? `Obra: ${t.obra}` : '', t.elemento ? `Elemento: ${[t.elemento.nombre, t.elemento.clase, t.elemento.planta].filter(Boolean).join(' · ')} (${t.elemento.guid})` : ''].filter(Boolean).join('\n'))}  </Topic>
${comentarios.join('\n')}${vpGuid ? `
  <Viewpoints Guid="${vpGuid}">
    <Viewpoint>viewpoint.bcfv</Viewpoint>
  </Viewpoints>` : ''}
</Markup>
`;
}

const puntoDeVista = (vpGuid, elemento) => `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${vpGuid}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Components>
    <Selection>
      <Component IfcGuid="${xml(elemento.guid)}">
        <OriginatingSystem>COORDINATE · Visita de obra</OriginatingSystem>
      </Component>
    </Selection>
    <Visibility DefaultVisibility="true" />
  </Components>
</VisualizationInfo>
`;

/* Devuelve el Blob del .bcfzip y cuántos temas lleva. */
export async function armarBcf({ visitas, repasos, proyecto }) {
  const lista = temas({ visitas, repasos });
  const archivos = [
    { nombre: 'bcf.version', datos: '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n  <DetailedVersion>2.1</DetailedVersion>\n</Version>\n' },
    { nombre: 'project.bcfp', datos: `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n  <Project ProjectId="${await guidDe(`proyecto:${proyecto || 'todas'}`)}">\n    <Name>${xml(proyecto || 'COORDINATE · Visita de obra')}</Name>\n  </Project>\n  <ExtensionSchema></ExtensionSchema>\n</ProjectExtension>\n` }
  ];
  for (const t of lista) {
    const guid = await guidDe(t.clave);
    const vpGuid = t.elemento ? await guidDe(`${t.clave}:vp`) : null;
    archivos.push({ nombre: `${guid}/markup.bcf`, datos: await markup(t, guid, vpGuid) });
    if (vpGuid) archivos.push({ nombre: `${guid}/viewpoint.bcfv`, datos: puntoDeVista(vpGuid, t.elemento) });
  }
  return { blob: crearZip(archivos), temas: lista.length, conElemento: lista.filter((t) => t.elemento).length };
}
