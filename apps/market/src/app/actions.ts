"use server";

import { revalidatePath } from "@/lib/market-navigation";
import { redirect } from "@/lib/market-navigation";
import { z } from "zod";
import { getAuthenticatedHomePath, isAdminEmail, verifyEnvAdminPassword } from "@/lib/admin";
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
  updateCatalogAvailabilityRecord,
  createListingRecord,
  createMessageRecord,
  acceptProjectRecord,
  completeProjectRecord,
  createProjectRecord,
  createPurchaseRecord,
  createSupportTicketRecord,
  createUser,
  findUserByEmail,
  getProjectServiceSetting,
  isProjectServiceAvailable,
  updateProjectPlatformServicesRecord,
  updateProjectPlatformSettingRecord,
  updateProjectProgressRecord,
  updateProjectServiceSettingRecord,
  updateOrderStatusAsAdmin,
} from "@/lib/db";
import { getCatalogSectionPath } from "@/lib/routes";
import { marketRpc } from '@/lib/market-rpc';

export type FormState = {
  error?: string;
  success?: string;
  challenge?: string;
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
  email: z.string().trim().min(1, "Введите логин или email.").max(254),
  password: z.string().min(1, "Введите пароль."),
});

const registerSchema = loginSchema.extend({
  email: z.string().trim().email("Укажи корректный email.").max(254),
  name: z.string().trim().min(2, "Имя должно быть не короче 2 символов."),
  password: z.string().min(10, "Пароль должен содержать минимум 10 символов.")
    .regex(/[A-Za-zА-Яа-я]/, "Добавьте буквы в пароль.").regex(/[0-9]/, "Добавьте цифры в пароль.")
    .refine(value=>Buffer.byteLength(value,'utf8')<=72,"Пароль слишком длинный: максимум 72 байта."),
});

const messageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1, "Сообщение не может быть пустым.").max(2000, "Сообщение слишком длинное."),
});

const supportSchema = z.object({
  subject: z.string().trim().min(6, "Тема должна быть не короче 6 символов."),
  text: z.string().trim().min(20, "Опиши запрос подробнее."),
});

const usdtInput = z.string().trim().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/, "Укажите сумму USDT, до 6 знаков после запятой.")
  .refine(value => Number(value)>0 && Number(value)<=10_000_000);

const listingSchema = z.object({
  itemSlug: z.string().trim().min(1),
  sectionId: z.string().trim().min(1),
  title: z.string().trim().min(10, "Краткое описание должно быть не короче 10 символов."),
  description: z.string().trim().min(30, "Подробное описание должно быть не короче 30 символов."),
  deliveryNote: z.string().trim().optional(),
  price: usdtInput,
  quantity: z.coerce.number().int().positive("Наличие должно быть больше нуля.").optional(),
  deliveryType: z.enum(["AUTO", "MANUAL"]),
  isActive: z.enum(["true"]).optional(),
});

const purchaseSchema = z.object({
  listingId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive("Количество должно быть больше нуля.").default(1),
  message: z.string().trim().max(1000, "Сообщение слишком длинное.").optional(),
  requestKey: z.uuid().optional(),
});

const projectSchema = z.object({
  platform: z.enum(["TELEGRAM", "YOUTUBE", "TIKTOK", "INSTAGRAM", "VK", "DISCORD", "TWITCH"]),
  serviceType: z.enum(["SUBSCRIBE", "BROADCAST", "COMMENTS", "DIRECT", "VIEWS", "LIKES", "REPOSTS"]),
  title: z.string().trim().min(10, "Название должно быть не короче 10 символов.").max(120, "Название слишком длинное."),
  description: z.string().trim().min(40, "Опиши задачу подробнее.").max(3000, "Описание слишком длинное."),
  messageText: z.string().trim().max(3000, "Текст сообщения слишком длинный.").optional(),
  targetSource: z.string().trim().min(3, "Укажи канал, чат или источник базы.").max(200, "Источник слишком длинный."),
  targets: z.string().trim().min(2, "Добавь хотя бы одну цель для отслеживания."),
  rewardPerTarget: usdtInput,
  requestKey: z.uuid().optional(),
});

export async function transferMarketUsdtAction(_: FormState, formData: FormData): Promise<FormState> {
  await requireMarketplaceUser();
  const parsed = z.object({
    amount: usdtInput,
    direction: z.enum(["TO_MARKET", "TO_EXCHANGE"]),
    requestKey: z.uuid(),
  }).safeParse(Object.fromEntries(formData));
  if(!parsed.success)return {error:"Укажите сумму USDT, до 6 знаков после запятой."};
  try{
    await marketRpc("transferMarketUsdt",[parsed.data]);
  }catch(error){
    const messages: Record<string,string> = {
      INSUFFICIENT_FUNDS:"Недостаточно доступных USDT.",
      WALLET_UNAVAILABLE:"Активный кошелёк USDT биржи не найден.",
      WALLET_BUSY:"Дождитесь завершения операции с кошельком USDT.",
      ACCOUNT_OPERATIONS_DISABLED:"Внутренние переводы для аккаунта недоступны.",
      TRANSFER_CONFLICT:"Этот запрос уже использован для другого перевода.",
    };
    return {error:messages[error instanceof Error?error.message:""]??"Не удалось подтвердить перевод. Повторите запрос."};
  }
  revalidatePath("/wallet");
  return {success:"Перевод выполнен."};
}

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
  name: z.string().trim().min(2, "Название должно быть не короче 2 символов.").max(120).regex(/[a-z0-9а-яё]/i),
  area: z.enum(['accounts','services','both']),
  kind: z.string().trim().min(1).max(80),
  family: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
});

