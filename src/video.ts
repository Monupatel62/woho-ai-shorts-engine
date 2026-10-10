import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Scene } from "./media.ts";

export interface VideoOptions {
  audioPath: string;
  captionPath?: string;
  outputName?: string;
  title?: string;
  scenes?: Scene[];
  avatarPath?: string;
}

export interface VideoResult {
  videoPath: string | null;
  status: "completed" | "failed";
}

const AI_ROOT = process.env.AI_ROOT ?? "E:\\AI-Shorts";
const FFMPEG =
  process.env.FFMPEG_BIN ??
  `${AI_ROOT}\\ffmpeg\\bin\\ffmpeg.exe`;

const VIDEO_DIR =
  process.env.VIDEO_DIR ??
  `${AI_ROOT}\\videos`;

function runFfmpeg(
  args: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(
      FFMPEG,
      args,
      {
        windowsHide: true
      }
    );

    let stderr = "";

    process.stderr.on(
      "data",
      (data: Buffer) => {
        stderr += data.toString();
      }
    );

    process.on(
      "error",
      reject
    );

    process.on(
      "close",
      (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              stderr ||
              `FFmpeg exited with code ${code}`
            )
          );
        }
      }
    );
  });
}

function escapeSubtitlePath(
  filePath: string
): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:");
}

function escapeDrawtext(
  text: string
): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

function buildAnimatedBackgroundFilter(title: string): string {
  const safeTitle=escapeDrawtext(title);
  const keywords=title
    .split(/\s+/)
    .map((word)=>word.replace(/[^a-zA-Z0-9]/g,""))
    .filter((word)=>word.length>=3)
    .slice(0,4);

  const keywordText=keywords.length>0 ? keywords.join("  •  ") : "WOHO SHORTS";
  const safeKeywords=escapeDrawtext(keywordText);

  return [
    "drawbox=x='-300+mod(t*120,1600)':y='180+80*sin(t)':w=520:h=520:color=0x2563eb@0.18:t=fill",
    "drawbox=x='850-mod(t*90,1300)':y='650+120*cos(t*0.8)':w=620:h=620:color=0x7c3aed@0.16:t=fill",
    "drawbox=x='200+100*sin(t*0.7)':y='1300-mod(t*110,500)':w=480:h=480:color=0x06b6d4@0.15:t=fill",
    "drawbox=x='650+140*cos(t*0.5)':y='1450+80*sin(t*0.9)':w=360:h=360:color=0xec4899@0.12:t=fill",
    "drawbox=x='40+80*sin(t)':y='40':w=1000:h=8:color=0xffffff@0.08:t=fill",
    "drawbox=x='40':y='1870':w=1000:h=8:color=0xffffff@0.08:t=fill",
    `drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${safeTitle}':fontcolor=white@0.92:fontsize=54:x=(w-text_w)/2:y=230:box=1:boxcolor=0x000000@0.28:boxborderw=18`,
    `drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${safeKeywords}':fontcolor=0xFFFFFF@0.72:fontsize=34:x=(w-text_w)/2:y=330`,
    "drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='WOHO AI SHORTS':fontcolor=white@0.42:fontsize=28:x=(w-text_w)/2:y=1780",
    "format=yuv420p"
  ].join(",");
}
async function renderGeneratedScene(
  scene: Scene,
  outputPath: string,
  title: string
): Promise<void> {
  const visualFilter =
    buildAnimatedBackgroundFilter(
      title
    );

  await runFfmpeg([
    "-y",

    "-f",
    "lavfi",

    "-i",
    "color=c=0x080d1a:s=1080x1920:r=30",

    "-t",
    scene.duration.toFixed(3),

    "-vf",
    visualFilter,

    "-an",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-pix_fmt",
    "yuv420p",

    outputPath
  ]);
}

async function renderImageScene(
  scene: Scene,
  outputPath: string
): Promise<void> {
  if (!scene.asset) {
    throw new Error(
      "Image scene requires an asset."
    );
  }

  const duration =
    scene.duration.toFixed(3);

  let motionFilter: string;

  switch (scene.motion) {
    case "zoom-out":
      motionFilter =
        "zoompan=z='min(1.20,max(1.0,1.20-0.20*on/(fps*duration)))':d=1";
      break;

    case "pan-left":
      motionFilter =
        "zoompan=z='1.12':x='iw/2-(iw/zoom/2)-min(on*2,80)':y='ih/2-(ih/zoom/2)':d=1";
      break;

    case "pan-right":
      motionFilter =
        "zoompan=z='1.12':x='iw/2-(iw/zoom/2)+min(on*2,80)':y='ih/2-(ih/zoom/2)':d=1";
      break;

    case "zoom-in":
    default:
      motionFilter =
        "zoompan=z='min(1.20,1.0+0.20*on/(fps*duration))':d=1";
      break;
  }

  await runFfmpeg([
    "-y",

    "-loop",
    "1",

    "-i",
    scene.asset.path,

    "-t",
    duration,

    "-vf",
    `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${motionFilter},fps=30,format=yuv420p`,

    "-an",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-pix_fmt",
    "yuv420p",

    outputPath
  ]);
}

async function renderVideoScene(
  scene: Scene,
  outputPath: string
): Promise<void> {
  if (!scene.asset) {
    throw new Error(
      "Video scene requires an asset."
    );
  }

  await runFfmpeg([
    "-y",

    "-stream_loop",
    "-1",

    "-i",
    scene.asset.path,

    "-t",
    scene.duration.toFixed(3),

    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p",

    "-an",

    "-c:v",
    "libx264",

    "-preset",
    "veryfast",

    "-crf",
    "23",

    "-pix_fmt",
    "yuv420p",

    outputPath
  ]);
}

