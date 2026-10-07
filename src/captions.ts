import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface CaptionOptions {
  sentences: string[];
  duration: number;
  outputName: string;
}

const TEMP_DIR = "E:\\AI-Shorts\\temp";

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function splitIntoChunks(text: string, maxWords = 7): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);

  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }

  return chunks;
}

export async function generateCaptions(
  options: CaptionOptions
): Promise<string> {
  await mkdir(TEMP_DIR, { recursive: true });

  if (options.sentences.length === 0) {
    throw new Error(
      "Caption generation requires at least one sentence."
    );
  }

  if (!Number.isFinite(options.duration) || options.duration <= 0) {
    throw new Error(
      "Caption duration must be greater than zero."
    );
  }

  const chunks = options.sentences.flatMap((sentence) =>
    splitIntoChunks(sentence)
  );

  if (chunks.length === 0) {
    throw new Error("No caption chunks were generated.");
  }

  const totalWords = chunks.reduce(
    (total, chunk) => total + chunk.split(/\s+/).length,
    0
  );

  let elapsed = 0;

  const segments: CaptionSegment[] = chunks.map((text) => {
    const wordCount = text.split(/\s+/).length;

    const segmentDuration =
      (options.duration * wordCount) / totalWords;

    const segment: CaptionSegment = {
      start: elapsed,
      end: elapsed + segmentDuration,
      text
    };

    elapsed += segmentDuration;

    return segment;
  });

  const srt = segments
    .map((segment, index) => {
      return [
        String(index + 1),
        `${formatTime(segment.start)} --> ${formatTime(segment.end)}`,
        segment.text,
        ""
      ].join("\n");
    })
    .join("\n");

  const outputPath = path.join(
    TEMP_DIR,
    options.outputName
  );

  await writeFile(outputPath, srt, "utf8");

  console.log(
    `[captions] generated ${segments.length} timed chunks: ${outputPath}`
  );

  return outputPath;
}
