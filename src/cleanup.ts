import { readdir, unlink, stat } from "node:fs/promises";
import path from "node:path";

export async function cleanupDirectory(directory:string,maxAgeHours=48):Promise<number>{
  let removed=0;let files:string[]=[];
  try{files=await readdir(directory);}catch{return 0;}
  const cutoff=Date.now()-maxAgeHours*3600000;
  for(const file of files){
    const full=path.join(directory,file);
    try{const info=await stat(full);if(info.isFile()&&info.mtimeMs<cutoff){await unlink(full);removed++;}}catch{}
  }
  return removed;
}
