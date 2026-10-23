# Pruebas de las reglas de seguridad

Comprueban, contra los emuladores de Firebase, que cada obra sólo la
leen sus miembros, que sólo administradores y editores escriben, que las
invitaciones sólo las usa quien demuestra tener ese correo, que nadie se
sube de rol, que los equipos sólo meten en una obra a sus miembros y
con el papel que la obra les da, que el contratista sólo ve y corrige sus
repasos sin cerrarlos (y no ve calidad, seguimiento ni control), y que
las fotos sólo las ven los miembros.

Necesita Node 20+ y Java 21 o superior.

    cd pruebas
    npm install
    npm run emuladores     # en una terminal (déjala abierta)
    npm run reglas         # en otra: «reglas: 97 bien, 0 mal»

Los «PERMISSION_DENIED» que salen por el camino son los intentos que las
reglas deben rechazar: lo que cuenta es la última línea.

**Windows:** si el emulador de Firestore se cae con «Unable to establish
loopback connection», arráncalo con una carpeta temporal corta para Java:

    set JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\tmp
    npm run emuladores

Última pasada: 23/10/2026 en el PC de la oficina (Windows, Java 25):
97 bien, 0 mal.

Para probar la app entera contra los emuladores, sírvela en local y ábrela
con `?emulador=1` (por ejemplo `http://localhost:8765/visita.html?emulador=1`).
