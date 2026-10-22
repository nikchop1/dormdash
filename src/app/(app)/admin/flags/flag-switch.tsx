"use client";

import { Switch } from "@/components/ui/form";
import { useAction } from "@/lib/client/use-action";

export function FlagSwitch({ flagKey, enabled, description }: { flagKey: string; enabled: boolean; description: string }) {
  const { run, busy } = useAction();
  return (
    <Switch
      label={flagKey}
      description={description}
      checked={enabled}
      disabled={!!busy}
      onChange={(v) => run("f", "/api/admin/flags", { method: "PATCH", body: { key: flagKey, enabled: v }, ok: `${flagKey} ${v ? "on" : "off"}.` })}
    />
  );
}
