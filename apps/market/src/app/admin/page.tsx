import { unstable_noStore as noStore } from "next/cache";
import {
  adminCreateCatalogItemAction,
  adminCreateCatalogSectionAction,
  adminUpdateCatalogAvailabilityAction,
  adminUpdateOrderStatusAction,
} from "@/app/actions";
import { requireAdminUser } from "@/lib/auth";
import { catalogFamilyLabels, catalogKindLabels } from "@/lib/constants";
import {marketArea} from '@/lib/market-area';
import { getAdminDashboardData } from "@/lib/db";
import { formatMarketPrice, formatDateTime, formatOrderStatus } from "@/lib/utils";

export default async function AdminPage({searchParams}:{searchParams:Promise<{catalog?:string}>}) {
  noStore();

  const admin = await requireAdminUser();
  const data = (await getAdminDashboardData());
  const {catalog}=await searchParams;
  const kinds=[...new Set(data.catalogItems.map(item=>catalogKindLabels[item.kind]??item.kind))].sort((a,b)=>a.localeCompare(b,'ru'));
  const families=[...new Set(data.catalogItems.map(item=>catalogFamilyLabels[item.family]??item.family))].sort((a,b)=>a.localeCompare(b,'ru'));
  const sectionNames=[...new Set(data.catalogItems.flatMap(item=>item.sections.map(section=>section.name)))].sort((a,b)=>a.localeCompare(b,'ru'));
  const notices:Record<string,string>={created:'Категория добавлена в выбранный раздел. Пользователи могут размещать в ней объявления.','section-created':'Подкатегория добавлена в выбранный раздел.',exists:'Категория с таким названием уже существует.',invalid:'Проверьте название, описание и раздел категории.',failed:'Не удалось сохранить категорию. Повторите попытку.'};

  return (
    <div className="space-y-6">
      {catalog==='availability-saved'&&<p role="status" className="border-b border-slate-200 pb-4 text-sm text-slate-700">Доступность сохранена. Изменения применены к каталогу и новым сделкам.</p>}
      {catalog&&notices[catalog]&&<p role={['created','section-created'].includes(catalog)?'status':'alert'} className="border-b border-slate-200 pb-4 text-sm text-slate-700">{notices[catalog]}</p>}
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-8">
        <h2 className="text-2xl font-semibold text-slate-950">Доступность категорий и подкатегорий</h2>
        <p className="mt-2 text-sm text-slate-600">Только созданный каталог. Отключение запрещает новые объявления и покупки, но сохраняет текущие заказы и чаты.</p>
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
          {(['accounts','services'] as const).map(area=><section key={area} className="min-w-0" aria-label={area==='accounts'?'Доступность аккаунтов':'Доступность услуг'}>
            <h3 className="mb-4 text-xl font-semibold">{area==='accounts'?'Аккаунты':'Услуги'}</h3>
            <div className="space-y-4">
              {data.catalogItems.filter(item=>item.sections.some(section=>marketArea(section)===area)).map(item=><form key={item.id} action={adminUpdateCatalogAvailabilityAction} className="min-w-0 rounded-lg border border-slate-200 p-4">
                <input type="hidden" name="itemId" value={item.id}/><input type="hidden" name="area" value={area}/>
                <h4 className="break-words text-lg font-semibold">{item.name}</h4>
                <label className="mt-3 flex items-center gap-2 font-medium"><input type="checkbox" name="enabled" value="true" defaultChecked={item.availability?.[area]!==false}/>Категория доступна</label>
                <fieldset className="mt-4 space-y-2"><legend className="mb-2 text-sm text-slate-500">Подкатегории</legend>
                  {item.sections.filter(section=>marketArea(section)===area).map(section=><label key={section.id} className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-sm"><input type="checkbox" name="sections" value={section.id} defaultChecked={section.enabled!==false} className="mt-0.5"/><span className="min-w-0 break-words">{section.name}</span></label>)}
                </fieldset>
                <button type="submit" className="mt-4 rounded-md bg-green-700 px-4 py-3 text-sm font-semibold text-white">Сохранить доступность</button>
              </form>)}
              {!data.catalogItems.some(item=>item.sections.some(section=>marketArea(section)===area))&&<p className="text-sm text-slate-500">Пока нет категорий в этом разделе. Добавьте их ниже.</p>}
            </div>
          </section>)}
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
                      <div className="text-lg font-semibold text-slate-950">{formatMarketPrice(order.amountUsdt)}</div>
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
            <h2 className="text-2xl font-semibold text-slate-950">Добавить категорию маркета</h2>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">Раздел маркета
                <select name="area" defaultValue="both" className="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-3">
                  <option value="accounts">Аккаунты</option><option value="services">Услуги</option><option value="both">Аккаунты и услуги</option>
                </select>
              </label>
              <input
                name="name" required minLength={2} maxLength={120} aria-label="Название категории маркета"
                placeholder="Название"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
              />
              <label className="block text-sm font-medium text-slate-700">Тип категории
                <input name="kind" required maxLength={80} list="catalog-kinds" placeholder="Введите или выберите" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3"/>
                <datalist id="catalog-kinds">{kinds.map(value=><option key={value} value={value}/>)}</datalist>
              </label>
              <label className="block text-sm font-medium text-slate-700">Группа
                <input name="family" required maxLength={80} list="catalog-families" placeholder="Введите или выберите" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3"/>
                <datalist id="catalog-families">{families.map(value=><option key={value} value={value}/>)}</datalist>
              </label>
              <p className="text-sm text-slate-500">Начните вводить, чтобы выбрать созданный вариант, или укажите новый.</p>
              <textarea
                name="description" maxLength={2000}
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
            {!data.catalogItems.length&&<p className="mt-3 text-sm text-slate-600">Сначала добавьте категорию маркета.</p>}
            <div className="mt-5 space-y-4">
              <select name="itemId" required disabled={!data.catalogItems.length} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300">
                {data.catalogItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                name="sectionName" required minLength={2} maxLength={120} aria-label="Название подкатегории"
                list="catalog-section-names"
                placeholder="Название подкатегории"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
              />
              <datalist id="catalog-section-names">{sectionNames.map(value=><option key={value} value={value}/>)}</datalist>
              <label className="block text-sm font-medium text-slate-700">Раздел для подкатегории
                <select name="area" defaultValue="services" className="mt-2 w-full rounded-md border border-slate-200 bg-white px-4 py-3">
                  <option value="accounts">Аккаунты</option><option value="services">Услуги</option>
                </select>
              </label>
              <button type="submit" disabled={!data.catalogItems.length} className="rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                Добавить подкатегорию
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
            <div className="mb-5 text-2xl font-semibold text-slate-950">Каталог</div>
            {!data.catalogItems.length&&<p className="text-sm text-slate-600">Категорий нет. Добавьте первую категорию через форму выше.</p>}
            <div className="space-y-3">
              {data.catalogItems.slice(0, 14).map((item) => (
                <div key={item.id} className="rounded-lg bg-slate-50 p-4">
                  <div className="font-semibold text-slate-950">{item.name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {catalogKindLabels[item.kind]??item.kind} · {item.sectionStats.length} подкатегорий · {item.listingCount} офферов
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
