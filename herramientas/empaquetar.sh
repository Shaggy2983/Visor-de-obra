#!/bin/sh
# Prepara visor-obra-E04.zip: la aplicación dentro de una carpeta "app/",
# que es lo que espera montar-android.bat para la ruta Capacitor.
#
# Uso, desde la raíz del repositorio:
#
#     sh herramientas/empaquetar.sh
#
# Para que el modelo viaje dentro del APK, copia tu archivo como
# modelo.ifc en la raíz antes de ejecutar esto.

set -eu

raiz=$(cd "$(dirname "$0")/.." && pwd)
salida="$raiz/visor-obra-E04.zip"
temporal=$(mktemp -d)
destino="$temporal/app"

mkdir -p "$destino"
cd "$raiz"

for pieza in index.html manifest.webmanifest sw.js css js vendor \
             icono-192.png icono-512.png ejemplo.ifc modelo.ifc; do
  [ -e "$pieza" ] && cp -R "$pieza" "$destino/"
done

rm -f "$salida"
(cd "$temporal" && zip -q -r "$salida" app)
rm -rf "$temporal"

echo "Listo: $salida"
echo "Contenido:"
unzip -l "$salida" | tail -n +4 | head -20
