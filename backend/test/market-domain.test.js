import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../market-runtime/db.js';
import {populatedMarketFixture} from './fixtures/market-store.js';
import {randomUUID} from 'node:crypto';

function fixture() {
  const store=populatedMarketFixture();
  store.users=['buyer','seller','outsider'].map(id=>({id,name:id,email:id+'@example.invalid',passwordHash:'',role:'CUSTOMER',bio:null,city:null,preferredCurrency:'RUB',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
  store.walletTransactions=[{id:'opening',userId:'buyer',orderId:null,type:'TOP_UP',status:'COMPLETED',amountRub:100,description:'test',createdAt:new Date().toISOString()}];return store;
}
test('Production starts with an empty catalog and never seeds demo users or funds',()=>{
  const p=domain.createProductionStore();assert.equal(p.catalogItems.length,0);assert.equal(p.users.length,0);assert.equal(p.orders.length,0);assert.equal(p.walletTransactions.length,0);
});
test('Admin-created categories contain only the chosen market areas and keep the existing catalog intact',()=>{
  domain.withMarketStore(fixture(),store=>{
    const original=structuredClone(store.catalogItems);
    const services=domain.createCatalogItemRecord({name:'QA New Services',kind:'SERVICE',family:'ai',area:'services'});
    assert.deepEqual(services.sections.map(s=>s.name),['Услуги']);
    const accounts=domain.createCatalogItemRecord({name:'QA New Accounts',kind:'PLATFORM',family:'platform',area:'accounts'});
    assert.deepEqual(accounts.sections.map(s=>s.name),['Аккаунты']);
    const both=domain.createCatalogItemRecord({name:'QA Both',kind:'GAME',family:'shooter',area:'both'});
    assert.deepEqual(both.sections.map(s=>s.name),['Аккаунты','Услуги']);
    domain.createCatalogSectionRecord(services.id,'Игровые профили','accounts');
    assert.equal(services.sections.find(s=>s.name==='Игровые профили')?.area,'accounts');
    assert.equal(domain.getAdminDashboardData().catalogItems.length,original.length+3);
    for(const item of original)assert.deepEqual(store.catalogItems.find(i=>i.id===item.id),item);
  });
});
test('Purchase reserves exact cents and completion pays only once',()=>{
  let p=fixture();let orderId;
  p=domain.withMarketStore(p,store=>{
    const item=store.catalogItems[0];const l=domain.createListingRecord('seller',{itemSlug:item.slug,sectionId:item.sections[0].id,title:'Test listing',description:'A detailed listing description for tests',priceRub:0.1,quantity:3,deliveryType:'MANUAL',isActive:true});
    const o=domain.createPurchaseRecord('buyer',{listingId:l.listingId,quantity:3});orderId=o.orderId;
    assert.equal(domain.getWalletOverview('buyer').availableRub,99.7);assert.equal(domain.getWalletOverview('seller').availableRub,0);
    domain.updateOrderStatusAsAdmin(orderId,'CLOSED');assert.equal(domain.getWalletOverview('seller').availableRub,0.3);
    domain.updateOrderStatusAsAdmin(orderId,'CLOSED');assert.equal(domain.getWalletOverview('seller').availableRub,0.3);
    assert.throws(()=>domain.updateOrderStatusAsAdmin(orderId,'REFUNDED'),/ALREADY_SETTLED/);
  }).payload;
  assert.equal(p.orders.length,1);
});
test('Automatic delivery is private to the purchase conversation and limited by stock',()=>{
  domain.withMarketStore(fixture(),store=>{
    const item=store.catalogItems[0],l=domain.createListingRecord('seller',{itemSlug:item.slug,sectionId:item.sections[0].id,title:'Test AUTO listing',description:'A detailed listing description for tests',priceRub:10,quantity:1,deliveryType:'AUTO',autoPayloads:['private-test-code'],isActive:true});
    const purchase=domain.createPurchaseRecord('buyer',{listingId:l.listingId,quantity:1});
    const chat=domain.getConversationDetails(purchase.conversationId);assert(chat.messages.some(m=>m.text.includes('private-test-code')));
    assert.throws(()=>domain.createMessageRecord('outsider',purchase.conversationId,'Intrusion'),/NOT_FOUND/);
    assert.throws(()=>domain.createPurchaseRecord('buyer',{listingId:l.listingId,quantity:1}),/LISTING_NOT_FOUND/);
  });
});

test('USDT purchases reserve exact micro-units and a retry does not reserve twice',()=>{
  const balances=new Map([['buyer','0.300003'],['seller','0']]);
  const {payload}=domain.withMarketStore(fixture(),store=>{
    const item=store.catalogItems[0];
    const listing=domain.createListingRecord('seller',{itemSlug:item.slug,sectionId:item.sections[0].id,
      title:'USDT listing',description:'A detailed listing description for tests',priceRub:0,priceUsdt:'0.100001',
      quantity:3,deliveryType:'MANUAL',isActive:true});
    const input={listingId:listing.listingId,quantity:3,requestKey:randomUUID()};
    const purchase=domain.createPurchaseRecord('buyer',input);
    assert.deepEqual(domain.createPurchaseRecord('buyer',input),purchase);
    assert.throws(()=>domain.createPurchaseRecord('buyer',{...input,quantity:1}),/ORDER_REQUEST_CONFLICT/);
    domain.updateOrderStatusAsAdmin(purchase.orderId,'CLOSED');
    domain.updateOrderStatusAsAdmin(purchase.orderId,'CLOSED');
  },balances);
  assert.equal(payload.orders.length,1);
  assert.equal(payload.orders[0].amountUsdt,'0.300003');
  assert.deepEqual(payload.walletTransactions.filter(entry=>entry.amountUsdt).map(entry=>entry.amountUsdt),['-0.300003','0.300003']);
});

test('USDT project rewards keep their currency from reservation to payout',()=>{
  const {payload}=domain.withMarketStore(fixture(),()=>{
    const input={platform:'TELEGRAM',serviceType:'SUBSCRIBE',title:'USDT project',description:'Test task',
      targetSource:'Test source',targets:['first','second'],rewardPerTargetRub:0,rewardPerTargetUsdt:'0.005001',requestKey:randomUUID()};
    const project=domain.createProjectRecord('buyer',input);
    assert.equal(domain.createProjectRecord('buyer',input).id,project.id);
    domain.acceptProjectRecord('seller',project.id);
    domain.updateProjectProgressRecord('seller',project.id,2);
    domain.completeProjectRecord('buyer',project.id);
    assert.throws(()=>domain.completeProjectRecord('buyer',project.id),/PROJECT_NOT_COMPLETABLE/);
  },new Map([['buyer','0.010002']]));
  assert.equal(payload.projectTasks[0].totalBudgetUsdt,'0.010002');
  assert.equal(payload.orders[0].amountUsdt,'0.010002');
  assert.deepEqual(payload.walletTransactions.filter(entry=>entry.amountUsdt).map(entry=>entry.amountUsdt),['0.010002','-0.010002']);
});
