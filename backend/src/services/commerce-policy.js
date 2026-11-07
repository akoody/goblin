import Decimal from "decimal.js";

export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function text(value, min, max, label) {
  if (typeof value !== "string") fail(`Укажите ${label}`);
  const result = value.trim();
  if (result.length < min || result.length > max)
    fail(`${label}: от ${min} до ${max} символов`);
  return result;
}
export function amount(value, currency) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw) || raw.length > 30)
    fail("Укажите корректную сумму");
  const number = new Decimal(raw);
  if (
    number.lte(0) ||
    number.gt(1000000) ||
    number.decimalPlaces() > (currency === "RUB" ? 2 : 6)
  ) {
    fail(
      `Сумма от 0 до 1 000 000 ${currency}, максимум ${currency === "RUB" ? 2 : 6} знаков после запятой`,
    );
  }
  return number.toFixed(currency === "RUB" ? 2 : 6);
}
export function requireMinimumAmount(value, minimum) {
  const amountValue = new Decimal(String(value));
  const minimumValue = new Decimal(String(minimum));
  if (!amountValue.isFinite() || !minimumValue.isFinite() || minimumValue.lte(0))
    fail("Некорректный минимальный размер сделки");
  if (amountValue.lt(minimumValue))
    fail(`Минимальная сумма сделки гаранта — ${minimumValue.toFixed(6)} USDT`);
}
export function uuid(value) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value),
    )
  )
    fail("Некорректный идентификатор");
  return value;
}
export function participant(deal, userId) {
  return [deal.buyer_id, deal.seller_id].some(
    (id) => id != null && String(id) === String(userId),
  );
}
export function transition(deal, userId, action, admin = false) {
  const buyer = String(deal.buyer_id) === String(userId);
  const seller = String(deal.seller_id) === String(userId);
  if (!admin && !participant(deal, userId)) fail("Нет доступа к сделке", 403);
  if (
    admin &&
    action === "admin-cancel" &&
    ["WAITING", "READY"].includes(deal.status)
  )
    return "CANCELLED";
  if (action === "fund" && buyer && deal.status === "READY") return "FUNDED";
  if (action === "deliver" && seller && deal.status === "FUNDED")
    return "DELIVERED";
  if (action === "complete" && buyer && deal.status === "DELIVERED")
    return "COMPLETED";
  if (
    action === "dispute" &&
    participant(deal, userId) &&
    ["FUNDED", "DELIVERED"].includes(deal.status)
  )
    return "DISPUTED";
  if (
    action === "cancel" &&
    participant(deal, userId) &&
    ["WAITING", "READY"].includes(deal.status)
  )
    return "CANCELLED";
  // A seller may return held funds, but cannot release funds to themselves.
  if (
    action === "refund" &&
    seller &&
    ["FUNDED", "DELIVERED"].includes(deal.status)
  )
    return "REFUNDED";
  if (
    admin &&
    ["FUNDED", "DELIVERED", "DISPUTED"].includes(deal.status) &&
    action === "resolve-pay"
  )
    return "COMPLETED";
  if (
    admin &&
    ["FUNDED", "DELIVERED", "DISPUTED"].includes(deal.status) &&
    action === "resolve-refund"
  )
    return "REFUNDED";
  fail("Действие недоступно в текущем состоянии сделки", 409);
}
