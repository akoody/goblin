import { verifyAccessToken } from '../config/jwt.js';
import { db } from '../config/db.js';
export const MARKET_COOKIE = 'goblin_market_session';
export function setMarketCookie(res, token, expires, secure=false) {
  res.cookie(MARKET_COOKIE, token, {httpOnly:true, secure:secure||process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:Math.max(0, expires*1000-Date.now())});
}
export async function marketIdentity(token) {
  if (!token) return null;
  try {
    const decoded=verifyAccessToken(token);
    const [[user]]=await db.execute("SELECT id,username,email,status,token_version,created_at FROM users WHERE id=?",[decoded.userId]);
    if (!user || user.status!=='active' || Number(user.token_version||0)!==Number(decoded.tokenVersion||0)) return null;
    return {...user, id:String(user.id)};
  } catch { return null; }
}
export function cookieToken(req) {
  const pair=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(MARKET_COOKIE+'='));
  return pair?.slice(MARKET_COOKIE.length+1)||'';
}
