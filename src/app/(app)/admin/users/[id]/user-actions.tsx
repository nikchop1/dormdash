"use client";

import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/client/use-action";

export function UserActions({ id, isAdmin, status, runnerStatus, hasStrikes, flagged, reviewRequired }: { id: string; isAdmin: boolean; status: string; runnerStatus: string; hasStrikes: boolean; flagged: boolean; reviewRequired: boolean }) {
  const { run, busy } = useAction();
  const act = (action: string, ok: string) => run(action, `/api/admin/users/${id}`, { body: { action }, ok });
  return (
    <div className="mt-3 flex flex-col gap-2">
      {flagged && (
        <Button variant="ink" loading={busy === "clear_flag"} onClick={() => act("clear_flag", "Flag cleared.")}>Clear flag after review</Button>
      )}
      {reviewRequired && (
        <Button variant="ink" loading={busy === "clear_review"} onClick={() => act("clear_review", "They can order again.")}>Let them order again</Button>
      )}
      {status === "banned" ? (
        <p className="text-small text-ink-3">Banned after a confirmed theft. Overturn on appeal from the case page.</p>
      ) : status === "active" ? (
        <Button variant="danger" loading={busy === "suspend"} onClick={() => act("suspend", "Account suspended.")}>Suspend account</Button>
      ) : (
        <Button variant="secondary" loading={busy === "unsuspend"} onClick={() => act("unsuspend", "Account restored.")}>Restore account</Button>
      )}
      {isAdmin ? (
        <Button variant="secondary" loading={busy === "remove_admin"} onClick={() => act("remove_admin", "Admin removed.")}>Remove admin</Button>
      ) : (
        <Button variant="secondary" loading={busy === "make_admin"} onClick={() => act("make_admin", "Now an admin.")}>Make admin</Button>
      )}
      {runnerStatus === "approved" && (
        <Button variant="secondary" loading={busy === "suspend_runner"} onClick={() => act("suspend_runner", "Running paused.")}>Pause running</Button>
      )}
      {runnerStatus === "suspended" && (
        <Button variant="ink" loading={busy === "reinstate_runner"} onClick={() => act("reinstate_runner", "Reinstated. Strikes cleared.")}>Reinstate runner</Button>
      )}
      {hasStrikes && runnerStatus !== "suspended" && (
        <Button variant="ghost" loading={busy === "void_strikes"} onClick={() => act("void_strikes", "Strikes cleared.")}>Clear strikes</Button>
      )}
    </div>
  );
}
