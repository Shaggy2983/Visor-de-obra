#!/usr/bin/env python3
"""Genera los iconos de la aplicación con el símbolo de COORDINATE (la mira
de nodos de marca/logo-simbolo-claro.svg) sobre el fondo de la paleta
Acero. Ejecutar desde la raíz del repositorio:

    python3 herramientas/iconos.py
"""
from PIL import Image, ImageDraw
import pathlib

FONDO = (18, 24, 38)        # --color-bg
TRAZO = (233, 238, 245)     # --color-text
NODO = (98, 160, 232)       # --color-accent

LADO = 512
# El símbolo se dibuja sobre una rejilla de 64 unidades, como el SVG. Ocupa
# el 60 % del icono para quedar dentro de la zona segura de los "maskable".
ESCALA = 0.60 * LADO / 64
ORIGEN = (LADO - 64 * ESCALA) / 2
SUPER = 4                   # dibujar a 4x y reducir: bordes suaves


def p(x, y, s):
    return ((ORIGEN + x * ESCALA) * s, (ORIGEN + y * ESCALA) * s)


def circulo(dibujo, cx, cy, r, s, **estilo):
    x, y = p(cx, cy, s)
    r = r * ESCALA * s
    dibujo.ellipse([x - r, y - r, x + r, y + r], **estilo)


def main():
    raiz = pathlib.Path(__file__).resolve().parent.parent
    s = SUPER
    lienzo = Image.new('RGB', (LADO * s, LADO * s), FONDO)
    dibujo = ImageDraw.Draw(lienzo)

    circulo(dibujo, 32, 32, 19, s, outline=TRAZO, width=round(4 * ESCALA * s))
    grosor = round(3 * ESCALA * s)
    dibujo.line([p(32, 6, s), p(32, 58, s)], fill=TRAZO, width=grosor)
    dibujo.line([p(6, 32, s), p(58, 32, s)], fill=TRAZO, width=grosor)
    for cx, cy in ((32, 6), (58, 32), (32, 58), (6, 32)):
        circulo(dibujo, cx, cy, 4.5, s, fill=NODO)
    circulo(dibujo, 32, 32, 6.5, s, fill=NODO)

    grande = lienzo.resize((LADO, LADO), Image.LANCZOS)
    grande.save(raiz / 'icono-512.png')
    grande.resize((192, 192), Image.LANCZOS).save(raiz / 'icono-192.png')
    print('icono-512.png e icono-192.png generados')


if __name__ == '__main__':
    main()
