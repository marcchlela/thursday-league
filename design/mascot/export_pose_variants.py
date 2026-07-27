"""Export responsive mascot assets and light/dark validation previews."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


SIZES = (512, 256, 128)
THEMES = {
    "dark": "#080B0D",
    "light": "#F5F2E8",
}


def crop_transparent(image: Image.Image, padding_ratio: float = 0.055) -> Image.Image:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("The source image contains no visible pixels.")

    left, top, right, bottom = bounds
    visible_width = right - left
    visible_height = bottom - top
    pad = round(max(visible_width, visible_height) * padding_ratio)

    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(image.width, right + pad)
    bottom = min(image.height, bottom + pad)
    return image.crop((left, top, right, bottom))


def resize_to_height(image: Image.Image, height: int) -> Image.Image:
    width = max(1, round(image.width * height / image.height))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def create_preview(image: Image.Image, background: str, output: Path) -> None:
    canvas_size = 720
    draw_size = 560
    canvas = Image.new("RGB", (canvas_size, canvas_size), background)
    render = resize_to_height(image, draw_size)
    x = (canvas_size - render.width) // 2
    y = (canvas_size - render.height) // 2
    canvas.paste(render, (x, y), render)

    draw = ImageDraw.Draw(canvas)
    border = "#B8860B"
    draw.rounded_rectangle(
        (16, 16, canvas_size - 17, canvas_size - 17),
        radius=28,
        outline=border,
        width=2,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, quality=92, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--stem", required=True)
    parser.add_argument("--responsive-dir", type=Path, required=True)
    parser.add_argument("--preview-dir", type=Path, required=True)
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGBA")
    cropped = crop_transparent(source)
    args.responsive_dir.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        resized = resize_to_height(cropped, size)
        resized.save(
            args.responsive_dir / f"{args.stem}-{size}.png",
            optimize=True,
        )

    for theme, background in THEMES.items():
        create_preview(
            cropped,
            background,
            args.preview_dir / f"{args.stem}-{theme}-theme-preview.jpg",
        )


if __name__ == "__main__":
    main()
