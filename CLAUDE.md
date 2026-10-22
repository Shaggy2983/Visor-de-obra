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
- Reglas: `firestore.rules` y `storage.rules`, con 72 pruebas en
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

## Estado y pendiente (a 20 de octubre de 2026)

Hecho: Firebase `coordinate-b7759` conectado y publicado (Authentication
con `shaggy2983.github.io` autorizado, Firestore creado con reglas); ID
de cliente de Google (proyecto `coordinate-b7759`) y de Microsoft (app de
Entra) en `js/cuentas-config.js`.

1. **Storage** de Firebase: crearlo (plan Blaze) y publicar
   `storage.rules`; hasta entonces las fotos, firmas y planos de las obras
   compartidas no suben a la nube. Comprobar que las reglas publicadas en
   Firestore son las de `firestore.rules`.
2. **Primera prueba real** de cuentas: crear cuenta, compartir una obra,
   invitar, equipo y contratista, en teléfonos de verdad.
3. **Google Play:** la cuenta de desarrollador espera la verificación de
   Google. Al subir el `.aab`, añadir la huella SHA-256 de la firma de
   Google Play a `assetlinks.json` (sin quitar la de subida) y dar a los
   revisores una cuenta de prueba verificada. Gmail (`gmail.send`) es un
   permiso sensible: para salir del modo de prueba de Google hace falta
   verificar la app.
4. Ideas pendientes de decidir: borrar varias visitas a la vez, marcar los
   repasos en el plano, papel de empresa por encima de los equipos.

Navisworks (NWD/NWC) no se puede abrir: es un formato cerrado; se trabaja
con IFC exportado desde el programa de origen.
