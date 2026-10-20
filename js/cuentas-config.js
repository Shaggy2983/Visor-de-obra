/* Identificadores de la app en Google y en Microsoft, necesarios para
   vincular cuentas. No son secretos: identifican la aplicación, no a
   nadie. Los pasos para obtenerlos están en el README («Cuentas de correo
   y almacenamiento»). También se pueden pegar desde la propia app, en
   Cuentas vinculadas → Configurar; lo que se ponga ahí manda sobre esto. */

export const CONFIG = {
  google: {
    // Proyecto coordinate-b7759 · cliente web «COORDINATE Visor (Gmail y Drive)»
    clientId: '181407868247-k1pr406phm1rdvd7o6t26a80ggohto6i.apps.googleusercontent.com'
  },
  microsoft: {
    // Entra · app «COORDINATE Visor (Outlook y OneDrive)», cuentas personales y de empresa
    clientId: '1494f883-aaba-44e3-96d6-b879f7a9b4ec',
    // 'common' admite cuentas personales (Outlook, Hotmail) y de empresa.
    tenant: 'common'
  }
};
