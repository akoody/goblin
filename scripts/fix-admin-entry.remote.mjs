import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const path='/etc/nginx/sites-enabled/cryptogoblin',previous=fs.readFileSync(path,'utf8');
if(!previous.includes('location = /admin {')){
  if(!previous.includes('    location /socket.io/ {'))throw Error('Unexpected nginx configuration');
  fs.copyFileSync(path,'/root/goblin-backups/pre-admin-entry-20261014.conf');
  fs.writeFileSync(path,previous.replace('    location /socket.io/ {',`    location = /admin {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /admin/ { return 308 /admin; }
    location /socket.io/ {`));
  try{execFileSync('nginx',['-t'],{stdio:'inherit'});}catch(e){fs.writeFileSync(path,previous);throw e;}
  execFileSync('systemctl',['reload','nginx'],{stdio:'inherit'});
}
console.log('Admin HTML entry routed to frontend; /admin/* API authorization unchanged');
