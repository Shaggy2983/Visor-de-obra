# Publicar en Google Play — COORDINATE · Obra

La aplicación Android está en [`android/`](../android): una **Trusted Web
Activity (TWA)**, la vía que Google recomienda para publicar una app web
en Play. Por dentro es Chrome a pantalla completa abriendo la app
publicada, así que la cámara, la realidad aumentada, el trabajo sin
cobertura y el inicio de sesión con Google o Microsoft funcionan igual
que en el navegador. Abre directamente la **visita diaria**; el visor 3D
queda a un toque.

No hace falta instalar Android Studio: **GitHub compila la app** con el
flujo [`.github/workflows/android.yml`](../.github/workflows/android.yml)
y deja dos archivos para descargar:

| Archivo | Para qué |
|---|---|
| `coordinate-obra-….aab` | El que se sube a Google Play |
| `coordinate-obra-….apk` | Para instalar a mano en un teléfono y probar |

## Lista de lo que falta

| # | Paso | Quién | Estado |
|---|---|---|---|
| 1 | Publicar la web (fusionar el PR en `main`) | Tú | Pendiente |
| 2 | Crear la clave de subida y guardarla en GitHub | Tú | Pendiente |
| 3 | Compilar el `.aab` en GitHub | Automático | Listo |
| 4 | Cuenta de desarrollador de Google Play | Tú | Pendiente |
| 5 | Ficha de la tienda (textos, gráficos, política de privacidad) | Preparado en [`tienda/`](../tienda) | Listo |
| 6 | Verificar el dominio (quitar la barra de direcciones) | Tú | Pendiente |
| 7 | ID de cliente de Google y Microsoft (correo y nube) | Tú | Pendiente |

---

## 1. Publicar la web

La app Android abre `https://shaggy2983.github.io/Visor-de-obra/visita.html`.
Hasta que los cambios lleguen a `main`, esa dirección sirve la versión
antigua. Fusiona el PR en GitHub; el flujo de Pages publica solo en un
par de minutos. Comprueba en el móvil que abre la visita diaria.

Después, cualquier cambio en la web llega a los teléfonos **sin subir
otra versión a Play**: la app siempre abre la web publicada. Sólo hace
falta recompilar si cambian el nombre, el icono o la dirección.

## 2. Clave de subida

Play exige que el `.aab` vaya firmado con una **clave de subida**. Se
crea una vez, en tu ordenador, con `keytool` (viene con Java o con
Android Studio; en Windows también vale instalar *Temurin JDK 17*):

    keytool -genkeypair -v -keystore subida-coordinate.jks -alias coordinate -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12

Pide una contraseña (no se ve al escribir) y unos datos (nombre,
organización, país: `DO`). Con `PKCS12` la clave usa la misma contraseña
que el almacén. Ejecuta los comandos **de uno en uno**: si se pegan dos
en la misma línea, PowerShell no hace ninguno.

Pásala a texto para guardarla en GitHub. En Windows (PowerShell, cada
línea por separado):

    [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Documents\subida-coordinate.jks")) | Out-File -Encoding ascii -NoNewline "$HOME\Documents\clave-base64.txt"
    notepad "$HOME\Documents\clave-base64.txt"

En el Bloc de notas: Ctrl+A, Ctrl+C, y pégalo en el secreto sin copiar
nada entre medias (copiar otra cosa sobrescribe el portapapeles). Después
borra `clave-base64.txt`. En macOS o Linux: `base64 -w0 subida-coordinate.jks`.

En GitHub: **Settings → Secrets and variables → Actions → New
repository secret**, crea estos cuatro:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | El texto en base64 de la clave |
| `ANDROID_KEYSTORE_PASSWORD` | La contraseña del almacén |
| `ANDROID_KEY_ALIAS` | `coordinate` |
| `ANDROID_KEY_PASSWORD` | La contraseña de la clave (la misma si no pusiste otra) |

Guarda `subida-coordinate.jks` y sus contraseñas **fuera del
repositorio** (gestor de contraseñas o el Drive del proyecto). Con la
firma de apps de Google Play activada (la opción por defecto), si se
pierde la clave de subida se puede pedir a Google que la cambie; aun así,
no la pierdas.

## 3. Compilar

Cada cambio en `android/` compila solo. Para hacerlo a mano: pestaña
**Actions → Compilar app Android → Run workflow**. Al terminar, en la
ejecución, sección **Artifacts**, se descarga un zip con el `.aab` y el
`.apk`. Con los secretos puestos, el nombre termina en `-firmado` y el
registro del paso «Huella de la clave» muestra su huella SHA-256. Sin
ellos termina en `-prueba`: va firmado con una clave de depuración, que
sirve para instalar el `.apk` y probar, pero Play no la acepta.

El número de versión interno sube solo (es el número de ejecución), que
es lo que Play exige en cada subida. El visible está en
`android/gradle.properties` (`versionName`).

Para probar antes de Play, instala el `.apk` en un teléfono (Android
pedirá permitir «instalar aplicaciones desconocidas»).

## 4. Cuenta de Google Play

En **play.google.com/console**: pago único de 25 USD y verificación de
identidad.

- **Cuenta personal** (creada después de noviembre de 2023): antes de
  publicar para todo el mundo, Google exige una **prueba cerrada con al
  menos 12 personas durante 14 días seguidos**. Conviene empezarla cuanto
  antes con gente de obra.
- **Cuenta de organización** (a nombre de COORDINATE): no tiene esa
  espera, pero pide un número **D-U-N-S** de la empresa.

Luego: **Crear aplicación** → nombre «COORDINATE · Visita de obra»,
idioma español, aplicación, gratuita. Sube el `.aab` primero a
**Prueba interna** y prueba que instala.

## 5. Ficha de la tienda

Todo está en [`tienda/`](../tienda):

- `ficha.md`: nombre, descripciones corta y completa, categoría, y las
  respuestas sugeridas para **Seguridad de los datos**, **Clasificación
  de contenido** y **Acceso a la app**.
- `grafico-destacado-1024x500.png` y `captura-*.png` (1080×1920).
- Icono de 512×512: `icono-512.png` en la raíz.
- Política de privacidad: `https://shaggy2983.github.io/Visor-de-obra/privacidad.html`
  (archivo `privacidad.html`, revísala antes de publicar).

## 6. Verificar el dominio

Sin este paso la app funciona, pero muestra arriba una **barra con la
dirección**, como una pestaña del navegador. Para quitarla, Android
comprueba un archivo `assetlinks.json` en la **raíz del dominio**:

    https://shaggy2983.github.io/.well-known/assetlinks.json

Ojo: en la raíz del dominio, no dentro de `/Visor-de-obra/`. Por eso no
vale el que hay en este repositorio. Dos maneras:

**a) Repositorio de usuario.** Crea en GitHub un repositorio llamado
exactamente `shaggy2983.github.io` con el archivo
`.well-known/assetlinks.json` y un `.nojekyll` vacío en la raíz. GitHub
lo publica en la raíz del dominio.

