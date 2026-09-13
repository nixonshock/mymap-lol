#!/usr/bin/env python3
"""Regenerate mymap.lol's favicon set from the one SVG below.

The mark is "MY" (Malaysia) as round-capped stroke paths — no font, so it
renders identically everywhere. Navy tile, gold letters (option 02).

    python3 scripts/gen-favicons.py

Writes: src/app/icon.svg, src/app/favicon.ico, src/app/apple-icon.png,
        public/favicon-192.png, public/favicon-512.png
"""
import io
import pathlib

import cairosvg
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
GOLD = "#ffc93c"
NAVY = "#1f2b3e"

SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect x="0" y="0" width="32" height="32" rx="7.5" ry="7.5" fill="{NAVY}"/>
  <g fill="none" stroke="{GOLD}" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.6 23 V9.6 L9.9 18.6 L15 9.6 V23"/>
    <path d="M17.4 9.6 L22.2 16.4 M27 9.6 L22.2 16.4 M22.2 16.4 V23"/>
  </g>
</svg>
"""


def render(size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=SVG.encode(), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def main() -> None:
    (ROOT / "src/app/icon.svg").write_text(SVG)
    (ROOT / "public").mkdir(exist_ok=True)

    # Multi-size .ico — Next serves src/app/favicon.ico at /favicon.ico itself.
    # (PIL: the base image's own size + append_images are what land in the file —
    #  a `sizes=` list alone silently yields a single 16×16 entry.)
    frames = {s: render(s) for s in (16, 32, 48)}
    frames[48].save(
        ROOT / "src/app/favicon.ico",
        format="ICO",
        append_images=[frames[16], frames[32]],
    )

    # Apple touch icon (iOS Add to Home Screen).
    render(180).save(ROOT / "src/app/apple-icon.png")

    # Big PNGs for sharing / any external listing.
    for size in (192, 512):
        render(size).save(ROOT / f"public/favicon-{size}.png")

    print("wrote icon.svg, favicon.ico, apple-icon.png, favicon-192.png, favicon-512.png")


if __name__ == "__main__":
    main()
