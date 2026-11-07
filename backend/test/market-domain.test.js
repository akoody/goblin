import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../market-runtime/db.js';

function fixture() {
  const store=domain.createProductionStore();
  store.users=['buyer','seller','outsider'].map(id=>({id,name:id,email:id+'@example.invalid',passwordHash:'',role:'CUSTOMER',bio:null,city:null,preferredCurrency:'RUB',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
  store.walletTransactions=[{id:'opening',userId:'buyer',orderId:null,type:'TOP_UP',status:'COMPLETED',amountRub:100,description:'test',createdAt:new Date().toISOString()}];return store;
}
test('Production catalog keeps all sections, but no demo users or funds',()=>{
  const p=domain.createProductionStore();assert.equal(p.catalogItems.length,95);assert.equal(p.users.length,0);assert.equal(p.orders.length,0);assert.equal(p.walletTransactions.length,0);
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
