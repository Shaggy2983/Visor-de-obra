/* Bienvenida: los nodos del símbolo orbitan unos segundos, como si la app
   fuese cargando, y la pantalla se desvanece hacia la interfaz. Sale una
   vez por sesión (al pasar del modelo a la visita no se repite) y se puede
   saltar tocando. Script clásico y síncrono: corre antes de pintar. */
(function () {
  var CLAVE = 'crd-bienvenida';
  var capa = document.getElementById('bienvenida');
  if (!capa) return;
  var vista = false;
  try { vista = sessionStorage.getItem(CLAVE) === '1'; } catch (e) { /* sin almacenamiento */ }
  if (vista) { capa.remove(); return; }
  try { sessionStorage.setItem(CLAVE, '1'); } catch (e) { /* se repetirá */ }

  var calma = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var duracion = calma ? 1500 : 5000;
  capa.style.setProperty('--duracion', duracion + 'ms');
  capa.hidden = false;

  var terminada = false;
  function terminar() {
    if (terminada) return;
    terminada = true;
    capa.classList.add('fuera');
    setTimeout(function () { capa.remove(); }, 500);
  }
  setTimeout(terminar, duracion - 450);
  capa.addEventListener('click', terminar);
})();
