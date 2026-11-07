"use server";

import { revalidatePath } from "@/lib/market-navigation";
import { redirect } from "@/lib/market-navigation";
import { z } from "zod";
import { ENV_ADMIN_ID, getAuthenticatedHomePath, isAdminEmail, verifyEnvAdminPassword } from "@/lib/admin";
import {
  clearSession,
  createSession,
  exchangeAuth,
  requireAdminUser,
  requireMarketplaceUser,
  requireUser,
} from "@/lib/auth";
import {
  createCatalogItemRecord,
  createCatalogSectionRecord,
  createListingRecord,
  createMessageRecord,
  acceptProjectRecord,
  completeProjectRecord,
  createProjectRecord,
  createPurchaseRecord,
  createSupportTicketRecord,
  createUser,
  createWalletTransactionRecord,
  findUserByEmail,
  getProjectServiceSetting,
  isProjectServiceAvailable,
  updateProjectPlatformServicesRecord,
  updateProjectPlatformSettingRecord,
  updateProjectProgressRecord,
  updateProjectServiceSettingRecord,
  updateOrderStatusAsAdmin,
  updateUserCurrency,
} from "@/lib/db";
import { getCatalogSectionPath } from "@/lib/routes";
import { convertCurrencyToRub } from "@/lib/utils";
import { marketRpc } from '@/lib/market-rpc';

export type FormState = {
  error?: string;
  success?: string;
};

const initialState: FormState = {};
export async function settleMarketOrderAction(formData:FormData) {
  await requireUser();
  const orderId=String(formData.get('orderId')||''),status=String(formData.get('status')||'');
  const result=await marketRpc('settleOrder',[orderId,status]);
  revalidatePath('/purchases');revalidatePath('/chats');revalidatePath('/wallet');
  redirect(`/chats/${result.conversationId}`);
}

const loginSchema = z.object({
  email: z.string().trim().email("Укажи корректный email."),
  password: z.string().min(1, "Введите пароль."),
});

const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2, "Имя должно быть не короче 2 символов."),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов."),
});

const messageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1, "Сообщение не может быть пустым.").max(2000, "Сообщение слишком длинное."),
});

const currencySchema = z.object({
  currency: z.enum(["RUB", "USD", "EUR"]),
  returnTo: z.string().trim().min(1).default("/settings"),
});

const walletSchema = z.object({
  amount: z.coerce.number().positive("Сумма должна быть больше нуля."),
  currency: z.enum(["RUB", "USD", "EUR"]),
  details: z.string().trim().max(800).optional(),
});

const cryptoWalletSchema = walletSchema.extend({
  asset: z.enum(["USDT", "BTC", "ETH", "TON"]),
  network: z.string().trim().min(2, "Укажи сеть перевода."),
  txHash: z.string().trim().min(8, "Укажи hash транзакции."),
});

const supportSchema = z.object({
  subject: z.string().trim().min(6, "Тема должна быть не короче 6 символов."),
  text: z.string().trim().min(20, "Опиши запрос подробнее."),
});

const listingSchema = z.object({
  itemSlug: z.string().trim().min(1),
  sectionId: z.string().trim().min(1),
  title: z.string().trim().min(10, "Краткое описание должно быть не короче 10 символов."),
  description: z.string().trim().min(30, "Подробное описание должно быть не короче 30 символов."),
  deliveryNote: z.string().trim().optional(),
  price: z.coerce.number().positive("Цена должна быть больше нуля."),
  currency: z.enum(["RUB", "USD", "EUR"]),
  quantity: z.coerce.number().int().positive("Наличие должно быть больше нуля.").optional(),
  deliveryType: z.enum(["AUTO", "MANUAL"]),
  isActive: z.enum(["true"]).optional(),
});

const purchaseSchema = z.object({
  listingId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive("Количество должно быть больше нуля.").default(1),
  message: z.string().trim().max(1000, "Сообщение слишком длинное.").optional(),
});

