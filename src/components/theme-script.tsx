"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "fd-theme";

/** Runs inline in the server HTML, before first paint, so there's no flash of the wrong theme. */
export const themeScript = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export function applySavedTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch {
    /* storage blocked: follow the system theme */
  }
}

const noop = () => () => {};

/**
 * The inline <script> exists only in the server-rendered HTML (and is matched, not created,
 * during hydration). React never creates a <script> on the client: it warns about that,
 * since such scripts never run. If the root is ever rendered on the client (e.g. after an
 * error), the saved theme is applied in a layout effect instead, still before paint.
 */
export function ThemeScript() {
  const fromServer = useSyncExternalStore(noop, () => false, () => true);
  useLayoutEffect(() => {
    if (!fromServer) applySavedTheme();
  }, [fromServer]);
  return fromServer ? <script dangerouslySetInnerHTML={{ __html: themeScript }} /> : null;
}
