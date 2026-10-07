#!/usr/bin/env python3
"""
Local presenter compositor for WoHo AI Shorts Engine.

Input: presenter-original.mp4
Output: transparent-person composited onto the selected WoHoTech background,
        encoded as H.264 1080x1920 video with no source audio.
Uses rembg's local u2net_human_seg model; no cloud API.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove


def run_ffmpeg(ffmpeg: str, input_video: Path, output_video: Path, fps: float) -> None:
    cmd = [
        ffmpeg, "-y",
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", "1080x1920",
        "-r", f"{fps:.6f}",
        "-i", "-",
        "-an",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(output_video),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    return proc


def fit_background(bg: np.ndarray, size=(1080, 1920)) -> np.ndarray:
    w, h = size
    bh, bw = bg.shape[:2]
    scale = max(w / bw, h / bh)
    nw, nh = int(round(bw * scale)), int(round(bh * scale))
    bg = cv2.resize(bg, (nw, nh), interpolation=cv2.INTER_AREA)
    x = max(0, (nw - w) // 2)
    y = max(0, (nh - h) // 2)
    return bg[y:y+h, x:x+w].copy()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--background", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--ffmpeg", required=True)
    args = ap.parse_args()

    src = Path(args.input)
    bg_path = Path(args.background)
    out = Path(args.output)
    if not src.is_file():
        raise FileNotFoundError(f"Presenter source missing: {src}")
    if not bg_path.is_file():
        raise FileNotFoundError(f"WoHoTech background missing: {bg_path}")

    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open presenter video: {src}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    bg = cv2.imread(str(bg_path), cv2.IMREAD_COLOR)
    if bg is None:
        raise RuntimeError(f"Cannot read background: {bg_path}")
    bg = fit_background(bg)

    session = new_session("u2net_human_seg")
    proc = run_ffmpeg(args.ffmpeg, src, out, fps)

    count = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgba = remove(Image.fromarray(rgb), session=session, post_process_mask=True)
            rgba_np = np.asarray(rgba.convert("RGBA"), dtype=np.uint8)

            alpha = rgba_np[:, :, 3].astype(np.float32) / 255.0
            # Slightly soften hard segmentation edges.
            alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)
            alpha = np.clip(alpha, 0.0, 1.0)

            person = rgba_np[:, :, :3]
            person_bgr = cv2.cvtColor(person, cv2.COLOR_RGB2BGR)

            ys, xs = np.where(alpha > 0.10)
            canvas = bg.copy()

            if len(xs) > 20 and len(ys) > 20:
                x1, x2 = int(xs.min()), int(xs.max()) + 1
                y1, y2 = int(ys.min()), int(ys.max()) + 1
                crop = person_bgr[y1:y2, x1:x2]
                acrop = alpha[y1:y2, x1:x2]

                # Keep presenter prominent while preserving aspect ratio.
                target_h = int(1920 * 0.78)
                scale = target_h / max(1, crop.shape[0])
                nw = max(1, int(round(crop.shape[1] * scale)))
                nh = max(1, int(round(crop.shape[0] * scale)))
                crop = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_CUBIC)
                acrop = cv2.resize(acrop, (nw, nh), interpolation=cv2.INTER_LINEAR)

                # Center horizontally; place feet/body near lower third.
                px = (1080 - nw) // 2
                py = 1920 - nh - 90
                sx1, sy1 = max(0, px), max(0, py)
                sx2, sy2 = min(1080, px + nw), min(1920, py + nh)
                cx1, cy1 = sx1 - px, sy1 - py
                cx2, cy2 = cx1 + (sx2 - sx1), cy1 + (sy2 - sy1)

                if sx2 > sx1 and sy2 > sy1:
                    a = acrop[cy1:cy2, cx1:cx2, None]
                    fg = crop[cy1:cy2, cx1:cx2].astype(np.float32)
                    bg_roi = canvas[sy1:sy2, sx1:sx2].astype(np.float32)
                    canvas[sy1:sy2, sx1:sx2] = (fg * a + bg_roi * (1.0 - a)).astype(np.uint8)

            if proc.stdin:
                proc.stdin.write(canvas.tobytes())

            count += 1
            if count % 30 == 0:
                print(f"[presenter] {count}/{total or '?'} frames", flush=True)
    finally:
        cap.release()
        if proc.stdin:
            proc.stdin.close()

    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"FFmpeg compositor failed with exit code {rc}")
    print(f"[presenter] prepared: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
