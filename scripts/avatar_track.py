import argparse
import json
import math
import wave
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np


FACE_LANDMARKS = {
    "left_eye_outer": 33,
    "left_eye_inner": 133,
    "left_eye_top": 159,
    "left_eye_bottom": 145,
    "right_eye_outer": 362,
    "right_eye_inner": 263,
    "right_eye_top": 386,
    "right_eye_bottom": 374,
    "mouth_left": 61,
    "mouth_right": 291,
    "mouth_top": 13,
    "mouth_bottom": 14,
    "nose": 1,
    "forehead": 10,
    "chin": 152
}

POSE_LANDMARKS = {
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24
}


def distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def ratio_vertical(points, top, bottom, left, right):
    width = max(distance(points[left], points[right]), 1e-6)
    return distance(points[top], points[bottom]) / width


def load_audio_rms(path, fps):
    with wave.open(str(path), "rb") as wav:
        rate = wav.getframerate()
        channels = wav.getnchannels()
        width = wav.getsampwidth()
        frames = wav.getnframes()
        raw = wav.readframes(frames)

    dtype = {1: np.int8, 2: np.int16, 4: np.int32}.get(width)
    if dtype is None:
        return []

    data = np.frombuffer(raw, dtype=dtype).astype(np.float32)
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)

    max_value = float(np.iinfo(dtype).max)
    data /= max(max_value, 1.0)

    hop = max(int(rate / fps), 1)
    window = max(hop * 2, 1)
    values = []

    for start in range(0, len(data), hop):
        chunk = data[start:start + window]
        if len(chunk) == 0:
            break
        values.append(float(np.sqrt(np.mean(np.square(chunk)))))

    return values


def normalize_point(landmark):
    return {
        "x": round(float(landmark.x), 5),
        "y": round(float(landmark.y), 5),
        "z": round(float(landmark.z), 5)
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open video: {args.video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    audio_rms = load_audio_rms(args.audio, fps)

    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    pose = mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    frames = []
    index = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        face_result = face_mesh.process(rgb)
        pose_result = pose.process(rgb)

        item = {
            "frame": index,
            "time": round(index / fps, 4),
            "face_present": False,
            "face": None,
            "eyes": None,
            "mouth": None,
            "head": None,
            "body": None,
            "audio_rms": round(audio_rms[min(index, len(audio_rms) - 1)], 6)
            if audio_rms else 0.0
        }

        if face_result.multi_face_landmarks:
            lm = face_result.multi_face_landmarks[0].landmark
            pts = [(p.x, p.y) for p in lm]
            item["face_present"] = True

            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            item["face"] = {
                "bbox": [
                    round(min(xs), 5), round(min(ys), 5),
                    round(max(xs), 5), round(max(ys), 5)
                ],
                "landmarks": {
                    name: normalize_point(lm[idx])
                    for name, idx in FACE_LANDMARKS.items()
                }
            }

            left_eye = ratio_vertical(
                pts,
                FACE_LANDMARKS["left_eye_top"],
                FACE_LANDMARKS["left_eye_bottom"],
                FACE_LANDMARKS["left_eye_outer"],
                FACE_LANDMARKS["left_eye_inner"]
            )
            right_eye = ratio_vertical(
                pts,
                FACE_LANDMARKS["right_eye_top"],
                FACE_LANDMARKS["right_eye_bottom"],
                FACE_LANDMARKS["right_eye_outer"],
                FACE_LANDMARKS["right_eye_inner"]
            )
            mouth_open = ratio_vertical(
                pts,
                FACE_LANDMARKS["mouth_top"],
                FACE_LANDMARKS["mouth_bottom"],
                FACE_LANDMARKS["mouth_left"],
                FACE_LANDMARKS["mouth_right"]
            )

            eye_center_y = (pts[159][1] + pts[386][1]) / 2
            mouth_center_y = (pts[13][1] + pts[14][1]) / 2
            nose = pts[1]

            item["eyes"] = {
                "left_open": round(left_eye, 5),
                "right_open": round(right_eye, 5),
                "blink_score": round(1.0 - min((left_eye + right_eye) / 0.12, 1.0), 5)
            }
            item["mouth"] = {
                "open_ratio": round(mouth_open, 5),
                "width": round(distance(pts[61], pts[291]), 5),
                "audio_rms": item["audio_rms"]
            }
            item["head"] = {
                "nose_x": round(nose[0], 5),
                "nose_y": round(nose[1], 5),
                "eye_line_y": round(eye_center_y, 5),
                "mouth_line_y": round(mouth_center_y, 5)
            }

        if pose_result.pose_landmarks:
            plm = pose_result.pose_landmarks.landmark
            item["body"] = {
                name: normalize_point(plm[idx])
                for name, idx in POSE_LANDMARKS.items()
            }

        frames.append(item)
        index += 1

    cap.release()
    face_mesh.close()
    pose.close()

    result = {
        "version": 1,
        "video": str(Path(args.video).resolve()),
        "audio": str(Path(args.audio).resolve()),
        "fps": round(fps, 4),
        "width": width,
        "height": height,
        "frame_count": frame_count or len(frames),
        "tracked_frames": len(frames),
        "tracking": {
            "face": True,
            "eyes": True,
            "mouth": True,
            "body": True,
            "audio_rms": True
        },
        "frames": frames
    }

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8"
    )

    print(
        f"[avatar-track] frames={len(frames)} fps={fps:.2f} "
        f"face/eyes/mouth/body/audio=enabled"
    )


if __name__ == "__main__":
    main()
