import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AssCaption {
  start: number;
  end: number;
  text: string;
}

const TEMP_DIR = "E:\\AI-Shorts\\temp";

function formatAssTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 60 - secs) * 100);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

export async function generateAssCaptions(
  captions: AssCaption[],
  outputName: string
): Promise<string> {
  await mkdir(TEMP_DIR, { recursive: true });

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Shorts,Arial,72,&H00FFFFFF,&H00FFFF00,&H00111111,&HCC000000,-1,0,0,0,100,100,0,0,1,5,2,5,80,80,500,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = captions
    .map((caption) => {
      const text = `{\\fad(90,70)\\t(0,180,\\fscx108\\fscy108)\\t(180,320,\\fscx100\\fscy100)}${caption.text}
        .replace(/\r?\n/g, " ")
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}");

      return [
        "Dialogue: 0",
        formatAssTime(caption.start),
        formatAssTime(caption.end),
        "Shorts",
        "",
        "0",
        "0",
        "0",
        "",
        text
      ].join(",");
    })
    .join("\n");

  const outputPath = path.join(TEMP_DIR, outputName);

  await writeFile(
    outputPath,
    `${header}${events}\n`,
    "utf8"
  );

  console.log(`[ass] generated: ${outputPath}`);

  return outputPath;
}
