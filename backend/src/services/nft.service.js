import Decimal from "decimal.js";
import { db } from "../config/db.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

const SALE_FEE_RATE = new Decimal("0.025");
const MARKET_STATUSES = new Set(["MARKET", "LISTED"]);

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const toPositiveAmount = (value, field = "price") => {
  try {
    const amount = new Decimal(String(value));
    if (!amount.isFinite() || amount.lte(0) || amount.gt("1000000")) throw new Error();
    return amount;
  } catch {
    throw fail(`${field} must be a positive amount up to 1,000,000`, 400);
  }
};

const serializeItem = (item) => ({
  id: item.id,
  giftId: item.gift_id,
  slug: item.slug,
  name: item.name,
  collectionName: item.collection_name,
  description: item.description,
  rarity: item.rarity,
  icon: item.icon,
  accentColor: item.accent_color,
  serialNumber: item.serial_number,
  status: item.status,
  price: item.list_price === null ? null : String(item.list_price),
  acquiredPrice: item.acquired_price === null ? null : String(item.acquired_price),
  acquiredAt: item.acquired_at,
  listedAt: item.updated_at,
  sellerId: item.owner_id || null,
});

async function ensureWallet(connection, userId) {
  await connection.execute(
    `INSERT INTO wallets (user_id, currency, balance, locked_balance, status)
     VALUES (?, 'USDT', 0, 0, 'active')
     ON DUPLICATE KEY UPDATE currency = VALUES(currency)`,
    [userId]
  );

  const [wallets] = await connection.execute(
    `SELECT id, balance, locked_balance
     FROM wallets WHERE user_id = ? AND currency = 'USDT' FOR UPDATE`,
    [userId]
  );
  return wallets[0];
}

export async function getMarketplace(search = "") {
  const term = String(search || "").trim();
  const values = [];
  let where = "WHERE i.status IN ('MARKET', 'LISTED')";

  if (term) {
    where += " AND (g.name LIKE ? OR g.collection_name LIKE ? OR CAST(i.serial_number AS CHAR) LIKE ?)";
    const like = `%${term}%`;
    values.push(like, like, like);
  }

  const [items] = await db.execute(
    `SELECT i.*, g.slug, g.name, g.collection_name, g.description, g.rarity, g.icon, g.accent_color
     FROM nft_gift_items i
     JOIN nft_gifts g ON g.id = i.gift_id
     ${where}
     ORDER BY i.list_price ASC, i.created_at DESC
     LIMIT 120`,
    values
  );

  return { items: items.map(serializeItem) };
}

export async function getInventory(userId) {
  const [items] = await db.execute(
    `SELECT i.*, g.slug, g.name, g.collection_name, g.description, g.rarity, g.icon, g.accent_color
     FROM nft_gift_items i
     JOIN nft_gifts g ON g.id = i.gift_id
     WHERE i.owner_id = ? AND i.status IN ('OWNED', 'LISTED')
     ORDER BY i.updated_at DESC, i.id DESC`,
    [userId]
  );

  const [wallets] = await db.execute(
    `SELECT balance, locked_balance FROM wallets WHERE user_id = ? AND currency = 'USDT' LIMIT 1`,
    [userId]
  );
  const wallet = wallets[0];
  const availableUsdt = wallet
    ? new Decimal(wallet.balance).minus(wallet.locked_balance || 0).toFixed(2)
    : "0.00";

  return { items: items.map(serializeItem), availableUsdt };
}

export async function getGiftMarketHistory(giftId) {
  const normalizedGiftId = Number(giftId);
  if (!Number.isSafeInteger(normalizedGiftId) || normalizedGiftId <= 0) throw fail("Invalid gift", 400);

  const [gifts] = await db.execute(
    `SELECT id, slug, name, collection_name, description, rarity, icon, accent_color
     FROM nft_gifts WHERE id = ? LIMIT 1`,
    [normalizedGiftId]
  );
  const gift = gifts[0];
  if (!gift) throw fail("Gift collection not found", 404);

  const [sales, market] = await Promise.all([
    db.execute(
      `SELECT s.id, s.price, s.platform_fee, s.sale_type, s.created_at,
              i.serial_number, buyer.id AS buyer_id, buyer.username AS buyer_username
       FROM nft_gift_sales s
       JOIN nft_gift_items i ON i.id = s.item_id
       JOIN users buyer ON buyer.id = s.buyer_id
       WHERE s.gift_id = ?
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 60`,
      [normalizedGiftId]
    ),
    db.execute(
      `SELECT COUNT(*) AS listings_count, MIN(list_price) AS floor_price,
              AVG(list_price) AS average_price, MAX(list_price) AS ceiling_price
       FROM nft_gift_items
       WHERE gift_id = ? AND status IN ('MARKET', 'LISTED')`,
      [normalizedGiftId]
    ),
  ]);

  const normalizedSales = sales[0].map((sale) => ({
    id: sale.id,
    serialNumber: sale.serial_number,
    price: String(sale.price),
    platformFee: String(sale.platform_fee || 0),
    saleType: sale.sale_type,
    createdAt: sale.created_at,
    buyer: sale.buyer_username || `Пользователь #${sale.buyer_id}`,
  }));
  const marketStats = market[0][0] || {};

  return {
    gift: {
      id: gift.id,
      slug: gift.slug,
      name: gift.name,
      collectionName: gift.collection_name,
      description: gift.description,
      rarity: gift.rarity,
      icon: gift.icon,
      accentColor: gift.accent_color,
    },
    summary: {
      salesCount: normalizedSales.length,
      listingsCount: Number(marketStats.listings_count || 0),
      floorPrice: marketStats.floor_price === null ? null : String(marketStats.floor_price),
      averagePrice: marketStats.average_price === null ? null : String(marketStats.average_price),
      ceilingPrice: marketStats.ceiling_price === null ? null : String(marketStats.ceiling_price),
    },
    chart: normalizedSales.slice().reverse(),
    sales: normalizedSales.slice(0, 12),
  };
}

