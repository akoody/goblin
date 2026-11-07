import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import * as domain from '../../market-runtime/db.js';
import { transact, requestPayment } from './commerce.service.js';
import { db } from '../config/db.js';
import { assertMarketArea, restrictMarketResult } from './market-areas.js';
let initialization;

const publicOperations=new Set(['getCatalogLibrary','getFeaturedCatalogItems','getCatalogItemBySlug','getListingDetails','getProjectSettings','getProjectFormConfig','isProjectServiceAvailable','getProjectServiceSetting','getProjectPlatformLabel','getProjectServiceLabel','getCounts','listTopSellers']);
const ownOperations=new Set(['listUserOrders','listUserConversations','getWalletOverview','getUserProfileData','getSupportOverview','getDashboardData','updateUserCurrency','createMessageRecord','createSupportTicketRecord','createListingRecord','createPurchaseRecord','createProjectRecord','acceptProjectRecord','updateProjectProgressRecord','completeProjectRecord']);
const adminOperations=new Set(['getAdminDashboardData','updateOrderStatusAsAdmin','createCatalogItemRecord','createCatalogSectionRecord','updateProjectPlatformSettingRecord','updateProjectServiceSettingRecord','updateProjectPlatformServicesRecord']);
const otherOperations=new Set(['currentUser','getConversationDetails','listProjectTasks','getProjectTaskById','settleOrder','createWalletTransactionRecord']);
const adminEmails=()=>String(process.env.ADMIN_EMAILS||process.env.VITE_ADMIN_EMAILS||'').split(/[,;\n]/).map(s=>s.trim().toLowerCase()).filter(Boolean);
const forbidden=(code='ACCESS_DENIED',status=403)=>{throw Object.assign(new Error(code),{status});};
const string=(v,min=1,max=200)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const positive=v=>Number.isFinite(v)&&v>0&&v<=10000000&&new Decimal(v).decimalPlaces()<=2;
function validate(operation,args) {
  if(!Array.isArray(args)||args.length>4)forbidden('INVALID_ARGUMENTS',400);
  if(operation==='createListingRecord') {
    const i=args[1];
    if(!i||!string(i.itemSlug)||!string(i.sectionId)||!string(i.title,10,180)||!string(i.description,30,10000)||!positive(i.priceRub)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100000||!['AUTO','MANUAL'].includes(i.deliveryType)||typeof i.isActive!=='boolean'||(i.deliveryNote!=null&&!string(i.deliveryNote,0,5000)))forbidden('INVALID_LISTING',400);
    if(i.deliveryType==='AUTO'&&(!Array.isArray(i.autoPayloads)||i.autoPayloads.length!==i.quantity||i.autoPayloads.some(v=>!string(v,1,2000))))forbidden('AUTO_STOCK_REQUIRED',400);
  }
  if(operation==='createPurchaseRecord') {const i=args[1];if(!i||!string(i.listingId)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100000)forbidden('INVALID_PURCHASE',400);}
  if(operation==='createProjectRecord') {
    const i=args[1];if(!i||!string(i.title,1,180)||!string(i.description,1,10000)||!string(i.targetSource,1,2000)||!Array.isArray(i.targets)||i.targets.length>500||i.targets.some(v=>!string(v,1,2000))||!positive(i.rewardPerTargetRub)||!domain.isProjectServiceAvailable(i.platform,i.serviceType))forbidden('INVALID_PROJECT',400);
  }
  if(operation==='updateProjectProgressRecord'&&(!Number.isInteger(args[2])||args[2]<0))forbidden('INVALID_PROGRESS',400);
  if(operation==='createMessageRecord'&&!string(args[2],1,2000))forbidden('INVALID_MESSAGE',400);
  if(operation==='createSupportTicketRecord'&&(!string(args[1],1,200)||!string(args[2],1,10000)))forbidden('INVALID_TICKET',400);
  if(operation==='updateUserCurrency'&&!['RUB','USD','EUR'].includes(args[1]))forbidden('INVALID_CURRENCY',400);
  if(operation==='updateOrderStatusAsAdmin'&&!['PENDING','DISPUTED','CLOSED','REFUNDED'].includes(args[1]))forbidden('INVALID_STATUS',400);
}
function safeResult(value,admin=false,publicRead=false) {
  return JSON.parse(JSON.stringify(value??null,(key,v)=>['passwordHash','autoPayloads'].includes(key)||(publicRead&&key==='deliveryNote')||(!admin&&key==='email')?undefined:v));
}
function balance(store,id) {return store.walletTransactions.filter(t=>t.userId===id&&t.status==='COMPLETED').reduce((v,t)=>v.plus(t.amountRub),new Decimal(0));}

