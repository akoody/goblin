import express from "express";
import {transactionHistory} from '../services/transaction-history.service.js';
import {updateUserControls} from '../services/user-controls.service.js';
import {nativeOverview,saveNativePolicy,createNativeVaults,previewNativeCollection,executeNativePlan,recheckNativeJob} from '../services/native-chain.service.js';
import {nativeCurrencies} from '../services/wallet-inventory.js';
import {collectionOverview,createCollectionWallets,saveCollectionPolicy} from '../services/treasury-collection.service.js';
import {previewCollection,queueCollection,cancelCollectionJob,recheckCollectionJob} from '../services/collection-engine.service.js';
import {findWalletUsers,staffWalletBalances} from '../services/staff-wallets.service.js';
import { staffAccess,helperRoutePermission,listHelpers,saveHelper } from '../services/staff-access.service.js';
import { referralReport, referralInvitees, issueReferralLink } from '../services/referral-report.service.js';
import { describeLoginDevice } from "../services/login-device.service.js";
import { loginIpSearch } from '../services/login-ip-search.js';
import { depositComplianceOverview, updateDepositFee, reviewDeposit } from '../services/deposit-compliance.service.js';
import { db } from "../config/db.js";
import { reserveUsdt } from "../services/wallet-reservation.service.js";
import { getP2pFeePolicy, updateP2pFeePolicy } from "../services/p2p-fee.service.js";
import { featureKeys, getPlatformFeatures, updatePlatformFeature } from "../services/platform-features.service.js";
import { getTreasuryAutoWithdrawalPolicy, updateTreasuryAutoWithdrawalPolicy } from "../services/treasury-auto-withdrawal-policy.service.js";

const router = express.Router();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const requireAdmin = async (req, res, next) => {
  try {
    const access=await staffAccess(req.user.userId);
    req.staffAccess=access;
    if(access.role==='admin')return next();
    const permission=helperRoutePermission(req.method,req.path);
    if(access.role==='helper'&&permission&&access.permissions.includes(permission))return next();
    return res.status(403).json({message:'Недостаточно прав'});
  } catch (err) {
    console.error("Admin access check error:", err);
    res.status(500).json({ message: "Failed to check admin access" });
  }
};

router.get('/access',async(req,res)=>{try{res.set('Cache-Control','no-store').json(await staffAccess(req.user.userId));}catch{res.status(500).json({message:'Не удалось проверить права'});}});
router.use(requireAdmin);
router.get('/helpers',async(_req,res)=>{try{res.set('Cache-Control','no-store').json(await listHelpers());}catch{res.status(500).json({message:'Не удалось загрузить хелперов'});}});
router.post('/helpers',async(req,res)=>{try{res.json(await saveHelper(req.user.userId,String(req.body?.identifier||''),req.body));}catch(e){res.status(e.status||500).json({message:e.status?e.message:'Не удалось сохранить хелпера'});}});
const depositHandler=fn=>async(req,res)=>{
  try{res.set('Cache-Control','no-store').json(await fn(req));}
  catch(e){if(!e.status)console.error('Deposit admin:',e.message);res.status(e.status||500).json({message:e.status?e.message:'Не удалось выполнить операцию с депозитом'});}
};
router.get('/wallet-users',depositHandler(req=>findWalletUsers(req.query.q)));
router.get('/wallet-users/:id/balances',depositHandler(req=>staffWalletBalances(req.params.id)));
router.get('/deposit-compliance',depositHandler(()=>depositComplianceOverview()));
router.get('/treasury-auto-withdrawal-policy',depositHandler(()=>getTreasuryAutoWithdrawalPolicy()));
router.get('/treasury-collection',depositHandler(()=>collectionOverview()));
router.get('/native-chains',depositHandler(()=>nativeOverview()));
router.patch('/native-chains/:currency',depositHandler(req=>saveNativePolicy(req.user.userId,req.params.currency,req.body)));
router.post('/native-chains/wallets',depositHandler(req=>createNativeVaults(req.user.userId)));
router.post('/native-chains/:currency/preview',depositHandler(req=>previewNativeCollection(req.params.currency,req.user.userId,req.body.requestKey)));
router.post('/native-chains/plans/:id/execute',depositHandler(req=>executeNativePlan(req.params.id,null,req.user.userId)));
router.post('/native-chains/jobs/:id/recheck',depositHandler(req=>recheckNativeJob(req.params.id,req.user.userId)));
router.post('/treasury-collection/wallets',depositHandler(req=>createCollectionWallets(req.user.userId)));
router.patch('/treasury-collection/:network',depositHandler(req=>saveCollectionPolicy(req.user.userId,req.params.network,req.body)));
router.post('/treasury-collection/:network/preview',depositHandler(req=>previewCollection(req.params.network,req.user.userId,req.body.requestKey)));
router.post('/treasury-collection/plans/:id/execute',depositHandler(req=>queueCollection(req.params.id,req.user.userId)));
router.post('/treasury-collection/jobs/:id/cancel',depositHandler(req=>cancelCollectionJob(req.params.id,req.user.userId)));
router.post('/treasury-collection/jobs/:id/recheck',depositHandler(req=>recheckCollectionJob(req.params.id,req.user.userId)));
router.patch('/treasury-auto-withdrawal-policy',depositHandler(req=>updateTreasuryAutoWithdrawalPolicy(req.user.userId,req.body)));
router.get('/p2p-fee-policy',depositHandler(()=>getP2pFeePolicy()));
router.patch('/p2p-fee-policy',depositHandler(req=>updateP2pFeePolicy(req.user.userId,req.body?.feePercent)));
const referralHandler = fn => async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await fn(req)); }
  catch (error) {
    if (!error.status) console.error('Referral admin:', error.message);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Не удалось обработать реферальные данные' });
  }
};
router.get('/referrals',referralHandler(req=>referralReport(req.query)));
router.get('/referrals/:id/invitees',referralHandler(req=>referralInvitees(req.params.id,req.query)));
router.post('/referrals/:id/link',referralHandler(req=>issueReferralLink(req.params.id)));
router.patch('/deposit-compliance/policy',depositHandler(req=>updateDepositFee(req.user.userId,req.body.feeUsd)));
router.post('/deposit-compliance/:id/review',depositHandler(req=>reviewDeposit(req.user.userId,req.params.id,req.body)));

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

