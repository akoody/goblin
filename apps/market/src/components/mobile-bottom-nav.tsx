"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, Home, LogIn, Megaphone, MessageCircle, PanelTop, ShoppingBag, UserPlus, Wallet } from "lucide-react";

type MobileBottomNavProps = {
  admin?: boolean;
  authenticated: boolean;
};

export function MobileBottomNav({ admin = false, authenticated }: MobileBottomNavProps) {
  const pathname = usePathname().replace(/^\/market(?=\/|$)/,'')||'/';

  const navItems = admin
    ? [
        { href: "/", label: "Каталог", icon: Home },
        { href: "/admin", label: "Админка", icon: PanelTop },
      ]
    : authenticated
      ? [
          { href: "/", label: "Каталог", icon: Home },
          { href: "/projects", label: "Проекты", icon: Megaphone },
          { href: "/purchases", label: "Покупки", icon: ShoppingBag },
          { href: "/chats", label: "Чаты", icon: MessageCircle },
          { href: "/wallet", label: "Кошелёк", icon: Wallet },
        ]
      : [
          { href: "/", label: "Каталог", icon: Home },
          { href: "/login", label: "Войти", icon: LogIn },
          { href: "/register", label: "Регистрация", icon: UserPlus },
          { href: "/support", label: "Помощь", icon: HelpCircle },
        ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-sm backdrop-blur md:hidden"
      aria-label="Мобильная навигация"
    >
      <div className="mx-auto grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/catalog") : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-xs font-semibold ${
                active ? "bg-slate-950 text-white" : "text-slate-500"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
