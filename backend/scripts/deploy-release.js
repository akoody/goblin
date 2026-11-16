// Explicit host-side release steps. Never restores database data during rollback.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const shellEnv={...process.env};
dotenv.config({path:'/root/goblin-main/backend/.env'});
const live='/root/goblin-main';
const [phase,release,backup]=process.argv.slice(2);
const releaseDay=release?.match(/^\/root\/goblin-release-(\d{8})\.[A-Za-z0-9]+$/)?.[1];
if(!releaseDay)throw Error('Invalid release path');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{stdio:'inherit',env:shellEnv,...options});
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'goblin'});
try {
  if(phase==='preflight') {
    const [applied]=await c.query('SELECT name,checksum FROM schema_migrations ORDER BY name');
    for(const migration of applied)if(digest(path.join(release,'backend/sql',migration.name))!==migration.checksum)throw Error('Applied migration differs: '+migration.name);
    if(digest(`${live}/backend/package-lock.json`)!==digest(`${release}/backend/package-lock.json`))throw Error('Backend dependencies changed: install an isolated runtime first');
    console.log(JSON.stringify({appliedChecksumsVerified:applied.length,backendDependenciesUnchanged:true}));
  } else if(phase==='backup') {
    fs.mkdirSync('/root/backups',{recursive:true});
    const dir=fs.mkdtempSync(`/root/backups/goblin-${releaseDay}.`);fs.chmodSync(dir,0o700);
    const descriptor=fs.openSync(`${dir}/database.sql`,'wx',0o600);
    try {execFileSync('mysqldump',['--user=root','--socket=/var/run/mysqld/mysqld.sock','--single-transaction','--routines','--triggers','--events','--hex-blob','--no-tablespaces',process.env.DB_NAME||'goblin'],{stdio:['ignore',descriptor,'inherit'],env:shellEnv});}
    finally {fs.closeSync(descriptor);}
    run('tar',['--exclude=node_modules','--exclude=.next','--exclude=.git','--exclude=android','--exclude=*.apk','-czf',`${dir}/application.tar.gz`,'-C','/root','goblin-main']);
    fs.chmodSync(`${dir}/application.tar.gz`,0o600);
    fs.writeFileSync(`${dir}/processes.json`,execFileSync('pm2',['jlist'],{env:shellEnv}),{mode:0o600});
    fs.copyFileSync('/etc/nginx/sites-enabled/cryptogoblin',`${dir}/nginx.conf`);fs.chmodSync(`${dir}/nginx.conf`,0o600);
    const [[pump]]=await c.query('SELECT enabled FROM pump_policy WHERE id=1');
    const [[withdrawal]]=await c.query('SELECT enabled FROM treasury_auto_withdrawal_policy WHERE id=1');
    fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify({release,createdAt:new Date().toISOString(),databaseSha256:digest(`${dir}/database.sql`),applicationSha256:digest(`${dir}/application.tar.gz`),pumpEnabled:Boolean(pump.enabled),autoWithdrawalEnabled:Boolean(withdrawal.enabled)},null,2),{mode:0o600});
    console.log(JSON.stringify({backup:dir,databaseBytes:fs.statSync(`${dir}/database.sql`).size,applicationBytes:fs.statSync(`${dir}/application.tar.gz`).size}));
  } else if(phase==='publish') {
    if(!new RegExp(`^/root/backups/goblin-${releaseDay}\\.[A-Za-z0-9]+$`).test(backup||'')||!fs.existsSync(`${backup}/manifest.json`))throw Error('Verified backup required');
    const manifest=JSON.parse(fs.readFileSync(`${backup}/manifest.json`,'utf8'));
    if(manifest.release!==release)throw Error('Backup belongs to another release');
    const processes=JSON.parse(fs.readFileSync(`${backup}/processes.json`,'utf8'));
    const oldMarket=processes.find(p=>p.name==='goblin-market');if(!oldMarket)throw Error('Missing marketplace process');
    const serverCandidates=[`${release}/apps/market/.next/standalone/apps/market/server.js`,`${release}/apps/market/.next/standalone/server.js`];
    const server=serverCandidates.find(file=>fs.existsSync(file));if(!server)throw Error('Standalone build missing');
    const marketRoot=path.dirname(server),oldMarketRoot=path.dirname(oldMarket.pm2_env.pm_exec_path);
    fs.cpSync(`${release}/apps/market/.next/static`,`${marketRoot}/.next/static`,{recursive:true});
    if(fs.existsSync(`${oldMarketRoot}/.next/static`))fs.cpSync(`${oldMarketRoot}/.next/static`,`${marketRoot}/.next/static`,{recursive:true,force:false});
    fs.cpSync(`${release}/apps/market/public`,`${marketRoot}/public`,{recursive:true});
    fs.cpSync(`${live}/build/assets`,`${release}/build/assets`,{recursive:true,force:false});
    for(const relative of ['backend/src','backend/market-runtime','build']) {
      const next=`${live}/${relative}-release-${releaseDay}`;
      if(fs.existsSync(next))throw Error('Release staging target already exists');
      fs.cpSync(`${release}/${relative}`,next,{recursive:true});
      fs.renameSync(`${live}/${relative}`,`${backup}/${relative.replaceAll('/','-')}-live`);
      fs.renameSync(next,`${live}/${relative}`);
    }
    for(const relative of ['backend/sql','backend/scripts','docs','apps/market/src','apps/market/public','src','public','scripts'])fs.cpSync(`${release}/${relative}`,`${live}/${relative}`,{recursive:true});
    for(const name of ['package.json','package-lock.json','index.html','vite.config.js','postcss.config.mjs','tailwind.config.js'])fs.copyFileSync(`${release}/${name}`,`${live}/${name}`);
    fs.copyFileSync(`${release}/backend/server.js`,`${live}/backend/server.js`);
    for(const name of ['package.json','package-lock.json','next.config.ts','tsconfig.json','postcss.config.mjs'])fs.copyFileSync(`${release}/apps/market/${name}`,`${live}/apps/market/${name}`);
    run('pm2',['restart','goblin-backend']);
    run('pm2',['restart','goblin-frontend']);
    const previous=oldMarket.pm2_env.env||{};
    const env=Object.fromEntries(Object.entries(previous).filter(([,v])=>typeof v==='string'||typeof v==='number'));
    Object.assign(env,{NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'8081',MARKET_BACKEND_ORIGIN:'http://127.0.0.1:3000',COOKIE_SECURE:'true'});
    const config=`${release}/market-process.json`;
    fs.writeFileSync(config,JSON.stringify({apps:[{name:'goblin-market',script:server,cwd:marketRoot,exec_mode:'fork',instances:1,env}]}),{mode:0o600});
    run('pm2',['delete','goblin-market']);
    try {run('pm2',['start',config,'--only','goblin-market']);}
    catch(error) {
      run('pm2',['start',oldMarket.pm2_env.pm_exec_path,'--name','goblin-market','--cwd',oldMarket.pm2_env.pm_cwd],{env:{...shellEnv,...previous}});
      throw error;
    }
    const [[pump]]=await c.query('SELECT enabled FROM pump_policy WHERE id=1');
    const [[withdrawal]]=await c.query('SELECT enabled FROM treasury_auto_withdrawal_policy WHERE id=1');
    if(Boolean(pump.enabled)!==manifest.pumpEnabled||Boolean(withdrawal.enabled)!==manifest.autoWithdrawalEnabled)throw Error('Financial activation policy changed during release; inspect before proceeding');
    console.log(JSON.stringify({published:true,marketServer:server,indexSha256:digest(`${live}/build/index.html`),financialActivationPoliciesUnchanged:true}));
  } else throw Error('Unknown release phase');
}finally{await c.end();}