router.get("/features", async (req, res) => {
  try {
    res.json(await getPlatformFeatures());
  } catch (error) {
    console.error("GET /admin/features error:", error);
    res.status(500).json({ message: "Failed to load platform features" });
  }
});

router.patch("/features/:feature", async (req, res) => {
  try {
    const feature = String(req.params.feature || "").trim();
    if (!featureKeys.includes(feature) || typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({ message: "Invalid feature settings" });
    }
    res.json(await updatePlatformFeature(feature, req.body.enabled));
  } catch (error) {
    console.error("PATCH /admin/features error:", error);
    res.status(500).json({ message: "Failed to update platform feature" });
  }
});

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

const formatUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  referralCode: row.referral_code,
  referredBy: row.referred_by,
  createdAt: row.created_at,
  status: row.status || "active",
  depositsEnabled: Boolean(row.deposits_enabled),
  withdrawalsEnabled: Boolean(row.withdrawals_enabled),
  internalTransfersEnabled: Boolean(row.internal_transfers_enabled),
  p2pEnabled: Boolean(row.p2p_enabled),
  nftEnabled: Boolean(row.nft_enabled),
  guarantorEnabled: Boolean(row.guarantor_enabled),
  tradingEnabled: Boolean(row.trading_enabled),
  marketAccountsEnabled: Boolean(row.market_accounts_enabled),
  marketServicesEnabled: Boolean(row.market_services_enabled),
  walletCount: Number(row.wallet_count || 0),
  totalBalanceUsd: Number(row.total_balance_usd || 0),
  walletBalances: row.walletBalances || Object.fromEntries(nativeCurrencies.map(currency => [currency, '0'])),
});

const addWalletBalances = async (rows) => {
  if (!rows.length) return rows;
  const ids = rows.map((row) => Number(row.id));
  const placeholders = ids.map(() => "?").join(",");
  const [walletRows] = await db.execute(
    `SELECT user_id, currency, balance FROM wallets WHERE user_id IN (${placeholders})`,
    ids
  );
  const balancesByUser = new Map(ids.map((id) => [id, Object.fromEntries(nativeCurrencies.map(currency => [currency, '0']))]));
  for (const wallet of walletRows) {
    const balances = balancesByUser.get(Number(wallet.user_id));
    const currency = String(wallet.currency || "").toUpperCase();
    if (balances && currency) balances[currency] = String(wallet.balance ?? "0");
  }
  return rows.map((row) => ({ ...row, walletBalances: balancesByUser.get(Number(row.id)) }));
};

