"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";

export function MarkRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/notifications/read", { method: "POST" }).catch(() => {});
        router.refresh();
        setBusy(false);
      }}
    >
      Mark all read
    </Button>
  );
}
