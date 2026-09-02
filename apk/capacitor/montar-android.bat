@echo off
REM ============================================================
REM  Monta el proyecto Android para el visor IFC de obra.
REM  Requiere: Node.js 18+, Android Studio con SDK instalado.
REM  Ejecutar UNA sola vez, desde la carpeta que contiene "app".
REM ============================================================

echo.
echo [1/5] Comprobando que exista la carpeta app...
if not exist "app\index.html" (
  echo ERROR: no encuentro app\index.html
  echo Descomprime visor-obra-E04.zip aqui, de modo que quede
  echo una carpeta "app" junto a este script.
  pause
  exit /b 1
)

echo [2/5] Instalando Capacitor...
call npm init -y >nul 2>&1
call npm install @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6 @capacitor/filesystem@6
if errorlevel 1 goto fallo

echo [3/5] Inicializando el proyecto...
call npx cap init "E04 3D" com.grupoaqua.e04visor --web-dir=app
copy /Y capacitor.config.json capacitor.config.json >nul 2>&1

echo [4/5] Agregando la plataforma Android...
call npx cap add android
if errorlevel 1 goto fallo

echo [5/5] Copiando los archivos web al proyecto...
call npx cap sync android
if errorlevel 1 goto fallo

echo.
echo ============================================================
echo  LISTO. Ahora:
echo.
echo  1. Copia el bloque de permisos de permisos-AndroidManifest.txt
echo     dentro de android\app\src\main\AndroidManifest.xml
echo  2. Ejecuta:  npx cap open android
echo  3. En Android Studio:  Build ^> Build Bundle(s)/APK(s) ^> Build APK(s)
echo  4. El APK sale en:
echo     android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo  Tras editar cualquier archivo de "app", vuelve a correr:
echo     npx cap sync android
echo ============================================================
pause
exit /b 0

:fallo
echo.
echo Fallo la instalacion. Revisa el mensaje de error arriba.
pause
exit /b 1