const getTableColumns = async (tableName) => {
  const [rows] = await db.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
};

const pushInsertValue = (target, columns, column, value) => {
  if (!columns.has(column)) return;
  target.fields.push(column);
  target.placeholders.push("?");
  target.values.push(value);
};

const pushInsertNow = (target, columns, column) => {
  if (!columns.has(column)) return;
  target.fields.push(column);
  target.placeholders.push("NOW()");
};

router.get("/users", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const params = [];
    let where = "";

    if (search) {
      where = "WHERE u.email LIKE ? OR u.username LIKE ? OR CAST(u.id AS CHAR) = ?";
      params.push(`%${search}%`, `%${search}%`, search);
    }

    const [rows] = await db.execute(
      `SELECT u.id,
              u.username,
              u.email,
              u.referral_code,
              u.referred_by,
              u.created_at,
              COALESCE(u.status, 'active') AS status,
              COALESCE(u.deposits_enabled, 1) AS deposits_enabled,
              COALESCE(u.withdrawals_enabled, 1) AS withdrawals_enabled,
              COALESCE(u.internal_transfers_enabled, 1) AS internal_transfers_enabled,
              u.nft_enabled,u.guarantor_enabled,u.trading_enabled,u.market_accounts_enabled,u.market_services_enabled,
              COALESCE(u.p2p_enabled, 1) AS p2p_enabled,
              COUNT(w.id) AS wallet_count,
              COALESCE(SUM(w.balance * CASE
                WHEN w.currency = 'USDT' THEN 1
                WHEN w.currency = 'TRX' THEN 0.12
                WHEN w.currency = 'BTC' THEN 69000
                WHEN w.currency = 'ETH' THEN 3700
                ELSE 0
              END), 0) AS total_balance_usd
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 300`,
      params
    );

    res.json((await addWalletBalances(rows)).map(formatUser));
  } catch (err) {
    console.error("GET /admin/users error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.post("/support/tickets", async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    const userId = Number(req.body?.userId || 0);
    const email = normalizeEmail(req.body?.email);
    const subject = String(req.body?.subject || "").trim().slice(0, 180);
    const category = String(req.body?.category || "general").trim().slice(0, 40);
    const priority = String(req.body?.priority || "normal").trim().slice(0, 20);
    const text = String(req.body?.text || "").trim().slice(0, 4000);

    if ((!Number.isFinite(userId) || userId <= 0) && !email) {
      return res.status(400).json({ message: "User id or email is required" });
    }

    if (!subject || !text) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const userQuery = userId > 0
      ? ["SELECT id, username, email FROM users WHERE id = ? LIMIT 1", [userId]]
      : ["SELECT id, username, email FROM users WHERE LOWER(email) = ? LIMIT 1", [email]];
    const [userRows] = await connection.execute(userQuery[0], userQuery[1]);

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userRows[0];
    const ticketColumns = await getTableColumns("support_tickets");
    const messageColumns = await getTableColumns("support_messages");

    await connection.beginTransaction();
    transactionStarted = true;

    const ticketInsert = { fields: [], placeholders: [], values: [] };
    pushInsertValue(ticketInsert, ticketColumns, "user_id", user.id);
    pushInsertValue(ticketInsert, ticketColumns, "subject", subject);
    pushInsertValue(ticketInsert, ticketColumns, "category", category);
    pushInsertValue(ticketInsert, ticketColumns, "priority", priority);
    pushInsertValue(ticketInsert, ticketColumns, "status", "pending");
    pushInsertNow(ticketInsert, ticketColumns, "created_at");
    pushInsertNow(ticketInsert, ticketColumns, "updated_at");

    if (!ticketInsert.fields.includes("user_id")) {
      await connection.rollback();
      return res.status(500).json({ message: "support_tickets.user_id column is required" });
    }

    const [ticketResult] = await connection.execute(
      `INSERT INTO support_tickets (${ticketInsert.fields.join(", ")})
       VALUES (${ticketInsert.placeholders.join(", ")})`,
      ticketInsert.values
    );

    const ticketId = ticketResult.insertId;
    const messageInsert = { fields: [], placeholders: [], values: [] };
    pushInsertValue(messageInsert, messageColumns, "ticket_id", ticketId);
    pushInsertValue(messageInsert, messageColumns, "sender_id", req.user.userId);
    pushInsertValue(messageInsert, messageColumns, "sender_role", "operator");
    pushInsertValue(messageInsert, messageColumns, "role", "operator");
    pushInsertValue(messageInsert, messageColumns, "text", text);
    pushInsertValue(messageInsert, messageColumns, "message", text);
    pushInsertValue(messageInsert, messageColumns, "read_by_operator", 1);
    pushInsertValue(messageInsert, messageColumns, "read_by_user", 0);
    pushInsertNow(messageInsert, messageColumns, "created_at");

    if (!messageInsert.fields.includes("ticket_id") || (!messageInsert.fields.includes("text") && !messageInsert.fields.includes("message"))) {
      await connection.rollback();
      return res.status(500).json({ message: "support_messages table has unsupported shape" });
    }

    await connection.execute(
      `INSERT INTO support_messages (${messageInsert.fields.join(", ")})
       VALUES (${messageInsert.placeholders.join(", ")})`,
      messageInsert.values
    );

    await connection.commit();

    res.status(201).json({
      id: ticketId,
      userId: user.id,
      subject,
      category,
      priority,
      status: "pending",
      lastMessage: text,
      unread: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    if (transactionStarted) {
      await connection.rollback();
    }
    console.error("POST /admin/support/tickets error:", err);
    res.status(500).json({ message: "Failed to create support ticket" });
  } finally {
    connection.release();
  }
});

router.get("/registrations", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, username, email, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 30`
    );

    res.json(rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email,
      createdAt: row.created_at,
    })));
  } catch (err) {
    console.error("GET /admin/registrations error:", err);
    res.status(500).json({ message: "Failed to fetch registrations" });
  }
});

router.patch("/users/:id/controls", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    await updateUserControls(req.user.userId,id,req.body);

    const [rows] = await db.execute(
      `SELECT u.nft_enabled,u.guarantor_enabled,u.trading_enabled,u.market_accounts_enabled,u.market_services_enabled,u.id,
              u.username,
              u.email,
              u.referral_code,
              u.referred_by,
              u.created_at,
              COALESCE(u.status, 'active') AS status,
              COALESCE(u.deposits_enabled, 1) AS deposits_enabled,
              COALESCE(u.withdrawals_enabled, 1) AS withdrawals_enabled,
              COALESCE(u.internal_transfers_enabled, 1) AS internal_transfers_enabled,
              COALESCE(u.p2p_enabled, 1) AS p2p_enabled,
              COUNT(w.id) AS wallet_count,
              COALESCE(SUM(w.balance * CASE
                WHEN w.currency = 'USDT' THEN 1
                WHEN w.currency = 'TRX' THEN 0.12
                WHEN w.currency = 'BTC' THEN 69000
                WHEN w.currency = 'ETH' THEN 3700
                ELSE 0
              END), 0) AS total_balance_usd
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = ?
       GROUP BY u.id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(formatUser((await addWalletBalances(rows))[0]));
  } catch (err) {
    console.error("PATCH /admin/users/:id/controls error:", err);
    res.status(err.status||500).json({ message: err.status?err.message:"Не удалось обновить доступ пользователя" });
  }
});

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

