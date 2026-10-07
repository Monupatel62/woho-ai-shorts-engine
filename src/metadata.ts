import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ShortMetadata {
  id: string;
  topic: string;
  title: string;
  description: string;
  hashtags: string[];
  tags: string[];
  generatedAt: string;
}

const OUTPUT_DIR = "E:\\AI-Shorts\\output";

function cleanTag(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30);
}

export async function generateMetadata(id: string, topic: string, hook: string): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const words = topic.split(/\s+/).map(cleanTag).filter(Boolean);
  const hashtags = Array.from(new Set(["#shorts", "#youtubeShorts", ...words.slice(0, 4).map((word) => `#${word}`)]));
  const tags = Array.from(new Set(["shorts", "youtube shorts", topic, ...words])).slice(0, 12);
  const titleBase = hook.replace(/[.!?]+$/, "").trim();
  const title = titleBase.length > 90 ? `${titleBase.slice(0, 87).trim()}...` : titleBase;
  const metadata: ShortMetadata = {
    id, topic, title,
    description: `${hook}\n\nLearn more about ${topic}. Follow for more useful Shorts.\n\n${hashtags.join(" ")}`,
    hashtags, tags, generatedAt: new Date().toISOString()
  };
  const outputPath = path.join(OUTPUT_DIR, `${id}.json`);
  await writeFile(outputPath, JSON.stringify(metadata, null, 2), "utf8");
  console.log(`[metadata] generated: ${outputPath}`);
  return outputPath;
}
