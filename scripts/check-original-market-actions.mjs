import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const f=JSON.parse(fs.readFileSync(process.env.MARKET_UI_FIXTURE,'utf8')),base='https://cryptogoblin.ru';
const password=process.env.MARKET_QA_PASSWORD||f.qaPassword;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  const seller=await browser.newContext();await seller.addCookies([{name:'goblin_market_session',value:f.users[1].token,domain:'cryptogoblin.ru',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await seller.newPage();await page.goto(base+'/market/catalog/'+f.itemSlug+'/sell');
  const title='Disposable browser QA offer '+Date.now();
  await page.locator('[name=title]').fill(title);await page.locator('textarea[name=description]').fill('This is an isolated browser QA offer. No real goods or customer money are involved.');await page.locator('[name=price]').fill('9');await page.locator('[name=quantity]').fill('1');await page.locator('[name=deliveryType]').selectOption('MANUAL');
  await page.getByRole('button',{name:/Опубликовать|Сохранить/}).click();await page.waitForURL(/\/market\/catalog\/[^/]+\?/);
  const response=await seller.request.post(base+'/api/market-app/rpc',{data:{operation:'getCatalogItemBySlug',args:[f.itemSlug]}});
  const item=(await response.json()).result,listing=item.listings.find(l=>l.title===title);assert(listing,'Next create-listing action did not persist');
  const buyer=await browser.newContext();await buyer.addCookies([{name:'goblin_market_session',value:f.users[0].token,domain:'cryptogoblin.ru',path:'/',httpOnly:true,secure:true,sameSite:'Lax'}]);const bp=await buyer.newPage();await bp.goto(base+'/market/catalog/'+f.itemSlug+'/offers/'+listing.id);
  await bp.getByRole('button',{name:'Купить',exact:true}).click();await bp.waitForURL(/\/market\/chats\//);
  await bp.locator('[name=text]').fill('QA browser message delivered');await bp.getByRole('button',{name:/Отправить/}).click();await bp.getByText('QA browser message delivered',{exact:true}).first().waitFor();
  await bp.getByRole('button',{name:'Подтвердить получение'}).click();await bp.getByRole('button',{name:'Подтвердить получение'}).waitFor({state:'hidden'});
  await bp.goto(base+'/market/wallet');const form=bp.locator('form').filter({has:bp.getByRole('button',{name:'Пополнить баланс',exact:true})});await form.locator('[name=amount]').fill('5');await form.getByRole('button',{name:'Пополнить баланс',exact:true}).click();await bp.getByText(/Заявка на пополнение отправлена/).waitFor();
  await bp.locator('header summary').click();await bp.getByRole('button',{name:'Выйти',exact:true}).click();await bp.waitForURL(base+'/market');assert.equal((await buyer.cookies()).some(c=>c.name==='goblin_market_session'&&c.value),false);
  if(password){await bp.goto(base+'/market/login');await bp.locator('[name=email]').fill(f.users[0].email);await bp.locator('[name=password]').fill(password);await bp.getByRole('button',{name:'Войти',exact:true}).click();await bp.waitForURL(base+'/market');assert((await buyer.cookies()).some(c=>c.name==='goblin_market_session'&&c.httpOnly&&c.secure));await bp.goto(base+'/trade');await bp.waitForFunction(()=>!!localStorage.getItem('token'));}
  console.log('PASS actual Next forms: listing, purchase, private chat, buyer confirmation, pending deposit, unified logout/login');
} catch(error){for(const c of browser.contexts())for(const p of c.pages()){console.log('QA page:',p.url(),(await p.locator('body').innerText()).slice(-700));await p.screenshot({path:'/tmp/market-action-failure.png'});}throw error;} finally {await browser.close();}
