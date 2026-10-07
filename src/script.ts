import { generateAiScript } from "./ai.ts";

export interface ShortScript {
  topic: string;
  hook: string;
  body: string[];
  cta: string;
  source: "ollama" | "fallback";
}

function fallbackScript(topic: string): ShortScript {
  return {
    topic,
    hook: `Stop scrolling! Here are 3 useful things about ${topic}.`,
    body: [
      `First, understand the basics of ${topic}.`,
      `Second, focus on the most practical ways to use ${topic}.`,
      "Third, keep testing and learning what works."
    ],
    cta: "Follow for more useful Shorts.",
    source: "fallback"
  };
}

export async function createScript(topic: string): Promise<ShortScript> {
  const cleanTopic = topic.trim();
  if (!cleanTopic) throw new Error("Topic cannot be empty.");
  const ai = await generateAiScript(cleanTopic);
  if (!ai || ai.body.length < 3) return fallbackScript(cleanTopic);
  return { topic: cleanTopic, hook: ai.hook, body: ai.body, cta: ai.cta, source: "ollama" };
}
