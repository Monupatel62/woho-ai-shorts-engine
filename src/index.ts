import { ShortsPipeline } from "./pipeline.ts";

async function main(): Promise<void> {
  const topic = "AI tools students should know";

  const pipeline = new ShortsPipeline();

  await pipeline.run({
    id: "short-001",
    topic,
    stages: [
      "script",
      "voice",
      "captions",
      "video",
      "youtube"
    ],
    status: "pending"
  });
}

main().catch((error) => {
  console.error("Pipeline failed:", error);
  process.exitCode = 1;
});
