import assert from 'node:assert/strict';
import http from 'node:http';
import * as domain from '../backend/market-runtime/db.js';
import { chromium } from 'playwright-core';

let payload=domain.createProductionStore();
const attempts=[];
const users=[{id:'owner',name:'QA admin',email:'owner@example.invalid',role:'ADMIN'},{id:'customer',name:'QA customer',email:'customer@example.invalid',role:'CUSTOMER'}]
  .map(user=>({...user,preferredCurrency:'RUB',createdAt:new Date(),updatedAt:new Date()}));
const fresh=()=>{payload=domain.createProductionStore();payload.users=structuredClone(users);};fresh();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/market-app/availability')return res.end('{"enabled":true}');
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw||'{}');
  if(req.url==='/auth/login') {
    attempts.push(body.username);
    const valid=body.password==='TestPassword123'&&['QaMixedNick','customer@example.invalid'].includes(body.username);
    res.statusCode=valid?200:401;return res.end(JSON.stringify(valid?{access_token:'qa-customer'}:{message:'Invalid credentials'}));
  }
  assert.equal(req.url,'/api/market-app/rpc');
  const {operation,args=[]}=body,token=String(req.headers.authorization||'').replace(/^Bearer /,'');
  const user=token==='qa-owner'?users[0]:token==='qa-customer'?users[1]:null;
  if(operation==='currentUser')return res.end(JSON.stringify({result:user}));
  assert(['getCatalogLibrary','getCatalogItemBySlug','getListingDetails',...(user?.role==='ADMIN'?['getAdminDashboardData','createCatalogItemRecord','createCatalogSectionRecord']:[]),...(user?['getWalletOverview']:[])].includes(operation),operation);
  const wrapped=domain.withMarketStore(payload,()=>domain[operation](...args));payload=wrapped.payload;
  return res.end(JSON.stringify({result:wrapped.result??null}));
});
await new Promise(resolve=>server.listen(5198,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.MARKET_EMPTY_UI_BASE||'http://127.0.0.1:5189';
try {
  for(const width of [320,390,768,1440]) {
    fresh();const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    for(const part of ['accounts','services']) {
      assert.equal((await page.goto(`${base}/market?part=${part}`)).status(),200);
      await page.getByRole('status').filter({hasText:'Каталог пока пуст. Категории добавляет администратор.'}).waitFor();
      assert.equal(await page.getByRole('region',{name:'Популярные категории'}).count(),0);
    }
    assert.equal((await page.goto(base+'/market/catalog/steam?part=accounts')).status(),404);
    for(const identifier of ['QaMixedNick','CUSTOMER@EXAMPLE.INVALID']) {
      await context.clearCookies();await page.goto(base+'/market/login');
      const login=page.getByLabel('Логин или email',{exact:true});assert.equal(await login.getAttribute('type'),'text');
      await login.fill(identifier);await page.getByLabel('Пароль',{exact:true}).fill('wrong');
      await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByRole('alert').filter({hasText:'Неверный логин/email или пароль.'}).waitFor();
      await page.getByLabel('Пароль',{exact:true}).fill('TestPassword123');
      await page.getByRole('button',{name:'Войти',exact:true}).click();
      try{await page.waitForURL(url=>url.pathname==='/market'||url.pathname==='/market/');}
      catch(error){console.error(JSON.stringify({url:page.url(),alerts:await page.getByRole('alert').allTextContents(),attempts,cookies:(await context.cookies()).map(({name,path,secure})=>({name,path,secure})),errors}));throw error;}
      const cookie=(await context.cookies()).find(cookie=>cookie.name==='goblin_market_session');assert(cookie?.httpOnly);assert.equal(cookie.value,'qa-customer');
      assert.equal(attempts.at(-1),identifier.includes('@')?identifier.toLowerCase():identifier);
    }
    await context.clearCookies();await context.addCookies([{name:'goblin_market_session',value:'qa-owner',domain:'127.0.0.1',path:'/',httpOnly:true}]);
    await page.goto(base+'/market/admin');
    assert.equal(await page.getByRole('button',{name:'Добавить подкатегорию',exact:true}).isDisabled(),true);
    const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Добавить категорию маркета'})});
    await form.getByLabel('Название категории маркета',{exact:true}).fill('Категория администратора');
    await form.locator('select[name="area"]').selectOption('services');await form.getByRole('button',{name:'Добавить в каталог'}).click();
    await page.getByRole('status').filter({hasText:'Категория добавлена в выбранный раздел'}).waitFor();assert.equal(payload.catalogItems.length,1);
    await page.goto(base+'/market?part=services');await page.getByRole('link',{name:'Категория администратора',exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    if(width===390)await page.screenshot({path:'/tmp/goblin-market-empty-new-category-390.png',fullPage:true});
    assert.equal(errors.length,0,errors.join('\n'));await context.close();console.log(`Empty catalog, admin creation and direct username/email login passed at ${width}px`);
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
