import {sourceChain} from './native-chain-client.js';
import {atomic,proveCustody} from './native-chain-policy.js';
import Decimal from 'decimal.js';
import {referralCustody} from './referral-accrual.service.js';
export async function proveNativeDepositFunding(connection,wallet,currency){
 if(!['BTC','ETH'].includes(currency))return;
 const [[fees]]=await connection.execute('SELECT COALESCE(SUM(l.amount),0) amount FROM admin_treasury_ledger l JOIN blockchain_deposits d ON d.id=l.deposit_id WHERE d.wallet_id=? AND d.credited_at IS NOT NULL',[wallet.id]);
 const [[native]]=await connection.execute('SELECT COALESCE(SUM(amount),0) amount FROM native_fee_ledger WHERE wallet_id=? AND currency=?',[wallet.id,currency]);
 const [[held]]=await connection.execute('SELECT COALESCE(SUM(amount),0) amount FROM blockchain_deposits WHERE wallet_id=? AND credited_at IS NULL',[wallet.id]);
 const chain=await sourceChain(currency,wallet.address);
 const owned=new Decimal(fees.amount).plus(native.amount).plus(held.amount);
 // Referral funds are backed at the fee source, not at this deposit address.
 const localBalance=new Decimal(wallet.balance).minus((await referralCustody(connection,wallet.user_id,currency)).incoming);
 proveCustody(BigInt(chain.balance),atomic(localBalance.toFixed(),currency),atomic(owned.toFixed(),currency));
}