async function renderScene(
  scene: Scene,
  outputPath: string,
  title: string
): Promise<void> {
  if (!scene.asset) {
    await renderGeneratedScene(
      scene,
      outputPath,
      title
    );

    return;
  }

  if (
    scene.asset.type ===
    "image"
  ) {
    await renderImageScene(
      scene,
      outputPath
    );

    return;
  }

  await renderVideoScene(
    scene,
    outputPath
  );
}


async function renderAvatarScene(
  avatarPath: string,
  outputPath: string
): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i",
    avatarPath,
    "-vf",
    "scale=1152:2048:force_original_aspect_ratio=increase,crop=1080:1920:x='(iw-1080)/2+18*sin(t*0.55)':y='(ih-1920)/2+12*cos(t*0.43)',fps=30,format=yuv420p",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ]);
}

async function joinScenes(
  scenePaths: string[],
  outputPath: string
): Promise<void> {
  const concatList =
    path.join(
      VIDEO_DIR,
      `${path.parse(outputPath).name}-scenes.txt`
    );

  const concatContent =
    scenePaths
      .map(
        (scenePath) =>
          `file '${scenePath.replace(/'/g, "'\\''")}'`
      )
      .join("\n");

  await writeFile(
    concatList,
    `${concatContent}\n`,
    "utf8"
  );

  console.log(
    "[scene-engine] joining scenes"
  );

  await runFfmpeg([
    "-y",

    "-f",
    "concat",

    "-safe",
    "0",

    "-i",
    concatList,

    "-c",
    "copy",

    outputPath
  ]);
}

export async function generateVideo(
  options: VideoOptions
): Promise<VideoResult> {
  await mkdir(
    VIDEO_DIR,
    {
      recursive: true
    }
  );

  const outputName =
    options.outputName ??
    `short-${Date.now()}.mp4`;

  const outputPath =
    path.join(
      VIDEO_DIR,
      outputName
    );

  const baseName =
    `${path.parse(outputName).name}-base.mp4`;

  const basePath =
    path.join(
      VIDEO_DIR,
      baseName
    );

  const title =
    options.title ??
    "AI Short";

  console.log(
    "\nVideo Engine"
  );

  console.log(
    "Visual Layer: Scene Engine"
  );

  console.log(
    "Resolution: 1080x1920"
  );

  console.log(
    `Title: ${title}`
  );

  console.log(
    `Audio: ${options.audioPath}`
  );

  console.log(
    `Output: ${outputPath}`
  );

  if (options.avatarPath) {
    console.log(`Avatar: ${options.avatarPath}`);
    console.log("Avatar Layer: tracked presenter + audio-driven face");
  }

  try {
    if (options.avatarPath) {
      console.log("[avatar-engine] using tracked presenter video");
      await renderAvatarScene(options.avatarPath, basePath);
    } else {
      const scenes = options.scenes ?? [];

      if (scenes.length === 0) {
        console.log(
          "[scene-engine] no scene plan supplied"
        );

        await runFfmpeg([
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=0x080d1a:s=1080x1920:r=30",
          "-vf",
          buildAnimatedBackgroundFilter(title),
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          basePath
        ]);
      } else {
        console.log(
          `[scene-engine] rendering ${scenes.length} scenes`
        );

        const scenePaths: string[] = [];

        for (let index = 0; index < scenes.length; index++) {
          const scene = scenes[index];
          const scenePath = path.join(
            VIDEO_DIR,
            `${path.parse(outputName).name}-scene-${String(index + 1).padStart(2, "0")}.mp4`
          );

          console.log(`[scene-engine] ${scene.id}`);
          console.log(`  duration: ${scene.duration.toFixed(2)}s`);
          console.log(`  motion: ${scene.motion}`);
          console.log(
            `  asset: ${scene.asset?.path ?? "generated background"}`
          );

          await renderScene(scene, scenePath, title);
          scenePaths.push(scenePath);
        }

        await joinScenes(scenePaths, basePath);
      }
    }

    if (!options.captionPath) {
      await runFfmpeg([
        "-y",

        "-i",
        basePath,

        "-i",
        options.audioPath,

        "-map",
        "0:v:0",

        "-map",
        "1:a:0",

        "-c:v",
        "copy",

        "-c:a",
        "aac",

        "-b:a",
        "128k",

        "-shortest",

        "-movflags",
        "+faststart",

        outputPath
      ]);

      console.log(
        "[video] scene video generated successfully"
      );

      return {
        videoPath:
          outputPath,
        status:
          "completed"
      };
    }

    console.log(
      `[captions] burning subtitles: ${options.captionPath}`
    );

    const subtitlePath =
      escapeSubtitlePath(
        options.captionPath
      );

    await runFfmpeg([
      "-y",

      "-i",
      basePath,

      "-i",
      options.audioPath,

      "-map",
      "0:v:0",

      "-map",
      "1:a:0",

      "-vf",
      `subtitles=filename='${subtitlePath}'`,

      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-crf",
      "23",

      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-shortest",

      "-movflags",
      "+faststart",

      outputPath
    ]);

    console.log(
      "[video] scene-based captioned video generated successfully"
    );

    return {
      videoPath:
        outputPath,
      status:
        "completed"
    };
  } catch (error) {
    console.error(
      "[video] generation failed"
    );

    console.error(error);

    return {
      videoPath:
        null,
      status:
        "failed"
    };
  }
}