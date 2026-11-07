import { NextResponse, type NextRequest } from 'next/server';

const maintenance=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Маркет временно недоступен</title><style>body{margin:0;background:#f5f8fc;color:#0f172a;font-family:system-ui,sans-serif}main{box-sizing:border-box;max-width:640px;margin:12vh auto;padding:24px}section{padding:24px;background:white;border:1px solid #dce3ed;border-radius:8px}h1{font-size:26px;line-height:1.3;margin:0 0 16px}p{line-height:1.6}a{color:#0369a1;display:inline-block;padding:12px 0}</style></head><body><main><section><h1>Маркет временно недоступен</h1><p>Проводится обновление. Аккаунт, баланс и открытые заказы сохранены.</p><a href="/">Вернуться на сайт</a></section></main></body></html>`;
export async function proxy(request:NextRequest) {
  const path=request.nextUrl.pathname.replace(/^\/market(?=\/|$)/,'')||'/';
  if(path.startsWith('/_next/')||['/icon.svg','/favicon.ico','/logout'].includes(path))return NextResponse.next();
  try {
    const cookie=request.cookies.get('goblin_market_session')?.value;
    const result=await fetch(`${process.env.MARKET_BACKEND_ORIGIN||'http://127.0.0.1:3000'}/api/market-app/availability`,{headers:cookie?{Cookie:`goblin_market_session=${cookie}`}:{},cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(result.ok){const availability=await result.json();if(availability.enabled||availability.administrator)return NextResponse.next();}
  }catch { /* Unavailable configuration must not accidentally enable trading. */ }
  return new NextResponse(maintenance,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'60','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
}
// basePath is added by Next.js when compiling the matcher.
export const config={matcher:'/:path*'};
