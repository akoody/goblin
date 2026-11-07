import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTransferAmount } from "../src/services/transactions.service.js";

test("normalizes supported decimal values without converting through floating point", () => {
  assert.equal(normalizeTransferAmount("0.1", "USDT").toFixed(6), "0.100000");
  assert.equal(normalizeTransferAmount("0.00000001", "BTC").toFixed(8), "0.00000001");
  assert.equal(normalizeTransferAmount("1e-6", "USDT").toFixed(6), "0.000001");
});

test("rejects non-positive or over-precision transfers", () => {
  for (const value of ["0", "-1", "NaN", "Infinity", "0.0000001"]) {
    assert.throws(
      () => normalizeTransferAmount(value, "USDT"),
      (error) => error.status === 400
    );
  }
});
