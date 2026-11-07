import Decimal from "decimal.js";
import {consumeFeeBonus,discountedFeePercent} from './fee-bonus.service.js';
import { db } from "../config/db.js";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export function calculateP2pSettlement(grossAmount, feePercent) {
  let gross;
  let rate;
  try {
    gross = new Decimal(String(grossAmount));
    rate = new Decimal(String(feePercent ?? 0));
  } catch {
    fail("Некорректные сумма или ставка комиссии");
  }
  if (!gross.isFinite() || gross.lte(0) || !rate.isFinite() || rate.lt(0) || rate.gt(100))
    fail("Некорректные сумма или ставка комиссии");
  const fee = gross.mul(rate).div(100).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  return {
    grossAmount: gross.toFixed(),
    feePercent: rate.toFixed(Math.max(2,Math.min(6,rate.decimalPlaces()))),
    feeAmount: fee.toFixed(6),
    netAmount: gross.minus(fee).toFixed(),
  };
}

export async function applyP2pCommission(connection, { dealId, sellerId, beneficiaryId, grossAmount, feePercent }) {
  if(beneficiaryId&&new Decimal(String(feePercent||0)).gt(0)){const discount=await consumeFeeBonus(connection,beneficiaryId,'P2P',dealId);if(discount)feePercent=discountedFeePercent(feePercent,discount);}
  const settlement = calculateP2pSettlement(grossAmount, feePercent);
  if (new Decimal(settlement.feeAmount).gt(0)) {
    await connection.execute(
      `INSERT INTO p2p_fee_ledger
        (deal_id,seller_id,gross_amount,fee_percent,fee_amount,net_amount)
       VALUES (?,?,?,?,?,?)`,
      [dealId, sellerId, settlement.grossAmount, settlement.feePercent, settlement.feeAmount, settlement.netAmount],
    );
    await connection.execute(
      `INSERT INTO admin_treasury (currency,balance) VALUES ('USDT',?)
       ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance)`,
      [settlement.feeAmount],
    );
  }
  return settlement;
}

export async function getP2pFeePolicy() {
  const [[policy]] = await db.execute(
    "SELECT p2p_fee_percent,updated_at FROM commerce_policy WHERE id=1",
  );
  if (!policy) fail("Настройки комиссии P2P не найдены", 503);
  return { feePercent: Number(policy.p2p_fee_percent), updatedAt: policy.updated_at };
}

function feePercentValue(value) {
  const raw = String(value ?? "").trim();
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(raw))
    fail("Комиссия P2P должна быть от 0 до 100%, не более двух знаков после запятой");
  const fee = new Decimal(raw);
  if (!fee.isFinite() || fee.lt(0) || fee.gt(100))
    fail("Комиссия P2P должна быть от 0 до 100%");
  return fee.toFixed(2);
}

export async function updateP2pFeePolicy(actorId, value) {
  const fee = feePercentValue(value);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[old]] = await connection.execute(
      "SELECT p2p_fee_percent FROM commerce_policy WHERE id=1 FOR UPDATE",
    );
    if (!old) fail("Настройки комиссии P2P не найдены", 503);
    await connection.execute(
      "UPDATE commerce_policy SET p2p_fee_percent=?,updated_by=? WHERE id=1",
      [fee, actorId],
    );
    await connection.execute(
      `INSERT INTO commerce_policy_audit
        (actor_id,previous_fee_percent,new_fee_percent,previous_min_amount,new_min_amount,previous_p2p_fee_percent,new_p2p_fee_percent)
       SELECT ?,guarantor_fee_percent,guarantor_fee_percent,guarantor_min_amount,guarantor_min_amount,?,?
       FROM commerce_policy WHERE id=1`,
      [actorId, old.p2p_fee_percent, fee],
    );
    await connection.commit();
    return { feePercent: Number(fee) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
