// Админка: История транзакций. Маршруты подключает routes/admin.routes.js после проверки прав.
import { transactionHistory } from "../../services/transaction-history.service.js";
import { db } from "../../config/db.js";

export default function register(router) {
router.get('/transaction-history', async (req,res) => {
  try {res.set('Cache-Control','no-store').json(await transactionHistory(req.query,{administrator:true,includeP2p:req.staffAccess.role==='admin'||req.staffAccess.permissions.includes('p2p')}));}
  catch(e){res.status(e.status||500).json({message:e.status?e.message:'Не удалось загрузить историю'});}
});
router.get("/transactions", async (req, res) => {
  try {
    const [transferRows] = await db.execute(
      `SELECT t.id,
              t.amount,
              t.currency,
              t.type,
              t.tx_hash,
              t.from_address,
              t.to_address,
              t.created_at,
              sender.email AS sender_email,
              receiver.email AS receiver_email
       FROM transactions t
       LEFT JOIN wallets sw ON sw.address = t.from_address
       LEFT JOIN users sender ON sender.id = sw.user_id
       LEFT JOIN wallets rw ON rw.id = t.wallet_id
       LEFT JOIN users receiver ON receiver.id = rw.user_id
       ORDER BY t.created_at DESC
       LIMIT 300`
    );

    const [dealRows] = await db.execute(
      `SELECT d.id,
              d.crypto_amount,
              d.fiat_amount,
              d.price,
              d.payment_method,
              d.status,
              d.created_at,
              buyer.email AS buyer_email,
              seller.email AS seller_email,
              o.id AS order_id,
              o.type AS order_type
       FROM deals d
       JOIN orders o ON o.id = d.order_id
       JOIN users buyer ON buyer.id = d.buyer_id
       JOIN users seller ON seller.id = d.seller_id
       ORDER BY d.created_at DESC
       LIMIT 300`
    );

    const transfers = transferRows.map((row) => ({
      id: `tx-${row.id}`,
      rawId: row.id,
      source: row.type === "internal" ? "internal_transfer" : "external_transfer",
      type: row.type === "internal" ? "Внутренний перевод" : "Ввод/вывод",
      status: "completed",
      amount: row.amount,
      currency: row.currency,
      fiatAmount: null,
      from: row.sender_email || row.from_address,
      to: row.receiver_email || row.to_address,
      createdAt: row.created_at,
      txHash: row.tx_hash,
    }));

    const p2p = dealRows.map((row) => ({
      id: `p2p-${row.id}`,
      rawId: row.id,
      source: "p2p",
      type: "P2P сделка",
      status: row.status,
      amount: row.crypto_amount,
      currency: "USDT",
      fiatAmount: row.fiat_amount,
      price: row.price,
      from: row.seller_email,
      to: row.buyer_email,
      paymentMethod: row.payment_method,
      orderId: row.order_id,
      orderType: row.order_type,
      createdAt: row.created_at,
    }));

    const includeP2p=req.staffAccess.role==='admin'||req.staffAccess.permissions.includes('p2p');
    res.json([...transfers, ...(includeP2p?p2p:[])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    console.error("GET /admin/transactions error:", err);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
});
}
