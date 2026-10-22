import { ElevatorMark, Logo } from "@/components/brand";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <Logo />
      <div className="flex flex-1 flex-col justify-center">
        <ElevatorMark className="size-14 text-ink-3" />
        <h1 className="mt-6 font-display text-display leading-none font-black uppercase">Stuck between floors</h1>
        <p className="mt-3 text-body text-ink-2">You&rsquo;re offline. Elevators and dorm Wi-Fi, right? Your orders are still moving. Reconnect and pull to refresh.</p>
      </div>
    </main>
  );
}
