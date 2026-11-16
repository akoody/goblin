import DecimalJs from 'decimal.js';
import {db} from '../config/db.js';
import {transact} from './commerce.service.js';

const Decimal=DecimalJs.clone({precision:48});
const invalid = (code, message, status=400) => { throw Object.assign(new Error(message), {code,status}); };

export function isMarketUsdtAmount(value) {
  return typeof value==='string' && /^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/.test(value) &&
    new Decimal(value).gt(0) && new Decimal(value).lte(10_000_000);
}

export async function marketUsdtBalances(userId, connection=db) {
  const [[row]]=await connection.execute(`SELECT COALESCE(m.usdt_balance,0) AS market,
    CASE WHEN w.status='active' THEN w.balance-w.locked_balance ELSE 0 END AS exchange
    FROM users u LEFT JOIN market_wallets m ON m.user_id=u.id
    LEFT JOIN wallets w ON w.user_id=u.id AND w.currency='USDT' WHERE u.id=?`,[userId]);
  return {market:new Decimal(row?.market??0).toFixed(6),exchange:new Decimal(row?.exchange??0).toFixed(6,Decimal.ROUND_DOWN)};
}

export async function marketUsdtTransfers(userId, connection=db) {
  const [rows]=await connection.execute(`SELECT request_key AS id,direction,amount,created_at AS createdAt
    FROM market_usdt_transfers WHERE user_id=? ORDER BY created_at DESC,request_key DESC LIMIT 100`,[userId]);
  return rows;
}

export async function transferMarketUsdt(userId, input) {
  const {direction,amount,requestKey}=input??{};
  if(!['TO_MARKET','TO_EXCHANGE'].includes(direction)||!isMarketUsdtAmount(amount)||
     typeof requestKey!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestKey)){
    invalid('INVALID_TRANSFER','Укажите корректную сумму USDT и направление перевода');
  }
  const value=new Decimal(amount).toFixed(6);
  return transact(async connection=>{
    await connection.execute('SELECT id FROM market_application_state WHERE id=1 LOCK IN SHARE MODE');
    const [[user]]=await connection.execute('SELECT status,internal_transfers_enabled FROM users WHERE id=? FOR UPDATE',[userId]);
    if(user?.status!=='active'||Number(user.internal_transfers_enabled)!==1)invalid('ACCOUNT_OPERATIONS_DISABLED','Внутренние переводы для аккаунта недоступны',403);
    const [[previous]]=await connection.execute('SELECT direction,amount FROM market_usdt_transfers WHERE user_id=? AND request_key=?',[userId,requestKey]);
    if(previous){
      if(previous.direction!==direction||!new Decimal(previous.amount).eq(value))invalid('TRANSFER_CONFLICT','Этот запрос уже использован для другого перевода',409);
      return marketUsdtBalances(userId,connection);
    }
    await connection.execute('INSERT IGNORE INTO market_wallets (user_id) VALUES (?)',[userId]);
    const [[market]]=await connection.execute('SELECT usdt_balance FROM market_wallets WHERE user_id=? FOR UPDATE',[userId]);
    const [[wallet]]=await connection.execute("SELECT id,status,balance,locked_balance,collection_lock_id FROM wallets WHERE user_id=? AND currency='USDT' FOR UPDATE",[userId]);
    if(wallet?.status!=='active')invalid('WALLET_UNAVAILABLE','Активный кошелёк USDT биржи не найден',409);
    if(wallet.collection_lock_id)invalid('WALLET_BUSY','Дождитесь завершения операции с кошельком USDT',409);
    const toMarket=direction==='TO_MARKET';
    const available=toMarket?new Decimal(wallet.balance).minus(wallet.locked_balance):new Decimal(market.usdt_balance);
    if(available.lt(value))invalid('INSUFFICIENT_FUNDS','Недостаточно доступных USDT');
    const marketDelta=toMarket?value:`-${value}`;
    const exchangeDelta=toMarket?`-${value}`:value;
    await connection.execute('UPDATE market_wallets SET usdt_balance=usdt_balance+? WHERE user_id=?',[marketDelta,userId]);
    await connection.execute('UPDATE wallets SET balance=balance+? WHERE id=?',[exchangeDelta,wallet.id]);
    await connection.execute('INSERT INTO market_usdt_transfers (user_id,request_key,direction,amount) VALUES (?,?,?,?)',[userId,requestKey,direction,value]);
    return marketUsdtBalances(userId,connection);
  });
}
