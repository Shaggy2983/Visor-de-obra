# Generar el APK — E04 3D

Dos rutas. Elige una.

| | TWA (carpeta `twa/`) | Capacitor (carpeta `capacitor/`) |
|---|---|---|
| Necesita la app publicada en HTTPS | Sí | No |
| Realidad aumentada | Funciona | Probablemente no |
| Arranca sin señal | Tras la primera apertura | Desde la instalación |
| Herramientas | Bubblewrap o PWABuilder | Android Studio |
| Actualizar el modelo | Subes el `.ifc` al servidor | Recompilar el APK |

Si el AR importa, ve por TWA. Si necesitas que todo viva dentro del
APK y el AR es prescindible, ve por Capacitor.

---

## RUTA A — TWA

### A.1 Publica primero

La app debe estar accesible en `https://USUARIO.github.io/REPOSITORIO/`
antes de compilar nada. Comprueba que abre en el móvil.

### A.2 Camino corto: PWABuilder

1. Entra a **pwabuilder.com**
2. Pega la URL de tu GitHub Pages
3. **Package for stores** → Android → **Generate**
4. Descargas un ZIP con el APK firmado y el `assetlinks.json` ya
   relleno con la huella correcta

Es la vía más rápida y no instala nada en tu máquina.

### A.3 Camino con Bubblewrap

Requiere JDK 17. Bubblewrap descarga el SDK de Android solo.

    npm install -g @bubblewrap/cli
    bubblewrap init --manifest https://USUARIO.github.io/REPOSITORIO/manifest.webmanifest

Responde las preguntas. Luego reemplaza el `twa-manifest.json` generado
por el de esta carpeta, cambiando `USUARIO` y `REPOSITORIO` por los
tuyos. Después:

    bubblewrap build

Salida: `app-release-signed.apk`.

### A.4 Quitar la barra de direcciones

Sin este paso el APK muestra una barra con la URL arriba. Obtén la
huella de tu clave:

    keytool -list -v -keystore android.keystore -alias e04

Copia la línea `SHA256:` completa (con los dos puntos) dentro de
`twa/.well-known/assetlinks.json`, y sube ese archivo al repositorio
respetando la ruta:

    REPOSITORIO/.well-known/assetlinks.json

GitHub Pages ignora carpetas que empiezan con guion bajo, pero
`.well-known` sí la sirve. Verifica que abra en el navegador antes de
distribuir el APK.

### A.5 Guarda el keystore

`android.keystore` y su contraseña son irreemplazables. Si los pierdes
no podrás publicar actualizaciones del mismo paquete nunca más.
Guárdalos fuera del repositorio, en el Drive del proyecto.

---

## RUTA B — Capacitor

### B.1 Prepara la carpeta

Descomprime `visor-obra-E04.zip` de modo que quede una carpeta `app/`.
Junto a ella coloca `montar-android.bat` y `capacitor.config.json`.

Si quieres el modelo dentro del APK, copia tu archivo como
`app/modelo.ifc` antes de compilar.

### B.2 Ejecuta

Doble clic en `montar-android.bat`. Monta todo el proyecto Android.

### B.3 Ajusta el manifiesto

Aplica lo que indica `permisos-AndroidManifest.txt` sobre
`android\app\src\main\AndroidManifest.xml`. Sin el permiso de cámara la
app no podrá usar AR aunque el WebView lo permitiera.

### B.4 Compila

    npx cap open android

En Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

El APK sale en:

    android\app\build\outputs\apk\debug\app-debug.apk

Ese APK es de depuración: sirve para instalar en los equipos de obra
por WhatsApp o USB, pero no para Play Store. Para una versión firmada:
**Build → Generate Signed Bundle / APK**.

### B.5 Tras cualquier cambio en `app/`

    npx cap sync android

Y vuelve a compilar.

---

## Instalar en los teléfonos de obra

Un APK fuera de Play Store necesita que el equipo permita
**instalar aplicaciones desconocidas** desde la app que lo abre
(WhatsApp, Archivos, Drive). Android lo pide la primera vez.

Si vas a repartirlo a varias cuadrillas, súbelo al Drive del proyecto y
comparte el enlace en un QR. Es el mismo mecanismo que ya estás
montando para los planos.
