import { unstable_noStore as noStore } from "next/cache";
import { requireMarketplaceUser } from "@/lib/auth";
import { getWalletOverview } from "@/lib/db";
import { WalletForms } from "@/components/wallet-forms";
import {
  formatCurrency,
  formatDateTime,
  formatSignedCurrency,
  formatTransactionStatus,
  formatTransactionType,
} from "@/lib/utils";

type WalletPageProps = {
  searchParams?: Promise<{
    status?: "ALL" | "COMPLETED" | "PENDING" | "CANCELLED";
  }>;
};

export default async function WalletPage({ searchParams }: WalletPageProps) {
  noStore();

  const user = await requireMarketplaceUser();
  const filters = (await searchParams) ?? {};
  const wallet = (await getWalletOverview(user.id, filters.status));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold  text-slate-400">Кошелёк</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">Финансы</h1>
            <div className="mt-4 text-2xl font-semibold text-slate-950 sm:text-3xl">
              {formatCurrency(wallet.availableRub, user.preferredCurrency)}
            </div>
          </div>

          <form action="/market/wallet" className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <select
              name="status"
              defaultValue={filters.status ?? "ALL"}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-300"
            >
              <option value="ALL">Все операции</option>
              <option value="COMPLETED">Завершено</option>
              <option value="PENDING">В обработке</option>
              <option value="CANCELLED">Отменено</option>
            </select>
            <button type="submit" className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-500">
              Показать
            </button>
          </form>
        </div>
      </section>

      <WalletForms preferredCurrency={user.preferredCurrency} />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
        <div className="hidden grid-cols-[1.2fr_2fr_1fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-500 md:grid">
          <div>Дата</div>
          <div>Описание</div>
          <div>Статус</div>
          <div className="text-right">Сумма</div>
        </div>
        <div className="divide-y divide-slate-200">
          {wallet.transactions.map((transaction) => (
            <div key={transaction.id} className="grid gap-4 px-4 py-5 sm:px-5 md:grid-cols-[1.2fr_2fr_1fr_1fr]">
              <div>
                <div className="mb-1 text-xs font-semibold  text-slate-400 md:hidden">Дата</div>
                <div className="font-medium text-slate-950">{formatDateTime(transaction.createdAt)}</div>
                <div className="mt-1 text-sm text-slate-400">{formatTransactionType(transaction.type)}</div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold  text-slate-400 md:hidden">Описание</div>
                <div className="text-slate-700">{transaction.description}</div>
              </div>
              <div className="flex items-center justify-between gap-3 md:block">
                <div className="text-xs font-semibold  text-slate-400 md:hidden">Статус</div>
                <div className="font-semibold text-slate-600">{formatTransactionStatus(transaction.status)}</div>
              </div>
              <div className="flex items-center justify-between gap-3 md:block md:text-right">
                <div className="text-xs font-semibold  text-slate-400 md:hidden">Сумма</div>
                <div className={`text-lg font-semibold ${transaction.amountRub >= 0 ? "text-emerald-600" : "text-slate-950"}`}>
                  {formatSignedCurrency(transaction.amountRub, user.preferredCurrency)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
