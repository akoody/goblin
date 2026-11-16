import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const [release,backup]=process.argv.slice(2),live='/root/goblin-main';
if(!/^\/root\/goblin-release-20261110\.[A-Za-z0-9]+$/.test(release||'')||!/^\/root\/backups\/goblin-20261110\.[A-Za-z0-9]+$/.test(backup||''))throw Error('Invalid release paths');
const manifest=JSON.parse(fs.readFileSync(`${backup}/manifest.json`,'utf8'));
if(manifest.release!==release)throw Error('Wrong backup');
const run=(command,args,env=process.env)=>execFileSync(command,args,{stdio:'inherit',env});
for(const directory of ['backend/src','build']){
 const next=`${live}/${directory}-push-20261110`;
 if(fs.existsSync(next))throw Error('Release staging exists');
 fs.cpSync(`${release}/${directory}`,next,{recursive:true});
 if(directory==='build')fs.cpSync(`${live}/build/assets`,`${next}/assets`,{recursive:true,force:false});
 fs.renameSync(`${live}/${directory}`,`${backup}/${directory.replaceAll('/','-')}-live`);
 fs.renameSync(next,`${live}/${directory}`);
}
for(const directory of ['src','backend/sql','backend/test','backend/scripts'])fs.cpSync(`${release}/${directory}`,`${live}/${directory}`,{recursive:true});
for(const file of ['package.json','package-lock.json'])fs.copyFileSync(`${release}/${file}`,`${live}/${file}`);
run('pm2',['restart','goblin-backend','--update-env'],{...process.env,PUSH_ENABLED:'true',PUSH_CREDENTIALS_FILE:'/root/.config/goblin-push/server-credential.json'});
run('pm2',['restart','goblin-frontend']);
run('pm2',['save']);
console.log(JSON.stringify({published:true,backup,frontendSha256:createHash('sha256').update(fs.readFileSync(`${live}/build/index.html`)).digest('hex'),marketUnchanged:true,financialPoliciesUnchanged:true}));
