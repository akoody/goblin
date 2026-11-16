import assert from 'node:assert/strict';
import http from 'node:http';
import * as domain from '../backend/market-runtime/db.js';
import {populatedMarketFixture} from '../backend/test/fixtures/market-store.js';
import { chromium } from 'playwright-core';

let payload=populatedMarketFixture();let slug;
const popularity=new Map(payload.catalogItems.slice(1,4).map((item,index)=>[item.slug,{accounts:10-index,services:10-index}]));
payload=domain.withMarketStore(payload,store=>{
  store.users=[{id:'1',name:'QA seller',email:'qa-seller@example.invalid',role:'CUSTOMER',preferredCurrency:'RUB',createdAt:new Date(),updatedAt:new Date()},{id:'qa-admin',name:'QA admin',email:'qa-admin@example.invalid',role:'ADMIN',preferredCurrency:'RUB',createdAt:new Date(),updatedAt:new Date()}];
  const item=store.catalogItems[0];slug=item.slug;
  for(const [section,title] of [[item.sections.find(s=>s.name==='Аккаунты'),'QA account listing'],[item.sections.find(s=>s.name==='Услуги'),'QA service listing']]){
    assert(section);domain.createListingRecord('1',{itemSlug:item.slug,sectionId:section.id,title,description:'A detailed description of a synthetic test listing only',priceRub:10,quantity:1,deliveryType:'MANUAL',isActive:true});
  }
}).payload;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/market-app/availability')return res.end(JSON.stringify({enabled:true,administrator:false}));
  let raw='';for await(const chunk of req)raw+=chunk;
  const {operation,args=[]}=JSON.parse(raw||'{}');
  const admin=req.headers.authorization==='Bearer qa-admin';
  if(operation==='currentUser')return res.end(JSON.stringify({result:admin?payload.users.find(u=>u.id==='qa-admin'):null}));
  assert(['getCatalogLibrary','getCatalogItemBySlug','getListingDetails',...(admin?['getAdminDashboardData','createCatalogItemRecord','createCatalogSectionRecord','updateCatalogAvailabilityRecord']:[])].includes(operation),operation);
  let result;
  try{const wrapped=domain.withMarketStore(payload,()=>domain[operation](...args));payload=wrapped.payload;result=wrapped.result;}
  catch(error){res.statusCode=400;return res.end(JSON.stringify({code:error.message}));}
  if(operation==='getCatalogLibrary')result=result.map(item=>({...item,visitCounts:popularity.get(item.slug)||{accounts:0,services:0}}));
  res.end(JSON.stringify({result:result??null}));
});
await new Promise(resolve=>server.listen(5199,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
  for(const width of [320,390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/market-app/catalog-visits',route=>route.fulfill({status:200,contentType:'application/json',body:'{"counted":true}'}));
    for(const [part,title,listing,other] of [['accounts','Маркет аккаунтов','QA account listing','QA service listing'],['services','Маркет услуг','QA service listing','QA account listing']]){
      const response=await page.goto(`http://127.0.0.1:5188/market?part=${part}`);assert.equal(response.status(),200);
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      const popular=page.getByRole('region',{name:'Популярные категории',exact:true});
      assert.deepEqual(await popular.getByRole('link').allTextContents(),payload.catalogItems.filter(item=>popularity.has(item.slug)).sort((a,b)=>popularity.get(b.slug)[part]-popularity.get(a.slug)[part]).map(item=>item.name));
      for(const topSlug of popularity.keys())assert.equal(await page.locator(`section[id^="section-"] a[href*="/catalog/${topSlug}?"]`).count(),0);
      assert(await page.getByRole('navigation',{name:'Разделы маркета'}).getByRole('link',{name:part==='accounts'?'Аккаунты':'Услуги',exact:true}).getAttribute('aria-current'));
      await page.goto(`http://127.0.0.1:5188/market/catalog/${slug}?part=${part}`);
      await page.getByText(listing,{exact:true}).waitFor();assert.equal(await page.getByText(other,{exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${part} at ${width}`);
    }
    assert.equal(errors.length,0,errors.join('\n'));await page.close();
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.addCookies([{name:'goblin_market_session',value:'qa-admin',domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}]);
    const admin=await context.newPage(),adminErrors=[];admin.on('pageerror',e=>adminErrors.push(e.message));
    admin.on('dialog',dialog=>dialog.accept());
    await admin.route('**/api/market-app/catalog-visits',route=>route.fulfill({status:200,contentType:'application/json',body:'{"counted":true}'}));
    await admin.goto('http://127.0.0.1:5188/market/admin');
    const form=admin.locator('form').filter({has:admin.getByRole('heading',{name:'Добавить категорию маркета',exact:true})});
    const name=`QA Services ${width}`;
    await form.locator('select[name="area"]').selectOption('services');
    await form.getByLabel('Название категории маркета',{exact:true}).fill(name);
    await form.getByLabel('Тип категории',{exact:true}).fill(`Свой тип ${width}`);
    await form.getByLabel('Группа',{exact:true}).fill(`Своя группа ${width}`);
    await form.getByRole('button',{name:'Добавить в каталог',exact:true}).click();
    await admin.getByRole('status').filter({hasText:'Категория добавлена в выбранный раздел'}).waitFor();
    const created=payload.catalogItems.find(item=>item.name===name);assert(created);assert.deepEqual(created.sections.map(s=>s.name),['Услуги']);
    assert.equal(created.kind,`Свой тип ${width}`);assert.equal(created.family,`Своя группа ${width}`);
    assert.equal(await admin.locator(`#catalog-kinds option[value="Свой тип ${width}"]`).count(),1);
    assert.equal(await admin.getByText('Доступность услуг по платформам',{exact:true}).count(),0);
    const sectionForm=admin.locator('form').filter({has:admin.getByRole('button',{name:'Добавить подкатегорию',exact:true})});
    await sectionForm.locator('select[name="itemId"]').selectOption(created.id);
    await sectionForm.getByLabel('Название подкатегории',{exact:true}).fill(`QA Profiles ${width}`);
    await sectionForm.locator('select[name="area"]').selectOption('accounts');
    await sectionForm.getByRole('button',{name:'Добавить подкатегорию',exact:true}).click();
    await admin.getByRole('status').filter({hasText:'Подкатегория добавлена в выбранный раздел'}).waitFor();
    assert.equal(payload.catalogItems.find(item=>item.id===created.id).sections.find(s=>s.name===`QA Profiles ${width}`).area,'accounts');
    const availability=admin.getByRole('region',{name:'Доступность аккаунтов',exact:true}).locator('form').filter({has:admin.getByRole('heading',{name,exact:true})});
    await availability.getByLabel('Категория доступна',{exact:true}).uncheck();
    await availability.getByRole('button',{name:'Сохранить доступность',exact:true}).click();
    await admin.getByRole('status').filter({hasText:'Доступность сохранена'}).waitFor();
    assert.equal(payload.catalogItems.find(item=>item.id===created.id).availability.accounts,false);
    const visible=domain.withMarketStore(payload,()=>domain.getCatalogLibrary()).result.find(item=>item.id===created.id);
    assert(visible.sections.every(section=>domainSectionArea(section)==='services'));
    assert.equal(await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    if(width===390)await form.screenshot({path:'/tmp/goblin-market-admin-catalog-390.png'});
    assert.equal(adminErrors.length,0,adminErrors.join('\n'));await context.close();
  }
  console.log('PASS market manual taxonomy, reusable suggestions, split catalog availability, area controls, search and layout at 320/390/768/1440px (fixture RPC, no real funds)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

function domainSectionArea(section){return section.area??(/^(аккаунт[ыа]?|accounts?)$/i.test(section.name)?'accounts':'services');}
