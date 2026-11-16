import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {base32,createRecoveryCodes,decryptAuthenticator,encryptAuthenticator,recoveryHash,totpCode,verifyTotp} from '../src/services/authenticator-crypto.js';

test('Authenticator follows RFC 6238 and rejects a consumed time step',()=>{
  const secret=Buffer.from('12345678901234567890');
  assert.equal(base32(secret),'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1234567890,'89005924'],[20000000000,'65353130']]){
    assert.equal(totpCode(secret,Math.floor(seconds/30),8),expected);
  }
  assert.equal(verifyTotp(secret,'287082',null,59_000),1);
  assert.equal(verifyTotp(secret,'287082',1,59_000),null);
  assert.equal(verifyTotp(secret,'287082',null,120_000),null);
});

test('Encrypted secrets are bound to the account and recovery codes accept pasted separators',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'goblin-authenticator-'));
  const original=process.env.TOTP_KEY_FILE;
  process.env.TOTP_KEY_FILE=join(directory,'key');
  try{
    await writeFile(process.env.TOTP_KEY_FILE,randomBytes(32),{mode:0o600});
    const secret=randomBytes(20);
    const ciphertext=encryptAuthenticator(secret,1);
    assert.deepEqual(decryptAuthenticator(ciphertext,1),secret);
    assert.throws(()=>decryptAuthenticator(ciphertext,2));
    const codes=createRecoveryCodes();
    assert.equal(new Set(codes).size,10);
    for(const code of codes){
      assert.match(code,/^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/);
      assert.equal(recoveryHash(code),recoveryHash(code.toLowerCase().replaceAll('-',' ')));
    }
    assert.equal(recoveryHash('123456'),null);
  }finally{
    if(original===undefined)delete process.env.TOTP_KEY_FILE;else process.env.TOTP_KEY_FILE=original;
    await rm(directory,{recursive:true,force:true});
  }
});
