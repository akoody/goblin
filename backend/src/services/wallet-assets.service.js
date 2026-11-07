import {db} from '../config/db.js';
import {completeWalletInventory} from './wallet-inventory.js';
const nativeAssets={USDT:['Tether','TRON · TRC-20'],TRX:['TRON','TRON'],BTC:['Bitcoin','Bitcoin'],ETH:['Ethereum','Ethereum'],SOL:['Solana','Solana']};
export async function walletAssets(userId){
 const [rows]=await db.execute(`SELECT currency,CAST(balance AS CHAR) AS total,
 CAST(COALESCE(locked_balance,0) AS CHAR) AS locked,
 CAST(balance-COALESCE(locked_balance,0) AS CHAR) AS available
 FROM wallets WHERE user_id=? ORDER BY currency`,[userId]);
 const coins=completeWalletInventory(rows).map(w=>({id:`coin:${w.currency}`,kind:'coin',symbol:w.currency,name:nativeAssets[w.currency]?.[0]||w.currency,network:nativeAssets[w.currency]?.[1]||'Сеть уточняется',total:w.total,available:w.available,locked:w.locked,action:['BTC','ETH','USDT','TRX'].includes(w.currency)?'legacy':w.currency==='SOL'?'solana':'readOnly'}));
 const [tokens]=await db.execute(`SELECT h.mint,h.decimals,CAST(h.amount_atomic AS CHAR) AS amount_atomic,
 l.name,l.symbol,CASE WHEN l.user_id=? THEN 1 ELSE 0 END AS created_by_you
 FROM solana_holdings h LEFT JOIN pump_launches l ON l.mint=h.mint AND l.status='completed'
 WHERE h.user_id=? ORDER BY h.mint`,[userId,userId]);
 coins.sort((a,b)=>{const order=Object.keys(nativeAssets);return (order.includes(a.symbol)?order.indexOf(a.symbol):99)-(order.includes(b.symbol)?order.indexOf(b.symbol):99)||a.symbol.localeCompare(b.symbol);});
 return {coins,tokens:tokens.map(t=>({id:`solana:${t.mint}`,kind:'token',mint:t.mint,decimals:Number(t.decimals),amountAtomic:t.amount_atomic,symbol:t.symbol||'SPL',name:t.name||'Токен Solana',network:'Solana',createdByYou:Number(t.created_by_you)===1,action:'readOnly'})),updatedAt:new Date().toISOString()};
}
