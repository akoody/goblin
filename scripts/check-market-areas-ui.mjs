import assert from 'node:assert/strict';
import http from 'node:http';
import * as domain from '../backend/market-runtime/db.js';
import {chromium} from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

let payload=domain.createProductionStore();let slug;
payload=domain.withMarketStore(payload,store=>{
  store.users=[{id:'1',name:'QA seller',email:'qa-seller@example.invalid',role:'CUSTOMER',preferredCurrency:'RUB',createdAt:new Date(),updatedAt:new Date()}];
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
  if(operation==='currentUser')return res.end(JSON.stringify({result:null}));
  assert(['getCatalogLibrary','getCatalogItemBySlug','getListingDetails'].includes(operation),operation);
  const result=domain.withMarketStore(payload,()=>domain[operation](...args)).result;
  res.end(JSON.stringify({result}));
});
await new Promise(resolve=>server.listen(5199,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
  for(const width of [320,390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const [part,title,listing,other] of [['accounts','Маркет аккаунтов','QA account listing','QA service listing'],['services','Маркет услуг','QA service listing','QA account listing']]){
      const response=await page.goto(`http://127.0.0.1:5188/market?part=${part}`);assert.equal(response.status(),200);
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      assert(await page.getByRole('navigation',{name:'Разделы маркета'}).getByRole('link',{name:part==='accounts'?'Аккаунты':'Услуги',exact:true}).getAttribute('aria-current'));
      await page.goto(`http://127.0.0.1:5188/market/catalog/${slug}?part=${part}`);
      await page.getByText(listing,{exact:true}).waitFor();assert.equal(await page.getByText(other,{exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${part} at ${width}`);
    }
    assert.equal(errors.length,0,errors.join('\n'));await page.close();
  }
  console.log('PASS market Accounts/Services navigation, isolated listings, search context and layout at 320/390/768/1440px (fixture RPC, no real funds)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
