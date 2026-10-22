"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Kind = "success" | "error" | "info";
type Toast = { id: number; kind: Kind; message: string };

const Ctx = createContext<{ toast: (message: string, kind?: Kind) => void }>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, kind: Kind = "success") => {
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 4000);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-sm bg-ink-fill px-4 py-3 text-small text-on-ink-fill shadow-float",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-xs",
                t.kind === "success" && "bg-accent text-on-accent",
                t.kind === "error" && "bg-danger text-paper",
                t.kind === "info" && "bg-on-ink-fill/20",
              )}
              aria-hidden
            >
              {t.kind === "success" ? <Check className="size-3.5" strokeWidth={3} /> : t.kind === "error" ? <TriangleAlert className="size-3.5" strokeWidth={2.5} /> : <Info className="size-3.5" strokeWidth={2.5} />}
            </span>
            <p className="flex-1 leading-5">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 p-1 opacity-70 hover:opacity-100">
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx).toast;
