"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { JobRows, RunSummary, type BoardJob } from "@/components/job-board";
import { api, ClientApiError } from "@/lib/client/api";
import { suggestRuns } from "@/lib/domain/runs";
import { formatCents } from "@/lib/domain/pricing";

export function ShiftToggle({ on, disabled }: { on: boolean; disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    try {
      await api("/api/runner/shift", { body: { on: !on } });
      toast(on ? "Off shift. Nice work." : "You're on. Jobs will ping you.");
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "On shift" : "Off shift"}
      onClick={flip}
      disabled={busy || (disabled && !on)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-md px-5 py-4 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50",
        on ? "bg-ink-fill text-on-ink-fill" : "border-2 border-line-strong bg-surface text-ink",
      )}
    >
      <span>
        <span className="block font-display text-title leading-none font-extrabold uppercase">{on ? "On shift" : "Off shift"}</span>
        <span className="mt-1 block text-small opacity-80">{busy ? "Updating" : on ? "Tap to clock out" : "Tap to start taking jobs"}</span>
      </span>
      <span aria-hidden className={cn("relative h-8 w-14 shrink-0 rounded-full border-2 transition-colors", on ? "border-accent bg-accent" : "border-ink-3 bg-sunken")}>
        <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full transition-transform duration-200", on ? "translate-x-6 bg-ink-fill" : "bg-ink-3")} />
      </span>
    </button>
  );
}

function readLocationOnce(): Promise<{ status: "ok"; lat: number; lng: number } | { status: "denied" | "unavailable" }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ status: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => resolve({ status: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

/**
 * Live board: heading-home mode, suggested runs ("Take all"), and individual ticks.
 * Polls a cheap version endpoint and refreshes on change.
 */
export function RunnerBoard({
  jobs,
  capacity,
  foodCapCents,
  activeFoodCents,
  buildings,
  homeBuildingId,
}: {
  jobs: BoardJob[];
  capacity: number;
  foodCapCents: number | null;
  activeFoodCents: number;
  buildings: { id: string; name: string }[];
  homeBuildingId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [heading, setHeading] = useState<{ buildingId: string; ids: string[]; location: string } | null>(null);
  const [homeId, setHomeId] = useState(homeBuildingId);
  const version = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/runner/jobs", { cache: "no-store" });
        if (!res.ok) return;
        const { version: v } = await res.json();
        if (version.current && v !== version.current) router.refresh();
        version.current = v;
      } catch {
        /* offline */
      }
    }, 6000);
    return () => clearInterval(t);
  }, [router]);

  const available = jobs.filter((j) => !j.locked);
  const shown = heading ? available.filter((j) => heading.ids.includes(j.id)) : available;
  const runs = useMemo(
    () =>
      suggestRuns(
        shown.map((j) => ({ ...j, createdAt: new Date(j.createdAt) })),
        { capacity, foodCapCents, activeFoodCents },
      ),
    [shown, capacity, foodCapCents, activeFoodCents],
  );

  async function headHome() {
    setBusy("home");
    const location = await readLocationOnce();
    try {
      const res = await api<{ orderIds: string[]; location: string }>("/api/runner/heading-home", { body: { buildingId: homeId, location } });
      setHeading({ buildingId: homeId, ids: res.orderIds, location: res.location });
      if (res.location !== "ok") toast("We couldn't get your location, so we can't tell what's on your way. Allow location and try again.", "error");
    } catch (e) {
      toast((e as ClientApiError).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function claim(ids: string[], key: string) {
    setBusy(key);
    try {
      await api("/api/runner/claim", { body: { orderIds: ids, headingHome: !!heading, buildingId: heading?.buildingId ?? null } });
      toast(ids.length > 1 ? `Took ${ids.length}. Pickups first.` : "Claimed. Head to the spot.");
      router.push("/run/active");
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const pickedJobs = jobs.filter((j) => picked.has(j.id));
  const homeName = buildings.find((b) => b.id === homeId)?.name ?? "my building";

  return (
    <div className="mt-2 flex flex-col gap-4">
      <section aria-labelledby="home-h" className="rounded-md bg-sunken p-4">
        <h3 id="home-h" className="sr-only">Heading home</h3>
        {heading ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-small">
              <MapPin className="size-4 text-accent-ink" aria-hidden />
              <span>
                <span className="font-semibold">On your way to {buildings.find((b) => b.id === heading.buildingId)?.name}.</span>{" "}
                {heading.ids.length} {heading.ids.length === 1 ? "pickup is" : "pickups are"} close by.
              </span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setHeading(null)}>Show all</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button size="lg" block variant="ink" loading={busy === "home"} onClick={headHome}>
              <Home className="size-5" aria-hidden /> I&rsquo;m heading to {homeName}
            </Button>
            <Select label="Heading to" value={homeId} onChange={(e) => setHomeId(e.target.value)} fieldClassName="[&_label]:sr-only">
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
            <p className="text-caption text-ink-3">One location check right now to find pickups on your way. We don&rsquo;t track you.</p>
          </div>
        )}
      </section>

      {capacity === 0 && <p className="text-small text-ink-2">You&rsquo;re at your max. Finish a delivery before taking more.</p>}

      {runs.length > 0 && capacity > 0 && (
        <div className="flex flex-col gap-2">
          {runs.map((r) => (
            <RunSummary
              key={r.key}
              label={r.label}
              headingHome={!!heading}
              jobs={r.jobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() }))}
              action={
                <Button variant="ink" block loading={busy === r.key} disabled={!!busy} onClick={() => claim(r.jobs.map((j) => j.id), r.key)}>
                  {r.jobs.length === 1 ? "Take it" : `Take all ${r.jobs.length}`}
                </Button>
              }
            />
          ))}
        </div>
      )}
      {heading && shown.length === 0 && <Notice tone="info">Nothing on your way right now. Show all to see the full board.</Notice>}

      <JobRows
        jobs={heading ? jobs.filter((j) => heading.ids.includes(j.id)) : jobs}
        action={(j) =>
          j.locked ? null : (
            <label className="flex size-11 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                checked={picked.has(j.id)}
                disabled={!picked.has(j.id) && picked.size >= capacity}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(j.id);
                  else next.delete(j.id);
                  setPicked(next);
                }}
                aria-label={`Pick ${j.spotName} to floor ${j.floor}`}
                className="size-6 cursor-pointer accent-[var(--ink)]"
              />
            </label>
          )
        }
      />
      {picked.size > 0 && (
        <div className="sticky bottom-20 z-20 md:bottom-4">
          <Button size="lg" block loading={busy === "picked"} onClick={() => claim([...picked], "picked")}>
            Take {picked.size} · {formatCents(pickedJobs.reduce((s, j) => s + j.payCents, 0))}
          </Button>
        </div>
      )}
    </div>
  );
}
