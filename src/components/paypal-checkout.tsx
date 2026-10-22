"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

type PayPalButtons = {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
};
type PayPalNamespace = {
  Buttons: (opts: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => PayPalButtons;
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null;
function loadSdk(clientId: string): Promise<PayPalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    // Venmo shows up for US buyers on mobile, which is most students.
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons&enable-funding=venmo&disable-funding=paylater,credit`;
    s.async = true;
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal failed to load")));
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("PayPal failed to load"));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * PayPal / Venmo buttons. createOrder makes the FloorDrop order (server prices it
 * and creates the PayPal order); onApprove captures it server-side.
 */
export function PayPalCheckout({
  clientId,
  getBody,
  onPlaced,
  onError,
}: {
  clientId: string;
  getBody: () => unknown;
  onPlaced: (orderId: string) => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const orderId = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const latest = useRef({ getBody, onPlaced, onError });
  useEffect(() => {
    latest.current = { getBody, onPlaced, onError };
  });

  useEffect(() => {
    let buttons: PayPalButtons | null = null;
    let cancelled = false;
    loadSdk(clientId)
      .then(async (paypal) => {
        if (cancelled || !box.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", shape: "rect", color: "black", label: "pay", height: 48 },
          createOrder: async () => {
            const res = await fetch("/api/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(latest.current.getBody()),
            });
            const data = await res.json();
            if (!res.ok) {
              latest.current.onError(data?.error?.message ?? "Couldn't start checkout.");
              throw new Error("create failed");
            }
            orderId.current = data.orderId;
            return data.paymentRef as string;
          },
          onApprove: async () => {
            const res = await fetch(`/api/orders/${orderId.current}/capture`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) {
              latest.current.onError(data?.error?.message ?? "Payment didn't go through.");
              return;
            }
            latest.current.onPlaced(orderId.current!);
          },
          onCancel: () => latest.current.onError("Payment cancelled. Nothing was charged."),
          onError: () => latest.current.onError("PayPal hit a snag. Try again or use a different method."),
        });
        await buttons.render(box.current);
        setState("ready");
      })
      .catch(() => setState("failed"));
    return () => {
      cancelled = true;
      buttons?.close?.().catch(() => {});
    };
  }, [clientId]);

  return (
    <div>
      {state === "loading" && (
        <div className="flex h-24 items-center justify-center text-ink-2">
          <Spinner />
        </div>
      )}
      {state === "failed" && <p className="text-small text-danger">PayPal didn&rsquo;t load. Check your connection, then close this and try again.</p>}
      <div ref={box} />
    </div>
  );
}
