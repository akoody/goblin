import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../src/config/jwt.js";

const strong = "x".repeat(32);

test("uses JWT_SECRET when it is long enough", () => {
  assert.equal(getJwtSecret({ JWT_SECRET: ` ${strong} `, NODE_ENV: "production" }), strong);
  assert.throws(() => getJwtSecret({ JWT_SECRET: "short" }), /at least 32 bytes/);
});

test("refuses to run without JWT_SECRET outside explicit development or test", () => {
  for (const NODE_ENV of ["production", undefined, "", "prod", "staging"]) {
    assert.throws(() => getJwtSecret({ NODE_ENV }), /JWT_SECRET is required/, `NODE_ENV=${NODE_ENV}`);
  }
});

test("never falls back to a known secret", () => {
  const secret = getJwtSecret({ NODE_ENV: "development" });
  assert.notEqual(secret, "dev-secret");
  assert.equal(Buffer.byteLength(secret), 64);
  assert.equal(getJwtSecret({ NODE_ENV: "test" }), secret, "stable within one process");

  const forged = jwt.sign({ userId: 1, role: "admin" }, "dev-secret");
  assert.throws(() => jwt.verify(forged, secret));
});
