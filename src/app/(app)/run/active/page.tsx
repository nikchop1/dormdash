import type { Metadata } from "next";
import { requireRunner } from "@/lib/auth/session";
import { currentRun } from "@/lib/services/orders";
import { orderPhotos } from "@/lib/services/photos";
import { getPricing } from "@/lib/settings";
import { runStops } from "@/lib/domain/runs";
import { ElevatorMark } from "@/components/brand";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { RunScreen, type RunOrder } from "./run-screen";

export const metadata: Metadata = { title: "Your run" };

export default async function ActiveRunPage() {
  const user = await requireRunner();
  const [data, settings] = await Promise.all([currentRun(user.id), getPricing()]);
  if (!data || data.orders.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 md:px-6">
        <PageHeader back={{ href: "/run", label: "Run" }} title="Your run" />
        <EmptyState title="No run right now" mark={<ElevatorMark />} action={<ButtonLink href="/run">Find orders</ButtonLink>}>
          Take a suggested run from the board, or tap &ldquo;I&rsquo;m heading to&rdquo; your building.
        </EmptyState>
      </div>
    );
  }
  const confirmations = Object.fromEntries(
    await Promise.all(data.orders.map(async (o) => [o.id, (await orderPhotos(o.id, ["confirmation"]))[0]?.url ?? null] as const)),
  );
  const orders: RunOrder[] = data.orders.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    spotId: o.spot_id,
    spotName: o.spot_name,
    spotAddress: o.spot_address,
    spotNotes: o.spot_notes,
    pickupName: o.pickup_name,
    orderNumber: o.order_number,
    foodValueCents: o.food_value_cents,
    bags: o.bags,
    building: o.building_name,
    floor: o.floor,
    room: o.room,
    notes: o.notes,
    customerFirst: o.customer_first,
    handoff: o.handoff,
    payCents: o.runner_fee_cents + o.tip_cents,
    noShowPayCents: o.delivery_fee_cents + o.tip_cents,
    headsUp: !!o.heads_up_at,
    atDoorAt: o.at_door_at?.toISOString() ?? null,
    doorLocation: o.door_location,
    doorPhotoUrl: data.doorPhotos[o.id] ?? null,
    countdownEndsAt: o.countdown_ends_at?.toISOString() ?? null,
    customerPresent: !!o.customer_present_at,
    calls: data.calls[o.id] ?? 0,
    pinAttempts: o.pin_attempts,
    confirmationUrl: confirmations[o.id],
    payoutReview: o.payout_review,
  }));
  const stops = runStops(orders.map((o) => ({ id: o.id, status: o.status, spotId: o.spotId, spotName: o.spotName, floor: o.floor, room: o.room })));
  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6">
      <PageHeader back={{ href: "/run", label: "Run" }} overline={data.run.heading_home ? "Heading home" : "Your run"} title={`${orders.filter((o) => ["claimed", "picked_up", "on_the_way"].includes(o.status)).length} to go`} />
      <RunScreen orders={orders} stops={stops} freeDropsPerWeek={settings.freeUnclaimsPerWeek} />
    </div>
  );
}
