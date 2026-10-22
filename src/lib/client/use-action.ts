"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "./api";

/** Call an API route, toast the outcome, refresh server data. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, url: string, opts: { method?: string; body?: unknown; ok?: string } = {}) {
    setBusy(key);
    try {
      const res = await api(url, { method: opts.method ?? "POST", body: opts.body ?? {} });
      if (opts.ok) toast(opts.ok);
      router.refresh();
      return res;
    } catch (e) {
      toast((e as ClientApiError).message, "error");
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy };
}
