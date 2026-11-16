import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let encryptionKey;

function getEncryptionKey(){
  if(!encryptionKey){
    const path=process.env.TOTP_KEY_FILE||'/root/.config/goblin-auth/totp.key';
    const key=readFileSync(path);
    if(key.length!==32)throw new Error('Invalid authenticator encryption key');
    encryptionKey=key;
  }
  return encryptionKey;
}

export function base32(secret){
  let bits=0,value=0,result='';
  for(const byte of secret){
    value=(value<<8)|byte;
    bits+=8;
    while(bits>=5)result+=alphabet[(value >>> (bits-=5)) & 31];
  }
  if(bits)result+=alphabet[(value<<(5-bits))&31];
  return result;
}

export function totpCode(secret,counter,digits=6){
  const input=Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac('sha1',secret).update(input).digest();
  const number=digest.readUInt32BE(digest[19]&15)&0x7fffffff;
  return String(number%(10**digits)).padStart(digits,'0');
}

export function verifyTotp(secret,code,lastCounter,now=Date.now()){
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
  const current=Math.floor(now/30_000);
  for(const counter of [current,current-1,current+1]){
    if(counter>=0&&(lastCounter==null||counter>Number(lastCounter))&&
       timingSafeEqual(Buffer.from(totpCode(secret,counter)),Buffer.from(code)))return counter;
  }
  return null;
}

export function encryptAuthenticator(secret,userId){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',getEncryptionKey(),iv);
  cipher.setAAD(Buffer.from(String(userId)));
  const encrypted=Buffer.concat([cipher.update(secret),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
}

export function decryptAuthenticator(ciphertext,userId){
  const cipher=createDecipheriv('aes-256-gcm',getEncryptionKey(),ciphertext.subarray(0,12));
  cipher.setAAD(Buffer.from(String(userId)));
  cipher.setAuthTag(ciphertext.subarray(12,28));
  return Buffer.concat([cipher.update(ciphertext.subarray(28)),cipher.final()]);
}

export function recoveryHash(code){
  if(typeof code!=='string'||code.length>40)return null;
  const normalized=code.toUpperCase().replace(/[\s-]/g,'');
  if(!/^[0-9A-F]{20}$/.test(normalized))return null;
  return createHash('sha256').update(normalized).digest('hex');
}

export function createRecoveryCodes(){
  return Array.from({length:10},()=>randomBytes(10).toString('hex').toUpperCase().match(/.{5}/g).join('-'));
}
