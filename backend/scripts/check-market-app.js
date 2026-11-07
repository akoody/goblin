import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { marketOperation as op } from '../src/services/market-app.service.js';
import { transact, reviewPayment } from '../src/services/commerce.service.js';
import { withMarketStore } from '../market-runtime/db.js';
import { signAccessToken } from '../src/config/jwt.js';
import { writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { loginUser } from '../src/services/auth.service.js';
if(process.env.MARKET_DB_CHECK!=='1')throw new Error('Explicit MARKET_DB_CHECK=1 required');
const users=[],tag='marketqa-'+randomUUID().slice(0,8);
const qaPassword=randomUUID()+'-Qa9!',qaHash=await bcrypt.hash(qaPassword,10);
const identity=id=>users.find(u=>u.id===id);
const wallet=async id=>{const [[w]]=await db.execute('SELECT balance FROM market_wallets WHERE user_id=?',[id]);return Number(w.balance);};
async function cleanup() {
  await transact(async c=>{
    const [[r]]=await c.query('SELECT payload FROM market_application_state WHERE id=1 FOR UPDATE');
    if(r){const p=typeof r.payload==='string'?JSON.parse(r.payload):r.payload;const clean=withMarketStore(p,s=>{
      const ids=new Set(users.map(u=>u.id));
      s.users=s.users.filter(u=>!ids.has(u.id));s.listings=s.listings.filter(l=>!ids.has(l.sellerId));
      const orders=new Set(s.orders.filter(o=>ids.has(o.buyerId)||ids.has(o.sellerId)).map(o=>o.id));
      const chats=new Set(s.conversations.filter(o=>orders.has(o.orderId)).map(o=>o.id));
      s.orders=s.orders.filter(o=>!orders.has(o.id));s.conversations=s.conversations.filter(o=>!chats.has(o.id));s.messages=s.messages.filter(o=>!chats.has(o.conversationId));s.walletTransactions=s.walletTransactions.filter(o=>!ids.has(o.userId));s.supportTickets=s.supportTickets.filter(o=>!ids.has(o.userId));s.projectTasks=s.projectTasks.filter(o=>!ids.has(o.customerId)&&!ids.has(o.executorId));
    });await c.execute('UPDATE market_application_state SET payload=?,revision=revision+1 WHERE id=1',[JSON.stringify(clean.payload)]);}
    for(const u of users){await c.execute('DELETE FROM commerce_ledger WHERE user_id=?',[u.id]);await c.execute('DELETE FROM market_payments WHERE user_id=?',[u.id]);await c.execute('DELETE FROM market_wallets WHERE user_id=?',[u.id]);await c.execute('DELETE FROM users WHERE id=?',[u.id]);}
  });
}
try {
  for(let i=0;i<3;i++){const email=`${tag}-${i}@example.invalid`;const [r]=await db.execute("INSERT INTO users (username,email,password_hash,status) VALUES (?,?,?,'active')",[`${tag}-${i}`,email,qaHash]);users.push({id:String(r.insertId),email,username:`${tag}-${i}`});}
  const [buyer,seller,outsider]=users;process.env.ADMIN_EMAILS=(process.env.ADMIN_EMAILS||'')+','+outsider.email;
  const loginContext={ip:'127.0.0.1',userAgent:'Disposable market QA'};
  assert(await loginUser(buyer.email,qaPassword,loginContext));
  assert(await loginUser(buyer.username,qaPassword,loginContext));
  const categories=await op('getCatalogLibrary',[],null);assert.equal(categories.length,95);
  await assert.rejects(()=>op('getWalletOverview',[buyer.id],seller),e=>e.status===403);
  await assert.rejects(()=>op('getAdminDashboardData',[],buyer),e=>e.status===403);
  const payment=await op('createWalletTransactionRecord',[buyer.id,{type:'TOP_UP',amountRub:100,description:'QA payment proof'}],buyer);
  assert.equal(await wallet(buyer.id),0);await reviewPayment(outsider.id,payment.id,{status:'APPROVED',note:'QA simulated receipt'});
  const item=categories[0];const listing=await op('createListingRecord',[seller.id,{itemSlug:item.slug,sectionId:item.sections[0].id,title:'Disposable QA listing',description:'Disposable QA detailed listing for payment checks',priceRub:10.6,quantity:1,deliveryType:'AUTO',autoPayloads:['QA_PRIVATE_CODE'],deliveryNote:'QA_PRIVATE_INSTRUCTION',isActive:true}],seller);
  const pub=await op('getListingDetails',[item.slug,listing.listingId],null);assert.equal(JSON.stringify(pub).includes('QA_PRIVATE'),false);
  const attempts=await Promise.allSettled([1,2].map(()=>op('createPurchaseRecord',[buyer.id,{listingId:listing.listingId,quantity:1}],buyer)));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
  const purchase=attempts.find(a=>a.status==='fulfilled').value;
  assert.equal(await wallet(buyer.id),89.4);assert.equal(await wallet(seller.id),0);
  await assert.rejects(()=>op('getConversationDetails',[purchase.conversationId],outsider.id===buyer.id?buyer:{...buyer,id:'999999'}),e=>e.status===403);
  const chat=await op('getConversationDetails',[purchase.conversationId],buyer);assert(chat.messages.some(m=>m.text.includes('QA_PRIVATE_CODE')));
  await op('settleOrder',[purchase.orderId,'CLOSED'],buyer);assert.equal(await wallet(seller.id),10.6);
  await assert.rejects(()=>op('settleOrder',[purchase.orderId,'CLOSED'],buyer));assert.equal(await wallet(seller.id),10.6);
  const config=await op('getProjectFormConfig',[],buyer),platform=config.platforms[0],service=platform.services[0];
  const project=await op('createProjectRecord',[buyer.id,{platform:platform.id,serviceType:service.id,title:'Disposable QA project',description:'Detailed QA project',targetSource:'QA channel',targets:['target1','target2'],rewardPerTargetRub:5}],buyer);
  assert.equal(await wallet(buyer.id),79.4);await op('acceptProjectRecord',[seller.id,project.id],seller);
  await assert.rejects(()=>op('completeProjectRecord',[buyer.id,project.id],buyer));
  await op('updateProjectProgressRecord',[seller.id,project.id,2],seller);await op('completeProjectRecord',[buyer.id,project.id],buyer);assert.equal(await wallet(seller.id),20.6);
  await assert.rejects(()=>op('completeProjectRecord',[buyer.id,project.id],buyer));
  const withdrawal=await op('createWalletTransactionRecord',[buyer.id,{type:'WITHDRAWAL',amountRub:5,description:'QA withdrawal destination'}],buyer);assert.equal(await wallet(buyer.id),74.4);
  await reviewPayment(outsider.id,withdrawal.id,{status:'REJECTED',note:'QA return reserve'});assert.equal((await op('getWalletOverview',[buyer.id],buyer)).availableRub,79.4);
  await op('createSupportTicketRecord',[buyer.id,'QA support','QA support details'],buyer);assert.equal((await op('getSupportOverview',[buyer.id],buyer)).tickets.length,1);
  if(process.env.MARKET_UI_FIXTURE){writeFileSync(process.env.MARKET_UI_FIXTURE,JSON.stringify({users:users.map(u=>({...u,token:signAccessToken({userId:Number(u.id),tokenVersion:0})})),qaPassword,itemSlug:item.slug,listingId:listing.listingId,conversationId:purchase.conversationId,projectId:project.id}),{mode:0o600});console.log('UI fixture ready; press Enter after browser checks.');await new Promise(resolve=>process.stdin.once('data',resolve));process.stdin.pause();}
  console.log('Market: catalog, access, private delivery, stock race, exact reserve/payout, projects, payment approval/rejection, support PASS');
} finally {await cleanup();await db.end();}
