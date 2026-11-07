import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  buildCatalogDescription,
  catalogBlueprints,
  getSectionsForFamily,
  getThemeForName,
  slugify,
  type CatalogFamily,
  type CatalogKind,
} from "@/lib/marketplace-catalog";

export type UserRole = "CUSTOMER" | "SELLER" | "BOTH" | "ADMIN";
export type CurrencyCode = "RUB" | "USD" | "EUR";
export type ListingDeliveryType = "AUTO" | "MANUAL";
export type OrderStatus = "CLOSED" | "REFUNDED" | "PENDING" | "DISPUTED";
export type ListingStatus = "ACTIVE" | "PAUSED";
export type WalletTransactionType = "TOP_UP" | "WITHDRAWAL" | "PURCHASE" | "SALE" | "REFUND";
export type WalletTransactionStatus = "COMPLETED" | "PENDING" | "CANCELLED";
export type SupportTicketStatus = "OPEN" | "ANSWERED" | "CLOSED";
export type ProjectPlatform = "TELEGRAM" | "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "VK" | "DISCORD" | "TWITCH";
export type ProjectServiceType = "SUBSCRIBE" | "BROADCAST" | "COMMENTS" | "DIRECT" | "VIEWS" | "LIKES" | "REPOSTS";
export type ProjectTaskStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  bio: string | null;
  city: string | null;
  preferredCurrency: CurrencyCode;
  createdAt: Date;
  updatedAt: Date;
};

export type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
};

export type CatalogSection = {
  id: string;
  slug: string;
  name: string;
};

export type CatalogItem = {
  id: string;
  slug: string;
  name: string;
  kind: CatalogKind;
  family: CatalogFamily;
  description: string;
  featured: boolean;
  themeFrom: string;
  themeTo: string;
  sections: CatalogSection[];
  createdAt: Date;
  updatedAt: Date;
};

