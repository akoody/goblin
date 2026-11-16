// Админка: Журнал входов по IP и устройствам. Маршруты подключает routes/admin.routes.js после проверки прав.
import { describeLoginDevice } from "../../services/login-device.service.js";
import { loginIpSearch } from "../../services/login-ip-search.js";
import { db } from "../../config/db.js";

export default function register(router) {
router.get("/login-ips", async (req, res) => {
  try {
    const {where,params}=loginIpSearch(req.query.q);
    const [rows] = await db.query(`SELECT l.*, u.username FROM user_login_ips l
      JOIN users u ON u.id = l.user_id
      ${where} ORDER BY (l.is_new_ip = 1 AND l.reviewed_at IS NULL) DESC, l.last_seen_at DESC, l.id DESC LIMIT 200`,params);
    const [[matched]]=await db.query(`SELECT COUNT(*) AS total FROM user_login_ips l JOIN users u ON u.id=l.user_id ${where}`,params);
    const [[counts]] = await db.query("SELECT COUNT(*) AS unread FROM user_login_ips WHERE is_new_ip = 1 AND reviewed_at IS NULL");
    res.set('Cache-Control','no-store').json({ rows: rows.map((row) => ({ ...row, ...describeLoginDevice(row.user_agent, row.device_model) })), unread: Number(counts.unread),total:Number(matched.total) });
  } catch (error) {
    console.error("Login IP list failed:", error.message);
    res.status(error.status||500).json({ message: error.status?error.message:"Не удалось загрузить историю IP" });
  }
});
router.patch("/login-ips/:id/review", async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ message: "Invalid ID" });
  try {
    await db.query("UPDATE user_login_ips SET reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP) WHERE id = ? AND is_new_ip = 1", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Не удалось отметить уведомление" });
  }
});
}
