// Explicit opt-in, disposable accounts only. Never runs as part of npm test.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/config/db.js";
import * as commerce from "../src/services/commerce.service.js";

if (process.env.COMMERCE_DB_CHECK !== "1")
  throw new Error("Run with COMMERCE_DB_CHECK=1 after migrations");
const users = [],
  tag = `commerce-qa-${randomUUID()}`;
const key = () => randomUUID();
async function rejects(work, status) {
  await assert.rejects(work, (e) => e.status === status);
}
async function balance(id, currency = "USDT") {
  const [[r]] = await db.execute(
    currency === "RUB"
      ? "SELECT balance FROM market_wallets WHERE user_id=?"
      : "SELECT balance FROM wallets WHERE user_id=? AND currency='USDT'",
    [id],
  );
  return Number(r?.balance || 0);
}
try {
  for (let i = 0; i < 3; i++) {
    const [result] = await db.execute(
      "INSERT INTO users (username,email,password_hash,status) VALUES (?,?,?,'active')",
      [`${tag}-${i}`, `${tag}-${i}@example.invalid`, "!disabled-qa-account"],
    );
    users.push(result.insertId);
    await db.execute(
      "INSERT INTO wallets (user_id,currency,balance,locked_balance,status) VALUES (?,'USDT',100,0,'active')",
      [result.insertId],
    );
  }
  const [buyer, seller, outsider] = users;
  const categories = await commerce.catalog();
  assert.equal(categories.length, 95);
  const payment = await commerce.requestPayment(buyer, {
    kind: "TOP_UP",
    amount: "200",
    details: "QA payment evidence",
    requestKey: key(),
  });
  assert.equal(await balance(buyer, "RUB"), 0);
  await commerce.reviewPayment(outsider, payment.id, {
    status: "APPROVED",
    note: "QA simulated approval",
  });
  assert.equal(await balance(buyer, "RUB"), 200);
  await rejects(
    () =>
      commerce.reviewPayment(outsider, payment.id, {
        status: "APPROVED",
        note: "Duplicate test",
      }),
    409,
  );
  const listing = await commerce.createListing(seller, {
    category: categories[0].slug,
    section: categories[0].sections[0],
    title: "QA disposable listing",
    description: "QA test description only",
    deliveryNote: "QA manual delivery",
    price: "10.60",
  });
  const buyKey = key();
  const catalogRows = await commerce.listings({
    category: categories[0].slug,
    search: "QA disposable",
    offset: "0",
  });
  assert.equal(
    catalogRows.some((row) => row.id === listing.id),
    true,
  );
  assert.equal("delivery_note" in catalogRows[0], false);
  assert.equal("email" in catalogRows[0], false);
  const purchases = await Promise.all([
    commerce.purchase(buyer, { listingId: listing.id, requestKey: buyKey }),
    commerce.purchase(buyer, { listingId: listing.id, requestKey: buyKey }),
  ]);
  assert.equal(purchases[0].id, purchases[1].id);
  assert.equal(await balance(buyer, "RUB"), 189.4);
  await commerce.setListingStatus(outsider, listing.id, "BLOCKED", true);
  await rejects(
    () => commerce.setListingStatus(seller, listing.id, "ACTIVE"),
    404,
  );
  await rejects(
    () =>
      commerce.purchase(buyer, { listingId: listing.id, requestKey: key() }),
    409,
  );
  await rejects(() => commerce.dealDetails(outsider, purchases[0].id), 403);
  await rejects(
    () => commerce.sendMessage(outsider, purchases[0].id, "QA outsider"),
    403,
  );
  if (process.env.COMMERCE_HTTP_CHECK === "1") {
    const { signAccessToken } = await import("../src/config/jwt.js");
    const token = signAccessToken({ userId: outsider, tokenVersion: 0 });
    const base = "http://127.0.0.1:3000/api/commerce";
    assert.equal((await fetch(base + "/catalog")).status, 200);
    assert.equal(
      (await fetch(base + "/listings?category=&search=&offset=0")).status,
      200,
    );
    assert.equal((await fetch(base + "/me")).status, 401);
    assert.equal(
      (
        await fetch(base + "/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + "/admin", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + `/deals/${purchases[0].id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
      403,
    );
    const post = async (user, path, body, status = 200) => {
      const response = await fetch(base + path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signAccessToken({ userId: user, tokenVersion: 0 })}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      assert.equal(response.status, status, JSON.stringify(data));
      return data;
    };
    const live = await post(buyer, "/escrow", {
      title: "QA HTTP reserve",
      terms: "QA HTTP delivery terms",
      role: "BUYER",
      amount: "0.5",
      requestKey: key(),
    });
    await post(seller, `/deals/${live.id}/join`, {});
    await post(buyer, `/deals/${live.id}/action`, { action: "fund" });
    assert.equal(await balance(buyer), 99.5);
    await post(buyer, `/deals/${live.id}/action`, { action: "fund" }, 409);
    await post(
      outsider,
      `/deals/${live.id}/messages`,
      { text: "QA outsider message" },
      403,
    );
    await post(seller, `/deals/${live.id}/messages`, {
      text: "QA HTTP seller reply",
    });
    await post(seller, `/deals/${live.id}/action`, { action: "refund" });
    assert.equal(await balance(buyer), 100);
    console.log(
      "PASS HTTP: public catalog, auth/admin/participant guards; create/join/reserve/retry/chat/refund.",
    );
  }
  await commerce.sendMessage(seller, purchases[0].id, "QA goods delivered");
  await commerce.actOnDeal(seller, purchases[0].id, { action: "deliver" });
  await rejects(
    () => commerce.actOnDeal(seller, purchases[0].id, { action: "complete" }),
    409,
  );
  const closes = await Promise.allSettled([
    commerce.actOnDeal(buyer, purchases[0].id, { action: "complete" }),
    commerce.actOnDeal(buyer, purchases[0].id, { action: "complete" }),
  ]);
  assert.equal(closes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(seller, "RUB"), 10.6);
  const withdrawal = await commerce.requestPayment(buyer, {
    kind: "WITHDRAWAL",
    amount: "20",
    details: "QA bank details",
    requestKey: key(),
  });
  assert.equal(await balance(buyer, "RUB"), 169.4);
  await commerce.reviewPayment(outsider, withdrawal.id, {
    status: "REJECTED",
    note: "QA withdrawal rejected",
  });
  assert.equal(await balance(buyer, "RUB"), 189.4);
  assert.equal(
    (await balance(buyer, "RUB")) + (await balance(seller, "RUB")),
    200,
  );
  assert.equal(
    (await balance(buyer)) +
      (await balance(seller)) +
      (await balance(outsider)),
    300,
  );
  const escrow = await commerce.createEscrow(buyer, {
    title: "QA escrow",
    terms: "QA delivery agreement",
    role: "BUYER",
    amount: "0.123456",
    requestKey: key(),
  });
  await commerce.joinEscrow(seller, escrow.id);
  await rejects(() => commerce.joinEscrow(outsider, escrow.id), 409);
  await commerce.actOnDeal(buyer, escrow.id, { action: "fund" });
  assert.equal(await balance(buyer), 99.876544);
  await rejects(
    () => commerce.actOnDeal(buyer, escrow.id, { action: "fund" }),
    409,
  );
  await rejects(
    () => commerce.actOnDeal(buyer, escrow.id, { action: "cancel" }),
    409,
  );
  await commerce.actOnDeal(buyer, escrow.id, {
    action: "dispute",
    note: "QA test dispute",
  });
  await rejects(
    () =>
      commerce.actOnDeal(buyer, escrow.id, {
        action: "resolve-refund",
        note: "QA resolve denied",
      }),
    409,
  );
  await commerce.actOnDeal(
    outsider,
    escrow.id,
    { action: "resolve-refund", note: "QA admin resolution" },
    true,
  );
  assert.equal(await balance(buyer), 100);
  const escrowPay = await commerce.createEscrow(seller, {
    title: "QA escrow payout",
    terms: "QA delivery agreement",
    role: "SELLER",
    amount: "2.5",
    requestKey: key(),
  });
  await commerce.joinEscrow(buyer, escrowPay.id);
  await commerce.actOnDeal(buyer, escrowPay.id, { action: "fund" });
  await commerce.actOnDeal(seller, escrowPay.id, { action: "deliver" });
  await commerce.actOnDeal(buyer, escrowPay.id, { action: "complete" });
  assert.equal(await balance(buyer), 97.5);
  assert.equal(await balance(seller), 102.5);
  const excessive = await commerce.createEscrow(buyer, {
    title: "QA insufficient",
    terms: "QA delivery agreement",
    role: "BUYER",
    amount: "1000",
    requestKey: key(),
  });
  await commerce.joinEscrow(seller, excessive.id);
  await rejects(
    () => commerce.actOnDeal(buyer, excessive.id, { action: "fund" }),
    400,
  );
  assert.equal(
    (await commerce.dealDetails(buyer, excessive.id)).deal.status,
    "READY",
  );
  const rejected = await commerce.requestPayment(buyer, {
    kind: "TOP_UP",
    amount: "30",
    details: "QA rejected payment",
    requestKey: key(),
  });
  await commerce.reviewPayment(outsider, rejected.id, {
    status: "REJECTED",
    note: "QA unconfirmed payment",
  });
  assert.equal(await balance(buyer, "RUB"), 189.4);
  console.log(
    "PASS: market purchase/retry/concurrent payout; USDT reserve/payout/refund/dispute; insufficient funds; chat privacy; RUB deposit/withdrawal approvals.",
  );
} finally {
  if (users.length) {
    const placeholders = users.map(() => "?").join(",");
    await commerce.transact(async (c) => {
      for (const table of ["commerce_messages", "commerce_events"])
        await c.query(
          `DELETE FROM ${table} WHERE deal_id IN (SELECT id FROM commerce_deals WHERE creator_id IN (${placeholders}))`,
          users,
        );
      await c.query(
        `DELETE FROM commerce_ledger WHERE user_id IN (${placeholders})`,
        users,
      );
      await c.query(
        `DELETE FROM commerce_deals WHERE creator_id IN (${placeholders})`,
        users,
      );
      for (const table of [
        "market_listings",
        "market_payments",
        "market_wallets",
        "wallets",
      ])
        await c.query(
          `DELETE FROM ${table} WHERE ${table === "market_listings" ? "seller_id" : "user_id"} IN (${placeholders})`,
          users,
        );
      await c.query(
        `DELETE FROM users WHERE id IN (${placeholders}) AND username LIKE ?`,
        [...users, `${tag}%`],
      );
    });
  }
  await db.end();
  console.log("Disposable QA records removed.");
}
