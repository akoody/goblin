import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../market-runtime/db.js';

test('custom taxonomy and area-specific subcategories persist without fixed platform lists',()=>{
 const result=domain.withMarketStore(domain.createProductionStore(),()=>{
  const item=domain.createCatalogItemRecord({name:'Своя категория',kind:'Разработчикам',family:'Новая группа',area:'both'});
  domain.createCatalogSectionRecord(item.id,'Настройка','accounts');
  domain.createCatalogSectionRecord(item.id,'Настройка','services');
  assert.throws(()=>domain.createCatalogSectionRecord(item.id,'НАСТРОЙКА','accounts'),/SECTION_EXISTS/);
  return item.id;
 });
 domain.withMarketStore(result.payload,()=>{
  const item=domain.getAdminDashboardData().catalogItems.find(item=>item.id===result.result);
  assert.equal(item.kind,'Разработчикам');assert.equal(item.family,'Новая группа');
  const sections=item.sections.filter(section=>section.name==='Настройка');assert.equal(sections.length,2);assert.notEqual(sections[0].id,sections[1].id);
 });
});

test('disabled categories and subcategories block listings and purchases, while existing orders can settle',()=>{
 let itemId,slug,sectionId,listingId,orderId;
 let payload=domain.withMarketStore(domain.createProductionStore(),store=>{
  const time=new Date();store.users=['buyer','seller'].map(id=>({id,name:id,email:`${id}@example.invalid`,role:'CUSTOMER',preferredCurrency:'RUB',createdAt:time,updatedAt:time}));
  store.walletTransactions.push({id:'opening',userId:'buyer',orderId:null,type:'TOP_UP',status:'COMPLETED',amountRub:100,description:'QA',createdAt:time});
  const item=domain.createCatalogItemRecord({name:'QA category',kind:'Custom',family:'Custom group',area:'both'});itemId=item.id;slug=item.slug;sectionId=item.sections[0].id;
  listingId=domain.createListingRecord('seller',{itemSlug:slug,sectionId,title:'Detailed QA listing',description:'Detailed synthetic listing only',priceRub:10,quantity:3,deliveryType:'MANUAL',isActive:true}).listingId;
  orderId=domain.createPurchaseRecord('buyer',{listingId,quantity:1}).orderId;
 }).payload;
 payload=domain.withMarketStore(payload,()=>{
  domain.updateCatalogAvailabilityRecord(itemId,'accounts',[sectionId],false);
  assert.equal(domain.getListingDetails(slug,listingId),null);
  assert(domain.getCatalogLibrary().find(item=>item.id===itemId).sections.every(section=>section.name==='Услуги'));
  assert.throws(()=>domain.createPurchaseRecord('buyer',{listingId,quantity:1}),/CATALOG_UNAVAILABLE/);
  assert.throws(()=>domain.createListingRecord('seller',{itemSlug:slug,sectionId,title:'Another detailed QA listing',description:'Detailed synthetic listing only',priceRub:10,quantity:1,deliveryType:'MANUAL',isActive:true}),/SECTION_NOT_FOUND/);
  const order=domain.listUserOrders('buyer','purchases').find(order=>order.id===orderId);assert(order);
  domain.updateOrderStatusAsAdmin(orderId,'CLOSED');assert.equal(domain.getWalletOverview('seller').availableRub,10);
  const adminItem=domain.getAdminDashboardData().catalogItems.find(item=>item.id===itemId);assert.equal(adminItem.availability.accounts,false);
  domain.updateCatalogAvailabilityRecord(itemId,'accounts',[],true);assert.equal(domain.getListingDetails(slug,listingId),null);
  domain.updateCatalogAvailabilityRecord(itemId,'accounts',[sectionId],true);assert(domain.getListingDetails(slug,listingId));
  const serviceId=adminItem.sections.find(section=>section.name==='Услуги').id;
  assert.throws(()=>domain.updateCatalogAvailabilityRecord(itemId,'accounts',[serviceId],true),/INVALID_CATALOG_AVAILABILITY/);
 }).payload;
 assert.equal(payload.orders.length,1);assert.equal(payload.listings[0].quantity,2);
});
