import Decimal from "decimal.js";
import { db } from "../config/db.js";
import { isSupportedSymbol } from "./market-data.service.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

const MARKETS = new Set(["SPOT", "FUTURES"]);
const SIDES = new Set(["BUY", "SELL"]);
const TYPES = new Set(["LIMIT", "MARKET"]);
const ZERO = new Decimal(0);

const decimal = (value, field) => {
  try {
    const result = new Decimal(String(value));
    if (!result.isFinite() || result.lte(0)) throw new Error();
    return result;
  } catch {
    const error = new Error(`${field} must be a positive number`);
    error.status = 400;
    throw error;
  }
};

const normalizeOrder = (payload = {}) => {
  const market = String(payload.market || "").toUpperCase();
  const symbol = String(payload.symbol || "").toUpperCase().replace("/", "-");
  const side = String(payload.side || "").toUpperCase();
  const type = String(payload.type || "").toUpperCase();
  if (!MARKETS.has(market) || !SIDES.has(side) || !TYPES.has(type) || !isSupportedSymbol(symbol)) {
    const error = new Error("Unsupported market, symbol, side or order type");
    error.status = 400;
    throw error;
  }
  const quantity = decimal(payload.quantity, "quantity");
  const price = type === "LIMIT" ? decimal(payload.price, "price") : null;
  const leverage = market === "FUTURES" ? Number(payload.leverage || 1) : null;
  if (market === "FUTURES" && (!Number.isInteger(leverage) || leverage < 1 || leverage > 20)) {
    const error = new Error("leverage must be an integer from 1 to 20");
    error.status = 400;
    throw error;
  }
  return { market, symbol, side, type, quantity, price, leverage };
};

const parts = (symbol) => symbol.split("-");
const remaining = (order) => new Decimal(order.quantity).minus(order.filled_quantity);

async function ensureWallet(connection, userId, currency) {
  await connection.execute(
    `INSERT INTO wallets (user_id, currency, balance, locked_balance, status)
     VALUES (?, ?, 0, 0, 'active') ON DUPLICATE KEY UPDATE currency = VALUES(currency)`,
    [userId, currency]
  );
}

async function lockWallet(connection, userId, currency) {
  await ensureWallet(connection, userId, currency);
  const [rows] = await connection.execute(
    `SELECT id, balance, locked_balance FROM wallets
     WHERE user_id = ? AND currency = ? FOR UPDATE`,
    [userId, currency]
  );
  return rows[0];
}

const available = (wallet) => new Decimal(wallet.balance).minus(wallet.locked_balance);

async function changeWallet(connection, userId, currency, balanceDelta, lockedDelta = ZERO) {
  await ensureWallet(connection, userId, currency);
  await connection.execute(
    `UPDATE wallets
     SET balance = balance + ?, locked_balance = locked_balance + ?
     WHERE user_id = ? AND currency = ?`,
    [balanceDelta.toFixed(18), lockedDelta.toFixed(18), userId, currency]
  );
}

async function reserveOrder(connection, userId, order) {
  const [base, quote] = parts(order.symbol);
  let currency;
  let amount;
  if (order.market === "SPOT") {
    currency = order.side === "BUY" ? quote : base;
    amount = order.side === "BUY" ? order.quantity.mul(order.price) : order.quantity;
  } else {
    const desiredPositionSide = order.side === "BUY" ? "LONG" : "SHORT";
    const [positions] = await connection.execute(
      `SELECT side, leverage FROM futures_positions
       WHERE user_id = ? AND symbol = ? AND status = 'OPEN' FOR UPDATE`,
      [userId, order.symbol]
    );
    if (positions[0] && positions[0].side !== desiredPositionSide) {
      throw Object.assign(new Error("Close the opposite futures position first"), { status: 409 });
    }
    if (positions[0] && Number(positions[0].leverage) !== Number(order.leverage)) {
      throw Object.assign(new Error("Use the existing position leverage"), { status: 409 });
    }
    const [oppositeOrders] = await connection.execute(
      `SELECT id FROM trading_orders
       WHERE user_id = ? AND market = 'FUTURES' AND symbol = ? AND side <> ?
         AND reduce_only = 0 AND status IN ('OPEN','PARTIALLY_FILLED') LIMIT 1 FOR UPDATE`,
      [userId, order.symbol, order.side]
    );
    if (oppositeOrders.length) {
      throw Object.assign(new Error("Cancel the opposite futures order first"), { status: 409 });
    }
    currency = quote;
    amount = order.quantity.mul(order.price).div(order.leverage);
  }
  const wallet = await lockWallet(connection, userId, currency);
  if (available(wallet).lt(amount)) {
    const error = new Error(`Insufficient available ${currency} balance`);
    error.status = 409;
    throw error;
  }
  await changeWallet(connection, userId, currency, ZERO, amount);
  return { currency, amount };
}

