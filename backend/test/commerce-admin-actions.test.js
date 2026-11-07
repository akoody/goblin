import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import { actOnDeal, markEscrowMessagesRead, updateEscrowFeePolicy } from "../src/services/commerce.service.js";

const id = "b734e66f-4fc1-4b3b-82c8-aab020a89172";

function mockConnection(initialDeal) {
  const state = {
    deal: { ...initialDeal },
    credits: [],
    ledger: [],
    fees: [],
    treasury: [],
    wallets: {
      1: { id: 11, balance: "20.500002", locked_balance: "10.250001", status: "active" },
      2: { id: 12, balance: "0.000000", locked_balance: "0.000000", status: "active" },
    },
    events: [],
    readCursor: 0,
    commits: 0,
    rollbacks: 0,
  };
  const connection = {
    beginTransaction: async () => {},
    commit: async () => { state.commits += 1; },
    rollback: async () => { state.rollbacks += 1; },
    release: () => {},
    async execute(sql, args = []) {
      if(sql.includes('FROM fee_bonuses'))return [[]];
      if (sql.includes("SELECT * FROM commerce_deals WHERE id=? FOR UPDATE"))
        return [[{ ...state.deal }]];
      if (sql.includes("SELECT id, balance, locked_balance, status FROM wallets") || sql.includes("SELECT id,balance,locked_balance,status FROM wallets"))
        return [[{ ...state.wallets[args[0]] }]];
      if (sql.includes("UPDATE wallets SET balance=balance-?,locked_balance=locked_balance-?")) {
        const wallet = state.wallets[args[2]];
        wallet.balance = (Number(wallet.balance) - Number(args[0])).toFixed(6);
        wallet.locked_balance = (Number(wallet.locked_balance) - Number(args[1])).toFixed(6);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE wallets SET locked_balance=locked_balance-?")) {
        const wallet = state.wallets[args[1]];
        wallet.locked_balance = (Number(wallet.locked_balance) - Number(args[0])).toFixed(6);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE wallets SET locked_balance=COALESCE(locked_balance,0)+?")) {
        const wallet = Object.values(state.wallets).find((item) => item.id === args[1]);
        wallet.locked_balance = (Number(wallet.locked_balance) + Number(args[0])).toFixed(6);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SELECT id FROM wallets WHERE user_id=? AND currency='USDT' AND status='active'"))
        return [[{ id: state.wallets[args[0]]?.id }].filter((row) => row.id)];
      if (sql.includes("UPDATE wallets SET balance = balance + ?")) {
        state.credits.push({ amount: args[0], walletId: args[1] });
        const wallet = Object.values(state.wallets).find((item) => item.id === args[1]);
        wallet.balance = (Number(wallet.balance) + Number(args[0])).toFixed(6);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO commerce_ledger")) {
        state.ledger.push(args);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO commerce_guarantor_fee_ledger")) {
        state.fees.push(args);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO admin_treasury")) {
        state.treasury.push(args);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE commerce_deals SET status=?")) {
        state.deal.status = args[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("UPDATE commerce_deals SET status='FUNDED'")) {
        state.deal.status = "FUNDED";
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO commerce_events")) {
        state.events.push(args);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SELECT id FROM commerce_deals WHERE id=? AND kind='ESCROW'"))
        return [[{ id }]];
      if (sql.includes("SELECT COALESCE(MAX(id),0) AS message_id"))
        return [[{ message_id: 42 }]];
      if (sql.includes("INSERT INTO commerce_admin_deal_reads")) {
        state.readCursor = Math.max(state.readCursor, args[2]);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in mock: ${sql}`);
    },
    async query(sql) {
      if (sql.includes("SELECT id,status,internal_transfers_enabled FROM users"))
        return [[{ id: 1, status: "active", internal_transfers_enabled: 1 }, { id: 2, status: "active", internal_transfers_enabled: 1 }]];
      if (sql.includes("SELECT id FROM users WHERE id IN")) return [[]];
      throw new Error(`Unexpected query in mock: ${sql}`);
    },
  };
  return { state, connection };
}

test("admin resolution credits the chosen participant once and writes its status", async () => {
  const original = db.getConnection;
  for (const [action, status, recipient] of [
    ["resolve-pay", "COMPLETED", 2],
    ["resolve-refund", "REFUNDED", 1],
  ]) {
    const { state, connection } = mockConnection({
      id,
      kind: "ESCROW",
      status: "DELIVERED",
      buyer_id: 1,
      seller_id: 2,
      currency: "USDT",
      amount: "10.250001",
      guarantor_fee_percent: "5.00",
      funded_at: "2026-10-16 10:00:00",
    });
    db.getConnection = async () => connection;
    try {
      const result = await actOnDeal(99, id, { action, note: "Проверено администратором" }, true);
      assert.equal(result.status, status);
      assert.equal(state.deal.status, status);
      assert.equal(state.ledger[0][0], recipient);
      if (action === "resolve-pay") {
        assert.equal(state.credits.length, 1);
        assert.equal(state.credits[0].amount, "9.737501");
        assert.equal(state.ledger.length, 2);
        assert.equal(state.ledger[0][2], "-0.512500");
        assert.equal(state.ledger[0][4], "GUARANTEE_FEE");
        assert.equal(state.ledger[1][2], "9.737501");
        assert.equal(state.ledger[1][4], "PAYOUT");
        assert.equal(state.fees.length, 1);
        assert.equal(state.fees[0][4], "0.512500");
        assert.equal(state.fees[0][5], "9.737501");
        assert.deepEqual(state.treasury, [["0.512500"]]);
        assert.equal(state.wallets[1].balance, "10.250001");
        assert.equal(state.wallets[1].locked_balance, "0.000000");
        assert.equal(state.wallets[2].balance, "9.737501");
      } else {
        assert.equal(state.credits.length, 0);
        assert.equal(state.ledger.length, 1);
        assert.equal(state.ledger[0][2], "10.250001");
        assert.equal(state.fees.length, 0);
        assert.equal(state.treasury.length, 0);
        assert.equal(state.wallets[1].balance, "20.500002");
        assert.equal(state.wallets[1].locked_balance, "0.000000");
      }
      await assert.rejects(() => actOnDeal(99, id, { action, note: "Повтор" }, true), { status: 409 });
      assert.equal(state.credits.length, action === "resolve-pay" ? 1 : 0);
      assert.equal(state.commits, 1);
      assert.equal(state.rollbacks, 1);
    } finally {
      db.getConnection = original;
    }
  }
});

test("admin cancellation closes a waiting deal without changing wallets", async () => {
  const original = db.getConnection;
  const { state, connection } = mockConnection({
    id,
    kind: "ESCROW",
    status: "WAITING",
    buyer_id: 1,
    seller_id: null,
    currency: "USDT",
    amount: "10.000000",
    funded_at: null,
  });
  db.getConnection = async () => connection;
  try {
    const result = await actOnDeal(99, id, { action: "admin-cancel", note: "Сделка закрыта администратором" }, true);
    assert.equal(result.status, "CANCELLED");
    assert.equal(state.credits.length, 0);
    assert.equal(state.ledger.length, 0);
    assert.equal(state.events[0][2], "admin-cancel");
  } finally {
    db.getConnection = original;
  }
});

test("guarantor reserve locks funds without reducing total wallet balance", async () => {
  const original = db.getConnection;
  const { state, connection } = mockConnection({
    id,
    kind: "ESCROW",
    status: "READY",
    buyer_id: 1,
    seller_id: 2,
    currency: "USDT",
    amount: "10.250001",
    funded_at: null,
  });
  db.getConnection = async () => connection;
  try {
    const result = await actOnDeal(1, id, { action: "fund" });
    assert.equal(result.status, "FUNDED");
    assert.equal(state.wallets[1].balance, "20.500002");
    assert.equal(state.wallets[1].locked_balance, "20.500002");
    assert.equal(state.ledger[0][2], "-10.250001");
  } finally {
    db.getConnection = original;
  }
});

test("admin chat read marker advances to the latest message", async () => {
  const original = db.getConnection;
  const { state, connection } = mockConnection({});
  db.getConnection = async () => connection;
  try {
    await markEscrowMessagesRead(99, id);
    assert.equal(state.readCursor, 42);
    assert.equal(state.commits, 1);
  } finally {
    db.getConnection = original;
  }
});

test("guarantor fee edits are bounded, transactional and audited", async () => {
  const original = db.getConnection;
  const state = { fee: "5.00", minimum: "5.000000", audit: [], commits: 0 };
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => { state.commits += 1; },
    rollback: async () => {},
    release: () => {},
    async execute(sql, args = []) {
      if (sql.includes("SELECT guarantor_fee_percent,guarantor_min_amount FROM commerce_policy"))
        return [[{ guarantor_fee_percent: state.fee, guarantor_min_amount: state.minimum }]];
      if (sql.includes("UPDATE commerce_policy SET guarantor_fee_percent")) {
        state.fee = args[0];
        state.minimum = args[1];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO commerce_policy_audit")) {
        state.audit.push(args);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL in mock: ${sql}`);
    },
  });
  try {
    assert.deepEqual(await updateEscrowFeePolicy(99, "6.25", "12.5"), { feePercent: 6.25, minimumAmount: "12.500000" });
    assert.equal(state.fee, "6.25");
    assert.equal(state.minimum, "12.500000");
    assert.deepEqual(state.audit, [[99, "5.00", "6.25", "5.000000", "12.500000"]]);
    assert.equal(state.commits, 1);
    await assert.rejects(() => updateEscrowFeePolicy(99, "100.01", "12.5"), { status: 400 });
    await assert.rejects(() => updateEscrowFeePolicy(99, "1.234", "12.5"), { status: 400 });
    await assert.rejects(() => updateEscrowFeePolicy(99, "6.25", "0"), { status: 400 });
    await assert.rejects(() => updateEscrowFeePolicy(99, "6.25", "1.0000001"), { status: 400 });
    assert.equal(state.commits, 1);
  } finally {
    db.getConnection = original;
  }
});
