import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { request } from "node:https";

const TOKEN_URL="https://oauth2.googleapis.com/token";
const UPLOAD_URL="https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status";

function jsonRequest(url:string,options: {method?:string;headers?:Record<string,string>;body?:string}):Promise<any>{
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:options.method??"GET",headers:options.headers??{}},res=>{
      let data=""; res.setEncoding("utf8"); res.on("data",d=>data+=d);
      res.on("end",()=>{try{const parsed=JSON.parse(data||"{}"); if(res.statusCode&&res.statusCode>=200&&res.statusCode<300)resolve(parsed);else reject(new Error(`HTTP ${res.statusCode}: ${data}`));}catch(e){reject(e);}});
    });
    req.on("error",reject); if(options.body)req.write(options.body); req.end();
  });
}

async function accessToken():Promise<string>{
  const clientId=process.env.YOUTUBE_CLIENT_ID,clientSecret=process.env.YOUTUBE_CLIENT_SECRET,refreshToken=process.env.YOUTUBE_REFRESH_TOKEN;
  if(!clientId||!clientSecret||!refreshToken)throw new Error("YouTube OAuth env vars are missing.");
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"}).toString();
  const token=await jsonRequest(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Content-Length":String(Buffer.byteLength(body))},body});
  return token.access_token;
}

export interface UploadMetadata{title:string;description:string;tags:string[];privacyStatus?:"private"|"public"|"unlisted";publishAt?:string;}

export async function uploadShort(videoPath:string,metadata:UploadMetadata):Promise<string>{
  const token=await accessToken();
  const size=(await stat(videoPath)).size;
  const init=await jsonRequest(UPLOAD_URL,{method:"POST",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json","X-Upload-Content-Length":String(size),"X-Upload-Content-Type":"video/mp4"},body:JSON.stringify({
    snippet:{title:metadata.title,description:metadata.description,tags:metadata.tags,categoryId:"22"},
    status:{privacyStatus:metadata.privacyStatus??"private",publishAt:metadata.publishAt}
  })});
  if(!init.id)throw new Error("YouTube upload session was not returned.");
  const session=init.id;
  return session;
}

// YouTube's resumable upload endpoint is exposed separately by the API.
// This helper performs the media PUT after the session URL is supplied by the OAuth client.
export async function uploadToSession(sessionUrl:string,videoPath:string,token:string):Promise<any>{
  const size=(await stat(videoPath)).size;
  return new Promise((resolve,reject)=>{
    const req=request(sessionUrl,{method:"PUT",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"video/mp4","Content-Length":String(size)}},res=>{
      let data="";res.setEncoding("utf8");res.on("data",d=>data+=d);res.on("end",()=>{try{const p=JSON.parse(data||"{}");if(res.statusCode&&res.statusCode>=200&&res.statusCode<300)resolve(p);else reject(new Error(`Upload HTTP ${res.statusCode}: ${data}`));}catch(e){reject(e);}});
    });
    req.on("error",reject);createReadStream(videoPath).pipe(req);
  });
}
