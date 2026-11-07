import { chromium } from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.DESIGN_UI_BASE||'http://127.0.0.1:5178';
const email=(fs.readFileSync('.env','utf8').match(/^VITE_ADMIN_EMAILS=(.*)$/m)?.[1]||'').replace(/^['"]|['"]$/g,'').split(/[,;\n]/)[0].trim();
const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({userId:1,email,exp:9999999999})).toString('base64url')+'.mock';
const wallets=['USDT','BTC','ETH','TRX'].map((currency,index)=>({id:index+1,currency,balance:currency==='USDT'?'123.456789':'0.00012345',locked_balance:'0',network:{network:'TRON',standard:'TRC-20'},processing:{depositsEnabled:false,withdrawalsEnabled:false}}));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
let checks=0;const failures=[];
try{
 for(const width of [320,390,768,1024,1440,1920])for(const authenticated of [false,true]){
  const context=await browser.newContext({viewport:{width,height:960}});
  context.setDefaultTimeout(10000);
  if(authenticated)await context.addInitScript(value=>localStorage.setItem('token',value),token);
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   if(route.request().isNavigationRequest() && url.origin===new URL(base).origin)return route.continue();
   if(!/^\/(api|auth|admin|order|deal|payment-methods|wallets|referrals|support|processing|exchange|nft)(\/|$)/.test(path)||url.port==='5178'&&['/admin','/order','/deal','/processing'].includes(path))return route.continue();
   let data=[];
   if(path==='/api/market-app/session')data={token:null};
   if(path==='/api/auth/me')data={id:1,userId:1,username:'QA User',email,wallets};
   if(path==='/api/features'||path==='/admin/features')data={p2p:true,market:true,guarantor:true,nft:true,processing:true};
   if(path==='/api/transactions/balance')data={generalBalance:'123.45',wallets,USDT:'123.456789',BTC:'0.00012345',depositPolicy:{feeUsd:'2',minUsd:'5'}};
   if(path.startsWith('/exchange/market/'))data={price:'83421.75',change24h:1.24,source:'Binance',candles:Array.from({length:48},(_,i)=>({close:83000+Math.sin(i/4)*300+i*8})),book:{asks:[{price:'83425.00',quantity:'0.0123'},{price:'83424.50',quantity:'0.1234'}],bids:[{price:'83421.00',quantity:'0.0321'},{price:'83420.50',quantity:'0.1234'}]}};
   if(path.startsWith('/exchange/market/'))data.depth=data.book;
   if(path==='/exchange/state')data={book:{asks:[],bids:[]},orders:[],fills:[],wallets:wallets.map(w=>({...w,available:w.balance})),positions:[],funding:{}};
   if(path==='/admin/login-ips')data={rows:[],total:0,unread:0};
   if(path==='/api/commerce/me')data={user:{id:1,username:'QA User'},availableUsdt:'123.456789',rubBalance:'1000',held:{rub:'0',usdt:'0'},deals:[],listings:[],payments:[],history:[]};
   if(path==='/referrals/me')data={code:'GBL000001',ratePercent:10,rewardTotal:0,invitedCount:0,invitedUsers:[]};
   if(path==='/admin/deposit-compliance')data={policy:{feeUsd:'2',minUsd:'5'},balances:[{currency:'USDT',balance:'2'}],deposits:[],ledger:[],pending:0};
   if(path==='/admin/referrals')data={rows:[],page:1,pageSize:25,total:0};
   if(path==='/order/42')data={id:42,type:'SELL',status:'pending',price:'95.50',amount:'100',filled_amount:'0',available_amount:'100',min_limit:'500',max_limit:'9550',payment_methods:['sber'],user:{id:2,username:'Продавец',email:'seller@example.test'}};
   if(path==='/deal/42')data={id:42,status:'AWAITING_PAYMENT',crypto_amount:'10',fiat_amount:'955',price:'95.50',payment_method:'sber',buyer:{id:1,username:'Покупатель'},seller:{id:2,username:'Продавец'},order:{id:42,type:'SELL',amount:'100',price:'95.50',payment_methods:['sber']}};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const paths=authenticated?['/','/trade','/p2p/orders','/order/42','/deal/42','/guarantor','/me','/p2p/profile','/p2p/my-deals','/p2p/my-offers','/p2p/create-order','/help','/processing','/nft-gifts','/admin']:['/','/trade','/p2p/orders','/guarantor','/login','/signin','/reset-pass','/download'];
  for(const path of paths){
   await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForTimeout(450);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))failures.push(`${width} ${authenticated} ${path}: overflow`);
   if(!await page.locator('body').innerText())failures.push(`${width} ${path}: empty`);
   const invisibleControls=await page.locator('button,a').evaluateAll(elements=>elements.filter(element=>{
     const style=getComputedStyle(element),box=element.getBoundingClientRect();
     if(!box.width||!box.height||!element.textContent.trim())return false;
     const color=style.color.match(/\d+/g)?.map(Number),background=style.backgroundColor.match(/[\d.]+/g)?.map(Number);
     return color?.slice(0,3).every(value=>value>240)&&background?.slice(0,3).every(value=>value>240)&&background[3]!==0;
   }).map(element=>element.textContent.trim().slice(0,60)));
   if(invisibleControls.length)failures.push(`${width} ${path}: white controls ${invisibleControls.join(', ')}`);
   if(path==='/trade'){
    await page.getByRole('button',{name:/Выбрать цену продажи/}).first().click();
    assert.equal(await page.locator('input[inputmode="decimal"]').first().inputValue(),'83424.50');
    await page.getByRole('button',{name:'Фьючерсы',exact:true}).click();
    await page.getByRole('button',{name:'Лонг',exact:true}).waitFor();
   }
   checks++;
   if([390,1440].includes(width)&&['/','/trade','/me','/login','/p2p/orders','/admin'].includes(path))await page.screenshot({path:`/tmp/goblin-design-${width}-${authenticated?'member':'guest'}-${path==='/'?'home':path.replaceAll('/','_')}.png`,fullPage:true});
  }
  if(authenticated){
   for(const name of ['Безопасность','Доступность','Кошелёк и AML','Приглашения']){
    await page.getByRole('button',{name:new RegExp('^'+name)}).click();await page.waitForTimeout(350);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))failures.push(`${width} admin ${name}: overflow`);
    checks++;
   }
  }
  await page.goto(base+'/');await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
  await page.locator('#site-menu').getByRole('link',{name:'Помощь',exact:true}).waitFor({state:'visible'});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#site-menu').isVisible(),false);
  await page.getByRole('button',{name:'Открыть профиль',exact:true}).click();
  await page.getByRole('navigation',{name:authenticated?'Мобильное меню аккаунта':undefined}).count();
  if(!authenticated)await page.getByRole('link',{name:'Создать аккаунт',exact:true}).last().waitFor({state:'visible'});
  failures.push(...errors.map(message=>`${width} ${authenticated}: ${message}`));
  console.log(`Checked ${width}px ${authenticated?'account':'guest'}`);
  await context.close();
 }
 assert.deepEqual(failures,[]);console.log(`PASS ${checks} route/viewport/state checks, navigation menus and screenshots (mock API; no financial writes).`);
}finally{await browser.close();}