async function settleSpotFill(connection, maker, taker, price, quantity) {
  const [base, quote] = parts(taker.symbol);
  const buy = taker.side === "BUY" ? taker : maker;
  const sell = taker.side === "SELL" ? taker : maker;
  const quoteAmount = price.mul(quantity);
  const buyLockPrice = new Decimal(buy.price);
  const reservedQuote = buyLockPrice.mul(quantity);

  await changeWallet(connection, buy.user_id, quote, quoteAmount.neg(), reservedQuote.neg());
  await changeWallet(connection, buy.user_id, base, quantity);
  await changeWallet(connection, sell.user_id, base, quantity.neg(), quantity.neg());
  await changeWallet(connection, sell.user_id, quote, quoteAmount);

  await connection.execute(
    `UPDATE trading_orders SET reserved_amount = GREATEST(reserved_amount - ?, 0) WHERE id = ?`,
    [reservedQuote.toFixed(18), buy.id]
  );
  await connection.execute(
    `UPDATE trading_orders SET reserved_amount = GREATEST(reserved_amount - ?, 0) WHERE id = ?`,
    [quantity.toFixed(18), sell.id]
  );
  return quoteAmount;
}

const liquidationPrice = (side, entry, leverage) => {
  const maintenance = new Decimal("0.005");
  return side === "LONG"
    ? entry.mul(new Decimal(1).minus(new Decimal(1).div(leverage)).plus(maintenance))
    : entry.mul(new Decimal(1).plus(new Decimal(1).div(leverage)).minus(maintenance));
};

