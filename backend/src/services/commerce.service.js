import { randomUUID } from "node:crypto";
import {consumeFeeBonus,discountedFeePercent} from './fee-bonus.service.js';
import {chatProfile} from './chat-profile.service.js';
import {assertUserMarketArea} from './market-areas.js';
import Decimal from "decimal.js";
import { db } from "../config/db.js";
import {
  amount,
  fail,
  participant,
  requireMinimumAmount,
  text,
  transition,
  uuid,
} from "./commerce-policy.js";
import {
  consumeUsdtReservation,
  releaseUsdtReservation,
  reserveUsdt,
} from "./wallet-reservation.service.js";

export async function transact(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function isCommerceAdmin(userId) {
  const emails = String(
    process.env.ADMIN_EMAILS || process.env.VITE_ADMIN_EMAILS || "",
  )
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const [[user]] = await db.execute("SELECT email FROM users WHERE id = ?", [
    userId,
  ]);
  return Boolean(user && emails.includes(user.email.toLowerCase()));
}

// Wallet balance is the total amount; locked_balance is a subset reserved for
// open trades. All spending checks use balance - locked_balance.
async function walletChange(c, userId, currency, delta) {
  const number = new Decimal(delta);
  if (currency === "RUB") {
    await c.execute("INSERT IGNORE INTO market_wallets (user_id) VALUES (?)", [
      userId,
    ]);
    const [result] = await c.execute(
      "UPDATE market_wallets SET balance = balance + ? WHERE user_id = ? AND balance + ? >= 0",
      [number.toFixed(2), userId, number.toFixed(2)],
    );
    if (result.affectedRows !== 1)
      fail("Недостаточно рублей на балансе маркета");
  } else {
    const [[wallet]] = await c.execute(
      "SELECT id, balance, locked_balance, status FROM wallets WHERE user_id = ? AND currency = 'USDT' FOR UPDATE",
      [userId],
    );
    if (!wallet || (number.lt(0) && wallet.status !== "active"))
      fail("Активный кошелёк USDT не найден");
    if (
      number.lt(0) &&
      new Decimal(wallet.balance)
        .minus(wallet.locked_balance || 0)
        .plus(number)
        .lt(0)
    )
      fail("Недостаточно свободных USDT");
    await c.execute("UPDATE wallets SET balance = balance + ? WHERE id = ?", [
      number.toFixed(6),
      wallet.id,
    ]);
  }
}
async function ledger(c, userId, currency, delta, reference, operation) {
  await c.execute(
    "INSERT INTO commerce_ledger (user_id,currency,amount,reference_id,operation) VALUES (?,?,?,?,?)",
    [userId, currency, delta, reference, operation],
  );
}
async function event(c, deal, actor, action, note = "") {
  await c.execute(
    "INSERT INTO commerce_events (deal_id,actor_id,action,note) VALUES (?,?,?,?)",
    [deal, actor, action, note],
  );
}
async function reserve(c, deal, actor) {
  if (deal.currency === "USDT") {
    const [[recipientWallet]] = await c.execute(
      "SELECT id FROM wallets WHERE user_id=? AND currency='USDT' AND status='active'",
      [deal.seller_id],
    );
    if (!recipientWallet)
      fail(
        "У продавца нет активного кошелька USDT. Резервирование недоступно до его восстановления.",
      );
  }
  if (deal.currency === "USDT") await reserveUsdt(c, deal.buyer_id, deal.amount);
  else await walletChange(c, deal.buyer_id, deal.currency, new Decimal(deal.amount).neg().toFixed());
  await ledger(
    c,
    deal.buyer_id,
    deal.currency,
    new Decimal(deal.amount).neg().toFixed(),
    deal.id,
    "RESERVE",
  );
  await c.execute(
    "UPDATE commerce_deals SET status='FUNDED', funded_at=CURRENT_TIMESTAMP(6) WHERE id=?",
    [deal.id],
  );
  await event(c, deal.id, actor, "fund");
}
async function activeAccounts(c, ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const [rows] = await c.query(
    `SELECT id,status,internal_transfers_enabled FROM users WHERE id IN (${unique.map(() => "?").join(",")}) ORDER BY id FOR UPDATE`,
    unique,
  );
  if (
    rows.length !== unique.length ||
    rows.some(
      (u) =>
        u.status !== "active" || Number(u.internal_transfers_enabled) !== 1,
    )
  )
    fail("Операции для одного из участников отключены", 403);
}

export async function catalog() {
  const [rows] = await db.query("SELECT * FROM market_catalog ORDER BY name");
  return rows.map((r) => ({
    ...r,
    sections:
      typeof r.sections === "string" ? JSON.parse(r.sections) : r.sections,
  }));
}
export async function listings({
  category = "",
  search = "",
  offset = 0,
} = {}) {
  const term = String(search).slice(0, 120);
  // Text protocol safely formats the integer OFFSET. mysql2's prepared
  // protocol sends JS numbers as DOUBLE, rejected by MySQL's LIMIT clause.
  const [rows] = await db.query(
    `SELECT l.id,l.seller_id,l.category,l.section,l.title,l.description,l.price,l.created_at,u.username AS seller_name
    FROM market_listings l JOIN users u ON u.id=l.seller_id
    WHERE l.status='ACTIVE' AND u.status='active' AND (?='' OR l.category=?) AND (?='' OR l.title LIKE ?)
    ORDER BY l.created_at DESC LIMIT 60 OFFSET ?`,
    [
      String(category).slice(0, 100),
      String(category).slice(0, 100),
      term,
      `%${term}%`,
      Math.max(0, Math.min(10000, Number.parseInt(offset, 10) || 0)),
    ],
  );
  return rows;
}
export async function createListing(userId, body) {
  const category = text(body.category, 1, 100, "категорию");
  const section = text(body.section, 1, 120, "раздел");
  const [[entry]] = await db.execute(
    "SELECT sections FROM market_catalog WHERE slug=?",
    [category],
  );
  const sections =
    entry &&
    (typeof entry.sections === "string"
      ? JSON.parse(entry.sections)
      : entry.sections);
  if (!sections?.includes(section)) fail("Категория или раздел не найдены");
  await assertUserMarketArea(userId, section);
  const id = randomUUID();
  await db.execute(
    "INSERT INTO market_listings (id,seller_id,category,section,title,description,delivery_note,price) VALUES (?,?,?,?,?,?,?,?)",
    [
      id,
      userId,
      category,
      section,
      text(body.title, 3, 120, "название"),
      text(body.description, 10, 5000, "описание"),
      text(
        body.deliveryNote || "Передача в чате сделки",
        3,
        2000,
        "условия передачи",
      ),
      amount(body.price, "RUB"),
    ],
  );
  return { id };
}
export async function setListingStatus(userId, id, status, admin = false) {
  uuid(id);
  if (!admin && status === 'ACTIVE') {
    const [[listing]] = await db.execute('SELECT section FROM market_listings WHERE id=? AND seller_id=?', [id, userId]);
    if (!listing) fail('Объявление не найдено', 404);
    await assertUserMarketArea(userId, listing.section);
  }
  if (
    !(admin ? ["ACTIVE", "PAUSED", "BLOCKED"] : ["ACTIVE", "PAUSED"]).includes(
      status,
    )
  )
    fail("Некорректный статус");
  const [result] = await db.execute(
    admin
      ? "UPDATE market_listings SET status=? WHERE id=?"
      : "UPDATE market_listings SET status=? WHERE id=? AND seller_id=? AND status <> 'BLOCKED'",
    admin ? [status, id] : [status, id, userId],
  );
  if (!result.affectedRows) fail("Объявление не найдено", 404);
}
export async function purchase(userId, body) {
  const listingId = uuid(body.listingId),
    key = uuid(body.requestKey);
  return transact(async (c) => {
    const [[listing]] = await c.execute(
      "SELECT * FROM market_listings WHERE id=? FOR UPDATE",
      [listingId],
    );
    if (!listing) fail("Объявление не найдено", 404);
    // Serialize requests by buyer, including simultaneous idempotent retries.
    await activeAccounts(c, [userId, listing.seller_id]);
    await assertUserMarketArea(userId, listing.section, c);
    await assertUserMarketArea(listing.seller_id, listing.section, c);
    const [[old]] = await c.execute(
      "SELECT * FROM commerce_deals WHERE creator_id=? AND request_key=?",
      [userId, key],
    );
    if (old) {
      if (old.listing_id !== listingId)
        fail("Ключ запроса уже использован", 409);
      return { id: old.id };
    }
    if (listing.status !== "ACTIVE") fail("Объявление приостановлено", 409);
    if (String(listing.seller_id) === String(userId))
      fail("Нельзя купить своё объявление");
    const deal = {
      id: randomUUID(),
      buyer_id: userId,
      seller_id: listing.seller_id,
      currency: "RUB",
      amount: listing.price,
    };
    await c.execute(
      `INSERT INTO commerce_deals (id,kind,currency,creator_id,buyer_id,seller_id,listing_id,title,terms,amount,status,request_key)
      VALUES (?,'MARKET','RUB',?,?,?,?,?,?,?,'READY',?)`,
      [
        deal.id,
        userId,
        userId,
        listing.seller_id,
        listingId,
        listing.title,
        `${listing.description}\n\nПередача: ${listing.delivery_note}`,
        listing.price,
        key,
      ],
    );
    await event(c, deal.id, userId, "create");
    await reserve(c, deal, userId);
    return { id: deal.id };
  });
}
export async function createEscrow(userId, body) {
  const title = text(body.title, 2, 120, "название"),
    terms = text(body.terms, 5, 2000, "условия"),
    total = amount(body.amount, "USDT"),
    key = uuid(body.requestKey);
  if (!["BUYER", "SELLER"].includes(body.role)) fail("Выберите роль");
  return transact(async (c) => {
    await activeAccounts(c, [userId]);
    const [[old]] = await c.execute(
      "SELECT * FROM commerce_deals WHERE creator_id=? AND request_key=?",
      [userId, key],
    );
    if (old) {
      if (
        old.kind !== "ESCROW" ||
        old.title !== title ||
        old.terms !== terms ||
        !new Decimal(old.amount).eq(total) ||
        (String(old.buyer_id) === String(userId)) !== (body.role === "BUYER")
      )
        fail("Ключ запроса уже использован", 409);
      return { id: old.id };
    }
    const id = randomUUID();
    const [[policy]] = await c.execute(
      "SELECT guarantor_fee_percent,guarantor_min_amount FROM commerce_policy WHERE id=1 FOR UPDATE",
    );
    if (!policy) fail("Настройки комиссии гаранта не найдены", 503);
    requireMinimumAmount(total, policy.guarantor_min_amount);
    await c.execute(
      `INSERT INTO commerce_deals (id,kind,currency,creator_id,buyer_id,seller_id,title,terms,amount,guarantor_fee_percent,request_key)
      VALUES (?,'ESCROW','USDT',?,?,?,?,?,?,?,?)`,
      [
        id,
        userId,
        body.role === "BUYER" ? userId : null,
        body.role === "SELLER" ? userId : null,
        title,
        terms,
        total,
        policy.guarantor_fee_percent,
        key,
      ],
    );
    await event(c, id, userId, "create");
    return { id };
  });
}
export async function joinEscrow(userId, id) {
  uuid(id);
  return transact(async (c) => {
    const [[deal]] = await c.execute(
      "SELECT * FROM commerce_deals WHERE id=? FOR UPDATE",
      [id],
    );
    if (!deal || deal.kind !== "ESCROW") fail("Сделка не найдена", 404);
    if (participant(deal, userId)) return { id };
    if (deal.status !== "WAITING") fail("В сделке уже есть оба участника", 409);
    await activeAccounts(c, [userId, deal.creator_id]);
    const column = deal.buyer_id ? "seller_id" : "buyer_id";
    await c.execute(
      `UPDATE commerce_deals SET ${column}=?,status='READY' WHERE id=?`,
      [userId, id],
    );
    await event(c, id, userId, "join");
    return { id };
  });
}
export async function dealDetails(userId, id) {
  uuid(id);
  const [[deal]] = await db.execute(
    `SELECT d.*,b.username AS buyer_name,s.username AS seller_name FROM commerce_deals d
    LEFT JOIN users b ON b.id=d.buyer_id LEFT JOIN users s ON s.id=d.seller_id WHERE d.id=?`,
    [id],
  );
  if (!deal) fail("Сделка не найдена", 404);
  if (!participant(deal, userId) && !(await isCommerceAdmin(userId))) {
    if (deal.kind === "ESCROW" && deal.status === "WAITING")
      return {
        deal: {
          id: deal.id,
          title: deal.title,
          terms: deal.terms,
          amount: deal.amount,
          currency: deal.currency,
          status: deal.status,
          kind: deal.kind,
          buyer_name: deal.buyer_name,
          seller_name: deal.seller_name,
        },
        canJoin: true,
        messages: [],
        events: [],
      };
    fail("Нет доступа к сделке", 403);
  }
  const [messages] = await db.execute(
    `SELECT m.*,u.username AS sender_name FROM commerce_messages m JOIN users u ON u.id=m.sender_id
    WHERE deal_id=? ORDER BY m.id DESC LIMIT 200`,
    [id],
  );
  const [events] = await db.execute(
    "SELECT action,note,created_at,actor_id FROM commerce_events WHERE deal_id=? ORDER BY id DESC LIMIT 200",
    [id],
  );
  return {
    deal,
    messages: await Promise.all(messages.reverse().map(async m=>({...m,sender:await chatProfile(m.sender_id)}))),
    events: events.reverse(),
    canJoin: false,
  };
}
export async function actOnDeal(userId, id, body, admin = false) {
  uuid(id);
  const action = text(body.action, 2, 24, "действие");
  const note = body.note ? text(body.note, 1, 2000, "комментарий") : "";
  if (
    ["dispute", "resolve-pay", "resolve-refund", "admin-cancel"].includes(action) &&
    note.length < 5
  )
    fail("Опишите причину (минимум 5 символов)");
  return transact(async (c) => {
    const [[deal]] = await c.execute(
      "SELECT * FROM commerce_deals WHERE id=? FOR UPDATE",
      [id],
    );
    if (!deal) fail("Сделка не найдена", 404);
    const next = transition(deal, userId, action, admin);
    if (next === "FUNDED") {
      await activeAccounts(c, [deal.buyer_id, deal.seller_id]);
      await reserve(c, deal, userId);
    } else {
      if (["COMPLETED", "REFUNDED"].includes(next)) {
        const recipient = next === "COMPLETED" ? deal.seller_id : deal.buyer_id;
        // Sort shared account locks before wallet locks; allow refunds to blocked users.
        await c.query(
          "SELECT id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE",
          [deal.buyer_id, deal.seller_id],
        );
        if (!deal.funded_at) fail("Средства не зарезервированы", 409);
        let payout = new Decimal(deal.amount);
        if (next === "COMPLETED" && deal.kind === "ESCROW") {
          const bonus=Number(deal.guarantor_fee_percent)>0&&await consumeFeeBonus(c,recipient,'ESCROW',id);
          const feePercent = new Decimal(discountedFeePercent(deal.guarantor_fee_percent,bonus));
          const fee = payout
            .mul(feePercent)
            .div(100)
            .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
          payout = payout.minus(fee);
          await c.execute(
            `INSERT INTO commerce_guarantor_fee_ledger
              (deal_id,seller_id,gross_amount,fee_percent,fee_amount,net_amount)
             VALUES (?,?,?,?,?,?)`,
            [id, recipient, deal.amount, feePercent.toFixed(6), fee.toFixed(6), payout.toFixed(6)],
          );
          if (fee.gt(0)) {
            await c.execute(
              `INSERT INTO admin_treasury (currency,balance) VALUES ('USDT',?)
               ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance)`,
              [fee.toFixed(6)],
            );
            await ledger(c, recipient, deal.currency, fee.neg().toFixed(6), id, "GUARANTEE_FEE");
          }
        }
        if (deal.kind === "ESCROW" && deal.currency === "USDT") {
          if (next === "COMPLETED") {
            await consumeUsdtReservation(c, deal.buyer_id, deal.amount);
            await walletChange(c, recipient, deal.currency, payout.toFixed(6));
          } else {
            await releaseUsdtReservation(c, deal.buyer_id, deal.amount);
          }
        } else {
          await walletChange(c, recipient, deal.currency, payout.toFixed(6));
        }
        await ledger(
          c,
          recipient,
          deal.currency,
          payout.toFixed(6),
          id,
          next === "COMPLETED" ? "PAYOUT" : "REFUND",
        );
      } else if (next === "CANCELLED" && action === "admin-cancel") {
        await c.query(
          "SELECT id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE",
          [deal.buyer_id, deal.seller_id],
        );
      }
      await c.execute("UPDATE commerce_deals SET status=? WHERE id=?", [
        next,
        id,
      ]);
      await event(c, id, userId, action, note);
    }
    return { id, status: next };
  });
}

function feePercentValue(value) {
  if (typeof value !== "number" && typeof value !== "string")
    fail("Укажите комиссию числом");
  const raw = String(value).trim();
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(raw))
    fail("Комиссия должна быть от 0 до 100%, максимум два знака после запятой");
  const rate = new Decimal(raw);
  if (rate.lt(0) || rate.gt(100))
    fail("Комиссия должна быть от 0 до 100%");
  return rate.toFixed(2);
}

