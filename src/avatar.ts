import { spawn } from "node:child_process";
import { mkdir, access, writeFile } from "node:fs/promises";
import path from "node:path";

export type AvatarMode = "off" | "musetalk";

export interface AvatarConfig {
  mode: AvatarMode;
  sourceVideo: string;
  museTalkRoot: string;
  python: string;
  trackerPython: string;
  trackerScript: string;
  resultDir: string;
  ffmpegPath: string;
  batchSize: number;
  useFloat16: boolean;
  tracking: boolean;
}

export interface AvatarResult {
  status: "disabled" | "completed" | "failed";
  videoPath: string | null;
  trackingPath: string | null;
  reason?: string;
}

const AI_ROOT = "E:\\AI-Shorts";

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function getAvatarConfig(): AvatarConfig {
  return {
    mode: (process.env.AVATAR_MODE as AvatarMode | undefined) ?? "off",
    sourceVideo:
      process.env.AVATAR_SOURCE ??
      path.join(AI_ROOT, "avatars", "presenter.mp4"),
    museTalkRoot:
      process.env.MUSETALK_ROOT ??
      path.join(AI_ROOT, "avatar", "MuseTalk"),
    python:
      process.env.MUSETALK_PYTHON ??
      path.join(AI_ROOT, "avatar", "musetalk-venv", "Scripts", "python.exe"),
    trackerPython:
      process.env.AVATAR_TRACKER_PYTHON ?? "python",
    trackerScript:
      process.env.AVATAR_TRACKER_SCRIPT ??
      path.join(process.cwd(), "scripts", "avatar_track.py"),
    resultDir:
      process.env.AVATAR_RESULT_DIR ??
      path.join(AI_ROOT, "output", "avatars"),
    ffmpegPath:
      process.env.FFMPEG_PATH ??
      path.join(AI_ROOT, "ffmpeg", "bin"),
    batchSize: envNumber("MUSETALK_BATCH_SIZE", 1),
    useFloat16: envBool("MUSETALK_FLOAT16", false),
    tracking: envBool("AVATAR_TRACKING", true)
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(
  command: string,
  args: string[],
  cwd?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stdout.on("data", (data: Buffer) => process.stdout.write(data));
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Command exited with code ${code}`));
    });
  });
}

function yamlPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/"/g, '\\"');
}

async function writeInferenceConfig(
  filePath: string,
  sourceVideo: string,
  audioPath: string
): Promise<void> {
  const content = [
    "task_0:",
    `  video_path: "${yamlPath(sourceVideo)}"`,
    `  audio_path: "${yamlPath(audioPath)}"`,
    "  bbox_shift: 0"
  ].join("\n") + "\n";
  await writeFile(filePath, content, "utf8");
}

async function runTracking(
  config: AvatarConfig,
  sourceVideo: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  console.log("[avatar] tracking face + eyes + mouth + body + audio");
  await runCommand(config.trackerPython, [
    config.trackerScript,
    "--video", sourceVideo,
    "--audio", audioPath,
    "--output", outputPath
  ]);
}

async function findGeneratedAvatar(
  resultDir: string,
  sourceVideo: string,
  audioPath: string
): Promise<string | null> {
  const inputBase = path.basename(sourceVideo).split(".")[0];
  const audioBase = path.basename(audioPath).split(".")[0];
  const expected = path.join(
    resultDir,
    "v15",
    `${inputBase}_${audioBase}.mp4`
  );
  if (await exists(expected)) return expected;

  return null;
}

export async function prepareAvatar(options: {
  audioPath: string;
  outputName: string;
}): Promise<AvatarResult> {
  const config = getAvatarConfig();

  if (config.mode === "off") {
    return {
      status: "disabled",
      videoPath: null,
      trackingPath: null,
      reason: "AVATAR_MODE=off"
    };
  }

  if (config.mode !== "musetalk") {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `Unsupported AVATAR_MODE: ${config.mode}`
    };
  }

  const required = [
    [config.sourceVideo, "presenter source video"],
    [config.python, "MuseTalk Python"],
    [path.join(config.museTalkRoot, "scripts", "inference.py"), "MuseTalk inference"],
    [path.join(config.museTalkRoot, "models", "musetalkV15", "unet.pth"), "MuseTalk 1.5 model"]
  ] as const;

  for (const [filePath, label] of required) {
    if (!(await exists(filePath))) {
      return {
        status: "failed",
        videoPath: null,
        trackingPath: null,
        reason: `Missing ${label}: ${filePath}`
      };
    }
  }

  await mkdir(config.resultDir, { recursive: true });

  const jobBase = path.parse(options.outputName).name;
  const jobDir = path.join(config.resultDir, jobBase);
  await mkdir(jobDir, { recursive: true });

  const trackingPath = path.join(jobDir, "tracking.json");
  const inferenceConfig = path.join(jobDir, "inference.yaml");

  if (config.tracking) {
    await runTracking(
      config,
      config.sourceVideo,
      options.audioPath,
      trackingPath
    );
  }

  await writeInferenceConfig(
    inferenceConfig,
    config.sourceVideo,
    options.audioPath
  );

  console.log("[avatar] MuseTalk 1.5 inference");
  const args = [
    "-m",
    "scripts.inference",
    "--inference_config",
    inferenceConfig,
    "--ffmpeg_path",
    config.ffmpegPath,
    "--result_dir",
    config.resultDir,
    "--version",
    "v15",
    "--batch_size",
    String(config.batchSize),
    "--extra_margin",
    "10",
    "--parsing_mode",
    "jaw"
  ];

  if (config.useFloat16) args.push("--use_float16");

  try {
    await runCommand(config.python, args, config.museTalkRoot);
    const generated = await findGeneratedAvatar(
      config.resultDir,
      config.sourceVideo,
      options.audioPath
    );

    if (!generated) {
      return {
        status: "failed",
        videoPath: null,
        trackingPath: config.tracking ? trackingPath : null,
        reason: "MuseTalk completed but output video was not found."
      };
    }

    return {
      status: "completed",
      videoPath: generated,
      trackingPath: config.tracking ? trackingPath : null
    };
  } catch (error) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: config.tracking ? trackingPath : null,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
