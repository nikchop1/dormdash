"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BatchSummary, JobRows, type BoardBatch, type BoardJob } from "@/components/job-board";
import { api, ClientApiError } from "@/lib/client/api";

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

/** Live board: claim one or a whole batch. Polls a cheap version endpoint and refreshes on change. */
export function RunnerBoard({ jobs, batches, capacity }: { jobs: BoardJob[]; batches: BoardBatch[]; capacity: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
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

  async function claim(ids: string[], key: string) {
    setBusy(key);
    try {
      const res = await api<{ claimed: string[] }>("/api/runner/claim", { body: { orderIds: ids } });
      toast(ids.length > 1 ? `Claimed ${ids.length}. Go get 'em.` : "Claimed. Head to the spot.");
      router.push(ids.length > 1 ? "/run" : `/run/jobs/${res.claimed[0]}`);
      router.refresh();
    } catch (e) {
      toast((e as ClientApiError).message, "error");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-4">
      {batches.length > 0 && capacity > 1 && (
        <div className="flex flex-col gap-2">
          {batches.map((b) => (
            <BatchSummary
              key={b.key}
              batch={b}
              action={
                <Button variant="ink" block loading={busy === b.key} disabled={!!busy} onClick={() => claim(b.jobs.map((j) => j.id), b.key)}>
                  Claim all {b.jobs.length}
                </Button>
              }
            />
          ))}
        </div>
      )}
      {capacity === 0 && <p className="text-small text-ink-2">You&rsquo;re at your max. Drop something off before claiming more.</p>}
      <JobRows
        jobs={jobs}
        action={(j) => (
          <Button size="sm" loading={busy === j.id} disabled={!!busy || capacity === 0} onClick={() => claim([j.id], j.id)} aria-label={`Claim ${j.spotName} to floor ${j.floor}`}>
            Claim
          </Button>
        )}
      />
    </div>
  );
}
