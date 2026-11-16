import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import {fail} from './commerce-policy.js';

export const maxEscrowAttachmentSize=20_000_000;
const signatures='/var/lib/clamav/daily.cvd';
let scanning=false;

async function currentSignatures(){
  const daily=await open(signatures).catch(error=>{
    if(error.code!=='ENOENT')throw error;
    return open(signatures.replace('.cvd','.cld'));
  });
  try{
    const header=Buffer.alloc(512);
    await daily.read(header);
    const parts=header.toString('ascii').split(':');
    const updatedAt=Number(parts[8]?.trim())*1000;
    return parts[0]==='ClamAV-VDB'&&updatedAt>0&&Date.now()-updatedAt<7*24*60*60_000;
  }finally{
    await daily.close();
  }
}

function runScan(buffer){
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/systemd-run',[
      '--quiet','--wait','--pipe','--collect',
      '-p','User=clamav','-p','MemoryMax=650M','-p','MemorySwapMax=1400M','-p','CPUQuota=100%','-p','Nice=10',
      '-p','NoNewPrivileges=yes','-p','PrivateTmp=yes','-p','PrivateNetwork=yes',
      '-p','ProtectSystem=strict','-p','ProtectHome=yes','-p','RuntimeMaxSec=50',
      '/usr/bin/clamscan','--no-summary','--alert-encrypted=yes','--alert-exceeds-max=yes',
      '--max-scantime=0','-',
    ],{stdio:['pipe','pipe','pipe']});
    let result='';
    child.stdout.on('data',chunk=>{if(result.length<4096)result+=chunk.toString('utf8');});
    child.stderr.resume();
    child.stdin.on('error',()=>{});
    child.once('error',reject);
    child.once('close',code=>resolve({code,result}));
    child.stdin.end(buffer);
  });
}

export async function scanEscrowAttachment(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length===0)fail('Выберите непустой файл');
  if(buffer.length>maxEscrowAttachmentSize)fail('Максимальный размер файла - 20 МБ',413);
  if(scanning)fail('Антивирус проверяет другой файл. Попробуйте через несколько секунд.',503);
  scanning=true;
  let scan;
  try{
    if(await currentSignatures())scan=await runScan(buffer);
  }catch{
    // Attachment publication requires an explicit clean verdict.
  }finally{
    scanning=false;
  }
  if(scan?.code===0&&/^stdin: OK\s*$/im.test(scan.result))return;
  if(scan?.code===1&&/^stdin: .+ FOUND\s*$/im.test(scan.result))fail('Антивирус отклонил файл: обнаружена угроза или файл невозможно полностью проверить.',422);
  fail('Антивирусная проверка временно недоступна. Файл не отправлен.',503);
}
