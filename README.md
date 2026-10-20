# COORDINATE · Visor de obra

Herramienta de campo de **COORDINATE**, coordinación BIM y gestión de
datos de proyectos. *Los problemas se resuelven en el modelo, no en obra.*

Visor de modelos IFC pensado para llevarlo a pie de obra en el móvil:
abre el archivo desde el propio teléfono, funciona sin cobertura y permite
plantar el modelo a tamaño real sobre el terreno con realidad aumentada.

Todo es web estática. No hay servidor, ni cuenta, ni subida de archivos: el
IFC se lee dentro del navegador y se queda en el teléfono.

## Qué hace

- **Abre archivos IFC** desde el teléfono, o el que venga incluido en la app.
  El último abierto queda guardado y aparece solo la próxima vez.
- **Vista 3D** con giro, desplazamiento y encuadre automático.
- **Toca un elemento** y sale su ficha (categoría, nombre, planta y
  medidas); desde ella, todas sus propiedades: atributos, conjuntos
  (`Pset_…`), mediciones, materiales y caja envolvente, plegables, con
  filtro y tocando un valor se copia.
- **Medir** distancias (con las componentes horizontal y vertical) y
  áreas; los puntos se pegan a esquinas y bordes.
- **Cortes**: planta, alzados en X y en Z, paralelo a una cara que se
  toque y caja de sección, con relleno de color en lo cortado.
- **Colorear por propiedad**, como el Appearance Profiler de Navisworks:
  por categoría, planta, clase IFC, tipo, material o cualquier propiedad
  de un Pset. Cada valor sale de un color con su leyenda (los números, en
  tramos de frío a cálido) y desde la leyenda se oculta cada valor.
- **Transparencias**: de todo el modelo, por categoría, por elemento y
  «rayos X» (todo transparente menos lo seleccionado).
- **Vista**: seis fondos (Acero, Azul noche, Cielo, Gris claro, Blanco y
  Negro), luz, aristas, rejilla y vistas rápidas (planta, frente, lados).
- **Filtros por planta y por categoría**, con el número de piezas de cada una.
- **Aislar y ocultar** lo seleccionado.
- **Buscador** por nombre, categoría o GUID.
- **Ver en obra**: abre la cámara, busca el suelo y ancla el modelo ahí, a
  escala 1:1 o reducido sobre una mesa (1:20, 1:50, 1:100). Tocando la
  pantalla se siguen consultando los datos de cada elemento.
- **Funciona sin señal**: se instala como aplicación y arranca sin conexión.

## Visita diaria

En `visita.html` (botón **Visita** arriba en el visor, o atajo del icono
instalado) está el parte de visita diaria de obra:

- **Una ficha por visita**: fecha y hora, obra, quién la hace, tiempo y
  temperatura, jornada (normal, parcial, sin actividad), personal por
  empresa y oficio con el total, trabajos realizados, maquinaria,
  materiales recibidos, observaciones e instrucciones.
- **Incidencias** con gravedad (leve, media, grave). Las que no se marcan
  como resueltas **pasan solas a la visita siguiente**, con la fecha en que
  se abrieron.
- **Punch list de terminaciones**: cada repaso lleva número, zona, tipo
  (pintura, pañete, cerámica, carpintería…), qué corregir, responsable,
  prioridad y fotos de **antes** y **después**. Pasa de *pendiente* a
  *corregido* (al poner la foto de después) y a *cerrado* al verificarlo.
  Los repasos son de la obra: los abiertos siguen en las visitas
  siguientes, y cada informe los enseña como estaban ese día. Sale en el
  informe de la visita, en el interactivo y en un **PDF propio** para los
  contratistas.
- **Fotos** con la cámara o desde la galería, con pie. Se reducen a
  1600 px antes de guardarlas para que quepan muchas en el teléfono.
- **Firma** con el dedo.
- **Planos con notas**: se carga un plano en **PDF** (cada página es un
  plano) o en imagen, se abre a pantalla completa con zoom de dos dedos, y
  con **+ Nota** se toca el sitio. Cada nota lleva un número, un tipo
  (observación, incidencia o avance, cada uno con su color), su texto y
  **las fotos de esa zona**: hechas desde la propia nota o vinculando
  fotos que ya estaban en la visita. Las fotos ligadas muestran su número
  de nota y, al tocarlo, abren el plano en ese punto. El plano se guarda
  una vez por obra y lo usan todas las visitas; las notas son de cada
  visita.
- **Detalles de cada nota**: tonos de pintura (color con selector, marca,
  nombre o código y acabado: mate, satinado, semibrillo o brillo) y
  enlaces o referencias. Un enlace puede ser una dirección web («Abrir»
  la lleva al navegador) o una referencia sin dirección («Plano A-501»).
  Sólo se enlazan direcciones `http` y `https`; cualquier otra cosa se
  muestra como texto.
