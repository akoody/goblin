import {readFile} from 'node:fs/promises';
import {sign} from 'node:crypto';
import {createHash} from 'node:crypto';
import {eventContent} from './push-events.js';
import {sendWebPush} from './web-push.service.js';

export function createFcmClient({credentials,request=fetch,clock=()=>Date.now()}){
 let access=null,pending=null;
 async function accessToken(){
  if(access&&access.until>clock()+60000)return access.token;
  if(!pending)pending=(async()=>{
   const now=Math.floor(clock()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
   const unsigned=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
   const assertion=`${unsigned}.${sign('RSA-SHA256',Buffer.from(unsigned),credentials.private_key).toString('base64url')}`;
   const response=await request('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
   const body=await response.json();
   if(!response.ok||!body.access_token)throw new Error('FCM_AUTH_FAILED');
   access={token:body.access_token,until:clock()+Number(body.expires_in||3600)*1000};
   return access.token;
  })().finally(()=>{pending=null;});
  return pending;
 }
 async function send({token,recipientId,path,content=eventContent('message'),key=path},validateOnly=false){
  if(token.startsWith('webpush:'))return validateOnly?{ok:false,code:'WEB_PUSH_DRY_RUN_UNSUPPORTED'}:sendWebPush({token,recipientId,path,content,key});
  const bearer=await accessToken();
  const response=await request(`https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,{
   method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},
   body:JSON.stringify({validate_only:validateOnly,message:{token,notification:{title:content.title,body:content.body},data:{path,recipientId:String(recipientId),eventType:content.eventType},android:{priority:content.eventType==='broadcast'?'normal':'high',ttl:'300s',restricted_package_name:'ru.cryptogoblin.app',notification:{channel_id:'goblin_messages',icon:'ic_stat_goblin',visibility:'PRIVATE',tag:`goblin-${createHash('sha256').update(String(key)).digest('hex').slice(0,24)}`}}}})
  });
  const body=await response.json();
  const code=body.error?.details?.find(detail=>detail['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
  if(response.status===401)access=null;
  return {ok:response.ok,invalidToken:code==='UNREGISTERED',code:code||body.error?.status||null};
 }
 return {send};
}

let clientPromise;
export function configuredFcmClient(){
 if(process.env.PUSH_ENABLED!=='true'||!process.env.PUSH_CREDENTIALS_FILE)return null;
 if(!clientPromise)clientPromise=readFile(process.env.PUSH_CREDENTIALS_FILE,'utf8').then(JSON.parse).then(credentials=>{
  if(!/^[a-z0-9-]+$/.test(credentials.project_id)||!credentials.client_email||!credentials.private_key)throw new Error('FCM_CONFIG_INVALID');
  return createFcmClient({credentials});
 }).catch(error=>{clientPromise=null;throw error;});
 return clientPromise;
}
