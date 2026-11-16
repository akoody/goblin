// Fee-source tests without invited accounts still record a skipped source event.
export function noReferrer(sql) {
  if (sql.includes('SELECT id,payer_id,source_user_id,currency,fee_amount FROM referral_commission_events')) return [[]];
  if (sql.includes('SELECT r.id,r.status FROM users u')) return [[]];
  if (sql.includes('INSERT INTO referral_commission_events')) return [{insertId:1,affectedRows:1}];
  if (sql.includes('FROM referral_commission_events WHERE currency=?')) return [[{outgoing:'0',incoming:'0'}]];
}
