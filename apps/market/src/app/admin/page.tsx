import { unstable_noStore as noStore } from "next/cache";
import {
  adminCreateCatalogItemAction,
  adminCreateCatalogSectionAction,
  adminUpdateProjectPlatformAction,
  adminUpdateProjectPlatformServicesAction,
  adminUpdateProjectServiceAction,
  adminUpdateOrderStatusAction,
} from "@/app/actions";
import { requireAdminUser } from "@/lib/auth";
import { catalogFamilyLabels, catalogKindLabels } from "@/lib/constants";
import { getAdminDashboardData } from "@/lib/db";
import { formatCurrency, formatDateTime, formatOrderStatus } from "@/lib/utils";

export default async function AdminPage() {
  noStore();

  const admin = await requireAdminUser();
  const data = (await getAdminDashboardData());

  return (
    <div className="space-y-6">
      <a href="/manage/commerce" className="inline-block text-sm font-semibold text-green-700">Пополнения, выводы и сделки гаранта →</a>
      <section className="rounded-lg border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="text-sm font-semibold  text-green-100">Администратор</div>
        <h1 className="mt-2 text-3xl font-semibold">{admin.name}</h1>
        <div className="mt-2 text-green-100/90">{admin.email}</div>

        <div className="mt-8 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          {[
            { label: "Пользователи", value: data.counts.users },
            { label: "Каталог", value: data.counts.catalogItems },
            { label: "Офферы", value: data.counts.listings },
            { label: "Заказы", value: data.counts.orders },
            { label: "Чаты", value: data.counts.conversations },
            { label: "Операции", value: data.counts.walletTransactions },
            { label: "Тикеты", value: data.counts.tickets },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-white/12 bg-white/8 p-4">
              <div className="text-sm text-green-100/80">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold  text-slate-400">Проектные услуги</div>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">Настройки платформ и услуг</h2>
          </div>
          <div className="text-sm text-slate-500">Изменения сразу применяются в форме публикации.</div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div>
            <div className="mb-4 text-xl font-semibold text-slate-950">Платформы</div>
            <div className="grid gap-4">
              {data.projectSettings.platforms.map((platform) => (
                <form key={platform.id} action={adminUpdateProjectPlatformAction} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <input type="hidden" name="platformId" value={platform.id} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-semibold text-slate-950">{platform.id}</div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                      <input type="checkbox" name="enabled" value="true" defaultChecked={platform.enabled} />
                      Включена
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <input
                      name="label"
                      defaultValue={platform.label}
                      placeholder="Название"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300"
                    />
                    <input
                      name="sourcePlaceholder"
                      defaultValue={platform.sourcePlaceholder}
                      placeholder="Подсказка источника"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300"
                    />
                    <input
                      name="targetsLabel"
                      defaultValue={platform.targetsLabel}
                      placeholder="Название поля целей"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300"
                    />
                    <textarea
                      name="targetsPlaceholder"
                      defaultValue={platform.targetsPlaceholder}
                      rows={3}
                      placeholder="Подсказка списка целей"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300 lg:col-span-2"
                    />
                  </div>
                  <button type="submit" className="mt-4 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                    Сохранить платформу
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-4 text-xl font-semibold text-slate-950">Услуги</div>
            <div className="grid gap-4">
              {data.projectSettings.services.map((service) => (
                <form key={service.id} action={adminUpdateProjectServiceAction} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <input type="hidden" name="serviceId" value={service.id} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-semibold text-slate-950">{service.id}</div>
                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <input type="checkbox" name="enabled" value="true" defaultChecked={service.enabled} />
                        Включена
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <input type="checkbox" name="requiresMessage" value="true" defaultChecked={service.requiresMessage} />
                        Нужен текст
                      </label>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <input
                      name="label"
                      defaultValue={service.label}
                      placeholder="Название услуги"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300"
                    />
                    <input
                      name="titlePlaceholder"
                      defaultValue={service.titlePlaceholder}
                      placeholder="Подсказка заголовка"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300"
                    />
                    <textarea
                      name="descriptionPlaceholder"
                      defaultValue={service.descriptionPlaceholder}
                      rows={3}
                      placeholder="Подсказка описания"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300 lg:col-span-2"
                    />
                    <input
                      name="messageLabel"
                      defaultValue={service.messageLabel ?? ""}
                      placeholder="Название поля текста"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300"
                    />
                    <textarea
                      name="messagePlaceholder"
                      defaultValue={service.messagePlaceholder}
                      rows={3}
                      placeholder="Подсказка текста сообщения"
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-slate-300"
                    />
                  </div>
                  <button type="submit" className="mt-4 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                    Сохранить услугу
                  </button>
                </form>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-4 text-xl font-semibold text-slate-950">Доступность услуг по платформам</div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.projectSettings.platforms.map((platform) => {
              const enabledServices = new Set(
                data.projectSettings.platformServices
                  .filter((entry) => entry.platformId === platform.id && entry.enabled)
                  .map((entry) => entry.serviceId),
              );

              return (
                <form key={platform.id} action={adminUpdateProjectPlatformServicesAction} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <input type="hidden" name="platformId" value={platform.id} />
                  <div className="font-semibold text-slate-950">{platform.label}</div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {data.projectSettings.services.map((service) => (
                      <label key={service.id} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          name="services"
                          value={service.id}
                          defaultChecked={enabledServices.has(service.id)}
                        />
                        {service.label}
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="mt-4 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500">
                    Сохранить доступность
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="mb-5 text-2xl font-semibold text-slate-950">Управление заказами</div>
            <div className="space-y-4">
              {data.recentOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-lg font-semibold text-slate-950">
                        #{order.id.slice(0, 8).toUpperCase()} · {order.item.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {order.buyer.name} → {order.seller.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-950">{formatCurrency(order.amountRub)}</div>
                      <div className="mt-1 text-sm text-slate-400">{formatDateTime(order.createdAt)}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-500">{order.listing.title}</div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
                      {formatOrderStatus(order.status)}
                    </span>
                    <form action={adminUpdateOrderStatusAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <select
                        name="status"
                        defaultValue={order.status}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                      >
                        <option value="CLOSED">Закрыт</option>
                        <option value="REFUNDED">Возврат</option>
                        <option value="PENDING">Ожидает</option>
                        <option value="DISPUTED">Спор</option>
                      </select>
                      <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                        Обновить
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="mb-5 text-2xl font-semibold text-slate-950">Последние пользователи</div>
            <div className="space-y-3">
              {data.recentUsers.map((user) => (
                <div key={user.id} className="rounded-lg bg-slate-50 p-4">
                  <div className="font-semibold text-slate-950">{user.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{user.email}</div>
                  <div className="mt-2 text-sm text-slate-400">{formatDateTime(user.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <form action={adminCreateCatalogItemAction} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="text-2xl font-semibold text-slate-950">Добавить игру или сервис</div>
            <div className="mt-5 space-y-4">
              <input
                name="name"
                placeholder="Название"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
              />
              <select name="kind" defaultValue="GAME" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300">
                {Object.entries(catalogKindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select name="family" defaultValue="shooter" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300">
                {Object.entries(catalogFamilyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                name="description"
                rows={4}
                placeholder="Краткое описание раздела"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
              />
              <button type="submit" className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-500">
                Добавить в каталог
              </button>
            </div>
          </form>

          <form action={adminCreateCatalogSectionAction} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="text-2xl font-semibold text-slate-950">Добавить подкатегорию</div>
            <div className="mt-5 space-y-4">
              <select name="itemId" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300">
                {data.catalogItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                name="sectionName"
                placeholder="Например: Twitch Drops, Баланс, Рейды"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
              />
              <button type="submit" className="rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800">
                Добавить подкатегорию
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="mb-5 text-2xl font-semibold text-slate-950">Каталог</div>
            <div className="space-y-3">
              {data.catalogItems.slice(0, 14).map((item) => (
                <div key={item.id} className="rounded-lg bg-slate-50 p-4">
                  <div className="font-semibold text-slate-950">{item.name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {catalogKindLabels[item.kind]} · {item.sectionStats.length} подкатегорий · {item.listingCount} офферов
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="mb-5 text-2xl font-semibold text-slate-950">Поддержка</div>
            <div className="space-y-3">
              {data.tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-lg bg-slate-50 p-4">
                  <div className="font-semibold text-slate-950">{ticket.subject}</div>
                  <div className="mt-2 text-sm text-slate-500">{ticket.lastMessage}</div>
                  <div className="mt-2 text-sm text-slate-400">{formatDateTime(ticket.updatedAt)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
