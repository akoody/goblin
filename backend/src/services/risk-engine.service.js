import { db } from "../config/db.js";
import { closeFuturesPosition } from "./exchange.service.js";
import { getMarketSnapshot } from "./market-data.service.js";
import Decimal from "decimal.js";

const INTERVAL_MS = 15_000;
let running = false;

const fundingBoundary = () => {
  const now = new Date();
  const hour = Math.floor(now.getUTCHours() / 8) * 8;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
};

async function applyFunding(symbol, indexPrice) {
  const boundary = fundingBoundary();
  if (Date.now() - boundary.getTime() > 10 * 60_000) return;
  const connection = await db.getConnection();
  try {
    const [[lock]] = await connection.query(`SELECT GET_LOCK(?, 2) AS acquired`, [`funding:${symbol}`]);
    if (!lock.acquired) return;
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      `SELECT id FROM futures_funding_rounds WHERE symbol = ? AND funding_time = ?`, [symbol, boundary]
    );
    if (existing.length) { await connection.rollback(); return; }
    const [[lastFill]] = await connection.execute(
      `SELECT price FROM trading_fills WHERE market = 'FUTURES' AND symbol = ? ORDER BY created_at DESC LIMIT 1`,
      [symbol]
    );
    const index = new Decimal(indexPrice);
    const mark = new Decimal(lastFill?.price || indexPrice);
    const premium = mark.minus(index).div(index).plus("0.0001");
    const rate = Decimal.max("-0.00075", Decimal.min("0.00075", premium));
    const [round] = await connection.execute(
      `INSERT INTO futures_funding_rounds (symbol, funding_time, mark_price, index_price, rate)
       VALUES (?, ?, ?, ?, ?)`, [symbol, boundary, mark.toFixed(18), index.toFixed(18), rate.toFixed(10)]
    );
    const [positions] = await connection.execute(
      `SELECT * FROM futures_positions WHERE symbol = ? AND status = 'OPEN' FOR UPDATE`, [symbol]
    );
    for (const position of positions) {
      const absolute = mark.mul(position.quantity).mul(rate).abs();
      const longPays = rate.gte(0);
      const pays = (position.side === "LONG") === longPays;
      const amount = pays ? absolute.neg() : absolute;
      await connection.execute(`UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND currency = 'USDT'`,
        [amount.toFixed(18), position.user_id]);
      await connection.execute(
        `INSERT INTO funding_payments (position_id, user_id, symbol, rate, amount) VALUES (?, ?, ?, ?, ?)`,
        [position.id, position.user_id, symbol, rate.toFixed(10), amount.toFixed(18)]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.query(`SELECT RELEASE_LOCK(?)`, [`funding:${symbol}`]).catch(() => {});
    connection.release();
  }
}

async function liquidateCrossedPositions() {
  if (running) return;
  running = true;
  try {
    for (const symbol of ["BTC-USDT", "ETH-USDT"]) {
      const snapshot = await getMarketSnapshot(symbol);
      const mark = Number(snapshot.price);
      await applyFunding(symbol, snapshot.price);
      const [positions] = await db.execute(
        `SELECT id, user_id, side, liquidation_price FROM futures_positions
         WHERE symbol = ? AND status = 'OPEN'`, [symbol]
      );
      const crossed = positions.filter((position) =>
        position.side === "LONG"
          ? mark <= Number(position.liquidation_price)
          : mark >= Number(position.liquidation_price)
      );
      for (const position of crossed) {
        try {
          await closeFuturesPosition(position.user_id, position.id);
        } catch (error) {
          console.error(`Liquidation ${position.id} deferred:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error("Risk engine cycle failed:", error.message);
  } finally {
    running = false;
  }
}

export function startRiskEngine() {
  const timer = setInterval(liquidateCrossedPositions, INTERVAL_MS);
  timer.unref?.();
  setTimeout(liquidateCrossedPositions, 1_000).unref?.();
  return () => clearInterval(timer);
}