const adminCatalogSectionSchema = z.object({
  itemId: z.string().min(1),
  sectionName: z.string().trim().min(2, "Название категории должно быть не короче 2 символов.").max(120).regex(/[a-z0-9а-яё]/i),
  area: z.enum(['accounts','services']),
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

export async function loginAction(previous: FormState, formData: FormData): Promise<FormState> {
  if(formData.get("cancelAuthenticator")==="1")return {};
  const challenge=previous.challenge;
  try {
    let result;
    if(challenge){
      const code=formData.get("code");
      if(typeof code!=="string"||!code.trim()||code.length>40)return {challenge,error:"Введите код Authenticator или резервный код."};
      result=await exchangeAuth("login",{challenge,code});
    }else{
      const parsed=parseState(loginSchema,formData);
      if(!parsed.success)return {error:parsed.error.issues[0]?.message};
      const identifier=parsed.data.email;
      result=await exchangeAuth("login",{username:identifier.includes("@")?identifier.toLowerCase():identifier,password:parsed.data.password});
    }
    if(result.requiresAuthenticator&&typeof result.challenge==="string")return {challenge:result.challenge};
    await createSession(result.access_token);
  } catch(error) {
    const failure=error as {status?:number;code?:string;message?:string};
    if(failure.code==="MFA_EXPIRED")return {error:failure.message};
    const errorMessage=failure.code==="MFA_INVALID"||failure.code==="MFA_RATE_LIMITED"||failure.status===429
      ? failure.message : failure.status===401 ? "Неверный логин/email или пароль." : "Вход временно недоступен. Попробуйте позже.";
    return {challenge,error:errorMessage};
  }
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
      priceRub: 0,
      priceUsdt: parsed.data.price,
      quantity: parsed.data.quantity,
      autoPayloads: String(formData.get('autoPayloads')||'').split('\n').map(s=>s.trim()).filter(Boolean),
      deliveryType: parsed.data.deliveryType,
      isActive: parsed.data.isActive === "true",
    }));
  } catch (error) {
    if (error instanceof Error && error.message === 'MARKET_SECTION_DISABLED') return {error:'Доступ к этому разделу отключён администратором.'};
    if(error instanceof Error&&['CATALOG_UNAVAILABLE','SECTION_NOT_FOUND','CATALOG_ITEM_NOT_FOUND'].includes(error.message))return {error:'Категория или подкатегория отключена. Выберите доступный раздел.'};
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
      requestKey: parsed.data.requestKey,
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
      rewardPerTargetRub: 0,
      rewardPerTargetUsdt: parsed.data.rewardPerTarget,
      requestKey: parsed.data.requestKey,
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
    redirect("/admin?catalog=invalid");
  }

  try {
    (await createCatalogItemRecord(parsed.data));
  } catch (error) {
    redirect(error instanceof Error&&error.message==='CATALOG_ITEM_EXISTS'?'/admin?catalog=exists':'/admin?catalog=failed');
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?catalog=created");
}

export async function adminCreateCatalogSectionAction(formData: FormData) {
  await requireAdminUser();
  const parsed = parseState(adminCatalogSectionSchema, formData);

  if (!parsed.success) {
    redirect("/admin?catalog=invalid");
  }

  try {
    (await createCatalogSectionRecord(parsed.data.itemId, parsed.data.sectionName, parsed.data.area));
  } catch (error) {
    redirect(error instanceof Error&&error.message==='SECTION_EXISTS'?'/admin?catalog=exists':'/admin?catalog=failed');
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?catalog=section-created");
}

export async function adminUpdateCatalogAvailabilityAction(formData:FormData){
 await requireAdminUser();
 const parsed=z.object({itemId:z.string().min(1).max(200),area:z.enum(['accounts','services']),sections:z.array(z.string().min(1).max(300)).max(1000),enabled:z.boolean()}).safeParse({itemId:formData.get('itemId'),area:formData.get('area'),sections:formData.getAll('sections'),enabled:formData.get('enabled')==='true'});
 if(!parsed.success)redirect('/admin?catalog=invalid');
 const {itemId,area,sections,enabled}=parsed.data;
 try{await updateCatalogAvailabilityRecord(itemId,area,sections,enabled);}catch{redirect('/admin?catalog=failed');}
 revalidatePath('/');revalidatePath('/admin');revalidatePath('/catalog');
 redirect('/admin?catalog=availability-saved');
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
