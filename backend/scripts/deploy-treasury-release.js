import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const [release,backup]=process.argv.slice(2),live='/root/goblin-main';
if(!/^\/root\/goblin-release-20261111\.[A-Za-z0-9]+$/.test(release||'')||!/^\/root\/backups\/goblin-20261111\.[A-Za-z0-9]+$/.test(backup||''))throw Error('Invalid release paths');
const manifest=JSON.parse(fs.readFileSync(`${backup}/manifest.json`,'utf8'));
if(manifest.release!==release)throw Error('Backup mismatch');
for(const directory of ['backend/src','build']){
 const next=`${live}/${directory}-treasury-20261111`;
 if(fs.existsSync(next))throw Error('Staging path exists');
 fs.cpSync(`${release}/${directory}`,next,{recursive:true});
 if(directory==='build')fs.cpSync(`${live}/build/assets`,`${next}/assets`,{recursive:true,force:false});
 fs.renameSync(`${live}/${directory}`,`${backup}/${directory.replaceAll('/','-')}-live`);
 fs.renameSync(next,`${live}/${directory}`);
}
for(const directory of ['src','public','backend/sql','backend/scripts','backend/test'])fs.cpSync(`${release}/${directory}`,`${live}/${directory}`,{recursive:true});
fs.copyFileSync(`${live}/backend/server.js`,`${backup}/server.previous.js`);
fs.copyFileSync(`${release}/backend/server.js`,`${live}/backend/server.js`);
fs.copyFileSync(`${release}/index.html`,`${live}/index.html`);
for(const name of ['goblin-backend','goblin-frontend'])execFileSync('pm2',['restart',name],{stdio:'inherit'});
execFileSync('pm2',['save'],{stdio:'inherit'});
console.log(JSON.stringify({published:true,backup,otherProcessesUnchanged:true}));