export async function escrowFeePolicy() {
  const [[policy]] = await db.execute(
    "SELECT guarantor_fee_percent,guarantor_min_amount,updated_at FROM commerce_policy WHERE id=1",
  );
  if (!policy) fail("Настройки комиссии гаранта не найдены", 503);
  return { feePercent: Number(policy.guarantor_fee_percent), minimumAmount: String(policy.guarantor_min_amount), updatedAt: policy.updated_at };
}

export async function adminEscrowFeePolicy() {
  const policy = await escrowFeePolicy();
  const [recentFees] = await db.execute(
    `SELECT f.deal_id,f.seller_id,u.username AS seller_name,f.gross_amount,
      f.fee_percent,f.fee_amount,f.net_amount,f.created_at
     FROM commerce_guarantor_fee_ledger f JOIN users u ON u.id=f.seller_id
     ORDER BY f.id DESC LIMIT 50`,
  );
  return { ...policy, recentFees };
}

function minimumAmountValue(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,7}(?:\.\d{1,6})?$/.test(raw))
    fail("Минимальная сумма должна быть положительным числом до 1 000 000 USDT");
  const minimum = new Decimal(raw);
  if (!minimum.isFinite() || minimum.lte(0) || minimum.gt(1000000))
    fail("Минимальная сумма должна быть больше нуля и не больше 1 000 000 USDT");
  return minimum.toFixed(6);
}

