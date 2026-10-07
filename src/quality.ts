import { validateShort } from "./validate.ts";

export interface QualityReport {
  passed:boolean;
  checks:Record<string,boolean>;
  score:number;
  reasons:string[];
}

export async function qualityGate(videoPath:string, scriptText:string):Promise<QualityReport>{
  const validation=await validateShort(videoPath);
  const checks={
    format:validation.valid,
    duration:validation.duration>=5 && validation.duration<=180,
    scriptLength:scriptText.trim().length>=80 && scriptText.trim().length<=5000
  };
  const reasons:string[]=[];
  if(!checks.format)reasons.push(validation.reason??"Invalid video format.");
  if(!checks.duration)reasons.push("Duration must be between 5 and 180 seconds.");
  if(!checks.scriptLength)reasons.push("Script length is outside the safe range.");
  const score=Math.round(Object.values(checks).filter(Boolean).length/Object.keys(checks).length*100);
  return {passed:score===100,checks,score,reasons};
}
