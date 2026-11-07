// Run on the production host after installing and checking the release.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const file='/etc/nginx/sites-enabled/cryptogoblin';
let config=fs.readFileSync(file,'utf8');
if(!config.includes('location ^~ /market/')) {
  const marker='    location /socket.io/ {';
  if(!config.includes(marker))throw new Error('Unexpected nginx configuration; no changes made');
  config=config.replace(marker,`    location = /market {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ^~ /market/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
${marker}`);
  fs.writeFileSync(file,config);
}
execFileSync('nginx',['-t'],{stdio:'inherit'});
execFileSync('systemctl',['reload','nginx'],{stdio:'inherit'});