// One locked aggregate preserves the original marketplace domain atomically.
// The exchange's SQL RUB wallets remain the authoritative available balance.
export async function marketOperation(operation,args,identity) {
  if(!publicOperations.has(operation)&&!ownOperations.has(operation)&&!adminOperations.has(operation)&&!otherOperations.has(operation))forbidden('UNKNOWN_OPERATION',400);
  const id=identity?.id,admin=identity&&adminEmails().includes(String(identity.email||'').toLowerCase());
  if(!publicOperations.has(operation)&&operation!=='currentUser'&&!id)forbidden('UNAUTHORIZED',401);
  if(adminOperations.has(operation)&&!admin)forbidden();
  if(ownOperations.has(operation)&&String(args?.[0])!==id)forbidden();
  if(operation==='createWalletTransactionRecord') {
    if(String(args?.[0])!==id)forbidden();
    const i=args[1]; if(!i||!['TOP_UP','WITHDRAWAL'].includes(i.type)||!positive(i.amountRub)||!string(i.description,5,1000))forbidden('INVALID_PAYMENT',400);
    return requestPayment(id,{kind:i.type,amount:i.amountRub,details:i.description,requestKey:randomUUID()});
  }
  // Initialization must commit outside the locked transaction. Concurrent
  // INSERT IGNORE statements otherwise hold shared row locks and deadlock
  // when both try to upgrade to FOR UPDATE during parallel page rendering.
  initialization ||= db.execute('INSERT IGNORE INTO market_application_state (id,payload) VALUES (1,?)',[JSON.stringify(domain.createProductionStore())]).catch(error=>{initialization=null;throw error;});
  await initialization;
  return transact(async c=>{
    const [[row]]=await c.execute('SELECT payload FROM market_application_state WHERE id=1 FOR UPDATE');
    const payload=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;
    const [users]=await c.query("SELECT id,username,email,created_at,status,internal_transfers_enabled,market_accounts_enabled,market_services_enabled FROM users ORDER BY id");
    await c.query('INSERT IGNORE INTO market_wallets (user_id) SELECT id FROM users');
    const [wallets]=await c.query('SELECT user_id,balance FROM market_wallets ORDER BY user_id FOR UPDATE');
    const before=new Map(wallets.map(w=>[String(w.user_id),new Decimal(w.balance)]));
    const wrapped=domain.withMarketStore(payload,store=>{
      for(const user of users) {
        const uid=String(user.id);let entry=store.users.find(u=>u.id===uid);
        if(!entry){entry={id:uid,name:user.username,email:user.email,passwordHash:'',role:'CUSTOMER',bio:null,city:null,preferredCurrency:'RUB',createdAt:new Date(user.created_at),updatedAt:new Date()};store.users.push(entry);}
        entry.name=user.username;entry.email=user.email;entry.role=adminEmails().includes(String(user.email||'').toLowerCase())?'ADMIN':entry.role==='ADMIN'?'CUSTOMER':entry.role;
        const delta=(before.get(uid)||new Decimal(0)).minus(balance(store,uid));
        if(!delta.isZero())store.walletTransactions.push({id:randomUUID(),userId:uid,orderId:null,type:delta.gt(0)?'TOP_UP':'WITHDRAWAL',status:'COMPLETED',amountRub:delta.toNumber(),description:'Изменение рублёвого баланса биржи',createdAt:new Date()});
      }
      validate(operation,args);
      const currentUser = users.find(u => String(u.id) === id);
      if (id && !currentUser) forbidden('UNAUTHORIZED', 401);
      if (!admin && operation === 'createListingRecord') {
        const item = store.catalogItems.find(i => i.slug === args[1].itemSlug);
        assertMarketArea(currentUser, item?.sections.find(s => s.id === args[1].sectionId));
      }
      if (!admin && ['createProjectRecord', 'acceptProjectRecord'].includes(operation)) assertMarketArea(currentUser, {name:'Услуги'});
      const moneyOps=['createListingRecord','createPurchaseRecord','createProjectRecord','acceptProjectRecord','completeProjectRecord','settleOrder'];
      if(moneyOps.includes(operation)&&users.some(u=>String(u.id)===id&&(u.status!=='active'||Number(u.internal_transfers_enabled)!==1)))forbidden('ACCOUNT_OPERATIONS_DISABLED');
      if(operation==='currentUser')return id?{...store.users.find(u=>u.id===id),passwordHash:''}:null;
      if(operation==='getConversationDetails') {
        const chat=store.conversations.find(v=>v.id===args[0]);if(!chat||(!admin&&chat.buyerId!==id&&chat.sellerId!==id))forbidden();
      }
      if(operation==='listProjectTasks'&&args[0]?.mineUserId&&args[0].mineUserId!==id)forbidden();
      if(operation==='getProjectTaskById') {
        const p=store.projectTasks.find(p=>p.id===args[0]);if(p&&p.status!=='OPEN'&&!admin&&p.customerId!==id&&p.executorId!==id)forbidden();
      }
      if(operation==='createPurchaseRecord') {
        const l=store.listings.find(l=>l.id===args[1].listingId),seller=users.find(u=>String(u.id)===l?.sellerId);
        if(!seller||seller.status!=='active'||Number(seller.internal_transfers_enabled)!==1)forbidden('SELLER_UNAVAILABLE');
        const section = store.catalogItems.find(i => i.id === l.itemId)?.sections.find(s => s.id === l.sectionId);
        if (!admin) assertMarketArea(currentUser, section);
        assertMarketArea(seller, section);
      }
      if(operation==='settleOrder') {
        const order=store.orders.find(o=>o.id===args[0]);if(!order||order.buyerId!==id||order.status!=='PENDING'||!['CLOSED','DISPUTED'].includes(args[1]))forbidden('ORDER_NOT_SETTLEABLE');
        domain.updateOrderStatusAsAdmin(order.id,args[1]);return {id:order.id,conversationId:store.conversations.find(c=>c.orderId===order.id)?.id};
      }
      let result=domain[operation](...args);
      if (!admin) result = restrictMarketResult(operation, result, currentUser);
      if(operation==='listProjectTasks')result=result.filter(p=>p.status==='OPEN'||admin||p.customerId===id||p.executorId===id);
      return result;
    });
    for(const user of wrapped.payload.users) {
      const after=wrapped.payload.walletTransactions.filter(t=>t.userId===user.id&&t.status==='COMPLETED').reduce((v,t)=>v.plus(t.amountRub),new Decimal(0));
      const delta=after.minus(before.get(user.id)||0);
      if(after.lt(0))forbidden('INSUFFICIENT_FUNDS',400);
      if(!delta.isZero()) {
        await c.execute('UPDATE market_wallets SET balance=? WHERE user_id=?',[after.toFixed(2),user.id]);
        await c.execute('INSERT INTO commerce_ledger (user_id,currency,amount,reference_id,operation) VALUES (?,\'RUB\',?,?,?)',[user.id,delta.toFixed(2),randomUUID(),'MARKET_APPLICATION']);
      }
    }
    await c.execute('UPDATE market_application_state SET payload=?,revision=revision+1 WHERE id=1',[JSON.stringify(wrapped.payload)]);
    let result=wrapped.result;
    if(operation==='getWalletOverview') {
      const [payments]=await c.execute('SELECT * FROM market_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[id]);
      const filter=args[1];
      result.transactions.push(...payments.filter(p=>p.status==='PENDING'&&(!filter||filter==='ALL'||filter==='PENDING')).map(p=>({id:p.id,userId:id,orderId:null,type:p.kind,status:'PENDING',amountRub:Number(p.amount)*(p.kind==='WITHDRAWAL'?-1:1),description:p.details,createdAt:p.created_at})));
      result.transactions.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    }
    if(operation==='currentUser')return result?{...result,email:identity?.email}:null;
    return safeResult(result,admin,publicOperations.has(operation));
  });
}
