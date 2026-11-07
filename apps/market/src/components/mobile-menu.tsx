"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { logoutAction, updateCurrencyAction } from "@/app/actions";
import { supportedCurrencies } from "@/lib/constants";
import { getCurrencyLabel } from "@/lib/utils";

type MobileMenuProps = {
  admin?: boolean;
  user:
    | {
        name: string;
        preferredCurrency: string;
        balanceLabel: string | null;
      }
    | null;
};

export function MobileMenu({ admin = false, user }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const navItems = admin
    ? [
        { href: "/", label: "Библиотека" },
        { href: "/admin", label: "Админка" },
        { href: "/profile", label: "Профиль" },
      ]
    : user
      ? [
          { href: "/", label: "Библиотека" },
          { href: "/profile", label: "Профиль" },
          { href: "/projects", label: "Проекты" },
          { href: "/purchases", label: "Покупки" },
          { href: "/sales", label: "Продажи" },
          { href: "/chats", label: "Чаты" },
          { href: "/wallet", label: "Кошелёк" },
          { href: "/support", label: "Поддержка" },
          { href: "/settings", label: "Настройки" },
        ]
      : [
          { href: "/", label: "Библиотека" },
          { href: "/support", label: "Поддержка" },
          { href: "/login", label: "Войти" },
          { href: "/register", label: "Регистрация" },
        ];

  const portal =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[100] md:hidden">
            <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} aria-label="Закрыть меню" />
            <div className="absolute inset-x-3 top-3 max-h-[calc(100vh-24px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-(family-name:--font-space-grotesk) text-2xl font-bold text-slate-950">
                    Goblin
                  </div>
                  <div className="text-sm text-slate-500">Навигация</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 text-slate-600"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form action="/market" className="mt-5">
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    type="search"
                    name="q"
                    placeholder="Поиск по библиотеке"
                    className="w-full bg-transparent outline-none placeholder:text-slate-400"
                  />
                </label>
              </form>

              {user ? (
                <div className="mt-5 rounded-lg bg-slate-50 p-4">
                  <div className="text-xl font-semibold text-slate-950">{user.name}</div>
                  {user.balanceLabel ? <div className="mt-1 text-sm text-slate-500">Баланс: {user.balanceLabel}</div> : null}
                </div>
              ) : null}

              <nav className="mt-5 space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-4 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {user ? (
                <div className="mt-5 rounded-lg border border-slate-200 p-4">
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
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {getCurrencyLabel(currency.code)}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              ) : null}

              {user ? (
                <form action={logoutAction} className="mt-5">
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left text-base font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  >
                    Выйти
                  </button>
                </form>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 md:hidden"
        aria-label="Открыть меню"
      >
        <Menu className="h-5 w-5" />
      </button>
      {portal}
    </>
  );
}
