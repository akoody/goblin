import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimit } from "../src/middleware/rate-limit.js";

test("rate limiter permits the configured number of requests and rejects the next", () => {
  const limit = createRateLimit({
    windowMs: 60_000,
    max: 2,
    message: "Too many requests",
  });
  let nextCalls = 0;
  let statusCode;
  let body;
  const makeResponse = () => ({
    set() { return this; },
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
  });
  const request = { ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } };

  limit(request, makeResponse(), () => { nextCalls += 1; });
  limit(request, makeResponse(), () => { nextCalls += 1; });
  limit(request, makeResponse(), () => { nextCalls += 1; });

  assert.equal(nextCalls, 2);
  assert.equal(statusCode, 429);
  assert.deepEqual(body, { message: "Too many requests" });
});
