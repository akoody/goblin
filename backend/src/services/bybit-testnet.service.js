import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {db} from '../config/db.js';
import {bybitError,bybitRequest} from './bybit-testnet-client.js';

const allowedSymbols = new Set(['BTCUSDT','ETHUSDT','SOLUSDT']);
const orderLinkPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const decimal = value => typeof value === 'string' && /^\d{1,12}(?:\.\d{1,12})?$/.test(value) && /[1-9]/.test(value);
const wallet = credentials => bybitRequest(credentials,'/v5/account/wallet-balance',{accountType:'UNIFIED',coin:'USDT'});

function encryptionKey() {
  let key;
  try {
    key=readFileSync(process.env.BYBIT_TESTNET_KEY_FILE || '/root/.config/goblin-bybit/testnet.key');
  } catch (error) {
    if(error.code!=='ENOENT'&&error.code!=='EACCES')throw error;
  }
  return key?.length===32 ? key : null;
}

function requiredKey() {
  const key=encryptionKey();
  if(!key)throw bybitError('Bybit Testnet ещё не настроен на сервере.',503);
  return key;
}

function seal(userId, credentials) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',requiredKey(),nonce);
  cipher.setAAD(Buffer.from(`bybit-testnet:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials)),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]);
}

function unseal(userId, ciphertext) {
  const cipher = createDecipheriv('aes-256-gcm',requiredKey(),ciphertext.subarray(0,12));
  cipher.setAAD(Buffer.from(`bybit-testnet:${userId}`));
  cipher.setAuthTag(ciphertext.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(ciphertext.subarray(28)),cipher.final()]).toString('utf8'));
}

async function account(userId) {
  const [[row]] = await db.execute('SELECT connection_id,credentials FROM bybit_testnet_accounts WHERE user_id=?',[userId]);
  return row;
}

async function verifyPermissions(credentials) {
  const info = await bybitRequest(credentials,'/v5/user/query-api');
  const permissions = info.permissions;
  if (info.readOnly !== 0 || !permissions?.ContractTrade?.includes('Order') ||
      !permissions.ContractTrade.includes('Position') || !Array.isArray(permissions.Wallet) || permissions.Wallet.length) {
    throw bybitError('Нужен ключ Bybit Testnet с правами фьючерсов Order и Position, без прав Wallet.',422);
  }
}

export async function connectBybit(userId, input) {
  const {key,secret} = input ?? {};
  if (![key,secret].every(value => typeof value === 'string' && /^[A-Za-z0-9]{8,128}$/.test(value))) {
    throw bybitError('Проверьте API Key и API Secret Bybit Testnet.',400);
  }
  const credentials = {key,secret};
  const encrypted = seal(userId,credentials);
  await verifyPermissions(credentials);
  if (!(await wallet(credentials)).list?.[0]) throw bybitError('Нужен аккаунт Bybit Unified Trading.',422);
  const [insert] = await db.execute('INSERT IGNORE INTO bybit_testnet_accounts(user_id,connection_id,credentials) VALUES (?,?,?)',
    [userId,randomUUID(),encrypted]);
  if (!insert.affectedRows) throw bybitError('Сначала отключите текущий аккаунт Bybit.',409);
}

export async function disconnectBybit(userId, connectionId) {
  const [result] = await db.execute('DELETE FROM bybit_testnet_accounts WHERE user_id=? AND connection_id=?',[userId,connectionId ?? '']);
  if (!result.affectedRows) throw bybitError('Подключение изменилось. Обновите страницу.',409);
}

function contract(symbol) {
  if (!allowedSymbols.has(symbol)) throw bybitError('Выберите контракт Bybit.',400);
  return {category:'linear',symbol};
}

export async function bybitState(userId, symbol) {
  const market = contract(symbol);
  if (!encryptionKey()) return {configured:false,connected:false};
  const row = await account(userId);
  if (!row) return {configured:true,connected:false};
  const connection={configured:true,connected:true,connectionId:row.connection_id};
  let balances,positions,orders,tickers;
  try{
    const credentials = unseal(userId,row.credentials);
    [balances,positions,orders,tickers] = await Promise.all([
      wallet(credentials),
      bybitRequest(credentials,'/v5/position/list',market),
      bybitRequest(credentials,'/v5/order/realtime',{...market,openOnly:'0',limit:'50'}),
      bybitRequest(credentials,'/v5/market/tickers',market).catch(()=>null),
    ]);
  }catch(error){
    return {...connection,accountError:error.status?error.message:'Не удалось прочитать подключение Bybit.'};
  }
  const balance = balances.list?.[0];
  const usdt = balance?.coin?.find(coin => coin.coin === 'USDT');
  return {
    ...connection,
    ticker:tickers?.list?.[0]?.lastPrice??null,
    balance:{usdt:usdt?.walletBalance ?? null, availableUsd:balance?.totalAvailableBalance || null},
    positions:(positions.list ?? []).filter(position => ['Buy','Sell'].includes(position.side) && decimal(position.size))
      .map(({positionIdx,side,size,avgPrice,markPrice,unrealisedPnl,leverage}) => ({positionIdx,side,size,avgPrice,markPrice,unrealisedPnl,leverage})),
    orders:(orders.list ?? []).map(({orderId,side,price,qty,cumExecQty,orderStatus}) => ({orderId,side,price,qty,cumExecQty,orderStatus})),
    ordersTruncated:Boolean(orders.nextPageCursor),
  };
}

async function orderCredentials(userId, connectionId) {
  const row = await account(userId);
  if (!row || row.connection_id !== connectionId) throw bybitError('Подключение Bybit изменилось. Обновите страницу.',409);
  return unseal(userId,row.credentials);
}

async function submitOrder(credentials, order) {
  try {
    const result = await bybitRequest(credentials,'/v5/order/create',order,'POST');
    if (result.orderId) return {orderId:result.orderId};
    throw bybitError('Статус ордера неизвестен. Повторите тот же запрос.',502,'BYBIT_UNKNOWN');
  } catch (error) {
    if (error.code !== 'BYBIT_UNKNOWN') throw error;
    const result = await bybitRequest(credentials,'/v5/order/realtime',{
      category:order.category,symbol:order.symbol,orderLinkId:order.orderLinkId,
    }).catch(() => null);
    const found = result?.list?.find(item => item.orderLinkId === order.orderLinkId);
    if (found) return {orderId:found.orderId};
    throw error;
  }
}

export async function placeBybitOrder(userId, input) {
  const {symbol,connectionId,side,type,quantity,price,requestId} = input ?? {};
  const market = contract(symbol);
  if (!['Buy','Sell'].includes(side) || !['Limit','Market'].includes(type) ||
      !decimal(quantity) || (type === 'Limit' && !decimal(price)) || typeof requestId !== 'string' || !orderLinkPattern.test(requestId)) {
    throw bybitError('Проверьте цену и количество.',400);
  }
  const credentials = await orderCredentials(userId,connectionId);
  return submitOrder(credentials,{
    ...market,side,orderType:type,qty:quantity,positionIdx:0,orderLinkId:requestId,
    ...(type === 'Limit' ? {price,timeInForce:'GTC'} : {}),
  });
}

export async function closeBybitPosition(userId, input) {
  const {symbol,connectionId,positionIdx,side,quantity,requestId} = input ?? {};
  const market = contract(symbol);
  if (![0,1,2].includes(positionIdx) || !['Buy','Sell'].includes(side) || !decimal(quantity) ||
      typeof requestId !== 'string' || !orderLinkPattern.test(requestId)) {
    throw bybitError('Некорректные данные позиции.',400);
  }
  const credentials = await orderCredentials(userId,connectionId);
  return submitOrder(credentials,{
    ...market,side:side === 'Buy' ? 'Sell' : 'Buy',orderType:'Market',qty:quantity,
    positionIdx,reduceOnly:true,orderLinkId:requestId,
  });
}

export async function cancelBybitOrder(userId, input) {
  const {symbol,connectionId,orderId} = input ?? {};
  const market = contract(symbol);
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw bybitError('Некорректный ID ордера.',400);
  const credentials = await orderCredentials(userId,connectionId);
  await bybitRequest(credentials,'/v5/order/cancel',{...market,orderId},'POST');
}
