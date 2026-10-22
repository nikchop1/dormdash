"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/domain/pricing";

function PayForm({ orderId, amountCents, onPaid, onError }: { orderId: string; amountCents: number; onPaid: () => void; onError: (m: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true);
    const { error } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: `${location.origin}/orders/${orderId}` } });
    if (error) {
      onError(error.message ?? "Your card was declined. Try another one.");
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/orders/${orderId}/capture`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      onError(data?.error?.message ?? "Payment didn't go through.");
      setBusy(false);
      return;
    }
    onPaid();
  }
  return (
    <div className="flex flex-col gap-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <Button size="lg" block loading={busy} disabled={!stripe} onClick={pay}>
        Pay {formatCents(amountCents)}
      </Button>
    </div>
  );
}

/** Stripe Payment Element for an order that's already been created and priced server-side. */
export function StripeCheckout(p: { publishableKey: string; clientSecret: string; orderId: string; amountCents: number; onPaid: () => void; onError: (m: string) => void }) {
  const stripePromise = useMemo(() => loadStripe(p.publishableKey), [p.publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: p.clientSecret,
        appearance: {
          theme: "flat",
          variables: { colorPrimary: "#1B1A17", colorBackground: "#FBF8F2", colorText: "#1B1A17", borderRadius: "6px", fontFamily: "IBM Plex Sans, Helvetica, Arial, sans-serif" },
        },
      }}
    >
      <PayForm orderId={p.orderId} amountCents={p.amountCents} onPaid={p.onPaid} onError={p.onError} />
    </Elements>
  );
}