export async function buyGift(userId, itemId) {
  const normalizedItemId = Number(itemId);
  if (!Number.isSafeInteger(normalizedItemId) || normalizedItemId <= 0) throw fail("Invalid gift item", 400);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [items] = await connection.execute(
      `SELECT i.*, g.name
       FROM nft_gift_items i
       JOIN nft_gifts g ON g.id = i.gift_id
       WHERE i.id = ? FOR UPDATE`,
      [normalizedItemId]
    );
    const item = items[0];
    if (!item || !MARKET_STATUSES.has(item.status) || item.list_price === null) {
      throw fail("This gift is no longer available", 409);
    }
    if (item.status === "LISTED" && Number(item.owner_id) === Number(userId)) {
      throw fail("You cannot buy your own gift", 409);
    }

    const price = toPositiveAmount(item.list_price);
    const buyerWallet = await ensureWallet(connection, userId);
    const available = new Decimal(buyerWallet.balance).minus(buyerWallet.locked_balance || 0);
    if (available.lt(price)) throw fail("Insufficient available USDT balance", 409);

    await connection.execute(
      "UPDATE wallets SET balance = balance - ? WHERE id = ?",
      [price.toFixed(18), buyerWallet.id]
    );

    const secondarySale = item.status === "LISTED" && item.owner_id;
    const fee = secondarySale ? price.mul(SALE_FEE_RATE) : new Decimal(0);
    const sellerPayout = price.minus(fee);

    if (secondarySale) {
      const sellerWallet = await ensureWallet(connection, item.owner_id);
      await connection.execute(
        "UPDATE wallets SET balance = balance + ? WHERE id = ?",
        [sellerPayout.toFixed(18), sellerWallet.id]
      );
      await connection.execute(
        `INSERT INTO transactions (wallet_id, from_address, to_address, amount, currency, type)
         VALUES (?, 'nft-marketplace', 'internal', ?, 'USDT', 'nft_sale')`,
        [sellerWallet.id, sellerPayout.toFixed(18)]
      );
    }

    await connection.execute(
      `INSERT INTO exchange_wallets (currency, balance) VALUES ('USDT', 0)
       ON DUPLICATE KEY UPDATE currency = VALUES(currency)`
    );
    await connection.execute(
      "UPDATE exchange_wallets SET balance = balance + ? WHERE currency = 'USDT'",
      [fee.plus(secondarySale ? 0 : price).toFixed(18)]
    );
    await connection.execute(
      `UPDATE nft_gift_items
       SET owner_id = ?, status = 'OWNED', list_price = NULL, acquired_price = ?, acquired_at = NOW()
       WHERE id = ?`,
      [userId, price.toFixed(18), item.id]
    );
    await connection.execute(
      `INSERT INTO nft_gift_sales (item_id, gift_id, seller_id, buyer_id, price, platform_fee, sale_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.gift_id, secondarySale ? item.owner_id : null, userId, price.toFixed(18), fee.toFixed(18), secondarySale ? "SECONDARY" : "PRIMARY"]
    );
    await connection.execute(
      `INSERT INTO transactions (wallet_id, from_address, to_address, amount, currency, type)
       VALUES (?, 'internal', 'nft-marketplace', ?, 'USDT', 'nft_purchase')`,
      [buyerWallet.id, price.toFixed(18)]
    );

    await connection.commit();
    return { itemId: item.id, name: item.name, price: price.toFixed(2), fee: fee.toFixed(2) };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function listGift(userId, itemId, listPrice) {
  const normalizedItemId = Number(itemId);
  if (!Number.isSafeInteger(normalizedItemId) || normalizedItemId <= 0) throw fail("Invalid gift item", 400);
  const price = toPositiveAmount(listPrice);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [items] = await connection.execute(
      "SELECT id, status FROM nft_gift_items WHERE id = ? AND owner_id = ? FOR UPDATE",
      [normalizedItemId, userId]
    );
    if (!items[0]) throw fail("Gift not found in your storage", 404);
    if (items[0].status !== "OWNED") throw fail("Only an unlisted gift can be listed", 409);

    await connection.execute(
      "UPDATE nft_gift_items SET status = 'LISTED', list_price = ? WHERE id = ?",
      [price.toFixed(18), normalizedItemId]
    );
    await connection.commit();
    return { itemId: normalizedItemId, status: "LISTED", price: price.toFixed(2) };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function unlistGift(userId, itemId) {
  const normalizedItemId = Number(itemId);
  if (!Number.isSafeInteger(normalizedItemId) || normalizedItemId <= 0) throw fail("Invalid gift item", 400);
  const [result] = await db.execute(
    `UPDATE nft_gift_items
     SET status = 'OWNED', list_price = NULL
     WHERE id = ? AND owner_id = ? AND status = 'LISTED'`,
    [normalizedItemId, userId]
  );
  if (result.affectedRows === 0) throw fail("Active listing not found", 404);
  return { itemId: normalizedItemId, status: "OWNED" };
}
