import test from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../src/config/db.js';
import * as domain from '../market-runtime/db.js';
import {marketOperation} from '../src/services/market-app.service.js';
import {populatedMarketFixture} from './fixtures/market-store.js';

test('Marketplace RPC applies per-user area controls to reads, creation and both purchase participants',async()=>{
  const old={execute:db.execute,getConnection:db.getConnection,admins:process.env.ADMIN_EMAILS};
  process.env.ADMIN_EMAILS='owner@example.invalid';
  let payload=populatedMarketFixture();
  const users=[1,2,3].map(id=>({id,username:`qa-${id}`,email:id===3?'owner@example.invalid':`qa-${id}@example.invalid`,status:'active',internal_transfers_enabled:1,market_accounts_enabled:1,market_services_enabled:id===1?0:1,created_at:new Date()}));
  let account,service,itemSlug;
  payload=domain.withMarketStore(payload,store=>{
    store.users=users.map(u=>({id:String(u.id),name:u.username,email:u.email,role:'CUSTOMER',preferredCurrency:'RUB',createdAt:new Date(),updatedAt:new Date()}));
    const item=store.catalogItems[0];itemSlug=item.slug;
    for(const [name,title] of [['Аккаунты','Test account listing'],['Услуги','Test service listing']]){
      const section=item.sections.find(s=>s.name===name);assert(section);
      const result=domain.createListingRecord('2',{itemSlug:item.slug,sectionId:section.id,title,description:'Detailed synthetic listing description for testing',priceRub:0,priceUsdt:'10',quantity:2,deliveryType:'MANUAL',isActive:true});
      if(name==='Аккаунты')account={id:result.listingId,sectionId:section.id};else service={id:result.listingId,sectionId:section.id};
    }
  }).payload;
  const execute=async(sql,args)=>{
    if(sql.startsWith('INSERT IGNORE INTO market_application_state'))return [{affectedRows:0}];
    if(sql.startsWith('SELECT payload'))return [[{payload:JSON.stringify(payload)}]];
    if(sql.startsWith('UPDATE market_application_state')){payload=JSON.parse(args[0]);return [{affectedRows:1}];}
    throw Error('Unexpected SQL: '+sql);
  };
  const query=async sql=>{
    if(sql.startsWith('SELECT id,username'))return [users];
    if(sql.startsWith('INSERT IGNORE INTO market_wallets'))return [{affectedRows:0}];
    if(sql.startsWith('SELECT user_id,usdt_balance'))return [users.map(u=>({user_id:u.id,usdt_balance:'0'}))];
    if(sql.startsWith('SELECT slug,area,views'))return [[]];
    throw Error('Unexpected query: '+sql);
  };
  db.execute=execute;db.getConnection=async()=>({execute,query,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}});
  const identity={id:'1',email:users[0].email};
  try{
    const catalog=await marketOperation('getCatalogLibrary',[],identity);assert(catalog.length>0);assert(catalog.every(i=>i.sections.every(s=>s.name==='Аккаунты')));
    await assert.rejects(()=>marketOperation('getListingDetails',[itemSlug,service.id],identity),e=>e.status===403);
    const create={itemSlug,sectionId:service.sectionId,title:'Test new service',description:'Detailed synthetic service description for testing',priceRub:0,priceUsdt:'10',quantity:1,deliveryType:'MANUAL',isActive:true};
    await assert.rejects(()=>marketOperation('createListingRecord',['1',create],identity),e=>e.status===403);
    users[0].market_accounts_enabled=0;
    await assert.rejects(()=>marketOperation('getListingDetails',[itemSlug,account.id],identity),e=>e.status===403);
    users[0].market_accounts_enabled=1;users[1].market_accounts_enabled=0;
    await assert.rejects(()=>marketOperation('createPurchaseRecord',['1',{listingId:account.id,quantity:1}],identity),e=>e.status===403);
    const input={name:'QA Category',kind:'SERVICE',family:'ai',area:'services'};
    await assert.rejects(()=>marketOperation('createCatalogItemRecord',[input],identity),e=>e.status===403);
    const owner={id:'3',email:'owner@example.invalid'};
    await assert.rejects(()=>marketOperation('updateCatalogAvailabilityRecord',['anything','accounts',[],false],identity),e=>e.status===403);
    await assert.rejects(()=>marketOperation('createCatalogItemRecord',[{...input,area:'invalid'}],owner),e=>e.status===400);
    const category=await marketOperation('createCatalogItemRecord',[input],owner);
    assert.deepEqual(category.sections.map(s=>s.name),['Услуги']);
    await marketOperation('createCatalogSectionRecord',[category.id,'Персональные профили','accounts'],owner);
    const visible=await marketOperation('getCatalogItemBySlug',[category.slug],identity);
    assert.deepEqual(visible.sections.map(s=>s.name),['Персональные профили']);
    await assert.rejects(()=>marketOperation('createListingRecord',['1',{...create,itemSlug:category.slug,sectionId:visible.sections[0].id,priceRub:10,priceUsdt:undefined}],identity),/INVALID_LISTING/);
    await assert.rejects(()=>marketOperation('createProjectRecord',['1',{title:'RUB project',description:'Test project',targetSource:'Source',targets:['target'],rewardPerTargetRub:10}],identity),/INVALID_PROJECT/);
    await assert.rejects(()=>marketOperation('createWalletTransactionRecord',['1',{type:'TOP_UP',amountRub:50}],identity),/UNKNOWN_OPERATION/);
    await marketOperation('createListingRecord',['1',{...create,itemSlug:category.slug,sectionId:visible.sections[0].id}],identity);
    const hidden=await marketOperation('getCatalogItemBySlug',[category.slug],{id:'2',email:users[1].email});
    assert.deepEqual(hidden.sections.map(s=>s.name),['Услуги']);
    await assert.rejects(()=>marketOperation('updateCatalogAvailabilityRecord',[category.id,'accounts',[category.sections[0].id],true],owner),/INVALID_CATALOG_AVAILABILITY/);
    await marketOperation('updateCatalogAvailabilityRecord',[category.id,'accounts',[],false],owner);
    const disabled=await marketOperation('getCatalogItemBySlug',[category.slug],null);
    assert(disabled.sections.every(section=>section.name==='Услуги'));
    const custom=await marketOperation('createCatalogItemRecord',[{name:'QA Custom Taxonomy',kind:'Свой тип',family:'Своя группа',area:'services'}],owner);
    assert.equal(custom.kind,'Свой тип');assert.equal(custom.family,'Своя группа');
  }finally{db.execute=old.execute;db.getConnection=old.getConnection;if(old.admins===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=old.admins;await db.end();}
});
