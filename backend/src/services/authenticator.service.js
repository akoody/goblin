import bcrypt from 'bcryptjs';
import {createHash,randomBytes} from 'node:crypto';
import {db} from '../config/db.js';
import {writeLoginIp} from './login-ip.service.js';
import {base32,createRecoveryCodes,decryptAuthenticator,encryptAuthenticator,recoveryHash,verifyTotp} from './authenticator-crypto.js';

const challengeTtl=5*60_000;
const setupTtl=10*60_000;
const blockedFor=5*60_000;
const maxAttempts=5;
const issuer='CryptoGoblin';
const version=user=>Number(user.token_version||0);
const hashChallenge=challenge=>createHash('sha256').update(challenge).digest();
const fail=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
const expired=()=>fail('MFA_EXPIRED','Срок подтверждения истёк. Начните заново.');
const limited=()=>fail('MFA_RATE_LIMITED','Слишком много попыток. Подождите несколько минут.',429);
const invalid=()=>fail('MFA_INVALID','Неверный или уже использованный код. Дождитесь нового кода.');
const credentials=()=>fail('INVALID_CREDENTIALS','Неверный логин или пароль.',401);

async function withAuthenticator(userId,work){
  const connection=await db.getConnection();
  let result;
  try{
    await connection.beginTransaction();
    const [[user]]=await connection.execute(
      'SELECT id,username,password_hash,status,token_version FROM users WHERE id=? FOR UPDATE',[userId]);
    const [[factor]]=await connection.execute('SELECT * FROM user_authenticators WHERE user_id=? FOR UPDATE',[userId]);
    result=await work(connection,user,factor);
    await connection.commit();
  }catch(error){
    await connection.rollback();
    throw error;
  }finally{
    connection.release();
  }
  if(result instanceof Error)throw result;
  return result;
}

function requireSession(user,session){
  if(!user||(user.status??'active')!=='active'||version(user)!==Number(session.tokenVersion||0)){
    throw fail('TOKEN_REVOKED','Сессия завершилась. Войдите снова.',401);
  }
}

async function requirePassword(user,password){
  if(typeof password!=='string'||!password||!await bcrypt.compare(password,user.password_hash)){
    throw fail('MFA_PASSWORD','Неверный текущий пароль.');
  }
}

function recentRecovery(session){
  const age=Date.now()-Number(session.authenticatorRecoveryAt||0);
  return age>=0&&age<=challengeTtl;
}

async function badCode(connection,userId,factor,now){
  const attempts=(Number(factor.blocked_until)>0?0:Number(factor.failed_attempts))+1;
  const locked=attempts>=maxAttempts;
  await connection.execute('UPDATE user_authenticators SET failed_attempts=?,blocked_until=? WHERE user_id=?',
    [attempts,locked?now+blockedFor:0,userId]);
  return locked?limited():invalid();
}

function matchFactor(factor,userId,code,now){
  const recovery=recoveryHash(code);
  if(recovery){
    const hashes=typeof factor.recovery_hashes==='string'?JSON.parse(factor.recovery_hashes):factor.recovery_hashes;
    if(!hashes?.includes(recovery))return null;
    return {recovery:true,hashes:hashes.filter(hash=>hash!==recovery),counter:factor.last_counter};
  }
  const counter=verifyTotp(decryptAuthenticator(factor.secret_cipher,userId),String(code??'').trim(),factor.last_counter,now);
  return counter===null?null:{recovery:false,counter};
}

async function rotateSession(connection,user){
  await connection.execute('UPDATE users SET token_version=COALESCE(token_version,0)+1 WHERE id=?',[user.id]);
  return {...user,token_version:version(user)+1};
}

export async function beginAuthenticatorLogin(account,deviceModel){
  return withAuthenticator(account.id,async(connection,user,factor)=>{
    if(!user||(user.status??'active')!=='active'||user.password_hash!==account.password_hash||version(user)!==version(account)){
      throw credentials();
    }
    if(!factor?.enabled)return {user};
    const now=Date.now();
    if(Number(factor.blocked_until)>now)throw limited();
    const challenge=randomBytes(32).toString('base64url');
    await connection.execute(`UPDATE user_authenticators
      SET challenge_hash=?,challenge_expires_at=?,challenge_version=?,challenge_device=? WHERE user_id=?`,
      [hashChallenge(challenge),now+challengeTtl,version(user),typeof deviceModel==='string'?deviceModel.slice(0,80):null,user.id]);
    return {challenge};
  });
}

