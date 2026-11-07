import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const fixture=JSON.parse(fs.readFileSync(process.env.MARKET_UI_FIXTURE,'utf8'));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base='https://cryptogoblin.ru',errors=[];
const context=await browser.newContext();
await context.addCookies([{name:'goblin_market_session',value:fixture.users[0].token,domain:'cryptogoblin.ru',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
const paths=['','/catalog/'+fixture.itemSlug,'/catalog/'+fixture.itemSlug+'/sell','/purchases','/sales','/chats','/chats/'+fixture.conversationId,'/wallet','/profile','/settings','/support','/projects','/projects/'+fixture.projectId];
let checks=0;
try {
  for(const width of [320,360,390,430,768,1024,1440,1920]) {
    await page.setViewportSize({width,height:900});
    for(const route of paths) {
      const response=await page.goto(base+'/market'+route,{waitUntil:'networkidle'});
      assert(response.status()<400,`${width} ${route}: HTTP ${response.status()}`);
      assert(!(await page.locator('body').innerText()).includes('Application error'),route);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert(!overflow,`Overflow ${width} ${route}`);checks++;
      if(route===''&&[390,1440].includes(width))await page.screenshot({path:`/tmp/original-market-${width}.png`});
    }
  }
  await page.goto(base+'/trade',{waitUntil:'networkidle'});
  assert(await page.evaluate(()=>!!localStorage.getItem('token')),'SSO did not restore exchange token');
  await page.getByRole('link',{name:'Маркет',exact:true}).first().click();
  await page.waitForURL('**/market');assert(await page.getByRole('heading',{name:'Все игры, сервисы и платформы'}).isVisible());
  const denied=await context.request.post(base+'/api/market-app/rpc',{headers:{Authorization:'Bearer '+fixture.users[0].token},data:{operation:'getWalletOverview',args:[fixture.users[1].id]}});assert.equal(denied.status(),403);
  const admin=await context.request.post(base+'/api/market-app/rpc',{headers:{Authorization:'Bearer '+fixture.users[0].token},data:{operation:'getAdminDashboardData',args:[]}});assert.equal(admin.status(),403);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(`PASS ${checks} original-market screen/viewport combinations; exchange SSO, full navigation, own-account/admin access`);
} finally {await browser.close();}
