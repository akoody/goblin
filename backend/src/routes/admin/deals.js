// Админка: Сделки по объявлениям от имени админа. Маршруты подключает routes/admin.routes.js после проверки прав.
import { db } from "../../config/db.js";
import { reserveUsdt } from "../../services/wallet-reservation.service.js";

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const parsePaymentMethods = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
};

export default function register(router) {
router.post("/deals", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const orderId = Number(req.body?.orderId);
    const counterpartyUserId = Number(req.body?.counterpartyUserId);
    const cryptoAmount = safeNumber(req.body?.cryptoAmount);
    const requestedPaymentMethod = String(req.body?.paymentMethod || "").trim();
    if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(counterpartyUserId) || counterpartyUserId <= 0 || cryptoAmount <= 0) {
      return res.status(400).json({ message: "Order ID, counterparty ID and positive USDT amount are required" });
    }

    await connection.beginTransaction();
    const [[order]] = await connection.execute("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!order || order.status !== "pending") {
      await connection.rollback();
      return res.status(400).json({ message: "Order is not active" });
    }
    if (Number(order.user_id) === counterpartyUserId) {
      await connection.rollback();
      return res.status(400).json({ message: "Counterparty must differ from the order creator" });
    }
    const [[counterparty]] = await connection.execute(
      "SELECT id FROM users WHERE id = ? AND COALESCE(status, 'active') = 'active' FOR UPDATE",
      [counterpartyUserId]
    );
    if (!counterparty) {
      await connection.rollback();
      return res.status(404).json({ message: "Active counterparty was not found" });
    }

    const availableAmount = safeNumber(order.amount) - safeNumber(order.filled_amount);
    const fiatAmount = cryptoAmount * safeNumber(order.price);
    const minLimit = safeNumber(order.min_limit);
    const maxLimit = safeNumber(order.max_limit) || availableAmount * safeNumber(order.price);
    const paymentMethods = parsePaymentMethods(order.payment_methods);
    const paymentMethod = requestedPaymentMethod || paymentMethods[0];
    if (cryptoAmount > availableAmount || fiatAmount < minLimit || fiatAmount > maxLimit) {
      await connection.rollback();
      return res.status(400).json({ message: "Deal amount is outside the order limits" });
    }
    if (!paymentMethod || !paymentMethods.includes(paymentMethod)) {
      await connection.rollback();
      return res.status(400).json({ message: "Payment method is not available for this order" });
    }

    const buyerId = order.type === "SELL" ? counterpartyUserId : Number(order.user_id);
    const sellerId = order.type === "SELL" ? Number(order.user_id) : counterpartyUserId;
    const [[feePolicy]] = await connection.execute(
      "SELECT p2p_fee_percent FROM commerce_policy WHERE id=1 FOR UPDATE"
    );
    if (!feePolicy) throw Object.assign(new Error("Настройки комиссии P2P не найдены"), { status: 503 });
    await reserveUsdt(connection, sellerId, cryptoAmount);
    const [result] = await connection.execute(
      `INSERT INTO deals (order_id, buyer_id, seller_id, crypto_amount, fiat_amount, price, payment_method, expires_at, crypto_locked, p2p_fee_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), 1, ?)`,
      [order.id, buyerId, sellerId, cryptoAmount, fiatAmount, order.price, paymentMethod, feePolicy.p2p_fee_percent]
    );
    await connection.execute(
      `UPDATE orders
       SET filled_amount = filled_amount + ?, status = CASE WHEN filled_amount + ? >= amount THEN 'completed' ELSE status END
       WHERE id = ?`,
      [cryptoAmount, cryptoAmount, order.id]
    );
    await connection.commit();
    res.status(201).json({ id: result.insertId, orderId: order.id, buyerId, sellerId, cryptoAmount, fiatAmount, paymentMethod });
  } catch (error) {
    await connection.rollback();
    console.error("POST /admin/deals error:", error);
    res.status(error.status || 500).json({ message: error.status ? error.message : "Failed to create P2P deal" });
  } finally {
    connection.release();
  }
});
}