**b) Dominio propio** (recomendado si tienes `coordinate.do`): por
ejemplo `obra.coordinate.do` apuntando a GitHub Pages
(*Settings → Pages → Custom domain*). Entonces la raíz del dominio es
este repositorio y basta su `.well-known/assetlinks.json`. Hay que
cambiar `twaHost` y `twaRuta` en `android/gradle.properties`
(`obra.coordinate.do` y `/`), recompilar, y registrar la nueva URI de
redirección en Google y Microsoft. También facilita el paso 7.

El contenido del archivo lleva **dos huellas SHA-256**: la de la clave de
subida (sale en el registro de la compilación) y la de la **clave de
firma de Google Play** (Play Console → *Prueba y lanzamiento →
Configuración → Integridad de la app → Firma de apps*):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.coordinate.visorobra",
    "sha256_cert_fingerprints": [
      "HUELLA:DE:LA:CLAVE:DE:FIRMA:DE:PLAY",
      "HUELLA:DE:LA:CLAVE:DE:SUBIDA"
    ]
  }
}]
```

Play Console también tiene un generador en *Vinculación de recursos
digitales*.

## 7. Correo y nube en la app publicada

Los pasos de registro están en el README («Cuentas de correo y
almacenamiento»). Para una app pública hay un paso más con Google:
`gmail.send` es un permiso sensible y, para salir del modo de prueba
(100 usuarios), Google pide **verificar la app**: dominio propio
verificado, página de inicio, la política de privacidad y un vídeo
corto del uso del permiso. Mientras tanto, la opción de Gmail funciona
para los usuarios de prueba que añadas; Microsoft no pide nada parecido
para cuentas personales.

---

## Apéndice — APK con todo dentro (Capacitor)

Sólo si hace falta que la app funcione **sin haber abierto nunca la web**
y la realidad aumentada no importa. En el WebView de Capacitor no hay
WebXR y Google no permite iniciar sesión, así que **no hay correo ni
nube**. Para Play es mejor la TWA.

### Pasos

#### B.1 Prepara la carpeta

Descomprime `visor-obra-CRD.zip` de modo que quede una carpeta `app/`.
Junto a ella coloca `montar-android.bat` y `capacitor.config.json`.

Si quieres el modelo dentro del APK, copia tu archivo como
`app/modelo.ifc` antes de compilar.

#### B.2 Ejecuta

Doble clic en `montar-android.bat`. Monta todo el proyecto Android.

#### B.3 Ajusta el manifiesto

Aplica lo que indica `permisos-AndroidManifest.txt` sobre
`android\app\src\main\AndroidManifest.xml`. Sin el permiso de cámara la
app no podrá usar AR aunque el WebView lo permitiera.

#### B.4 Compila

    npx cap open android

En Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

El APK sale en:

    android\app\build\outputs\apk\debug\app-debug.apk

Ese APK es de depuración: sirve para instalar en los equipos de obra
por WhatsApp o USB, pero no para Play Store. Para una versión firmada:
**Build → Generate Signed Bundle / APK**.

#### B.5 Tras cualquier cambio en `app/`

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
