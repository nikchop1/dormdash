"use client";

// Last-resort error boundary (the root layout itself failed). Inline styles only:
// globals.css may not have loaded. Values mirror the DESIGN.md light tokens.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "var(--paper, #F4EFE6)", color: "var(--ink, #1B1A17)", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "96px 16px" }}>
          <h1 style={{ fontSize: 40, lineHeight: 1, textTransform: "uppercase", margin: 0 }}>FloorDrop is down for a sec</h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: "var(--ink-2, #57524A)" }}>Something went wrong loading the app. Your orders are safe. Try again in a moment.</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, height: 44, padding: "0 16px", border: 0, borderRadius: 6, background: "var(--accent, #EFB21C)", color: "var(--on-accent, #1B1A17)", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
