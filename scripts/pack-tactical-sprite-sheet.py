#!/usr/bin/env python3
"""Pack a generated six-state chroma-key strip into a uniform game sprite sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


FRAME_COUNT = 6
FRAME_SIZE = 256
FRAME_PADDING = 14


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()


def union_box(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def pack(source_path: Path, output_path: Path) -> None:
    source = Image.open(source_path).convert("RGBA")
    source_frame_width = source.width / FRAME_COUNT
    frames: list[Image.Image] = []
    boxes: list[tuple[int, int, int, int]] = []

    for index in range(FRAME_COUNT):
        left = round(index * source_frame_width)
        right = round((index + 1) * source_frame_width)
        frame = source.crop((left, 0, right, source.height))
        frames.append(frame)
        box = alpha_bbox(frame)
        if box is None:
            raise ValueError(f"Frame {index + 1} has no visible sprite pixels in {source_path}")
        boxes.append(box)

    if len(boxes) != FRAME_COUNT:
        raise ValueError(f"Expected {FRAME_COUNT} visible frames in {source_path}")

    common = union_box(boxes)
    common_width = max(1, common[2] - common[0])
    common_height = max(1, common[3] - common[1])
    usable = FRAME_SIZE - FRAME_PADDING * 2
    scale = min(usable / common_width, usable / common_height)
    resized_width = max(1, round(common_width * scale))
    resized_height = max(1, round(common_height * scale))
    sheet = Image.new("RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE), (0, 0, 0, 0))

    for index, frame in enumerate(frames):
        cropped = frame.crop(common).resize((resized_width, resized_height), Image.Resampling.LANCZOS)
        x = index * FRAME_SIZE + (FRAME_SIZE - resized_width) // 2
        y = (FRAME_SIZE - resized_height) // 2
        sheet.alpha_composite(cropped, (x, y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    pack(arguments.input, arguments.output)


if __name__ == "__main__":
    main()
