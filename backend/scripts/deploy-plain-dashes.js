import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {db} from '../src/config/db.js';

const stage=process.argv[2],live='/root/goblin-main';
if(!/^\/root\/goblin-copy-20261112\.[A-Za-z0-9]+$/.test(stage||''))throw Error('Invalid release path');
const normalize=value=>value.replace(/[\u2013\u2014]/g,'-');
const digest=value=>createHash('sha256').update(value).digest('hex');
const changes=[];
function verify(relative){
 const next=path.join(stage,relative),previous=path.join(live,relative);
 if(fs.statSync(next).isDirectory()){
  for(const name of fs.readdirSync(next))verify(path.join(relative,name));return;
 }
 const value=fs.readFileSync(next);
 if(!fs.existsSync(previous)){
  if(relative!=='backend/src/services/plain-dashes.js')throw Error(`Unexpected new source: ${relative}`);
  changes.push(relative);return;
 }
 const old=fs.readFileSync(previous);if(old.equals(value))return;
 if(relative==='backend/src/routes/content.routes.js'){
  if(digest(old)!=='700c8be54c2946e59d52c5ebaac8e4413c2de9c783862fc41f8a87dab4682957')throw Error('Content routes changed in production');
 }else if(normalize(old.toString('utf8'))!==value.toString('utf8'))throw Error(`Non-copy change: ${relative}`);
 changes.push(relative);
}
try{
 for(const root of ['src','backend/src','index.html'])verify(root);
 if(/[\u2013\u2014]/.test(fs.readFileSync(`${stage}/build/index.html`,'utf8')))throw Error('Preview still contains a long dash');
 const [[pending]]=await db.query("SELECT (SELECT COUNT(*) FROM treasury_payouts WHERE status IN ('prepared','submitted','review'))+(SELECT COUNT(*) FROM crypto_withdrawals WHERE status='broadcast') pending");
 if(Number(pending.pending)!==0)throw Error('Wait for pending withdrawals before restarting');
 const backup=fs.mkdtempSync('/root/backups/goblin-copy-20261112.');fs.chmodSync(backup,0o700);
 for(const directory of ['src','backend/src','build']){
  const target=`${live}/${directory}`,next=`${target}-plain-dashes-20261112`;
  if(fs.existsSync(next))throw Error('Staging directory already exists');
  fs.cpSync(`${stage}/${directory}`,next,{recursive:true});
  if(directory==='build')fs.cpSync(`${target}/assets`,`${next}/assets`,{recursive:true,force:false});
  fs.renameSync(target,`${backup}/${directory.replaceAll('/','-')}`);fs.renameSync(next,target);
 }
 fs.copyFileSync(`${live}/index.html`,`${backup}/index.html`);fs.copyFileSync(`${stage}/index.html`,`${live}/index.html`);
 for(const name of ['commerce-minimum.test.js','plain-dashes.test.js'])fs.copyFileSync(`${stage}/backend/test/${name}`,`${live}/backend/test/${name}`);
 fs.writeFileSync(`${backup}/manifest.json`,JSON.stringify({stage,changes,createdAt:new Date().toISOString()},null,2),{mode:0o600});
 for(const process of ['goblin-backend','goblin-frontend'])execFileSync('pm2',['restart',process],{stdio:'inherit'});
 console.log(JSON.stringify({published:true,backup,changedSourceFiles:changes.length,databaseChanged:false,marketChanged:false}));
}finally{await db.end();}
