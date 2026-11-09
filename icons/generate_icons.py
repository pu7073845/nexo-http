#!/usr/bin/env python3
"""Genera los iconos PNG de la PWA a partir del diseño de icon.svg."""

from pathlib import Path

from PIL import Image, ImageDraw

BASE_DIR = Path(__file__).resolve().parent
SCALE = 4
SIZE = 512


def gradient(size, top, bottom):
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        ratio = y / max(1, size - 1)
        color = tuple(
            int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3)
        ) + (255,)
        for x in range(size):
            pixels[x, y] = color
    return image


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def circle_gradient(size, center, radius, top, bottom):
    layer = gradient(size, top, bottom)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius),
        fill=255,
    )
    layer.putalpha(mask)
    return layer


def make_icon(maskable=False):
    size = SIZE * SCALE
    background = gradient(size, (16, 27, 38), (7, 11, 16))

    if not maskable:
        background.putalpha(rounded_mask(size, 112 * SCALE))

    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    image.alpha_composite(background)

    draw = ImageDraw.Draw(image)

    # Arcos de emisión, a la izquierda del círculo.
    for inset, width, alpha in ((160, 16, 140), (200, 14, 75)):
        box = (
            (286 - inset) * SCALE,
            (256 - inset) * SCALE,
            (286 + inset) * SCALE,
            (256 + inset) * SCALE,
        )
        overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.arc(box, start=140, end=220, fill=(61, 220, 132, alpha), width=width * SCALE)
        image.alpha_composite(overlay)

    circle = circle_gradient(
        size,
        (286 * SCALE, 256 * SCALE),
        126 * SCALE,
        (103, 240, 164),
        (34, 197, 94),
    )
    image.alpha_composite(circle)

    draw = ImageDraw.Draw(image)
    draw.polygon(
        [
            (256 * SCALE, 202 * SCALE),
            (256 * SCALE, 310 * SCALE),
            (350 * SCALE, 256 * SCALE),
        ],
        fill=(4, 20, 10, 255),
    )

    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    icon = make_icon(maskable=False)
    icon.save(BASE_DIR / "icon-512.png")
    icon.resize((192, 192), Image.Resampling.LANCZOS).save(BASE_DIR / "icon-192.png")

    maskable = make_icon(maskable=True)
    maskable.save(BASE_DIR / "icon-maskable-512.png")

    print("Iconos generados en", BASE_DIR)


if __name__ == "__main__":
    main()
