import { redirect as nextRedirect } from 'next/navigation';
import { revalidatePath as nextRevalidate } from 'next/cache';
const prefix=(value:string)=>value.startsWith('/market/')||value==='/market'?value:`/market${value==='/'?'':value}`;
export function redirect(value:string):never {
  if(!value.startsWith('/')||value.startsWith('//'))return nextRedirect('/market');
  // Next applies basePath itself to redirects, including Server Actions.
  return nextRedirect(value==='/market'?'/':value.startsWith('/market/')?value.slice(7):value);
}
export function revalidatePath(value:string) {nextRevalidate(prefix(value));}