export type Listing = {
  id: string;
  itemId: string;
  sectionId: string;
  sellerId: string;
  title: string;
  description: string;
  deliveryNote: string | null;
  priceRub: number;
  status: ListingStatus;
  deliveryType: ListingDeliveryType;
  quantity?: number;
  autoPayloads?: string[];
  isOnline: boolean;
  rating: number;
  reviewsCount: number;
  yearsOnPlatform: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Order = {
  id: string;
  listingId: string;
  projectId: string | null;
  itemId: string;
  sectionId: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  amountRub: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Conversation = {
  id: string;
  orderId: string;
  itemId: string;
  buyerId: string;
  sellerId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: Date;
};

export type WalletTransaction = {
  id: string;
  userId: string;
  orderId: string | null;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amountRub: number;
  description: string;
  createdAt: Date;
};

export type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  lastMessage: string;
  status: SupportTicketStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectTask = {
  id: string;
  customerId: string;
  executorId: string | null;
  orderId: string | null;
  conversationId: string | null;
  platform: ProjectPlatform;
  serviceType: ProjectServiceType;
  title: string;
  description: string;
  messageText: string | null;
  targetSource: string;
  targets: string[];
  rewardPerTargetRub: number;
  targetCount: number;
  totalBudgetRub: number;
  completedCount: number;
  status: ProjectTaskStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectPlatformSetting = {
  id: ProjectPlatform;
  label: string;
  enabled: boolean;
  sourcePlaceholder: string;
  targetsLabel: string;
  targetsPlaceholder: string;
};

export type ProjectServiceSetting = {
  id: ProjectServiceType;
  label: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  messageLabel: string | null;
  messagePlaceholder: string;
  requiresMessage: boolean;
  enabled: boolean;
};

export type ProjectPlatformServiceSetting = {
  platformId: ProjectPlatform;
  serviceId: ProjectServiceType;
  enabled: boolean;
};

export type ProjectSettings = {
  platforms: ProjectPlatformSetting[];
  services: ProjectServiceSetting[];
  platformServices: ProjectPlatformServiceSetting[];
};

export type ProjectFormConfig = {
  platforms: Array<ProjectPlatformSetting & { services: ProjectServiceSetting[] }>;
};

type PersistedStore = {
  version: number;
  users: Array<Omit<User, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>;
  sessions: Array<Omit<Session, "expiresAt" | "createdAt"> & { expiresAt: string; createdAt: string }>;
  catalogItems: Array<Omit<CatalogItem, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>;
  listings: Array<Omit<Listing, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>;
  orders: Array<Omit<Order, "createdAt" | "updatedAt" | "projectId"> & { projectId?: string | null; createdAt: string; updatedAt: string }>;
  conversations: Array<Omit<Conversation, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>;
  messages: Array<Omit<Message, "createdAt"> & { createdAt: string }>;
  walletTransactions: Array<Omit<WalletTransaction, "createdAt"> & { createdAt: string }>;
  supportTickets: Array<Omit<SupportTicket, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>;
  projectTasks?: Array<Omit<ProjectTask, "createdAt" | "updatedAt" | "messageText" | "platform"> & {
    platform?: ProjectPlatform;
    messageText?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  projectPlatformSettings?: ProjectPlatformSetting[];
  projectServiceSettings?: ProjectServiceSetting[];
  projectPlatformServices?: ProjectPlatformServiceSetting[];
};

type Store = {
  version: number;
  users: User[];
  sessions: Session[];
  catalogItems: CatalogItem[];
  listings: Listing[];
  orders: Order[];
  conversations: Conversation[];
  messages: Message[];
  walletTransactions: WalletTransaction[];
  supportTickets: SupportTicket[];
  projectTasks: ProjectTask[];
  projectPlatformSettings: ProjectPlatformSetting[];
  projectServiceSettings: ProjectServiceSetting[];
  projectPlatformServices: ProjectPlatformServiceSetting[];
};

type OrderWithRelations = Order & {
  listing: Listing;
  item: CatalogItem;
  section: CatalogSection;
  buyer: User;
  seller: User;
};

export type CatalogLibraryItem = CatalogItem & {
  listingCount: number;
  minPriceRub: number | null;
  sectionStats: Array<CatalogSection & { listingsCount: number }>;
};

export type CatalogListingItem = Listing & {
  seller: User;
  item: CatalogItem;
  section: CatalogSection;
};

export type ListingDetails = Listing & {
  seller: User;
  item: CatalogItem;
  section: CatalogSection;
};

export type CatalogItemDetails = CatalogItem & {
  listingCount: number;
  sectionStats: Array<CatalogSection & { listingsCount: number }>;
  listings: CatalogListingItem[];
  selectedSection: CatalogSection | null;
};

export type ConversationSummary = Conversation & {
  item: CatalogItem;
  order: Order;
  project: ProjectTask | null;
  buyer: User;
  seller: User;
  latestMessage: Message | null;
};

export type ConversationDetails = Conversation & {
  item: CatalogItem;
  order: Order;
  buyer: User;
  seller: User;
  listing: Listing;
  section: CatalogSection;
  project: ProjectTask | null;
  messages: Array<Message & { sender: User }>;
};

export type PurchaseResult = {
  orderId: string;
  conversationId: string;
};

export type WalletOverview = {
  availableRub: number;
  transactions: WalletTransaction[];
};

export type UserProfileData = {
  user: User;
  stats: {
    purchases: number;
    sales: number;
    chats: number;
    activeListings: number;
    activeProjects: number;
    totalTurnoverRub: number;
  };
  recentPurchases: OrderWithRelations[];
  recentSales: OrderWithRelations[];
  tickets: SupportTicket[];
};

export type ProjectTaskSummary = ProjectTask & {
  customer: User;
  executor: User | null;
};

export type ProjectTaskDetails = ProjectTaskSummary & {
  order: Order | null;
  conversation: Conversation | null;
};

export type SupportOverview = {
  tickets: SupportTicket[];
  openCount: number;
  answeredCount: number;
};

export type AdminDashboardData = {
  counts: {
    users: number;
    catalogItems: number;
    listings: number;
    orders: number;
    conversations: number;
    walletTransactions: number;
    tickets: number;
  };
  recentUsers: User[];
  recentOrders: OrderWithRelations[];
  catalogItems: CatalogLibraryItem[];
  tickets: SupportTicket[];
  projectSettings: ProjectSettings;
};

const STORE_VERSION = 2;
const dataDir = join(process.cwd(), "data");
const dataFilePath = join(dataDir, "store.json");
const legacyDbPath = join(dataDir, "app.db");

const marketContext = new AsyncLocalStorage<Store>();

const seedIds = {
  buyer: "seed-buyer",
  hybrid: "seed-hybrid",
  seller1: "seed-seller-1",
  seller2: "seed-seller-2",
  seller3: "seed-seller-3",
  seller4: "seed-seller-4",
  seller5: "seed-seller-5",
} as const;

const defaultProjectPlatformSettings: ProjectPlatformSetting[] = [
  {
    id: "TELEGRAM",
    label: "Telegram",
    enabled: true,
    sourcePlaceholder: "@channel, чат или база usernames",
    targetsLabel: "Каналы, чаты или usernames",
    targetsPlaceholder: "@channel_one\n@chat_two\nusername_03",
  },
  {
    id: "YOUTUBE",
    label: "YouTube",
    enabled: true,
    sourcePlaceholder: "Канал, видео, плейлист или сегмент аудитории",
    targetsLabel: "Ссылки на каналы или видео",
    targetsPlaceholder: "https://youtube.com/@channel\nhttps://youtu.be/video_id\nhttps://youtube.com/watch?v=video_id",
  },
  {
    id: "TIKTOK",
    label: "TikTok",
    enabled: true,
    sourcePlaceholder: "Аккаунт, видео или база профилей",
    targetsLabel: "Ссылки на профили или видео",
    targetsPlaceholder: "https://www.tiktok.com/@profile\nhttps://www.tiktok.com/@profile/video/123",
  },
  {
    id: "INSTAGRAM",
    label: "Instagram",
    enabled: true,
    sourcePlaceholder: "Профиль, пост, reels или база usernames",
    targetsLabel: "Профили, посты или usernames",
    targetsPlaceholder: "@profile\nhttps://www.instagram.com/p/post_id/\nhttps://www.instagram.com/reel/reel_id/",
  },
  {
    id: "VK",
    label: "VK",
    enabled: true,
    sourcePlaceholder: "Сообщество, пост или база профилей",
    targetsLabel: "Сообщества, посты или профили",
    targetsPlaceholder: "https://vk.com/community\nhttps://vk.com/wall-1_123\nid123456",
  },
  {
    id: "DISCORD",
    label: "Discord",
    enabled: true,
    sourcePlaceholder: "Сервер, канал или база пользователей",
    targetsLabel: "Серверы, каналы или usernames",
    targetsPlaceholder: "discord.gg/invite\n#channel\nusername_01",
  },
  {
    id: "TWITCH",
    label: "Twitch",
    enabled: true,
    sourcePlaceholder: "Канал, стрим или база зрителей",
    targetsLabel: "Каналы или ссылки на стримы",
    targetsPlaceholder: "https://twitch.tv/channel\nchannel_name",
  },
];

const defaultProjectServiceSettings: ProjectServiceSetting[] = [
  {
    id: "SUBSCRIBE",
    label: "Подписки / фолловеры",
    titlePlaceholder: "Подписки или фолловеры",
    descriptionPlaceholder: "Опиши, какие аккаунты подходят, сколько времени действие должно держаться и как проверять выполнение.",
    messageLabel: null,
    messagePlaceholder: "",
    requiresMessage: false,
    enabled: true,
  },
  {
    id: "BROADCAST",
    label: "Рассылка",
    titlePlaceholder: "Рассылка сообщения",
    descriptionPlaceholder: "Опиши частоту отправки, ограничения по площадкам, требования к отчёту и правила антиспама.",
    messageLabel: "Текст сообщения для рассылки",
    messagePlaceholder: "Напиши сообщение, которое исполнитель должен отправить по указанным целям.",
    requiresMessage: true,
    enabled: true,
  },
  {
    id: "COMMENTS",
    label: "Комментарии",
    titlePlaceholder: "Комментарии",
    descriptionPlaceholder: "Опиши, где оставлять комментарии, допустимы ли варианты текста и как фиксировать результат.",
    messageLabel: "Текст комментария",
    messagePlaceholder: "Укажи комментарий или несколько вариантов, которые можно использовать.",
    requiresMessage: true,
    enabled: true,
  },
  {
    id: "DIRECT",
    label: "Личные сообщения",
    titlePlaceholder: "Рассылка в личные сообщения",
    descriptionPlaceholder: "Опиши аудиторию, лимиты на аккаунт, правила персонализации и формат отчёта.",
    messageLabel: "Текст личного сообщения",
    messagePlaceholder: "Напиши сообщение, которое нужно отправить пользователям в личные сообщения.",
    requiresMessage: true,
    enabled: true,
  },
  {
    id: "VIEWS",
    label: "Просмотры",
    titlePlaceholder: "Просмотры",
    descriptionPlaceholder: "Опиши гео, удержание, допустимые источники трафика, сроки и формат отчёта.",
    messageLabel: null,
    messagePlaceholder: "",
    requiresMessage: false,
    enabled: true,
  },
  {
    id: "LIKES",
    label: "Лайки",
    titlePlaceholder: "Лайки",
    descriptionPlaceholder: "Опиши требования к аккаунтам, скорость набора, удержание и проверку результата.",
    messageLabel: null,
    messagePlaceholder: "",
    requiresMessage: false,
    enabled: true,
  },
  {
    id: "REPOSTS",
    label: "Репосты",
    titlePlaceholder: "Репосты",
    descriptionPlaceholder: "Опиши требования к аккаунтам, публичность репоста, сроки и формат отчёта.",
    messageLabel: null,
    messagePlaceholder: "",
    requiresMessage: false,
    enabled: true,
  },
];

const defaultProjectPlatformServices: ProjectPlatformServiceSetting[] = [
  ...["SUBSCRIBE", "BROADCAST", "COMMENTS", "DIRECT"].map((serviceId) => ({ platformId: "TELEGRAM", serviceId, enabled: true })),
  ...["SUBSCRIBE", "VIEWS", "LIKES", "COMMENTS"].map((serviceId) => ({ platformId: "YOUTUBE", serviceId, enabled: true })),
  ...["SUBSCRIBE", "VIEWS", "LIKES", "COMMENTS", "REPOSTS"].map((serviceId) => ({ platformId: "TIKTOK", serviceId, enabled: true })),
  ...["SUBSCRIBE", "LIKES", "COMMENTS", "DIRECT"].map((serviceId) => ({ platformId: "INSTAGRAM", serviceId, enabled: true })),
  ...["SUBSCRIBE", "BROADCAST", "COMMENTS", "DIRECT", "LIKES", "REPOSTS"].map((serviceId) => ({ platformId: "VK", serviceId, enabled: true })),
  ...["SUBSCRIBE", "BROADCAST", "DIRECT"].map((serviceId) => ({ platformId: "DISCORD", serviceId, enabled: true })),
  ...["SUBSCRIBE", "VIEWS", "COMMENTS"].map((serviceId) => ({ platformId: "TWITCH", serviceId, enabled: true })),
] as ProjectPlatformServiceSetting[];

function now() {
  return new Date();
}

function daysAgo(days: number, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function createId() {
  return crypto.randomUUID();
}

function mergeProjectPlatformSettings(settings?: ProjectPlatformSetting[]) {
  return defaultProjectPlatformSettings.map((defaults) => ({
    ...defaults,
    ...(settings?.find((entry) => entry.id === defaults.id) ?? {}),
  }));
}

function mergeProjectServiceSettings(settings?: ProjectServiceSetting[]) {
  return defaultProjectServiceSettings.map((defaults) => ({
    ...defaults,
    ...(settings?.find((entry) => entry.id === defaults.id) ?? {}),
  }));
}

function mergeProjectPlatformServices(settings?: ProjectPlatformServiceSetting[]) {
  const configured = settings ?? [];
  const pairs = new Map<string, ProjectPlatformServiceSetting>();

  defaultProjectPlatformServices.forEach((entry) => {
    pairs.set(`${entry.platformId}:${entry.serviceId}`, entry);
  });

  configured.forEach((entry) => {
    pairs.set(`${entry.platformId}:${entry.serviceId}`, entry);
  });

  return [...pairs.values()];
}

function serializeStore(store: Store): PersistedStore {
  return {
    version: store.version,
    users: store.users.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    sessions: store.sessions.map((item) => ({
      ...item,
      expiresAt: item.expiresAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
    })),
    catalogItems: store.catalogItems.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    listings: store.listings.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    orders: store.orders.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    conversations: store.conversations.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    messages: store.messages.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    walletTransactions: store.walletTransactions.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    supportTickets: store.supportTickets.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    projectTasks: store.projectTasks.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    projectPlatformSettings: store.projectPlatformSettings,
    projectServiceSettings: store.projectServiceSettings,
    projectPlatformServices: store.projectPlatformServices,
  };
}

function deserializeStore(payload: PersistedStore): Store {
  return {
    version: payload.version,
    users: payload.users.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })),
    sessions: payload.sessions.map((item) => ({
      ...item,
      expiresAt: new Date(item.expiresAt),
      createdAt: new Date(item.createdAt),
    })),
    catalogItems: payload.catalogItems.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })),
    listings: payload.listings.map((item) => ({
      ...item,
      deliveryNote: item.deliveryNote ?? null,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })),
    orders: payload.orders.map((item) => ({
      ...item,
      projectId: item.projectId ?? null,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })),
    conversations: payload.conversations.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })),
    messages: payload.messages.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
    })),
    walletTransactions: payload.walletTransactions.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
    })),
    supportTickets: payload.supportTickets.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })),
    projectTasks: (payload.projectTasks ?? []).map((item) => ({
      ...item,
      platform: item.platform ?? "TELEGRAM",
      messageText: item.messageText ?? null,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    })),
    projectPlatformSettings: mergeProjectPlatformSettings(payload.projectPlatformSettings),
    projectServiceSettings: mergeProjectServiceSettings(payload.projectServiceSettings),
    projectPlatformServices: mergeProjectPlatformServices(payload.projectPlatformServices),
  };
}

function saveStore(store: Store) {
  if (marketContext.getStore() !== store) throw new Error('MARKET_TRANSACTION_REQUIRED');
}

function updateStore<T>(updater: (store: Store) => T): T {
  const store = loadStore();
  const result = updater(store);
  saveStore(store);
  return result;
}

function sortByDateDesc<T extends { createdAt?: Date; updatedAt?: Date }>(items: T[], key: "createdAt" | "updatedAt") {
  return [...items].sort((a, b) => b[key]!.getTime() - a[key]!.getTime());
}

