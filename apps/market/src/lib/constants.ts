import type { CurrencyCode } from "@/lib/db";
import type { CatalogFamily, CatalogKind } from "@/lib/marketplace-catalog";

export const categories = [
  "Игры",
  "Сервисы",
  "Платформы",
];

export const supportedCurrencies: Array<{
  code: CurrencyCode;
  label: string;
  symbol: string;
}> = [
  { code: "RUB", label: "Рубли", symbol: "₽" },
  { code: "USD", label: "Доллары", symbol: "$" },
  { code: "EUR", label: "Евро", symbol: "€" },
];

export const currencyRates: Record<CurrencyCode, number> = {
  RUB: 1,
  USD: 92,
  EUR: 100,
};

export const catalogKindLabels: Record<CatalogKind, string> = {
  GAME: "Игра",
  SERVICE: "Сервис",
  PLATFORM: "Платформа",
};

export const catalogFamilyLabels: Record<CatalogFamily, string> = {
  ai: "AI-сервисы",
  subscription: "Подписки",
  software: "Софт",
  platform: "Платформы",
  social: "Социальные сети",
  shooter: "Шутеры",
  mmorpg: "MMORPG",
  mobile: "Мобильные игры",
  sports: "Спорт",
  sandbox: "Сэндбоксы",
  strategy: "Стратегии",
};
