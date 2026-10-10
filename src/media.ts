import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const AI_ROOT = process.env.AI_ROOT ?? "E:\\AI-Shorts";
const FFPROBE =
  process.env.FFPROBE_PATH ??
  `${AI_ROOT}\\ffmpeg\\bin\\ffprobe.exe`;
const MEDIA_DIRS: string[] = (
  process.env.MEDIA_DIRS
    ? process.env.MEDIA_DIRS.split(";").map((d) => d.trim()).filter(Boolean)
    : [`${AI_ROOT}\\images`, `${AI_ROOT}\\videos`]
);

export interface MediaAsset {
  path: string;
  type: "image" | "video";
  duration?: number;
}

export interface Scene {
  id: string;
  start: number;
  end: number;
  duration: number;
  asset: MediaAsset | null;
  motion: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
}

function runProcess(
  executable: string,
  args: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(executable, args, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    process.on("error", reject);

    process.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(
            `${executable} failed with code ${code}: ${stderr}`
          )
        );
      }
    });
  });
}

export function getMediaDuration(
  filePath: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const process = spawn(
      FFPROBE,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ],
      {
        windowsHide: true
      }
    );

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    process.on("error", reject);

    process.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffprobe failed with code ${code}${stderr ? `: ${stderr}` : ""}`
          )
        );
        return;
      }

      const duration = Number.parseFloat(stdout.trim());

      if (!Number.isFinite(duration) || duration <= 0) {
        reject(
          new Error(
            `Invalid media duration: ${stdout.trim()}`
          )
        );
        return;
      }

      resolve(duration);
    });
  });
}

export async function discoverMediaAssets(): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];

  for (const directory of MEDIA_DIRS) {
    let files: string[] = [];
    try {
      files = await readdir(directory);
    } catch {
      continue;
    }

    for (const file of files) {
      if (/^short-.*\.mp4$/i.test(file) || /-scene-\d+\.mp4$/i.test(file) || /-base\.mp4$/i.test(file) || /-captioned\.mp4$/i.test(file)) {
        console.log(`[media] ignored engine output: ${file}`);
        continue;
      }

      const filePath = path.join(directory, file);
      const extension = path.extname(file).toLowerCase();

      if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
        assets.push({ path: filePath, type: "image" });
      } else if ([".mp4", ".mov", ".webm", ".mkv"].includes(extension)) {
        try {
          assets.push({ path: filePath, type: "video", duration: await getMediaDuration(filePath) });
        } catch {
          console.warn(`[media] unable to read duration: ${filePath}`);
        }
      }
    }
  }

  console.log(`[media] discovered ${assets.length} reusable local assets`);
  return assets;
}
export async function buildScenePlan(
  totalDuration: number
): Promise<Scene[]> {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    throw new Error(
      "Scene planning requires a valid duration."
    );
  }

  const assets = await discoverMediaAssets();

  const sceneCount =
    totalDuration < 8
      ? 2
      : totalDuration < 14
        ? 3
        : 4;

  const sceneDuration =
    totalDuration / sceneCount;

  const motions: Scene["motion"][] = [
    "zoom-in",
    "pan-right",
    "zoom-out",
    "pan-left"
  ];

  const scenes: Scene[] = [];

  for (let index = 0; index < sceneCount; index++) {
    const start = index * sceneDuration;
    const end =
      index === sceneCount - 1
        ? totalDuration
        : (index + 1) * sceneDuration;

    const asset =
      assets.length > 0
        ? assets[index % assets.length]
        : null;

    scenes.push({
      id: `scene-${String(index + 1).padStart(2, "0")}`,
      start,
      end,
      duration: end - start,
      asset,
      motion: motions[index % motions.length]
    });
  }

  console.log("\n[scene-engine] scene plan");

  for (const scene of scenes) {
    console.log(
      `${scene.id}: ` +
      `${scene.start.toFixed(2)}s → ` +
      `${scene.end.toFixed(2)}s | ` +
      `${scene.motion} | ` +
      `${scene.asset?.path ?? "generated background"}`
    );
  }

  return scenes;
}