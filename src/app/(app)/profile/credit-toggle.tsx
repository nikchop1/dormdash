"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError } from "@/lib/client/api";

export function CreditToggle({ initial }: { initial: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  return (
    <Switch
      label="Apply credit automatically at checkout"
      description="Pays delivery fees and tips only."
      checked={on}
      onChange={async (v) => {
        setOn(v);
        try {
          await api("/api/profile/credit", { method: "PATCH", body: { useCredit: v } });
        } catch (e) {
          setOn(!v);
          toast((e as ClientApiError).message, "error");
        }
      }}
    />
  );
}
