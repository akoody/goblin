import { db } from "../config/db.js";
import { externalWalletProcessing } from "../config/wallet-networks.js";
import { createTronWithdrawal } from "./withdrawal.service.js";
import Decimal from "decimal.js";

const supportedCurrencies = new Set(["BTC", "ETH", "USDT", "TRX"]);

export const normalizeTransferAmount = (value, currency) => {
  let amount;
  try {
    amount = new Decimal(String(value));
  } catch {
    amount = new Decimal(NaN);
  }

  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 18) {
    const error = new Error("Укажите корректную положительную сумму");
    error.status = 400;
    throw error;
  }

  const precision = currency === "BTC" ? 8 : currency === "USDT" || currency === "TRX" ? 6 : 18;
  if (amount.decimalPlaces() > precision) {
    const error = new Error(`Для ${currency} допустимо не более ${precision} знаков после запятой`);
    error.status = 400;
    throw error;
  }

  return amount;
};


const ensureTransferAllowed = async (userId, type) => {
  const [rows] = await db.query(
    `SELECT COALESCE(status, 'active') AS status,
            COALESCE(withdrawals_enabled, 1) AS withdrawals_enabled,
            COALESCE(internal_transfers_enabled, 1) AS internal_transfers_enabled
     FROM users
     WHERE id = ?`,
    [userId]
  );

  if (rows.length === 0) {
    throw new Error("User not found");
  }

  if (rows[0].status === "blocked") {
    throw new Error("Account is blocked");
  }

  if (type === "internal" && Number(rows[0].internal_transfers_enabled) !== 1) {
    throw new Error("Internal transfers are disabled for this account");
  }

  if (type !== "internal" && Number(rows[0].withdrawals_enabled) !== 1) {
    throw new Error("Withdrawals are disabled for this account");
  }
};

export async function send(userId, to, amount, currency, type, idempotencyKey) {
  await ensureTransferAllowed(userId, type);

  const symbol = String(currency || "").trim().toUpperCase();
  if (!supportedCurrencies.has(symbol)) {
    const error = new Error("Неизвестная валюта");
    error.status = 400;
    throw error;
  }
  const decimalAmount = normalizeTransferAmount(amount, symbol);
  if(type!=='internal'&&['BTC','ETH'].includes(symbol))throw Object.assign(new Error('Для BTC/ETH сначала подтвердите расчёт комиссии в форме вывода'),{status:409});
  const requestKey = String(idempotencyKey || "").trim();
  if (!requestKey || requestKey.length > 128) {
    const error = new Error("Не удалось проверить запрос на повтор. Обновите страницу и попробуйте снова.");
    error.status = 400;
    throw error;
  }

  if (type === "internal") {
    return sendInternal(userId, to, decimalAmount, symbol, requestKey);
  }

  const assetCapabilities = externalWalletProcessing.assets[symbol];
  if (type !== "internal" && (!externalWalletProcessing.withdrawalsEnabled || !assetCapabilities?.withdrawalsEnabled)) {
    const error = new Error(externalWalletProcessing.reason);
    error.status = 503;
    throw error;
  }

  if (["TRX", "USDT"].includes(symbol)) {
    return createTronWithdrawal({
      userId,
      currency: symbol,
      toAddress: to,
      amount: decimalAmount.toFixed(),
      idempotencyKey: requestKey,
    });
  }

  throw new Error("Вывод для этой сети пока не подключён");
}

