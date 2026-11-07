import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium } from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const user={id:'qa-design-user',name:'Проверка интерфейса',email:'design@example.test',role:'BOTH',bio:null,city:null,preferredCurrency:'RUB',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const operations=[];
const fixture=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/market-app/availability'){res.end(JSON.stringify({enabled:true}));return;}
 let raw='';for await(const part of req)raw+=part;
 try{
  const {operation,args}=JSON.parse(raw);operations.push(operation);
  let result=[];
  if(operation==='currentUser')result=user;
  else if(['getCatalogLibrary','getCatalogItemBySlug'].includes(operation)){
   const remote=await fetch('https://cryptogoblin.ru/api/market-app/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,args})});
   const body=await remote.json();if(!remote.ok)throw Error(body.message);result=body.result;
  }
  else if(operation==='getWalletOverview')result={availableRub:1234.56,transactions:[]};
  else if(operation==='getUserProfileData')result={user,stats:{purchases:0,sales:0,chats:0,activeListings:0,activeProjects:0,totalTurnoverRub:0},recentPurchases:[],recentSales:[],tickets:[]};
  else if(operation==='getSupportOverview')result={tickets:[],openCount:0,answeredCount:0};
  else if(operation==='getProjectFormConfig')result={platforms:[]};
  else if(!['listUserOrders','listUserConversations','listProjectTasks'].includes(operation))throw Error('Unexpected operation '+operation);
  res.end(JSON.stringify({result}));
 }catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}
});
fixture.listen(5191,'127.0.0.1');await once(fixture,'listening');
const server=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','5182'],{cwd:'apps/market',env:{...process.env,MARKET_BACKEND_ORIGIN:'http://127.0.0.1:5191'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
let browser;let count=0;
try{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:5182/market')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext();
 await context.addCookies([{name:'goblin_market_session',value:'mock-design-only',domain:'127.0.0.1',path:'/'}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const library=await fetch('https://cryptogoblin.ru/api/market-app/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'getCatalogLibrary',args:[]})}).then(response=>response.json());
 const slug=library.result?.[0]?.slug;assert(slug);
 for(const width of [320,390,768,1024,1440,1920]){
  await page.setViewportSize({width,height:960});
  for(const path of ['','/catalog/'+slug,'/catalog/'+slug+'/sell','/purchases','/sales','/chats','/wallet','/profile','/settings','/support','/projects']){
   const response=await page.goto('http://127.0.0.1:5182/market'+path);await page.waitForTimeout(100);
   assert(response.status()<400,`${width} ${path}: HTTP ${response.status()}`);
   assert(!(await page.locator('body').innerText()).includes('Application error'),path);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width} ${path}: overflow`);
   if([390,1440].includes(width)&&['','/wallet'].includes(path))await page.screenshot({path:`/tmp/goblin-design-market-${width}-${path?'wallet':'catalog'}.png`,fullPage:false});
   count++;
  }
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${count} marketplace route/viewport checks using read-only public catalog and isolated authenticated fixtures. No registrations, purchases or financial writes.`);
}catch(error){console.error(logs.slice(-3000));throw error;}
finally{await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>fixture.close(resolve));}
