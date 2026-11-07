import Decimal from 'decimal.js';
import {proveNativeDepositFunding} from './native-deposit-proof.js';
import { db } from '../config/db.js';
import { transact } from './commerce.service.js';
import { depositSettlement, validateManualReview, depositPrecisions,bitcoinUnscreenedAllowed } from './deposit-policy.js';
import { depositQuote } from './deposit-quote.service.js';
import { safioConfigured, validateSafioResult, canAutoCreditSafio } from './safio-client.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

export async function recordPendingDeposit({wallet,currency,network='TRON',txHash,eventIndex=0,from,to,amount,timestamp}) {
  const networks={USDT:'TRON',TRX:'TRON',SOL:'SOLANA',BTC:'BITCOIN',ETH:'ETHEREUM'};
  if(!Object.hasOwn(networks,currency)||network!==networks[currency]||typeof txHash!=='string'||!txHash||!Number.isInteger(eventIndex)||eventIndex<0||!Number.isFinite(timestamp)||timestamp<=0)fail('Некорректное событие депозитного процессинга');
  const value=new Decimal(String(amount));if(!value.isFinite()||value.lte(0)||value.decimalPlaces()>depositPrecisions[currency])fail('Некорректная сумма поступления');
  return transact(async c=>{
    if(network==='TRON'){
      const [[swap]]=await c.execute('SELECT tx_hash FROM tron_swap_transactions WHERE tx_hash=? LIMIT 1',[txHash]);
      if(swap)return false;
      const [[gas]]=await c.execute('SELECT id FROM treasury_collection_gas_grants WHERE tx_hash=? AND source_address=? LIMIT 1',[txHash,to]);
      if(gas&&currency==='TRX')return false;
    }
    const [[policy]]=await c.execute('SELECT fee_usd,min_usd FROM deposit_policy WHERE id=1');
    if(!policy)throw new Error('Deposit policy missing');
    const [insert]=await c.execute(`INSERT IGNORE INTO blockchain_deposits
      (wallet_id,network,currency,tx_hash,event_index,from_address,to_address,amount,block_timestamp,credited_at)
      VALUES (?,?,?,?,?,?,?,?,?,NULL)`,[wallet.id,network,currency,txHash,eventIndex,from,to,amount,timestamp]);
    if(insert.affectedRows!==1)return false;
    let exempt=false;
    if(currency==='BTC'){
      const [[btc]]=await c.execute("SELECT aml_disabled FROM native_chain_policy WHERE currency='BTC'");
      exempt=Number(btc?.aml_disabled)===1;
    }
    await c.execute('INSERT INTO deposit_reviews (deposit_id,fee_usd,min_usd,status,aml_exempt) VALUES (?,?,?,?,?)',[insert.insertId,policy.fee_usd,policy.min_usd,exempt?'PENDING_CHAIN':'PENDING_AML',exempt?1:0]);
    return true;
  });
}
export async function depositComplianceOverview() {
  const [[policy]]=await db.query('SELECT fee_usd,min_usd,updated_at FROM deposit_policy WHERE id=1');
  const [balances]=await db.query('SELECT currency,balance FROM admin_treasury ORDER BY currency');
  const [depositIncome]=await db.query(`SELECT currency,SUM(amount) AS amount,COUNT(*) AS count
    FROM admin_treasury_ledger GROUP BY currency ORDER BY currency`);
  const [[guarantorIncome]]=await db.query(`SELECT COALESCE(SUM(fee_amount),0) AS amount,COUNT(*) AS count
    FROM commerce_guarantor_fee_ledger WHERE fee_amount>0`);
  const [[p2pIncome]]=await db.query(`SELECT COALESCE(SUM(fee_amount),0) AS amount,COUNT(*) AS count
    FROM p2p_fee_ledger WHERE fee_amount>0`);
  const [referralPayouts]=await db.query(`SELECT currency,SUM(amount) AS amount,COUNT(*) AS count
    FROM referral_rewards GROUP BY currency ORDER BY currency`);
  const [[referralCount]]=await db.query('SELECT COUNT(*) AS count FROM users WHERE referred_by IS NOT NULL');
  const [referralDeposits]=await db.query(`SELECT d.currency,
      SUM(COALESCE(r.net_amount,d.amount)) AS amount,COUNT(*) AS count
    FROM users invited
    JOIN wallets w ON w.user_id=invited.id
    JOIN blockchain_deposits d ON d.wallet_id=w.id AND d.credited_at IS NOT NULL
    LEFT JOIN deposit_reviews r ON r.deposit_id=d.id
    WHERE invited.referred_by IS NOT NULL
    GROUP BY d.currency ORDER BY d.currency`);
  const [totalIncome]=await db.query(`SELECT currency,SUM(amount) AS amount,SUM(item_count) AS count FROM (
      SELECT currency,SUM(amount) AS amount,COUNT(*) AS item_count FROM admin_treasury_ledger GROUP BY currency
      UNION ALL
      SELECT 'USDT' AS currency,SUM(fee_amount) AS amount,COUNT(*) AS item_count
        FROM commerce_guarantor_fee_ledger WHERE fee_amount>0
      UNION ALL
      SELECT 'USDT' AS currency,SUM(fee_amount) AS amount,COUNT(*) AS item_count
        FROM p2p_fee_ledger WHERE fee_amount>0
      UNION ALL
      SELECT currency,SUM(amount) AS amount,COUNT(*) AS item_count
        FROM native_fee_ledger WHERE kind='withdrawal' GROUP BY currency
    ) collected GROUP BY currency ORDER BY currency`);
  const [deposits]=await db.query(`SELECT d.id,d.currency,d.network,d.tx_hash,d.event_index,d.from_address,d.to_address,d.amount,d.block_timestamp,d.credited_at,
    r.*,a.status AS aml_status,a.check_id AS aml_check_id,a.error_code AS aml_error,w.user_id,u.username FROM deposit_reviews r JOIN blockchain_deposits d ON d.id=r.deposit_id JOIN wallets w ON w.id=d.wallet_id JOIN users u ON u.id=w.user_id LEFT JOIN deposit_aml_checks a ON a.deposit_id=d.id
    ORDER BY (r.status IN ('PENDING_AML','PENDING_CHAIN')) DESC,r.created_at DESC,d.id DESC LIMIT 200`);
  const [ledger]=await db.query(`SELECT l.*,u.username FROM admin_treasury_ledger l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 200`);
  const [[counts]]=await db.query("SELECT COUNT(*) AS pending FROM deposit_reviews WHERE status IN ('PENDING_AML','PENDING_CHAIN')");
  return {policy:{feeUsd:policy.fee_usd,minUsd:policy.min_usd,amlMode:safioConfigured()?'SAFIO_AUTO_LOW_RISK':'AWAITING_PROVIDER',updatedAt:policy.updated_at},balances,
    income:{deposits,guarantor:{currency:'USDT',amount:String(guarantorIncome.amount),count:Number(guarantorIncome.count)},
      p2p:{currency:'USDT',amount:String(p2pIncome.amount),count:Number(p2pIncome.count),enabled:true},total:totalIncome,
      referralPayouts:referralPayouts.map(item=>({...item,count:Number(item.count)})),
      referrals:{registeredCount:Number(referralCount.count),deposits:referralDeposits.map(item=>({...item,count:Number(item.count)}))}},
    deposits,ledger,pending:Number(counts.pending)};
}
export async function updateDepositFee(actor,feeUsd) {
  let fee;try{fee=new Decimal(String(feeUsd));}catch{fail('Некорректная комиссия');}
    if(!fee.isFinite()||fee.lt(0)||fee.gte(5)||fee.decimalPlaces()>2)fail('Комиссия должна быть от 0 до 4,99 USDT, ниже минимального депозита');
  await transact(async c=>{
    const [[old]]=await c.execute('SELECT fee_usd FROM deposit_policy WHERE id=1 FOR UPDATE');
    await c.execute('UPDATE deposit_policy SET fee_usd=?,updated_by=? WHERE id=1',[fee.toFixed(2),actor]);
    await c.execute('INSERT INTO deposit_policy_audit (actor_id,previous_fee,new_fee) VALUES (?,?,?)',[actor,old.fee_usd,fee.toFixed(2)]);
  });return {feeUsd:fee.toFixed(2)};
}
export async function reviewDeposit(actor,id,body) {
  return settleDepositReview(actor,id,body,false);
}

