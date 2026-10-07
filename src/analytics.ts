export interface VideoAnalytics {
  videoId:string;
  views:number;
  likes:number;
  comments:number;
}

export async function summarizeAnalytics(items:VideoAnalytics[]):Promise<string>{
  if(!items.length)return "No analytics available yet.";
  const views=items.reduce((n,x)=>n+x.views,0);
  const likes=items.reduce((n,x)=>n+x.likes,0);
  const comments=items.reduce((n,x)=>n+x.comments,0);
  return `Videos: ${items.length}; views: ${views}; likes: ${likes}; comments: ${comments}.`;
}
