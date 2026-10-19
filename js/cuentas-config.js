/* Identificadores de la app en Google y en Microsoft, necesarios para
   vincular cuentas. No son secretos: identifican la aplicación, no a
   nadie. Los pasos para obtenerlos están en el README («Cuentas de correo
   y almacenamiento»). También se pueden pegar desde la propia app, en
   Cuentas vinculadas → Configurar; lo que se ponga ahí manda sobre esto. */

export const CONFIG = {
  google: {
    clientId: ''
  },
  microsoft: {
    clientId: '',
    // 'common' admite cuentas personales (Outlook, Hotmail) y de empresa.
    tenant: 'common'
  }
};