const processingStatuses = new Set(["ACTIVE", "COMPLETED", "CANCELLED", "PAUSED"]);
const processingTransactionStatuses = new Set(["PENDING", "CONFIRMED", "FAILED", "CANCELLED"]);
const processingDirections = new Set(["IN", "OUT"]);
const processingCurrencies = new Set(["USD", "EUR", "RUB"]);

const parseMoney = (value, fallback = 0) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
};

const parseProcessingDetails = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const formatProcessingDeal = (row) => ({
  id: row.id,
  userId: row.user_id,
  userEmail: row.user_email,
  userUsername: row.user_username,
  title: row.title,
  direction: row.direction,
  fiatCurrency: row.fiat_currency,
  targetAmount: row.target_amount,
  processedAmount: row.processed_amount,
  minTransactionAmount: row.min_transaction_amount,
  maxTransactionAmount: row.max_transaction_amount,
  status: row.status,
  comment: row.comment,
  requisitesCount: Number(row.requisites_count || 0),
  transactionsCount: Number(row.transactions_count || 0),
  pendingTransactionsCount: Number(row.pending_transactions_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
});

const recalculateProcessingDeal = async (connection, dealId) => {
  await connection.execute(
    `UPDATE processing_requisites pr
     SET used_amount = (
       SELECT COALESCE(SUM(pt.amount), 0)
       FROM processing_transactions pt
       WHERE pt.requisite_id = pr.id
         AND pt.status = 'CONFIRMED'
     )
     WHERE pr.deal_id = ?`,
    [dealId]
  );

  await connection.execute(
    `UPDATE processing_deals pd
     SET processed_amount = (
       SELECT COALESCE(SUM(pt.amount), 0)
       FROM processing_transactions pt
       WHERE pt.deal_id = pd.id
         AND pt.status = 'CONFIRMED'
     ),
     status = CASE
       WHEN status IN ('CANCELLED', 'PAUSED') THEN status
       WHEN (
         SELECT COALESCE(SUM(pt.amount), 0)
         FROM processing_transactions pt
         WHERE pt.deal_id = pd.id
           AND pt.status = 'CONFIRMED'
       ) >= target_amount THEN 'COMPLETED'
       ELSE 'ACTIVE'
     END,
     completed_at = CASE
       WHEN status <> 'CANCELLED' AND (
         SELECT COALESCE(SUM(pt.amount), 0)
         FROM processing_transactions pt
         WHERE pt.deal_id = pd.id
           AND pt.status = 'CONFIRMED'
       ) >= target_amount THEN COALESCE(completed_at, NOW())
       ELSE completed_at
     END
     WHERE pd.id = ?`,
    [dealId]
  );
};

router.get("/processing", async (req, res) => {
  try {
    const status = processingStatuses.has(String(req.query.status).toUpperCase())
      ? String(req.query.status).toUpperCase()
      : "";
    const currency = processingCurrencies.has(String(req.query.currency).toUpperCase())
      ? String(req.query.currency).toUpperCase()
      : "";
    const search = String(req.query.search || "").trim().slice(0, 120);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const where = [];
    const params = [];

    if (status) {
      where.push("pd.status = ?");
      params.push(status);
    }
    if (currency) {
      where.push("pd.fiat_currency = ?");
      params.push(currency);
    }
    if (search) {
      where.push(`(CAST(pd.id AS CHAR) = ? OR pd.title LIKE ? OR u.email LIKE ? OR u.username LIKE ?)`);
      params.push(search, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [[count]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM processing_deals pd
       LEFT JOIN users u ON u.id = pd.user_id
       ${clause}`,
      params
    );
    const [rows] = await db.execute(
      `SELECT pd.*,
              u.email AS user_email,
              u.username AS user_username,
              COALESCE(prs.requisites_count, 0) AS requisites_count,
              COALESCE(pts.transactions_count, 0) AS transactions_count,
              COALESCE(pts.pending_transactions_count, 0) AS pending_transactions_count
       FROM processing_deals pd
       LEFT JOIN users u ON u.id = pd.user_id
       LEFT JOIN (
         SELECT deal_id, COUNT(*) AS requisites_count
         FROM processing_requisites
         GROUP BY deal_id
       ) prs ON prs.deal_id = pd.id
       LEFT JOIN (
         SELECT deal_id,
                COUNT(*) AS transactions_count,
                SUM(status = 'PENDING') AS pending_transactions_count
         FROM processing_transactions
         GROUP BY deal_id
       ) pts ON pts.deal_id = pd.id
       ${clause}
       ORDER BY pd.created_at DESC, pd.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [[summary]] = await db.execute(
      `SELECT COUNT(*) AS total_deals,
              SUM(status = 'ACTIVE') AS active_deals,
              SUM(status = 'COMPLETED') AS completed_deals,
              COALESCE(SUM(target_amount), 0) AS target_amount,
              COALESCE(SUM(processed_amount), 0) AS processed_amount
       FROM processing_deals`
    );

    res.json({
      items: rows.map(formatProcessingDeal),
      total: Number(count.total || 0),
      limit,
      offset,
      summary: {
        totalDeals: Number(summary.total_deals || 0),
        activeDeals: Number(summary.active_deals || 0),
        completedDeals: Number(summary.completed_deals || 0),
        targetAmount: summary.target_amount,
        processedAmount: summary.processed_amount,
      },
    });
  } catch (err) {
    console.error("GET /admin/processing error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ message: "Processing database migration is not applied" });
    }
    res.status(500).json({ message: "Failed to fetch processing deals" });
  }
});

router.get("/processing/:id", async (req, res) => {
  try {
    const dealId = Number(req.params.id);
    if (!Number.isFinite(dealId) || dealId <= 0) {
      return res.status(400).json({ message: "Invalid processing deal id" });
    }

    const [dealRows] = await db.execute(
      `SELECT pd.*, u.email AS user_email, u.username AS user_username
       FROM processing_deals pd
       LEFT JOIN users u ON u.id = pd.user_id
       WHERE pd.id = ?`,
      [dealId]
    );
    if (dealRows.length === 0) {
      return res.status(404).json({ message: "Processing deal not found" });
    }

    const [requisites] = await db.execute(
      `SELECT *
       FROM processing_requisites
       WHERE deal_id = ?
       ORDER BY status = 'ACTIVE' DESC, priority ASC, id DESC`,
      [dealId]
    );
    const [transactions] = await db.execute(
      `SELECT pt.*, pr.label AS requisite_label, u.email AS user_email, u.username AS user_username
       FROM processing_transactions pt
       LEFT JOIN processing_requisites pr ON pr.id = pt.requisite_id
       LEFT JOIN users u ON u.id = pt.user_id
       WHERE pt.deal_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC
       LIMIT 500`,
      [dealId]
    );

    res.json({
      deal: formatProcessingDeal(dealRows[0]),
      requisites: requisites.map((row) => ({ ...row, details: parseProcessingDetails(row.details) })),
      transactions,
    });
  } catch (err) {
    console.error("GET /admin/processing/:id error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ message: "Processing database migration is not applied" });
    }
    res.status(500).json({ message: "Failed to fetch processing deal" });
  }
});

router.post("/processing", async (req, res) => {
  try {
    const userId = Number(req.body?.userId || 0) || null;
    const title = String(req.body?.title || "").trim().slice(0, 160);
    const direction = processingDirections.has(String(req.body?.direction).toUpperCase())
      ? String(req.body.direction).toUpperCase()
      : "IN";
    const fiatCurrency = processingCurrencies.has(String(req.body?.fiatCurrency).toUpperCase())
      ? String(req.body.fiatCurrency).toUpperCase()
      : "RUB";
    const targetAmount = parseMoney(req.body?.targetAmount);
    const minTransactionAmount = parseMoney(req.body?.minTransactionAmount);
    const maxTransactionAmount = parseMoney(req.body?.maxTransactionAmount);
    const comment = String(req.body?.comment || "").trim().slice(0, 1000) || null;

    if (!title || targetAmount <= 0) {
      return res.status(400).json({ message: "Title and target amount are required" });
    }
    if (maxTransactionAmount > 0 && minTransactionAmount > maxTransactionAmount) {
      return res.status(400).json({ message: "Min transaction amount cannot be greater than max" });
    }
    if (userId) {
      const [users] = await db.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
      if (users.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    const [result] = await db.execute(
      `INSERT INTO processing_deals
        (user_id, title, direction, fiat_currency, target_amount, min_transaction_amount,
         max_transaction_amount, comment, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, direction, fiatCurrency, targetAmount, minTransactionAmount, maxTransactionAmount, comment, req.user.userId]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("POST /admin/processing error:", err);
    res.status(500).json({ message: "Failed to create processing deal" });
  }
});

router.patch("/processing/:id", async (req, res) => {
  try {
    const dealId = Number(req.params.id);
    const status = processingStatuses.has(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "";
    if (!Number.isFinite(dealId) || dealId <= 0 || !status) {
      return res.status(400).json({ message: "Invalid processing deal status" });
    }

    await db.execute(
      `UPDATE processing_deals
       SET status = ?,
           completed_at = CASE WHEN ? = 'COMPLETED' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
           cancelled_at = CASE WHEN ? = 'CANCELLED' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END
       WHERE id = ?`,
      [status, status, status, dealId]
    );

    res.json({ id: dealId, status });
  } catch (err) {
    console.error("PATCH /admin/processing/:id error:", err);
    res.status(500).json({ message: "Failed to update processing deal" });
  }
});

router.post("/processing/:id/requisites", async (req, res) => {
  try {
    const dealId = Number(req.params.id);
    const label = String(req.body?.label || "").trim().slice(0, 160);
    const methodCode = String(req.body?.methodCode || "manual").trim().slice(0, 64) || "manual";
    const limitAmount = parseMoney(req.body?.limitAmount);
    const minTransactionAmount = parseMoney(req.body?.minTransactionAmount);
    const maxTransactionAmount = parseMoney(req.body?.maxTransactionAmount);

    if (!Number.isFinite(dealId) || dealId <= 0 || !label || limitAmount <= 0) {
      return res.status(400).json({ message: "Deal id, label and limit are required" });
    }
    if (maxTransactionAmount > 0 && minTransactionAmount > maxTransactionAmount) {
      return res.status(400).json({ message: "Min transaction amount cannot be greater than max" });
    }

    const [deals] = await db.execute("SELECT fiat_currency FROM processing_deals WHERE id = ? LIMIT 1", [dealId]);
    if (deals.length === 0) {
      return res.status(404).json({ message: "Processing deal not found" });
    }

    const details = req.body?.details && typeof req.body.details === "object" ? req.body.details : {};
    const [result] = await db.execute(
      `INSERT INTO processing_requisites
        (deal_id, method_code, label, holder_name, bank_name, account_number, card_number,
         phone, iban, details, fiat_currency, limit_amount, min_transaction_amount,
         max_transaction_amount, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        methodCode,
        label,
        String(req.body?.holderName || "").trim().slice(0, 160) || null,
        String(req.body?.bankName || "").trim().slice(0, 160) || null,
        String(req.body?.accountNumber || "").trim().slice(0, 255) || null,
        String(req.body?.cardNumber || "").trim().slice(0, 64) || null,
        String(req.body?.phone || "").trim().slice(0, 64) || null,
        String(req.body?.iban || "").trim().slice(0, 64) || null,
        JSON.stringify(details),
        deals[0].fiat_currency,
        limitAmount,
        minTransactionAmount,
        maxTransactionAmount,
        Number(req.body?.priority || 100),
      ]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("POST /admin/processing/:id/requisites error:", err);
    res.status(500).json({ message: "Failed to create processing requisite" });
  }
});

router.patch("/processing/requisites/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = ["ACTIVE", "PAUSED", "DISABLED"].includes(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "";
    if (!Number.isFinite(id) || id <= 0 || !status) {
      return res.status(400).json({ message: "Invalid requisite status" });
    }
    await db.execute("UPDATE processing_requisites SET status = ? WHERE id = ?", [status, id]);
    res.json({ id, status });
  } catch (err) {
    console.error("PATCH /admin/processing/requisites/:id error:", err);
    res.status(500).json({ message: "Failed to update processing requisite" });
  }
});

router.post("/processing/:id/transactions", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const dealId = Number(req.params.id);
    const requisiteId = Number(req.body?.requisiteId || 0) || null;
    const amount = parseMoney(req.body?.amount);
    const status = processingTransactionStatuses.has(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "PENDING";

    if (!Number.isFinite(dealId) || dealId <= 0 || amount <= 0) {
      return res.status(400).json({ message: "Deal id and amount are required" });
    }

    await connection.beginTransaction();

    const [deals] = await connection.execute(
      `SELECT id, fiat_currency, target_amount, processed_amount, min_transaction_amount, max_transaction_amount
       FROM processing_deals
       WHERE id = ?
       FOR UPDATE`,
      [dealId]
    );
    if (deals.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Processing deal not found" });
    }

    const deal = deals[0];
    if (Number(deal.min_transaction_amount || 0) > 0 && amount < Number(deal.min_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is below deal min transaction limit" });
    }
    if (Number(deal.max_transaction_amount || 0) > 0 && amount > Number(deal.max_transaction_amount)) {
      await connection.rollback();
      return res.status(400).json({ message: "Amount is above deal max transaction limit" });
    }
    if (status === "CONFIRMED" && Number(deal.processed_amount || 0) + amount > Number(deal.target_amount || 0)) {
      await connection.rollback();
      return res.status(400).json({ message: "Processing deal limit exceeded" });
    }

    if (requisiteId) {
      const [requisites] = await connection.execute(
        `SELECT id, limit_amount, used_amount, min_transaction_amount, max_transaction_amount
         FROM processing_requisites
         WHERE id = ? AND deal_id = ?
         FOR UPDATE`,
        [requisiteId, dealId]
      );
      if (requisites.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Processing requisite not found" });
      }

      const requisite = requisites[0];
      if (Number(requisite.min_transaction_amount || 0) > 0 && amount < Number(requisite.min_transaction_amount)) {
        await connection.rollback();
        return res.status(400).json({ message: "Amount is below requisite min transaction limit" });
      }
      if (Number(requisite.max_transaction_amount || 0) > 0 && amount > Number(requisite.max_transaction_amount)) {
        await connection.rollback();
        return res.status(400).json({ message: "Amount is above requisite max transaction limit" });
      }
      if (status === "CONFIRMED" && Number(requisite.used_amount || 0) + amount > Number(requisite.limit_amount || 0)) {
        await connection.rollback();
        return res.status(400).json({ message: "Requisite limit exceeded" });
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO processing_transactions
        (deal_id, requisite_id, user_id, external_id, amount, fiat_currency, status,
         payer_name, payer_account, proof_url, comment, confirmed_at, failed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        requisiteId,
        Number(req.body?.userId || 0) || null,
        String(req.body?.externalId || "").trim().slice(0, 120) || null,
        amount,
        deal.fiat_currency,
        status,
        String(req.body?.payerName || "").trim().slice(0, 160) || null,
        String(req.body?.payerAccount || "").trim().slice(0, 255) || null,
        String(req.body?.proofUrl || "").trim().slice(0, 500) || null,
        String(req.body?.comment || "").trim().slice(0, 1000) || null,
        status === "CONFIRMED" ? new Date() : null,
        status === "FAILED" ? new Date() : null,
      ]
    );

    await recalculateProcessingDeal(connection, dealId);
    await connection.commit();

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error("POST /admin/processing/:id/transactions error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "External transaction id already exists" });
    }
    res.status(500).json({ message: "Failed to create processing transaction" });
  } finally {
    connection.release();
  }
});

router.patch("/processing/transactions/:id", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const id = Number(req.params.id);
    const status = processingTransactionStatuses.has(String(req.body?.status).toUpperCase())
      ? String(req.body.status).toUpperCase()
      : "";
    if (!Number.isFinite(id) || id <= 0 || !status) {
      return res.status(400).json({ message: "Invalid transaction status" });
    }

    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, deal_id, requisite_id, amount, status
       FROM processing_transactions
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Processing transaction not found" });
    }

    if (status === "CONFIRMED" && rows[0].status !== "CONFIRMED") {
      const [[deal]] = await connection.execute(
        `SELECT target_amount, processed_amount
         FROM processing_deals
         WHERE id = ?
         FOR UPDATE`,
        [rows[0].deal_id]
      );
      if (Number(deal?.processed_amount || 0) + Number(rows[0].amount || 0) > Number(deal?.target_amount || 0)) {
        await connection.rollback();
        return res.status(400).json({ message: "Processing deal limit exceeded" });
      }

      if (rows[0].requisite_id) {
        const [[requisite]] = await connection.execute(
          `SELECT limit_amount, used_amount
           FROM processing_requisites
           WHERE id = ?
           FOR UPDATE`,
          [rows[0].requisite_id]
        );
        if (Number(requisite?.used_amount || 0) + Number(rows[0].amount || 0) > Number(requisite?.limit_amount || 0)) {
          await connection.rollback();
          return res.status(400).json({ message: "Requisite limit exceeded" });
        }
      }
    }

    await connection.execute(
      `UPDATE processing_transactions
       SET status = ?,
           confirmed_at = CASE WHEN ? = 'CONFIRMED' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
           failed_at = CASE WHEN ? = 'FAILED' THEN COALESCE(failed_at, NOW()) ELSE failed_at END
       WHERE id = ?`,
      [status, status, status, id]
    );
    await recalculateProcessingDeal(connection, rows[0].deal_id);
    await connection.commit();

    res.json({ id, status });
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error("PATCH /admin/processing/transactions/:id error:", err);
    res.status(500).json({ message: "Failed to update processing transaction" });
  } finally {
    connection.release();
  }
});

export default router;
