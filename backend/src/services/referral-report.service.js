import { db } from '../config/db.js';

export const makeReferralCode = id => `GBL${Number(id).toString(36).toUpperCase().padStart(6, '0')}`;

export function referralReportFilter(query = {}) {
  const page = Number(query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) {
    throw Object.assign(new Error('Некорректная страница'), { status: 400 });
  }
  if (query.q !== undefined && typeof query.q !== 'string') {
    throw Object.assign(new Error('Некорректный поиск'), { status: 400 });
  }
  const search = (query.q || '').trim().slice(0, 160);
  const value = `%${search.replace(/[!%_]/g, character => `!${character}`)}%`;
  const where = search ? `WHERE (u.username LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!' OR u.referral_code LIKE ? ESCAPE '!' OR CAST(u.id AS CHAR) = ?)` : '';
  return { page, where, params: search ? [value, value, value, search.replace(/^#/, '')] : [] };
}

// Only external chain receipts count. Internal transfers, trades and current
// wallet balances are not deposits. Never join receipts directly to invite counts.
const depositColumns = `d.currency,
  SUM(CASE WHEN d.credited_at IS NOT NULL THEN d.amount ELSE 0 END) AS gross,
  SUM(CASE WHEN d.credited_at IS NOT NULL THEN COALESCE(r.fee_amount,0) ELSE 0 END) AS fee,
  SUM(CASE WHEN d.credited_at IS NOT NULL THEN COALESCE(r.net_amount,d.amount) ELSE 0 END) AS net,
  SUM(CASE WHEN r.status='PENDING_AML' THEN d.amount ELSE 0 END) AS pending,
  SUM(CASE WHEN r.status='BLOCKED' THEN d.amount ELSE 0 END) AS blocked,
  SUM(d.credited_at IS NOT NULL) AS creditedCount`;

export async function referralReport(query = {}) {
  const { page, where, params } = referralReportFilter(query);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[count]] = await connection.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    const [rows] = await connection.query(`SELECT u.id,u.username,u.email,u.referral_code AS code,
      (SELECT COUNT(*) FROM users i WHERE i.referred_by=u.id) AS invitedCount
      FROM users u ${where} ORDER BY u.id DESC LIMIT 25 OFFSET ?`, [...params, (page - 1) * 25]);
    let amounts = [];
    if (rows.length) {
      [amounts] = await connection.query(`SELECT i.referred_by AS referrerId,${depositColumns}
        FROM users i JOIN wallets w ON w.user_id=i.id
        JOIN blockchain_deposits d ON d.wallet_id=w.id
        LEFT JOIN deposit_reviews r ON r.deposit_id=d.id
        WHERE i.referred_by IN (?) GROUP BY i.referred_by,d.currency`, [rows.map(row => row.id)]);
    }
    await connection.commit();
    return { page, pageSize: 25, total: Number(count.total), rows: rows.map(row => ({
      ...row, invitedCount: Number(row.invitedCount), amounts: amounts.filter(item => String(item.referrerId) === String(row.id)),
    })) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function referralInvitees(id, query = {}) {
  if (!/^\d+$/.test(String(id))) throw Object.assign(new Error('Некорректный ID'), { status: 400 });
  const { page } = referralReportFilter(query);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM users WHERE referred_by=?', [id]);
    const [rows] = await connection.query(`SELECT id,username,email,created_at AS createdAt FROM users
      WHERE referred_by=? ORDER BY id DESC LIMIT 25 OFFSET ?`, [id, (page - 1) * 25]);
    let amounts = [];
    if (rows.length) {
      [amounts] = await connection.query(`SELECT w.user_id AS userId,${depositColumns}
        FROM wallets w JOIN blockchain_deposits d ON d.wallet_id=w.id
        LEFT JOIN deposit_reviews r ON r.deposit_id=d.id
        WHERE w.user_id IN (?) GROUP BY w.user_id,d.currency`, [rows.map(row => row.id)]);
    }
    await connection.commit();
    return { page, pageSize: 25, total: Number(count.total), rows: rows.map(row => ({ ...row,
      amounts: amounts.filter(item => String(item.userId) === String(row.id)),
    })) };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function issueReferralLink(id) {
  if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    throw Object.assign(new Error('Некорректный ID'), { status: 400 });
  }
  await db.execute("UPDATE users SET referral_code=? WHERE id=? AND (referral_code IS NULL OR referral_code='')", [makeReferralCode(id), id]);
  const [[user]] = await db.execute('SELECT referral_code AS code FROM users WHERE id=?', [id]);
  if (!user) throw Object.assign(new Error('Пользователь не найден'), { status: 404 });
  return user;
}
