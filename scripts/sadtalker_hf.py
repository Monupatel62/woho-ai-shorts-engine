"""
sadtalker_hf.py — Free SadTalker via Hugging Face Spaces (ZeroGPU / CPU)

Tries multiple public HF Spaces in order. First one that responds wins.
No credit card needed. Free account = ~5 min GPU/day on ZeroGPU spaces.

Usage:
  python sadtalker_hf.py \
    --image path/to/presenter.jpg \
    --audio path/to/voice.wav \
    --output path/to/out.mp4 \
    [--hf-token hf_xxxx]

Exit codes:
  0 = success
  1 = all spaces failed
"""

import argparse
import os
import sys
import shutil

# ── Spaces to try in order (first working one is used) ──────────────────────
# Each entry: (space_id, fn_index_or_none, uses_named_endpoint)
HF_SPACES = [
    "kevinwang676/SadTalker",   # confirmed working, unnamed endpoint fn_index=0
    "vinthony/SadTalker",       # official, may recover from build errors
    "jsscclr/SadTalker",
    "Rocky1/SadTalker",
    "lazyiitian/SadTalker",
]


def try_space(space_id: str, image_path: str, audio_path: str,
              output_path: str, hf_token: str | None) -> bool:
    """Attempt inference on one HF Space. Returns True on success."""
    from gradio_client import Client
    import gradio_client as _gc

    # gradio_client 0.x uses hf_token; 1.x+ uses token
    _ver = tuple(int(x) for x in _gc.__version__.split(".")[:2])
    _token_kwarg = "hf_token" if _ver < (1, 0) else "token"

    # handle_file only available in gradio_client >= 1.0
    try:
        from gradio_client import handle_file as _hf
        def wrap_file(p: str):
            return _hf(p)
    except ImportError:
        def wrap_file(p: str):   # type: ignore[misc]
            return p             # v0.6.x accepts filepath directly

    print(f"[sadtalker_hf] trying: {space_id}", flush=True)
    try:
        client = Client(space_id, **{_token_kwarg: hf_token or None}, verbose=False)
    except Exception as e:
        print(f"[sadtalker_hf]   connect failed: {str(e)[:120]}", file=sys.stderr)
        return False

    # Discover endpoints
    try:
        api_info = client.view_api(return_format="dict")
    except Exception as e:
        print(f"[sadtalker_hf]   view_api failed: {str(e)[:120]}", file=sys.stderr)
        return False

    named = list(api_info.get("named_endpoints", {}).keys())
    unnamed_count = len(api_info.get("unnamed_endpoints", {}))
    print(f"[sadtalker_hf]   named={named}, unnamed_count={unnamed_count}", flush=True)

    try:
        # kevinwang676/SadTalker uses fn_index=0 (unnamed endpoint)
        # Parameters confirmed from view_api:
        # source_image, input_audio, preprocess, still_mode, gfpgan, batch_size, resolution, pose_style
        if unnamed_count > 0 and not named:
            result = client.predict(
                wrap_file(image_path),     # source_image
                wrap_file(audio_path),     # input_audio
                "full",                    # preprocess
                True,                      # still_mode
                False,                     # gfpgan face enhancer (slow, skip)
                1,                         # batch_size
                "256",                     # face_model_resolution
                0,                         # pose_style
                fn_index=0,
            )
        else:
            # Try named endpoints
            ep = None
            for candidate in ["/test", "/predict", "/generate", "/sadtalker", "/run"]:
                if candidate in named:
                    ep = candidate
                    break
            if not ep and named:
                ep = named[0]
            if not ep:
                print("[sadtalker_hf]   no endpoint found", file=sys.stderr)
                return False

            result = client.predict(
                wrap_file(image_path),
                wrap_file(audio_path),
                "full", True, False, 1, "256", 0,
                api_name=ep,
            )

        # Extract video path from result
        video_path = _extract_video(result)
        if not video_path:
            print(f"[sadtalker_hf]   no video in result: {str(result)[:200]}", file=sys.stderr)
            return False

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        shutil.copy2(video_path, output_path)
        print(f"[sadtalker_hf] SUCCESS → {output_path}", flush=True)
        return True

    except Exception as e:
        err = str(e)
        print(f"[sadtalker_hf]   predict failed: {err[:200]}", file=sys.stderr)
        if "quota" in err.lower() or "exceeded" in err.lower() or "limit" in err.lower():
            print(
                "[sadtalker_hf] ⚠ Daily GPU quota used up for this HF account.\n"
                "  Fix options:\n"
                "    1. Wait until midnight UTC (quota resets daily)\n"
                "    2. Add a different HF_TOKEN in .env\n"
                "    3. Set AVATAR_MODE=off to skip avatar today",
                file=sys.stderr
            )
        return False


def _extract_video(result) -> str | None:
    """Pull a .mp4 file path out of whatever gradio returns."""
    if isinstance(result, str) and os.path.exists(result):
        return result
    if isinstance(result, dict):
        for key in ("name", "video", "output_video", "generated_video"):
            v = result.get(key)
            if isinstance(v, str) and os.path.exists(v):
                return v
    if isinstance(result, (list, tuple)):
        for item in result:
            v = _extract_video(item)
            if v:
                return v
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image",    required=True)
    parser.add_argument("--audio",    required=True)
    parser.add_argument("--output",   required=True)
    parser.add_argument("--hf-token", default=None)
    args = parser.parse_args()

    for path in [args.image, args.audio]:
        if not os.path.exists(path):
            print(f"[sadtalker_hf] ERROR: not found: {path}", file=sys.stderr)
            sys.exit(1)

    for space in HF_SPACES:
        if try_space(space, args.image, args.audio, args.output, args.hf_token):
            sys.exit(0)

    print("[sadtalker_hf] All spaces failed. Try again later or set AVATAR_MODE=off.", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
