import { unstable_noStore as noStore } from "next/cache";
import { requireMarketplaceUser } from "@/lib/auth";
import { listUserOrders } from "@/lib/db";
import { formatCurrency, formatDateTime, formatOrderStatus, getOrderStatusTone } from "@/lib/utils";

type PurchasesPageProps = {
  searchParams?: Promise<{
    orderId?: string;
    counterparty?: string;
    status?: string;
    item?: string;
  }>;
};

export default async function PurchasesPage({ searchParams }: PurchasesPageProps) {
  noStore();

  const user = await requireMarketplaceUser();
  const filters = (await searchParams) ?? {};
  const orders = (await listUserOrders(user.id, "purchases", filters));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
      <div className="mb-8">
        <div className="text-sm font-semibold  text-slate-400">Покупки</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">Мои покупки</h1>
      </div>

      <form action="/market/purchases" className="grid gap-3 border-b border-slate-200 pb-6 lg:grid-cols-[220px_220px_180px_1fr_140px]">
        <input
          name="orderId"
          defaultValue={filters.orderId}
          placeholder="Номер заказа"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
        />
        <input
          name="counterparty"
          defaultValue={filters.counterparty}
          placeholder="Продавец"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
        />
        <select
          name="status"
          defaultValue={filters.status ?? "ALL"}
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
        >
          <option value="ALL">Статус</option>
          <option value="CLOSED">Закрыт</option>
          <option value="REFUNDED">Возврат</option>
          <option value="PENDING">Ожидает</option>
          <option value="DISPUTED">Спор</option>
        </select>
        <input
          name="item"
          defaultValue={filters.item}
          placeholder="Игра или сервис"
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
        />
        <button type="submit" className="rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-500">
          Показать
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
        <div className="hidden grid-cols-[1.2fr_0.8fr_2.2fr_1.4fr_1fr_0.9fr] gap-4 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-500 lg:grid">
          <div>Дата</div>
          <div>Заказ</div>
          <div>Описание</div>
          <div>Продавец</div>
          <div>Статус</div>
          <div>Сумма</div>
        </div>

        <div className="divide-y divide-slate-200">
          {orders.map((order) => (
            <div
              key={order.id}
              className={`grid gap-4 px-4 py-5 sm:px-5 lg:grid-cols-[1.2fr_0.8fr_2.2fr_1.4fr_1fr_0.9fr] ${order.status === "REFUNDED" ? "bg-amber-50/60" : ""}`}
            >
              <div>
                <div className="mb-1 text-xs font-semibold  text-slate-400 lg:hidden">Дата</div>
                <div className="font-medium text-slate-950">{formatDateTime(order.createdAt)}</div>
                <div className="mt-1 text-sm text-slate-400">{order.item.name}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold  text-slate-400 lg:hidden">Заказ</div>
                <div className="font-semibold text-slate-800">#{order.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold  text-slate-400 lg:hidden">Описание</div>
                <div className="font-medium text-slate-900">{order.listing.title}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {order.section.name}, {order.item.name}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold  text-slate-400 lg:hidden">Продавец</div>
                <div className="font-semibold text-slate-900">{order.seller.name}</div>
                <div className="mt-1 text-sm text-slate-400">{order.seller.city ?? "онлайн"}</div>
              </div>
              <div className="flex items-center justify-between gap-3 lg:block">
                <div className="text-xs font-semibold  text-slate-400 lg:hidden">Статус</div>
                <div className={`font-semibold ${getOrderStatusTone(order.status)}`}>{formatOrderStatus(order.status)}</div>
              </div>
              <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
                <div className="text-xs font-semibold  text-slate-400 lg:hidden">Сумма</div>
                <div className="text-lg font-semibold text-slate-950 sm:text-xl">
                  {formatCurrency(order.amountRub, user.preferredCurrency)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
