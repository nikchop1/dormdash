"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/cases", label: "Cases" },
  { href: "/admin/runners", label: "Runners" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/places", label: "Places" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/law-enforcement", label: "Legal log" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 pt-3">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center px-3 text-small font-semibold whitespace-nowrap transition-colors",
                  active ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {t.label}
                <span aria-hidden className={cn("absolute inset-x-3 -bottom-px h-[3px]", active ? "bg-accent" : "bg-transparent")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
