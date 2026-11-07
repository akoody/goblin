import test from "node:test";
import assert from "node:assert/strict";
import {
  amount,
  participant,
  transition,
  uuid,
  text,
} from "../src/services/commerce-policy.js";

const deal = { buyer_id: 1, seller_id: 2, status: "READY" };
test("commerce amounts are exact and currency precision is enforced", () => {
  assert.equal(amount("10.60", "RUB"), "10.60");
  assert.equal(amount("0.000001", "USDT"), "0.000001");
  for (const value of [
    "0",
    "-1",
    "Infinity",
    "NaN",
    "1e3",
    "1.001",
    "1000001",
    "",
  ])
    assert.throws(() => amount(value, "RUB"));
  assert.throws(() => amount("1.0000001", "USDT"));
});
test("guarantor participants and reserve permissions", () => {
  assert.equal(participant(deal, "1"), true);
  assert.equal(participant(deal, 3), false);
  assert.equal(transition(deal, 1, "fund"), "FUNDED");
  assert.throws(() => transition(deal, 2, "fund"));
  assert.throws(() => transition(deal, 3, "fund"));
  assert.throws(() => transition({ ...deal, status: "WAITING" }, 1, "fund"));
});
test("only buyer can release delivered goods; seller can refund", () => {
  assert.equal(
    transition({ ...deal, status: "FUNDED" }, 2, "deliver"),
    "DELIVERED",
  );
  assert.throws(() => transition({ ...deal, status: "FUNDED" }, 1, "complete"));
  assert.equal(
    transition({ ...deal, status: "DELIVERED" }, 1, "complete"),
    "COMPLETED",
  );
  assert.throws(() =>
    transition({ ...deal, status: "DELIVERED" }, 2, "complete"),
  );
  assert.equal(
    transition({ ...deal, status: "FUNDED" }, 2, "refund"),
    "REFUNDED",
  );
  assert.throws(() => transition({ ...deal, status: "FUNDED" }, 1, "refund"));
});
test("disputes freeze payment; admin can resolve funded deals exactly once", () => {
  assert.equal(
    transition({ ...deal, status: "FUNDED" }, 1, "dispute"),
    "DISPUTED",
  );
  assert.equal(
    transition({ ...deal, status: "DELIVERED" }, 2, "dispute"),
    "DISPUTED",
  );
  const disputed = { ...deal, status: "DISPUTED" };
  assert.throws(() => transition(disputed, 1, "complete"));
  assert.throws(() => transition(disputed, 2, "refund"));
  assert.throws(() => transition(disputed, 3, "resolve-pay"));
  assert.equal(transition(disputed, 3, "resolve-pay", true), "COMPLETED");
  assert.equal(transition(disputed, 3, "resolve-refund", true), "REFUNDED");
  for (const status of ["FUNDED", "DELIVERED", "DISPUTED"]) {
    assert.equal(transition({ ...deal, status }, 3, "resolve-pay", true), "COMPLETED");
    assert.equal(transition({ ...deal, status }, 3, "resolve-refund", true), "REFUNDED");
    assert.throws(() => transition({ ...deal, status }, 3, "resolve-pay", false));
  }
});
test("admin can cancel only waiting deals without releasing a reserve", () => {
  for (const status of ["WAITING", "READY"])
    assert.equal(transition({ ...deal, status }, 3, "admin-cancel", true), "CANCELLED");
  assert.throws(() => transition({ ...deal, status: "FUNDED" }, 3, "admin-cancel", true));
  assert.throws(() => transition({ ...deal, status: "WAITING" }, 3, "admin-cancel", false));
});
test("closed deals cannot be paid twice or canceled after reserve", () => {
  for (const status of ["COMPLETED", "REFUNDED", "CANCELLED"]) {
    for (const action of [
      "fund",
      "deliver",
      "complete",
      "refund",
      "cancel",
      "resolve-pay",
      "resolve-refund",
    ])
      assert.throws(() => transition({ ...deal, status }, 1, action, true));
  }
  assert.throws(() => transition({ ...deal, status: "FUNDED" }, 1, "cancel"));
  assert.equal(transition(deal, 2, "cancel"), "CANCELLED");
});
test("identifiers and untrusted content validated", () => {
  assert.equal(
    uuid("b734e66f-4fc1-4b3b-82c8-aab020a89172"),
    "b734e66f-4fc1-4b3b-82c8-aab020a89172",
  );
  assert.throws(() => uuid("1' OR 1=1"));
  assert.throws(() => text({ text: "hello" }, 1, 20, "сообщение"));
  assert.equal(text(" hello ", 1, 20, "сообщение"), "hello");
});
