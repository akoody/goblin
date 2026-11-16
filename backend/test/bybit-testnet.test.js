import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {db} from '../src/config/db.js';
import {bybitState,closeBybitPosition,connectBybit,disconnectBybit,placeBybitOrder} from '../src/services/bybit-testnet.service.js';

test('Bybit Testnet connection and order lifecycle isolate credentials and reconcile unknown submissions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'goblin-bybit-'));
  const keyFile=join(dir,'key');
  await writeFile(keyFile,randomBytes(32),{mode:0o600});
  const old={execute:db.execute,fetch:globalThis.fetch,keyFile:process.env.BYBIT_TESTNET_KEY_FILE};
  process.env.BYBIT_TESTNET_KEY_FILE=keyFile;
  const rows=new Map();
  const requests=[];
  const credentials={key:'fixtureApiKey1',secret:'fixtureSecret1'};
  let walletPermissions=['Withdraw'];
  let timedOutOrder;
  db.execute=async(sql,args)=>{
    const [id,connectionId,encrypted]=args;
    if(sql.startsWith('SELECT'))return [[rows.get(id)].filter(Boolean)];
    if(sql.startsWith('INSERT')&&!rows.has(id)){
      rows.set(id,{connection_id:connectionId,credentials:encrypted});
      return [{affectedRows:1}];
    }
    if(sql.startsWith('DELETE')&&rows.get(id)?.connection_id===connectionId){
      rows.delete(id);
      return [{affectedRows:1}];
    }
    return [{affectedRows:0}];
  };
  globalThis.fetch=async(url,options)=>{
    const target=new URL(url),headers=options.headers;
    assert.equal(target.origin,'https://api-testnet.bybit.com');
    assert.equal(options.redirect,'error');
    const raw=options.body??target.search.slice(1);
    const message=headers['X-BAPI-TIMESTAMP']+credentials.key+headers['X-BAPI-RECV-WINDOW']+raw;
    assert.equal(headers['X-BAPI-SIGN'],createHmac('sha256',credentials.secret).update(message).digest('hex'));
    const body=options.body&&JSON.parse(options.body);
    requests.push({path:target.pathname,body});
    let result;
    switch(target.pathname){
      case '/v5/user/query-api': result={readOnly:0,permissions:{ContractTrade:['Order','Position'],Wallet:walletPermissions}};break;
      case '/v5/account/wallet-balance': result={list:[{totalAvailableBalance:'307',coin:[{coin:'USDT',walletBalance:'308'}]}]};break;
      case '/v5/market/tickers': result={list:[{lastPrice:'100'}]};break;
      case '/v5/position/list': result={list:[{positionIdx:0,side:'Buy',size:'0.5'}]};break;
      case '/v5/order/realtime':
        result={list:target.searchParams.get('orderLinkId')===timedOutOrder&&timedOutOrder?[{orderLinkId:timedOutOrder,orderId:'accepted-order'}]:[]};break;
      case '/v5/order/create':
        if(!body.reduceOnly){timedOutOrder=body.orderLinkId;throw new Error('network');}
        result={orderId:'close-order'};break;
      default: throw new Error('Unexpected endpoint');
    }
    return Response.json({retCode:0,result});
  };
  try{
    await assert.rejects(connectBybit(1,credentials),{status:422});
    assert.equal(rows.size,0);
    walletPermissions=[];
    await connectBybit(1,credentials);
    assert(!rows.get(1).credentials.includes(credentials.secret));
    assert.equal((await bybitState(2,'BTCUSDT')).connected,false);
    const state=await bybitState(1,'BTCUSDT');
    assert.equal(state.balance.usdt,'308');
    assert.equal(state.ticker,'100');
    assert(!JSON.stringify(state).includes(credentials.key));
    const order={symbol:'BTCUSDT',connectionId:state.connectionId,side:'Buy',type:'Limit',quantity:'0.01',price:'100',requestId:randomUUID()};
    await assert.rejects(placeBybitOrder(2,order),{status:409});
    await assert.rejects(placeBybitOrder(1,{...order,quantity:'0'}),{status:400});
    assert.deepEqual(await placeBybitOrder(1,order),{orderId:'accepted-order'});
    assert.equal(requests.filter(request=>request.path==='/v5/order/create').length,1);
    assert.deepEqual(await closeBybitPosition(1,{...order,positionIdx:0}),{orderId:'close-order'});
    assert.equal(requests.at(-1).body.reduceOnly,true);
    assert.equal(requests.at(-1).body.side,'Sell');
    await disconnectBybit(1,state.connectionId);
    assert.equal((await bybitState(1,'BTCUSDT')).connected,false);
  }finally{
    db.execute=old.execute;
    globalThis.fetch=old.fetch;
    if(old.keyFile===undefined)delete process.env.BYBIT_TESTNET_KEY_FILE;
    else process.env.BYBIT_TESTNET_KEY_FILE=old.keyFile;
    await rm(dir,{recursive:true,force:true});
  }
});
