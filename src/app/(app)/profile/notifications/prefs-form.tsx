"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export type Prefs = {
  push_order_updates: boolean;
  push_new_jobs: boolean;
  push_disputes: boolean;
  push_account: boolean;
  email_order_updates: boolean;
  email_disputes: boolean;
  email_account: boolean;
};

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const toast = useToast();
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "loading">("loading");

  useEffect(() => {
    (async () => {
      if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function enable() {
    try {
      setState("loading");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapidKey!) });
      await api("/api/push/subscribe", { body: sub.toJSON() });
      setState("on");
      toast("Push is on for this device.");
    } catch (e) {
      setState("off");
      toast((e as ClientApiError).message || "Couldn't turn on push.", "error");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    }
    setState("off");
  }

  if (state === "unsupported")
    return (
      <Notice tone="info" title="Push isn't available here">
        {vapidKey ? "On iPhone, add Dormdash to your Home Screen first (Share, then Add to Home Screen), then turn push on from there." : "Push notifications aren't set up on this server yet. You'll still see updates in the app."}
      </Notice>
    );
  if (state === "denied") return <Notice tone="warning" title="Push is blocked">Your browser blocked notifications for Dormdash. Allow them in your browser&rsquo;s site settings, then come back.</Notice>;
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <p className="text-small text-ink-2">{state === "on" ? "Push is on for this device." : "Get a buzz when your order moves, even with the app closed."}</p>
      {state === "on" ? (
        <Button variant="ghost" size="sm" onClick={disable}>Turn off</Button>
      ) : (
        <Button variant="ink" size="sm" onClick={enable} loading={state === "loading"}>Turn on push</Button>
      )}
    </div>
  );
}

export function NotificationPrefs({ initial, vapidKey, isRunner }: { initial: Prefs; vapidKey: string | null; isRunner: boolean }) {
  const toast = useToast();
  const [p, setP] = useState(initial);

  async function update(k: keyof Prefs, v: boolean) {
    const next = { ...p, [k]: v };
    setP(next);
    try {
      await api("/api/profile/notifications", { method: "PATCH", body: next });
    } catch (e) {
      setP(p);
      toast((e as ClientApiError).message, "error");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>On this device</SectionTitle>
        <PushToggle vapidKey={vapidKey} />
      </section>
      <section>
        <SectionTitle>Push</SectionTitle>
        <div className="divide-y divide-line">
          <Switch label="Order updates" description="Claimed, picked up, delivered." checked={p.push_order_updates} onChange={(v) => update("push_order_updates", v)} />
          {isRunner && <Switch label="New jobs" description="Only while you're on shift." checked={p.push_new_jobs} onChange={(v) => update("push_new_jobs", v)} />}
          <Switch label="Cases" description="Problem reports and their outcomes." checked={p.push_disputes} onChange={(v) => update("push_disputes", v)} />
          <Switch label="Account" description="Runner approval, payouts, strikes." checked={p.push_account} onChange={(v) => update("push_account", v)} />
        </div>
      </section>
      <section>
        <SectionTitle>Email</SectionTitle>
        <div className="divide-y divide-line">
          <Switch label="Order updates" description="Off by default. Push is faster." checked={p.email_order_updates} onChange={(v) => update("email_order_updates", v)} />
          <Switch label="Case outcomes" checked={p.email_disputes} onChange={(v) => update("email_disputes", v)} />
          <Switch label="Account" checked={p.email_account} onChange={(v) => update("email_account", v)} />
        </div>
        <p className="mt-3 text-small text-ink-3">Security emails (verification, password resets) always go out.</p>
      </section>
    </div>
  );
}
