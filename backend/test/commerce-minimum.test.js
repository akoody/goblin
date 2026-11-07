import test from "node:test";
import assert from "node:assert/strict";
import { amount, requireMinimumAmount } from "../src/services/commerce-policy.js";

test("guarantor minimum is exact and rejects amounts below the configured limit", () => {
  assert.doesNotThrow(() => requireMinimumAmount(amount("5", "USDT"), "5.000000"));
  assert.doesNotThrow(() => requireMinimumAmount(amount("5.000001", "USDT"), "5"));
  assert.throws(
    () => requireMinimumAmount(amount("4.999999", "USDT"), "5"),
    { status: 400, message: "Минимальная сумма сделки гаранта — 5.000000 USDT" },
  );
});
