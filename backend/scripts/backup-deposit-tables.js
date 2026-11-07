import 'dotenv/config';
import { openSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
if(process.env.DEPOSIT_BACKUP!=='1')throw new Error('Explicit DEPOSIT_BACKUP=1 required');
const target='/root/goblin-backups/pre-deposit-compliance-20261014.sql';
const file=openSync(target,'wx',0o600);
try {
  execFileSync('mysqldump',['--single-transaction','--no-tablespaces','--set-gtid-purged=OFF',`--host=${process.env.DB_HOST||'127.0.0.1'}`,`--port=${process.env.DB_PORT||3306}`,`--user=${process.env.DB_USER}`,process.env.DB_NAME||'goblin','wallets','transactions','blockchain_deposits','blockchain_scan_state','crypto_withdrawals'],{env:{...process.env,MYSQL_PWD:process.env.DB_PASSWORD},stdio:['ignore',file,'pipe']});
  console.log('Financial backup saved with restricted permissions');
}catch(error){console.error('Financial backup failed; do not migrate',error.status);process.exitCode=1;}finally{closeSync(file);}
