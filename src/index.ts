import { readFile } from "node:fs/promises";
import path from "node:path";
import { ShortsPipeline, type PipelineJob } from "./pipeline.ts";
import { chooseTopics } from "./topics.ts";

async function loadProjectEnv(): Promise<void> {
  const envPath = path.join(process.cwd(), "config", ".env");
  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split(/\\r?\\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    console.log(`[env] loaded: ${envPath}`);
  } catch {
    console.log(`[env] config/.env not found; using process environment`);
  }
}

function getArg(name:string):string|undefined{
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:undefined;
}

async function getTopics():Promise<string[]>{
  const topics=getArg("--topics");
  if(topics)return topics.split("|").map(x=>x.trim()).filter(Boolean);
  const topic=getArg("--topic");
  if(topic)return [topic];
  if(process.argv.includes("--auto"))return chooseTopics([]);
  return ["AI tools students should know"];
}

function createJob(topic:string,index:number):PipelineJob{
  const slug=topic.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"topic";
  return {id:`short-${Date.now()}-${index+1}-${slug}`,topic,stages:["research","script","voice","avatar","captions","video","youtube"],status:"pending"};
}

async function main():Promise<void>{
  await loadProjectEnv();
  const topics=await getTopics();
  const pipeline=new ShortsPipeline();
  console.log("\n=== WoHo AI Shorts Engine ===");
  console.log(`Batch size: ${topics.length}`);
  for(let i=0;i<topics.length;i++){
    console.log(`\n===== ${i+1}/${topics.length}: ${topics[i]} =====`);
    await pipeline.run(createJob(topics[i],i));
  }
  console.log("\n=== ALL SHORTS COMPLETED ===");
}

main().catch(error=>{console.error("Engine failed:",error);process.exitCode=1;});
