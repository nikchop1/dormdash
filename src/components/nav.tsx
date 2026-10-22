"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CircleUser, Footprints, House, Receipt, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { LogoMark, Wordmark } from "./brand";
import { LogoutButton } from "./account-controls";

const ITEMS = [
  { href: "/home", label: "Home", icon: House },
  { href: "/orders", label: "Orders", icon: Receipt },
  { href: "/run", label: "Run", icon: Footprints },
  { href: "/profile", label: "Profile", icon: CircleUser },
];

function useItems(isAdmin: boolean) {
  return isAdmin ? [...ITEMS, { href: "/admin", label: "Admin", icon: ShieldCheck }] : ITEMS;
}

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items = useItems(isAdmin);
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper md:hidden">
      <ul className="flex">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-caption font-semibold transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ink",
                  active ? "text-ink" : "text-ink-3 hover:text-ink-2",
                )}
              >
                <span aria-hidden className={cn("absolute top-0 h-[3px] w-10 transition-colors duration-200", active ? "bg-accent" : "bg-transparent")} />
                <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ isAdmin, unread }: { isAdmin: boolean; unread: number }) {
  const path = usePathname();
  const items = useItems(isAdmin);
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
      <Link href="/home" className="mb-8 flex items-center gap-2 px-3">
        <LogoMark />
        <Wordmark size={24} />
      </Link>
      <ul className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-3 rounded-sm px-3 text-body font-medium transition-colors duration-[120ms]",
                  active ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken/60 hover:text-ink",
                )}
              >
                <span aria-hidden className={cn("absolute top-2 bottom-2 left-0 w-[3px]", active ? "bg-accent" : "bg-transparent")} />
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="mt-4 border-t border-line pt-4">
          <Link
            href="/notifications"
            aria-current={isActive(path, "/notifications") ? "page" : undefined}
            className="flex h-11 items-center gap-3 rounded-sm px-3 text-body font-medium text-ink-2 hover:bg-sunken/60 hover:text-ink"
          >
            <Bell className="size-5" strokeWidth={1.75} aria-hidden />
            Notifications
            {unread > 0 && <span className="tnum ml-auto rounded-xs bg-accent px-1.5 text-caption font-bold text-on-accent">{unread}</span>}
          </Link>
        </li>
      </ul>
      <div className="mt-auto border-t border-line pt-3">
        <LogoutButton compact className="w-full" />
      </div>
    </nav>
  );
}

export function MobileTopBar({ unread }: { unread: number }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper px-4 md:hidden">
      <Link href="/home" className="flex items-center gap-2" aria-label="Dormdash home">
        <LogoMark className="size-6" />
        <Wordmark size={22} />
      </Link>
      <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative -mr-2 inline-flex size-11 items-center justify-center rounded-sm hover:bg-sunken">
        <Bell className="size-5" strokeWidth={1.75} aria-hidden />
        {unread > 0 && (
          <span className="tnum absolute top-1.5 right-1 min-w-4 rounded-xs bg-accent px-1 text-center text-[11px] leading-4 font-bold text-on-accent">{unread > 9 ? "9+" : unread}</span>
        )}
      </Link>
    </div>
  );
}