function backupLegacyStore() {
  if (!existsSync(dataFilePath)) {
    return;
  }

  const backupPath = join(dataDir, `store.legacy-${Date.now()}.json`);
  copyFileSync(dataFilePath, backupPath);
}

function ensureLegacyArtifactRemoved() {
  if (existsSync(legacyDbPath)) {
    unlinkSync(legacyDbPath);
  }
}

function isMarketplaceStore(payload: unknown): payload is PersistedStore {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "version" in payload &&
      (payload as PersistedStore).version === STORE_VERSION &&
      Array.isArray((payload as PersistedStore).catalogItems),
  );
}

function hashValue(value: string) {
  let hash = 0;
  for (const symbol of value) {
    hash = (hash * 31 + symbol.charCodeAt(0)) % 100000;
  }
  return hash;
}

function buildListingTitle(itemName: string, sectionName: string, variant: number) {
  const presets: Record<string, string[]> = {
    "Аккаунты": [
      `${itemName} аккаунт с быстрой передачей`,
      `${itemName} личный аккаунт под ключ`,
      `${itemName} готовый аккаунт с гарантией`,
    ],
    "Подписка": [
      `${itemName} подписка с моментальной активацией`,
      `${itemName} доступ к ${itemName} без ожидания`,
      `${itemName} подписка на персональный аккаунт`,
    ],
    "API": [
      `${itemName} API-ключ и помощь с запуском`,
      `${itemName} токены и рабочий API-доступ`,
      `${itemName} API-пакет для продакшн задач`,
    ],
    "Валюта": [
      `${itemName} валюта с выдачей в игре`,
      `${itemName} пополнение баланса без ожидания`,
      `${itemName} игровая валюта под заказ`,
    ],
    "Донат": [
      `${itemName} донат и премиум-наборы`,
      `${itemName} пополнение доната под ваш регион`,
      `${itemName} донат с ручной проверкой заказа`,
    ],
    "Ключи": [
      `${itemName} ключ активации и региональная помощь`,
      `${itemName} цифровой ключ с проверкой`,
      `${itemName} код активации на ${itemName}`,
    ],
  };

  const variants = presets[sectionName] ?? [
    `${itemName}: ${sectionName.toLowerCase()} с гарантией`,
    `${sectionName} для ${itemName} под ваш запрос`,
    `${itemName} ${sectionName.toLowerCase()} от проверенного продавца`,
  ];

  return variants[variant % variants.length]!;
}

function buildListingDescription(itemName: string, sectionName: string, variant: number) {
  const suffix = [
    "Быстро отвечаю в чате, объясняю нюансы и довожу сделку до результата.",
    "Подходит для покупателей, которым нужна понятная схема, подтверждение и аккуратная выдача.",
    "Если нужен нестандартный объём или регион, можно согласовать прямо в сообщениях.",
  ][variant % 3]!;

  return `${sectionName} по ${itemName}. ${suffix}`;
}

function buildPriceRub(item: CatalogItem, section: CatalogSection, variant: number) {
  const baseMap: Record<string, number> = {
    "Аккаунты": 890,
    "Подписка": 320,
    "API": 1490,
    "Токены": 790,
    "Валюта": 240,
    "Скины": 890,
    "Буст": 660,
    "Рейды": 1200,
    "Прокачка": 950,
    "Предметы": 480,
    "Ключи": 1490,
    "Пополнение": 420,
    "Монеты": 360,
    "Донат": 530,
    "Сервера": 1190,
    "Лицензии": 1790,
    "Обучение": 1290,
    "Продвижение": 980,
    "Реклама": 1590,
  };

  const familyFactor: Record<CatalogFamily, number> = {
    ai: 1.35,
    subscription: 0.9,
    software: 1.2,
    platform: 1.15,
    social: 1.05,
    shooter: 1.1,
    mmorpg: 1.18,
    mobile: 0.95,
    sports: 0.92,
    sandbox: 1.08,
    strategy: 0.98,
  };

  const base = baseMap[section.name] ?? 690;
  const hashBoost = (hashValue(`${item.slug}-${section.slug}`) % 420) + variant * 65;
  return Math.round((base + hashBoost) * familyFactor[item.family]);
}

