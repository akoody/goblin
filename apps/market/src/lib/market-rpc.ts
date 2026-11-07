import 'server-only';
import { cookies, headers } from 'next/headers';
import {redirect} from 'next/navigation';

export const MARKET_COOKIE='goblin_market_session';
export const backendOrigin=process.env.MARKET_BACKEND_ORIGIN||'http://127.0.0.1:3000';
export async function marketRpc(operation:string,args:unknown[]=[]) {
  const token=(await cookies()).get(MARKET_COOKIE)?.value;
  const incoming=await headers();
  const request=(authenticated:boolean)=>fetch(`${backendOrigin}/api/market-app/rpc`,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':incoming.get('x-real-ip')||'',...(token&&authenticated?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({operation,args}),cache:'no-store',signal:AbortSignal.timeout(15000)});
  let response=await request(true);
  if(response.status===401&&['getCatalogLibrary','getFeaturedCatalogItems','getCatalogItemBySlug','getListingDetails','getProjectSettings','getProjectFormConfig'].includes(operation))response=await request(false);
  const payload=await response.json();
  if (response.status===403 && payload.code==='MARKET_SECTION_DISABLED' && ['getCatalogItemBySlug','getListingDetails'].includes(operation)) redirect('/?access=restricted');
  if(!response.ok)throw Object.assign(new Error(payload.code||payload.message||'MARKET_UNAVAILABLE'),{status:response.status});
  // Preserve the Date contract used by the original server components.
  return JSON.parse(JSON.stringify(payload.result), (key,value)=>typeof value==='string'&&/^(createdAt|updatedAt|expiresAt)$/.test(key)?new Date(value):value);
}
