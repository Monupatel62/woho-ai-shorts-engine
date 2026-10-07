import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { request } from "node:https";

const TOKEN_URL="https://oauth2.googleapis.com/token";
const INIT_URL="https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

function jsonRequest(url:string,options:{method?:string;headers?:Record<string,string>;body?:string}):Promise<{data:any;headers:Record<string,string|string[]|undefined>}>{
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:options.method??"GET",headers:options.headers??{}},res=>{
      let data="";res.setEncoding("utf8");res.on("data",d=>data+=d);
      res.on("end",()=>{try{const parsed=JSON.parse(data||"{}");if(res.statusCode&&res.statusCode>=200&&res.statusCode<300)resolve({data:parsed,headers:res.headers as Record<string,string|string[]|undefined>});else reject(new Error(`HTTP ${res.statusCode}: ${data}`));}catch(e){reject(e);}});
    });
    req.on("error",reject);if(options.body)req.write(options.body);req.end();
  });
}

async function accessToken():Promise<string>{
  const clientId=process.env.YOUTUBE_CLIENT_ID,clientSecret=process.env.YOUTUBE_CLIENT_SECRET,refreshToken=process.env.YOUTUBE_REFRESH_TOKEN;
  if(!clientId||!clientSecret||!refreshToken)throw new Error("YouTube OAuth env vars are missing.");
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"}).toString();
  const result=await jsonRequest(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  if(!result.data.access_token)throw new Error("Google OAuth did not return an access token.");
  return result.data.access_token;
}

export interface UploadMetadata{title:string;description:string;tags:string[];privacyStatus?:"private"|"public"|"unlisted";publishAt?:string;}

export async function uploadShort(videoPath:string,metadata:UploadMetadata):Promise<string>{
  const token=await accessToken();
  const size=(await stat(videoPath)).size;
  const init=await jsonRequest(INIT_URL,{method:"POST",headers:{
    "Authorization":`Bearer ${token}`,"Content-Type":"application/json",
    "X-Upload-Content-Length":String(size),"X-Upload-Content-Type":"video/mp4"
  },body:JSON.stringify({snippet:{title:metadata.title,description:metadata.description,tags:metadata.tags,categoryId:"22"},status:{privacyStatus:metadata.privacyStatus??"private",publishAt:metadata.publishAt}})});
  const location=init.headers.location;
  if(typeof location!=="string")throw new Error("YouTube did not return a resumable upload session.");
  const result=await new Promise<any>((resolve,reject)=>{
    const req=request(location,{method:"PUT",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"video/mp4","Content-Length":String(size)}},res=>{
      let data="";res.setEncoding("utf8");res.on("data",d=>data+=d);res.on("end",()=>{try{const p=JSON.parse(data||"{}");if(res.statusCode&&res.statusCode>=200&&res.statusCode<300)resolve(p);else reject(new Error(`Upload HTTP ${res.statusCode}: ${data}`));}catch(e){reject(e);}});
    });
    req.on("error",reject);createReadStream(videoPath).pipe(req);
  });
  if(!result.id)throw new Error("YouTube upload completed without a video id.");
  return result.id as string;
}