export async function finishAuthenticatorLogin(challenge,code,context){
  if(typeof challenge!=='string'||!/^[\w-]{43}$/.test(challenge))throw expired();
  const hash=hashChallenge(challenge);
  const [[entry]]=await db.execute('SELECT user_id FROM user_authenticators WHERE challenge_hash=?',[hash]);
  if(!entry)throw expired();
  return withAuthenticator(entry.user_id,async(connection,user,factor)=>{
    const now=Date.now();
    if(!user||(user.status??'active')!=='active'||!factor?.enabled||!factor.challenge_hash?.equals(hash)||
       Number(factor.challenge_version)!==version(user)||Number(factor.challenge_expires_at)<=now)throw expired();
    if(Number(factor.blocked_until)>now)throw limited();
    const match=matchFactor(factor,user.id,code,now);
    if(!match)return badCode(connection,user.id,factor,now);
    await writeLoginIp(connection,user.id,{...context,deviceModel:factor.challenge_device});
    const hashes=match.recovery?JSON.stringify(match.hashes)
      :typeof factor.recovery_hashes==='string'?factor.recovery_hashes:JSON.stringify(factor.recovery_hashes);
    await connection.execute(`UPDATE user_authenticators SET last_counter=?,recovery_hashes=?,failed_attempts=0,blocked_until=0,
      challenge_hash=NULL,challenge_expires_at=NULL,challenge_version=NULL,challenge_device=NULL WHERE user_id=?`,
      [match.counter,hashes,user.id]);
    return {user,recoveryAt:match.recovery?now:undefined};
  });
}

export async function authenticatorStatus(session){
  const [[factor]]=await db.execute(
    'SELECT enabled,JSON_LENGTH(recovery_hashes) AS recovery_count FROM user_authenticators WHERE user_id=?',[session.userId]);
  return {enabled:Boolean(factor?.enabled),recoveryCount:Number(factor?.recovery_count||0),recentRecovery:recentRecovery(session)};
}

export async function startAuthenticatorSetup(session,password){
  return withAuthenticator(session.userId,async(connection,user,factor)=>{
    requireSession(user,session);
    await requirePassword(user,password);
    if(factor?.enabled)throw fail('MFA_ENABLED','Authenticator уже подключён.',409);
    const now=Date.now();
    if(Number(factor?.blocked_until)>now)throw limited();
    const secret=randomBytes(20);
    await connection.execute(`INSERT INTO user_authenticators (user_id,secret_cipher,setup_expires_at,setup_version)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher),
      setup_expires_at=VALUES(setup_expires_at),setup_version=VALUES(setup_version)`,
      [user.id,encryptAuthenticator(secret,user.id),now+setupTtl,version(user)]);
    const setupKey=base32(secret);
    const label=`${issuer}:${encodeURIComponent(user.username)}`;
    return {setupKey,uri:`otpauth://totp/${label}?${new URLSearchParams({secret:setupKey,issuer,algorithm:'SHA1',digits:'6',period:'30'})}`};
  });
}

export async function enableAuthenticator(session,code){
  return withAuthenticator(session.userId,async(connection,user,factor)=>{
    requireSession(user,session);
    const now=Date.now();
    if(!factor||factor.enabled||Number(factor.setup_expires_at)<=now||Number(factor.setup_version)!==version(user))throw expired();
    if(Number(factor.blocked_until)>now)throw limited();
    const counter=verifyTotp(decryptAuthenticator(factor.secret_cipher,user.id),String(code??'').trim(),null,now);
    if(counter===null)return badCode(connection,user.id,factor,now);
    const recoveryCodes=createRecoveryCodes();
    await connection.execute(`UPDATE user_authenticators SET enabled=1,setup_expires_at=NULL,setup_version=NULL,
      last_counter=?,recovery_hashes=?,failed_attempts=0,blocked_until=0 WHERE user_id=?`,
      [counter,JSON.stringify(recoveryCodes.map(recoveryHash)),user.id]);
    return {user:await rotateSession(connection,user),recoveryCodes};
  });
}

export async function disableAuthenticator(session,password,code){
  return withAuthenticator(session.userId,async(connection,user,factor)=>{
    requireSession(user,session);
    await requirePassword(user,password);
    if(!factor?.enabled)throw fail('MFA_DISABLED','Authenticator уже отключён.',409);
    const now=Date.now();
    if(Number(factor.blocked_until)>now)throw limited();
    if(!recentRecovery(session)&&!matchFactor(factor,user.id,code,now))return badCode(connection,user.id,factor,now);
    await connection.execute('DELETE FROM user_authenticators WHERE user_id=?',[user.id]);
    return {user:await rotateSession(connection,user)};
  });
}
