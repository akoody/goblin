import {db} from '../config/db.js';

export function emptyCatalogPayload(payload) {
  if(!payload||!Number.isInteger(payload.version)||!Array.isArray(payload.catalogItems))
    throw new Error('INVALID_MARKET_STATE');
  for(const field of ['listings','orders','conversations','messages','projectTasks']) {
    const rows=field==='projectTasks'?payload[field]||[]:payload[field];
    if(!Array.isArray(rows))throw new Error('INVALID_MARKET_STATE');
    if(rows.length)throw Object.assign(new Error('CATALOG_HAS_LINKED_RECORDS'),{status:409});
  }
  return {...payload,catalogItems:[]};
}

// A one-time owner-requested reset, deliberately not exposed through public RPC.
export async function clearExistingCatalog(resetId) {
  if(typeof resetId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(resetId))throw new Error('INVALID_RESET_ID');
  const c=await db.getConnection();
  try {
    await c.beginTransaction();
    const [[state]]=await c.execute('SELECT payload,revision FROM market_application_state WHERE id=1 FOR UPDATE');
    if(!state)throw new Error('MARKET_STATE_NOT_FOUND');
    const [[previous]]=await c.execute('SELECT cleared_categories FROM market_catalog_resets WHERE id=?',[resetId]);
    if(previous){await c.commit();return {alreadyApplied:true,clearedCategories:Number(previous.cleared_categories)};}
    const payload=typeof state.payload==='string'?JSON.parse(state.payload):state.payload;
    const next=emptyCatalogPayload(payload);
    const [popularity]=await c.query('SELECT slug,area,views FROM market_catalog_views');
    await c.execute(`INSERT INTO market_catalog_resets(id,previous_revision,previous_payload,previous_popularity,cleared_categories)
      VALUES(?,?,?,?,?)`,[resetId,state.revision,JSON.stringify(payload),JSON.stringify(popularity),payload.catalogItems.length]);
    await c.execute('UPDATE market_application_state SET payload=?,revision=revision+1 WHERE id=1',[JSON.stringify(next)]);
    await c.query('DELETE FROM market_catalog_visit_dedup');
    await c.query('DELETE FROM market_catalog_views');
    await c.commit();
    return {alreadyApplied:false,clearedCategories:payload.catalogItems.length};
  }catch(error){await c.rollback();throw error;}
  finally{c.release();}
}
