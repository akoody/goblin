import Decimal from 'decimal.js';
import { db } from '../config/db.js';

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function historyFilters(query = {}) {
  const page = Number(query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) invalid('Неверная страница');
  const filters = { page, direction: String(query.direction || ''), status: String(query.status || ''), currency: String(query.currency || ''), address: String(query.address || '').trim() };
  if (!['', 'IN', 'OUT', 'INTERNAL', 'P2P'].includes(filters.direction)) invalid('Неверное направление');
  if (!['', 'COMPLETED', 'PENDING', 'PENDING_AML', 'PENDING_CHAIN', 'BLOCKED', 'FAILED', 'CANCELLED', 'REVIEW'].includes(filters.status)) invalid('Неверный статус');
  if (filters.currency && !/^[A-Z0-9]{2,16}$/.test(filters.currency)) invalid('Неверная валюта');
  if (filters.address.length > 255) invalid('Слишком длинный адрес');
  for (const key of ['from', 'until']) {
    if (!query[key]) continue;
    const date = new Date(query[key]);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(query[key]) || !Number.isFinite(date.getTime())) invalid('Неверная дата');
    filters[key] = date;
  }
  if (filters.from && filters.until && filters.from >= filters.until) invalid('Дата окончания должна быть позже начала');
  for (const key of ['min', 'max']) {
    if (query[key] == null || query[key] === '') continue;
    const value = String(query[key]).replace(',', '.');
    if (!/^\d{1,18}(\.\d{1,18})?$/.test(value)) invalid('Неверная сумма');
    filters[key] = new Decimal(value).toFixed();
  }
  if (filters.min && filters.max && new Decimal(filters.min).gt(filters.max)) invalid('Максимальная сумма меньше минимальной');
  return filters;
}

