# Visor de obra E04

Visor de modelos IFC pensado para llevarlo a pie de obra en el móvil:
abre el archivo desde el propio teléfono, funciona sin cobertura y permite
plantar el modelo a tamaño real sobre el terreno con realidad aumentada.

Todo es web estática. No hay servidor, ni cuenta, ni subida de archivos: el
IFC se lee dentro del navegador y se queda en el teléfono.

## Qué hace

- **Abre archivos IFC** desde el teléfono, o el que venga incluido en la app.
  El último abierto queda guardado y aparece solo la próxima vez.
- **Vista 3D** con giro, desplazamiento y encuadre automático.
- **Toca un elemento** y salen sus datos: atributos, conjuntos de
  propiedades (`Pset_…`), mediciones y materiales.
- **Filtros por planta y por categoría**, con el número de piezas de cada una.
- **Corte horizontal** con un deslizador, para mirar dentro como en un plano.
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
- **Fotos** con la cámara o desde la galería, con pie. Se reducen a
  1600 px antes de guardarlas para que quepan muchas en el teléfono.
- **Firma** con el dedo.
- **Se guarda según se escribe**, sin conexión, en IndexedDB.
- **Informe en PDF**: abre el diálogo de impresión con un parte en A4;
  en Android se elige *Guardar como PDF*.
- **Compartir resumen** por WhatsApp, correo… con las fotos si el teléfono
  lo permite; si no, copia el texto.
- **Copia de seguridad**: exporta todas las visitas (fotos incluidas) a un
  `.json` e impórtalo en otro teléfono. Importar dos veces no duplica nada.
- Una visita nueva arranca con la obra, el autor y el personal de la
  anterior, para no reescribirlos cada día.

Las visitas sólo viven en el teléfono donde se escriben: no hay servidor.
Por eso conviene exportar la copia de vez en cuando.

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

En este repositorio ya está puesto: cada empujón a `main` dispara
[`.github/workflows/pages.yml`](.github/workflows/pages.yml), que activa
GitHub Pages si hiciera falta y publica la raíz del repositorio en

    https://shaggy2983.github.io/Visor-de-obra/

Ábrela en el móvil y, en el menú de Chrome, **Añadir a pantalla de inicio**.
A partir de ahí arranca como una aplicación y funciona sin cobertura.

Si el flujo falla al activar Pages —algunos repositorios no dejan que un
workflow lo haga—, basta con entrar una vez a **Settings → Pages** y elegir
como origen **GitHub Actions**. Después vuelve a funcionar solo.

## Incluir un modelo dentro de la app

Copia tu archivo como **`modelo.ifc`** en la raíz del repositorio. Al
arrancar, si no hay ningún modelo guardado en el teléfono, la app lo carga
sola. Si no existe, no pasa nada: se abre la portada para elegir archivo.

## Generar el APK

Las instrucciones completas están en [`apk/LEEME-APK.md`](apk/LEEME-APK.md).
Para la ruta Capacitor, el zip que pide ese documento se prepara con:

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
| `js/partes.js` | Las visitas, guardadas en IndexedDB |
| `sw.js` | Service worker: la app entera cabe en el teléfono |
| `vendor/` | three.js y web-ifc, copiados aquí para no depender de un CDN |
| `apk/` | Recetas para empaquetar como APK (TWA y Capacitor) |
| `herramientas/` | Guiones auxiliares |
| `ejemplo.ifc` | Caseta de obra de dos plantas, para probar sin modelo real |

## Herramientas

    python3 herramientas/iconos.py       # regenera icono-192.png e icono-512.png
    python3 herramientas/ejemplo.py      # regenera ejemplo.ifc
    sh herramientas/empaquetar.sh        # arma visor-obra-E04.zip con app/

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

El código de este repositorio es del proyecto. En `vendor/` viajan dos
librerías de terceros con sus licencias al lado:

- [three.js](https://threejs.org) — MIT (`vendor/three/LICENSE.txt`)
- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) — MPL-2.0 (`vendor/web-ifc/LICENSE.md`)
