# Verificación de la app OAuth de Google

La app pide `gmail.send`, un **permiso sensible**: mientras la app esté
«En prueba» en Google Cloud sólo pueden vincular Gmail los usuarios de
prueba (máx. 100) y la autorización caduca a los 7 días. Para que
cualquiera pueda vincularla hay que **publicar y verificar** la app OAuth.
`drive.file`, `openid`, `email` y `profile` no son sensibles. No hace
falta la evaluación de seguridad CASA, que sólo se exige con permisos
restringidos como leer el correo o Drive entero.

Proyecto: **coordinate-b7759** → Google Auth Platform (Pantalla de
consentimiento de OAuth).

## Lista de comprobación

| # | Paso | Estado |
|---|---|---|
| 1 | Página principal pública en el dominio: `https://shaggy2983.github.io/` describe la app, enlaza la privacidad y explica los permisos | Hecho (PR #3) |
| 2 | Política de privacidad en el mismo dominio, con el uso de Gmail y Drive y la frase de uso limitado | Hecho: `/Visor-de-obra/privacidad.html` |
| 3 | Dominio autorizado `shaggy2983.github.io` **verificado en Search Console** con la misma cuenta propietaria del proyecto | Hecho el 23/10/2026 (archivo `google820fa782b73ea21e.html` en la raíz, PR #4: **no borrarlo**) |
| 4 | Marca: nombre «COORDINATE · Obra», logotipo 120×120 (`marca/`), correo de asistencia `hola@coordinate.do` (o tu Gmail), página principal, privacidad | Hecho el 23/10/2026 menos el logotipo (nombre «COORDINATE», correo luisleocadioasc@gmail.com, página principal, privacidad, dominios `coordinate-b7759.firebaseapp.com` y `shaggy2983.github.io`). **Verificar la marca**: el primer intento dijo que la página principal «no está registrada a tu nombre» porque Search Console se acababa de verificar; Google pide esperar 24 h y reintentar (Información de la marca → ⓘ → Ver problemas → «Corregí los problemas») |
| 5 | Permisos declarados: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/drive.file`, `.../auth/gmail.send` | Hecho el 23/10/2026 |
| 6 | Justificación de `gmail.send` (texto abajo) | Pegada en «Acceso a los datos» el 23/10/2026 |
| 7 | Vídeo de demostración en YouTube (oculto) | Guion abajo; lo grabas en el teléfono |
| 8 | La app ya está «En producción» (3 de 100 usuarios sin verificar). Falta «Preparar para verificación» en el Centro de verificación, cuando la marca esté verificada y el vídeo subido | **Tú** (o yo con la sesión abierta) |
| 9 | Responder a los correos del equipo de verificación (suele tardar de 3 a 5 días hábiles, a veces semanas) | **Tú** (puedo redactar las respuestas) |

Microsoft (Entra) no exige verificación para `Mail.Send` delegado, pero
sin «editor verificado» la pantalla de consentimiento dice «no
verificado». Es opcional (necesita una cuenta de Microsoft Partner).

## Justificación de `gmail.send` (para copiar)

> COORDINATE · Obra is a field app for construction site supervisors. It
> lets the user send the daily site report (PDF), the punch list and the
> interactive HTML report by email from their own Gmail account, to the
> project owner or the contractors, when they tap «Enviar por correo».
> The app composes one message with the attachment and sends it with
> `users.messages.send`. It never reads, lists, modifies or deletes the
> user's mail, and it stores nothing from Gmail. A narrower scope is not
> possible: sending a message with an attachment from the user's own
> address requires `gmail.send`; `mailto:` links cannot attach files. The
> token stays on the user's phone and is removed when they unlink the
> account.

En español, por si lo piden:

> COORDINATE · Obra es una app de campo para supervisores de obra. Permite
> enviar el parte diario (PDF), el punch list y el informe interactivo por
> correo desde la propia cuenta de Gmail del usuario cuando pulsa «Enviar
> por correo». La app no lee, lista, cambia ni borra el correo, y no guarda
> nada de Gmail. Un `mailto:` no permite adjuntar archivos, por eso hace
> falta `gmail.send`.

## Justificación de `drive.file`

> Saves the reports and backups the user creates, and the photos,
> signatures and plans of shared projects, in a «COORDINATE Visitas»
> folder of the user's Drive, shared read-only with the project members.
> The app only accesses files it created.

## Guion del vídeo (2–3 minutos, en inglés o español con subtítulos)

Google exige ver la **pantalla de consentimiento real**, con el **ID de
cliente visible en la barra de direcciones**, y el uso de cada permiso.

1. Abrir la app (o `https://shaggy2983.github.io/Visor-de-obra/visita.html`
   en Chrome, para que se vea la URL). Mostrar el nombre y el logotipo.
2. Menú del símbolo → **Datos → Cuentas vinculadas** → «Vincular Google».
3. En la pantalla de Google: **ampliar la barra de direcciones** para que
   se lea `client_id=…apps.googleusercontent.com` (el de
   `js/cuentas-config.js`). Mostrar la lista de permisos y aceptar.
4. **Gmail:** abrir una visita de ejemplo (datos inventados, nunca de
   EPOKAL, NEST CITY CENTER ni INVERSIONES DMK) → «Enviar por correo» →
   destinatario de prueba → enviar. Abrir la bandeja del destinatario y
   mostrar el correo con el PDF adjunto.
5. **Drive:** «Guardar en la nube» → abrir Drive y mostrar el archivo en
   «COORDINATE Visitas / Obras / …».
6. Mostrar «Desvincular» y la política de privacidad (menú → privacidad, o
   el pie de la página principal).

Subirlo a YouTube como **Oculto** y pegar el enlace en el formulario.

## Después de verificar

- Quitar la limitación de usuarios de prueba (ya no aplica).
- Anotar la fecha en `CLAUDE.md` (Estado y pendiente, punto 3).
