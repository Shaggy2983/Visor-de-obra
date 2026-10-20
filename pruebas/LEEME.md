# Pruebas de las reglas de seguridad

Comprueban, contra los emuladores de Firebase, que cada obra sólo la
leen sus miembros, que sólo administradores y editores escriben, que las
invitaciones sólo las usa quien demuestra tener ese correo, que nadie se
sube de rol y que las fotos sólo las ven los miembros.

Necesita Node 20+ y Java 21.

    cd pruebas
    npm install
    npm run emuladores     # en una terminal (déjala abierta)
    npm run reglas         # en otra: «reglas: 29 bien, 0 mal»

Para probar la app entera contra los emuladores, sírvela en local y ábrela
con `?emulador=1` (por ejemplo `http://localhost:8765/visita.html?emulador=1`).
