import assert from 'node:assert/strict';
import {chromium} from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
  let checked=0;
  for(const width of [320,390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    for(const path of ['/','/news','/trade','/login','/market?part=accounts','/market?part=services']){
      const response=await page.goto('https://cryptogoblin.ru'+path,{waitUntil:'networkidle'});
      assert.equal(response.status(),200,`${width}: ${path}`);
      assert(!(await page.locator('body').innerText()).includes('Application error'),path);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow ${width}: ${path}`);
      if(path.startsWith('/market?'))await page.getByRole('heading',{name:path.endsWith('accounts')?'Маркет аккаунтов':'Маркет услуг',exact:true}).waitFor();
      checked++;
    }
    assert.equal(errors.length,0,errors.join('\n'));
    await page.close();
    console.log(`Public screens passed at ${width}px`);
  }
  console.log(JSON.stringify({publicScreens:checked,mobileAndDesktop:true,realProduction:true,financialActions:0}));
}finally{await browser.close();}