export async function autoApproveDeposit(id) {
  return settleDepositReview(null,id,{action:'APPROVE',provider:'Safio',reference:'Authenticated Safio screening',riskLevel:'LOW',note:'Автоматическое зачисление: Safio, низкий риск, полное покрытие, разрешающий результат.'},true);
}
export async function autoApproveBitcoinWithoutAml(id){
  return settleDepositReview(null,id,{action:'APPROVE',provider:'NO_AML',reference:'Bitcoin confirmations; AML explicitly disabled by administrator',riskLevel:'NOT_SCREENED',note:'Автоматическое зачисление BTC после подтверждений сети и сверки покрытия. AML не выполнялся: отключён администратором.'},true,true);
}

async function settleDepositReview(actor,id,body,automatic,withoutAml=false) {
  if(!/^\d+$/.test(String(id)))fail('Некорректный ID');
  if(!withoutAml)validateManualReview(body);
  const [[preview]]=await db.execute('SELECT currency FROM blockchain_deposits WHERE id=?',[id]);if(!preview)fail('Депозит не найден',404);
  if(withoutAml&&preview.currency!=='BTC')fail('Режим без AML разрешён только для BTC',403);
  const quote=body.action==='APPROVE'?await depositQuote(preview.currency):null;
  return transact(async c=>{
    const [[deposit]]=await c.execute(`SELECT d.*,r.status,r.fee_usd,r.min_usd,r.aml_exempt FROM blockchain_deposits d JOIN deposit_reviews r ON r.deposit_id=d.id WHERE d.id=? FOR UPDATE`,[id]);
    if(!deposit)fail('Депозит не найден',404);
    if(!['PENDING_AML','PENDING_CHAIN'].includes(deposit.status)) {
      if(automatic)return {status:deposit.status};
      fail('Депозит уже обработан',409);
    }
    if(withoutAml){
      const [[policy]]=await c.execute("SELECT currency,aml_disabled,deposits_enabled FROM native_chain_policy WHERE currency='BTC' FOR UPDATE");
      if(!bitcoinUnscreenedAllowed(deposit,policy))fail('Зачисление BTC без AML не разрешено для этого депозита',409);
    }
    if(body.action==='APPROVE'&&!withoutAml) {
      const [[screening]]=await c.execute('SELECT status,result_json,check_id FROM deposit_aml_checks WHERE deposit_id=? FOR UPDATE',[id]);
      if(screening) {
        let assessment;
        try {
          const report=typeof screening.result_json==='string'?JSON.parse(screening.result_json):screening.result_json;
          assessment=report&&validateSafioResult(report,deposit);
          if(automatic&&!canAutoCreditSafio(report,deposit))fail('Депозит требует ручной проверки',409);
        } catch { fail('Отчёт Safio не соответствует депозиту',409); }
        if(screening.status!=='completed'||!assessment||!['LOW','MEDIUM'].includes(assessment.riskLevel))fail('Проверка Safio не разрешает зачисление: высокий риск, неполные данные или проверка ещё не завершена',409);
        body={...body,provider:'Safio',reference:`Safio check ${screening.check_id}; sender address screening`,riskLevel:assessment.riskLevel};
      }
      else if(automatic)fail('Нет завершённой проверки Safio',409);
    }
    const [[wallet]]=await c.execute('SELECT w.*,u.status AS user_status,u.deposits_enabled FROM wallets w JOIN users u ON u.id=w.user_id WHERE w.id=? FOR UPDATE',[deposit.wallet_id]);
    if(body.action==='BLOCK'){
      const risk=['LOW','MEDIUM','HIGH'].includes(body.riskLevel)?body.riskLevel:null;
      const provider=typeof body.provider==='string'?body.provider.trim().slice(0,120)||null:null;
      const reference=typeof body.reference==='string'?body.reference.trim().slice(0,1000)||null:null;
      await c.execute("UPDATE deposit_reviews SET status='BLOCKED',reviewer_id=?,review_note=?,risk_level=?,report_provider=?,report_reference=?,reviewed_at=NOW() WHERE deposit_id=?",[actor,body.note.trim(),risk,provider,reference,id]);
      return {status:'BLOCKED'};
    }
    if(wallet.status!=='active'||wallet.user_status!=='active'||Number(wallet.deposits_enabled)!==1)fail('Зачисления для аккаунта отключены',403);
    await proveNativeDepositFunding(c,wallet,deposit.currency);
    if(!quote||Date.now()-quote.at.getTime()>60000)fail('Курс устарел, повторите проверку',503);
    const settlement=depositSettlement({amount:deposit.amount,currency:deposit.currency,feeUsd:deposit.fee_usd,quote:quote.price,minUsd:deposit.min_usd});
    await c.execute('UPDATE wallets SET balance=balance+? WHERE id=?',[settlement.net,wallet.id]);
    await c.execute(`INSERT INTO transactions (wallet_id,tx_hash,from_address,to_address,amount,currency,type) VALUES (?,?,?,?,?,?,'deposit')`,[wallet.id,deposit.tx_hash,deposit.from_address,deposit.to_address,settlement.net,deposit.currency]);
    await c.execute('INSERT INTO admin_treasury (currency,balance) VALUES (?,?) ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance)',[deposit.currency,settlement.fee]);
    await c.execute('INSERT INTO admin_treasury_ledger (deposit_id,user_id,currency,amount,fee_usd) VALUES (?,?,?,?,?)',[id,wallet.user_id,deposit.currency,settlement.fee,deposit.fee_usd]);
    await c.execute(`UPDATE deposit_reviews SET status='CREDITED',fee_amount=?,net_amount=?,quote_price=?,quote_source=?,quote_at=?,report_provider=?,report_reference=?,risk_level=?,review_note=?,reviewer_id=?,reviewed_at=NOW(),chain_error=NULL,chain_retry_at=NULL WHERE deposit_id=?`,[settlement.fee,settlement.net,quote.price,quote.source,quote.at,body.provider.trim(),body.reference.trim(),body.riskLevel,body.note.trim(),actor,id]);
    await c.execute('UPDATE blockchain_deposits SET credited_at=NOW() WHERE id=?',[id]);
    return {status:'CREDITED',fee:settlement.fee,net:settlement.net,currency:deposit.currency};
  });
}