- **Dibujo a mano alzada** sobre el plano con **✎ Dibujar**: cinco
  colores, tres grosores, goma (se pasa el dedo por encima del trazo),
  deshacer y borrar todo. Con un dedo se dibuja y con dos se mueve y se
  acerca el plano. Los dibujos son de cada visita, como las notas, y salen
  en los dos informes.
- **Informe interactivo**: un único archivo `.html` con todo dentro
  (planos, fotos, tipografía) que se comparte o descarga. Se abre en
  cualquier navegador, sin la app y sin conexión: al tocar un número del
  plano aparece su nota con sus fotos, y desde cada foto se salta a su
  punto del plano.
- **Se guarda según se escribe**, sin conexión, en IndexedDB.
- **Informe en PDF**: abre el diálogo de impresión con un parte en A4;
  en Android se elige *Guardar como PDF*. Incluye cada plano con sus
  dibujos y sus números, y la tabla de notas con sus tonos, enlaces
  (clicables en el PDF) y fotos.
- **Compartir resumen** por WhatsApp, correo… con las fotos si el teléfono
  lo permite; si no, copia el texto.
- **Copia de seguridad**: exporta todas las visitas (fotos incluidas) a un
  `.json` e impórtalo en otro teléfono. Importar dos veces no duplica nada.
- Una visita nueva arranca con la obra, el autor y el personal de la
  anterior, para no reescribirlos cada día.

Las visitas sólo viven en el teléfono donde se escriben: no hay servidor.
Por eso conviene exportar la copia de vez en cuando.

## Marca

La interfaz y el informe impreso siguen la marca v2 de COORDINATE:

- **Paleta Acero**, declarada como variables `--color-*` al principio de
  `css/estilos.css`. Los impresos usan fondo `#eef1f6`, acento `#3d7cc4`
  y bandas `#1b3560`.
- **Inter**, copiada en `vendor/inter/` para que funcione sin conexión.
- **Logotipo «C◎ORDINATE»** con la mira de nodos haciendo de O. Va dentro
  del HTML para que use Inter; los archivos sueltos están en `marca/`.

Los SVG de `marca/` son una **reconstrucción provisional** del logotipo.
Si tienes los oficiales (`02_Marca/Logo/`), cópialos encima con el mismo
nombre. Si el símbolo cambia, cambia también su copia dentro de
`index.html`, `visita.html` y `js/visita.js` (función `logotipo`), y vuelve
a generar los iconos con `herramientas/iconos.py`.

## Cuentas de correo y almacenamiento

En la lista de visitas, **Cuentas vinculadas** conecta una cuenta de
**Google** (Gmail y Google Drive) o de **Microsoft** (Outlook, Hotmail,
Microsoft 365 y OneDrive). Con una cuenta vinculada:

- **Enviar por correo** (en cada visita): destinatarios, copia, asunto y
  el resumen del parte como mensaje, con el **informe interactivo
  adjunto** y, si se quiere, las fotos sueltas. La app recuerda los
  destinatarios de cada obra.
- **Guardar en la nube** (en cada visita): sube el informe interactivo a
  `COORDINATE Visitas / <obra>/`. Si ya estaba, lo sustituye.
- **Copia de seguridad → En la nube…**: guarda la copia completa (visitas,
  fotos y planos) en `COORDINATE Visitas / Copias de seguridad/` y permite
  restaurarla, por ejemplo en otro teléfono.

No hay servidor de por medio: el teléfono habla directamente con Google o
Microsoft. Los permisos se piden al mínimo: en Google Drive la app sólo
ve **los archivos que ella misma ha creado** (`drive.file`), y en el
correo sólo puede **enviar**, no leer. Los tokens se guardan en el
navegador del teléfono; **Desvincular** los borra (en Google además
retira el permiso; en Microsoft se retira en account.microsoft.com →
Privacidad → Aplicaciones).

Las sesiones de Google duran una hora. Al caducar, la app ofrece
renovarla: pasa un instante por Google, sin pedir contraseña, y vuelve a
la misma visita, donde se repite la acción. Microsoft se renueva solo.

### Registrar la app (una vez, por quien administra la app)

Cada proveedor exige registrar la aplicación y da un **ID de cliente**.
No es una contraseña: identifica la app. Se pega en
`js/cuentas-config.js` o, sin tocar código, en la propia app:
**Cuentas vinculadas → Configurar los ID de cliente**. Esa misma ventana
muestra la **URI de redirección** exacta que hay que registrar; con la
app publicada en GitHub Pages es:

    https://shaggy2983.github.io/Visor-de-obra/oauth.html

**Google** (console.cloud.google.com):

1. Crea un proyecto.
2. *APIs y servicios → Biblioteca*: habilita **Gmail API** y
   **Google Drive API**.
