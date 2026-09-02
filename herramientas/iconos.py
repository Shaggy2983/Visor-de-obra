#!/usr/bin/env python3
"""Genera los iconos de la aplicación. Ejecutar desde la raíz del repositorio:

    python3 herramientas/iconos.py
"""
from PIL import Image, ImageDraw
import math
import pathlib

FONDO = (18, 22, 26)
CARA_ALTA = (240, 160, 75)
CARA_DERECHA = (184, 117, 47)
CARA_IZQUIERDA = (122, 76, 30)
MARCO = (236, 234, 228)

LADO = 512
CENTRO = LADO / 2
RADIO = 112
MARGEN = 0.25 * LADO
BRAZO = 0.10 * LADO
GROSOR = 12


def cubo(dibujo):
    c = math.cos(math.radians(30)) * RADIO
    s = 0.5 * RADIO
    arriba = (CENTRO, CENTRO - RADIO)
    ard = (CENTRO + c, CENTRO - s)
    abd = (CENTRO + c, CENTRO + s)
    abajo = (CENTRO, CENTRO + RADIO)
    abi = (CENTRO - c, CENTRO + s)
    ari = (CENTRO - c, CENTRO - s)
    medio = (CENTRO, CENTRO)
    dibujo.polygon([arriba, ard, medio, ari], fill=CARA_ALTA)
    dibujo.polygon([ard, abd, abajo, medio], fill=CARA_DERECHA)
    dibujo.polygon([ari, medio, abajo, abi], fill=CARA_IZQUIERDA)


def esquinas(dibujo):
    """Cuatro corchetes de visor, dentro de la zona segura del icono."""
    for x in (MARGEN, LADO - MARGEN):
        for y in (MARGEN, LADO - MARGEN):
            sx = 1 if x < CENTRO else -1
            sy = 1 if y < CENTRO else -1
            dibujo.line([(x, y), (x + sx * BRAZO, y)], fill=MARCO, width=GROSOR)
            dibujo.line([(x, y), (x, y + sy * BRAZO)], fill=MARCO, width=GROSOR)


def main():
    raiz = pathlib.Path(__file__).resolve().parent.parent
    lienzo = Image.new('RGB', (LADO, LADO), FONDO)
    dibujo = ImageDraw.Draw(lienzo)
    cubo(dibujo)
    esquinas(dibujo)
    lienzo.save(raiz / 'icono-512.png')
    lienzo.resize((192, 192), Image.LANCZOS).save(raiz / 'icono-192.png')
    print('icono-512.png e icono-192.png generados')


if __name__ == '__main__':
    main()