async function addFuturesPosition(connection, order, price, quantity) {
  const side = order.side === "BUY" ? "LONG" : "SHORT";
  const margin = price.mul(quantity).div(order.leverage);
  const [positions] = await connection.execute(
    `SELECT * FROM futures_positions
     WHERE user_id = ? AND symbol = ? AND status = 'OPEN' FOR UPDATE`,
    [order.user_id, order.symbol]
  );
  const current = positions[0];
  if (current && current.side !== side) {
    const error = new Error("Close the opposite futures position before opening a new one");
    error.status = 409;
    throw error;
  }
  if (current && Number(current.leverage) !== Number(order.leverage)) {
    const error = new Error("Use the same leverage while a futures position is open");
    error.status = 409;
    throw error;
  }
  if (current) {
    const oldQty = new Decimal(current.quantity);
    const newQty = oldQty.plus(quantity);
    const entry = new Decimal(current.entry_price).mul(oldQty).plus(price.mul(quantity)).div(newQty);
    const totalMargin = new Decimal(current.margin).plus(margin);
    await connection.execute(
      `UPDATE futures_positions
       SET quantity = ?, entry_price = ?, margin = ?, leverage = ?, liquidation_price = ?
       WHERE id = ?`,
      [newQty.toFixed(18), entry.toFixed(18), totalMargin.toFixed(18), order.leverage,
        liquidationPrice(side, entry, order.leverage).toFixed(18), current.id]
    );
  } else {
    await connection.execute(
      `INSERT INTO futures_positions
       (user_id, symbol, side, quantity, entry_price, margin, leverage, liquidation_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.user_id, order.symbol, side, quantity.toFixed(18), price.toFixed(18), margin.toFixed(18),
        order.leverage, liquidationPrice(side, price, order.leverage).toFixed(18)]
    );
  }
  const reservedAtOrderPrice = new Decimal(order.price).mul(quantity).div(order.leverage);
  const release = reservedAtOrderPrice.minus(margin);
  if (release.gt(0)) {
    await changeWallet(connection, order.user_id, "USDT", ZERO, release.neg());
  } else if (release.lt(0)) {
    const additionalMargin = release.abs();
    const wallet = await lockWallet(connection, order.user_id, "USDT");
    if (available(wallet).lt(additionalMargin)) {
      throw Object.assign(new Error("Insufficient USDT for execution margin"), { status: 409 });
    }
    await changeWallet(connection, order.user_id, "USDT", ZERO, additionalMargin);
  }
  await connection.execute(
    `UPDATE trading_orders SET reserved_amount = GREATEST(reserved_amount - ?, 0) WHERE id = ?`,
    [reservedAtOrderPrice.toFixed(18), order.id]
  );
}

async function reduceFuturesPosition(connection, order, price, quantity) {
  const [positions] = await connection.execute(
    `SELECT * FROM futures_positions
     WHERE user_id = ? AND symbol = ? AND status = 'OPEN' FOR UPDATE`,
    [order.user_id, order.symbol]
  );
  const position = positions[0];
  if (!position) throw Object.assign(new Error("Open position not found"), { status: 409 });
  const expectedSide = position.side === "LONG" ? "SELL" : "BUY";
  if (order.side !== expectedSide) throw Object.assign(new Error("Invalid close side"), { status: 409 });
  const currentQty = new Decimal(position.quantity);
  if (quantity.gt(currentQty)) throw Object.assign(new Error("Close quantity exceeds position"), { status: 409 });
  const entry = new Decimal(position.entry_price);
  const rawPnl = position.side === "LONG"
    ? price.minus(entry).mul(quantity)
    : entry.minus(price).mul(quantity);
  const releasedMargin = new Decimal(position.margin).mul(quantity).div(currentQty);
  const pnl = Decimal.max(rawPnl, releasedMargin.neg());
  const nextQty = currentQty.minus(quantity);
  await changeWallet(connection, order.user_id, "USDT", pnl, releasedMargin.neg());
  if (nextQty.isZero()) {
    await connection.execute(
      `UPDATE futures_positions SET quantity = 0, margin = 0,
       realized_pnl = realized_pnl + ?, status = 'CLOSED', closed_at = CURRENT_TIMESTAMP(6)
       WHERE id = ?`, [pnl.toFixed(18), position.id]
    );
  } else {
    const nextMargin = new Decimal(position.margin).minus(releasedMargin);
    await connection.execute(
      `UPDATE futures_positions SET quantity = ?, margin = ?, realized_pnl = realized_pnl + ? WHERE id = ?`,
      [nextQty.toFixed(18), nextMargin.toFixed(18), pnl.toFixed(18), position.id]
    );
  }
}

async function settleFuturesFill(connection, maker, taker, price, quantity) {
  if (maker.reduce_only) await reduceFuturesPosition(connection, maker, price, quantity);
  else await addFuturesPosition(connection, maker, price, quantity);
  if (taker.reduce_only) await reduceFuturesPosition(connection, taker, price, quantity);
  else await addFuturesPosition(connection, taker, price, quantity);
  return price.mul(quantity);
}

async function updateFilledOrder(connection, order, fillPrice, fillQuantity) {
  const previousFilled = new Decimal(order.filled_quantity);
  const totalFilled = previousFilled.plus(fillQuantity);
  const previousValue = order.average_price ? new Decimal(order.average_price).mul(previousFilled) : ZERO;
  const average = previousValue.plus(fillPrice.mul(fillQuantity)).div(totalFilled);
  const status = totalFilled.gte(order.quantity) ? "FILLED" : "PARTIALLY_FILLED";
  await connection.execute(
    `UPDATE trading_orders SET filled_quantity = ?, average_price = ?, status = ? WHERE id = ?`,
    [totalFilled.toFixed(18), average.toFixed(18), status, order.id]
  );
  order.filled_quantity = totalFilled.toFixed(18);
  order.average_price = average.toFixed(18);
  order.status = status;
}

async function match(connection, taker) {
  const opposite = taker.side === "BUY" ? "SELL" : "BUY";
  const priceClause = taker.order_type === "MARKET"
    ? ""
    : taker.side === "BUY" ? "AND price <= ?" : "AND price >= ?";
  const params = [taker.market, taker.symbol, opposite];
  if (taker.order_type !== "MARKET") params.push(taker.price);
  params.push(taker.user_id);
  const direction = taker.side === "BUY" ? "ASC" : "DESC";
  const [makers] = await connection.execute(
    `SELECT * FROM trading_orders
     WHERE market = ? AND symbol = ? AND side = ?
       AND status IN ('OPEN', 'PARTIALLY_FILLED') ${priceClause}
       AND user_id <> ?
     ORDER BY price ${direction}, created_at ASC, id ASC FOR UPDATE`,
    params
  );

  const fills = [];
  for (const maker of makers) {
    const takerRemaining = remaining(taker);
    if (takerRemaining.lte(0)) break;
    const quantity = Decimal.min(takerRemaining, remaining(maker));
    const price = new Decimal(maker.price);
    const quoteAmount = taker.market === "SPOT"
      ? await settleSpotFill(connection, maker, taker, price, quantity)
      : await settleFuturesFill(connection, maker, taker, price, quantity);
    await updateFilledOrder(connection, maker, price, quantity);
    await updateFilledOrder(connection, taker, price, quantity);
    const buyerId = taker.side === "BUY" ? taker.user_id : maker.user_id;
    const sellerId = taker.side === "SELL" ? taker.user_id : maker.user_id;
    const [result] = await connection.execute(
      `INSERT INTO trading_fills
       (market, symbol, maker_order_id, taker_order_id, buyer_id, seller_id, price, quantity, quote_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taker.market, taker.symbol, maker.id, taker.id, buyerId, sellerId,
        price.toFixed(18), quantity.toFixed(18), quoteAmount.toFixed(18)]
    );
    fills.push({ id: result.insertId, price: price.toFixed(), quantity: quantity.toFixed() });
  }
  return fills;
}

