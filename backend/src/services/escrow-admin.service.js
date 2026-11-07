import { db } from '../config/db.js';

export const escrowStatuses = ['WAITING', 'READY', 'FUNDED', 'DELIVERED', 'DISPUTED', 'COMPLETED', 'REFUNDED', 'CANCELLED'];
export function escrowAdminFilter(query = {}, adminId) {
  const page = Number(query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw Object.assign(new Error('Некорректная страница'), { status: 400 });
  if (query.q != null && typeof query.q !== 'string') throw Object.assign(new Error('Некорректный поиск'), { status: 400 });
  const status = query.status ?? 'all';
  if (!['all', 'waiting', 'active', 'closed', 'unread', ...escrowStatuses].includes(status)) throw Object.assign(new Error('Некорректный статус'), { status: 400 });
  const conditions = ["d.kind='ESCROW'"], params = [];
  if (status === 'waiting') conditions.push("d.status IN ('WAITING','READY')");
  else if (status === 'active') conditions.push("d.status IN ('FUNDED','DELIVERED','DISPUTED')");
  else if (status === 'closed') conditions.push("d.status IN ('COMPLETED','REFUNDED','CANCELLED')");
  else if (status === 'unread') {
    conditions.push(`EXISTS (
      SELECT 1 FROM commerce_messages um
      LEFT JOIN commerce_admin_deal_reads ur ON ur.admin_id=? AND ur.deal_id=d.id
      WHERE um.deal_id=d.id AND um.sender_id IN (d.buyer_id,d.seller_id)
        AND um.id>COALESCE(ur.last_read_message_id,0)
    )`);
    params.push(adminId);
  }
  else if (status !== 'all') { conditions.push('d.status=?'); params.push(status); }
  const term = (query.q || '').trim().slice(0, 160);
  if (term) {
    const like = `%${term.replace(/[!%_]/g, character => '!' + character)}%`;
    conditions.push("(d.id LIKE ? ESCAPE '!' OR d.title LIKE ? ESCAPE '!' OR b.username LIKE ? ESCAPE '!' OR s.username LIKE ? ESCAPE '!' OR CAST(d.buyer_id AS CHAR)=? OR CAST(d.seller_id AS CHAR)=?)");
    params.push(like, like, like, like, term.replace(/^#/, ''), term.replace(/^#/, ''));
  }
  return { page, where: 'WHERE ' + conditions.join(' AND '), params };
}

export async function escrowAdminList(query, adminId) {
  const { page, where, params } = escrowAdminFilter(query, adminId);
  const c = await db.getConnection();
  const joins = `FROM commerce_deals d LEFT JOIN users b ON b.id=d.buyer_id LEFT JOIN users s ON s.id=d.seller_id
    LEFT JOIN commerce_admin_deal_reads ar ON ar.admin_id=? AND ar.deal_id=d.id`;
  const queryParams = [adminId, ...params];
  try {
    await c.beginTransaction();
    const [[count]] = await c.query(`SELECT COUNT(*) AS total ${joins} ${where}`, queryParams);
    const [rows] = await c.query(`SELECT d.id,d.title,d.status,d.amount,d.currency,d.guarantor_fee_percent,d.buyer_id,d.seller_id,d.created_at,d.updated_at,
      b.username AS buyer_name,s.username AS seller_name,
      (SELECT COUNT(*) FROM commerce_messages m WHERE m.deal_id=d.id
        AND m.sender_id IN (d.buyer_id,d.seller_id)
        AND m.id>COALESCE(ar.last_read_message_id,0)) AS unread_count
      ${joins} ${where}
      ORDER BY unread_count DESC,(d.status='DISPUTED') DESC,d.updated_at DESC,d.id DESC LIMIT 25 OFFSET ?`, [...queryParams, (page - 1) * 25]);
    await c.commit();
    return { rows, total: Number(count.total), page, pageSize: 25 };
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}
