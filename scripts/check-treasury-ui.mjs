import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const email=(fs.readFileSync('.env','utf8').match(/^VITE_ADMIN_EMAILS=(.*)$/m)?.[1]||'').replace(/^['"]|['"]$/g,'').split(/[,;\n]/)[0].trim();
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const width of [320,390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(()=>localStorage.setItem('token','qa-only'));
 const page=await context.newPage(),errors=[],writes=[];let accept=false;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>accept?dialog.accept():dialog.dismiss());
 await page.route('**/*',async route=>{
  const request=route.request(),p=new URL(request.url()).pathname;
  if(new URL(request.url()).port!=='3000'&&!p.startsWith('/api/'))return route.continue();
  let data=[];
  if(request.method()!=='GET')writes.push(p);
  if(p==='/api/auth/me')data={id:1,email,username:'QA',wallets:[],staffAccess:{role:'admin'}};
  if(p==='/admin/access')data={role:'admin',permissions:[]};
  if(p==='/api/features')data={p2p:true,guarantor:true};
  if(p==='/admin/treasury')data={paused:false,jobs:[],assets:['USDT','SOL','BTC','ETH'].map(currency=>({currency,network:{USDT:'TRON',SOL:'SOLANA',BTC:'BTC',ETH:'ETH'}[currency],address:'QA-Vault-Address',available:'10',collected:'10',bookBalance:'10',spent:'0',reserved:'0',gasBalance:'100',policy:{mode:'manual',destination:'QA-External-Address',threshold_amount:'5',maximum_amount:'100',maximum_fee:'1',gas_reserve:'0',cooldown_seconds:60}}))};
  if(p==='/admin/treasury/USDT/preview')data={id:'qa',currency:'USDT',status:'preview',destination:'QA-External-Address',gross_amount:'5',received_amount:'5',fee_budget:'1',expires_at:new Date(Date.now()+60000).toISOString()};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:5188/admin');await page.getByRole('button',{name:'Кошелёк и AML',exact:true}).click();
 await page.getByRole('heading',{name:'Казна и вывод комиссий',exact:true}).waitFor();
 assert.equal(await page.getByText('Настройки автовывода комиссий',{exact:true}).count(),0);
 const asset=page.getByRole('heading',{name:'USDT · TRON',exact:true}).locator('..');
 await asset.locator('input').last().fill('5');
 await asset.getByRole('button',{name:'Рассчитать ручной вывод'}).click();
 await asset.getByRole('heading',{name:'Подтверждение вывода'}).waitFor();
 await asset.getByRole('button',{name:'Подтвердить вывод средств'}).click();assert(!writes.some(path=>path.endsWith('/execute')));
 accept=true;await asset.getByRole('button',{name:'Подтвердить вывод средств'}).click();
 await page.getByText('Транзакция подготовлена. Результат смотрите в истории, не повторяйте перевод.',{exact:true}).waitFor();
 assert.equal(writes.filter(path=>path.endsWith('/execute')).length,1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(errors,[]);await context.close();console.log(`Treasury UI passed at ${width}px, fake transport only`);
}}finally{await browser.close();}
