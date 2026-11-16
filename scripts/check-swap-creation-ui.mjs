import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base=process.env.SWAP_UI_BASE||'http://127.0.0.1:5188';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(()=>localStorage.setItem('token','swap-ui-test'));
  const page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(!url.pathname.startsWith('/api/')&&url.port!=='3000')return route.continue();
   if(request.method()!=='GET')writes.push(url.pathname);
   let data=[];
   if(url.pathname==='/api/auth/me')data={id:1,username:'QA',wallets:[],staffAccess:{role:'user'}};
   if(url.pathname==='/api/pump/state')data={ready:true,policy:{service_fee_sol:'1',minimum_buy_sol:'0.2',network_budget_sol:'0.05'},launches:[]};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  for(const path of ['/swap','/swap/create','/swap/tron','/create-coin']){
   await page.goto(base+path);
   await page.getByLabel('Название',{exact:true}).waitFor();
   assert.equal(new URL(page.url()).pathname,'/swap');
   assert.equal(await page.getByText('Обмен Solana',{exact:true}).count(),0);
   assert.equal(await page.getByText('Обмен TRON',{exact:true}).count(),0);
   await page.getByRole('button',{name:'Создать свой мемкоин',exact:true}).click();
   assert.equal(await page.getByLabel('Название',{exact:true}).evaluate(input=>input===document.activeElement),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow ${width}: ${path}`);
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[],'Navigation must not create drafts or execute launches');
  await context.close();
  console.log(`Swap routes and creation focus passed at ${width}px`);
 }
}finally{await browser.close();}
