import Decimal from "decimal.js";

import { db } from "../config/db.js";
import { isTronProcessingConfigured } from "../config/wallet-networks.js";
import {
  createTronWeb,
  getSolidTronReceipt,
  listConfirmedTrxTransfers,
  listConfirmedUsdtTransfers,
  tokenFromBaseUnits,
  trxFromSun,
} from "./tron.service.js";
import { reconcileTronWithdrawals } from "./withdrawal.service.js";
import { recordPendingDeposit } from './deposit-compliance.service.js';

const SCAN_INTERVAL_MS = 15_000;
const CURSOR_OVERLAP_MS = 60_000;
let running = false;

const creditDeposit = recordPendingDeposit;

const saveCursor = (walletId, currency, timestamp) => db.execute(
  `INSERT INTO blockchain_scan_state (wallet_id, currency, last_block_timestamp)
   VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE last_block_timestamp = GREATEST(last_block_timestamp, VALUES(last_block_timestamp))`,
  [walletId, currency, timestamp]
);

const scanTrxWallet = async (wallet, cursor) => {
  const transactions = await listConfirmedTrxTransfers(
    wallet.address,
    Math.max(0, cursor - CURSOR_OVERLAP_MS)
  );
  const tronWeb = createTronWeb();
  let maxTimestamp = cursor;

  for (const transaction of transactions) {
    const contract = transaction.raw_data?.contract?.[0];
    const value = contract?.parameter?.value;
    const timestamp = Number(transaction.block_timestamp || transaction.raw_data?.timestamp || 0);
    maxTimestamp = Math.max(maxTimestamp, timestamp);
    // TronGrid can omit `ret` in an otherwise confirmed response.  Treat an
    // explicit non-success result as failed, but never discard a confirmed
    // transfer solely because that optional field is absent.
    if (contract?.type !== "TransferContract" || (transaction.ret?.[0]?.contractRet && transaction.ret[0].contractRet !== "SUCCESS")) continue;
    const to = value?.to_address ? tronWeb.address.fromHex(value.to_address) : "";
    if (to !== wallet.address || new Decimal(String(value?.amount || 0)).lte(0)) continue;
    const from = value?.owner_address ? tronWeb.address.fromHex(value.owner_address) : null;
    await creditDeposit({
      wallet,
      currency: "TRX",
      txHash: transaction.txID,
      from,
      to,
      amount: trxFromSun(value.amount),
      timestamp,
    });
  }
  return maxTimestamp || Date.now() - CURSOR_OVERLAP_MS;
};

const scanUsdtWallet = async (wallet, cursor) => {
  const transactions = await listConfirmedUsdtTransfers(
    wallet.address,
    Math.max(0, cursor - CURSOR_OVERLAP_MS)
  );
  let maxTimestamp = cursor;

  for (const transaction of transactions) {
    const timestamp = Number(transaction.block_timestamp || 0);
    maxTimestamp = Math.max(maxTimestamp, timestamp);
    if (transaction.type !== "Transfer" || transaction.to !== wallet.address) continue;
    const amount = tokenFromBaseUnits(transaction.value, transaction.token_info?.decimals || 6);
    if (new Decimal(amount).lte(0)) continue;
    await creditDeposit({
      wallet,
      currency: "USDT",
      txHash: transaction.transaction_id,
      // The account-specific TRC-20 endpoint returns at most one matching
      // Transfer event for this wallet in a transaction.  A fixed fallback is
      // stable across cursor overlap and therefore preserves idempotency.
      eventIndex: Number(transaction.event_index ?? 0),
      from: transaction.from || null,
      to: transaction.to,
      amount,
      timestamp,
    });
  }
  return maxTimestamp || Date.now() - CURSOR_OVERLAP_MS;
};

const scanDeposits = async () => {
  const [wallets] = await db.query(
    `SELECT w.id, w.currency, w.address, COALESCE(s.last_block_timestamp, 0) AS scan_cursor
     FROM wallets w
     INNER JOIN users u ON u.id = w.user_id
     LEFT JOIN blockchain_scan_state s ON s.wallet_id = w.id AND s.currency = w.currency
     WHERE w.currency IN ('TRX', 'USDT')
       AND w.address IS NOT NULL
       AND w.address <> ''
       AND COALESCE(w.status, 'active') = 'active'
       AND COALESCE(u.status, 'active') = 'active'
       AND COALESCE(u.deposits_enabled, 1) = 1
     ORDER BY w.id`
  );

  for (const wallet of wallets) {
    try {
      const cursor = Number(wallet.scan_cursor || 0);
      const nextCursor = wallet.currency === "TRX"
        ? await scanTrxWallet(wallet, cursor)
        : await scanUsdtWallet(wallet, cursor);
      await saveCursor(wallet.id, wallet.currency, nextCursor);
    } catch (error) {
      console.error(`Blockchain scan failed for wallet ${wallet.id} ${wallet.currency}:`, error.message);
    }
  }
};

export const runBlockchainCycle = async () => {
  if (!isTronProcessingConfigured()) return;
  if (running) return;
  running = true;
  try {
    await scanDeposits();
    await reconcileTronWithdrawals(getSolidTronReceipt);
  } finally {
    running = false;
  }
};

export const startBlockchainEngine = () => {
  runBlockchainCycle().catch((error) => console.error("Blockchain cycle failed:", error));
  const timer = setInterval(() => {
    runBlockchainCycle().catch((error) => console.error("Blockchain cycle failed:", error));
  }, SCAN_INTERVAL_MS);
  timer.unref?.();
  return timer;
};
