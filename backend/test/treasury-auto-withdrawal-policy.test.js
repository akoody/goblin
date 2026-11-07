import test from "node:test";
import assert from "node:assert/strict";

import { db } from "../src/config/db.js";
import {
  getTreasuryAutoWithdrawalPolicy,
  updateTreasuryAutoWithdrawalPolicy,
} from "../src/services/treasury-auto-withdrawal-policy.service.js";

test("treasury auto-withdrawal policy reads a masked-safe policy shape", async () => {
  const original = db.execute;
  db.execute = async () => [[{
    network: "TRON",
    currency: "USDT",
    destination_address: null,
    threshold_amount: "100.000000",
    enabled: 0,
    updated_at: "2026-10-19 10:00:00",
  }]];
  try {
    assert.deepEqual(await getTreasuryAutoWithdrawalPolicy(), {
      network: "TRON",
      currency: "USDT",
      destinationAddress: "",
      thresholdAmount: "100.000000",
      enabled: false,
      updatedAt: "2026-10-19 10:00:00",
    });
  } finally {
    db.execute = original;
  }
});

test("admin policy saves threshold and destination but always leaves auto-send disabled", async () => {
  const original = db.execute;
  const writes = [];
  db.execute = async (sql, values) => {
    if (sql.startsWith("UPDATE treasury_auto_withdrawal_policy")) writes.push({ sql, values });
    return [[{
      network: "TRON",
      currency: "USDT",
      destination_address: "",
      threshold_amount: "125.500000",
      enabled: 0,
      updated_at: "2026-10-19 10:00:00",
    }]];
  };
  try {
    const result = await updateTreasuryAutoWithdrawalPolicy(17, {
      destinationAddress: "",
      thresholdAmount: "125.5",
    });
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].values, [null, "125.500000", 17]);
    assert.match(writes[0].sql, /enabled = 0/);
    assert.equal(result.enabled, false);
  } finally {
    db.execute = original;
  }
});

test("admin policy rejects invalid thresholds and malformed TRON addresses", async () => {
  await assert.rejects(
    () => updateTreasuryAutoWithdrawalPolicy(17, { thresholdAmount: "4.99", destinationAddress: "" }),
    { status: 400 }
  );
  await assert.rejects(
    () => updateTreasuryAutoWithdrawalPolicy(17, { thresholdAmount: "100", destinationAddress: "not-an-address" }),
    { status: 400 }
  );
});
