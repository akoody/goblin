import {db} from '../config/db.js';
import {completeWalletInventory} from './wallet-inventory.js';
export async function findWalletUsers(query){
 const q=String(query||'').trim().slice(0,160),escaped=q.replace(/[!%_]/g,'!$&');
 const [rows]=await db.execute(`SELECT id,username,email FROM users WHERE username LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!' OR CAST(id AS CHAR)=? ORDER BY id DESC LIMIT 50`,[`%${escaped}%`,`%${escaped}%`,q]);
 return rows;
}
export async function staffWalletBalances(id){
 if(!/^\d+$/.test(String(id)))throw Object.assign(new Error('Некорректный ID'),{status:400});
 const [[user]]=await db.execute('SELECT id,username FROM users WHERE id=?',[id]);
 if(!user)throw Object.assign(new Error('Пользователь не найден'),{status:404});
 const [wallets]=await db.execute('SELECT currency,CAST(balance AS CHAR) AS total,CAST(COALESCE(locked_balance,0) AS CHAR) AS locked,CAST(balance-COALESCE(locked_balance,0) AS CHAR) AS available FROM wallets WHERE user_id=? ORDER BY currency',[id]);
 const [tokens]=await db.execute('SELECT mint,decimals,CAST(amount_atomic AS CHAR) AS amount_atomic FROM solana_holdings WHERE user_id=? ORDER BY mint',[id]);
 return {user,wallets:completeWalletInventory(wallets),tokens,at:new Date().toISOString()};
}
