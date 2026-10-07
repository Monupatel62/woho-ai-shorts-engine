import { request } from "node:https";

export interface ResearchResult {
  topic: string;
  sources: string[];
  summary: string;
  keywords: string[];
}

function get(url: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        headers: {
          "User-Agent": "WoHo-AI-Shorts-Engine/1.3",
          Accept: "application/rss+xml, application/xml, text/xml, */*"
        }
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode ?? "unknown"}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Research timeout"));
    });
  });
}

function strip(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml: string) {
  return [...xml.matchAll(
    /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?(?:<description>([\s\S]*?)<\/description>)?[\s\S]*?<\/item>/gi
  )]
    .slice(0, 8)
    .map((m) => ({
      title: strip(m[1] ?? ""),
      link: strip(m[2] ?? ""),
      description: strip(m[3] ?? "")
    }))
    .filter((item) => item.title && item.link);
}

export async function researchTopic(topic: string): Promise<ResearchResult> {
  const query = encodeURIComponent(topic.trim());
  const urls = [
    `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`,
    `https://www.bing.com/news/search?q=${query}&format=rss&setlang=en-IN`
  ];

  const results = await Promise.allSettled(urls.map((url) => get(url)));
  const successful = results.find(
    (result): result is PromiseFulfilledResult<string> =>
      result.status === "fulfilled" && Boolean(result.value)
  );
  const xml = successful?.value ?? "";

  if (!xml) {
    const failure = results.find((result) => result.status === "rejected");
    const lastError = failure && failure.status === "rejected" ? failure.reason : null;
    console.warn(
      `[research] unavailable: ${lastError instanceof Error ? lastError.message : "all RSS sources failed"}`
    );
    return {
      topic,
      sources: [],
      summary: "No external research available; use local topic knowledge only.",
      keywords: Array.from(
        new Set(topic.toLowerCase().split(/\s+/).filter((word) => word.length > 3))
      ).slice(0, 8)
    };
  }

  const items = parseRss(xml);
  const sources = items.map((item) => item.link);
  const summary = items.map((item) => item.title).join(". ").slice(0, 3000);
  const keywords = Array.from(
    new Set(topic.toLowerCase().split(/\s+/).filter((word) => word.length > 3))
  ).slice(0, 8);

  return { topic, sources, summary, keywords };
}
