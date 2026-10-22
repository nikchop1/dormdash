"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { Segmented } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";

export function LogoutButton({ className, compact }: { className?: string; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      // Hard navigation so no cached signed-in UI survives.
      window.location.assign("/");
    } catch {
      toast("Couldn't log out. Check your connection.", "error");
      setBusy(false);
      router.refresh();
    }
  }
  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className={cn(
        "flex items-center gap-3 text-body font-medium text-danger transition-opacity hover:opacity-80 disabled:opacity-50",
        compact ? "h-11 rounded-sm px-3" : "min-h-14 w-full py-3",
        className,
      )}
    >
      <LogOut className="size-5" strokeWidth={1.75} aria-hidden />
      {busy ? "Logging out" : "Log out"}
    </button>
  );
}

type Theme = "system" | "light" | "dark";

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("fd-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* storage blocked */
    }
  }, []);
  function choose(t: Theme) {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("fd-theme");
      else localStorage.setItem("fd-theme", t);
    } catch {
      /* storage blocked: still apply for this visit */
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
  return (
    <Segmented
      label="Theme"
      value={theme}
      onChange={choose}
      options={[
        { value: "system", label: "Auto" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ]}
    />
  );
}
