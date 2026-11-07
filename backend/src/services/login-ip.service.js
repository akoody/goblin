import { isIP } from "node:net";
import { cleanDeviceModel } from "./login-device.service.js";

export function normalizeLoginIp(value) {
  let ip = String(value || "").trim().split("%")[0];
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (!isIP(ip)) return null;
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ip;
}

// Lock the account so simultaneous first logins cannot both become the baseline.
export async function recordLoginIp(pool, userId, context) {
  const ip = normalizeLoginIp(context.ip);
  if (!ip) throw new Error("Unable to determine login IP");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
    const [known] = await connection.query("SELECT id FROM user_login_ips WHERE user_id = ? AND ip = ?", [userId, ip]);
    const agent = String(context.userAgent || "").slice(0, 512);
    const model = cleanDeviceModel(context.deviceModel);
    if (known.length) {
      await connection.query("UPDATE user_login_ips SET last_seen_at = CURRENT_TIMESTAMP, login_count = login_count + 1, user_agent = ?, device_model = ? WHERE id = ?", [agent, model, known[0].id]);
    } else {
      const [previous] = await connection.query("SELECT ip FROM user_login_ips WHERE user_id = ? ORDER BY last_seen_at DESC, id DESC LIMIT 1", [userId]);
      await connection.query("INSERT INTO user_login_ips (user_id, ip, previous_ip, user_agent, is_new_ip, device_model) VALUES (?, ?, ?, ?, ?, ?)", [userId, ip, previous[0]?.ip || null, agent, previous.length ? 1 : 0, model]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
