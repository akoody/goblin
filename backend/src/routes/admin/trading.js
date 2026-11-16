// Админка: Сводка торгового терминала. Маршруты подключает routes/admin.routes.js после проверки прав.
import { db } from "../../config/db.js";

const tradingViews = new Set(["fills", "orders", "positions", "funding"]);

let tradingSummaryCache = { expiresAt: 0, value: null };

const getTradingSummary = async () => {
  if (tradingSummaryCache.value && tradingSummaryCache.expiresAt > Date.now()) {
    return tradingSummaryCache.value;
  }
  const [[fills]] = await db.execute(
    `SELECT COUNT(*) AS total_fills,
            COALESCE(SUM(CASE WHEN market = 'SPOT' THEN quote_amount ELSE 0 END), 0) AS spot_volume,
            COALESCE(SUM(CASE WHEN market = 'FUTURES' THEN quote_amount ELSE 0 END), 0) AS futures_volume
     FROM trading_fills`
  );
  const [[orders]] = await db.execute(
    `SELECT COUNT(*) AS open_orders
     FROM trading_orders WHERE status IN ('OPEN', 'PARTIALLY_FILLED')`
  );
  const [[positions]] = await db.execute(
    `SELECT SUM(status = 'OPEN') AS open_positions,
            COALESCE(SUM(realized_pnl), 0) AS realized_pnl,
            COALESCE(SUM(CASE WHEN status = 'OPEN' THEN margin ELSE 0 END), 0) AS open_margin
     FROM futures_positions`
  );

  const value = {
    totalFills: Number(fills.total_fills || 0),
    spotVolume: fills.spot_volume,
    futuresVolume: fills.futures_volume,
    openOrders: Number(orders.open_orders || 0),
    openPositions: Number(positions.open_positions || 0),
    realizedPnl: positions.realized_pnl,
    openMargin: positions.open_margin,
  };
  tradingSummaryCache = { expiresAt: Date.now() + 5_000, value };
  return value;
};

export default function register(router) {
router.get("/trading", async (req, res) => {
  try {
    const view = tradingViews.has(String(req.query.view)) ? String(req.query.view) : "fills";
    const market = ["SPOT", "FUTURES"].includes(String(req.query.market).toUpperCase())
      ? String(req.query.market).toUpperCase()
      : "";
    const symbol = ["BTC-USDT", "ETH-USDT"].includes(String(req.query.symbol).toUpperCase())
      ? String(req.query.symbol).toUpperCase()
      : "";
    const status = String(req.query.status || "").trim().toUpperCase();
    const search = String(req.query.search || "").trim().slice(0, 120);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    let rows;
    let total;

    if (view === "fills") {
      const where = [];
      const params = [];
      if (market) { where.push("f.market = ?"); params.push(market); }
      if (symbol) { where.push("f.symbol = ?"); params.push(symbol); }
      if (search) {
        where.push(`(CAST(f.id AS CHAR) = ? OR buyer.email LIKE ? OR buyer.username LIKE ?
          OR seller.email LIKE ? OR seller.username LIKE ?)`);
        params.push(search, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [[count]] = await db.execute(
        `SELECT COUNT(*) AS total FROM trading_fills f
         JOIN users buyer ON buyer.id = f.buyer_id
         JOIN users seller ON seller.id = f.seller_id ${clause}`,
        params
      );
      [rows] = await db.execute(
        `SELECT f.*, buyer.email AS buyer_email, buyer.username AS buyer_username,
                seller.email AS seller_email, seller.username AS seller_username,
                maker.side AS maker_side, maker.order_type AS maker_type,
                taker.side AS taker_side, taker.order_type AS taker_type
         FROM trading_fills f
         JOIN users buyer ON buyer.id = f.buyer_id
         JOIN users seller ON seller.id = f.seller_id
         JOIN trading_orders maker ON maker.id = f.maker_order_id
         JOIN trading_orders taker ON taker.id = f.taker_order_id
         ${clause} ORDER BY f.created_at DESC, f.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      total = Number(count.total || 0);
    } else if (view === "orders") {
      const where = [];
      const params = [];
      if (market) { where.push("o.market = ?"); params.push(market); }
      if (symbol) { where.push("o.symbol = ?"); params.push(symbol); }
      if (status) { where.push("o.status = ?"); params.push(status); }
      if (search) {
        where.push("(CAST(o.id AS CHAR) = ? OR u.email LIKE ? OR u.username LIKE ?)");
        params.push(search, `%${search}%`, `%${search}%`);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [[count]] = await db.execute(
        `SELECT COUNT(*) AS total FROM trading_orders o JOIN users u ON u.id = o.user_id ${clause}`,
        params
      );
      [rows] = await db.execute(
        `SELECT o.*, u.email AS user_email, u.username AS user_username
         FROM trading_orders o JOIN users u ON u.id = o.user_id
         ${clause} ORDER BY o.created_at DESC, o.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      total = Number(count.total || 0);
    } else if (view === "positions") {
      const where = [];
      const params = [];
      if (symbol) { where.push("p.symbol = ?"); params.push(symbol); }
      if (status) { where.push("p.status = ?"); params.push(status); }
      if (search) {
        where.push("(CAST(p.id AS CHAR) = ? OR u.email LIKE ? OR u.username LIKE ?)");
        params.push(search, `%${search}%`, `%${search}%`);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [[count]] = await db.execute(
        `SELECT COUNT(*) AS total FROM futures_positions p JOIN users u ON u.id = p.user_id ${clause}`,
        params
      );
      [rows] = await db.execute(
        `SELECT p.*, u.email AS user_email, u.username AS user_username
         FROM futures_positions p JOIN users u ON u.id = p.user_id
         ${clause} ORDER BY p.created_at DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      total = Number(count.total || 0);
    } else {
      const where = [];
      const params = [];
      if (symbol) { where.push("fp.symbol = ?"); params.push(symbol); }
      if (search) {
        where.push("(CAST(fp.id AS CHAR) = ? OR u.email LIKE ? OR u.username LIKE ?)");
        params.push(search, `%${search}%`, `%${search}%`);
      }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [[count]] = await db.execute(
        `SELECT COUNT(*) AS total FROM funding_payments fp JOIN users u ON u.id = fp.user_id ${clause}`,
        params
      );
      [rows] = await db.execute(
        `SELECT fp.*, u.email AS user_email, u.username AS user_username,
                p.side AS position_side, p.leverage AS position_leverage
         FROM funding_payments fp
         JOIN users u ON u.id = fp.user_id
         JOIN futures_positions p ON p.id = fp.position_id
         ${clause} ORDER BY fp.created_at DESC, fp.id DESC LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      total = Number(count.total || 0);
    }

    res.json({
      view,
      items: rows,
      total,
      limit,
      offset,
      summary: await getTradingSummary(),
    });
  } catch (err) {
    console.error("GET /admin/trading error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ message: "Trading database migration is not applied" });
    }
    res.status(500).json({ message: "Failed to fetch trading history" });
  }
});
}
