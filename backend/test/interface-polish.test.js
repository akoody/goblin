import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {db} from '../src/config/db.js';
import {historyFilters,historyQuery,transactionHistory} from '../src/services/transaction-history.service.js';
import {marketArea,assertMarketArea,restrictMarketResult} from '../src/services/market-areas.js';
import {userControlChanges,updateUserControls} from '../src/services/user-controls.service.js';
import adminRoutes from '../src/routes/admin.routes.js';

test('History validates dates, exact amounts and pagination without accepting SQL fragments',()=>{
  const f=historyFilters({min:'0,000000000000000001',max:'10',page:'2',address:"%' OR 1=1 --",from:'2026-11-01T00:00:00Z'});
  assert.equal(f.min,'0.000000000000000001');
  const q=historyQuery(f,{userId:42});
  assert(!q.sql.includes(f.address));assert(q.params.includes(f.address));
  assert(q.params.filter(v=>v===42).length>=6);
  assert(q.sql.includes('DECIMAL(65,18)'));
  for(const query of [{page:0},{page:'bad'},{min:'-1'},{max:'1e10'},{min:'2',max:'1'},{direction:'bad'},{status:'bad'},{from:'yesterday'},{from:'2026-11-02T00:00:00Z',until:'2026-11-01T00:00:00Z'}])assert.throws(()=>historyFilters(query),e=>e.status===400);
});

test('Market areas are independent, fail closed and preserve existing-order operations',()=>{
  const user={market_accounts_enabled:0,market_services_enabled:1};
  const accounts={id:'account',name:'Аккаунты',listingsCount:3},services={id:'service',name:'Услуги',listingsCount:2};
  assert.equal(marketArea(accounts),'accounts');
  assert.throws(()=>assertMarketArea(user,accounts),e=>e.status===403);
  assert.doesNotThrow(()=>assertMarketArea(user,services));
  assert.throws(()=>assertMarketArea({},services),e=>e.status===403);
  assert.throws(()=>assertMarketArea(user,null),e=>e.status===404);
  const item={sections:[accounts,services],sectionStats:[accounts,services],minPriceRub:100,listings:[{sectionId:'account'},{sectionId:'service'}]};
  const result=restrictMarketResult('getCatalogItemBySlug',item,user);
  assert.equal(result.listings.length,1);assert.equal(result.listingCount,2);assert.equal(result.minPriceRub,null);
  assert.deepEqual(restrictMarketResult('getCatalogLibrary',[item],{market_accounts_enabled:0,market_services_enabled:0}),[]);
  assert.throws(()=>restrictMarketResult('getListingDetails',{section:accounts},user),e=>e.status===403);
  assert.equal(restrictMarketResult('getConversationDetails',item,user),item);
});

test('User control changes are partial, typed, audited and cannot restore deleted accounts',async()=>{
  assert.deepEqual(userControlChanges({marketAccountsEnabled:false}),{market_accounts_enabled:0});
  assert.deepEqual(userControlChanges({marketServicesEnabled:true}),{market_services_enabled:1});
  for(const body of [{},{status:'deleted'},{marketAccountsEnabled:'false'},{depositsEnabled:0}])assert.throws(()=>userControlChanges(body),e=>e.status===400);
  const previous=db.getConnection;let status='active';const writes=[];
  db.getConnection=async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,args)=>{
    if(sql.startsWith('SELECT'))return [[{status}]];writes.push({sql,args});return [{affectedRows:1}];
  }});
  try{
    await updateUserControls(1,2,{marketAccountsEnabled:false});
    assert(writes[0].sql.includes('market_accounts_enabled=?'));
    assert(!writes[0].sql.includes('deposits_enabled'));
    assert(writes[1].sql.includes('user_access_audit'));
    status='deleted';await assert.rejects(()=>updateUserControls(1,2,{status:'active'}),e=>e.status===409);
    assert.equal(writes.length,2);
  }finally{db.getConnection=previous;}
});

test('History endpoint enforces helper permissions and filters full history on the server',async()=>{
  const original=db.execute,previous=process.env.ADMIN_EMAILS;let permission='security';const queries=[];
  process.env.ADMIN_EMAILS='owner@example.invalid';
  db.execute=async(sql,args)=>{
    if(sql.startsWith('SELECT id,email,status'))return [[{id:2,email:'helper@example.invalid',status:'active'}]];
    if(sql.includes('FROM staff_helpers'))return [[{permission}]];
    queries.push({sql,args});
    return sql.startsWith('SELECT COUNT')?[[{total:1}]]:[[{id:'tx-1',amount:'0.00000001',currency:'BTC',status:'COMPLETED'}]];
  };
  const app=express();app.use((req,res,next)=>{req.user={userId:2};next();});app.use('/admin',adminRoutes);
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url=`http://127.0.0.1:${server.address().port}/admin/transaction-history`;
  try{
    assert.equal((await fetch(url)).status,403);
    permission='transactions';
    const r=await fetch(url+'?direction=OUT&min=0.00000001&address=bc1test&page=2');assert.equal(r.status,200);
    assert.equal((await r.json()).total,1);
    assert(queries.every(q=>!q.sql.includes("CONCAT('p2p-'")));
    assert(queries.at(-1).sql.endsWith('LIMIT 50 OFFSET 50'));
    assert(queries.at(-1).args.includes('bc1test'));
    assert.equal((await fetch(url+'?min=-1')).status,400);
    const own=await transactionHistory({}, {userId:42});assert.equal(own.rows.length,1);
  }finally{await new Promise(resolve=>server.close(resolve));db.execute=original;if(previous===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=previous;await db.end();}
});
