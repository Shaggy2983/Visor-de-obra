#!/usr/bin/env python3
"""Genera los iconos con el símbolo de COORDINATE (la mira de nodos de
marca/logo-simbolo-claro.svg) sobre el fondo de la paleta Acero: los de la
app web y los de la aplicación Android. Ejecutar desde la raíz:

    python3 herramientas/iconos.py
"""
from PIL import Image, ImageDraw
import pathlib

FONDO = (18, 24, 38)        # --color-bg
TRAZO = (233, 238, 245)     # --color-text
NODO = (98, 160, 232)       # --color-accent
SUPER = 4                   # dibujar a 4x y reducir: bordes suaves

# Densidades de Android: lado del icono clásico (48 dp) y del primer plano
# del icono adaptativo (108 dp).
DENSIDADES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def simbolo(lado, fraccion, fondo):
    """El símbolo, que ocupa `fraccion` del lado, sobre `fondo` (o
    transparente si es None). Se dibuja sobre la rejilla de 64 unidades
    del SVG."""
    s = SUPER
    escala = fraccion * lado / 64
    origen = (lado - 64 * escala) / 2
    lienzo = Image.new('RGBA', (lado * s, lado * s), fondo + (255,) if fondo else (0, 0, 0, 0))
    dibujo = ImageDraw.Draw(lienzo)

    def p(x, y):
        return ((origen + x * escala) * s, (origen + y * escala) * s)

    def circulo(cx, cy, r, **estilo):
        x, y = p(cx, cy)
        r = r * escala * s
        dibujo.ellipse([x - r, y - r, x + r, y + r], **estilo)

    circulo(32, 32, 19, outline=TRAZO, width=round(4 * escala * s))
    grosor = round(3 * escala * s)
    dibujo.line([p(32, 6), p(32, 58)], fill=TRAZO, width=grosor)
    dibujo.line([p(6, 32), p(58, 32)], fill=TRAZO, width=grosor)
    for cx, cy in ((32, 6), (58, 32), (32, 58), (6, 32)):
        circulo(cx, cy, 4.5, fill=NODO)
    circulo(32, 32, 6.5, fill=NODO)
    return lienzo.resize((lado, lado), Image.LANCZOS)


def main():
    raiz = pathlib.Path(__file__).resolve().parent.parent

    # App web: el símbolo ocupa el 60 % para caber en la zona segura de los
    # iconos "maskable".
    web = simbolo(512, 0.60, FONDO).convert('RGB')
    web.save(raiz / 'icono-512.png')
    web.resize((192, 192), Image.LANCZOS).save(raiz / 'icono-192.png')

    # Android. El primer plano adaptativo mide 108 dp y el sistema recorta
    # hasta los 66 dp centrales: el símbolo va en el 58 %.
    res = raiz / 'android' / 'app' / 'src' / 'main' / 'res'
    for nombre, factor in DENSIDADES.items():
        carpeta = res / f'mipmap-{nombre}'
        carpeta.mkdir(parents=True, exist_ok=True)
        simbolo(round(48 * factor), 0.66, FONDO).save(carpeta / 'ic_launcher.png')
        simbolo(round(108 * factor), 0.58, None).save(carpeta / 'ic_launcher_foreground.png')
    (res / 'drawable').mkdir(parents=True, exist_ok=True)
    simbolo(288, 0.9, None).save(res / 'drawable' / 'splash.png')

    print('Iconos de la app web y de Android generados')


if __name__ == '__main__':
    main()
