import { chromium } from "/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const errors = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [path, title] of [
      ["/market", "Маркет"],
      ["/guarantor", "Гарант"],
      ["/market/sell", "Продать в маркете"],
    ]) {
      const response = await page.goto("https://cryptogoblin.ru" + path);
      assert.equal(response.status(), 200);
      await page
        .getByRole("heading", { level: 1, name: title, exact: true })
        .waitFor();
      if (path === "/market") {
        await page.getByText("Пока нет объявлений", { exact: true }).waitFor();
        assert.equal(
          await page.getByRole("combobox").locator("option").count(),
          96,
        );
      } else
        await page
          .getByText("Для этой операции нужен аккаунт CryptoGoblin.", {
            exact: false,
          })
          .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
    }
    for (const path of [
      "/market/wallet",
      "/market/orders",
      "/manage/commerce",
    ]) {
      await page.goto("https://cryptogoblin.ru" + path);
      await page.waitForURL("**/login");
    }
    console.log(
      `PASS LIVE: ${width}px; real catalog; guest browsing; private routes require login; no overflow.`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
