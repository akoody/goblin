import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { logoutAction, updateCurrencyAction } from "@/app/actions";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileMenu } from "@/components/mobile-menu";
import { getCurrentUser } from "@/lib/auth";
import { supportedCurrencies } from "@/lib/constants";
import { isAdminUser } from "@/lib/admin";
import { getWalletOverview } from "@/lib/db";
import { formatCurrency, getCurrencyLabel, getInitials } from "@/lib/utils";

export async function SiteHeader() {
  noStore();

  const user = await getCurrentUser();
  const admin = isAdminUser(user);
  const wallet = user && !admin ? (await getWalletOverview(user.id)) : null;
  const currentCurrency = user?.preferredCurrency ?? "RUB";
  const userBalance = wallet ? formatCurrency(wallet.availableRub, currentCurrency) : null;

  const navItems = admin
    ? [
        { href: "/", label: "Библиотека" },
        { href: "/admin", label: "Админка" },
      ]
    : user
      ? [
          { href: "/projects", label: "Проекты" },
          { href: "/purchases", label: "Покупки" },
          { href: "/sales", label: "Продажи" },
          { href: "/chats", label: "Чаты" },
          { href: "/wallet", label: "Кошелёк" },
          { href: "/support", label: "Поддержка" },
        ]
      : [
          { href: "/", label: "Библиотека" },
          { href: "/support", label: "Поддержка" },
        ];

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/88 ">
        <div className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="font-(family-name:--font-space-grotesk) text-[1.5rem] font-bold text-slate-950 sm:text-[1.75rem]">
            Goblin
          </span>
          <span className="hidden rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 lg:inline-flex">
            market
          </span>
        </Link>
        <a href="/trade" className="text-sm font-semibold text-slate-500 hover:text-green-700">Биржа</a>

        <form action="/market" className="hidden min-w-0 flex-1 md:block">
          <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm shadow-slate-200/50">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="search"
              name="q"
              placeholder="Поиск по играм, сервисам и платформам"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>
        </form>

        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <MobileMenu
            admin={admin}
            user={
              user
                ? {
                    name: user.name,
                    preferredCurrency: user.preferredCurrency,
                    balanceLabel: userBalance,
                  }
                : null
            }
          />

          {user ? (
            <details className="relative hidden md:block">
              <summary className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 shadow-sm shadow-slate-200/60 hover:border-slate-300">
                {!admin && userBalance ? (
                  <span className="rounded-md bg-slate-200 px-2.5 py-1 text-sm font-semibold text-slate-700">
                    {userBalance}
                  </span>
                ) : null}
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-sm font-bold text-green-700">
                  {getInitials(user.name)}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </summary>

              <div className="absolute right-0 top-[calc(100%+12px)] z-20 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <div className="text-2xl font-semibold text-slate-950">{user.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{admin ? "Администратор" : "Личный кабинет"}</div>
                </div>

                <div className="px-5 py-3">
                  <Link href="/profile" className="block rounded-lg px-3 py-3 text-lg font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950">
                    Профиль
                  </Link>
                  <Link href="/settings" className="block rounded-lg px-3 py-3 text-lg font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950">
                    Настройки
                  </Link>
                </div>

                {!admin ? (
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="text-sm font-semibold  text-slate-400">Валюта</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {supportedCurrencies.map((currency) => (
                        <form key={currency.code} action={updateCurrencyAction}>
                          <input type="hidden" name="currency" value={currency.code} />
                          <input type="hidden" name="returnTo" value="/settings" />
                          <button
                            type="submit"
                            className={`rounded-md px-3 py-2 text-sm font-semibold ${
                              user.preferredCurrency === currency.code
                                ? "bg-slate-950 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {getCurrencyLabel(currency.code)}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-slate-100 px-5 py-4">
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left text-lg font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-950"
                    >
                      Выйти
                    </button>
                  </form>
                </div>
              </div>
            </details>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login" className="rounded-md px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-950">
                Войти
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-green-200 hover:bg-green-500"
              >
                Регистрация
              </Link>
            </div>
          )}
        </div>

        <form action="/market" className="w-full min-w-0 md:hidden">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm shadow-slate-200/50">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="search"
              name="q"
              placeholder="Поиск по библиотеке"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </label>
        </form>
        </div>
      </header>
      <MobileBottomNav admin={admin} authenticated={Boolean(user)} />
    </>
  );
}
