import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";

import { db } from "../config/db.js";
import { decryptWalletPrivateKey } from "./wallet-generator.service.js";
import { broadcastTronTransaction, isTronAddress, prepareTronWithdrawal } from "./tron.service.js";

const isPositiveDecimal = (value) => {
  try {
    return new Decimal(String(value)).gt(0);
  } catch {
    return false;
  }
};

const minimumWithdrawalAmounts = Object.freeze({
  TRX: new Decimal(1),
});

const getWithdrawal = async (userId, idempotencyKey) => {
  const [rows] = await db.execute(
    "SELECT * FROM crypto_withdrawals WHERE user_id = ? AND idempotency_key = ? LIMIT 1",
    [userId, idempotencyKey]
  );
  return rows[0] || null;
};

const serializeWithdrawal = (withdrawal) => ({
  id: withdrawal.id,
  txHash: withdrawal.tx_hash,
  amount: withdrawal.amount,
  currency: withdrawal.currency,
  to: withdrawal.to_address,
  status: withdrawal.status,
  createdAt: withdrawal.created_at,
});

const releaseReservation = async (withdrawal, status, errorMessage = null) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT status FROM crypto_withdrawals WHERE id = ? FOR UPDATE",
      [withdrawal.id]
    );
    if (rows[0]?.status !== "prepared") {
      await connection.rollback();
      return;
    }
    await connection.execute(
      "UPDATE wallets SET balance = balance + ? WHERE id = ?",
      [withdrawal.amount, withdrawal.wallet_id]
    );
    await connection.execute(
      "UPDATE crypto_withdrawals SET status = ?, error_message = ? WHERE id = ?",
      [status, errorMessage, withdrawal.id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export async function createTronWithdrawal({ userId, currency, toAddress, amount, idempotencyKey }) {
  const symbol = String(currency || "").toUpperCase();
  const normalizedAddress = String(toAddress || "").trim();
  const requestKey = String(idempotencyKey || "").trim();

  if (!requestKey || requestKey.length > 128) {
    const error = new Error("Missing or invalid idempotency key");
    error.status = 400;
    throw error;
  }
  if (!["TRX", "USDT"].includes(symbol) || !isTronAddress(normalizedAddress)) {
    const error = new Error("Укажите корректный адрес сети TRON");
    error.status = 400;
    throw error;
  }
  if (!isPositiveDecimal(amount)) {
    const error = new Error("Укажите положительную сумму вывода");
    error.status = 400;
    throw error;
  }
  const minimumAmount = minimumWithdrawalAmounts[symbol];
  if (minimumAmount && new Decimal(String(amount)).lt(minimumAmount)) {
    const error = new Error(`Минимальная сумма вывода ${symbol}: ${minimumAmount.toFixed()} ${symbol}`);
    error.status = 400;
    throw error;
  }

  const existing = await getWithdrawal(userId, requestKey);
  if (existing) return serializeWithdrawal(existing);

  const connection = await db.getConnection();
  let withdrawal;
  try {
    await connection.beginTransaction();
    const [walletRows] = await connection.execute(
      `SELECT id, address, balance, locked_balance, private_key
       FROM wallets
       WHERE user_id = ? AND currency = ? AND COALESCE(status, 'active') = 'active'
       LIMIT 1 FOR UPDATE`,
      [userId, symbol]
    );
    const wallet = walletRows[0];
    const [[swap]]=await connection.execute("SELECT id FROM tron_swaps WHERE user_id=? AND status IN ('active','review') LIMIT 1 FOR UPDATE",[userId]);
    if(swap)throw Object.assign(new Error('Дождитесь завершения свапа TRON'),{status:409});
    if (!wallet?.address || !wallet.private_key) {
      throw new Error("Кошелёк не готов к выводу");
    }
    if (wallet.address === normalizedAddress) {
      const error = new Error("Нельзя выводить средства на этот же адрес кошелька");
      error.status = 400;
      throw error;
    }
    const available = new Decimal(String(wallet.balance)).minus(wallet.locked_balance || 0);
    if (available.lt(new Decimal(String(amount)))) {
      const error = new Error(`Недостаточно средств. Доступно: ${Decimal.max(0,available).toFixed()} ${symbol}`);
      error.status = 400;
      throw error;
    }

    withdrawal = {
      id: randomUUID(),
      user_id: userId,
      wallet_id: wallet.id,
      network: "TRON",
      currency: symbol,
      to_address: normalizedAddress,
      amount: new Decimal(String(amount)).toFixed(symbol === "USDT" ? 6 : 6),
      status: "prepared",
      idempotency_key: requestKey,
      from_address: wallet.address,
      private_key: wallet.private_key,
    };

    await connection.execute("UPDATE wallets SET balance = balance - ? WHERE id = ?", [withdrawal.amount, wallet.id]);
    await connection.execute(
      `INSERT INTO crypto_withdrawals
         (id, user_id, wallet_id, network, currency, to_address, amount, status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        withdrawal.id,
        withdrawal.user_id,
        withdrawal.wallet_id,
        withdrawal.network,
        withdrawal.currency,
        withdrawal.to_address,
        withdrawal.amount,
        withdrawal.status,
        withdrawal.idempotency_key,
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    const privateKey = decryptWalletPrivateKey(
      withdrawal.private_key,
      userId,
      withdrawal.currency
    );
    const prepared = await prepareTronWithdrawal({
      currency: withdrawal.currency,
      fromAddress: withdrawal.from_address,
      toAddress: withdrawal.to_address,
      amount: withdrawal.amount,
      privateKey,
    });
    await db.execute(
      `UPDATE crypto_withdrawals
       SET tx_hash = ?, signed_transaction = ?, fee_reserved = ?, status = 'broadcast'
       WHERE id = ? AND status = 'prepared'`,
      [prepared.txHash, JSON.stringify(prepared.signedTransaction), prepared.feeReserve, withdrawal.id]
    );
    withdrawal.tx_hash = prepared.txHash;
    let broadcast;
    try {
      broadcast = await broadcastTronTransaction(prepared.signedTransaction);
    } catch (error) {
      await db.execute(
        "UPDATE crypto_withdrawals SET error_message = ? WHERE id = ? AND status = 'broadcast'",
        [`Broadcast response is uncertain: ${error.message}`, withdrawal.id]
      );
      error.status = 503;
      throw error;
    }
    await db.execute(
      `UPDATE crypto_withdrawals
       SET broadcast_at = NOW(), error_message = NULL
       WHERE id = ? AND status = 'broadcast'`,
      [withdrawal.id]
    );
    return serializeWithdrawal({ ...withdrawal, tx_hash: broadcast.txid || prepared.txHash, status: "broadcast" });
  } catch (error) {
    if (!withdrawal.tx_hash) {
      await releaseReservation(withdrawal, "failed", error.message);
    }
    error.status ||= 503;
    throw error;
  }
}

export async function reconcileTronWithdrawals(getReceipt) {
  const [withdrawals] = await db.query(
    `SELECT id, wallet_id, amount, status, tx_hash, signed_transaction, broadcast_at, updated_at
     FROM crypto_withdrawals
     WHERE network = 'TRON' AND status = 'broadcast' AND tx_hash IS NOT NULL
     ORDER BY updated_at ASC
     LIMIT 100`
  );
  for (const withdrawal of withdrawals) {
    try {
      const receipt = await getReceipt(withdrawal.tx_hash);
      if (!receipt?.id) {
        if (!withdrawal.broadcast_at && withdrawal.signed_transaction) {
          try {
            const signedTransaction = typeof withdrawal.signed_transaction === "string"
              ? JSON.parse(withdrawal.signed_transaction)
              : withdrawal.signed_transaction;
            await broadcastTronTransaction(signedTransaction);
            await db.execute(
              "UPDATE crypto_withdrawals SET broadcast_at = NOW(), error_message = NULL WHERE id = ? AND status = 'broadcast'",
              [withdrawal.id]
            );
          } catch (error) {
            await db.execute(
              "UPDATE crypto_withdrawals SET error_message = ? WHERE id = ? AND status = 'broadcast'",
              [`Broadcast retry is uncertain: ${error.message}`, withdrawal.id]
            );
          }
        }
        continue;
      }
      // A successful native TRX transfer commonly has only `receipt.net_usage`
      // in gettransactioninfobyid. A result field is present for execution
      // failures and smart-contract calls, so only an explicit non-success
      // value can mark a confirmed transaction as failed.
      const executionResult = receipt.receipt?.result || receipt.result;
      const success = !executionResult || executionResult === "SUCCESS";
      if (success) {
        await db.execute(
          "UPDATE crypto_withdrawals SET status = 'confirmed', fee_charged = ?, confirmed_at = NOW() WHERE id = ? AND status = 'broadcast'",
          [new Decimal(String(receipt.fee || 0)).div(1_000_000).toFixed(6), withdrawal.id]
        );
        continue;
      }
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute(
          "SELECT status FROM crypto_withdrawals WHERE id = ? FOR UPDATE",
          [withdrawal.id]
        );
        if (rows[0]?.status === "broadcast") {
          await connection.execute("UPDATE wallets SET balance = balance + ? WHERE id = ?", [withdrawal.amount, withdrawal.wallet_id]);
          await connection.execute(
            "UPDATE crypto_withdrawals SET status = 'failed', error_message = ? WHERE id = ?",
            [receipt.resMessage || receipt.receipt?.result || "TRON transaction failed", withdrawal.id]
          );
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error(`Withdrawal reconciliation failed for ${withdrawal.id}:`, error.message);
    }
  }
}
