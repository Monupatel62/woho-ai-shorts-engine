import { createScript, type ShortScript } from "./script.ts";
import { generateVoice } from "./voice.ts";
import { generateCaptions } from "./captions.ts";
import { generateAssCaptions, type AssCaption } from "./ass.ts";
import { generateVideo } from "./video.ts";
import { getMediaDuration, buildScenePlan } from "./media.ts";
import { generateMetadata } from "./metadata.ts";
import { validateShort } from "./validate.ts";
import { researchTopic } from "./research.ts";
import { qualityGate } from "./quality.ts";
import { uploadShort } from "./youtube.ts";

export type PipelineStage = "research"|"script"|"voice"|"captions"|"video"|"youtube";
export interface PipelineJob {
  id:string; topic:string; stages:PipelineStage[];
  status:"pending"|"running"|"completed"|"failed";
}

export class ShortsPipeline {
  async run(job:PipelineJob):Promise<void>{
    job.status="running";
    console.log(`Starting Shorts Pipeline: ${job.id}`);
    console.log(`Topic: ${job.topic}`);

    let generatedScript:ShortScript|undefined;
    let researchSummary="";
    let audioPath:string|null=null;
    let captionPath:string|null=null;
    let assPath:string|null=null;
    let videoPath:string|null=null;
    let audioDuration=0;

    try{
      for(const stage of job.stages){
        if(stage==="research"){
          const research=await researchTopic(job.topic);
          researchSummary=research.summary;
          console.log(`[research] sources: ${research.sources.length}`);
        }else 
        if(stage==="script"){
          generatedScript=await createScript(job.topic,researchSummary);
          console.log("\n[script] completed");
          console.log(`Source: ${generatedScript.source}`);
          console.log(`Hook: ${generatedScript.hook}`);
          console.log(`Body points: ${generatedScript.body.length}`);
          console.log(`CTA: ${generatedScript.cta}`);
        }else if(stage==="voice"){
          if(!generatedScript)throw new Error("Voice stage requires a generated script.");
          const text=[generatedScript.hook,...generatedScript.body,generatedScript.cta].join(" ");
          const result=await generateVoice({text,voice:"en_US-lessac-medium",speed:1,outputName:`${job.id}.wav`});
          if(result.status!=="completed"||!result.audioPath)throw new Error("Voice generation failed.");
          audioPath=result.audioPath;
          audioDuration=await getMediaDuration(audioPath);
          console.log(`[voice] duration: ${audioDuration.toFixed(3)} seconds`);
        }else if(stage==="captions"){
          if(!generatedScript||!audioPath||audioDuration<=0)throw new Error("Captions stage prerequisites are missing.");
          const sentences=[generatedScript.hook,...generatedScript.body,generatedScript.cta];
          captionPath=await generateCaptions({sentences,duration:audioDuration,outputName:`${job.id}.srt`});
          const chunks=sentences.flatMap(s=>{
            const words=s.trim().split(/\s+/).filter(Boolean),out:string[]=[];
            for(let i=0;i<words.length;i+=6)out.push(words.slice(i,i+6).join(" "));
            return out;
          });
          const totalWords=chunks.reduce((n,x)=>n+x.split(/\s+/).length,0);
          let elapsed=0;
          const assCaptions:AssCaption[]=chunks.map(text=>{
            const d=audioDuration*text.split(/\s+/).length/totalWords;
            const item={start:elapsed,end:elapsed+d,text}; elapsed+=d; return item;
          });
          assPath=await generateAssCaptions(assCaptions,`${job.id}.ass`);
          console.log(`[captions] SRT: ${captionPath}`);
          console.log(`[captions] ASS: ${assPath}`);
        }else if(stage==="video"){
          if(!audioPath||audioDuration<=0)throw new Error("Video stage requires generated audio.");
          const scenes=await buildScenePlan(audioDuration);
          const result=await generateVideo({
            audioPath,captionPath:assPath??captionPath??undefined,
            outputName:`${job.id}.mp4`,title:job.topic,scenes
          });
          if(result.status!=="completed"||!result.videoPath)throw new Error("Video generation failed.");
          videoPath=result.videoPath;
          console.log(`[video] ${videoPath}`);
        }else if(stage==="youtube"){
          if(!generatedScript)throw new Error("YouTube stage requires a script.");
          const metadataPath=await generateMetadata(job.id,job.topic,generatedScript.hook);
          console.log(`[youtube] metadata: ${metadataPath}`);
          if(!videoPath)throw new Error("YouTube stage requires final video.");
          const validation=await validateShort(videoPath);
          console.log(`[validate] ${validation.valid?"PASS":"FAIL"} | ${validation.width}x${validation.height} | ${validation.videoCodec}/${validation.audioCodec} | ${validation.fps.toFixed(2)}fps | ${validation.duration.toFixed(2)}s`);
          if(!validation.valid)throw new Error(`Final Shorts validation failed: ${validation.reason}`);
          const scriptText=[generatedScript.hook,...generatedScript.body,generatedScript.cta].join(" ");
          const quality=await qualityGate(videoPath,scriptText);
          console.log(`[quality] ${quality.passed?"PASS":"FAIL"} | score=${quality.score}`);
          if(!quality.passed)throw new Error(`Quality gate failed: ${quality.reasons.join(" ")}`);
          if(process.env.YOUTUBE_REFRESH_TOKEN && process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET){
            const raw=await import("node:fs/promises").then(m=>m.readFile(metadataPath,"utf8"));
            const metadata=JSON.parse(raw) as {title:string;description:string;tags:string[]};
            const videoId=await uploadShort(videoPath,{title:metadata.title,description:metadata.description,tags:metadata.tags,privacyStatus:(process.env.YOUTUBE_PRIVACY as "private"|"public"|"unlisted"|undefined)??"private"});
            console.log(`[youtube] uploaded: ${videoId}`);
          }else{
            console.log("[youtube] OAuth not configured; upload skipped safely.");
          }
          console.log("[youtube] ready");
        }
      }
      job.status="completed";
      console.log("\nPipeline completed successfully.");
    }catch(error){
      job.status="failed";
      console.error("\nPipeline failed:",error);
      throw error;
    }
  }
}
