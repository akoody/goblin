export const orderSideConfig = {
  buy: {
    title: "Купить",
    orderType: "SELL",
    action: "Купить USDT",
    role: "Продавец",
    tone: "buy",
  },
  sell: {
    title: "Продать",
    orderType: "BUY",
    action: "Продать USDT",
    role: "Покупатель",
    tone: "sell",
  },
};

export const dealStatusLabels = {
  AWAITING_PAYMENT: "Ожидает оплату",
  PAYMENT_CONFIRMED: "Оплата отмечена",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
  DISPUTE: "Спор",
};

export const p2pPaymentMethodGroups = [
  { id: "fast", name: "Быстрые переводы" },
  { id: "banks", name: "Банки" },
  { id: "wallets", name: "Кошельки" },
  { id: "cash", name: "Наличные и другое" },
];

export const p2pPaymentMethods = [
  {
    id: "sbp",
    name: "СБП",
    shortName: "СБП",
    group: "fast",
    tone: "#19b86a",
    description: "Перевод по номеру телефона через Систему быстрых платежей.",
    speed: "обычно 1-3 мин.",
  },
  {
    id: "card",
    name: "Перевод на карту",
    shortName: "Карта",
    group: "fast",
    tone: "#2775ca",
    description: "Перевод на банковскую карту любого поддерживаемого банка.",
    speed: "обычно 1-10 мин.",
  },
  {
    id: "mir",
    name: "Карта МИР",
    shortName: "МИР",
    group: "fast",
    tone: "#0f8f6f",
    description: "Перевод на карту платежной системы МИР.",
    speed: "обычно 1-10 мин.",
  },
  {
    id: "tbank",
    name: "Т-Банк",
    shortName: "Т-Банк",
    group: "banks",
    tone: "#ffcc00",
    description: "Внутрибанковский перевод Т-Банк / Tinkoff.",
    speed: "обычно мгновенно",
  },
  {
    id: "sber",
    name: "СберБанк",
    shortName: "Сбер",
    group: "banks",
    tone: "#21a038",
    description: "Перевод внутри СберБанка или по номеру карты.",
    speed: "обычно 1-5 мин.",
  },
  {
    id: "alfa",
    name: "Альфа-Банк",
    shortName: "Альфа",
    group: "banks",
    tone: "#ef3124",
    description: "Перевод внутри Альфа-Банка или на карту.",
    speed: "обычно 1-5 мин.",
  },
  {
    id: "vtb",
    name: "ВТБ",
    shortName: "ВТБ",
    group: "banks",
    tone: "#0057b8",
    description: "Перевод внутри ВТБ или на карту.",
    speed: "обычно 1-10 мин.",
  },
  {
    id: "raiffeisen",
    name: "Райффайзен",
    shortName: "Райф",
    group: "banks",
    tone: "#f4c400",
    description: "Перевод на счет или карту Райффайзен Банка.",
    speed: "обычно 1-10 мин.",
  },
  {
    id: "gazprombank",
    name: "Газпромбанк",
    shortName: "ГПБ",
    group: "banks",
    tone: "#2d7dd2",
    description: "Перевод на счет или карту Газпромбанка.",
    speed: "обычно 1-10 мин.",
  },
  {
    id: "ozon",
    name: "Ozon Банк",
    shortName: "Ozon",
    group: "banks",
    tone: "#005bff",
    description: "Перевод на карту или счет Ozon Банка.",
    speed: "обычно 1-10 мин.",
  },
  {
    id: "yoomoney",
    name: "ЮMoney",
    shortName: "ЮMoney",
    group: "wallets",
    tone: "#7f2cff",
    description: "Перевод через кошелек ЮMoney.",
    speed: "обычно 1-15 мин.",
  },
  {
    id: "qiwi",
    name: "QIWI",
    shortName: "QIWI",
    group: "wallets",
    tone: "#ff8c00",
    description: "Перевод через QIWI-кошелек, если доступен контрагенту.",
    speed: "обычно 1-15 мин.",
  },
  {
    id: "mobile",
    name: "Mobile Top-up",
    shortName: "Mobile",
    group: "wallets",
    tone: "#ff9f2a",
    description: "Пополнение мобильного номера по реквизитам продавца.",
    speed: "обычно 1-10 мин.",
  },
  {
    id: "cash",
    name: "Наличные",
    shortName: "Cash",
    group: "cash",
    tone: "#6b7280",
    description: "Сделка с наличными по согласованным условиям в чате.",
    speed: "по договоренности",
  },
  {
    id: "bank",
    name: "Bank Transfer",
    shortName: "Bank",
    group: "banks",
    tone: "#ef476f",
    description: "Универсальный банковский перевод для старых объявлений.",
    speed: "обычно 1-30 мин.",
  },
];

export const p2pCancelReasons = [
  "Этот ордер больше не нужен",
  "Я не соответствовал требованиям контрагента",
  "Я не понял, как совершить платеж",
  "Платежные реквизиты неверные или неполные",
  "Контрагент попросил отменить ордер",
  "Другое",
];

export const getMerchantStats = (id) => {
  const safeId = Number(id || 1);
  const orders = 120 + ((safeId * 137) % 900);
  const completion = 96 + (safeId % 4);
  const minutes = 3 + (safeId % 6);

  return { orders, completion, minutes };
};

export const getDealStatusLabel = (status) => dealStatusLabels[status] || status || "-";

export const getPaymentMethodById = (id) => {
  const fallbackId = String(id || "").trim();

  return p2pPaymentMethods.find((method) => method.id === fallbackId) || {
    id: fallbackId || "unknown",
    name: fallbackId || "Способ оплаты",
    shortName: fallbackId || "Метод",
    group: "cash",
    tone: "#6b7280",
    description: "Способ оплаты из админского справочника.",
    speed: "по условиям объявления",
  };
};

export const getPaymentMethodsByGroup = (groupId) =>
  p2pPaymentMethods.filter((method) => method.group === groupId);

export const normalizePaymentMethods = (methods) => {
  if (!Array.isArray(methods) || methods.length === 0) {
    return p2pPaymentMethods.map((method) => method.id);
  }

  return methods
    .map((method) => String(method).trim())
    .filter((method) => p2pPaymentMethods.some((item) => item.id === method));
};

export const formatMoney = (value, currency = "RUB") => {
  const number = Number(value || 0);

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: currency === "USDT" ? 8 : 2,
  }).format(number)} ${currency}`;
};

export const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
