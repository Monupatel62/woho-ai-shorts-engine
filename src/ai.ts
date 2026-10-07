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
      const parsed=JSON.parse(candidate) as {
        hook?:unknown;
        body?:unknown;
        cta?:unknown;
      };

      if(typeof parsed.hook!=="string"||typeof parsed.cta!=="string")continue;

      const rawBody=parsed.body;
      let body:string[];

      if(Array.isArray(rawBody)){
        body=rawBody
          .filter((x):x is string=>typeof x==="string")
          .map((x:string)=>x.trim())
          .filter(Boolean);
      }else if(typeof rawBody==="string"){
        const normalized=rawBody
          .replace(/\s+/g," ")
          .trim();

        body=normalized
          .split(/(?<=[.!?])\s+|\n+/)
          .map((x:string)=>x.trim())
          .filter(Boolean);

        if(body.length<3){
          const segments=normalized
            .split(/,\s+|;\s+|\s+and\s+/i)
            .map((x:string)=>x.trim())
            .filter((x:string)=>x.length>=12);

          if(segments.length>=3) body=segments.slice(0,3);
        }
      }else{
        continue;
      }

      if(body.length<3){
        console.warn("[ai] Ollama returned fewer than 3 usable body points.");
        continue;
      }

      const result={
        hook:parsed.hook.trim(),
        body:body.slice(0,3),
        cta:parsed.cta.trim()
      };

      const wordCount=[result.hook,...result.body,result.cta]
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length;

      if(wordCount>85){
        console.warn(`[ai] Ollama script too long: ${wordCount} words.`);
        continue;
      }

      return result;
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
    "Keep the ENTIRE spoken script between 55 and 75 words total, targeting about 20-30 seconds.",
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
