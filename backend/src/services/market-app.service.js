import * as domain from '../../market-runtime/db.js';
import { transact } from './commerce.service.js';
import { db } from '../config/db.js';
import { assertMarketArea, restrictMarketResult } from './market-areas.js';
import {attachCatalogPopularity} from './market-popularity.service.js';
import {isMarketUsdtAmount,marketUsdtBalances,marketUsdtTransfers,transferMarketUsdt} from './market-usdt.service.js';
let initialization;

const publicOperations=new Set(['getCatalogLibrary','getFeaturedCatalogItems','getCatalogItemBySlug','getListingDetails','getProjectSettings','getProjectFormConfig','isProjectServiceAvailable','getProjectServiceSetting','getProjectPlatformLabel','getProjectServiceLabel','getCounts','listTopSellers']);
const ownOperations=new Set(['listUserOrders','listUserConversations','getWalletOverview','getUserProfileData','getSupportOverview','getDashboardData','createMessageRecord','createSupportTicketRecord','createListingRecord','createPurchaseRecord','createProjectRecord','acceptProjectRecord','updateProjectProgressRecord','completeProjectRecord']);
const adminOperations=new Set(['getAdminDashboardData','updateOrderStatusAsAdmin','createCatalogItemRecord','createCatalogSectionRecord','updateCatalogAvailabilityRecord','updateProjectPlatformSettingRecord','updateProjectServiceSettingRecord','updateProjectPlatformServicesRecord']);
const otherOperations=new Set(['currentUser','getConversationDetails','listProjectTasks','getProjectTaskById','settleOrder','transferMarketUsdt']);
const adminEmails=()=>String(process.env.ADMIN_EMAILS||process.env.VITE_ADMIN_EMAILS||'').split(/[,;\n]/).map(s=>s.trim().toLowerCase()).filter(Boolean);
const forbidden=(code='ACCESS_DENIED',status=403)=>{throw Object.assign(new Error(code),{status});};
const string=(v,min=1,max=200)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const marketPrice=(rub,usdt)=>rub===0&&isMarketUsdtAmount(usdt);
const validRequestKey=value=>value===undefined||typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
function validate(operation,args) {
  if(!Array.isArray(args)||args.length>4)forbidden('INVALID_ARGUMENTS',400);
  if(operation==='createCatalogItemRecord') {
    const input=args[0];
    if(!input||!string(input.name,2,120)||!/[a-z0-9а-яё]/i.test(input.name)||!string(input.kind,1,80)||!string(input.family,1,80)||
      (input.area!==undefined&&!['accounts','services','both'].includes(input.area))||
      (input.description!==undefined&&!string(input.description,0,2000)))forbidden('INVALID_CATALOG_ITEM',400);
    input.name=input.name.trim();
    input.kind=input.kind.trim();input.family=input.family.trim();
  }
  if(operation==='createCatalogSectionRecord'&&(!string(args[0],1,200)||!string(args[1],2,120)||!/[a-z0-9а-яё]/i.test(args[1])||
    (args[2]!==undefined&&!['accounts','services'].includes(args[2]))))forbidden('INVALID_CATALOG_SECTION',400);
  if(operation==='updateCatalogAvailabilityRecord'&&(!string(args[0],1,200)||!['accounts','services'].includes(args[1])||!Array.isArray(args[2])||args[2].length>1000||args[2].some(id=>!string(id,1,300))||typeof args[3]!=='boolean'))forbidden('INVALID_CATALOG_AVAILABILITY',400);
  if(operation==='createListingRecord') {
    const i=args[1];
    if(!i||!string(i.itemSlug)||!string(i.sectionId)||!string(i.title,10,180)||!string(i.description,30,10000)||!marketPrice(i.priceRub,i.priceUsdt)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100000||!['AUTO','MANUAL'].includes(i.deliveryType)||typeof i.isActive!=='boolean'||(i.deliveryNote!=null&&!string(i.deliveryNote,0,5000)))forbidden('INVALID_LISTING',400);
    if(i.deliveryType==='AUTO'&&(!Array.isArray(i.autoPayloads)||i.autoPayloads.length!==i.quantity||i.autoPayloads.some(v=>!string(v,1,2000))))forbidden('AUTO_STOCK_REQUIRED',400);
  }
  if(operation==='createPurchaseRecord') {const i=args[1];if(!i||!string(i.listingId)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>100000||!validRequestKey(i.requestKey))forbidden('INVALID_PURCHASE',400);}
  if(operation==='createProjectRecord') {
    const i=args[1];if(!i||!string(i.title,1,180)||!string(i.description,1,10000)||!string(i.targetSource,1,2000)||!Array.isArray(i.targets)||i.targets.length>500||i.targets.some(v=>!string(v,1,2000))||!marketPrice(i.rewardPerTargetRub,i.rewardPerTargetUsdt)||!validRequestKey(i.requestKey)||!domain.isProjectServiceAvailable(i.platform,i.serviceType))forbidden('INVALID_PROJECT',400);
  }
  if(operation==='updateProjectProgressRecord'&&(!Number.isInteger(args[2])||args[2]<0))forbidden('INVALID_PROGRESS',400);
  if(operation==='createMessageRecord'&&!string(args[2],1,2000))forbidden('INVALID_MESSAGE',400);
  if(operation==='createSupportTicketRecord'&&(!string(args[1],1,200)||!string(args[2],1,10000)))forbidden('INVALID_TICKET',400);
  if(operation==='updateOrderStatusAsAdmin'&&!['PENDING','DISPUTED','CLOSED','REFUNDED'].includes(args[1]))forbidden('INVALID_STATUS',400);
}
function safeResult(value,admin=false,publicRead=false) {
  return JSON.parse(JSON.stringify(value??null,(key,v)=>['passwordHash','autoPayloads','requestKey'].includes(key)||(publicRead&&key==='deliveryNote')||(!admin&&key==='email')?undefined:v));
}

