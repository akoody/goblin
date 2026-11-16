import 'dotenv/config';
import fs from 'node:fs';
import {assertMainnet,btcApi} from '../src/services/native-chain-client.js';

const target='https://mempool.space/api';
process.env.BITCOIN_API_URL=target;
await assertMainnet('BTC');
const rates=await btcApi('/fee-estimates');
if(!Number.isFinite(rates?.['6'])||rates['6']<=0)throw Error('Bitcoin fee estimates unavailable');
const path='.env',previous=fs.readFileSync(path,'utf8');
const updated=/^BITCOIN_API_URL=.*$/m.test(previous)
 ? previous.replace(/^BITCOIN_API_URL=.*$/m,`BITCOIN_API_URL=${target}`)
 : `${previous.trimEnd()}\nBITCOIN_API_URL=${target}\n`;
if(updated!==previous){
 fs.copyFileSync(path,'.env.before-treasury-provider-20261111',fs.constants.COPYFILE_EXCL);
 fs.chmodSync('.env.before-treasury-provider-20261111',0o600);
 fs.writeFileSync(path,updated,{mode:0o600});
}
console.log(JSON.stringify({bitcoinProviderReady:true,mainnetVerified:true,configurationChanged:updated!==previous}));
