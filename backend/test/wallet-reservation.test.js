import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeUsdtReservation,
  releaseUsdtReservation,
  reserveUsdt,
} from "../src/services/wallet-reservation.service.js";

function walletExecutor({ balance, lockedBalance }) {
  const state = { balance, lockedBalance };
  return {
    state,
    async execute(sql, args = []) {
      if (sql.includes("SELECT id,balance,locked_balance,status FROM wallets"))
        return [[{ id: 5, balance: state.balance, locked_balance: state.lockedBalance, status: "active" }]];
      if (sql.includes("SET locked_balance=COALESCE(locked_balance,0)+?")) {
        if (Number(state.balance) - Number(state.lockedBalance) < Number(args[2]))
          return [{ affectedRows: 0 }];
        state.lockedBalance = (Number(state.lockedBalance) + Number(args[0])).toFixed(6);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET balance=balance-?,locked_balance=locked_balance-?")) {
        if (Number(state.balance) < Number(args[0]) || Number(state.lockedBalance) < Number(args[1]))
          return [{ affectedRows: 0 }];
        state.balance = (Number(state.balance) - Number(args[0])).toFixed(6);
        state.lockedBalance = (Number(state.lockedBalance) - Number(args[1])).toFixed(6);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET locked_balance=locked_balance-?")) {
        if (Number(state.lockedBalance) < Number(args[2])) return [{ affectedRows: 0 }];
        state.lockedBalance = (Number(state.lockedBalance) - Number(args[0])).toFixed(6);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test("reserve keeps total balance intact and rejects funds already locked elsewhere", async () => {
  const connection = walletExecutor({ balance: "20.000000", lockedBalance: "12.000000" });
  await assert.rejects(() => reserveUsdt(connection, 7, "8.000001"), { status: 409 });
  await reserveUsdt(connection, 7, "8.000000");
  assert.equal(connection.state.balance, "20.000000");
  assert.equal(connection.state.lockedBalance, "20.000000");
});

test("settlement consumes a lock; cancellation releases it without changing total balance", async () => {
  const settled = walletExecutor({ balance: "20.000000", lockedBalance: "8.000000" });
  await consumeUsdtReservation(settled, 7, "8.000000");
  assert.equal(settled.state.balance, "12.000000");
  assert.equal(settled.state.lockedBalance, "0.000000");

  const cancelled = walletExecutor({ balance: "20.000000", lockedBalance: "8.000000" });
  await releaseUsdtReservation(cancelled, 7, "8.000000");
  assert.equal(cancelled.state.balance, "20.000000");
  assert.equal(cancelled.state.lockedBalance, "0.000000");
});
