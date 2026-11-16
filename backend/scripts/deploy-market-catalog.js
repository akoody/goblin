import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {db} from '../src/config/db.js';

const stage=process.argv[2],live='/root/goblin-main/backend';
if(!/^\/root\/goblin-market-catalog-20261112\.[A-Za-z0-9]+$/.test(stage||''))throw Error('Invalid stage path');
const expected={
 'src/services/market-app.service.js':'69c8e2ac720ecb83e137b97111cd82464b3038f959e73a8f0a8a080e4fa64331',
 'market-runtime/db.js':'5902b4a7fd9a7b660e07c8123b413f7bbce56cad0a7f59e48bbba2c8194acf38',
 'market-runtime/marketplace-catalog.js':'cd8530ea7b4b897ec07d6ef5e488268355032043a43e6c143b1da7d01f43cd23',
};
const run=(args,options={})=>execFileSync('pm2',args,{stdio:'inherit',...options});
try{
 for(const [file,hash] of Object.entries(expected))if(createHash('sha256').update(fs.readFileSync(`${live}/${file}`)).digest('hex')!==hash)throw Error(`Production changed: ${file}`);
 const old=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(process=>process.name==='goblin-market');if(!old)throw Error('Marketplace process missing');
 const candidates=[`${stage}/apps/market/.next/standalone/apps/market/server.js`,`${stage}/apps/market/.next/standalone/server.js`];
 const server=candidates.find(file=>fs.existsSync(file));if(!server)throw Error('Standalone build missing');
 const root=path.dirname(server),oldRoot=path.dirname(old.pm2_env.pm_exec_path);
 const backup=fs.mkdtempSync('/root/backups/goblin-market-catalog-20261112.');fs.chmodSync(backup,0o700);
 fs.writeFileSync(`${backup}/process.json`,JSON.stringify(old),{mode:0o600});
 const [[snapshot]]=await db.query('SELECT payload,revision FROM market_application_state WHERE id=1');
 fs.writeFileSync(`${backup}/market-state.json`,JSON.stringify(snapshot),{mode:0o600});
 fs.cpSync(`${stage}/apps/market/.next/static`,`${root}/.next/static`,{recursive:true});
 if(fs.existsSync(`${oldRoot}/.next/static`))fs.cpSync(`${oldRoot}/.next/static`,`${root}/.next/static`,{recursive:true,force:false});
 fs.cpSync(`${stage}/apps/market/public`,`${root}/public`,{recursive:true});
 const next=`${live}/market-runtime-catalog-20261112`;if(fs.existsSync(next))throw Error('Runtime staging path exists');
 fs.cpSync(`${stage}/backend/market-runtime`,next,{recursive:true});
 fs.renameSync(`${live}/market-runtime`,`${backup}/market-runtime`);fs.renameSync(next,`${live}/market-runtime`);
 fs.copyFileSync(`${live}/src/services/market-app.service.js`,`${backup}/market-app.previous.js`);
 fs.copyFileSync(`${stage}/backend/src/services/market-app.service.js`,`${live}/src/services/market-app.service.js.next`);
 fs.renameSync(`${live}/src/services/market-app.service.js.next`,`${live}/src/services/market-app.service.js`);
 fs.cpSync(`${stage}/backend/market-source`,`${live}/market-source`,{recursive:true});
 for(const name of ['market-catalog-availability.test.js','market-area-access.test.js'])fs.copyFileSync(`${stage}/backend/test/${name}`,`${live}/test/${name}`);
 run(['restart','goblin-backend']);
 const environment={...old.pm2_env.env,PATH:process.env.PATH,HOME:'/root',PORT:'8081',HOSTNAME:'127.0.0.1',NODE_ENV:'production'};
 run(['delete','goblin-market']);
 try{run(['start',server,'--name','goblin-market','--cwd',root],{env:environment});}
 catch(error){try{run(['delete','goblin-market']);}catch{}run(['start',old.pm2_env.pm_exec_path,'--name','goblin-market','--cwd',old.pm2_env.pm_cwd],{env:environment});throw error;}
 run(['save']);
 fs.writeFileSync(`${backup}/manifest.json`,JSON.stringify({stage,server,previous:old.pm2_env.pm_exec_path,createdAt:new Date().toISOString()},null,2),{mode:0o600});
 console.log(JSON.stringify({published:true,backup,marketServer:server,exchangeFrontendUnchanged:true,databaseChanged:false}));
}finally{await db.end();}
