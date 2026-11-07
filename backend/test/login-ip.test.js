import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLoginIp, recordLoginIp } from "../src/services/login-ip.service.js";

test("IP addresses normalize aliases and reject forwarded-header lists", () => {
  assert.equal(normalizeLoginIp("::ffff:192.0.2.1"), "192.0.2.1");
  assert.equal(normalizeLoginIp("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
  assert.equal(normalizeLoginIp("192.0.2.1, 192.0.2.2"), null);
});

for (const scenario of ["first", "known", "new"]) {
  test(`login history records ${scenario} IP correctly`, async () => {
    const writes = [];
    let locked = false;
    let committed = false;
    const connection = {
      async beginTransaction() {}, async commit() { committed = true; }, async rollback() {}, release() {},
      async query(sql, args) {
        if (sql.includes("FOR UPDATE")) { locked = true; return [[{ id: 1 }]]; }
        assert.equal(locked, true);
        if (sql.startsWith("SELECT id FROM user_login_ips")) return [scenario === "known" ? [{ id: 3 }] : []];
        if (sql.startsWith("SELECT ip")) return [scenario === "new" ? [{ ip: "192.0.2.1" }] : []];
        writes.push({ sql, args });
        return [{}];
      },
    };
    await recordLoginIp({ async getConnection() { return connection; } }, 1, { ip: "192.0.2.2", userAgent: "test" });
    assert.equal(committed, true);
    assert.equal(writes.length, 1);
    if (scenario === "known") assert.match(writes[0].sql, /login_count = login_count \+ 1/);
    else assert.deepEqual(writes[0].args, [1, "192.0.2.2", scenario === "new" ? "192.0.2.1" : null, "test", scenario === "new" ? 1 : 0, ""]);
  });
}