// One locked aggregate preserves the original marketplace domain atomically.
export async function marketOperation(operation,args,identity) {
  if(!publicOperations.has(operation)&&!ownOperations.has(operation)&&!adminOperations.has(operation)&&!otherOperations.has(operation))forbidden('UNKNOWN_OPERATION',400);
  const id=identity?.id,admin=identity&&adminEmails().includes(String(identity.email||'').toLowerCase());
  if(!publicOperations.has(operation)&&operation!=='currentUser'&&!id)forbidden('UNAUTHORIZED',401);
  if(adminOperations.has(operation)&&!admin)forbidden();
  if(ownOperations.has(operation)&&String(args?.[0])!==id)forbidden();
  if(operation==='transferMarketUsdt'){
    if(!Array.isArray(args)||args.length!==1)forbidden('INVALID_ARGUMENTS',400);
    return transferMarketUsdt(id,args[0]);
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
    const [wallets]=await c.query('SELECT user_id,usdt_balance FROM market_wallets ORDER BY user_id FOR UPDATE');
    const usdtBalances=new Map(wallets.map(w=>[String(w.user_id),String(w.usdt_balance??'0')]));
    const existingUsdtTransactions=new Set(payload.walletTransactions.filter(t=>t.amountUsdt!==undefined).map(t=>t.id));
    const wrapped=domain.withMarketStore(payload,store=>{
      for(const user of users) {
        const uid=String(user.id);let entry=store.users.find(u=>u.id===uid);
        if(!entry){entry={id:uid,name:user.username,email:user.email,passwordHash:'',role:'CUSTOMER',bio:null,city:null,preferredCurrency:'RUB',createdAt:new Date(user.created_at),updatedAt:new Date()};store.users.push(entry);}
        entry.name=user.username;entry.email=user.email;entry.role=adminEmails().includes(String(user.email||'').toLowerCase())?'ADMIN':entry.role==='ADMIN'?'CUSTOMER':entry.role;
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
        if(l.priceUsdt===undefined)forbidden('USDT_REQUIRED',409);
        const section = store.catalogItems.find(i => i.id === l.itemId)?.sections.find(s => s.id === l.sectionId);
        if (!admin) assertMarketArea(currentUser, section);
        assertMarketArea(seller, section);
      }
      if(['acceptProjectRecord','completeProjectRecord','updateProjectProgressRecord'].includes(operation)){
        const project=store.projectTasks.find(item=>item.id===args[1]);
        if(project&&project.totalBudgetUsdt===undefined)forbidden('USDT_REQUIRED',409);
      }
      if(['settleOrder','updateOrderStatusAsAdmin'].includes(operation)){
        const order=store.orders.find(item=>item.id===args[0]);
        if(order&&order.amountUsdt===undefined)forbidden('USDT_REQUIRED',409);
      }
      if(operation==='settleOrder') {
        const order=store.orders.find(o=>o.id===args[0]);if(!order||order.buyerId!==id||order.status!=='PENDING'||!['CLOSED','DISPUTED'].includes(args[1]))forbidden('ORDER_NOT_SETTLEABLE');
        domain.updateOrderStatusAsAdmin(order.id,args[1]);return {id:order.id,conversationId:store.conversations.find(c=>c.orderId===order.id)?.id};
      }
      let result=domain[operation](...args);
      if (!admin) result = restrictMarketResult(operation, result, currentUser);
      if(operation==='listProjectTasks')result=result.filter(p=>p.status==='OPEN'||admin||p.customerId===id||p.executorId===id);
      return result;
    },usdtBalances);
    for(const entry of wrapped.payload.walletTransactions){
      if(entry.amountUsdt===undefined||existingUsdtTransactions.has(entry.id))continue;
      const [change]=await c.execute('UPDATE market_wallets SET usdt_balance=usdt_balance+? WHERE user_id=? AND usdt_balance+?>=0',
        [entry.amountUsdt,entry.userId,entry.amountUsdt]);
      if(change.affectedRows!==1)forbidden('INSUFFICIENT_FUNDS',400);
      await c.execute("INSERT INTO commerce_ledger (user_id,currency,amount,reference_id,operation) VALUES (?,'USDT',?,?,?)",
        [entry.userId,entry.amountUsdt,entry.id,'MARKET_APPLICATION']);
    }
    await c.execute('UPDATE market_application_state SET payload=?,revision=revision+1 WHERE id=1',[JSON.stringify(wrapped.payload)]);
    let result=wrapped.result;
    if(['getCatalogLibrary','getFeaturedCatalogItems'].includes(operation))result=await attachCatalogPopularity(c,result);
    if(operation==='getWalletOverview') {
      const filter=args[1];
      result.transactions=result.transactions.filter(entry=>entry.amountUsdt!==undefined);
      result.exchangeUsdt=(await marketUsdtBalances(id,c)).exchange;
      if(!filter||filter==='ALL'||filter==='COMPLETED'){
        const transfers=await marketUsdtTransfers(id,c);
        result.transactions.push(...transfers.map(t=>({id:t.id,userId:id,orderId:null,type:t.direction==='TO_MARKET'?'TOP_UP':'WITHDRAWAL',
          status:'COMPLETED',amountRub:0,amountUsdt:t.direction==='TO_MARKET'?t.amount:`-${t.amount}`,description:t.direction==='TO_MARKET'?'Перевод с биржи':'Перевод на биржу',createdAt:t.createdAt})));
      }
      result.transactions.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    }
    if(operation==='currentUser')return result?{...result,email:identity?.email}:null;
    return safeResult(result,admin,publicOperations.has(operation));
  });
}
