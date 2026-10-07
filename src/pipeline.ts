import { createScript, type ShortScript } from "./script.ts";
import { generateVoice } from "./voice.ts";
import { generateCaptions } from "./captions.ts";
import {
  generateAssCaptions,
  type AssCaption
} from "./ass.ts";
import { generateVideo } from "./video.ts";
import {
  getMediaDuration,
  buildScenePlan
} from "./media.ts";

export type PipelineStage =
  | "script"
  | "voice"
  | "captions"
  | "video"
  | "youtube";

export interface PipelineJob {
  id: string;
  topic: string;
  stages: PipelineStage[];
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed";
}

export class ShortsPipeline {
  async run(job: PipelineJob): Promise<void> {
    console.log(
      `Starting Shorts Pipeline: ${job.id}`
    );

    console.log(
      `Topic: ${job.topic}`
    );

    let generatedScript:
      | ShortScript
      | undefined;

    let audioPath:
      | string
      | null = null;

    let captionPath:
      | string
      | null = null;

    let assPath:
      | string
      | null = null;

    let audioDuration = 0;

    for (const stage of job.stages) {
      if (stage === "script") {
        generatedScript =
          createScript(job.topic);

        console.log(
          "\n[script] completed"
        );

        console.log(
          `Hook: ${generatedScript.hook}`
        );

        console.log(
          `Body points: ${generatedScript.body.length}`
        );

        console.log(
          `CTA: ${generatedScript.cta}`
        );
      }

      else if (stage === "voice") {
        if (!generatedScript) {
          throw new Error(
            "Voice stage requires a generated script."
          );
        }

        const text = [
          generatedScript.hook,
          ...generatedScript.body,
          generatedScript.cta
        ].join(" ");

        const voiceResult =
          await generateVoice({
            text,
            voice: "default",
            speed: 1.0,
            outputName:
              `${job.id}.wav`
          });

        if (
          voiceResult.status !==
            "completed" ||
          !voiceResult.audioPath
        ) {
          throw new Error(
            "Voice generation failed."
          );
        }

        audioPath =
          voiceResult.audioPath;

        audioDuration =
          await getMediaDuration(
            audioPath
          );

        console.log(
          `[voice] ${voiceResult.status}`
        );

        console.log(
          `[voice] duration: ${audioDuration.toFixed(3)} seconds`
        );
      }

      else if (stage === "captions") {
        if (!generatedScript) {
          throw new Error(
            "Captions stage requires a generated script."
          );
        }

        if (
          !audioPath ||
          audioDuration <= 0
        ) {
          throw new Error(
            "Captions stage requires valid audio duration."
          );
        }

        const sentences = [
          generatedScript.hook,
          ...generatedScript.body,
          generatedScript.cta
        ];

        captionPath =
          await generateCaptions({
            sentences,
            duration: audioDuration,
            outputName:
              `${job.id}.srt`
          });

        const chunks =
          sentences.flatMap(
            (sentence) => {
              const words =
                sentence
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean);

              const result: string[] = [];

              for (
                let i = 0;
                i < words.length;
                i += 7
              ) {
                result.push(
                  words
                    .slice(i, i + 7)
                    .join(" ")
                );
              }

              return result;
            }
          );

        const totalWords =
          chunks.reduce(
            (total, chunk) =>
              total +
              chunk
                .split(/\s+/)
                .length,
            0
          );

        let elapsed = 0;

        const assCaptions:
          AssCaption[] =
          chunks.map((text) => {
            const wordCount =
              text
                .split(/\s+/)
                .length;

            const segmentDuration =
              (audioDuration *
                wordCount) /
              totalWords;

            const caption:
              AssCaption = {
                start: elapsed,
                end:
                  elapsed +
                  segmentDuration,
                text
              };

            elapsed +=
              segmentDuration;

            return caption;
          });

        assPath =
          await generateAssCaptions(
            assCaptions,
            `${job.id}.ass`
          );

        console.log(
          `[captions] SRT: ${captionPath}`
        );

        console.log(
          `[captions] ASS: ${assPath}`
        );
      }

      else if (stage === "video") {
        if (!audioPath) {
          throw new Error(
            "Video stage requires generated audio."
          );
        }

        if (audioDuration <= 0) {
          throw new Error(
            "Video stage requires valid audio duration."
          );
        }

        console.log(
          "\n[scene-engine] building scene plan"
        );

        const scenePlan =
          await buildScenePlan(
            audioDuration
          );

        console.log(
          `[scene-engine] generated ${scenePlan.length} scenes`
        );

        const videoResult =
          await generateVideo({
            audioPath,
            captionPath:
              assPath ??
              captionPath ??
              undefined,
            outputName:
              `${job.id}.mp4`,
            title:
              job.topic,
            scenes:
              scenePlan
          });

        if (
          videoResult.status !==
            "completed" ||
          !videoResult.videoPath
        ) {
          throw new Error(
            "Video generation failed."
          );
        }

        console.log(
          `[video] ${videoResult.status}`
        );

        console.log(
          `Video: ${videoResult.videoPath}`
        );
      }

      else if (stage === "youtube") {
        console.log(
          "[youtube] ready"
        );
      }
    }

    if (generatedScript) {
      console.log(
        "\nScript Engine: OK"
      );
    }

    console.log(
      "\nPipeline initialized successfully."
    );
  }
}