export async function updateEscrowFeePolicy(actorId, value, minimumValue) {
  const fee = feePercentValue(value);
  const minimum = minimumAmountValue(minimumValue);
  return transact(async (c) => {
    const [[old]] = await c.execute(
      "SELECT guarantor_fee_percent,guarantor_min_amount FROM commerce_policy WHERE id=1 FOR UPDATE",
    );
    if (!old) fail("Настройки комиссии гаранта не найдены", 503);
    await c.execute(
      "UPDATE commerce_policy SET guarantor_fee_percent=?,guarantor_min_amount=?,updated_by=? WHERE id=1",
      [fee, minimum, actorId],
    );
    await c.execute(
      "INSERT INTO commerce_policy_audit (actor_id,previous_fee_percent,new_fee_percent,previous_min_amount,new_min_amount) VALUES (?,?,?,?,?)",
      [actorId, old.guarantor_fee_percent, fee, old.guarantor_min_amount, minimum],
    );
    return { feePercent: Number(fee), minimumAmount: minimum };
  });
}
export async function markEscrowMessagesRead(adminId, id) {
  uuid(id);
  return transact(async (c) => {
    const [[deal]] = await c.execute(
      "SELECT id FROM commerce_deals WHERE id=? AND kind='ESCROW' FOR UPDATE",
      [id],
    );
    if (!deal) fail("Сделка не найдена", 404);
    const [[latest]] = await c.execute(
      "SELECT COALESCE(MAX(id),0) AS message_id FROM commerce_messages WHERE deal_id=?",
      [id],
    );
    await c.execute(
      `INSERT INTO commerce_admin_deal_reads (admin_id,deal_id,last_read_message_id)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE
       last_read_message_id=GREATEST(last_read_message_id,VALUES(last_read_message_id))`,
      [adminId, id, latest.message_id],
    );
    return { success: true };
  });
}
export async function sendMessage(userId, id, value) {
  uuid(id);
  const message = text(value, 1, 2000, "сообщение");
  return transact(async (c) => {
    const [[deal]] = await c.execute(
      "SELECT * FROM commerce_deals WHERE id=? FOR UPDATE",
      [id],
    );
    if (
      !deal ||
      (!participant(deal, userId) && !(await isCommerceAdmin(userId)))
    )
      fail("Нет доступа к чату", 403);
    if (["COMPLETED", "REFUNDED", "CANCELLED"].includes(deal.status))
      fail("Чат закрытой сделки доступен только для чтения", 409);
    await c.execute(
      "INSERT INTO commerce_messages (deal_id,sender_id,text) VALUES (?,?,?)",
      [id, userId, message],
    );
  });
}
export async function dashboard(userId) {
  const [[user]] = await db.execute(
    "SELECT id,username FROM users WHERE id=?",
    [userId],
  );
  const [[rub]] = await db.execute(
    "SELECT balance FROM market_wallets WHERE user_id=?",
    [userId],
  );
  const [[usdt]] = await db.execute(
    "SELECT balance,locked_balance FROM wallets WHERE user_id=? AND currency='USDT'",
    [userId],
  );
  const [deals] = await db.execute(
    "SELECT * FROM commerce_deals WHERE buyer_id=? OR seller_id=? ORDER BY updated_at DESC LIMIT 100",
    [userId, userId],
  );
  const [[held]] = await db.execute(
    "SELECT COALESCE(SUM(CASE WHEN currency='RUB' THEN amount ELSE 0 END),0) AS rub,COALESCE(SUM(CASE WHEN currency='USDT' THEN amount ELSE 0 END),0) AS usdt FROM commerce_deals WHERE buyer_id=? AND status IN ('FUNDED','DELIVERED','DISPUTED')",
    [userId],
  );
  const [ownListings] = await db.execute(
    "SELECT * FROM market_listings WHERE seller_id=? ORDER BY created_at DESC LIMIT 100",
    [userId],
  );
  const [payments] = await db.execute(
    "SELECT * FROM market_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
    [userId],
  );
  const [history] = await db.execute(
    "SELECT currency,amount,operation,reference_id,created_at FROM commerce_ledger WHERE user_id=? ORDER BY id DESC LIMIT 100",
    [userId],
  );
  return {
    user,
    rubBalance: rub?.balance || "0.00",
    availableUsdt: usdt
      ? Decimal.max(
          0,
          new Decimal(usdt.balance).minus(usdt.locked_balance || 0),
        ).toFixed(6)
      : "0",
    held,
    deals,
    listings: ownListings,
    payments,
    history,
  };
}
export async function requestPayment(userId, body) {
  const total = amount(body.amount, "RUB"),
    details = text(body.details, 5, 1000, "реквизиты / сведения о платеже"),
    id = uuid(body.requestKey);
  if (!["TOP_UP", "WITHDRAWAL"].includes(body.kind))
    fail("Неизвестная операция");
  return transact(async (c) => {
    await activeAccounts(c, [userId]);
    const [[old]] = await c.execute(
      "SELECT * FROM market_payments WHERE id=?",
      [id],
    );
    if (old) {
      if (
        String(old.user_id) !== String(userId) ||
        old.kind !== body.kind ||
        old.details !== details ||
        !new Decimal(old.amount).eq(total)
      )
        fail("Ключ запроса уже использован", 409);
      return { id };
    }
    if (body.kind === "TOP_UP") {
      const [[user]] = await c.execute(
        "SELECT deposits_enabled FROM users WHERE id=?",
        [userId],
      );
      if (Number(user.deposits_enabled) !== 1)
        fail("Пополнение отключено для аккаунта", 403);
    }
    if (body.kind === "WITHDRAWAL") {
      const [[user]] = await c.execute(
        "SELECT withdrawals_enabled FROM users WHERE id=?",
        [userId],
      );
      if (Number(user.withdrawals_enabled) !== 1)
        fail("Вывод отключён для аккаунта", 403);
      await walletChange(c, userId, "RUB", new Decimal(total).neg().toFixed());
      await ledger(
        c,
        userId,
        "RUB",
        new Decimal(total).neg().toFixed(),
        id,
        "WITHDRAW_RESERVE",
      );
    }
    await c.execute(
      "INSERT INTO market_payments (id,user_id,kind,amount,details) VALUES (?,?,?,?,?)",
      [id, userId, body.kind, total, details],
    );
    return { id };
  });
}
export async function adminOverview() {
  const [deals] = await db.query(
    "SELECT d.*,b.username AS buyer_name,s.username AS seller_name FROM commerce_deals d LEFT JOIN users b ON b.id=d.buyer_id LEFT JOIN users s ON s.id=d.seller_id ORDER BY (d.status='DISPUTED') DESC,d.updated_at DESC LIMIT 150",
  );
  const [payments] = await db.query(
    "SELECT p.*,u.username FROM market_payments p JOIN users u ON u.id=p.user_id ORDER BY (p.status='PENDING') DESC,p.created_at DESC LIMIT 150",
  );
  const [listings] = await db.query(
    "SELECT l.*,u.username AS seller_name FROM market_listings l JOIN users u ON u.id=l.seller_id ORDER BY l.created_at DESC LIMIT 150",
  );
  return { deals, payments, listings };
}
export async function reviewPayment(adminId, id, body) {
  uuid(id);
  if (!["APPROVED", "REJECTED"].includes(body.status))
    fail("Неизвестное решение");
  const note = text(body.note, 5, 1000, "обоснование / подтверждение платежа");
  return transact(async (c) => {
    const [[payment]] = await c.execute(
      "SELECT * FROM market_payments WHERE id=? FOR UPDATE",
      [id],
    );
    if (!payment) fail("Заявка не найдена", 404);
    if (payment.status !== "PENDING") fail("Заявка уже обработана", 409);
    await c.execute("SELECT id FROM users WHERE id=? FOR UPDATE", [
      payment.user_id,
    ]);
    if (
      (payment.kind === "TOP_UP" && body.status === "APPROVED") ||
      (payment.kind === "WITHDRAWAL" && body.status === "REJECTED")
    ) {
      await walletChange(c, payment.user_id, "RUB", payment.amount);
      await ledger(
        c,
        payment.user_id,
        "RUB",
        payment.amount,
        id,
        payment.kind === "TOP_UP" ? "TOP_UP" : "WITHDRAW_RETURN",
      );
    } else if (payment.kind === "WITHDRAWAL") {
      await ledger(c, payment.user_id, "RUB", "0", id, "WITHDRAW_APPROVED");
    }
    await c.execute(
      "UPDATE market_payments SET status=?,reviewer_id=?,review_note=?,reviewed_at=CURRENT_TIMESTAMP(6) WHERE id=?",
      [body.status, adminId, note, id],
    );
    return { id };
  });
}
