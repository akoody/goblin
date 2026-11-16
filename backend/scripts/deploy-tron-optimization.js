import 'dotenv/config';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {db} from '../src/config/db.js';

const stage=process.argv[2],live='/root/goblin-main/backend';
if(!/^\/root\/goblin-tron-optimization-20261112\.[A-Za-z0-9]+$/.test(stage||''))throw Error('Invalid release path');
const expected={
 'services/tron.service.js':'a39c0a897d0fcb8931a19f054e8575e78a3dfccc86e0e4114f4c83ef1b8ee701',
 'services/blockchain-processing.service.js':'0a2bb633235725afeb70ca929d4cfac85ee5d5937d84f4ce194d38a591208255',
 'routes/api/transactions.routes.js':'bc65a8abddba80b341425ea06a8def05480c56b149a0b58839aed0a1b3ac3bda',
 'services/treasury-payout.service.js':'9c0c8eb80cfa7c842238a50c451947ae60eedffe3f37b18d8946771d783e3b81',
};
try{
 for(const [path,hash] of Object.entries(expected))if(createHash('sha256').update(fs.readFileSync(`${live}/src/${path}`)).digest('hex')!==hash)throw Error(`Production changed: ${path}`);
 const [[pending]]=await db.query("SELECT (SELECT COUNT(*) FROM treasury_payouts WHERE status IN ('prepared','submitted','review'))+(SELECT COUNT(*) FROM crypto_withdrawals WHERE status='broadcast') pending");
 if(Number(pending.pending)!==0)throw Error('Wait for pending withdrawals before restarting');
 const next=`${live}/src-tron-20261112`;
 if(fs.existsSync(next))throw Error('Staging directory already exists');
 const backup=fs.mkdtempSync('/root/backups/goblin-tron-20261112.');fs.chmodSync(backup,0o700);
 fs.cpSync(`${stage}/backend/src`,next,{recursive:true});
 fs.writeFileSync(`${backup}/manifest.json`,JSON.stringify({stage,previousHashes:expected,createdAt:new Date().toISOString()},null,2),{mode:0o600});
 fs.renameSync(`${live}/src`,`${backup}/src-previous`);
 fs.renameSync(next,`${live}/src`);
 for(const name of ['tron-request-budget.test.js','tron-polling-cycle.test.js'])fs.copyFileSync(`${stage}/backend/test/${name}`,`${live}/test/${name}`);
 execFileSync('pm2',['restart','goblin-backend'],{stdio:'inherit'});
 console.log(JSON.stringify({published:true,backup,databaseChanged:false,frontendChanged:false,configurationChanged:false}));
}finally{await db.end();}
