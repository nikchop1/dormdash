"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, MapPin, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, ClientApiError } from "@/lib/client/api";

export type CapturedPhoto = { id: string; location: "in_range" | "out_of_range" | "denied" | "unavailable" | null; distanceM: number | null; preview: string };
type Kind = "pickup" | "door" | "problem" | "case";
type LocationReading = { status: "ok"; lat: number; lng: number } | { status: "denied" | "unavailable" };

/** One-time location check. No watchPosition, no tracking: a single reading, then it's gone. */
function readLocationOnce(): Promise<LocationReading> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ status: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => resolve({ status: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

const LOCATION_COPY = {
  in_range: { text: "Location verified", tone: "text-success" },
  out_of_range: { text: "Location looks out of range", tone: "text-warning" },
  denied: { text: "Location not shared", tone: "text-warning" },
  unavailable: { text: "Location unavailable", tone: "text-warning" },
} as const;

/**
 * In-app live camera for evidence photos. Rear camera via getUserMedia; there is no
 * file input, so photos can't come from the gallery. Uploads carry a one-time camera
 * token and a one-time location reading; the server stamps time + location result.
 */
export function LiveCamera({
  kind,
  orderId,
  label,
  hint,
  onCaptured,
  captured,
}: {
  kind: Kind;
  orderId: string;
  label: string;
  hint?: string;
  onCaptured: (p: CapturedPhoto | null) => void;
  captured?: CapturedPhoto | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "live" | "uploading" | "denied" | "error">("idle");
  const [error, setError] = useState<string>();
  const token = useRef<string | null>(null);

  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => stop, []);

  async function open() {
    setError(undefined);
    setState("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("no camera"), { name: "NotFoundError" });
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } }, audio: false });
      stream.current = s;
      const t = await api<{ token: string }>("/api/camera/token", { body: { kind } });
      token.current = t.token;
      setState("live");
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
      });
    } catch (e) {
      stop();
      const name = (e as Error).name;
      if (name === "NotAllowedError" || name === "SecurityError") setState("denied");
      else {
        setState("error");
        setError(e instanceof ClientApiError ? e.message : "Couldn't open the camera. Close other apps using it and try again.");
      }
    }
  }

  async function shoot() {
    const v = video.current;
    if (!v || !token.current) return;
    setState("uploading");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
    canvas.width = Math.round((v.videoWidth || 1280) * scale);
    canvas.height = Math.round((v.videoHeight || 720) * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const [blob, location] = await Promise.all([
      new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85)),
      readLocationOnce(),
    ]);
    stop();
    if (!blob) {
      setState("error");
      setError("Couldn't capture that frame. Try again.");
      return;
    }
    const form = new FormData();
    form.append("file", blob, "camera.jpg");
    form.append("meta", JSON.stringify({ kind, token: token.current, orderId, location }));
    try {
      const res = await fetch("/api/camera/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed.");
      onCaptured({ id: data.id, location: data.location, distanceM: data.distanceM, preview: URL.createObjectURL(blob) });
      setState("idle");
    } catch (e) {
      setState("error");
      setError((e as Error).message);
    } finally {
      token.current = null;
    }
  }

  if (captured) {
    const loc = captured.location ? LOCATION_COPY[captured.location] : null;
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-small font-medium">{label}</span>
        <div className="flex items-center gap-4 rounded-sm border border-line bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captured.preview} alt="" className="h-20 w-20 rounded-xs object-cover" />
          <div className="flex-1 text-small">
            <span className="block font-medium text-success">Photo taken</span>
            {loc && (
              <span className={cn("mt-0.5 flex items-center gap-1", loc.tone)}>
                <MapPin className="size-3.5" aria-hidden /> {loc.text}
              </span>
            )}
          </div>
          <button type="button" onClick={() => onCaptured(null)} className="inline-flex h-10 items-center gap-1.5 rounded-sm px-3 text-small font-semibold hover:bg-sunken">
            <RefreshCw className="size-4" aria-hidden /> Retake
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small font-medium">{label}</span>
      {state === "live" || state === "uploading" ? (
        <div className="relative overflow-hidden rounded-sm bg-ink-fill">
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" aria-label="Camera preview" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
            <span className="rounded-xs bg-ink-fill/80 px-2 py-1 text-caption font-semibold text-on-ink-fill">Live camera</span>
            <Button variant="primary" onClick={shoot} loading={state === "uploading"} aria-label="Take photo">
              <Camera className="size-5" aria-hidden /> Take photo
            </Button>
          </div>
        </div>
      ) : state === "denied" ? (
        <div role="alert" className="flex gap-3 rounded-sm bg-danger-soft px-4 py-3 text-small">
          <CameraOff className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold">Camera access is blocked</p>
            <p className="mt-0.5 text-ink-2">
              Evidence photos have to be live, so this step can&rsquo;t continue without the camera. Allow it in your browser: tap the lock or
              settings icon next to the address, set Camera to Allow, then reload. On iPhone: Settings, Safari, Camera, Allow.
            </p>
            <button type="button" onClick={open} className="link mt-2 font-semibold">Try again</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          disabled={state === "starting"}
          className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-sm border-2 border-dashed border-line bg-surface text-small font-semibold text-ink-2 transition-colors hover:border-ink-3 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
        >
          {state === "starting" ? <Spinner /> : <Camera className="size-6" strokeWidth={1.75} aria-hidden />}
          {state === "starting" ? "Opening camera" : "Open camera"}
        </button>
      )}
      {error ? <p role="alert" className="text-small text-danger">{error}</p> : hint && <p className="text-small text-ink-3">{hint}</p>}
    </div>
  );
}
