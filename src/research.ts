import { request } from "node:https";

export interface ResearchResult {
  topic: string;
  sources: string[];
  summary: string;
  keywords: string[];
}

function get(url:string):Promise<string>{
  return new Promise((resolve,reject)=>{
    const req=request(url,{headers:{"User-Agent":"WoHo-AI-Shorts-Engine/1.1"}},res=>{
      let data="";
      res.setEncoding("utf8");
      res.on("data",d=>data+=d);
      res.on("end",()=>res.statusCode&&res.statusCode>=200&&res.statusCode<300?resolve(data):reject(new Error(`HTTP ${res.statusCode}`)));
    });
    req.on("error",reject); req.setTimeout(15000,()=>req.destroy(new Error("Research timeout")));
  });
}

function strip(value:string):string{
  return value.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
}

export async function researchTopic(topic:string):Promise<ResearchResult>{
  const query=encodeURIComponent(topic);
  const url=`https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  try{
    const xml=await get(url);
    const items=[...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/gi)]
      .slice(0,8).map(m=>({title:strip(m[1]),link:strip(m[2]),description:strip(m[3])}));
    const sources=items.map(x=>x.link).filter(Boolean);
    const summary=items.map(x=>x.title).join(". ").slice(0,3000);
    const keywords=Array.from(new Set(topic.toLowerCase().split(/\s+/).filter(w=>w.length>3))).slice(0,8);
    return {topic,sources,summary,keywords};
  }catch(error){
    console.warn(`[research] unavailable: ${error instanceof Error?error.message:String(error)}`);
    return {topic,sources:[],summary:"No external research available; use local topic knowledge only.",keywords:[]};
  }
}
