"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function ResendButton() {
  const toast = useToast();
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setLoading(true);
    try {
      const res = await api<{ cooldown: number }>("/api/auth/resend", { method: "POST" });
      toast("Sent. Give it a minute to show up.");
      setCooldown(res.cooldown);
    } catch (err) {
      const e = err as ClientApiError;
      toast(e.message, "error");
      const m = e.message.match(/(\d+) seconds/);
      if (m) setCooldown(Number(m[1]));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="lg" block onClick={resend} loading={loading} disabled={cooldown > 0}>
      {cooldown > 0 ? <span className="tnum">Resend in {cooldown}s</span> : "Resend verification email"}
    </Button>
  );
}
