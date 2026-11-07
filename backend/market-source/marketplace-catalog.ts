export type CatalogKind = "GAME" | "SERVICE" | "PLATFORM";

export type CatalogFamily =
  | "ai"
  | "subscription"
  | "software"
  | "platform"
  | "social"
  | "shooter"
  | "mmorpg"
  | "mobile"
  | "sports"
  | "sandbox"
  | "strategy";

export type CatalogBlueprint = {
  name: string;
  kind: CatalogKind;
  family: CatalogFamily;
  featured?: boolean;
};

function createGroup(names: string[], kind: CatalogKind, family: CatalogFamily, featured = false) {
  return names.map((name, index) => ({
    name,
    kind,
    family,
    featured: featured && index < 4,
  }));
}

export const catalogBlueprints: CatalogBlueprint[] = [
  ...createGroup(
    [
      "ChatGPT",
      "Claude",
      "Gemini",
      "Cursor",
      "Perplexity",
      "Midjourney",
      "Suno",
      "Runway",
      "OpenAI API",
      "Anthropic API",
    ],
    "SERVICE",
    "ai",
    true,
  ),
  ...createGroup(
    [
      "Adobe",
      "Canva",
      "Figma",
      "Notion",
      "Microsoft 365",
      "Google One",
      "JetBrains",
      "CapCut Pro",
      "Grammarly",
      "Notion AI",
    ],
    "SERVICE",
    "software",
  ),
  ...createGroup(
    [
      "Spotify",
      "YouTube Premium",
      "Netflix",
      "Discord Nitro",
      "Telegram Premium",
      "Duolingo",
      "Crunchyroll",
      "Apple Music",
    ],
    "SERVICE",
    "subscription",
  ),
  ...createGroup(
    [
      "Steam",
      "Xbox",
      "PlayStation",
      "Nintendo",
      "Epic Games",
      "Battle.net",
      "Riot Games",
      "EA App",
      "Ubisoft Connect",
      "VK",
      "Telegram",
      "Discord",
    ],
    "PLATFORM",
    "platform",
  ),
  ...createGroup(
    [
      "TikTok",
      "Instagram",
      "YouTube",
      "Twitch",
      "Telegram Ads",
      "Avito",
    ],
    "SERVICE",
    "social",
  ),
  ...createGroup(
    [
      "Counter-Strike 2",
      "Valorant",
      "Fortnite",
      "Apex Legends",
      "Rainbow Six Siege",
      "Escape from Tarkov",
      "War Thunder",
      "World of Tanks",
      "World of Warships",
      "Marvel Rivals",
      "Overwatch 2",
      "PUBG Mobile",
      "Standoff 2",
      "Call of Duty Mobile",
      "Free Fire",
      "Arena Breakout",
    ],
    "GAME",
    "shooter",
    true,
  ),
  ...createGroup(
    [
      "World of Warcraft",
      "Albion Online",
      "Black Desert",
      "Lost Ark",
      "Lineage 2M",
      "Lineage W",
      "Diablo IV",
      "Path of Exile 2",
      "Warframe",
      "Destiny 2",
      "Genshin Impact",
      "Honkai: Star Rail",
      "Zenless Zone Zero",
    ],
    "GAME",
    "mmorpg",
    true,
  ),
  ...createGroup(
    [
      "Brawl Stars",
      "Clash Royale",
      "Clash of Clans",
      "Mobile Legends",
      "FIFA Mobile",
      "Roblox",
    ],
    "GAME",
    "mobile",
  ),
  ...createGroup(
    [
      "EA Sports FC",
      "NBA 2K",
      "Rocket League",
    ],
    "GAME",
    "sports",
  ),
  ...createGroup(
    [
      "Minecraft",
      "Rust",
      "DayZ",
      "GTA Online",
      "Red Dead Online",
      "Terraria",
    ],
    "GAME",
    "sandbox",
  ),
  ...createGroup(
    [
      "Dota 2",
      "League of Legends",
      "Teamfight Tactics",
      "Clash Mini",
      "Age of Empires Mobile",
    ],
    "GAME",
    "strategy",
  ),
];

const familySections: Record<CatalogFamily, string[]> = {
  ai: ["Аккаунты", "Подписка", "API", "Токены", "Услуги", "Прочее"],
  subscription: ["Аккаунты", "Подписка", "Баланс", "Подарочные карты", "Услуги"],
  software: ["Лицензии", "Аккаунты", "Подписка", "Ключи", "Услуги", "Обучение"],
  platform: ["Аккаунты", "Ключи", "Подписка", "Пополнение", "Услуги", "Прочее"],
  social: ["Аккаунты", "Подписка", "Продвижение", "Реклама", "Услуги", "Прочее"],
  shooter: ["Аккаунты", "Валюта", "Скины", "Буст", "Услуги", "Прочее"],
  mmorpg: ["Аккаунты", "Валюта", "Предметы", "Рейды", "Прокачка", "Услуги"],
  mobile: ["Аккаунты", "Донат", "Валюта", "Буст", "Услуги", "Прочее"],
  sports: ["Аккаунты", "Монеты", "Донат", "Буст", "Услуги"],
  sandbox: ["Аккаунты", "Предметы", "Сервера", "Услуги", "Прочее"],
  strategy: ["Аккаунты", "Валюта", "Предметы", "Буст", "Услуги", "Прочее"],
};

export function getSectionsForFamily(family: CatalogFamily) {
  return familySections[family];
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

const themePairs = [
  ["#1d4ed8", "#60a5fa"],
  ["#0f766e", "#2dd4bf"],
  ["#7c3aed", "#c084fc"],
  ["#be185d", "#fb7185"],
  ["#b45309", "#f59e0b"],
  ["#15803d", "#4ade80"],
];

export function getThemeForName(name: string) {
  let score = 0;

  for (const symbol of name) {
    score += symbol.charCodeAt(0);
  }

  const [from, to] = themePairs[score % themePairs.length]!;
  return { from, to };
}

export function buildCatalogDescription(item: CatalogBlueprint) {
  const sectionPreview = getSectionsForFamily(item.family).slice(0, 4).join(", ").toLowerCase();
  const kindText =
    item.kind === "GAME"
      ? "игре"
      : item.kind === "PLATFORM"
        ? "платформе"
        : "сервису";

  return `Витрина по ${kindText} ${item.name}: ${sectionPreview} и сделки между покупателями и продавцами в одном интерфейсе.`;
}
