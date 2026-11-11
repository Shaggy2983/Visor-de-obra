/* Apertura de las bases IndexedDB de la app, con cambio de nombre.

   Las primeras versiones guardaban los datos en bases con nombre de un
   proyecto concreto. Ahora tienen nombre propio de COORDINATE; la primera
   vez que se abre la base nueva, si existe la vieja, se copian todas sus
   tablas en una sola transacción y después se borra la vieja.

   Si la copia falla no se pierde nada: se descarta la base nueva (se
   reintenta en la próxima carga) y, mientras tanto, se sigue usando la
   vieja. La mudanza se hace una sola vez por página aunque se pidan
   muchas aperturas a la vez. */

const enCurso = new Map();   // nombre → promesa con el nombre que hay que usar

const prometer = (p) => new Promise((cumplir, fallar) => {
  p.onsuccess = () => cumplir(p.result);
  p.onerror = () => fallar(p.error);
});

function abrirTal(nombre, version, preparar) {
  return new Promise((cumplir, fallar) => {
    const p = indexedDB.open(nombre, version);
    let nueva = false;
    p.onupgradeneeded = (ev) => {
      if (ev.oldVersion === 0) nueva = true;
      preparar(p.result);
    };
    p.onsuccess = () => cumplir({ bd: p.result, nueva });
    p.onerror = () => fallar(p.error);
  });
}

/* Borrar sin esperar: si otra pestaña tiene la base abierta, el borrado
   queda bloqueado hasta que la cierre, y no debe colgar la app. */
function borrarSinEsperar(nombre) {
  try { indexedDB.deleteDatabase(nombre); } catch (e) { /* nada */ }
}

async function existe(nombre) {
  if (indexedDB.databases) {
    try { return (await indexedDB.databases()).some((b) => b.name === nombre); } catch (e) { /* sigue abajo */ }
  }
  // Sin databases(): abrirla la crea vacía si no existía; en ese caso se borra.
  const bd = await prometer(indexedDB.open(nombre));
  const vacia = bd.objectStoreNames.length === 0;
  bd.close();
  if (vacia) borrarSinEsperar(nombre);
  return !vacia;
}

async function mudar(nombre, version, preparar, heredada) {
  const { bd, nueva } = await abrirTal(nombre, version, preparar);
  if (!nueva || !heredada || !(await existe(heredada))) { bd.close(); return nombre; }

  let vieja = null;
  try {
    vieja = await prometer(indexedDB.open(heredada));
    const tablas = Array.from(vieja.objectStoreNames).filter((t) => bd.objectStoreNames.contains(t));
    const datos = [];
    for (const t of tablas) {
      const almacen = vieja.transaction(t, 'readonly').objectStore(t);
      const [claves, valores] = await Promise.all([prometer(almacen.getAllKeys()), prometer(almacen.getAll())]);
      datos.push({ t, claveFuera: almacen.keyPath === null, claves, valores });
    }
    if (tablas.length) {
      await new Promise((cumplir, fallar) => {
        const tx = bd.transaction(tablas, 'readwrite');
        for (const d of datos) {
          const destino = tx.objectStore(d.t);
          d.valores.forEach((v, i) => (d.claveFuera ? destino.put(v, d.claves[i]) : destino.put(v)));
        }
        tx.oncomplete = cumplir;
        tx.onerror = () => fallar(tx.error);
        tx.onabort = () => fallar(tx.error);
      });
    }
    bd.close();
    vieja.close();
    borrarSinEsperar(heredada);
    return nombre;
  } catch (e) {
    bd.close();
    if (vieja) vieja.close();
    borrarSinEsperar(nombre);
    return heredada;
  }
}

/* Abre «nombre» (creando sus tablas con «preparar»), trayendo antes los
   datos de «heredada» si es la primera vez. Devuelve la conexión. */
export async function abrirBase(nombre, version, preparar, heredada) {
  let usar = enCurso.get(nombre);
  if (!usar) {
    usar = mudar(nombre, version, preparar, heredada).catch(() => nombre);
    enCurso.set(nombre, usar);
  }
  const { bd } = await abrirTal(await usar, version, preparar);
  return bd;
}
