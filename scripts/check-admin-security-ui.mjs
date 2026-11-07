import {chromium} from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const email=(fs.readFileSync('.env','utf8').match(/^VITE_ADMIN_EMAILS=(.*)$/m)?.[1]||'').replace(/^['"]|['"]$/g,'').split(/[,;\n]/)[0].trim();
assert(email,'Admin frontend configuration missing');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.ADMIN_UI_BASE||'http://localhost:5178';
try{for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(()=>localStorage.setItem('token','mock-admin-ui'));
  const page=await context.newPage(),errors=[],queries=[],features={p2p:true,processing:true,nft:true,market:true,guarantor:true};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    if(!/^\/(admin|api|support|payment-methods|wallets|referrals|processing|exchange|order|deal)\//.test(path))return route.continue();
    let data=[];
    if(path==='/api/market-app/session')data={token:null};
    if(path==='/api/auth/me')data={id:1,email,username:'QA admin',wallets:[]};
    if(path==='/api/features'||path==='/admin/features')data=features;
    if(path.startsWith('/admin/features/')){features[path.split('/').pop()]=route.request().postDataJSON().enabled;data=features;}
    if(path==='/admin/login-ips'){
      const q=url.searchParams.get('q')||'';queries.push(q);data={unread:1,total:q==='missing'?0:1,rows:q==='missing'?[]:[{id:1,user_id:22,username:'kolpikl',ip:'176.210.103.46',device:'Android-телефон',os:'Android',browser:'Chrome',is_new_ip:1,first_seen_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),login_count:1}]};
    }
    if(path==='/admin/deposit-compliance')data={policy:{feeUsd:'2.00',minUsd:'5.00'},balances:[{currency:'USDT',balance:'2.000000'}],pending:1,ledger:[],deposits:[{id:1,user_id:22,username:'QA user',amount:'5',currency:'USDT',fee_usd:'2',status:'PENDING_AML',tx_hash:'qa-hash-only'}]};
    if(path==='/admin/deposit-compliance/policy')data={feeUsd:route.request().postDataJSON().feeUsd};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'/admin');await page.getByRole('button',{name:/Безопасность/}).click();
  const search=page.getByRole('searchbox',{name:'Поиск по истории входов'}),searched=page.waitForResponse(r=>new URL(r.url()).pathname==='/admin/login-ips'&&new URL(r.url()).searchParams.get('q')==='176.210');
  await search.fill('176.210');await searched;assert(queries.includes('176.210'));
  await search.fill('missing');await page.getByText('По вашему запросу входов не найдено.').waitFor();await search.fill('');await page.getByText('kolpikl · #22').waitFor();
  await page.getByRole('button',{name:'Доступность',exact:true}).click();
  for(const label of ['Маркет','Гарант']){await page.getByRole('button',{name:'Отключить '+label,exact:true}).click();await page.getByRole('button',{name:'Включить '+label,exact:true}).waitFor();await page.getByRole('button',{name:'Включить '+label,exact:true}).click();await page.getByRole('button',{name:'Отключить '+label,exact:true}).waitFor();}
  await page.getByRole('button',{name:'Кошелёк и AML',exact:true}).click();await page.getByRole('heading',{name:'Общий кошелёк администраторов'}).waitFor();await page.getByRole('spinbutton',{name:'Комиссия за пополнение'}).fill('1.50');await page.getByRole('button',{name:'Сохранить комиссию'}).click();await page.getByRole('button',{name:'Проверить #1'}).click();await page.getByRole('button',{name:'Подтвердить по отчёту'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(errors.length,0,errors.join('\n'));await context.close();
}console.log('PASS admin search, commerce switches, treasury fee form and AML review at 320/390/768/1440px (mocked API)');}finally{await browser.close();}
