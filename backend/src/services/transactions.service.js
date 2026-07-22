import { exec } from "child_process";
import util from "util";
import { db } from "../config/db.js";

const execAsync = util.promisify(exec);

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

export async function send(userId, to, amount, currency, type) {
  await ensureTransferAllowed(userId, type);

  const [users] = await db.query("SELECT id, username FROM users WHERE id = ?", [userId]);

  if (users.length === 0) {
    throw new Error("User not found");
  }

  const [wallets] = await db.query(
    "SELECT id, address, balance, private_key FROM wallets WHERE user_id = ? AND currency = ?",
    [userId, currency.toUpperCase()]
  );

  if (wallets.length === 0) {
    throw new Error(`Wallet for ${currency} not found`);
  }

  const fromWallet = wallets[0];

  if (parseFloat(fromWallet.balance) < amount) {
    throw new Error(`Insufficient balance. Available: ${fromWallet.balance} ${currency}`);
  }

  if (type === "internal") {
    return sendInternal(userId, fromWallet, to, amount, currency);
  }

  return sendExternal(userId, fromWallet, to, amount, currency);
}

async function sendExternal(userId, fromWallet, address, amount, currency) {
  const privateKey = fromWallet.private_key;
  const scriptPath = `/home/${currency.toLowerCase()}/send.py`;
  const command = `python3 ${scriptPath} -userId "${userId}" -to "${address}" -amount "${amount}" -privateKey "${privateKey}"`;

  let pythonOutput;
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) console.error("Python stderr:", stderr);
    pythonOutput = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Transaction failed: ${err.message}`);
  }

  if (!pythonOutput.result) {
    throw new Error(`Transaction failed: ${pythonOutput.error || "Unknown error"}`);
  }

  const txHash = pythonOutput.tx_hash;
  const fromAddress = pythonOutput.from;

  await db.query("START TRANSACTION");
  try {
    await db.query("UPDATE wallets SET balance = balance - ? WHERE id = ?", [amount, fromWallet.id]);

    const [result] = await db.query(
      `INSERT INTO transactions (wallet_id, tx_hash, from_address, to_address, amount, currency, type)
       VALUES (?, ?, ?, ?, ?, ?, 'external')`,
      [fromWallet.id, txHash, fromAddress, address, amount, currency.toUpperCase()]
    );

    await updateExchangeWallet(currency, fromAddress, amount, "subtract");

    await db.query("COMMIT");

    return {
      transactionId: result.insertId,
      txHash,
      from: fromAddress,
      to: address,
      amount,
      currency,
      type: "external",
      status: "completed",
    };
  } catch (err) {
    await db.query("ROLLBACK");
    throw new Error(`Transaction failed: ${err.message}`);
  }
}

async function sendInternal(userId, fromWallet, email, amount, currency) {
  const [recipients] = await db.query("SELECT id FROM users WHERE email = ?", [email]);

  if (recipients.length === 0) {
    throw new Error(`User with email ${email} not found`);
  }

  const recipientId = recipients[0].id;

  if (recipientId === userId) {
    throw new Error("Cannot send to yourself");
  }

  const [recipientWallets] = await db.query(
    "SELECT id, address FROM wallets WHERE user_id = ? AND currency = ?",
    [recipientId, currency.toUpperCase()]
  );

  if (recipientWallets.length === 0) {
    throw new Error(`Recipient does not have a ${currency} wallet`);
  }

  const toWallet = recipientWallets[0];

  await db.query("START TRANSACTION");
  try {
    await db.query("UPDATE wallets SET balance = balance - ? WHERE id = ?", [amount, fromWallet.id]);
    await db.query("UPDATE wallets SET balance = balance + ? WHERE id = ?", [amount, toWallet.id]);

    const [result] = await db.query(
      `INSERT INTO transactions (wallet_id, from_address, to_address, amount, currency, type)
       VALUES (?, ?, ?, ?, ?, 'internal')`,
      [fromWallet.id, fromWallet.address, email, amount, currency.toUpperCase()]
    );

    await db.query("COMMIT");

    return {
      transactionId: result.insertId,
      txHash: null,
      from: fromWallet.address,
      to: email,
      amount,
      currency,
      type: "internal",
      status: "completed",
    };
  } catch (err) {
    await db.query("ROLLBACK");
    throw new Error(`Internal transfer failed: ${err.message}`);
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
