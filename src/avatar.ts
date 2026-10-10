import { spawn } from "node:child_process";
import { mkdir, access, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { createWriteStream } from "node:fs";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AvatarMode = "off" | "musetalk" | "sadtalker" | "hf-sadtalker";

export interface AvatarConfig {
  mode: AvatarMode;
  sourceVideo: string;
  sourceImage: string;       // presenter image for SadTalker (first frame of sourceVideo)
  museTalkRoot: string;
  python: string;
  trackerPython: string;
  trackerScript: string;
  resultDir: string;
  ffmpegPath: string;
  batchSize: number;
  useFloat16: boolean;
  tracking: boolean;
  falKey: string;            // fal.ai API key for SadTalker (paid)
  hfToken: string;           // HF token for free ZeroGPU (optional, 5min/day)
  hfSadTalkerPython: string; // Python with gradio_client for HF Spaces
  hfSadTalkerScript: string; // sadtalker_hf.py path
}

export interface AvatarResult {
  status: "disabled" | "completed" | "failed";
  videoPath: string | null;
  trackingPath: string | null;
  reason?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AI_ROOT = process.env.AI_ROOT ?? "E:\\AI-Shorts";

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function getAvatarConfig(): AvatarConfig {
  return {
    mode: (process.env.AVATAR_MODE as AvatarMode | undefined) ?? "off",
    sourceVideo:
      process.env.AVATAR_SOURCE ??
      path.join(AI_ROOT, "avatars", "presenter.mp4"),
    sourceImage:
      process.env.AVATAR_IMAGE ??
      path.join(AI_ROOT, "avatars", "presenter.jpg"),
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
    tracking: envBool("AVATAR_TRACKING", true),
    falKey: process.env.FAL_KEY ?? "",
    hfToken: process.env.HF_TOKEN ?? "",
    hfSadTalkerPython:
      process.env.HF_SADTALKER_PYTHON ??
      path.join(AI_ROOT, "avatar", "tracking-venv", "Scripts", "python.exe"),
    hfSadTalkerScript:
      process.env.HF_SADTALKER_SCRIPT ??
      path.join(process.cwd(), "scripts", "sadtalker_hf.py")
  };
}

// ─── Shared utilities ────────────────────────────────────────────────────────

function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
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

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? httpsRequest : httpRequest;
    const file = createWriteStream(destPath);
    const req = proto(url, res => {
      // Follow redirects (up to 5)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });
    req.on("error", err => { file.close(); reject(err); });
    req.end();
  });
}

function httpPost(
  hostname: string,
  path: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname,
      path,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) }
    }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function httpGet(
  hostname: string,
  urlPath: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname, path: urlPath, method: "GET", headers }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.end();
  });
}

// ─── Presenter image extraction ──────────────────────────────────────────────

async function extractPresenterImage(
  videoPath: string,
  imagePath: string,
  ffmpegBin: string
): Promise<void> {
  if (await exists(imagePath)) {
    console.log("[avatar] reusing cached presenter image");
    return;
  }
  console.log("[avatar] extracting presenter image from video (first frame)");
  await mkdir(path.dirname(imagePath), { recursive: true });
  await runCommand(path.join(ffmpegBin, "ffmpeg.exe"), [
    "-y",
    "-i", videoPath,
    "-vframes", "1",
    "-q:v", "2",
    "-vf", "scale=512:512:force_original_aspect_ratio=increase,crop=512:512",
    imagePath
  ]);
}

// ─── fal.ai SadTalker integration ────────────────────────────────────────────

interface FalUploadResponse {
  url: string;
}

interface FalQueueResponse {
  request_id: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error?: string;
}

interface FalResultResponse {
  video?: { url: string };
  error?: string;
}

