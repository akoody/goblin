import { clsx, type ClassValue } from "clsx";
import type {
  ListingDeliveryType,
  OrderStatus,
  ProjectPlatform,
  ProjectServiceType,
  ProjectTaskStatus,
  SupportTicketStatus,
  UserRole,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/lib/db";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatUsdt(value: string, quantity = 1) {
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const scale = BigInt(1_000_000);
  const units = (BigInt(whole) * scale + BigInt(fraction.padEnd(6, "0"))) * BigInt(quantity);
  const decimals = String(units % scale).padStart(6, "0").replace(/0+$/, "");
  const integer = new Intl.NumberFormat("ru-RU").format(units / scale);
  return `${value.startsWith("-") ? "-" : ""}${integer}${decimals ? "," + decimals : ""} USDT`;
}

export function formatMarketPrice(usdt?: string) {
  return usdt === undefined ? "Цена недоступна" : formatUsdt(usdt);
}

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function formatRelativeTime(value: Date) {
  const diffMs = Date.now() - value.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    return "только что";
  }

  if (diffHours < 24) {
    return `${diffHours} ч назад`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays < 30) {
    return `${diffDays} дн назад`;
  }

  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths} мес назад`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatUserRole(role: UserRole) {
  switch (role) {
    case "CUSTOMER":
      return "Покупатель";
    case "SELLER":
      return "Продавец";
    case "BOTH":
      return "Покупатель и продавец";
    case "ADMIN":
      return "Администратор";
  }
}

export function formatOrderStatus(status: OrderStatus) {
  switch (status) {
    case "CLOSED":
      return "Закрыт";
    case "REFUNDED":
      return "Возврат";
    case "PENDING":
      return "Ожидает";
    case "DISPUTED":
      return "Спор";
  }
}

export function getOrderStatusTone(status: OrderStatus) {
  switch (status) {
    case "CLOSED":
      return "text-emerald-600";
    case "REFUNDED":
      return "text-amber-600";
    case "PENDING":
      return "text-sky-600";
    case "DISPUTED":
      return "text-rose-600";
  }
}

export function formatTransactionType(type: WalletTransactionType) {
  switch (type) {
    case "TOP_UP":
      return "Пополнение";
    case "WITHDRAWAL":
      return "Вывод";
    case "PURCHASE":
      return "Покупка";
    case "SALE":
      return "Продажа";
    case "REFUND":
      return "Возврат";
  }
}

export function formatTransactionStatus(status: WalletTransactionStatus) {
  switch (status) {
    case "COMPLETED":
      return "Завершено";
    case "PENDING":
      return "В обработке";
    case "CANCELLED":
      return "Отменено";
  }
}

export function formatDeliveryType(type: ListingDeliveryType) {
  return type === "AUTO" ? "Автовыдача" : "Ручная выдача";
}

export function formatTicketStatus(status: SupportTicketStatus) {
  switch (status) {
    case "OPEN":
      return "Открыт";
    case "ANSWERED":
      return "Ответ получен";
    case "CLOSED":
      return "Закрыт";
  }
}

export function formatProjectServiceType(type: ProjectServiceType) {
  switch (type) {
    case "SUBSCRIBE":
      return "Подписки / фолловеры";
    case "BROADCAST":
      return "Рассылка";
    case "COMMENTS":
      return "Комментарии";
    case "DIRECT":
      return "Рассылка в личные сообщения";
    case "VIEWS":
      return "Просмотры";
    case "LIKES":
      return "Лайки";
    case "REPOSTS":
      return "Репосты";
  }
}

export function formatProjectPlatform(platform: ProjectPlatform) {
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

export function formatProjectTaskStatus(status: ProjectTaskStatus) {
  switch (status) {
    case "OPEN":
      return "Открыта";
    case "IN_PROGRESS":
      return "В работе";
    case "COMPLETED":
      return "Завершена";
    case "CANCELLED":
      return "Отменена";
  }
}

export function getProjectTaskStatusTone(status: ProjectTaskStatus) {
  switch (status) {
    case "OPEN":
      return "text-sky-600";
    case "IN_PROGRESS":
      return "text-amber-600";
    case "COMPLETED":
      return "text-emerald-600";
    case "CANCELLED":
      return "text-slate-500";
  }
}