3. *Pantalla de consentimiento de OAuth* (Google Auth Platform): tipo
   **Externo**, nombre «COORDINATE», correo de asistencia. En
   *Acceso a datos* añade los permisos `openid`, `email`, `profile`,
   `.../auth/drive.file` y `.../auth/gmail.send`. En *Público* añade como
   **usuarios de prueba** las cuentas que la vayan a usar.
4. *Clientes → Crear cliente*: tipo **Aplicación web**.
   *Orígenes de JavaScript autorizados*: `https://shaggy2983.github.io`.
   *URI de redireccionamiento autorizados*: la de arriba.
5. Copia el **ID de cliente** (`….apps.googleusercontent.com`).

`gmail.send` es un permiso que Google considera sensible: mientras la app
esté en modo de prueba funciona con hasta 100 usuarios de prueba. Para
abrirla a cualquiera hay que pasar la verificación de Google.

**Microsoft** (entra.microsoft.com):

1. *Aplicaciones → Registros de aplicaciones → Nuevo registro*.
2. Nombre «COORDINATE Visitas». Tipos de cuenta: **cuentas de cualquier
   directorio organizativo y cuentas personales de Microsoft**.
3. URI de redirección: plataforma **Aplicación de página única (SPA)** y
   la URI de arriba.
4. *Permisos de API → Microsoft Graph → Permisos delegados*: `User.Read`,
   `Mail.Send`, `Files.ReadWrite` y `offline_access`. En cuentas de
   empresa puede que el administrador tenga que dar su consentimiento.
5. Copia el **Id. de aplicación (cliente)**.

Para probar en el ordenador, registra también
`http://localhost:8000/oauth.html` (o el puerto que uses) en los dos.

Funciona en el navegador y en la app instalada desde Chrome o como TWA.
**No funciona dentro del APK de Capacitor**: Google no permite iniciar
sesión desde una vista web incrustada.

## Realidad aumentada: qué hace falta

Necesita **WebXR con `immersive-ar`**, que hoy significa **Android con
Chrome y ARCore** (Servicios de Google para RA) instalado. Si el equipo no
lo tiene, la app lo dice al arrancar y el resto sigue funcionando igual.

Safari en iPhone no expone WebXR: allí el visor 3D funciona, el botón
"Ver en obra" no.

El WebView de un APK hecho con Capacitor tampoco suele exponer WebXR. Si la
realidad aumentada es lo importante, hay que ir por la ruta TWA descrita en
[`apk/LEEME-APK.md`](apk/LEEME-APK.md).

## Publicarlo

Vale cualquier alojamiento estático servido por **HTTPS** (la cámara y el
service worker no funcionan por HTTP).

En este repositorio ya está puesto: GitHub Pages sirve la rama
`gh-pages`, y cada empujón a `main` dispara
[`.github/workflows/pages.yml`](.github/workflows/pages.yml), que copia
`main` en `gh-pages`. Un par de minutos después está publicada en

    https://shaggy2983.github.io/Visor-de-obra/

Ábrela en el móvil y, en el menú de Chrome, **Añadir a pantalla de inicio**.
A partir de ahí arranca como una aplicación y funciona sin cobertura. Tras
publicar una versión nueva, el teléfono la recoge en la siguiente apertura.

`gh-pages` es un espejo de `main`: no se edita a mano, se sobrescribe en
cada publicación. En **Settings → Pages** el origen debe ser
**Deploy from a branch**, rama `gh-pages`, carpeta `/ (root)`.

## Incluir un modelo dentro de la app

Copia tu archivo como **`modelo.ifc`** en la raíz del repositorio. Al
arrancar, si no hay ningún modelo guardado en el teléfono, la app lo carga
sola. Si no existe, no pasa nada: se abre la portada para elegir archivo.

## Publicar en Google Play

La app Android está en `android/` (una Trusted Web Activity que abre la
app publicada) y la compila GitHub con el flujo
[`.github/workflows/android.yml`](.github/workflows/android.yml): sale el
`.aab` para Play y un `.apk` para probar. La guía completa, con la lista
de lo que falta, está en [`apk/LEEME-APK.md`](apk/LEEME-APK.md); los
textos y gráficos de la ficha, en [`tienda/`](tienda).