async function falUploadFile(filePath: string, falKey: string): Promise<string> {
  // Read file as buffer
  const fileBuffer = await readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    wav: "audio/wav", mp3: "audio/mpeg", mp4: "video/mp4"
  };
  const contentType = mimeMap[ext] ?? "application/octet-stream";
  const fileName = path.basename(filePath);

  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: "fal.run",
      path: "/fal-ai/storage/upload/initiate",
      method: "POST",
      headers: {
        "Authorization": `Key ${falKey}`,
        "Content-Type": "application/json"
      }
    }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`fal upload initiate failed: ${res.statusCode} ${data}`));
          return;
        }
        try {
          const json = JSON.parse(data) as { upload_url?: string; file_url?: string };
          if (json.upload_url) {
            // Upload to the presigned URL
            const url = new URL(json.upload_url);
            const uploadReq = httpsRequest({
              hostname: url.hostname,
              path: url.pathname + url.search,
              method: "PUT",
              headers: { "Content-Type": contentType, "Content-Length": fileBuffer.length }
            }, uploadRes => {
              uploadRes.resume();
              uploadRes.on("end", () => {
                if (json.file_url) resolve(json.file_url);
                else reject(new Error("fal upload: no file_url returned"));
              });
            });
            uploadReq.on("error", reject);
            uploadReq.write(fileBuffer);
            uploadReq.end();
          } else if (json.file_url) {
            resolve(json.file_url);
          } else {
            reject(new Error(`fal upload: unexpected response: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify({ file_name: fileName, content_type: contentType }));
    req.end();
  });
}

async function runSadTalker(options: {
  audioPath: string;
  outputName: string;
  config: AvatarConfig;
}): Promise<AvatarResult> {
  const { audioPath, outputName, config } = options;

  if (!config.falKey) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: "FAL_KEY not set in .env — get a free API key from https://fal.ai"
    };
  }

  // Step 1: Make sure presenter image exists
  await extractPresenterImage(
    config.sourceVideo,
    config.sourceImage,
    config.ffmpegPath
  );

  if (!(await exists(config.sourceImage))) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `Presenter image not found: ${config.sourceImage}`
    };
  }

  // Step 2: Upload image + audio to fal storage
  console.log("[sadtalker] uploading presenter image to fal.ai...");
  const imageUrl = await falUploadFile(config.sourceImage, config.falKey);
  console.log(`[sadtalker] image uploaded: ${imageUrl}`);

  console.log("[sadtalker] uploading audio to fal.ai...");
  const audioUrl = await falUploadFile(audioPath, config.falKey);
  console.log(`[sadtalker] audio uploaded: ${audioUrl}`);

  // Step 3: Submit job to fal.ai SadTalker queue
  console.log("[sadtalker] submitting job to fal.ai...");
  const submitRes = await httpPost(
    "queue.fal.run",
    "/fal-ai/sadtalker",
    {
      "Authorization": `Key ${config.falKey}`,
      "Content-Type": "application/json"
    },
    JSON.stringify({
      source_image_url: imageUrl,
      driven_audio_url: audioUrl,
      expression_scale: 1.0,
      still_mode: false,
      preprocess: "full",
      size: 512
    })
  );

  if (submitRes.status !== 200) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `fal.ai submit failed: ${submitRes.status} ${submitRes.body}`
    };
  }

  const submitJson = JSON.parse(submitRes.body) as FalQueueResponse;
  const requestId = submitJson.request_id;
  if (!requestId) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `fal.ai: no request_id in response: ${submitRes.body}`
    };
  }
  console.log(`[sadtalker] job submitted: ${requestId}`);

  // Step 4: Poll for completion (up to 10 minutes)
  const maxWaitMs = 10 * 60 * 1000;
  const pollIntervalMs = 5000;
  const startTime = Date.now();
  let lastStatus = "";

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollIntervalMs));

    const statusRes = await httpGet(
      "queue.fal.run",
      `/fal-ai/sadtalker/requests/${requestId}/status`,
      { "Authorization": `Key ${config.falKey}` }
    );

    const statusJson = JSON.parse(statusRes.body) as FalStatusResponse;
    if (statusJson.status !== lastStatus) {
      console.log(`[sadtalker] status: ${statusJson.status}`);
      lastStatus = statusJson.status;
    }

    if (statusJson.status === "FAILED") {
      return {
        status: "failed",
        videoPath: null,
        trackingPath: null,
        reason: `fal.ai job failed: ${statusJson.error ?? "unknown error"}`
      };
    }

    if (statusJson.status === "COMPLETED") break;
  }

  if (lastStatus !== "COMPLETED") {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: "fal.ai job timed out after 10 minutes"
    };
  }

  // Step 5: Fetch result
  const resultRes = await httpGet(
    "queue.fal.run",
    `/fal-ai/sadtalker/requests/${requestId}`,
    { "Authorization": `Key ${config.falKey}` }
  );

  const resultJson = JSON.parse(resultRes.body) as FalResultResponse;
  if (!resultJson.video?.url) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `fal.ai: no video URL in result: ${resultRes.body}`
    };
  }

  // Step 6: Download result video
  const outputDir = config.resultDir;
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, outputName);

  console.log(`[sadtalker] downloading result video...`);
  await downloadFile(resultJson.video.url, outputPath);
  console.log(`[sadtalker] done: ${outputPath}`);

  return {
    status: "completed",
    videoPath: outputPath,
    trackingPath: null
  };
}

// ─── HF Spaces SadTalker (genuinely free via ZeroGPU) ───────────────────────

async function runHfSadTalker(options: {
  audioPath: string;
  outputName: string;
  config: AvatarConfig;
}): Promise<AvatarResult> {
  const { audioPath, outputName, config } = options;

  if (!(await exists(config.hfSadTalkerPython))) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `HF SadTalker Python not found: ${config.hfSadTalkerPython} — run: pip install gradio_client in tracking-venv`
    };
  }

  if (!(await exists(config.hfSadTalkerScript))) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `HF SadTalker script not found: ${config.hfSadTalkerScript}`
    };
  }

  // Extract presenter image (first frame) if needed
  await extractPresenterImage(config.sourceVideo, config.sourceImage, config.ffmpegPath);

  if (!(await exists(config.sourceImage))) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: `Presenter image not found: ${config.sourceImage}`
    };
  }

  await mkdir(config.resultDir, { recursive: true });
  const outputPath = path.join(config.resultDir, outputName);

  console.log("[hf-sadtalker] submitting to Hugging Face ZeroGPU (free)...");
  console.log("[hf-sadtalker] note: free quota = 5 min GPU/day per HF account");

  const args = [
    config.hfSadTalkerScript,
    "--image", config.sourceImage,
    "--audio", audioPath,
    "--output", outputPath
  ];

  if (config.hfToken) {
    args.push("--hf-token", config.hfToken);
  }

  try {
    await runCommand(config.hfSadTalkerPython, args);
    if (!(await exists(outputPath))) {
      return {
        status: "failed",
        videoPath: null,
        trackingPath: null,
        reason: "HF SadTalker completed but output video not found"
      };
    }
    return { status: "completed", videoPath: outputPath, trackingPath: null };
  } catch (error) {
    return {
      status: "failed",
      videoPath: null,
      trackingPath: null,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}



async function preparePresenterSource(config: AvatarConfig): Promise<string> {
  const rawSource = process.env.AVATAR_RAW_SOURCE;
  const background = process.env.AVATAR_BACKGROUND;
  const enabled = envBool("AVATAR_PREPARE", true);
  if (!enabled || !rawSource || !background) return config.sourceVideo;

  const prepared = config.sourceVideo;
  if (await exists(prepared)) return prepared;

  if (!(await exists(rawSource))) throw new Error(`Missing raw presenter source: ${rawSource}`);
  if (!(await exists(background))) throw new Error(`Missing WoHoTech background: ${background}`);

  const bgPython =
    process.env.AVATAR_BACKGROUND_PYTHON ??
    path.join(AI_ROOT, "avatar", "background-venv", "Scripts", "python.exe");
  const script = path.join(process.cwd(), "scripts", "prepare_presenter.py");
  if (!(await exists(bgPython))) throw new Error(`Missing background Python: ${bgPython}`);
  if (!(await exists(script))) throw new Error(`Missing presenter preparation script: ${script}`);

  await mkdir(path.dirname(prepared), { recursive: true });
  console.log("[avatar] preparing presenter: background removal + WoHoTech background");
  await runCommand(bgPython, [
    script, "--input", rawSource, "--background", background,
    "--output", prepared, "--ffmpeg", path.join(config.ffmpegPath, "ffmpeg.exe")
  ]);
  return prepared;
}

function yamlPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/"/g, '\\"');
}

async function writeInferenceConfig(filePath: string, sourceVideo: string, audioPath: string): Promise<void> {
  const content = [
    "task_0:",
    `  video_path: "${yamlPath(sourceVideo)}"`,
    `  audio_path: "${yamlPath(audioPath)}"`,
    "  bbox_shift: 0"
  ].join("\n") + "\n";
  await writeFile(filePath, content, "utf8");
}

async function runTracking(config: AvatarConfig, sourceVideo: string, audioPath: string, outputPath: string): Promise<void> {
  console.log("[avatar] tracking face + eyes + mouth + body + audio");
  await runCommand(config.trackerPython, [
    config.trackerScript, "--video", sourceVideo, "--audio", audioPath, "--output", outputPath
  ]);
}

async function findGeneratedAvatar(resultDir: string, outputName: string): Promise<string | null> {
  const expected = path.join(resultDir, "v15", outputName);
  return (await exists(expected)) ? expected : null;
}

async function runMuseTalk(options: {
  audioPath: string;
  outputName: string;
  config: AvatarConfig;
}): Promise<AvatarResult> {
  const { audioPath, outputName, config } = options;

  const preparedSource = await preparePresenterSource(config);

  const required = [
    [preparedSource, "prepared presenter source video"],
    [config.python, "MuseTalk Python"],
    [path.join(config.museTalkRoot, "scripts", "inference.py"), "MuseTalk inference"],
    [path.join(config.museTalkRoot, "models", "musetalkV15", "unet.pth"), "MuseTalk 1.5 model"]
  ] as const;

  for (const [filePath, label] of required) {
    if (!(await exists(filePath))) {
      return { status: "failed", videoPath: null, trackingPath: null, reason: `Missing ${label}: ${filePath}` };
    }
  }

  await mkdir(config.resultDir, { recursive: true });

  const jobBase = path.parse(outputName).name;
  const jobDir = path.join(config.resultDir, jobBase);
  await mkdir(jobDir, { recursive: true });

  const trackingPath = path.join(jobDir, "tracking.json");
  const inferenceConfig = path.join(jobDir, "inference.yaml");

  if (config.tracking) {
    await runTracking(config, preparedSource, audioPath, trackingPath);
  }

  await writeInferenceConfig(inferenceConfig, preparedSource, audioPath);
  console.log("[avatar] MuseTalk 1.5 inference");

  const inputBasename = path.parse(preparedSource).name;
  const pkPath = path.join(config.resultDir, "..", `${inputBasename}.pkl`);
  const hasCachedCoords = await exists(pkPath);

  const args = [
    "-m", "scripts.inference",
    "--inference_config", inferenceConfig,
    "--ffmpeg_path", config.ffmpegPath,
    "--result_dir", config.resultDir,
    "--unet_model_path", path.join(config.museTalkRoot, "models", "musetalkV15", "unet.pth"),
    "--unet_config", path.join(config.museTalkRoot, "models", "musetalkV15", "musetalk.json"),
    "--whisper_dir", path.join(config.museTalkRoot, "models", "whisper"),
    "--version", "v15",
    "--batch_size", String(config.batchSize),
    "--extra_margin", "10",
    "--parsing_mode", "jaw",
    "--output_vid_name", `${path.parse(outputName).name}.mp4`,
    "--saved_coord"
  ];

  if (hasCachedCoords) {
    args.push("--use_saved_coord");
    console.log("[avatar] reusing cached presenter face coordinates");
  } else {
    console.log("[avatar] extracting presenter face coordinates (first run, ~30s)");
  }

  if (config.useFloat16) args.push("--use_float16");

  try {
    await runCommand(config.python, args, config.museTalkRoot);
    const generated = await findGeneratedAvatar(config.resultDir, `${path.parse(outputName).name}.mp4`);
    if (!generated) {
      return { status: "failed", videoPath: null, trackingPath: config.tracking ? trackingPath : null, reason: "MuseTalk completed but output video was not found." };
    }
    return { status: "completed", videoPath: generated, trackingPath: config.tracking ? trackingPath : null };
  } catch (error) {
    return { status: "failed", videoPath: null, trackingPath: config.tracking ? trackingPath : null, reason: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function prepareAvatar(options: {
  audioPath: string;
  outputName: string;
}): Promise<AvatarResult> {
  const config = getAvatarConfig();

  if (config.mode === "off") {
    return { status: "disabled", videoPath: null, trackingPath: null, reason: "AVATAR_MODE=off" };
  }

  if (config.mode === "sadtalker") {
    return runSadTalker({ audioPath: options.audioPath, outputName: options.outputName, config });
  }

  if (config.mode === "hf-sadtalker") {
    return runHfSadTalker({ audioPath: options.audioPath, outputName: options.outputName, config });
  }

  if (config.mode === "musetalk") {
    return runMuseTalk({ audioPath: options.audioPath, outputName: options.outputName, config });
  }

  return {
    status: "failed",
    videoPath: null,
    trackingPath: null,
    reason: `Unsupported AVATAR_MODE: ${config.mode} — valid values: off | hf-sadtalker | sadtalker | musetalk`
  };
}
