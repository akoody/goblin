import Decimal from 'decimal.js';
export function bonusDiscount(value){
 const n=new Decimal(String(value));if(!n.isFinite()||n.lte(0)||n.gt(100)||n.decimalPlaces()>2)throw new Error('Скидка должна быть от 0,01 до 100%, до двух знаков после запятой');return n.toFixed(2);
}
export function discountedFeePercent(rate,discount){return new Decimal(String(rate||0)).mul(new Decimal(100).minus(discount||0)).div(100).toFixed(6);}
// Called inside the deal settlement transaction. A rollback also restores the coupon.
export async function consumeFeeBonus(connection,userId,kind,dealId){
  if(!['P2P','ESCROW'].includes(kind))throw new Error('Unknown bonus kind');
  const [[bonus]]=await connection.execute(`SELECT id,discount_percent FROM fee_bonuses WHERE user_id=? AND kind=?
    AND used_at IS NULL AND revoked_at IS NULL ORDER BY id LIMIT 1 FOR UPDATE`,[userId,kind]);
  if(!bonus)return false;
  const [updated]=await connection.execute('UPDATE fee_bonuses SET used_at=NOW(),used_deal_id=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL',[String(dealId),bonus.id]);
  return updated.affectedRows===1?Number(bonusDiscount(bonus.discount_percent??100)):false;
}
