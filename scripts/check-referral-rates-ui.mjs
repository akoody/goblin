import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const email=(fs.readFileSync('.env','utf8').match(/^VITE_ADMIN_EMAILS=(.*)$/m)?.[1]||'').replace(/^['"]|['"]$/g,'').split(/[,;\n]/)[0].trim();
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(()=>localStorage.setItem('token','qa-referral-rates'));
  const page=await context.newPage(),errors=[],writes=[];let accept=false,helper=false,rate='50.00',overrides=new Map([[1,'0.00']]);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept():d.dismiss());
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname;
   if(!/^\/(api|admin|support|payment-methods|referrals|wallets|deal|order|exchange)\//.test(p))return route.continue();
   let data=[];
   if(p==='/admin/access')data={role:helper?'helper':'admin',permissions:helper?['referrals']:[]};
   if(p==='/api/auth/me')data={id:1,email,username:'QA',wallets:[]};
   if(p==='/api/market-app/session')data={token:null};
   if(p==='/api/features'||p==='/admin/features')data={p2p:true,processing:true,nft:true,market:true,guarantor:true};
   if(p==='/admin/login-ips')data={rows:[],unread:0};
   if(p==='/admin/referral-policy'){
    if(req.method()==='PATCH'){const b=req.postDataJSON();writes.push({path:p,...b});rate=Number(b.ratePercent).toFixed(2);if(b.resetOverrides)overrides.clear();}
    data={ratePercent:rate,basis:'PLATFORM_COMMISSION'};
   }
   if(p==='/admin/referral-rates'){
    const b=req.postDataJSON();writes.push({path:p,...b});for(const id of b.userIds){if(b.ratePercent===null)overrides.delete(id);else overrides.set(id,Number(b.ratePercent).toFixed(2));}data={updated:b.userIds.length,ratePercent:b.ratePercent};
   }
   if(p==='/admin/referrals'){
    const n=Number(url.searchParams.get('page')||1);data={page:n,total:30,rows:Array.from({length:n===1?25:5},(_,i)=>{const id=(n-1)*25+i+1;return {id,username:'qa-user-'+id,email:`qa-${id}@example.invalid`,status:'active',code:'QA'+id,invitedCount:0,amounts:[],customRatePercent:overrides.get(id)??null,effectiveRatePercent:overrides.get(id)??rate,defaultRatePercent:rate};})};
   }
   if(p==='/referrals/me')data={code:'QA1',ratePercent:'0.00',customRatePercent:'0.00',defaultRatePercent:'50.00',invitedUsers:[],invitedCount:0,rewardBalances:[{currency:'BTC',amount:'0.00000001'},{currency:'USDT',amount:'1.000000'}],accrualEnabled:true};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:5187/admin');await page.getByRole('button',{name:'Приглашения',exact:true}).click();
  await page.getByLabel('Выбрать пользователя 2',{exact:true}).check();
  await page.getByRole('button',{name:'Далее',exact:true}).click();await page.getByLabel('Выбрать пользователя 26',{exact:true}).check();
  await page.getByLabel('Ставка выбранным, %',{exact:true}).fill('75');
  await page.getByRole('button',{name:'Применить выбранным (2)',exact:true}).click();assert.equal(writes.length,0);
  accept=true;await page.getByRole('button',{name:'Применить выбранным (2)',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Настройки процентов сохранены'}).waitFor();assert.deepEqual(writes[0].userIds,[2,26]);
  assert.equal(writes[0].ratePercent,'75');
  await page.getByLabel('Общая ставка, %',{exact:true}).fill('60');await page.getByRole('button',{name:'Сохранить общую ставку',exact:true}).click();
  await page.waitForResponse(r=>r.url().includes('/admin/referrals?')&&r.status()===200);
  assert.equal(overrides.get(26),'75.00');assert.equal(rate,'60.00');assert.equal(writes[1].resetOverrides,false);
  await page.getByRole('button',{name:'Вернуть выбранным общую ставку',exact:true}).click();
  await page.waitForResponse(r=>r.url().includes('/admin/referrals?')&&r.status()===200);assert.equal(overrides.has(26),false);assert.equal(writes[2].ratePercent,null);
  await page.getByLabel('Общая ставка, %',{exact:true}).fill('80');await page.getByRole('button',{name:'Применить всем, сбросив индивидуальные',exact:true}).click();
  await page.waitForResponse(r=>r.url().includes('/admin/referrals?')&&r.status()===200);assert.equal(overrides.size,0);assert.equal(writes[3].resetOverrides,true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(width===390)await page.screenshot({path:'/tmp/goblin-referral-rates-390.png'});
  helper=true;await page.reload();await page.getByRole('heading',{name:'Реферальные приглашения',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Проценты от дохода биржи',exact:true}).count(),0);assert.equal(await page.getByRole('checkbox').count(),0);
  await page.goto('http://127.0.0.1:5187/me?section=referral');await page.getByText('0.00%',{exact:true}).waitFor();await page.getByText('0,00000001 BTC',{exact:true}).waitFor();await page.getByText('1 USDT',{exact:true}).waitFor();
  await page.getByText('Вознаграждения автоматически поступают',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(errors.length,0,errors.join('\n'));await context.close();
  console.log(`Referral controls passed at ${width}px`);
 }
 console.log('PASS default, selected across pages, override reset, all-users reset, canceled saves, helper read-only, profile zero rate and currency separation (mocked API)');
}finally{await browser.close();}
