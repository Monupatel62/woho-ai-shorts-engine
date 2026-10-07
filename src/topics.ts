import { researchTopic } from "./research.ts";

export async function chooseTopics(seedTopics:string[]):Promise<string[]>{
  const clean=seedTopics.map(x=>x.trim()).filter(Boolean);
  if(clean.length)return clean.slice(0,20);
  const defaults=["AI tools","coding tips","student productivity","technology facts","career tips"];
  const researched=await Promise.all(defaults.map(t=>researchTopic(t)));
  return researched.sort((a,b)=>b.sources.length-a.sources.length).map(x=>x.topic);
}
