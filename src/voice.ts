import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface VoiceOptions {
  text: string;
  voice: string;
  speed: number;
  outputName?: string;
}

export interface VoiceResult {
  text: string;
  voice: string;
  speed: number;
  audioPath: string | null;
  status: "pending" | "completed" | "failed";
}

const PIPER = "E:\\AI-Shorts\\ollama\\tts-venv\\Scripts\\piper.exe";
const MODEL =
  "E:\\AI-Shorts\\models\\piper\\en_US-lessac-medium.onnx";
const AUDIO_DIR = "E:\\AI-Shorts\\audio";

export async function generateVoice(
  options: VoiceOptions
): Promise<VoiceResult> {
  const outputName = options.outputName ?? `voice-${Date.now()}.wav`;
  const outputPath = path.join(AUDIO_DIR, outputName);

  await mkdir(AUDIO_DIR, { recursive: true });

  console.log("\nVoice Engine");
  console.log(`Voice: ${options.voice}`);
  console.log(`Speed: ${options.speed}`);
  console.log(`Characters: ${options.text.length}`);
  console.log(`Output: ${outputPath}`);

  try {
    await new Promise<void>((resolve, reject) => {
      const process = spawn(
        PIPER,
        [
          "--model",
          MODEL,
          "--output_file",
          outputPath
        ],
        {
          windowsHide: true
        }
      );

      let stderr = "";

      process.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      process.on("error", reject);

      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Piper exited with code ${code}${stderr ? `: ${stderr}` : ""}`
            )
          );
        }
      });

      process.stdin.write(options.text);
      process.stdin.end();
    });

    console.log("[voice] audio generated successfully");

    return {
      text: options.text,
      voice: options.voice,
      speed: options.speed,
      audioPath: outputPath,
      status: "completed"
    };
  } catch (error) {
    console.error("[voice] generation failed:", error);

    return {
      text: options.text,
      voice: options.voice,
      speed: options.speed,
      audioPath: null,
      status: "failed"
    };
  }
}
