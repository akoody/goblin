import { chromium } from "/Users/vladislav/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const env = await readFile(new URL("../.env", import.meta.url), "utf8").catch(
  () => "",
);
const adminEmail = (env.match(/^VITE_ADMIN_EMAILS=(.*)$/m)?.[1] || "")
  .replace(/^['"]|['"]$/g, "")
  .split(/[,;\n]/)[0]
  .trim();
const id = "b734e66f-4fc1-4b3b-82c8-aab020a89172";
const deal = {
  id,
  kind: "ESCROW",
  status: "DELIVERED",
  amount: "10.123456",
  currency: "USDT",
  buyer_id: 1,
  seller_id: 2,
  buyer_name: "Покупатель",
  seller_name: "Продавец",
  title: "Передача цифровой услуги",
  terms: "Передать подписку после оплаты. Проверка в течение суток.",
  created_at: new Date().toISOString(),
};
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const errors = [];
try {
  for (const width of [320, 360, 390, 576, 768, 1024, 1440, 1920]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.addInitScript(() =>
      localStorage.setItem("token", "mock-ui-only"),
    );
    const page = await context.newPage();
    const writes = [];
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      if (path === "/api/auth/me")
        data = {
          id: 1,
          username: "Покупатель",
          email: adminEmail,
          wallets: [],
        };
      if (path === "/api/features")
        data = { p2p: true, nft: true, processing: true };
      if (path === "/api/commerce/catalog")
        data = [
          {
            slug: "chatgpt",
            name: "ChatGPT",
            family: "ai",
            sections: ["Подписка", "Услуги"],
          },
        ];
      if (path === "/api/commerce/listings")
        data = [
          {
            id,
            seller_id: 2,
            seller_name: "Продавец",
            category: "chatgpt",
            section: "Подписка",
            title: "Подписка ChatGPT: передача и настройка",
            description: "Описание товара и условий заказа. ".repeat(8),
            price: "100.60",
          },
        ];
      if (path === "/api/commerce/me")
        data = {
          user: { id: 1, username: "Покупатель" },
          rubBalance: "1000.50",
          availableUsdt: "50.123456",
          held: { rub: "100.60", usdt: "10.123456" },
          deals: [deal, { ...deal, kind: "MARKET", currency: "RUB" }],
          listings: [],
          payments: [],
          history: [],
        };
      if (path === `/api/commerce/deals/${id}`)
        data = {
          deal,
          messages: [
            {
              id: 1,
              sender_name: "Продавец",
              text: "Заказ передан. Проверьте результат.",
              created_at: new Date().toISOString(),
            },
          ],
          events: [],
          canJoin: false,
        };
      if (path === "/api/commerce/admin")
        data = {
          deals: [{ ...deal, status: "DISPUTED" }],
          payments: [
            {
              id,
              username: "Покупатель",
              amount: "100.60",
              status: "PENDING",
              kind: "TOP_UP",
              details: "Платёж №123, проверка реквизитов",
              created_at: new Date().toISOString(),
            },
          ],
        };
      if (route.request().method() === "POST") {
        writes.push({ path, body: route.request().postDataJSON() });
        data = { id };
      }
      return route.fulfill({
        json: data,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    });
    const paths = [
      "/market",
      "/market/sell",
      "/market/orders",
      "/market/wallet",
      "/guarantor",
      `/commerce/deals/${id}`,
      ...(adminEmail
        ? ["/manage/commerce", `/manage/commerce/deals/${id}`]
        : []),
    ];
    for (const path of paths) {
      await page.goto("http://127.0.0.1:5178" + path);
      await page.locator("main h1").waitFor();
      await page.waitForTimeout(150);
      const dimensions = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
      }));
      assert.ok(
        dimensions.scroll <= width + 1,
        `${path} overflow at ${width}: ${dimensions.scroll}`,
      );
      if (width === 390 && path === "/market")
        await page.screenshot({
          path: "/tmp/goblin-market-mobile.png",
          fullPage: true,
        });
      if (width === 1440 && path === "/guarantor")
        await page.screenshot({
          path: "/tmp/goblin-guarantor-desktop.png",
          fullPage: true,
        });
    }
    if (width === 390) {
      await page.goto("http://127.0.0.1:5178/guarantor");
      await page
        .getByLabel("Название", { exact: true })
        .fill("Проверка формы сделки");
      await page
        .getByLabel("Условия сделки", { exact: true })
        .fill("Проверка согласованных условий");
      await page.getByLabel("Сумма, USDT", { exact: true }).fill("10.123456");
      await page
        .getByRole("button", { name: "Создать сделку", exact: true })
        .click();
      await page.waitForURL(`**/commerce/deals/${id}`);
      assert.equal(
        writes.find((w) => w.path.endsWith("/escrow")).body.amount,
        "10.123456",
      );
      await page.getByLabel("Сообщение", { exact: true }).fill("Проверка чата");
      await page
        .getByRole("button", { name: "Отправить", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector("textarea")?.value === "",
      );
      assert.equal(
        writes.find((w) => w.path.endsWith("/messages")).body.text,
        "Проверка чата",
      );
      await page
        .getByRole("button", { name: "Подтвердить получение и оплатить" })
        .click();
      await page.waitForTimeout(200);
      assert.equal(
        writes.find((w) => w.path.endsWith("/action")).body.action,
        "complete",
      );
      await page.goto("http://127.0.0.1:5178/market");
      await page.getByRole("button", { name: "Купить", exact: true }).click();
      await page.waitForURL(`**/commerce/deals/${id}`);
      assert.equal(
        writes.find((w) => w.path.endsWith("/purchase")).body.listingId,
        id,
      );
      console.log(
        "PASS UI actions: create escrow, message, completion, market purchase.",
      );
    }
    await context.close();
    console.log(
      `PASS UI: ${width}px, ${paths.length} pages, no horizontal overflow`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
