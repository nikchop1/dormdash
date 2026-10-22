"use client";

import { useId, useRef, useState } from "react";
import { Camera, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";
import { uploadPhoto } from "@/lib/client/api";
import { downscale } from "@/lib/client/image";

/**
 * Pick a photo (receipt screenshot, NYU ID), downscale it in the browser, upload it
 * right away and hand back the photo id. Never used for evidence photos.
 */
export function PhotoPicker({
  kind,
  label,
  hint,
  error,
  onUploaded,
  capture,
  className,
}: {
  /** Only non-evidence photos. Evidence (pickup, door, problem, case) uses <LiveCamera>. */
  kind: "confirmation" | "id_card";
  label: string;
  hint?: string;
  error?: string;
  onUploaded: (id: string | null) => void;
  capture?: boolean;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string>();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(undefined);
    setBusy(true);
    onUploaded(null);
    try {
      const small = await downscale(file);
      setPreview(URL.createObjectURL(small));
      const res = await uploadPhoto(small, kind);
      onUploaded(res.id);
    } catch (e) {
      setPreview(null);
      setUploadError((e as Error).message || "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const err = uploadError ?? error;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        {...(capture ? { capture: "environment" as const } : {})}
        className="sr-only"
        aria-invalid={!!err || undefined}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {preview ? (
        <div className="flex items-center gap-4 rounded-sm border border-line bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-20 w-16 rounded-xs object-cover" />
          <div className="flex-1 text-small">
            {busy ? (
              <span className="inline-flex items-center gap-2 text-ink-2"><Spinner className="size-4" /> Uploading</span>
            ) : (
              <span className="font-medium text-success">Uploaded</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-1.5 rounded-sm px-3 text-small font-semibold hover:bg-sunken disabled:opacity-40"
          >
            <RefreshCw className="size-4" strokeWidth={2} aria-hidden /> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-describedby={`${id}-msg`}
          className={cn(
            "flex h-24 flex-col items-center justify-center gap-1.5 rounded-sm border-2 border-dashed bg-surface text-small font-semibold transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60",
            err ? "border-danger text-danger" : "border-line text-ink-2 hover:border-ink-3",
          )}
        >
          {busy ? <Spinner /> : <Camera className="size-6" strokeWidth={1.75} aria-hidden />}
          {busy ? "Uploading" : capture ? "Take photo" : "Add photo"}
        </button>
      )}
      {err ? (
        <p id={`${id}-msg`} role="alert" className="flex items-start gap-1.5 text-small text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {err}
        </p>
      ) : (
        hint && <p id={`${id}-msg`} className="text-small text-ink-3">{hint}</p>
      )}
    </div>
  );
}
