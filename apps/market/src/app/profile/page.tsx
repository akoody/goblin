import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getAdminDashboardData, getUserProfileData } from "@/lib/db";
import {
  formatCurrency,
  formatDate,
  formatOrderStatus,
  formatUserRole,
  getInitials,
} from "@/lib/utils";

export default async function ProfilePage() {
  noStore();

  const user = await requireUser();

  if (isAdminUser(user)) {
    const adminData = (await getAdminDashboardData());

    return (
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span className="inline-flex h-20 w-20 items-center justify-center rounded-md bg-emerald-50 text-2xl font-bold text-green-700 sm:h-24 sm:w-24 sm:text-3xl">
                {getInitials(user.name)}
              </span>
              <div>
                <div className="text-sm font-semibold  text-slate-400">Профиль</div>
                <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-3xl">{user.name}</h1>
                <div className="mt-2 text-slate-500">{user.email}</div>
              </div>
            </div>
            <Link href="/admin" className="rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-500">
              Открыть админку
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Пользователи", value: adminData.counts.users },
            { label: "Каталог", value: adminData.counts.catalogItems },
            { label: "Заказы", value: adminData.counts.orders },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
              <div className="text-sm text-slate-500">{item.label}</div>
              <div className="mt-2 text-3xl font-semibold text-slate-950">{item.value}</div>
            </div>
          ))}
        </section>
      </div>
    );
  }

  const profile = (await getUserProfileData(user.id));

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-md bg-emerald-50 text-2xl font-bold text-green-700 sm:h-24 sm:w-24 sm:text-3xl">
            {getInitials(profile.user.name)}
          </span>
          <div className="mt-5 inline-flex rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold  text-slate-500">
            {formatUserRole(profile.user.role)}
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-slate-950 sm:text-3xl">{profile.user.name}</h1>
          <div className="mt-3 text-slate-500">{profile.user.email}</div>
          <div className="mt-1 text-slate-400">{profile.user.city ?? "Локация не указана"}</div>
          <div className="mt-6 rounded-lg bg-slate-50 p-5 text-sm leading-7 text-slate-500">
            {profile.user.bio ?? "Профиль ещё не заполнен."}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { label: "Покупки", value: profile.stats.purchases },
              { label: "Продажи", value: profile.stats.sales },
              { label: "Чаты", value: profile.stats.chats },
              { label: "Проекты", value: profile.stats.activeProjects },
              { label: "Офферы", value: profile.stats.activeListings },
              { label: "Оборот", value: formatCurrency(profile.stats.totalTurnoverRub, profile.user.preferredCurrency) },
              { label: "На сайте", value: formatDate(profile.user.createdAt) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-slate-50 p-4">
                <div className="text-sm text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
            <Link href="/purchases" className="rounded-lg bg-green-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-green-500">
              Открыть покупки
            </Link>
            <Link href="/sales" className="rounded-lg border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Открыть продажи
            </Link>
            <Link href="/projects" className="rounded-lg border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Telegram-проекты
            </Link>
            <Link href="/wallet" className="rounded-lg border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Пополнить криптой
            </Link>
            <Link href="/settings" className="rounded-lg border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Настройки
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
          <div className="mb-5 text-2xl font-semibold text-slate-950">Последние покупки</div>
          <div className="space-y-3">
            {profile.recentPurchases.map((order) => (
              <div key={order.id} className="rounded-lg bg-slate-50 p-4">
                <div className="font-semibold text-slate-950">{order.item.name}</div>
                <div className="mt-1 text-sm text-slate-500">{order.listing.title}</div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-400">{formatOrderStatus(order.status)}</span>
                  <span className="font-semibold text-slate-950">
                    {formatCurrency(order.amountRub, profile.user.preferredCurrency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
          <div className="mb-5 text-2xl font-semibold text-slate-950">Последние продажи</div>
          <div className="space-y-3">
            {profile.recentSales.map((order) => (
              <div key={order.id} className="rounded-lg bg-slate-50 p-4">
                <div className="font-semibold text-slate-950">{order.item.name}</div>
                <div className="mt-1 text-sm text-slate-500">{order.listing.title}</div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-400">{formatOrderStatus(order.status)}</span>
                  <span className="font-semibold text-slate-950">
                    {formatCurrency(order.amountRub, profile.user.preferredCurrency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60">
          <div className="mb-5 text-2xl font-semibold text-slate-950">Поддержка</div>
          <div className="space-y-3">
            {profile.tickets.map((ticket) => (
              <Link key={ticket.id} href="/support" className="block rounded-lg bg-slate-50 p-4 hover:bg-slate-100">
                <div className="font-semibold text-slate-950">{ticket.subject}</div>
                <div className="mt-2 text-sm leading-6 text-slate-500">{ticket.lastMessage}</div>
                <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-green-700">
                  Открыть поддержку
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