async function releaseOrderReservation(connection, order) {
  const amount = new Decimal(order.reserved_amount || 0);
  if (amount.lte(0) || !order.reserved_currency) return;
  await changeWallet(connection, order.user_id, order.reserved_currency, ZERO, amount.neg());
  await connection.execute(`UPDATE trading_orders SET reserved_amount = 0 WHERE id = ?`, [order.id]);
}

export async function placeOrder(userId, payload) {
  const input = normalizeOrder(payload);
  const connection = await db.getConnection();
  const lockName = `trade:${input.market}:${input.symbol}`;
  try {
    const [[lock]] = await connection.query(`SELECT GET_LOCK(?, 5) AS acquired`, [lockName]);
    if (!lock.acquired) { const error = new Error("Market is busy, retry the order"); error.status = 503; throw error; }
    await connection.beginTransaction();
    if (input.type === "MARKET") {
      const opposite = input.side === "BUY" ? "SELL" : "BUY";
      const direction = input.side === "BUY" ? "ASC" : "DESC";
      const [levels] = await connection.execute(
        `SELECT price, quantity, filled_quantity FROM trading_orders
         WHERE market = ? AND symbol = ? AND side = ?
           AND status IN ('OPEN','PARTIALLY_FILLED') AND user_id <> ?
         ORDER BY price ${direction}, created_at ASC, id ASC FOR UPDATE`,
        [input.market, input.symbol, opposite, userId]
      );
      let executable = ZERO;
      let worstPrice = null;
      for (const level of levels) {
        executable = executable.plus(new Decimal(level.quantity).minus(level.filled_quantity));
        worstPrice = new Decimal(level.price);
        if (executable.gte(input.quantity)) break;
      }
      if (!worstPrice || executable.lt(input.quantity)) {
        throw Object.assign(new Error("Not enough liquidity to fully execute the market order"), { status: 409 });
      }
      input.price = worstPrice;
    }
    const reservation = await reserveOrder(connection, userId, input);
    const [result] = await connection.execute(
      `INSERT INTO trading_orders
       (user_id, market, symbol, side, order_type, price, quantity, leverage, reserved_currency, reserved_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, input.market, input.symbol, input.side, input.type, input.price.toFixed(18),
        input.quantity.toFixed(18), input.leverage, reservation.currency, reservation.amount.toFixed(18)]
    );
    const [rows] = await connection.execute(`SELECT * FROM trading_orders WHERE id = ? FOR UPDATE`, [result.insertId]);
    const order = rows[0];
    const fills = await match(connection, order);
    if (input.type === "MARKET" && order.status !== "FILLED") {
      throw Object.assign(new Error("Market liquidity changed; retry the order"), { status: 409 });
    }
    await connection.commit();
    return { order, fills };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.query(`SELECT RELEASE_LOCK(?)`, [lockName]).catch(() => {});
    connection.release();
  }
}

export async function closeFuturesPosition(userId, positionId) {
  const connection = await db.getConnection();
  let lockName;
  try {
    const [positions] = await connection.execute(
      `SELECT * FROM futures_positions WHERE id = ? AND user_id = ? AND status = 'OPEN'`,
      [positionId, userId]
    );
    const position = positions[0];
    if (!position) throw Object.assign(new Error("Open position not found"), { status: 404 });
    lockName = `trade:FUTURES:${position.symbol}`;
    const [[lock]] = await connection.query(`SELECT GET_LOCK(?, 5) AS acquired`, [lockName]);
    if (!lock.acquired) throw Object.assign(new Error("Market is busy, retry the close"), { status: 503 });
    await connection.beginTransaction();
    const [lockedPositions] = await connection.execute(
      `SELECT * FROM futures_positions WHERE id = ? AND user_id = ? AND status = 'OPEN' FOR UPDATE`,
      [positionId, userId]
    );
    if (!lockedPositions[0]) throw Object.assign(new Error("Position is no longer open"), { status: 409 });
    Object.assign(position, lockedPositions[0]);
    const side = position.side === "LONG" ? "SELL" : "BUY";
    const opposite = side === "BUY" ? "SELL" : "BUY";
    const direction = side === "BUY" ? "ASC" : "DESC";
    const [levels] = await connection.execute(
      `SELECT price, quantity, filled_quantity FROM trading_orders
       WHERE market = 'FUTURES' AND symbol = ? AND side = ? AND reduce_only = 0
         AND status IN ('OPEN','PARTIALLY_FILLED') AND user_id <> ?
       ORDER BY price ${direction}, created_at ASC, id ASC FOR UPDATE`,
      [position.symbol, opposite, userId]
    );
    let executable = ZERO;
    let worstPrice;
    const quantity = new Decimal(position.quantity);
    for (const level of levels) {
      executable = executable.plus(new Decimal(level.quantity).minus(level.filled_quantity));
      worstPrice = new Decimal(level.price);
      if (executable.gte(quantity)) break;
    }
    if (!worstPrice || executable.lt(quantity)) {
      throw Object.assign(new Error("Not enough liquidity to close the full position"), { status: 409 });
    }
    const [result] = await connection.execute(
      `INSERT INTO trading_orders
       (user_id, market, symbol, side, order_type, price, quantity, leverage, reduce_only, reserved_currency, reserved_amount)
       VALUES (?, 'FUTURES', ?, ?, 'MARKET', ?, ?, ?, 1, 'USDT', 0)`,
      [userId, position.symbol, side, worstPrice.toFixed(18), quantity.toFixed(18), position.leverage]
    );
    const [orders] = await connection.execute(`SELECT * FROM trading_orders WHERE id = ? FOR UPDATE`, [result.insertId]);
    const order = orders[0];
    const fills = await match(connection, order);
    if (order.status !== "FILLED") throw Object.assign(new Error("Close was not fully executed"), { status: 409 });
    await connection.commit();
    return { order, fills };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    if (lockName) await connection.query(`SELECT RELEASE_LOCK(?)`, [lockName]).catch(() => {});
    connection.release();
  }
}

export async function cancelOrder(userId, orderId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT * FROM trading_orders WHERE id = ? AND user_id = ? FOR UPDATE`, [orderId, userId]
    );
    const order = rows[0];
    if (!order) { const error = new Error("Order not found"); error.status = 404; throw error; }
    if (!["OPEN", "PARTIALLY_FILLED"].includes(order.status)) {
      const error = new Error("Only an active order can be cancelled"); error.status = 409; throw error;
    }
    await releaseOrderReservation(connection, order);
    await connection.execute(`UPDATE trading_orders SET status = 'CANCELLED' WHERE id = ?`, [order.id]);
    await connection.commit();
    return { id: order.id, status: "CANCELLED" };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function getExchangeState(userId, market, symbol) {
  const normalizedMarket = String(market || "SPOT").toUpperCase();
  const normalizedSymbol = String(symbol || "BTC-USDT").toUpperCase().replace("/", "-");
  if (!MARKETS.has(normalizedMarket) || !isSupportedSymbol(normalizedSymbol)) {
    const error = new Error("Unsupported market or symbol"); error.status = 400; throw error;
  }
  const [orders, fills, book, wallets, positions, funding] = await Promise.all([
    db.execute(
      `SELECT * FROM trading_orders WHERE user_id = ? AND market = ? AND symbol = ?
       ORDER BY created_at DESC LIMIT 100`, [userId, normalizedMarket, normalizedSymbol]
    ),
    db.execute(
      `SELECT * FROM trading_fills WHERE market = ? AND symbol = ?
       ORDER BY created_at DESC LIMIT 60`, [normalizedMarket, normalizedSymbol]
    ),
    db.execute(
      `SELECT side, price, SUM(quantity - filled_quantity) AS quantity
       FROM trading_orders WHERE market = ? AND symbol = ? AND status IN ('OPEN','PARTIALLY_FILLED')
       GROUP BY side, price ORDER BY price DESC`, [normalizedMarket, normalizedSymbol]
    ),
    db.execute(
      `SELECT currency, balance, locked_balance, balance - locked_balance AS available
       FROM wallets WHERE user_id = ? AND currency IN ('BTC','ETH','USDT')`, [userId]
    ),
    normalizedMarket === "FUTURES"
      ? db.execute(`SELECT * FROM futures_positions WHERE user_id = ? AND symbol = ? ORDER BY created_at DESC`, [userId, normalizedSymbol])
      : Promise.resolve([[]]),
    normalizedMarket === "FUTURES"
      ? db.execute(`SELECT rate, funding_time FROM futures_funding_rounds WHERE symbol = ? ORDER BY funding_time DESC LIMIT 1`, [normalizedSymbol])
      : Promise.resolve([[]]),
  ]);
  return {
    orders: orders[0],
    fills: fills[0],
    book: { asks: book[0].filter((row) => row.side === "SELL").sort((a,b) => Number(a.price)-Number(b.price)).slice(0, 20),
      bids: book[0].filter((row) => row.side === "BUY").slice(0, 20) },
    wallets: wallets[0],
    positions: positions[0],
    funding: {
      lastRate: funding[0][0]?.rate || "0.0001",
      lastTime: funding[0][0]?.funding_time || null,
      nextTime: new Date(Math.ceil(Date.now() / 28_800_000) * 28_800_000).toISOString(),
    },
  };
}