const projectSchema = z.object({
  platform: z.enum(["TELEGRAM", "YOUTUBE", "TIKTOK", "INSTAGRAM", "VK", "DISCORD", "TWITCH"]),
  serviceType: z.enum(["SUBSCRIBE", "BROADCAST", "COMMENTS", "DIRECT", "VIEWS", "LIKES", "REPOSTS"]),
  title: z.string().trim().min(10, "Название должно быть не короче 10 символов.").max(120, "Название слишком длинное."),
  description: z.string().trim().min(40, "Опиши задачу подробнее.").max(3000, "Описание слишком длинное."),
  messageText: z.string().trim().max(3000, "Текст сообщения слишком длинный.").optional(),
  targetSource: z.string().trim().min(3, "Укажи канал, чат или источник базы.").max(200, "Источник слишком длинный."),
  targets: z.string().trim().min(2, "Добавь хотя бы одну цель для отслеживания."),
  rewardPerTarget: z.coerce.number().positive("Оплата за цель должна быть больше нуля."),
  currency: z.enum(["RUB", "USD", "EUR"]),
});

const projectIdSchema = z.object({
  projectId: z.string().trim().min(1),
});

const projectProgressSchema = projectIdSchema.extend({
  completedCount: z.coerce.number().int().min(0, "Прогресс не может быть отрицательным."),
});

const adminOrderSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["CLOSED", "REFUNDED", "PENDING", "DISPUTED"]),
});

const adminCatalogItemSchema = z.object({
  name: z.string().trim().min(2, "Название должно быть не короче 2 символов."),
  kind: z.enum(["GAME", "SERVICE", "PLATFORM"]),
  family: z.enum([
    "ai",
    "subscription",
    "software",
    "platform",
    "social",
    "shooter",
    "mmorpg",
    "mobile",
    "sports",
    "sandbox",
    "strategy",
  ]),
  description: z.string().trim().optional(),
});

const adminCatalogSectionSchema = z.object({
  itemId: z.string().min(1),
  sectionName: z.string().trim().min(2, "Название категории должно быть не короче 2 символов."),
});

const projectPlatformIdSchema = z.enum(["TELEGRAM", "YOUTUBE", "TIKTOK", "INSTAGRAM", "VK", "DISCORD", "TWITCH"]);
const projectServiceIdSchema = z.enum(["SUBSCRIBE", "BROADCAST", "COMMENTS", "DIRECT", "VIEWS", "LIKES", "REPOSTS"]);

const adminProjectPlatformSchema = z.object({
  platformId: projectPlatformIdSchema,
  label: z.string().trim().min(2, "Название платформы слишком короткое."),
  sourcePlaceholder: z.string().trim().min(3, "Подсказка источника слишком короткая."),
  targetsLabel: z.string().trim().min(3, "Название поля целей слишком короткое."),
  targetsPlaceholder: z.string().trim().min(3, "Подсказка целей слишком короткая."),
  enabled: z.enum(["true"]).optional(),
});

const adminProjectServiceSchema = z.object({
  serviceId: projectServiceIdSchema,
  label: z.string().trim().min(2, "Название услуги слишком короткое."),
  titlePlaceholder: z.string().trim().min(2, "Подсказка заголовка слишком короткая."),
  descriptionPlaceholder: z.string().trim().min(10, "Подсказка описания слишком короткая."),
  messageLabel: z.string().trim().optional(),
  messagePlaceholder: z.string().trim().optional(),
  enabled: z.enum(["true"]).optional(),
  requiresMessage: z.enum(["true"]).optional(),
});

const adminProjectPlatformServicesSchema = z.object({
  platformId: projectPlatformIdSchema,
});

function parseState<T>(schema: z.ZodType<T>, formData: FormData) {
  const payload = Object.fromEntries(formData.entries());
  return schema.safeParse(payload);
}

