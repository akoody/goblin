import {createHmac} from 'node:crypto';
import {db} from '../config/db.js';
import {getJwtSecret} from '../config/jwt.js';
import {marketArea} from './market-areas.js';

export function catalogVisitorHash({userId,ip,userAgent},secret=getJwtSecret()) {
  const visitor=userId?`user:${userId}`:`anonymous:${String(ip||'unknown')}\0${String(userAgent||'').slice(0,512)}`;
  return createHmac('sha256',secret).update(`market-catalog-visits:v1\0${visitor}`).digest();
}

export async function recordCatalogVisit({slug,area,visitorHash}) {
  if(typeof slug!=='string'||slug.length>200||!/^[a-z0-9а-яё]+(?:-[a-z0-9а-яё]+)*$/i.test(slug)||
    !['accounts','services'].includes(area)||!Buffer.isBuffer(visitorHash)||visitorHash.length!==32)
    throw Object.assign(new Error('INVALID_CATALOG_VISIT'),{status:400});
  const c=await db.getConnection();
  try {
    await c.beginTransaction();
    const [[row]]=await c.execute('SELECT payload FROM market_application_state WHERE id=1 FOR SHARE');
    const store=row&&(typeof row.payload==='string'?JSON.parse(row.payload):row.payload);
    const item=store?.catalogItems.find(item=>item.slug===slug);
    if(!item?.sections.some(section=>marketArea(section)===area))throw Object.assign(new Error('CATALOG_ITEM_NOT_FOUND'),{status:404});
    const [visit]=await c.execute(`INSERT IGNORE INTO market_catalog_visit_dedup(slug,area,visit_day,visitor_hash)
      VALUES(?,?,UTC_DATE(),?)`,[slug,area,visitorHash]);
    const counted=visit.affectedRows===1;
    if(counted)await c.execute(`INSERT INTO market_catalog_views(slug,area,views) VALUES(?,?,1)
      ON DUPLICATE KEY UPDATE views=views+1`,[slug,area]);
    // Keep the short-lived deduplication identifiers, not a permanent visitor log.
    await c.query('DELETE FROM market_catalog_visit_dedup WHERE visit_day<DATE_SUB(UTC_DATE(),INTERVAL 2 DAY) LIMIT 100');
    await c.commit();
    return {counted};
  }catch(error){await c.rollback();throw error;}
  finally{c.release();}
}

export async function attachCatalogPopularity(c,items) {
  if(!items.length)return items;
  const [rows]=await c.query('SELECT slug,area,views FROM market_catalog_views WHERE slug IN (?)',[items.map(item=>item.slug)]);
  const counts=new Map();
  for(const row of rows) {
    const stats=counts.get(row.slug)||{accounts:0,services:0};
    stats[row.area]=Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Number(row.views)||0));counts.set(row.slug,stats);
  }
  return items.map(item=>({...item,visitCounts:counts.get(item.slug)||{accounts:0,services:0}}));
}
