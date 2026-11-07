import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { redirect } from './market-navigation';
import { marketRpc, MARKET_COOKIE, backendOrigin } from './market-rpc';
import { isAdminUser } from './admin';
import type { User } from './db';
export async function exchangeAuth(path:string,body:unknown) {
  const incoming=await headers();
  const response=await fetch(`${backendOrigin}/auth/${path}`,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':incoming.get('user-agent')||'Market','X-Real-IP':incoming.get('x-real-ip')||'','X-Forwarded-For':incoming.get('x-real-ip')||''},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw new Error(result.message||'Не удалось выполнить вход.');return result;
}
export async function createSession(token:string) {(await cookies()).set(MARKET_COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE!=='false',path:'/',maxAge:7200});}
export const getCurrentUser=cache(async():Promise<User|null>=>{
  if(!(await cookies()).get(MARKET_COOKIE)?.value)return null;
  try{return await marketRpc('currentUser');}catch(error){if((error as {status?:number}).status===401)return null;throw error;}
});
export async function requireUser(){const user=await getCurrentUser();if(!user)redirect('/login');return user;}
export async function requireMarketplaceUser(){return requireUser();}
export async function requireAdminUser(){const user=await requireUser();if(!isAdminUser(user))redirect('/');return user;}
export async function clearSession(){(await cookies()).set(MARKET_COOKIE,'',{path:'/',maxAge:0,httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE!=='false'});}
