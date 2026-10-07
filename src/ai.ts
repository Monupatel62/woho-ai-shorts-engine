import { request } from "node:http";

export interface AiScript { hook:string; body:string[]; cta:string; }

const OLLAMA_MODEL=process.env.OLLAMA_MODEL??"llama3.2:latest";
const OLLAMA_HOST=process.env.OLLAMA_HOST??"127.0.0.1";
const OLLAMA_PORT=Number(process.env.OLLAMA_PORT??"11434");
const OLLAMA_TIMEOUT_MS=120000;

function extractJson(text:string):AiScript|null{
  const clean=text.trim();

  const candidates:string[]=[clean];
  const match=clean.match(/\{[\s\S]*\}/);
  if(match && match[0]!==clean)candidates.push(match[0]);

  for(const candidate of candidates){
    try{
      const parsed=JSON.parse(candidate) as Partial<AiScript>;
      if(
        typeof parsed.hook!=="string"||
        !Array.isArray(parsed.body)||
        parsed.body.some(x=>typeof x!=="string")||
        typeof parsed.cta!=="string"
      )continue;

      const hook=parsed.hook.trim();
      const body=parsed.body.map(x=>x.trim()).filter(Boolean).slice(0,5);
      const cta=parsed.cta.trim();

      if(!hook||body.length<3||!cta)continue;
      return {hook,body,cta};
    }catch{
      // Try the next candidate.
    }
  }

  console.warn(`[ai] Invalid Ollama payload: ${clean.slice(0,500)}`);
  return null;
}

function callOllama(prompt:string):Promise<string>{
  return new Promise((resolve,reject)=>{
    const body=JSON.stringify({
      model:OLLAMA_MODEL,
      stream:false,
      format:"json",
      options:{
        temperature:0.7,
        num_ctx:2048
      },
      prompt
    });

    const req=request({
      hostname:OLLAMA_HOST,
      port:OLLAMA_PORT,
      path:"/api/generate",
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Content-Length":Buffer.byteLength(body)
      },
      timeout:OLLAMA_TIMEOUT_MS
    },res=>{
      let data="";
      res.setEncoding("utf8");
      res.on("data",chunk=>data+=chunk);
      res.on("end",()=>{
        if(res.statusCode!==200){
          reject(new Error(`Ollama HTTP ${res.statusCode}: ${data}`));
          return;
        }

        try{
          const parsed=JSON.parse(data) as {response?:unknown};
          if(typeof parsed.response!=="string"||!parsed.response.trim()){
            reject(new Error("Ollama returned no usable response."));
            return;
          }
          resolve(parsed.response);
        }catch(error){
          reject(error);
        }
      });
    });

    req.on("timeout",()=>req.destroy(new Error("Ollama request timed out after 120 seconds.")));
    req.on("error",reject);
    req.write(body);
    req.end();
  });
}

export async function generateAiScript(topic:string,researchContext=""):Promise<AiScript|null>{
  const prompt=[
    "Create a high-retention YouTube Short script.",
    "Return JSON only with exactly these keys: hook, body, cta.",
    "hook must be one strong opening sentence.",
    "body must contain exactly 3 concise useful points.",
    "cta must be one short natural call to action.",
    "Keep the spoken script suitable for about 15-35 seconds.",
    "Do not use markdown, emojis, fake claims, or stage directions.",
    "Use plain strings only.",
    `Topic: ${topic}`,
    researchContext?`Research context:\n${researchContext}`:""
  ].join("\n");

  try{
    const raw=await callOllama(prompt);
    const parsed=extractJson(raw);

    if(!parsed){
      console.warn("[ai] Ollama returned an invalid script JSON; using fallback.");
      return null;
    }

    return parsed;
  }catch(error){
    console.warn(`[ai] Ollama unavailable; using fallback: ${error instanceof Error?error.message:String(error)}`);
    return null;
  }
}
