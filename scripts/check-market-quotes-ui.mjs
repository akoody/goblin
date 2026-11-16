import assert from 'node:assert/strict';
import {chromium} from '/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  for(const width of [320,390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    let releaseSpot;
    const spotGate=new Promise(resolve=>{releaseSpot=resolve;});
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      if(!/^\/(api|admin|exchange)\//.test(path))return route.continue();
      assert.equal(req.method(),'GET','No orders or financial mutations may be sent');
      let data=[];
      if(path.startsWith('/exchange/market/')) {
        const market=url.searchParams.get('market'),symbol=path.split('/').at(-1);
        assert(['SPOT','FUTURES'].includes(market));
        if(market==='SPOT')await spotGate;
        const price=symbol==='BONK-USDT'?'0.000002777':market==='FUTURES'?'110':'100';
        data={symbol,market,price,high24h:price,low24h:price,change24h:'1',volume24h:'200',source:'Binance',
          depth:{bids:[{price,quantity:'1000'}],asks:[{price,quantity:'2000'}]},
          candles:Array.from({length:48},(_,index)=>({time:Date.now()+index*3600000,open:price,high:price,low:price,close:price,volume:'200'}))};
      }
      if(path==='/api/features')data={market:true,guarantor:true,trading:true,p2p:true};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    const initial=page.waitForRequest(request=>request.url().includes('/exchange/market/')&&request.url().includes('market=SPOT'));
    await page.goto('http://127.0.0.1:5187/trade',{waitUntil:'domcontentloaded'});await initial;
    await page.getByRole('button',{name:'Фьючерсы',exact:true}).click();
    await page.getByLabel('Цена ордера',{exact:true}).filter({visible:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('input[aria-label="Цена ордера"]')?.value==='110');
    const oldResponse=page.waitForResponse(response=>response.url().includes('market=SPOT'));
    releaseSpot();await oldResponse;
    assert.equal(await page.getByLabel('Цена ордера',{exact:true}).inputValue(),'110');
    await page.getByLabel('Торговая пара',{exact:true}).selectOption('BONK-USDT');
    await page.waitForFunction(()=>document.querySelector('input[aria-label="Цена ордера"]')?.value==='0.000002777');
    await page.getByRole('button',{name:'Выбрать цену покупки 0.000002777 USDT',exact:true}).click();
    assert.equal(await page.getByLabel('Цена ордера',{exact:true}).inputValue(),'0.000002777');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow at ${width}`);
    assert.equal(errors.length,0,errors.join('\n'));
    await page.close();console.log(`Market quotes, stale-response isolation, meme precision and price selection passed at ${width}px`);
  }
}finally{await browser.close();}
