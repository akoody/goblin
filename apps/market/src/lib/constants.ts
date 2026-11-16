import type { CatalogFamily, CatalogKind } from "@/lib/marketplace-catalog";

export const categories = [
  "Игры",
  "Сервисы",
  "Платформы",
];

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
