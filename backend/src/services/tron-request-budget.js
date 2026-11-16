const limitedError=retryAt=>Object.assign(new Error('TRON API временно ограничил запросы. Повторная проверка будет выполнена автоматически.'),{status:429,code:'TRON_RATE_LIMITED',retryAt});

export function createTronRequestBudget({now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random,spacing=350}={}){
 let tail=Promise.resolve(),nextStart=0,blockedUntil=0,slowUntil=0,failures=0,queued=0,requests=0,cacheHits=0;
 const cache=new Map(),pending=new Map();
 function run(work,{key,ttl=0}={}){
  const cached=key&&cache.get(key);
  if(cached&&cached.expires>now()){cacheHits++;return Promise.resolve(structuredClone(cached.value));}
  if(key&&pending.has(key)){cacheHits++;return pending.get(key).then(structuredClone);}
  if(now()<blockedUntil)return Promise.reject(limitedError(blockedUntil));
  if(queued>=32)return Promise.reject(Object.assign(new Error('TRON API занят. Повторите запрос позже.'),{status:503,code:'TRON_QUEUE_FULL'}));
  queued++;
  const task=tail.then(async()=>{
   if(now()<blockedUntil)throw limitedError(blockedUntil);
   await sleep(Math.max(0,nextStart-now()));
   if(now()<blockedUntil)throw limitedError(blockedUntil);
   nextStart=now()+(now()<slowUntil?Math.max(1300,spacing):spacing);
   try{
    requests++;
    const value=await work();
    if(value?.statusCode===429||/exceed.*(frequency|daily|usage)|frequency limit/i.test(String(value?.Error||value?.error||'')))throw Object.assign(limitedError(0),{dailyLimit:/daily/i.test(String(value?.Error||value?.error||''))});
    if(value?.Error||value?.error||value?.success===false)throw Object.assign(new Error('TRON API отклонил запрос. Данные не обновлены.'),{status:503,code:'TRON_PROVIDER_ERROR'});
    failures=0;
    if(key&&ttl){if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,{value:structuredClone(value),expires:now()+ttl});}
    return value;
   }catch(error){
    if(Number(error.status||error.response?.status)===429){
     const details=String(error.response?.data?.Error||error.response?.data?.error||error.message||'');
     if(error.dailyLimit||/daily/i.test(details))slowUntil=now()+3600000;
     const header=error.retryAfter??error.response?.headers?.['retry-after'];
     const retryMs=header?(Number.isFinite(Number(header))?Number(header)*1000:Date.parse(header)-now()):0;
     failures++;blockedUntil=now()+Math.max(Number.isFinite(retryMs)?Math.max(0,retryMs):0,Math.min(300000,30000*2**Math.min(failures-1,4)))+Math.floor(random()*5000);
     throw limitedError(blockedUntil);
    }
    throw error;
   }
  });
  tail=task.catch(()=>{});
  const result=task.finally(()=>{queued--;if(key)pending.delete(key);});
  if(key)pending.set(key,result);
  return result.then(value=>key?structuredClone(value):value);
 }
 return {run,stats:()=>({requests,cacheHits,queued,blockedUntil,slowUntil})};
}

export const tronRequestBudget=createTronRequestBudget();

export function budgetTronProviders(tronWeb,scope){
 for(const provider of new Set([tronWeb.fullNode,tronWeb.solidityNode,tronWeb.eventServer])){
  if(!provider)continue;
  const request=provider.request.bind(provider);
  provider.request=(url,payload={},method='get')=>{
   // Only ABI/contract metadata may be cached. Balances, fee estimates,
   // receipts and signed broadcasts always reach the node afresh.
   const metadata=String(url).replace(/^\//,'')==='wallet/getcontract';
   return tronRequestBudget.run(()=>request(url,payload,method),metadata?{key:`${scope}:${provider.host}:${url}:${JSON.stringify(payload)}`,ttl:300000}:{});
  };
 }
 return tronWeb;
}
