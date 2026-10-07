import { request } from "node:http";

export interface AiScript {
  hook: string;
  body: string[];
  cta: string;
}

const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

function extractJson(text: string): AiScript | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<AiScript>;
    if (typeof parsed.hook !== "string" || !Array.isArray(parsed.body) ||
        parsed.body.some((item) => typeof item !== "string") ||
        typeof parsed.cta !== "string") return null;
    return {
      hook: parsed.hook.trim(),
      body: parsed.body.map((item) => item.trim()).filter(Boolean).slice(0, 5),
      cta: parsed.cta.trim()
    };
  } catch { return null; }
}

function callOllama(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0.7, num_ctx: 2048 },
      prompt
    });
    const req = request({
      hostname: "127.0.0.1", port: 11434, path: "/api/generate", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 30000
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`Ollama HTTP ${res.statusCode}: ${data}`));
        try {
          const parsed = JSON.parse(data) as { response?: string };
          if (!parsed.response) return reject(new Error("Ollama returned no response."));
          resolve(parsed.response);
        } catch (error) { reject(error); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Ollama request timed out.")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function generateAiScript(topic: string): Promise<AiScript | null> {
  const prompt = [
    "Create a high-retention YouTube Short script.",
    "Return JSON only with exactly: hook, body, cta.",
    "hook must be one strong opening sentence.",
    "body must contain 3 concise useful points.",
    "cta must be one short natural call to action.",
    "Keep the spoken script suitable for about 15-35 seconds.",
    "Do not use markdown, emojis, fake claims, or stage directions.",
    `Topic: ${topic}`
  ].join("\n");
  try {
    return extractJson(await callOllama(prompt));
  } catch (error) {
    console.warn(`[ai] Ollama unavailable; using fallback: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