// Each branch is scoped before combining it; customer history cannot expose another
// customer's withdrawals or AML reviews. Completed native withdrawals already have
// a transactions row and are deliberately excluded from the jobs branch.
export function historyQuery(filters, { userId, includeP2p = false } = {}) {
  const params = [];
  const scope = (condition, values) => { if (!userId) return ''; params.push(...values); return ` AND (${condition})`; };
  const branches = [
    `SELECT CONCAT('tx-',t.id) COLLATE utf8mb4_unicode_ci AS id, t.created_at AS createdAt,t.amount,t.currency COLLATE utf8mb4_unicode_ci AS currency,
      CASE WHEN LOWER(t.type)='internal' THEN 'INTERNAL' WHEN LOWER(t.type)='withdrawal' THEN 'OUT' WHEN LOWER(t.type)='deposit' THEN 'IN'
        WHEN EXISTS(SELECT 1 FROM wallets source_wallet WHERE source_wallet.currency=t.currency AND source_wallet.address=t.from_address) THEN 'OUT' ELSE 'IN' END COLLATE utf8mb4_unicode_ci AS direction,
      'COMPLETED' COLLATE utf8mb4_unicode_ci AS status,t.from_address COLLATE utf8mb4_unicode_ci AS senderAddress,t.to_address COLLATE utf8mb4_unicode_ci AS receiverAddress,t.tx_hash COLLATE utf8mb4_unicode_ci AS txHash,
      EXISTS(SELECT 1 FROM blockchain_deposits d JOIN deposit_reviews r ON r.deposit_id=d.id WHERE d.wallet_id=t.wallet_id AND d.tx_hash=t.tx_hash AND r.risk_level='NOT_SCREENED') AS amlNotChecked
     FROM transactions t WHERE 1=1${scope(`t.wallet_id IN (SELECT id FROM wallets WHERE user_id=?) OR EXISTS(SELECT 1 FROM wallets w WHERE w.user_id=? AND w.currency=t.currency AND w.address=t.from_address) OR (LOWER(t.type)='internal' AND t.to_address=(SELECT email FROM users WHERE id=?))`, [userId, userId, userId])}`,
    `SELECT CONCAT('tron-',c.id),c.created_at,c.amount,c.currency,'OUT',
      CASE c.status WHEN 'confirmed' THEN 'COMPLETED' WHEN 'failed' THEN 'FAILED' WHEN 'review' THEN 'REVIEW' ELSE 'PENDING' END,
      w.address,c.to_address,c.tx_hash,0
     FROM crypto_withdrawals c JOIN wallets w ON w.id=c.wallet_id WHERE NOT EXISTS(SELECT 1 FROM transactions t WHERE t.tx_hash=c.tx_hash AND t.wallet_id=c.wallet_id AND LOWER(t.type)='withdrawal')${scope('c.user_id=?', [userId])}`,
    `SELECT CONCAT('deposit-',d.id),r.created_at,d.amount,d.currency,'IN',r.status,d.from_address,d.to_address,d.tx_hash,r.aml_exempt
     FROM deposit_reviews r JOIN blockchain_deposits d ON d.id=r.deposit_id JOIN wallets w ON w.id=d.wallet_id
     WHERE r.status<>'CREDITED'${scope('w.user_id=?', [userId])}`,
    `SELECT CONCAT('native-',n.id),n.created_at,
      CAST(JSON_UNQUOTE(JSON_EXTRACT(n.plan_json,'$.amount')) AS DECIMAL(65,18))/CASE WHEN n.currency='BTC' THEN 100000000 ELSE 1000000000000000000 END,
      n.currency,'OUT',CASE n.status WHEN 'failed' THEN 'FAILED' WHEN 'review' THEN 'REVIEW' ELSE 'PENDING' END,
      JSON_UNQUOTE(JSON_EXTRACT(n.plan_json,'$.sources[0].address')),JSON_UNQUOTE(JSON_EXTRACT(n.plan_json,'$.outputs[0].address')),n.tx_hash,0
     FROM native_chain_jobs n WHERE n.kind='withdrawal' AND n.status IN ('prepared','submitted','review','failed')${scope('n.user_id=?', [userId])}`,
  ];
  if (includeP2p && !userId) branches.push(`SELECT CONCAT('p2p-',d.id),d.created_at,d.crypto_amount,'USDT','P2P',CASE d.status WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'PENDING' END,s.email,b.email,NULL,0 FROM deals d JOIN users s ON s.id=d.seller_id JOIN users b ON b.id=d.buyer_id`);
  const where = [];
  for (const key of ['direction', 'status', 'currency']) if (filters[key]) { where.push(`${key}=?`); params.push(filters[key]); }
  if (filters.from) { where.push('createdAt>=?'); params.push(filters.from); }
  if (filters.until) { where.push('createdAt<?'); params.push(filters.until); }
  if (filters.min) { where.push('amount>=?'); params.push(filters.min); }
  if (filters.max) { where.push('amount<=?'); params.push(filters.max); }
  if (filters.address) {
    where.push('(LOCATE(?,senderAddress)>0 OR LOCATE(?,receiverAddress)>0 OR LOCATE(?,txHash)>0 OR LOCATE(?,id)>0)');
    params.push(...Array(4).fill(filters.address));
  }
  return { sql: `FROM (${branches.join(' UNION ALL ')}) history ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, params };
}

export async function transactionHistory(query, options = {}) {
  if (options.administrator !== true && (!Number.isSafeInteger(Number(options.userId)) || Number(options.userId) <= 0)) {
    throw Object.assign(new Error('Требуется авторизация'), {status:401});
  }
  const filters = historyFilters(query);
  const { sql, params } = historyQuery(filters, options);
  const [[count]] = await db.execute(`SELECT COUNT(*) AS total ${sql}`, params);
  const [rows] = await db.execute(`SELECT * ${sql} ORDER BY createdAt DESC,id DESC LIMIT 50 OFFSET ${(filters.page - 1) * 50}`, params);
  return { rows, total: Number(count.total), page: filters.page, pageSize: 50 };
}
