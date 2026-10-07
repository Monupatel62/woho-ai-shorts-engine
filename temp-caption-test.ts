import { generateCaptions } from "./src/captions.ts";

async function main(): Promise<void> {
  await generateCaptions(
    [
      "Stop scrolling! Here are 3 important things about AI tools students should know.",
      "First, understand the basics of AI tools students should know.",
      "Second, focus on the most useful practical applications.",
      "Third, keep learning and testing what works.",
      "Follow for more useful Shorts."
    ],
    16.933333
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
