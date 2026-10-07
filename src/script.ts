export interface ShortScript {
  topic: string;
  hook: string;
  body: string[];
  cta: string;
}

export function createScript(topic: string): ShortScript {
  return {
    topic,
    hook: `Stop scrolling! Here are 3 important things about ${topic}.`,
    body: [
      `First, understand the basics of ${topic}.`,
      `Second, focus on the most useful practical applications.`,
      `Third, keep learning and testing what works.`
    ],
    cta: "Follow for more useful Shorts."
  };
}
