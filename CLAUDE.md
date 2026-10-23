# COORDINATE · Obra — contexto del proyecto

App de campo de **COORDINATE** (coordinación BIM y gestión de datos de
proyectos, Santo Domingo, RD; hola@coordinate.do). Lema: «Los problemas se
resuelven en el modelo, no en obra.» Todo en español.

## Reglas que no se discuten

- **Confidencialidad:** nunca usar modelos, planos, costes, clientes ni
  proveedores de EPOKAL, NEST CITY CENTER ni INVERSIONES DMK. Ejemplos y
  capturas, siempre con datos anónimos o inventados.
- **Marca:** paleta Acero (variables `--color-*` en `css/estilos.css`),
  tipografía Inter (en `vendor/inter/`), logotipo «C◎ORDINATE» con el
  símbolo oficial (anillo de ocho nodos y centro azul `#62a0e8`) haciendo
  de O. Archivos en `marca/`; iconos con `python3 herramientas/iconos.py`.
- **La clave de firma de Android no se sube nunca al repositorio.** Vive
  en los secretos de GitHub (`ANDROID_KEYSTORE_BASE64`, `…_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
- Rama de trabajo de las sesiones: se desarrolla en una rama y se fusiona
  a `main` con PR; `main` se publica sola. Puede haber varias sesiones a
  la vez: partir siempre del `main` más reciente.

## Qué es

PWA estática (sin servidor propio ni bundler) publicada en GitHub Pages:
https://shaggy2983.github.io/Visor-de-obra/ (rama `gh-pages`, espejo de
`main` que mantiene `.github/workflows/pages.yml`). Funciona sin señal
(service worker `sw.js`; **subir `VERSION` en cada cambio** de archivos).

- **Visita diaria** (`visita.html`, `js/visita.js`): parte de obra con
  personal, trabajos, incidencias que pasan a la visita siguiente, fotos,
  **firma bloqueada hasta pulsar «Firmar»**, planos PDF/imagen con notas
  numeradas, dibujo a mano alzada, tonos de pintura y enlaces
  (`js/planos.js`), informe PDF e **informe interactivo** `.html`
  (`js/informe-interactivo.js`), copia de seguridad JSON.
- **Dictado por voz** (`js/dictado.js`): micrófono en cada `textarea.campo`
  (Web Speech API de Chrome, sin servicios de pago; necesita señal).
  Órdenes: «coma», «dos puntos», «punto y seguido», «punto y aparte».
- **Tiempo del lugar** (`js/clima.js`): al abrir la visita del día sin
  temperatura, o con «📍 Tomar del lugar», ubicación aproximada (redondeada)
  → Open-Meteo (libre, sin clave) → temperatura y estados. Declarado en
  privacidad y en Seguridad de los datos (ubicación aproximada).
- **Línea de tiempo** (`js/horas.js`): en «Trabajos realizados» cada línea
  nueva empieza con la hora del teléfono («08:15 · …»); las incidencias
  guardan `hora` al crearse y `resuelta` al marcarse resueltas.
- **Informe PDF** (`imprimir()` en `js/visita.js`, `@media print` en
  `css/visita.css`): nº de documento PV-AAAAMMDD-HHMM, ficha en recuadros,
  cifras clave, secciones numeradas, trabajos como tabla Hora|Actividad,
  etiquetas de gravedad/estado, dos firmas y «Página X de Y».
- **Firma adjunta** (`firma` en `js/visita.js`): «📎 Adjuntar firma» (foto o
  PNG; recorta al trazo, papel → transparente, encaja sin deformar),
  «Guardar como mi firma» (localStorage `crd-mi-firma`, sólo ese teléfono)
  y «⭐ Usar mi firma».
- **Predictivo y corrector** (`js/predictivo.js`): sugerencias de frases y
  listas (empresa, oficio, obra, autor, zona) aprendidas de las visitas y
  repasos locales; activa spellcheck/autocapitalize para Gboard (ES/EN).
- **Punch list de terminaciones** (`js/repasos.js`): repasos por obra con
  zona, tipo, responsable, prioridad y fotos antes/después; estados
  pendiente → corregido → cerrado con fecha; PDF propio para contratistas.
- **Visor IFC** (`index.html`, `js/app.js`, `js/visor.js`, web-ifc en un
  worker): ficha y propiedades del elemento, medir (`js/medir.js`), cortes
  y caja de sección (`js/cortes.js`), colorear por propiedad
  (`js/colores.js`), transparencias, rayos X, 6 fondos, aristas, vistas,
  realidad aumentada (WebXR).
- **Menú del símbolo** (`js/menu.js`, cargado con `defer` en todas las
  páginas): el símbolo de COORDINATE (anillo de nodos) es el botón, se
  inserta solo en cada `.barra-superior` y en `[data-menu]` (portada del
  visor 3D). Al tocarlo los nodos giran y el centro late (sin animación con
  «reducir movimiento»); baja una hoja con Obra (Visitas, Modelo 3D),
  Calidad (Inspecciones, Vaciados), Seguimiento (Avance, Minutas, Días
  afectados), Equipo (Novedades, Panel, Perfil), Datos (Cuentas vinculadas
  `visita.html#/cuentas`, Copia `#/copia`), Aspecto y Guía. Punto rojo por
  novedades, probetas por romper (`crd-roturas`) o acuerdos vencidos. API
  `window.crdMenu` (`equipo(activo, n)`, `alNovedades`, `avisos()`). Ya no
  hay botones ⚙️ ni 👥; el inicio de Visitas sólo tiene cuenta, avisos de
  calidad, buscador y lista.
- **Tema** (`js/tema.js`, en `<head>`): oscuro / claro / como el teléfono,
  localStorage `crd-tema`, y aviso de versión nueva. Paleta clara en
  `:root[data-tema="claro"]` de `css/estilos.css` (fondo `#eef1f6`, acento
  `#3d7cc4`); usar siempre los tokens (`--velo-rgb`, `--peligro-texto`,
  `--portada-arriba`, …), nunca colores fijos. Al imprimir, papel blanco.
- **Calidad** (`calidad.html`, `js/calidad.js`, datos y cuentas en
  `js/calidad-datos.js`, estilos `css/calidad.css`; tablas IndexedDB
  `inspecciones` y `vaciados`, base v5). Rutas `#/inspecciones`,
  `#/inspeccion/ID`, `#/vaciados`, `#/vaciado/ID[/probeta/PID]`.
  · **Inspecciones** IN-NNN por obra: plantillas por partida (acero,
  encofrado, liberación para vaciar, mampostería, sanitaria, eléctrica,
  impermeabilización, drywall, cerámica, pintura, libre); puntos
  Cumple/No cumple/N/A con nota y foto; resultado liberada / con
  observaciones / rechazada (se sugiere); firma de liberación (o «mi
  firma»); «No cumple» → repasos del punch list (`repaso.inspeccion`);
  acta PDF.
  · **Vaciados** VH-NNN: elemento, f'c (kg/cm², psi, MPa), revenimiento,
  camiones (conduce, m³, hora, revenimiento; aviso fuera de ±1"), probetas
  con fecha de rotura (7/14/28…), resultado y % f'c, evaluación por edad;
  agenda de roturas y avisos en el inicio; registro PDF. El parte diario
  PDF lista la calidad de la misma obra y fecha. Se sincronizan como las
  visitas y van en la copia de seguridad (formato v5, que añade programas y minutas).
  · PDF: firmas como fondo del recuadro (no `<img>`: Chrome partía el
  bloque de firmas); `@page acta`.
- **Seguimiento** (`seguimiento.html`, `js/seguimiento.js`, cálculos en
  `js/seguimiento-datos.js`, estilos `css/seguimiento.css`; tablas
  IndexedDB `programas` y `minutas`, base v6). Rutas `#/avance`,
  `#/minutas`, `#/minuta/ID`, `#/dias`.
  · **Avance y curva S:** un programa por obra (id fijo
  `prog-<obra>`), partidas con peso %, inicio y fin; lo programado crece
  lineal entre fechas; avance real = último % anotado (deslizador, con la
  fecha de hoy); obra = media ponderada. Indicadores programado, real,
  desviación (pts) e índice real/programado. Curva SVG con tokens
  `--serie-real` (azul) / `--serie-prog` (naranja discontinua), validados
  para daltonismo; cursor con valores, tabla. Partidas típicas de
  edificación como plantilla. Informe PDF (`@page seguimiento`).
  · **Minutas** MR-NNN: asistentes (presente), temas, acuerdos con
  responsable, fecha límite y cumplido; la nueva trae asistentes y
  acuerdos abiertos de la anterior. Vencidos → aviso en el inicio y punto
  rojo del menú (`crd-acuerdos-vencidos`). PDF con hoja de firmas.
  · **Días afectados:** la visita con jornada Parcial / Sin actividad pide
  causa (`CAUSAS`), horas perdidas y detalle (`v.afectacion`); se suman
  por obra y causa (sin actividad = 1 día; parcial = horas/8 o ½). PDF
  «Relación de días afectados» para prórrogas.
  · Piezas de PDF comunes en `js/impreso.js` (también las usa calidad).
- **Novedades del equipo** (`js/novedades.js`): al bajar, lo que otro crea o
  cambia en una obra compartida (visitas, repasos, inspecciones, vaciados, programa y minutas) queda como novedad en el
  teléfono (localStorage `crd-novedades:{uid}`); aviso al sincronizar,
  etiqueta Nueva/Actualizada en la lista y «Novedades del equipo» en el menú
  del símbolo con contador (`visita.html#/novedades`). La primera bajada de una obra no cuenta.
- **Aviso al firmar** (`alFirmar()` en `js/visita.js`): en obra compartida,
  al terminar la firma se ofrece mandar el parte a los administradores
  (cuenta vinculada con informe, o `mailto:`); marca `avisoAdmin`.
- **Panel del equipo** (`panel.html`, `js/panel.js`, cálculo en
  `js/resumen.js`, estilos `css/panel.css`): resumen diario y semanal (visitas
  por día y persona, incidencias, repasos por responsable, personal y clima)
  de las obras con papel admin/editor/lector. Lee de Firestore sin fotos
  (`equipo.leerObra`, caché 1 min), así sirve en el ordenador. «Reporte en
  PDF» con `print()` y página con nombre `reporte-panel`.
- **Perfil y espacio de obra** (`perfil.html`, `js/perfil.js`): perfil
  (nombre, cargo, empresa, teléfono, foto 160 px) en `usuarios/{uid}`; la
  ficha pública (sin teléfono) va a `personas[uid]` de cada obra y equipo
  (regla `actualizaMiFicha`). `#/obra/<id>`: miembros, equipos, cifras y
  bitácoras recientes. Incluye «Cuenta y equipo» para entrar desde el PC.
- **Planos DXF y medición** (`js/dxf.js`, lector en `js/dxf-worker.js` con
  dxf-parser MIT en `vendor/dxf/`; DWG no: formato cerrado y las librerías
  libres son GPL). En Modelo 3D, «Abrir» acepta `.dxf`: visor 2D con capas
  y 📏 medir distancia/recorrido/área con enganche a extremos, centros y
  puntos medios (unidades de `$INSUNITS`; sin ellas se suponen m o mm).
  En la visita, «Planos y notas» acepta `.dxf` (se dibuja a imagen ya con
  escala). **Medir en planos** (`js/medir-plano.js`, botón 📏 del visor
  de planos): escala en `plano.mPorPx`; PDF guarda `papelMmPorPx` para
  elegir 1:N; o «Calibrar con una cota». Medidas en `v.medidas` (0–1),
  salen en el informe PDF e interactivo.
- **Guía de uso y recorridos** (`ayuda.html` + `js/ayuda.js`: todas las
  funciones con pasos y buscador; `js/guia.js` en todas las páginas:
  recorridos que iluminan los botones reales — inicio, visita, plano,
  modelo, calidad, seguimiento, panel, perfil). `window.crdGuia.empezar(id)` o `?guia=id`; siguen
  entre páginas (sessionStorage `crd-guia`). La visita de práctica es
  `guia-ejemplo` (se ofrece borrarla). Primer uso: se ofrece el de inicio
  (localStorage `crd-guia-ofrecida`). Acceso: menú del símbolo → Guía de uso; ❓ en
  el visor de planos. **Al añadir una función, añadirla a la guía.**
- **Bienvenida** animada de ~5 s una vez por sesión (`js/bienvenida.js`).
- Datos locales en IndexedDB (`js/partes.js`, base `visitas-obra-e04`).

## Cuentas y equipo (Firebase)

- Proyecto **`coordinate-b7759`**; configuración web en
  `js/firebase-config.js` (no es secreta). SDK 12.19.0 empaquetado en
  `vendor/firebase/` y cargado sólo si hay configuración.
- `js/equipo.js` (sesión, obras, equipos, sincronización) y
  `js/equipo-ui.js` (interfaz). Primero el teléfono: sincroniza al
  guardar, al volver la señal y cada 2 min; gana la última escritura.
- **Papeles de obra:** admin, editor, lector y **contratista** (sólo ve y
  corrige los repasos que se le asignan, sin cerrarlos; vista
  `js/mis-repasos.js`). **Equipos de trabajo** reutilizables que se
  vinculan a obras con un papel.
- Reglas: `firestore.rules` (colecciones visitas, repasos, planos,
  inspecciones, vaciados, programas y minutas) y `storage.rules`, con 91
  pruebas en
  `pruebas/` contra los emuladores (`?emulador=1` abre la app contra
  ellos).

## Android y Google Play

- TWA en `android/` (paquete `com.coordinate.bitacora`, abre
  `visita.html`). Hasta la versión 12 el paquete era
  `com.coordinate.visorobra` (sólo APK de prueba, nunca subido a Play):
  es otra app para Android, se desinstala a mano. GitHub Actions («Compilar app Android») genera `.apk` y
  `.aab` firmados con la clave de subida.
- Verificación de dominio en el repositorio `shaggy2983.github.io`
  (`.well-known/assetlinks.json`, huella de la clave de subida
  `D2:B5:23:55:…:FC:7E:9F`).
- Guía completa en `apk/LEEME-APK.md`; ficha, textos, capturas y
  respuestas de seguridad de datos en `tienda/`.

## Estado y pendiente (a 22 de octubre de 2026)

Hecho: Firebase `coordinate-b7759` conectado y publicado (Authentication
con `shaggy2983.github.io` autorizado, Firestore creado con reglas); ID
de cliente de Google (proyecto `coordinate-b7759`) y de Microsoft (app de
Entra) en `js/cuentas-config.js`.

1. **Sin Storage** (Luis decidió seguir en el plan Spark, 22/10/2026). La
   sincronización sube igual los datos; fotos, firmas y planos van a la
   **nube vinculada del autor** (`subirAVinculada` en `js/equipo.js`:
   Drive u OneDrive, «COORDINATE Visitas / Obras / obra», carpeta
   compartida sólo lectura con los correos del equipo vía
   `compartirCarpeta` de `js/cuentas.js`) y el enlace viaja en los datos
   (`fotos[].enlace`, `firmaEnlace`, `carpetaEnlace`, plano `enlace`). Lo
   que no se puede bajar queda en `fotosRemotas` / `firmaRemota` /
   `crd-planos-remotos` y se muestra como enlace. Sin cuenta vinculada, los
   archivos se quedan en el teléfono y el registro queda en
   `crd-archivos-pendientes` para reintentar. `crd-sin-storage` recuerda 6 h
   que no hay Storage. Con Blaze: crear Storage en us-east1 y publicar
   `storage.rules`: vuelve a usarse solo. `firestore.rules` publicadas el
   22/10/2026 (con `actualizaMiFicha`); falta correr `npm run reglas` en el
   PC (aquí no se puede descargar el emulador).
2. **Primera prueba real** de cuentas: crear cuenta, compartir una obra,
   invitar, equipo y contratista, en teléfonos de verdad.
3. **Google Play:** la cuenta de desarrollador espera la verificación de
   Google. Al subir el `.aab`, añadir la huella SHA-256 de la firma de
   Google Play a `assetlinks.json` (sin quitar la de subida) y dar a los
   revisores una cuenta de prueba verificada. Gmail (`gmail.send`) es un
   permiso sensible: para salir del modo de prueba de Google hace falta
   verificar la app.
4. Hoja de ruta del supervisor (acordada el 22/10/2026), por PR:
   hechos el menú del símbolo, inspecciones, vaciados, avance con curva S,
   minutas y días afectados. Siguen: RFI y órdenes de cambio, recepción de
   materiales, SST (charla de 5 min, EPP, permisos), repasos en el plano y
   exportar CSV. Reglas con `inspecciones`, `vaciados`, `programas` y
   `minutas` publicadas el 22/10/2026 (idénticas al repositorio). El programa es un documento por obra: si dos personas
   anotan avance a la vez, gana la última escritura.
5. Ideas pendientes de decidir: borrar varias visitas a la vez, marcar los
   repasos en el plano, papel de empresa por encima de los equipos.
6. Notificación con la app cerrada y resumen semanal por correo automático:
   necesitan Cloud Functions (plan Blaze).

Navisworks (NWD/NWC) no se puede abrir: es un formato cerrado; se trabaja
con IFC exportado desde el programa de origen.
