import { spawn } from "node:child_process";

const FFPROBE = "E:\\AI-Shorts\\ffmpeg\\bin\\ffprobe.exe";

function runProbe(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate", "-show_entries", "format=duration", "-of", "json", filePath], { windowsHide: true });
    let stdout = "", stderr = "";
    process.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    process.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
    process.on("error", reject);
    process.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `ffprobe exited with code ${code}`)));
  });
}

export interface VideoValidation {
  valid: boolean;
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  fps: number;
  reason?: string;
}

export async function validateShort(filePath: string): Promise<VideoValidation> {
  try {
    const parsed = JSON.parse(await runProbe(filePath)) as {
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }>;
      format?: { duration?: string };
    };
    const video = parsed.streams?.find((s) => s.codec_type === "video");
    const audio = parsed.streams?.find((s) => s.codec_type === "audio");
    const duration = Number(parsed.format?.duration ?? 0);
    const [num, den] = (video?.r_frame_rate ?? "0/1").split("/").map(Number);
    const fps = num / Math.max(den, 1);
    const valid = Boolean(video && audio) &&
      video?.codec_name === "h264" && audio?.codec_name === "aac" &&
      video?.width === 1080 && video?.height === 1920 &&
      Math.abs(fps - 30) < 0.1 && duration > 0 && duration <= 180;
    return {
      valid, duration, width: video?.width ?? 0, height: video?.height ?? 0,
      videoCodec: video?.codec_name ?? "unknown", audioCodec: audio?.codec_name ?? "unknown",
      fps, reason: valid ? undefined : "Expected H.264/AAC, 1080x1920, ~30fps, duration 1-180 seconds."
    };
  } catch (error) {
    return { valid:false, duration:0, width:0, height:0, videoCodec:"unknown", audioCodec:"unknown", fps:0,
      reason:error instanceof Error ? error.message : String(error) };
  }
}
