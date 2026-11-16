export function createTronPollSchedule({now=Date.now,idleMs=300000,activeMs=60000,activeWindowMs=900000,maxActive=12}={}){
 const entries=new Map();
 function entry(id){const key=String(id);if(!entries.has(key))entries.set(key,{next:0,last:null,activeUntil:0});return entries.get(key);}
 function watch(id){
  const item=entry(id),wasActive=item.activeUntil>now();
  if(!wasActive){
   const active=[...entries.values()].filter(value=>value.activeUntil>now());
   if(active.length>=maxActive)active.sort((a,b)=>a.activeUntil-b.activeUntil)[0].activeUntil=0;
   item.next=Math.min(item.next,item.last===null?now():Math.max(now(),item.last+activeMs));
  }
  item.activeUntil=now()+activeWindowMs;
 }
 return {
  watch,
  due:id=>entry(id).next<=now(),
  complete(id){const item=entry(id);item.last=now();item.next=now()+(item.activeUntil>now()?activeMs:idleMs);},
  defer(id,retryAt){entry(id).next=Math.max(now()+activeMs,Number(retryAt)||0);},
  prune(ids){const keep=new Set(ids.map(String));for(const id of entries.keys())if(!keep.has(id))entries.delete(id);},
  stats:()=>({wallets:entries.size,activeWallets:[...entries.values()].filter(item=>item.activeUntil>now()).length,idleIntervalMs:idleMs,activeIntervalMs:activeMs,maxActive}),
 };
}
export const tronPollSchedule=createTronPollSchedule();
