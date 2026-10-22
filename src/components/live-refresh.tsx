"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * App-wide realtime: when a notification lands for this user, show a toast and
 * refresh server data. Uses Supabase Realtime when configured (RLS limits rows to
 * the user's own), and falls back to light polling in local mode.
 */
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const since = useRef(new Date().toISOString());

  useEffect(() => {
    const sb = supabaseBrowser();
    if (sb) {
      const ch = sb
        .channel(`notifications:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
          const n = payload.new as { title: string };
          toast(n.title, "info");
          router.refresh();
        })
        .subscribe();
      return () => {
        sb.removeChannel(ch);
      };
    }
    let stop = false;
    async function poll() {
      if (stop || document.hidden) return;
      try {
        const res = await fetch(`/api/notifications/poll?since=${encodeURIComponent(since.current)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: { title: string; created_at: string }[] };
        if (data.items.length) {
          since.current = data.items[0].created_at;
          toast(data.items[0].title, "info");
          router.refresh();
        }
      } catch {
        /* offline: try again next tick */
      }
    }
    const t = setInterval(poll, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [userId, router, toast]);

  return null;
}

/** Re-render when a specific row changes. Realtime if available, polling otherwise. */
export function useLiveRow(opts: { table: "orders"; id: string; versionUrl: string; intervalMs?: number; enabled?: boolean }) {
  const router = useRouter();
  const version = useRef<string | null>(null);
  const { table, id, versionUrl, intervalMs = 5000, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const sb = supabaseBrowser();
    let channel: ReturnType<NonNullable<typeof sb>["channel"]> | null = null;
    if (sb) {
      channel = sb
        .channel(`${table}:${id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `id=eq.${id}` }, () => router.refresh())
        .subscribe();
    }
    // Polling is also the safety net if a realtime message is missed.
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(versionUrl, { cache: "no-store" });
        if (!res.ok) return;
        const { version: v } = (await res.json()) as { version: string };
        if (version.current && v !== version.current) router.refresh();
        version.current = v;
      } catch {
        /* ignore */
      }
    }, sb ? intervalMs * 4 : intervalMs);
    return () => {
      clearInterval(t);
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [table, id, versionUrl, intervalMs, enabled, router]);
}
