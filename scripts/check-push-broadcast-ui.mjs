import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
const email=(fs.readFileSync('.env','utf8').match(/^VITE_ADMIN_EMAILS=(.*)$/m)?.[1]||'').replace(/^['"]|['"]$/g,'').split(/[,;\n]/)[0].trim();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(()=>localStorage.setItem('token','qa-only'));
  const page=await context.newPage(),writes=[],errors=[];let accept=false;
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>accept?dialog.accept():dialog.dismiss());
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(url.port!=='3000'&&!p.startsWith('/api/'))return route.continue();
   let data=[];
   if(p==='/api/auth/me')data={id:1,email,username:'QA',wallets:[],staffAccess:{role:'admin'}};
   if(p==='/admin/access')data={role:'admin',permissions:[]};
   if(p==='/api/features')data={p2p:true,guarantor:true};
   if(p==='/api/push/broadcasts/audience')data={devices:3,users:2,enabled:true};
   if(p==='/api/push/broadcasts'&&request.method()==='POST'){writes.push(request.postDataJSON());data={id:'qa',status:'finished',total:3,accepted:3,failed:0,skipped:0};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:5188/admin');await page.getByRole('button',{name:'Рассылка',exact:true}).click();
  await page.getByText('Получателей: 2, устройств: 3',{exact:true}).waitFor();
  await page.getByLabel('Заголовок уведомления').fill('Новость проекта');await page.getByLabel('Текст уведомления').fill('Тестовая рассылка');
  await page.getByRole('button',{name:'Отправить рассылку',exact:true}).click();assert.equal(writes.length,0);
  accept=true;await page.getByRole('button',{name:'Отправить рассылку',exact:true}).click();await page.getByText(/Отправка завершена/).waitFor();
  assert.equal(writes.length,1);assert.equal(writes[0].expectedDevices,3);assert.equal(writes[0].path,'/news');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);await context.close();console.log(`Broadcast UI passed at ${width}px; mocked delivery only`);
 }
}finally{await browser.close();}
