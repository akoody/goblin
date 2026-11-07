"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
};

type NavigationLinksProps = {
  items: NavItem[];
  mobile?: boolean;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavigationLinks({ items, mobile = false }: NavigationLinksProps) {
  const pathname = usePathname().replace(/^\/market(?=\/|$)/,'')||'/';

  return (
    <>
      {items.map((item) => {
        const isActive = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md border border-transparent px-4 py-2 text-sm transition",
              mobile
                ? "whitespace-nowrap border-white/10"
                : "",
              isActive
                ? "border-emerald-400/30 bg-emerald-400/12 font-medium text-emerald-200"
                : "text-slate-300 hover:border-white/20 hover:bg-white/5 hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