function buildCatalogItems() {
  return catalogBlueprints.map((blueprint, index) => {
    const timestamp = daysAgo(150 - index);
    const slug = slugify(blueprint.name);
    const theme = getThemeForName(blueprint.name);

    return {
      id: `catalog-${slug}`,
      slug,
      name: blueprint.name,
      kind: blueprint.kind,
      family: blueprint.family,
      description: buildCatalogDescription(blueprint),
      featured: blueprint.featured ?? false,
      themeFrom: theme.from,
      themeTo: theme.to,
      sections: getSectionsForFamily(blueprint.family).map((sectionName) => ({
        id: `section-${slug}-${slugify(sectionName)}`,
        slug: slugify(sectionName),
        name: sectionName,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies CatalogItem;
  });
}

function buildListings(catalogItems: CatalogItem[]) {
  const sellers = [
    seedIds.hybrid,
    seedIds.seller1,
    seedIds.seller2,
    seedIds.seller3,
    seedIds.seller4,
    seedIds.seller5,
  ];

  const listings: Listing[] = [];

  catalogItems.slice(0, 48).forEach((item, itemIndex) => {
    item.sections.slice(0, 3).forEach((section, sectionIndex) => {
      const variants = item.featured ? 2 : 1;

      for (let variant = 0; variant < variants; variant += 1) {
        const sellerId = sellers[(itemIndex + sectionIndex + variant) % sellers.length]!;
        const createdAt = daysAgo((itemIndex + 3) * 2 + sectionIndex + variant, 10 + variant);

        listings.push({
          id: createId(),
          itemId: item.id,
          sectionId: section.id,
          sellerId,
          title: buildListingTitle(item.name, section.name, variant),
          description: buildListingDescription(item.name, section.name, variant),
          deliveryNote: variant % 2 === 0 ? "После оплаты отправлю инструкции и детали сделки." : null,
          priceRub: buildPriceRub(item, section, variant),
          status: "ACTIVE",
          deliveryType: variant % 2 === 0 ? "AUTO" : "MANUAL",
          isOnline: (itemIndex + sectionIndex + variant) % 3 !== 0,
          rating: 4.4 + ((itemIndex + sectionIndex + variant) % 6) * 0.1,
          reviewsCount: 40 + ((itemIndex + sectionIndex + variant) % 50) * 7,
          yearsOnPlatform: 1 + ((itemIndex + sectionIndex + variant) % 5),
          createdAt,
          updatedAt: createdAt,
        });
      }
    });
  });

  return listings;
}

function getCatalogItemByName(catalogItems: CatalogItem[], name: string) {
  const item = catalogItems.find((entry) => entry.name === name);

  if (!item) {
    throw new Error(`Catalog item "${name}" not found`);
  }

  return item;
}

function findListing(
  listings: Listing[],
  catalogItems: CatalogItem[],
  itemName: string,
  sectionName: string,
  sellerId?: string,
) {
  const item = getCatalogItemByName(catalogItems, itemName);
  const section = item.sections.find((entry) => entry.name === sectionName) ?? item.sections[0];

  if (!section) {
    throw new Error(`Section "${sectionName}" not found for "${itemName}"`);
  }

  return (
    listings.find(
      (listing) =>
        listing.itemId === item.id &&
        listing.sectionId === section.id &&
        (sellerId ? listing.sellerId === sellerId : true),
    ) ?? null
  );
}

function appendOrderBundle(
  store: Store,
  input: {
    listing: Listing;
    buyerId: string;
    sellerId?: string;
    status: OrderStatus;
    amountRub?: number;
    createdAt: Date;
    conversationMessages?: Array<{ senderId: string; text: string; hoursOffset: number }>;
  },
) {
  const sellerId = input.sellerId ?? input.listing.sellerId;
  const orderId = createId();
  const amountRub = input.amountRub ?? input.listing.priceRub;

  const order: Order = {
    id: orderId,
    listingId: input.listing.id,
    projectId: null,
    itemId: input.listing.itemId,
    sectionId: input.listing.sectionId,
    buyerId: input.buyerId,
    sellerId,
    status: input.status,
    amountRub,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  store.orders.push(order);

  if (input.status === "CLOSED" || input.status === "DISPUTED") {
    store.walletTransactions.push(
      {
        id: createId(),
        userId: input.buyerId,
        orderId,
        type: "PURCHASE",
        status: "COMPLETED",
        amountRub: -amountRub,
        description: `Заказ ${orderId.slice(0, 8).toUpperCase()} · ${input.listing.title}`,
        createdAt: input.createdAt,
      },
      {
        id: createId(),
        userId: sellerId,
        orderId,
        type: "SALE",
        status: "COMPLETED",
        amountRub,
        description: `Продажа ${orderId.slice(0, 8).toUpperCase()} · ${input.listing.title}`,
        createdAt: input.createdAt,
      },
    );
  }

  if (input.status === "REFUNDED") {
    store.walletTransactions.push(
      {
        id: createId(),
        userId: input.buyerId,
        orderId,
        type: "REFUND",
        status: "COMPLETED",
        amountRub,
        description: `Возврат по заказу ${orderId.slice(0, 8).toUpperCase()}`,
        createdAt: input.createdAt,
      },
      {
        id: createId(),
        userId: input.buyerId,
        orderId,
        type: "PURCHASE",
        status: "CANCELLED",
        amountRub: -amountRub,
        description: `Покупка отменена · ${input.listing.title}`,
        createdAt: input.createdAt,
      },
    );
  }

  if (input.status === "PENDING") {
    store.walletTransactions.push({
      id: createId(),
      userId: input.buyerId,
      orderId,
      type: "PURCHASE",
      status: "PENDING",
      amountRub: -amountRub,
      description: `Ожидающий заказ ${orderId.slice(0, 8).toUpperCase()} · ${input.listing.title}`,
      createdAt: input.createdAt,
    });
  }

  const conversationId = createId();
  const conversation: Conversation = {
    id: conversationId,
    orderId,
    itemId: input.listing.itemId,
    buyerId: input.buyerId,
    sellerId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  store.conversations.push(conversation);

  const messages = input.conversationMessages ?? [];

  messages.forEach((message) => {
    const createdAt = new Date(input.createdAt.getTime() + message.hoursOffset * 60 * 60 * 1000);

    store.messages.push({
      id: createId(),
      conversationId,
      senderId: message.senderId,
      text: message.text,
      createdAt,
    });

    conversation.updatedAt = createdAt;
  });

  return order;
}

function createSeedStore(): Store {
  const passwordHash = bcrypt.hashSync("demo12345", 12);

  const users: User[] = [
    {
      id: seedIds.buyer,
      name: "akoody",
      email: "buyer@kwork.local",
      passwordHash,
      role: "CUSTOMER",
      bio: "Покупаю игровые аккаунты, подписки и доступы для работы.",
      city: "Кишинёв",
      preferredCurrency: "RUB",
      createdAt: daysAgo(920),
      updatedAt: daysAgo(2),
    },
    {
      id: seedIds.hybrid,
      name: "Gorchiiik",
      email: "hybrid@kwork.local",
      passwordHash,
      role: "BOTH",
      bio: "Продаю цифровые товары, аккаунты и подписки. Работаю быстро и без лишних переписок.",
      city: "Москва",
      preferredCurrency: "RUB",
      createdAt: daysAgo(760),
      updatedAt: daysAgo(1),
    },
    {
      id: seedIds.seller1,
      name: "SenseIC3",
      email: "seller1@kwork.local",
      passwordHash,
      role: "SELLER",
      bio: "AI и подписки с автовыдачей.",
      city: "Минск",
      preferredCurrency: "RUB",
      createdAt: daysAgo(610),
      updatedAt: daysAgo(3),
    },
    {
      id: seedIds.seller2,
      name: "KabiShop",
      email: "seller2@kwork.local",
      passwordHash,
      role: "SELLER",
      bio: "Мобильные игры, пополнения, валюты и ручная помощь по сделкам.",
      city: "Алматы",
      preferredCurrency: "RUB",
      createdAt: daysAgo(540),
      updatedAt: daysAgo(4),
    },
    {
      id: seedIds.seller3,
      name: "wander047",
      email: "seller3@kwork.local",
      passwordHash,
      role: "SELLER",
      bio: "Сервисы, Discord, Steam, ключи и платформенные товары.",
      city: "Тбилиси",
      preferredCurrency: "RUB",
      createdAt: daysAgo(488),
      updatedAt: daysAgo(5),
    },
    {
      id: seedIds.seller4,
      name: "MrBigi",
      email: "seller4@kwork.local",
      passwordHash,
      role: "SELLER",
      bio: "MMORPG и редкие игровые позиции.",
      city: "Ереван",
      preferredCurrency: "RUB",
      createdAt: daysAgo(450),
      updatedAt: daysAgo(2),
    },
    {
      id: seedIds.seller5,
      name: "summerexec",
      email: "seller5@kwork.local",
      passwordHash,
      role: "SELLER",
      bio: "Премиум-подписки, ключи и сервисные пакеты.",
      city: "Варшава",
      preferredCurrency: "RUB",
      createdAt: daysAgo(390),
      updatedAt: daysAgo(1),
    },
  ];

  const catalogItems = buildCatalogItems();
  const listings = buildListings(catalogItems);

  const store: Store = {
    version: STORE_VERSION,
    users,
    sessions: [],
    catalogItems,
    listings,
    orders: [],
    conversations: [],
    messages: [],
    walletTransactions: [],
    supportTickets: [
      {
        id: createId(),
        userId: seedIds.buyer,
        subject: "Возврат по заказу и история транзакций",
        lastMessage: "Подтвердили возврат и объяснили, как он отразится в кошельке.",
        status: "ANSWERED",
        createdAt: daysAgo(24),
        updatedAt: daysAgo(23),
      },
      {
        id: createId(),
        userId: seedIds.hybrid,
        subject: "Проверка нового каталога по ChatGPT",
        lastMessage: "Нужна проверка категорий и отображения офферов после добавления.",
        status: "OPEN",
        createdAt: daysAgo(3),
        updatedAt: daysAgo(1),
      },
    ],
    projectTasks: [],
    projectPlatformSettings: mergeProjectPlatformSettings(),
    projectServiceSettings: mergeProjectServiceSettings(),
    projectPlatformServices: mergeProjectPlatformServices(),
  };

  store.walletTransactions.push(
    {
      id: createId(),
      userId: seedIds.buyer,
      orderId: null,
      type: "TOP_UP",
      status: "COMPLETED",
      amountRub: 14500,
      description: "Пополнение баланса картой",
      createdAt: daysAgo(55),
    },
    {
      id: createId(),
      userId: seedIds.buyer,
      orderId: null,
      type: "TOP_UP",
      status: "COMPLETED",
      amountRub: 9800,
      description: "Пополнение баланса SBP",
      createdAt: daysAgo(31),
    },
    {
      id: createId(),
      userId: seedIds.hybrid,
      orderId: null,
      type: "WITHDRAWAL",
      status: "COMPLETED",
      amountRub: -5200,
      description: "Вывод на карту продавца",
      createdAt: daysAgo(18),
    },
  );

  const purchaseScenarios = [
    {
      itemName: "ChatGPT",
      sectionName: "Аккаунты",
      buyerId: seedIds.buyer,
      status: "CLOSED" as const,
      createdAt: daysAgo(38, 19),
      messages: [
        { senderId: seedIds.buyer, text: "Нужен рабочий аккаунт с понятной передачей.", hoursOffset: 0 },
        { senderId: seedIds.seller1, text: "Готово, отправил данные и инструкцию по входу.", hoursOffset: 1 },
      ],
    },
    {
      itemName: "ChatGPT",
      sectionName: "Подписка",
      buyerId: seedIds.buyer,
      status: "REFUNDED" as const,
      createdAt: daysAgo(41, 20),
      messages: [
        { senderId: seedIds.buyer, text: "Подписка не активировалась, нужен возврат.", hoursOffset: 0 },
        { senderId: seedIds.seller5, text: "Подтвердил возврат, средства вернутся в кошелёк.", hoursOffset: 2 },
      ],
    },
    {
      itemName: "Standoff 2",
      sectionName: "Валюта",
      buyerId: seedIds.buyer,
      status: "CLOSED" as const,
      createdAt: daysAgo(12, 17),
      messages: [
        { senderId: seedIds.buyer, text: "Проверьте ник и регион перед пополнением.", hoursOffset: 0 },
        { senderId: seedIds.seller2, text: "Ник принял, пополнение завершено.", hoursOffset: 1 },
      ],
    },
    {
      itemName: "Path of Exile 2",
      sectionName: "Валюта",
      buyerId: seedIds.buyer,
      status: "PENDING" as const,
      createdAt: daysAgo(1, 14),
      messages: [
        { senderId: seedIds.buyer, text: "Оформил заказ, жду подтверждение по лиге.", hoursOffset: 0 },
      ],
    },
    {
      itemName: "Steam",
      sectionName: "Ключи",
      buyerId: seedIds.buyer,
      status: "CLOSED" as const,
      createdAt: daysAgo(7, 15),
      messages: [
        { senderId: seedIds.seller3, text: "Ключ отправлен, если нужна помощь с регионом, напишите.", hoursOffset: 0 },
      ],
    },
    {
      itemName: "Discord Nitro",
      sectionName: "Подписка",
      buyerId: seedIds.buyer,
      status: "CLOSED" as const,
      createdAt: daysAgo(4, 12),
      messages: [
        { senderId: seedIds.buyer, text: "Нужна активация без смены логина.", hoursOffset: 0 },
        { senderId: seedIds.seller5, text: "Сделано, Nitro активирован на ваш аккаунт.", hoursOffset: 1 },
      ],
    },
  ];

  purchaseScenarios.forEach((scenario) => {
    const listing = findListing(store.listings, store.catalogItems, scenario.itemName, scenario.sectionName);

    if (listing) {
      appendOrderBundle(store, {
        listing,
        buyerId: scenario.buyerId,
        status: scenario.status,
        createdAt: scenario.createdAt,
        conversationMessages: scenario.messages,
      });
    }
  });

  const salesScenarios = [
    {
      itemName: "Counter-Strike 2",
      sectionName: "Скины",
      buyerId: seedIds.seller4,
      sellerId: seedIds.hybrid,
      status: "CLOSED" as const,
      createdAt: daysAgo(6, 12),
    },
    {
      itemName: "Telegram Premium",
      sectionName: "Подписка",
      buyerId: seedIds.seller2,
      sellerId: seedIds.hybrid,
      status: "REFUNDED" as const,
      createdAt: daysAgo(19, 17),
    },
    {
      itemName: "ChatGPT",
      sectionName: "API",
      buyerId: seedIds.seller3,
      sellerId: seedIds.hybrid,
      status: "CLOSED" as const,
      createdAt: daysAgo(9, 21),
    },
    {
      itemName: "Roblox",
      sectionName: "Донат",
      buyerId: seedIds.seller1,
      sellerId: seedIds.hybrid,
      status: "DISPUTED" as const,
      createdAt: daysAgo(2, 16),
    },
  ];

  salesScenarios.forEach((scenario) => {
    const listing = findListing(
      store.listings,
      store.catalogItems,
      scenario.itemName,
      scenario.sectionName,
      scenario.sellerId,
    );

    if (listing) {
      appendOrderBundle(store, {
        listing,
        buyerId: scenario.buyerId,
        sellerId: scenario.sellerId,
        status: scenario.status,
        createdAt: scenario.createdAt,
        conversationMessages: [
          { senderId: scenario.buyerId, text: "Оформил заказ, жду детали по выдаче.", hoursOffset: 0 },
          { senderId: scenario.sellerId, text: "Смотрю заказ, отпишусь сразу после проверки.", hoursOffset: 1 },
        ],
      });
    }
  });

  return store;
}

function loadStore(): Store {
  const store = marketContext.getStore();
  if (!store) throw new Error('MARKET_TRANSACTION_REQUIRED');
  return store;
}

export function createProductionStore() {
  return serializeStore({version:STORE_VERSION,users:[],sessions:[],catalogItems:buildCatalogItems(),listings:[],orders:[],conversations:[],messages:[],walletTransactions:[],supportTickets:[],projectTasks:[],projectPlatformSettings:mergeProjectPlatformSettings(),projectServiceSettings:mergeProjectServiceSettings(),projectPlatformServices:mergeProjectPlatformServices()});
}
export function withMarketStore<T>(payload: PersistedStore, operation: (store: Store) => T) {
  const store=deserializeStore(payload);
  return marketContext.run(store,()=>({result:operation(store),payload:serializeStore(store)}));
}

function getSectionById(item: CatalogItem, sectionId: string) {
  return item.sections.find((section) => section.id === sectionId)!;
}

function getOrderRelations(store: Store, order: Order): OrderWithRelations {
  const listing = store.listings.find((entry) => entry.id === order.listingId)!;
  const item = store.catalogItems.find((entry) => entry.id === order.itemId)!;
  const buyer = store.users.find((entry) => entry.id === order.buyerId)!;
  const seller = store.users.find((entry) => entry.id === order.sellerId)!;

  return {
    ...order,
    listing,
    item,
    section: getSectionById(item, order.sectionId),
    buyer,
    seller,
  };
}

function getWalletBalanceRub(store: Store, userId: string) {
  return store.walletTransactions
    .filter((entry) => entry.userId === userId && entry.status === "COMPLETED")
    .reduce((sum, entry) => Math.round((sum + entry.amountRub)*100)/100, 0);
}

function getCatalogListingCount(store: Store, itemId: string, sectionId?: string) {
  return store.listings.filter(
    (listing) =>
      listing.itemId === itemId &&
      listing.status === "ACTIVE" &&
      (sectionId ? listing.sectionId === sectionId : true),
  ).length;
}

function getProjectPlatformCatalogName(platform: ProjectPlatform) {
  switch (platform) {
    case "TELEGRAM":
      return "Telegram";
    case "YOUTUBE":
      return "YouTube";
    case "TIKTOK":
      return "TikTok";
    case "INSTAGRAM":
      return "Instagram";
    case "VK":
      return "VK";
    case "DISCORD":
      return "Discord";
    case "TWITCH":
      return "Twitch";
  }
}

function getProjectCatalogPlacement(store: Store, platform: ProjectPlatform) {
  const catalogName = getProjectPlatformCatalogName(platform);
  const item =
    store.catalogItems.find((entry) => entry.name === catalogName) ??
    store.catalogItems.find((entry) => entry.name.includes(catalogName)) ??
    store.catalogItems[0];

  if (!item) {
    throw new Error("CATALOG_ITEM_NOT_FOUND");
  }

  const section =
    item.sections.find((entry) => entry.name === "Услуги") ??
    item.sections.find((entry) => entry.name === "Продвижение") ??
    item.sections[0];

  if (!section) {
    throw new Error("SECTION_NOT_FOUND");
  }

  return { item, section };
}

function getProjectRelations(store: Store, project: ProjectTask): ProjectTaskSummary {
  return {
    ...project,
    customer: store.users.find((user) => user.id === project.customerId)!,
    executor: project.executorId ? store.users.find((user) => user.id === project.executorId) ?? null : null,
  };
}

export function findUserByEmail(email: string) {
  return loadStore().users.find((user) => user.email === email) ?? null;
}

export function findUserById(id: string) {
  return loadStore().users.find((user) => user.id === id) ?? null;
}

export function createUser(input: { name: string; email: string; passwordHash: string }) {
  return updateStore((store) => {
    const timestamp = now();
    const user: User = {
      id: createId(),
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: "BOTH",
      bio: "Новый пользователь маркетплейса.",
      city: null,
      preferredCurrency: "RUB",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.users.push(user);
    return user;
  });
}

export function createSessionRecord(userId: string, expiresAt: Date) {
  return updateStore((store) => {
    const id = createId();
    store.sessions.push({ id, userId, expiresAt, createdAt: now() });
    return id;
  });
}

export function getSessionRecord(sessionId: string) {
  return updateStore((store) => {
    const index = store.sessions.findIndex((session) => session.id === sessionId);

    if (index === -1) {
      return null;
    }

    const session = store.sessions[index];

    if (!session || session.expiresAt <= now()) {
      if (session) {
        store.sessions.splice(index, 1);
      }
      return null;
    }

    return session;
  });
}

export function deleteSessionRecord(sessionId: string) {
  updateStore((store) => {
    store.sessions = store.sessions.filter((session) => session.id !== sessionId);
  });
}

export function updateUserCurrency(userId: string, currency: CurrencyCode) {
  return updateStore((store) => {
    const user = store.users.find((entry) => entry.id === userId);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    user.preferredCurrency = currency;
    user.updatedAt = now();
  });
}

export function getCatalogLibrary(query?: string) {
  const store = loadStore();
  const normalizedQuery = query?.trim().toLowerCase() ?? "";

  return store.catalogItems
    .filter((item) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.sections.some((section) => section.name.toLowerCase().includes(normalizedQuery))
      );
    })
    .map((item) => {
      const itemListings = store.listings.filter((listing) => listing.itemId === item.id && listing.status === "ACTIVE");
      const minPriceRub = itemListings.length ? Math.min(...itemListings.map((listing) => listing.priceRub)) : null;

      return {
        ...item,
        listingCount: itemListings.length,
        minPriceRub,
        sectionStats: item.sections.map((section) => ({
          ...section,
          listingsCount: getCatalogListingCount(store, item.id, section.id),
        })),
      };
    })
    .sort((a, b) => {
      if (a.featured !== b.featured) {
        return a.featured ? -1 : 1;
      }

      return a.name.localeCompare(b.name, "ru");
    }) satisfies CatalogLibraryItem[];
}

export function getFeaturedCatalogItems() {
  return getCatalogLibrary()
    .filter((item) => item.featured && item.listingCount > 0)
    .slice(0, 8);
}

export function getCatalogItemBySlug(
  slug: string,
  filters?: { section?: string; query?: string; onlineOnly?: boolean },
) {
  const store = loadStore();
  const item = store.catalogItems.find((entry) => entry.slug === slug);

  if (!item) {
    return null;
  }

  const selectedSection = filters?.section ? item.sections.find((section) => section.id === filters.section) ?? null : null;
  const normalizedQuery = filters?.query?.trim().toLowerCase() ?? "";
  const listings = sortByDateDesc(
    store.listings
      .filter((listing) => listing.itemId === item.id && listing.status === "ACTIVE")
      .filter((listing) => (filters?.section ? listing.sectionId === filters.section : true))
      .filter((listing) => (filters?.onlineOnly ? listing.isOnline : true))
      .filter((listing) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          listing.title.toLowerCase().includes(normalizedQuery) ||
          listing.description.toLowerCase().includes(normalizedQuery)
        );
      })
      .map((listing) => ({
        ...listing,
        seller: store.users.find((user) => user.id === listing.sellerId)!,
        item,
        section: getSectionById(item, listing.sectionId),
      })),
    "updatedAt",
  ) as CatalogListingItem[];

  return {
    ...item,
    listingCount: getCatalogListingCount(store, item.id),
    selectedSection,
    sectionStats: item.sections.map((section) => ({
      ...section,
      listingsCount: getCatalogListingCount(store, item.id, section.id),
    })),
    listings,
  } satisfies CatalogItemDetails;
}

export function getListingDetails(itemSlug: string, listingId: string) {
  const store = loadStore();
  const item = store.catalogItems.find((entry) => entry.slug === itemSlug);

  if (!item) {
    return null;
  }

  const listing = store.listings.find(
    (entry) => entry.id === listingId && entry.itemId === item.id && entry.status === "ACTIVE",
  );

  if (!listing) {
    return null;
  }

  const seller = store.users.find((entry) => entry.id === listing.sellerId);

  if (!seller) {
    return null;
  }

  return {
    ...listing,
    item,
    section: getSectionById(item, listing.sectionId),
    seller,
  } satisfies ListingDetails;
}

export function listUserOrders(
  userId: string,
  mode: "purchases" | "sales",
  filters?: { orderId?: string; counterparty?: string; status?: string; item?: string },
) {
  const store = loadStore();
  const normalizedOrderId = filters?.orderId?.trim().toLowerCase() ?? "";
  const normalizedCounterparty = filters?.counterparty?.trim().toLowerCase() ?? "";
  const normalizedItem = filters?.item?.trim().toLowerCase() ?? "";

  return sortByDateDesc(
    store.orders
      .filter((order) => (mode === "purchases" ? order.buyerId === userId : order.sellerId === userId))
      .map((order) => getOrderRelations(store, order))
      .filter((order) => {
        const counterparty = mode === "purchases" ? order.seller.name : order.buyer.name;

        return (
          (!normalizedOrderId || order.id.toLowerCase().includes(normalizedOrderId)) &&
          (!normalizedCounterparty || counterparty.toLowerCase().includes(normalizedCounterparty)) &&
          (!filters?.status || filters.status === "ALL" || order.status === filters.status) &&
          (!normalizedItem || order.item.name.toLowerCase().includes(normalizedItem))
        );
      }),
    "createdAt",
  );
}

export function listUserConversations(userId: string) {
  const store = loadStore();

  return sortByDateDesc(
    store.conversations
      .filter((conversation) => conversation.buyerId === userId || conversation.sellerId === userId)
      .map((conversation) => ({
        ...conversation,
        item: store.catalogItems.find((item) => item.id === conversation.itemId)!,
        order: store.orders.find((order) => order.id === conversation.orderId)!,
        project:
          store.projectTasks.find(
            (project) =>
              project.conversationId === conversation.id ||
              project.orderId === store.orders.find((order) => order.id === conversation.orderId)?.id,
          ) ?? null,
        buyer: store.users.find((user) => user.id === conversation.buyerId)!,
        seller: store.users.find((user) => user.id === conversation.sellerId)!,
        latestMessage:
          sortByDateDesc(
            store.messages.filter((message) => message.conversationId === conversation.id),
            "createdAt",
          )[0] ?? null,
      })),
    "updatedAt",
  ) satisfies ConversationSummary[];
}

export function getConversationDetails(conversationId: string) {
  const store = loadStore();
  const conversation = store.conversations.find((entry) => entry.id === conversationId);

  if (!conversation) {
    return null;
  }

  const order = store.orders.find((entry) => entry.id === conversation.orderId)!;
  const item = store.catalogItems.find((entry) => entry.id === conversation.itemId)!;
  const listing = store.listings.find((entry) => entry.id === order.listingId)!;
  const project = order.projectId ? store.projectTasks.find((entry) => entry.id === order.projectId) ?? null : null;

  return {
    ...conversation,
    item,
    order,
    listing,
    section: getSectionById(item, order.sectionId),
    project,
    buyer: store.users.find((user) => user.id === conversation.buyerId)!,
    seller: store.users.find((user) => user.id === conversation.sellerId)!,
    messages: store.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((message) => ({
        ...message,
        sender: store.users.find((user) => user.id === message.senderId)!,
      })),
  } satisfies ConversationDetails;
}

export function createMessageRecord(userId: string, conversationId: string, text: string) {
  updateStore((store) => {
    const conversation = store.conversations.find((entry) => entry.id === conversationId);

    if (!conversation || (conversation.buyerId !== userId && conversation.sellerId !== userId)) {
      throw new Error("CHAT_NOT_FOUND");
    }

    const timestamp = now();

    store.messages.push({
      id: createId(),
      conversationId,
      senderId: userId,
      text,
      createdAt: timestamp,
    });

    conversation.updatedAt = timestamp;
  });
}

export function getWalletOverview(userId: string, statusFilter?: WalletTransactionStatus | "ALL") {
  const store = loadStore();
  const transactions = sortByDateDesc(
    store.walletTransactions.filter(
      (entry) => entry.userId === userId && (!statusFilter || statusFilter === "ALL" || entry.status === statusFilter),
    ),
    "createdAt",
  );

  return {
    availableRub: getWalletBalanceRub(store, userId),
    transactions,
  } satisfies WalletOverview;
}

export function createWalletTransactionRecord(
  userId: string,
  input: { type: "TOP_UP" | "WITHDRAWAL"; amountRub: number; description: string },
) {
  return updateStore((store) => {
    if (input.type === "WITHDRAWAL" && getWalletBalanceRub(store, userId) < Math.abs(input.amountRub)) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    store.walletTransactions.push({
      id: createId(),
      userId,
      orderId: null,
      type: input.type,
      status: "COMPLETED",
      amountRub: input.type === "TOP_UP" ? Math.abs(input.amountRub) : -Math.abs(input.amountRub),
      description: input.description,
      createdAt: now(),
    });
  });
}

export function createSupportTicketRecord(userId: string, subject: string, text: string) {
  return updateStore((store) => {
    const timestamp = now();

    store.supportTickets.unshift({
      id: createId(),
      userId,
      subject,
      lastMessage: text,
      status: "OPEN",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
}

export function getProjectSettings() {
  const store = loadStore();

  return {
    platforms: store.projectPlatformSettings,
    services: store.projectServiceSettings,
    platformServices: store.projectPlatformServices,
  } satisfies ProjectSettings;
}

export function getProjectFormConfig() {
  const settings = getProjectSettings();

  return {
    platforms: settings.platforms
      .filter((platform) => platform.enabled)
      .map((platform) => ({
        ...platform,
        services: settings.services.filter(
          (service) =>
            service.enabled &&
            settings.platformServices.some(
              (entry) => entry.platformId === platform.id && entry.serviceId === service.id && entry.enabled,
            ),
        ),
      }))
      .filter((platform) => platform.services.length > 0),
  } satisfies ProjectFormConfig;
}

export function isProjectServiceAvailable(platformId: ProjectPlatform, serviceId: ProjectServiceType) {
  const store = loadStore();
  const platform = store.projectPlatformSettings.find((entry) => entry.id === platformId);
  const service = store.projectServiceSettings.find((entry) => entry.id === serviceId);

  return Boolean(
    platform?.enabled &&
      service?.enabled &&
      store.projectPlatformServices.some(
        (entry) => entry.platformId === platformId && entry.serviceId === serviceId && entry.enabled,
      ),
  );
}

export function getProjectServiceSetting(serviceId: ProjectServiceType) {
  return loadStore().projectServiceSettings.find((entry) => entry.id === serviceId) ?? null;
}

export function getProjectPlatformLabel(platformId: ProjectPlatform) {
  return loadStore().projectPlatformSettings.find((entry) => entry.id === platformId)?.label ?? getProjectPlatformCatalogName(platformId);
}

export function getProjectServiceLabel(serviceId: ProjectServiceType) {
  return loadStore().projectServiceSettings.find((entry) => entry.id === serviceId)?.label ?? serviceId;
}

export function updateProjectPlatformSettingRecord(
  platformId: ProjectPlatform,
  input: Omit<ProjectPlatformSetting, "id">,
) {
  return updateStore((store) => {
    const platform = store.projectPlatformSettings.find((entry) => entry.id === platformId);

    if (!platform) {
      throw new Error("PROJECT_PLATFORM_NOT_FOUND");
    }

    Object.assign(platform, input);
  });
}

export function updateProjectServiceSettingRecord(
  serviceId: ProjectServiceType,
  input: Omit<ProjectServiceSetting, "id">,
) {
  return updateStore((store) => {
    const service = store.projectServiceSettings.find((entry) => entry.id === serviceId);

    if (!service) {
      throw new Error("PROJECT_SERVICE_NOT_FOUND");
    }

    Object.assign(service, input);
  });
}

export function updateProjectPlatformServicesRecord(platformId: ProjectPlatform, serviceIds: ProjectServiceType[]) {
  return updateStore((store) => {
    if (!store.projectPlatformSettings.some((entry) => entry.id === platformId)) {
      throw new Error("PROJECT_PLATFORM_NOT_FOUND");
    }

    const selected = new Set(serviceIds);

    store.projectServiceSettings.forEach((service) => {
      const existing = store.projectPlatformServices.find(
        (entry) => entry.platformId === platformId && entry.serviceId === service.id,
      );

      if (existing) {
        existing.enabled = selected.has(service.id);
      } else {
        store.projectPlatformServices.push({
          platformId,
          serviceId: service.id,
          enabled: selected.has(service.id),
        });
      }
    });
  });
}

export function listProjectTasks(filters?: { status?: ProjectTaskStatus | "ALL"; mineUserId?: string }) {
  const store = loadStore();

  return sortByDateDesc(
    store.projectTasks
      .filter((project) => (!filters?.status || filters.status === "ALL" ? true : project.status === filters.status))
      .filter((project) =>
        filters?.mineUserId ? project.customerId === filters.mineUserId || project.executorId === filters.mineUserId : true,
      )
      .map((project) => getProjectRelations(store, project)),
    "updatedAt",
  );
}

export function getProjectTaskById(projectId: string) {
  const store = loadStore();
  const project = store.projectTasks.find((entry) => entry.id === projectId);

  if (!project) {
    return null;
  }

  return {
    ...getProjectRelations(store, project),
    order: project.orderId ? store.orders.find((order) => order.id === project.orderId) ?? null : null,
    conversation: project.conversationId
      ? store.conversations.find((conversation) => conversation.id === project.conversationId) ?? null
      : null,
  } satisfies ProjectTaskDetails;
}

export function createProjectRecord(
  customerId: string,
  input: {
    platform: ProjectPlatform;
    serviceType: ProjectServiceType;
    title: string;
    description: string;
    messageText?: string | null;
    targetSource: string;
    targets: string[];
    rewardPerTargetRub: number;
  },
) {
  return updateStore((store) => {
    const customer = store.users.find((entry) => entry.id === customerId);

    if (!customer) {
      throw new Error("USER_NOT_FOUND");
    }

    const targets = [...new Set(input.targets.map((target) => target.trim()).filter(Boolean))].slice(0, 500);

    if (!targets.length) {
      throw new Error("TARGETS_REQUIRED");
    }

    const rewardPerTargetRub = Math.max(1, Math.round(input.rewardPerTargetRub));
    const totalBudgetRub = rewardPerTargetRub * targets.length;

    if (getWalletBalanceRub(store, customerId) < totalBudgetRub) {
      throw new Error("INSUFFICIENT_FUNDS");
    }

    const timestamp = now();
    const project: ProjectTask = {
      id: createId(),
      customerId,
      executorId: null,
      orderId: null,
      conversationId: null,
      platform: input.platform,
      serviceType: input.serviceType,
      title: input.title,
      description: input.description,
      messageText: input.messageText?.trim() || null,
      targetSource: input.targetSource,
      targets,
      rewardPerTargetRub,
      targetCount: targets.length,
      totalBudgetRub,
      completedCount: 0,
      status: "OPEN",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.projectTasks.unshift(project);
    store.walletTransactions.unshift({
      id: createId(),
      userId: customerId,
      orderId: null,
      type: "PURCHASE",
      status: "COMPLETED",
      amountRub: -totalBudgetRub,
      description: `Резерв бюджета задачи ${getProjectPlatformCatalogName(project.platform)} · ${project.title}`,
      createdAt: timestamp,
    });

    return project;
  });
}

export function acceptProjectRecord(executorId: string, projectId: string) {
  return updateStore((store) => {
    const project = store.projectTasks.find((entry) => entry.id === projectId);

    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }

    if (project.status !== "OPEN" || project.executorId) {
      throw new Error("PROJECT_NOT_OPEN");
    }

    if (project.customerId === executorId) {
      throw new Error("SELF_PROJECT");
    }

    const customer = store.users.find((entry) => entry.id === project.customerId);
    const executor = store.users.find((entry) => entry.id === executorId);

    if (!customer || !executor) {
      throw new Error("PROJECT_RELATION_NOT_FOUND");
    }

    const { item, section } = getProjectCatalogPlacement(store, project.platform);
    const timestamp = now();
    const listingId = createId();
    const orderId = createId();
    const conversationId = createId();

    store.listings.unshift({
      id: listingId,
      itemId: item.id,
      sectionId: section.id,
      sellerId: executorId,
      title: project.title,
      description: project.description,
      deliveryNote: `Цели: ${project.targetCount}. Отслеживание прогресса ведётся в проекте и чате.`,
      priceRub: project.totalBudgetRub,
      status: "PAUSED",
      deliveryType: "MANUAL",
      isOnline: true,
      rating: 5,
      reviewsCount: 0,
      yearsOnPlatform: Math.max(1, new Date().getFullYear() - executor.createdAt.getFullYear()),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const order: Order = {
      id: orderId,
      listingId,
      projectId: project.id,
      itemId: item.id,
      sectionId: section.id,
      buyerId: project.customerId,
      sellerId: executorId,
      status: "PENDING",
      amountRub: project.totalBudgetRub,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const conversation: Conversation = {
      id: conversationId,
      orderId,
      itemId: item.id,
      buyerId: project.customerId,
      sellerId: executorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.orders.unshift(order);
    store.conversations.unshift(conversation);
    store.messages.push({
      id: createId(),
      conversationId,
      senderId: executorId,
      text: [
        `Принял задачу ${getProjectPlatformCatalogName(project.platform)}: ${project.title}`,
        `Целей: ${project.targetCount}`,
        `Бюджет: ${project.totalBudgetRub} RUB.`,
        project.messageText ? `Текст для выполнения:\n${project.messageText}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      createdAt: timestamp,
    });

    project.executorId = executorId;
    project.orderId = orderId;
    project.conversationId = conversationId;
    project.status = "IN_PROGRESS";
    project.updatedAt = timestamp;

    if (executor.role === "CUSTOMER") {
      executor.role = "BOTH";
      executor.updatedAt = timestamp;
    }

    return { conversationId };
  });
}

export function updateProjectProgressRecord(executorId: string, projectId: string, completedCount: number) {
  return updateStore((store) => {
    const project = store.projectTasks.find((entry) => entry.id === projectId);

    if (!project || project.executorId !== executorId || project.status !== "IN_PROGRESS") {
      throw new Error("PROJECT_NOT_EDITABLE");
    }

    const timestamp = now();
    const nextCompletedCount = Math.min(project.targetCount, Math.max(0, Math.round(completedCount)));

    project.completedCount = nextCompletedCount;
    project.updatedAt = timestamp;

    if (project.conversationId) {
      const conversation = store.conversations.find((entry) => entry.id === project.conversationId);

      if (conversation) {
        conversation.updatedAt = timestamp;
      }

      store.messages.push({
        id: createId(),
        conversationId: project.conversationId,
        senderId: executorId,
        text: `Обновил прогресс: ${nextCompletedCount} из ${project.targetCount} целей выполнено.`,
        createdAt: timestamp,
      });
    }
  });
}

export function completeProjectRecord(customerId: string, projectId: string) {
  return updateStore((store) => {
    const project = store.projectTasks.find((entry) => entry.id === projectId);

    if (!project || project.customerId !== customerId || project.status !== "IN_PROGRESS" || !project.executorId) {
      throw new Error("PROJECT_NOT_COMPLETABLE");
    }

    if (project.completedCount < project.targetCount) {
      throw new Error("PROJECT_PROGRESS_INCOMPLETE");
    }

    const order = project.orderId ? store.orders.find((entry) => entry.id === project.orderId) : null;
    if (!order || order.status !== 'PENDING') throw new Error('PROJECT_NOT_COMPLETABLE');
    const timestamp = now();

    if (order) {
      order.status = "CLOSED";
      order.updatedAt = timestamp;
    }

    store.walletTransactions.unshift({
      id: createId(),
      userId: project.executorId,
      orderId: project.orderId,
      type: "SALE",
      status: "COMPLETED",
      amountRub: project.totalBudgetRub,
      description: `Выплата за задачу ${getProjectPlatformCatalogName(project.platform)} · ${project.title}`,
      createdAt: timestamp,
    });

    if (project.conversationId) {
      const conversation = store.conversations.find((entry) => entry.id === project.conversationId);

      if (conversation) {
        conversation.updatedAt = timestamp;
      }

      store.messages.push({
        id: createId(),
        conversationId: project.conversationId,
        senderId: customerId,
        text: "Подтверждаю выполнение задачи. Выплата исполнителю отправлена с зарезервированного бюджета.",
        createdAt: timestamp,
      });
    }

    project.status = "COMPLETED";
    project.updatedAt = timestamp;
  });
}

export function createListingRecord(
  userId: string,
  input: {
    itemSlug: string;
    sectionId: string;
    title: string;
    description: string;
    deliveryNote?: string;
    priceRub: number;
    quantity?: number;
    autoPayloads?: string[];
    deliveryType: ListingDeliveryType;
    isActive: boolean;
  },
) {
  return updateStore((store) => {
    const item = store.catalogItems.find((entry) => entry.slug === input.itemSlug);

    if (!item) {
      throw new Error("CATALOG_ITEM_NOT_FOUND");
    }

    const section = item.sections.find((entry) => entry.id === input.sectionId);

    if (!section) {
      throw new Error("SECTION_NOT_FOUND");
    }

    const seller = store.users.find((entry) => entry.id === userId);

    if (!seller) {
      throw new Error("USER_NOT_FOUND");
    }

    const timestamp = now();
    const listing: Listing = {
      id: createId(),
      itemId: item.id,
      sectionId: section.id,
      sellerId: userId,
      title: input.title,
      description: input.description,
      deliveryNote: input.deliveryNote?.trim() || null,
      priceRub: input.priceRub,
      status: input.isActive ? "ACTIVE" : "PAUSED",
      deliveryType: input.deliveryType,
      quantity: input.quantity ?? 1,
      autoPayloads: input.deliveryType === 'AUTO' ? input.autoPayloads : undefined,
      isOnline: true,
      rating: 0,
      reviewsCount: 0,
      yearsOnPlatform: Math.max(0, new Date().getFullYear() - seller.createdAt.getFullYear()),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.listings.unshift(listing);

    if (seller.role === "CUSTOMER") {
      seller.role = "BOTH";
      seller.updatedAt = timestamp;
    }

    return {
      listingId: listing.id,
      itemSlug: item.slug,
      sectionId: section.id,
    };
  });
}

export function createPurchaseRecord(
  buyerId: string,
  input: {
    listingId: string;
    quantity: number;
    message?: string;
  },
) {
  return updateStore((store) => {
    const listing = store.listings.find((entry) => entry.id === input.listingId && entry.status === "ACTIVE");

    if (!listing) {
      throw new Error("LISTING_NOT_FOUND");
    }

    if (listing.sellerId === buyerId) {
      throw new Error("SELF_PURCHASE");
    }

    const buyer = store.users.find((entry) => entry.id === buyerId);
    const seller = store.users.find((entry) => entry.id === listing.sellerId);
    const item = store.catalogItems.find((entry) => entry.id === listing.itemId);

    if (!buyer || !seller || !item) {
      throw new Error("PURCHASE_RELATION_NOT_FOUND");
    }

    const quantity = Math.max(1, input.quantity);
    const timestamp = now();
    const amountRub = Math.round(listing.priceRub * quantity * 100)/100;
    if (getWalletBalanceRub(store,buyerId) < amountRub) throw new Error('INSUFFICIENT_FUNDS');
    if (quantity > (listing.quantity ?? 1)) throw new Error('INSUFFICIENT_STOCK');
    if (listing.deliveryType === 'AUTO' && (listing.autoPayloads?.length ?? 0) < quantity) throw new Error('INSUFFICIENT_STOCK');
    listing.quantity=(listing.quantity ?? 1)-quantity;
    if (!listing.quantity) listing.status='PAUSED';
    const orderId = createId();
    const conversationId = createId();

    const order: Order = {
      id: orderId,
      listingId: listing.id,
      projectId: null,
      itemId: listing.itemId,
      sectionId: listing.sectionId,
      buyerId,
      sellerId: listing.sellerId,
      status: "PENDING",
      amountRub,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const conversation: Conversation = {
      id: conversationId,
      orderId,
      itemId: listing.itemId,
      buyerId,
      sellerId: listing.sellerId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.orders.unshift(order);
    store.conversations.unshift(conversation);
    store.walletTransactions.unshift({
      id: createId(),
      userId: buyerId,
      orderId,
      type: "PURCHASE",
      status: "COMPLETED",
      amountRub: -amountRub,
      description: `Ожидающий заказ ${orderId.slice(0, 8).toUpperCase()} · ${listing.title}`,
      createdAt: timestamp,
    });

    const firstMessage = input.message?.trim() || `Оформил заказ на ${quantity} шт. Жду детали по выдаче.`;

    store.messages.push({
      id: createId(),
      conversationId,
      senderId: buyerId,
      text: firstMessage,
      createdAt: timestamp,
    });
    if(listing.deliveryNote)store.messages.push({id:createId(),conversationId,senderId:listing.sellerId,text:listing.deliveryNote,createdAt:timestamp});
    if (listing.deliveryType === 'AUTO') {
      store.messages.push({id:createId(),conversationId,senderId:listing.sellerId,text:`Автоматическая выдача:\n${listing.autoPayloads!.splice(0,quantity).join('\n\n')}`,createdAt:timestamp});
    }

    return {
      orderId,
      conversationId,
    } satisfies PurchaseResult;
  });
}

export function getUserProfileData(userId: string) {
  const store = loadStore();
  const user = store.users.find((entry) => entry.id === userId);

  if (!user) {
    return null;
  }

  const purchases = store.orders.filter((order) => order.buyerId === userId);
  const sales = store.orders.filter((order) => order.sellerId === userId);
  const chats = store.conversations.filter((conversation) => conversation.buyerId === userId || conversation.sellerId === userId);
  const activeListings = store.listings.filter((listing) => listing.sellerId === userId && listing.status === "ACTIVE").length;
  const activeProjects = store.projectTasks.filter(
    (project) =>
      (project.customerId === userId || project.executorId === userId) &&
      (project.status === "OPEN" || project.status === "IN_PROGRESS"),
  ).length;

  return {
    user,
    stats: {
      purchases: purchases.length,
      sales: sales.length,
      chats: chats.length,
      activeListings,
      activeProjects,
      totalTurnoverRub: sales
        .filter((order) => order.status === "CLOSED" || order.status === "DISPUTED")
        .reduce((sum, order) => sum + order.amountRub, 0),
    },
    recentPurchases: sortByDateDesc(purchases.map((order) => getOrderRelations(store, order)), "createdAt").slice(0, 4),
    recentSales: sortByDateDesc(sales.map((order) => getOrderRelations(store, order)), "createdAt").slice(0, 4),
    tickets: sortByDateDesc(store.supportTickets.filter((ticket) => ticket.userId === userId), "updatedAt").slice(0, 4),
  } satisfies UserProfileData;
}

export function getSupportOverview(userId: string) {
  const tickets = sortByDateDesc(loadStore().supportTickets.filter((ticket) => ticket.userId === userId), "updatedAt");

  return {
    tickets,
    openCount: tickets.filter((ticket) => ticket.status === "OPEN").length,
    answeredCount: tickets.filter((ticket) => ticket.status === "ANSWERED").length,
  } satisfies SupportOverview;
}

export function updateOrderStatusAsAdmin(orderId: string, status: OrderStatus) {
  return updateStore((store) => {
    const order = store.orders.find((entry) => entry.id === orderId);

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }
    if (order.status === status) return;
    if (['CLOSED','REFUNDED'].includes(order.status)) throw new Error('ORDER_ALREADY_SETTLED');
    if (status === 'CLOSED' || status === 'REFUNDED') {
      store.walletTransactions.push({id:createId(),userId:status==='CLOSED'?order.sellerId:order.buyerId,orderId:order.id,type:status==='CLOSED'?'SALE':'REFUND',status:'COMPLETED',amountRub:order.amountRub,description:status==='CLOSED'?'Оплата завершённого заказа':'Возврат по заказу',createdAt:now()});
      const project=store.projectTasks.find(p=>p.id===order.projectId);
      if (project) project.status=status==='CLOSED'?'COMPLETED':'CANCELLED';
    }
    order.status = status;
    order.updatedAt = now();
  });
}

export function createCatalogItemRecord(input: {
  name: string;
  kind: CatalogKind;
  family: CatalogFamily;
  description?: string;
}) {
  return updateStore((store) => {
    const timestamp = now();
    const slug = slugify(input.name);
    const theme = getThemeForName(input.name);

    if (store.catalogItems.some((item) => item.slug === slug || item.name === input.name)) {
      throw new Error("CATALOG_ITEM_EXISTS");
    }

    const item: CatalogItem = {
      id: `catalog-${slug}`,
      slug,
      name: input.name,
      kind: input.kind,
      family: input.family,
      description: input.description?.trim() || buildCatalogDescription(input),
      featured: false,
      themeFrom: theme.from,
      themeTo: theme.to,
      sections: getSectionsForFamily(input.family).map((sectionName) => ({
        id: `section-${slug}-${slugify(sectionName)}`,
        slug: slugify(sectionName),
        name: sectionName,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.catalogItems.unshift(item);
    return item;
  });
}

export function createCatalogSectionRecord(itemId: string, sectionName: string) {
  return updateStore((store) => {
    const item = store.catalogItems.find((entry) => entry.id === itemId);

    if (!item) {
      throw new Error("CATALOG_ITEM_NOT_FOUND");
    }

    const slug = slugify(sectionName);

    if (item.sections.some((section) => section.slug === slug || section.name === sectionName)) {
      throw new Error("SECTION_EXISTS");
    }

    item.sections.push({
      id: `section-${item.slug}-${slug}`,
      slug,
      name: sectionName,
    });
    item.updatedAt = now();
  });
}

export function getAdminDashboardData() {
  const store = loadStore();

  return {
    counts: {
      users: store.users.length,
      catalogItems: store.catalogItems.length,
      listings: store.listings.length,
      orders: store.orders.length,
      conversations: store.conversations.length,
      walletTransactions: store.walletTransactions.length,
      tickets: store.supportTickets.length,
    },
    recentUsers: sortByDateDesc(store.users, "createdAt").slice(0, 8),
    recentOrders: sortByDateDesc(store.orders.map((order) => getOrderRelations(store, order)), "createdAt").slice(0, 12),
    catalogItems: getCatalogLibrary().slice(0, 24),
    tickets: sortByDateDesc(store.supportTickets, "updatedAt").slice(0, 12),
    projectSettings: {
      platforms: store.projectPlatformSettings,
      services: store.projectServiceSettings,
      platformServices: store.projectPlatformServices,
    },
  } satisfies AdminDashboardData;
}

export function getCounts() {
  const store = loadStore();

  return {
    usersCount: store.users.length,
    projectsCount: store.catalogItems.length,
    offersCount: store.listings.length,
  };
}

export function listTopSellers(limit = 5) {
  const store = loadStore();

  return sortByDateDesc(
    store.users
      .map((user) => ({
        ...user,
        _count: {
          offers: store.listings.filter((listing) => listing.sellerId === user.id && listing.status === "ACTIVE").length,
        },
      }))
      .filter((user) => user._count.offers > 0),
    "createdAt",
  ).slice(0, limit);
}

export function listProjects() {
  return [];
}

export function listOpenProjects() {
  return [];
}

export function getProjectById() {
  return null;
}

export function getDashboardData(userId: string) {
  const store = loadStore();

  return {
    myProjects: [],
    myOffers: store.listings.filter((listing) => listing.sellerId === userId).slice(0, 5),
    myConversations: listUserConversations(userId),
  };
}

export function findLatestOfferForConversation() {
  return null;
}

export function createOfferRecord() {
  throw new Error("LEGACY_FLOW_DISABLED");
}

export function acceptOfferRecord() {
  throw new Error("LEGACY_FLOW_DISABLED");
}

export function moderateOfferAsAdmin() {
  throw new Error("LEGACY_FLOW_DISABLED");
}
