import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface JobRecord {id:string;topic:string;status:"queued"|"running"|"completed"|"failed";attempts:number;error?:string;updatedAt:string;}

const DIR="E:\\AI-Shorts\\output\\jobs";

export async function saveJob(job:JobRecord):Promise<void>{
  await mkdir(DIR,{recursive:true});
  await writeFile(path.join(DIR,`${job.id}.json`),JSON.stringify(job,null,2),"utf8");
}

export async function loadJob(id:string):Promise<JobRecord|null>{
  try{return JSON.parse(await readFile(path.join(DIR,`${id}.json`),"utf8")) as JobRecord;}
  catch{return null;}
}
