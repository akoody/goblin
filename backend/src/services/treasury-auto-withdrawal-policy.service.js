import Decimal from "decimal.js";

import { db } from "../config/db.js";
import { isTronAddress } from "./tron.service.js";

const serialize = (row) => ({
  network: row.network,
  currency: row.currency,
  destinationAddress: row.destination_address || "",
  thresholdAmount: String(row.threshold_amount),
  enabled: Boolean(row.enabled),
  updatedAt: row.updated_at,
});

export async function getTreasuryAutoWithdrawalPolicy() {
  const [rows] = await db.execute(
    "SELECT network, currency, destination_address, threshold_amount, enabled, updated_at FROM treasury_auto_withdrawal_policy WHERE id = 1 LIMIT 1"
  );
  if (!rows[0]) throw new Error("Treasury auto-withdrawal policy is missing; run database migrations");
  return serialize(rows[0]);
}

export async function updateTreasuryAutoWithdrawalPolicy(adminId, input = {}) {
  const address = String(input.destinationAddress || "").trim();
  const rawThreshold = String(input.thresholdAmount ?? "").trim();
  let threshold;
  try {
    threshold = new Decimal(rawThreshold);
  } catch {
    threshold = new Decimal(NaN);
  }

  if (!threshold.isFinite() || threshold.lt(5) || threshold.gt("1000000000")) {
    const error = new Error("Порог автовывода должен быть от 5 до 1 000 000 000 USDT");
    error.status = 400;
    throw error;
  }
  if (address && !isTronAddress(address)) {
    const error = new Error("Укажите корректный адрес USDT в сети TRON");
    error.status = 400;
    throw error;
  }

  await db.execute(
    `UPDATE treasury_auto_withdrawal_policy
     SET destination_address = ?, threshold_amount = ?, enabled = 0, updated_by = ?
     WHERE id = 1`,
    [address || null, threshold.toFixed(6), adminId]
  );
  return getTreasuryAutoWithdrawalPolicy();
}