Las instrucciones de la vía alternativa (Capacitor) siguen al final de
esa guía. Para esa vía, el zip que pide ese documento se prepara con:

    sh herramientas/empaquetar.sh

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | El visor del modelo |
| `visita.html` | El parte de visita diaria |
| `css/estilos.css` | Estilos, pensados para el móvil en obra |
| `css/visita.css` | Estilos de la visita diaria y del informe impreso |
| `js/app.js` | Arranque y cableado de la interfaz |
| `js/visor.js` | Escena 3D: lotes de geometría, selección, corte |
| `js/ifc-worker.js` | Lectura del IFC en segundo plano (web-ifc) |
| `js/ar.js` | Sesión de realidad aumentada (WebXR) |
| `js/interfaz.js` | Nombres de clases IFC en castellano y piezas de interfaz |
| `js/almacen.js` | El último modelo, guardado en IndexedDB |
| `js/visita.js` | Visita diaria: ficha, fotos, firma, informe y copia |
| `js/medir.js` | Medir distancias y áreas sobre el modelo |
| `js/colores.js` | Colorear el modelo por una propiedad, con leyenda |
| `js/cortes.js` | Cortes: planta, alzados, por cara y caja de sección |
| `js/partes.js` | Las visitas, los planos y los repasos, guardados en IndexedDB |
| `js/repasos.js` | Punch list: repasos de terminaciones con fotos de antes y después |
| `js/planos.js` | Carga de planos (PDF o imagen), visor con zoom, dibujo y notas |
| `js/informe-interactivo.js` | Genera el informe `.html` interactivo |
| `js/utiles.js` | Piezas comunes: DOM, fechas, imágenes |
| `js/cuentas.js` | Vincular Google y Microsoft; correo y archivos en la nube |
| `js/cuentas-config.js` | ID de cliente de Google y Microsoft |
| `js/nube.js` | Tarjetas de cuentas y diálogos de correo, nube y copias |
| `oauth.html` | Página a la que vuelven Google y Microsoft al vincular |
| `sw.js` | Service worker: la app entera cabe en el teléfono |
| `marca/` | Logotipos y favicon de COORDINATE |
| `vendor/` | three.js, web-ifc, pdf.js e Inter, copiados aquí para no depender de un CDN |
| `android/` | La aplicación Android (TWA) que se publica en Google Play |
| `apk/` | Guía para publicar en Play y la vía alternativa con Capacitor |
| `tienda/` | Textos y gráficos de la ficha de Google Play |
| `privacidad.html` | Política de privacidad |
| `herramientas/` | Guiones auxiliares |
| `ejemplo.ifc` | Caseta de obra de dos plantas, para probar sin modelo real |

## Herramientas

    python3 herramientas/iconos.py       # regenera icono-192.png e icono-512.png
    python3 herramientas/ejemplo.py      # regenera ejemplo.ifc
    sh herramientas/empaquetar.sh        # arma visor-obra-CRD.zip con app/

## Cómo está hecho por dentro

El lector de IFC corre en un *worker*, así la pantalla no se congela con
modelos grandes. La geometría no se manda pieza a pieza: se agrupa por
color en lotes de unos 180.000 vértices y cada lote viaja como buffer
transferible. En pantalla cada lote es **una sola malla**, de modo que un
modelo de decenas de miles de elementos se dibuja con unas pocas llamadas.

Para saber qué elemento se ha tocado, cada lote lleva una tabla de rangos
`(elemento, inicio, longitud)` dentro de su buffer de índices, y el
triángulo señalado se busca en ella con una búsqueda binaria. Ocultar
elementos es reescribir ese buffer dejando fuera los rangos que no tocan.

## Límites conocidos

- Los planos se guardan como imagen de 4096 px de lado mayor: en un A1
  equivale a unos 170 ppp, de sobra para leer cotas con zoom, pero no es
  el vectorial original. Un PDF muy cargado tarda unos segundos en
  prepararse la primera vez.
- El informe interactivo pesa lo que sus fotos y planos (de 1 a 5 MB es lo
  normal). WhatsApp lo envía como documento; al abrirlo hay que elegir un
  navegador.

- Las superficies del corte horizontal salen huecas: se ve el interior de
  los muros, no una tapa maciza.
- Los modelos muy grandes (cientos de MB) pueden agotar la memoria de un
  teléfono modesto. Conviene repartir el modelo por disciplinas.
- La colocación en realidad aumentada se ancla al espacio local de la
  sesión: si se camina mucho, ARCore puede desviar el modelo unos
  centímetros. Con el botón **Recolocar** se vuelve a fijar.
- El anclaje, la retícula y la selección dentro de AR sólo pueden probarse
  en un teléfono con ARCore; en este repositorio están verificados hasta la
  petición de sesión.

## Licencias

El código de este repositorio es del proyecto. En `vendor/` viajan cuatro
librerías de terceros con sus licencias al lado:

- [three.js](https://threejs.org) — MIT (`vendor/three/LICENSE.txt`)
- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) — MPL-2.0 (`vendor/web-ifc/LICENSE.md`)
- [pdf.js](https://mozilla.github.io/pdf.js/) 4.10.38, compilación *legacy* — Apache-2.0 (`vendor/pdfjs/LICENSE.txt`)
- [Inter](https://rsms.me/inter/) — SIL Open Font License 1.1 (`vendor/inter/LICENSE.txt`)
