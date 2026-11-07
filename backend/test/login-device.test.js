import test from "node:test";
import assert from "node:assert/strict";
import { describeLoginDevice, cleanDeviceModel } from "../src/services/login-device.service.js";

test("Android model can come from client hints or the original user agent", () => {
  const ua = "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
  assert.equal(describeLoginDevice(ua).device, "Android-телефон · SM-S918B");
  assert.equal(describeLoginDevice(ua).os, "Android 13");
  assert.equal(describeLoginDevice(ua, "Pixel 8").device, "Android-телефон · Pixel 8");
  assert.equal(describeLoginDevice("Mozilla/5.0 (Linux; Android 10; K) Chrome/130.0 Mobile Safari/537.36").device, "Android-телефон");
});
test("iPhone is reported without inventing an exact model; browser precedence is correct", () => {
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1";
  assert.deepEqual(describeLoginDevice(ua), { device: "iPhone", os: "iOS 18.0", browser: "Safari 18.0" });
  assert.equal(describeLoginDevice("Windows NT 10.0 Chrome/130.0 Edg/130.0").browser, "Edge 130.0");
  assert.equal(cleanDeviceModel({ model: "wrong" }), "");
  assert.equal(cleanDeviceModel("A".repeat(200)).length, 120);
});