async function sendInternal(userId, email, amount, currency, idempotencyKey) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 255) {
    const error = new Error("Укажите корректную почту получателя");
    error.status = 400;
    throw error;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [accounts] = await connection.execute(
      `SELECT id, status, COALESCE(internal_transfers_enabled, 1) AS internal_transfers_enabled
       FROM users
       WHERE id = ? OR LOWER(email) = ?
       ORDER BY id
       FOR UPDATE`,
      [userId, normalizedEmail]
    );
    const sender = accounts.find((account) => Number(account.id) === Number(userId));
    const recipient = accounts.find((account) => Number(account.id) !== Number(userId));
    if (!sender || sender.status !== "active" || Number(sender.internal_transfers_enabled) !== 1) {
      const error = new Error("Внутренние переводы для аккаунта отключены");
      error.status = 403;
      throw error;
    }
    if (!recipient || recipient.status !== "active") {
      const error = new Error("Активный аккаунт с такой почтой не найден");
      error.status = 404;
      throw error;
    }
    if (Number(recipient.id) === Number(userId)) {
      const error = new Error("Нельзя переводить средства самому себе");
      error.status = 400;
      throw error;
    }

    const [walletRows] = await connection.execute(
      `SELECT id, user_id, address, balance
       FROM wallets
       WHERE currency = ? AND user_id IN (?, ?)
         AND COALESCE(status, 'active') = 'active'
       ORDER BY id
       FOR UPDATE`,
      [currency, userId, recipient.id]
    );
    const fromWallet = walletRows.find((wallet) => Number(wallet.user_id) === Number(userId));
    const toWallet = walletRows.find((wallet) => Number(wallet.user_id) === Number(recipient.id));
    if (!fromWallet) {
      const error = new Error(`Кошелёк ${currency} отправителя не найден`);
      error.status = 404;
      throw error;
    }
    if (!toWallet) {
      const error = new Error(`У получателя нет кошелька ${currency}`);
      error.status = 404;
      throw error;
    }

    const [previousRows] = await connection.execute(
      `SELECT id, to_address, amount, currency
       FROM transactions
       WHERE wallet_id = ? AND idempotency_key = ?
       LIMIT 1`,
      [fromWallet.id, idempotencyKey]
    );
    if (previousRows.length > 0) {
      const previous = previousRows[0];
      if (
        String(previous.to_address || "").trim().toLowerCase() !== normalizedEmail ||
        String(previous.currency).toUpperCase() !== currency ||
        !new Decimal(String(previous.amount)).eq(amount)
      ) {
        const error = new Error("Ключ запроса уже использован для другого перевода");
        error.status = 409;
        throw error;
      }
      await connection.commit();
      return {
        transactionId: previous.id,
        txHash: null,
        from: fromWallet.address,
        to: normalizedEmail,
        amount: previous.amount,
        currency,
        type: "internal",
        status: "completed",
        duplicate: true,
      };
    }

    const amountText = amount.toFixed();
    const [debit] = await connection.execute(
      `UPDATE wallets SET balance = balance - ?
       WHERE id = ? AND balance - COALESCE(locked_balance, 0) >= ?`,
      [amountText, fromWallet.id, amountText]
    );
    if (debit.affectedRows !== 1) {
      const error = new Error("Недостаточно средств для перевода");
      error.status = 409;
      throw error;
    }
    await connection.execute(
      "UPDATE wallets SET balance = balance + ? WHERE id = ?",
      [amountText, toWallet.id]
    );

    const [result] = await connection.execute(
      `INSERT INTO transactions (wallet_id, from_address, to_address, amount, currency, type, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'internal', ?)`,
      [fromWallet.id, fromWallet.address, normalizedEmail, amountText, currency, idempotencyKey]
    );

    await connection.commit();

    return {
      transactionId: result.insertId,
      txHash: null,
      from: fromWallet.address,
      to: normalizedEmail,
      amount: amountText,
      currency,
      type: "internal",
      status: "completed",
    };
  } catch (err) {
    await connection.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      const error = new Error("Этот перевод уже обрабатывается или выполнен");
      error.status = 409;
      throw error;
    }
    throw err;
  } finally {
    connection.release();
  }
}

async function updateExchangeWallet(currency, address, amount, operation) {
  const [wallets] = await db.query("SELECT id FROM exchange_wallets WHERE currency = ?", [currency.toUpperCase()]);

  if (wallets.length === 0) {
    await db.query(
      "INSERT INTO exchange_wallets (currency, address, balance) VALUES (?, ?, ?)",
      [currency.toUpperCase(), address, operation === "subtract" ? -amount : amount]
    );
  } else {
    await db.query(
      `UPDATE exchange_wallets SET balance = balance ${operation === "subtract" ? "-" : "+"} ? WHERE currency = ?`,
      [amount, currency.toUpperCase()]
    );
  }
}
