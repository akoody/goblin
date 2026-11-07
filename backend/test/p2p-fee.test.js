import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import { applyP2pCommission, calculateP2pSettlement, updateP2pFeePolicy } from "../src/services/p2p-fee.service.js";

test("P2P commission is calculated precisely from gross USDT", () => {
  assert.deepEqual(calculateP2pSettlement("100", "5"), {
    grossAmount: "100",
    feePercent: "5.00",
    feeAmount: "5.000000",
    netAmount: "95",
  });
  assert.deepEqual(calculateP2pSettlement("0.000011", "5"), {
    grossAmount: "0.000011",
    feePercent: "5.00",
    feeAmount: "0.000001",
    netAmount: "0.00001",
  });
  assert.throws(() => calculateP2pSettlement("10", "100.01"), { status: 400 });
});

test("successful P2P settlement records the fee and credits the admin treasury once in the transaction", async () => {
  const statements = [];
  const connection = { execute: async (sql, values) => { statements.push({ sql, values }); return [{}]; } };
  const settlement = await applyP2pCommission(connection, {
    dealId: 42,
    sellerId: 7,
    grossAmount: "20",
    feePercent: "5.00",
  });
  assert.equal(settlement.feeAmount, "1.000000");
  assert.equal(settlement.netAmount, "19");
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /INSERT INTO p2p_fee_ledger/);
  assert.deepEqual(statements[0].values, [42, 7, "20", "5.00", "1.000000", "19"]);
  assert.match(statements[1].sql, /INSERT INTO admin_treasury/);
  assert.deepEqual(statements[1].values, ["1.000000"]);
});

test("zero-rate legacy trade does not create a commission ledger entry", async () => {
  let queries = 0;
  const settlement = await applyP2pCommission({ execute: async () => { queries += 1; } }, {
    dealId: 9,
    sellerId: 3,
    grossAmount: "8.5",
    feePercent: "0",
  });
  assert.equal(settlement.netAmount, "8.5");
  assert.equal(queries, 0);
});

test("admin P2P fee updates are audited transactionally", async () => {
  const original = db.getConnection;
  const writes = [];
  let committed = 0;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => { committed += 1; },
    rollback: async () => {},
    release: () => {},
    execute: async (sql, values = []) => {
      if (sql.includes("SELECT p2p_fee_percent FROM commerce_policy"))
        return [[{ p2p_fee_percent: "4.00" }]];
      writes.push({ sql, values });
      return [{}];
    },
  });
  try {
    assert.deepEqual(await updateP2pFeePolicy(12, "5"), { feePercent: 5 });
    assert.equal(committed, 1);
    assert.equal(writes.length, 2);
    assert.match(writes[0].sql, /UPDATE commerce_policy SET p2p_fee_percent/);
    assert.deepEqual(writes[0].values, ["5.00", 12]);
    assert.match(writes[1].sql, /INSERT INTO commerce_policy_audit/);
    assert.deepEqual(writes[1].values, [12, "4.00", "5.00"]);
    await assert.rejects(() => updateP2pFeePolicy(12, "5.001"), { status: 400 });
    assert.equal(committed, 1);
  } finally {
    db.getConnection = original;
  }
});