function parseTargets(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseState(loginSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try {
    const result=await exchangeAuth('login',{username:parsed.data.email.toLowerCase(),password:parsed.data.password});
    await createSession(result.access_token);
  } catch { return {error:'Неверный email или пароль, либо вход временно недоступен.'}; }
  redirect('/');
}

export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseState(registerSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const email = parsed.data.email.toLowerCase();

  try {
    await exchangeAuth('register',{username:parsed.data.name,email,password:parsed.data.password});
    const result=await exchangeAuth('login',{username:email,password:parsed.data.password});
    await createSession(result.access_token);
  } catch(error){return {error:error instanceof Error?error.message:'Регистрация временно недоступна.'};}
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/logout");
}

export async function sendMessageAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(messageSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try {
    (await createMessageRecord(user.id, parsed.data.conversationId, parsed.data.text));
  } catch {
    return { error: "Чат не найден." };
  }

  revalidatePath("/chats");
  revalidatePath(`/chats/${parsed.data.conversationId}`);
  return initialState;
}

export async function updateCurrencyAction(formData: FormData) {
  const user = await requireUser();
  const parsed = parseState(currencySchema, formData);

  if (!parsed.success) {
    redirect("/settings");
  }

  if (user.id !== ENV_ADMIN_ID) {
    (await updateUserCurrency(user.id, parsed.data.currency));
  }

  revalidatePath("/");
  revalidatePath("/wallet");
  revalidatePath("/profile");
  revalidatePath("/settings");
  redirect(parsed.data.returnTo);
}

export async function topUpWalletAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(walletSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try { (await createWalletTransactionRecord(user.id, {
    type: "TOP_UP",
    amountRub: convertCurrencyToRub(parsed.data.amount, parsed.data.currency),
    description: "Пополнение баланса вручную",
  })); } catch {return {error:'Не удалось создать заявку. Проверьте сумму и доступность пополнения.'};}

  revalidatePath("/wallet");
  revalidatePath("/");
  return { success: "Заявка на пополнение отправлена. Средства появятся после проверки платежа администратором." };
}

export async function cryptoTopUpWalletAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(cryptoWalletSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try { (await createWalletTransactionRecord(user.id, {
    type: "TOP_UP",
    amountRub: convertCurrencyToRub(parsed.data.amount, parsed.data.currency),
    description: `Пополнение криптой ${parsed.data.asset} · ${parsed.data.network} · tx ${parsed.data.txHash.slice(0, 12)}`,
  })); } catch {return {error:'Не удалось создать заявку. Проверьте сведения о платеже.'};}

  revalidatePath("/wallet");
  revalidatePath("/profile");
  revalidatePath("/");
  return { success: "Заявка отправлена на проверку платежа." };
}

export async function withdrawWalletAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(walletSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try {
    (await createWalletTransactionRecord(user.id, {
      type: "WITHDRAWAL",
      amountRub: convertCurrencyToRub(parsed.data.amount, parsed.data.currency),
      description: `Вывод средств: ${parsed.data.details||'реквизиты уточнить у пользователя'}`,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
      return { error: "Недостаточно средств для вывода." };
    }

    return {error:'Не удалось создать вывод. Проверьте остаток, реквизиты и доступность операции.'};
  }

  revalidatePath("/wallet");
  revalidatePath("/");
  return { success: "Заявка на вывод создана." };
}

export async function createSupportTicketAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parseState(supportSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  (await createSupportTicketRecord(user.id, parsed.data.subject, parsed.data.text));
  revalidatePath("/support");
  return { success: "Запрос отправлен в поддержку." };
}

export async function createListingAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(listingSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  let result: { itemSlug: string; sectionId: string };

  try {
    result = (await createListingRecord(user.id, {
      itemSlug: parsed.data.itemSlug,
      sectionId: parsed.data.sectionId,
      title: parsed.data.title,
      description: parsed.data.description,
      deliveryNote: parsed.data.deliveryNote,
      priceRub: convertCurrencyToRub(parsed.data.price, parsed.data.currency),
      quantity: parsed.data.quantity,
      autoPayloads: String(formData.get('autoPayloads')||'').split('\n').map(s=>s.trim()).filter(Boolean),
      deliveryType: parsed.data.deliveryType,
      isActive: parsed.data.isActive === "true",
    }));
  } catch (error) {
    if (error instanceof Error && error.message === 'MARKET_SECTION_DISABLED') return {error:'Доступ к этому разделу отключён администратором.'};
    return { error: "Не удалось сохранить предложение. Проверь раздел и повтори попытку." };
  }

  revalidatePath("/");
  revalidatePath(`/catalog/${result.itemSlug}`);
  revalidatePath("/profile");
  redirect(getCatalogSectionPath(result.itemSlug, result.sectionId));
}

export async function createPurchaseAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(purchaseSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  let result: { conversationId: string };

  try {
    result = (await createPurchaseRecord(user.id, {
      listingId: parsed.data.listingId,
      quantity: parsed.data.quantity,
      message: parsed.data.message,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "SELF_PURCHASE") {
      return { error: "Нельзя купить собственное предложение." };
    }
    if (error instanceof Error && error.message === 'MARKET_SECTION_DISABLED') return {error:'Покупка в этом разделе отключена для участника сделки. Обратитесь в поддержку.'};

    return { error: "Не удалось оформить заказ. Проверь предложение и повтори попытку." };
  }

  revalidatePath("/purchases");
  revalidatePath("/sales");
  revalidatePath("/wallet");
  revalidatePath("/chats");
  redirect(`/chats/${result.conversationId}`);
}

export async function createProjectAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(projectSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const targets = parseTargets(parsed.data.targets);
  const messageText = parsed.data.messageText?.trim() ?? "";

  if (!targets.length) {
    return { error: "Добавь хотя бы одну ссылку, канал, чат или username для отслеживания." };
  }

  if (!(await isProjectServiceAvailable(parsed.data.platform, parsed.data.serviceType))) {
    return { error: "Эта услуга недоступна для выбранной платформы." };
  }

  const serviceSetting = (await getProjectServiceSetting(parsed.data.serviceType));

  if (serviceSetting?.requiresMessage && messageText.length < 5) {
    return { error: "Для этой услуги нужно указать текст сообщения или комментария." };
  }

  let projectId: string;

  try {
    const project = (await createProjectRecord(user.id, {
      platform: parsed.data.platform,
      serviceType: parsed.data.serviceType,
      title: parsed.data.title,
      description: parsed.data.description,
      messageText: serviceSetting?.requiresMessage ? messageText : null,
      targetSource: parsed.data.targetSource,
      targets,
      rewardPerTargetRub: convertCurrencyToRub(parsed.data.rewardPerTarget, parsed.data.currency),
    }));
    projectId = project.id;
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
      return { error: "Недостаточно средств. Пополни баланс криптой в профиле или кошельке." };
    }

    return { error: "Не удалось разместить объявление. Проверь данные и повтори попытку." };
  }

  revalidatePath("/projects");
  revalidatePath("/wallet");
  revalidatePath("/profile");
  redirect(`/projects/${projectId}`);
}

export async function acceptProjectAction(formData: FormData) {
  const user = await requireMarketplaceUser();
  const parsed = parseState(projectIdSchema, formData);

  if (!parsed.success) {
    redirect("/projects");
  }

  let conversationId: string;

  try {
    const result = (await acceptProjectRecord(user.id, parsed.data.projectId));
    conversationId = result.conversationId;
  } catch {
    redirect(`/projects/${parsed.data.projectId}`);
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/chats");
  redirect(`/chats/${conversationId}`);
}

export async function updateProjectProgressAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(projectProgressSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try {
    (await updateProjectProgressRecord(user.id, parsed.data.projectId, parsed.data.completedCount));
  } catch {
    return { error: "Не удалось обновить прогресс по задаче." };
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/chats");
  return { success: "Прогресс обновлён." };
}

export async function completeProjectAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireMarketplaceUser();
  const parsed = parseState(projectIdSchema, formData);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  try {
    (await completeProjectRecord(user.id, parsed.data.projectId));
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_PROGRESS_INCOMPLETE") {
      return { error: "Нельзя завершить задачу, пока прогресс меньше 100%." };
    }

    return { error: "Не удалось завершить задачу." };
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/wallet");
  revalidatePath("/sales");
  revalidatePath("/purchases");
  revalidatePath("/chats");
  return { success: "Задача завершена, выплата отправлена исполнителю." };
}

export async function adminUpdateOrderStatusAction(formData: FormData) {
  await requireAdminUser();
  const parsed = parseState(adminOrderSchema, formData);

  if (!parsed.success) {
    redirect("/admin");
  }

  (await updateOrderStatusAsAdmin(parsed.data.orderId, parsed.data.status));
  revalidatePath("/admin");
  revalidatePath("/purchases");
  revalidatePath("/sales");
  revalidatePath("/wallet");
  redirect("/admin");
}

export async function adminCreateCatalogItemAction(formData: FormData) {
  await requireAdminUser();
  const parsed = parseState(adminCatalogItemSchema, formData);

  if (!parsed.success) {
    redirect("/admin");
  }

  try {
    (await createCatalogItemRecord(parsed.data));
  } catch {
    redirect("/admin");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function adminCreateCatalogSectionAction(formData: FormData) {
  await requireAdminUser();
  const parsed = parseState(adminCatalogSectionSchema, formData);

  if (!parsed.success) {
    redirect("/admin");
  }

  try {
    (await createCatalogSectionRecord(parsed.data.itemId, parsed.data.sectionName));
  } catch {
    redirect("/admin");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function adminUpdateProjectPlatformAction(formData: FormData) {
  await requireAdminUser();
  const parsed = parseState(adminProjectPlatformSchema, formData);

  if (!parsed.success) {
    redirect("/admin");
  }

  (await updateProjectPlatformSettingRecord(parsed.data.platformId, {
    label: parsed.data.label,
    sourcePlaceholder: parsed.data.sourcePlaceholder,
    targetsLabel: parsed.data.targetsLabel,
    targetsPlaceholder: parsed.data.targetsPlaceholder,
    enabled: parsed.data.enabled === "true",
  }));

  revalidatePath("/admin");
  revalidatePath("/projects");
  redirect("/admin");
}

export async function adminUpdateProjectServiceAction(formData: FormData) {
  await requireAdminUser();
  const parsed = parseState(adminProjectServiceSchema, formData);

  if (!parsed.success) {
    redirect("/admin");
  }

  (await updateProjectServiceSettingRecord(parsed.data.serviceId, {
    label: parsed.data.label,
    titlePlaceholder: parsed.data.titlePlaceholder,
    descriptionPlaceholder: parsed.data.descriptionPlaceholder,
    messageLabel: parsed.data.messageLabel?.trim() || null,
    messagePlaceholder: parsed.data.messagePlaceholder?.trim() || "",
    enabled: parsed.data.enabled === "true",
    requiresMessage: parsed.data.requiresMessage === "true",
  }));

  revalidatePath("/admin");
  revalidatePath("/projects");
  redirect("/admin");
}

export async function adminUpdateProjectPlatformServicesAction(formData: FormData) {
  await requireAdminUser();
  const parsed = parseState(adminProjectPlatformServicesSchema, formData);

  if (!parsed.success) {
    redirect("/admin");
  }

  const serviceIds = formData.getAll("services").filter((value): value is string => typeof value === "string");
  const parsedServiceIds = z.array(projectServiceIdSchema).safeParse(serviceIds);

  if (!parsedServiceIds.success) {
    redirect("/admin");
  }

  (await updateProjectPlatformServicesRecord(parsed.data.platformId, parsedServiceIds.data));

  revalidatePath("/admin");
  revalidatePath("/projects");
  redirect("/admin");
}

export async function createOfferAction(state: FormState, formData: FormData): Promise<FormState> {
  void state;
  void formData;
  return { error: "Старый сценарий офферов отключён." };
}

export async function acceptOfferAction() {
  redirect("/");
}

export async function adminModerateOfferAction() {
  redirect("/admin");
}
