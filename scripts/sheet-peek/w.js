// 시트 읽기 전용 미리보기 워커 — 배포하지 않는다. scripts/sheet-peek/README 참고.
const b64url=(b)=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function tok(sa){const now=Math.floor(Date.now()/1e3);const enc=(o)=>b64url(new TextEncoder().encode(JSON.stringify(o)));
const u=`${enc({alg:"RS256",typ:"JWT"})}.${enc({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
const der=Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g,"").replace(/\s+/g,"")),c=>c.charCodeAt(0));
const k=await crypto.subtle.importKey("pkcs8",der.buffer,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",k,new TextEncoder().encode(u));
const r=await (await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${u}.${b64url(new Uint8Array(sig))}`})).json();return r.access_token;}
export default{async fetch(req,env){const q=new URL(req.url).searchParams;if(!env.GA_SA_KEY)return new Response("no secret");
const t=await tok(JSON.parse(env.GA_SA_KEY));const id=q.get("id")||"1YAm7ec7C0nw7g3n0MVcM5T625OEW60V-ORLxghmz8QQ";
const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(q.get("r"))}?valueRenderOption=${q.get("f")?"FORMULA":"FORMATTED_VALUE"}`,{headers:{Authorization:"Bearer "+t}});
return new Response(await r.text(),{headers:{"content-type":"application/json"}});}};
