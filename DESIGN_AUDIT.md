# Design audit

How this was done: `npm run screenshots` boots an isolated copy of the app (fresh seed,
production build) and Playwright captures every major page as each role, at **390px**
and **1280px**, in **light** and **dark** (128 images, `docs/screenshots/`, named
`<role>--<page>--<width>-<theme>.png`). Each was reviewed against the banned list and
the rules in DESIGN.md, issues were fixed, and everything was re-captured. Pass 1 found
the issues below; pass 2 (after fixes) and pass 3 (final, after the last code changes)
came back clean.

A source sweep backs up the visual review (re-run any time):

| Check | Result |
|---|---|
| Banned copy words (seamless, elevate, unlock, supercharge, effortless, revolutionize, next-level, game-changer, fast-paced) | None in `src/` |
| Em-dashes in UI copy | None in `src/` (emails included) |
| `gradient`, `backdrop-blur`, `blur-` | None |
| purple / violet / indigo / NYU violet | None |
| Emoji in UI | None |
| `rounded-full` | Only avatars, switch tracks/thumbs, radio dots, the sheet grab handle, the device-frame speaker in landing mockups (all allowed by DESIGN.md §5) |
| Hard-coded hex in components | Only `viewport.themeColor` (browsers need literals) and the last-resort `global-error.tsx` fallbacks (globals.css may not have loaded) |
| Shadows | Only `shadow-float` on the bottom sheet, toasts and the sticky checkout bar |

## Pages reviewed

| Role | Pages |
|---|---|
| Public | Landing, Log in, Sign up, Forgot password, Terms, 404, Offline |
| Unverified | Verify email |
| Customer | Home, New order (checkout form), Orders, Live order (ETA + PIN), Delivered order (rating + receipt), Profile, Edit profile, Notification settings, Notifications, Run (become a runner) |
| Runner | Run hub + job board + batches, Job detail (pickup/PIN), Shifts, Earnings |
| Pending runner | Run (application in review) |
| Admin | Dashboard (KPIs, charts, heatmap), Order log, Disputes, Dispute detail (evidence), Runner applications, Users, Places, Pricing, Flags |

## Issues found and fixed

| # | Where | Issue | Fix |
|---|---|---|---|
| 1 | Everywhere with a small caps label | A thin rule was drawn *above* every eyebrow label. Our `.overline` utility collided with Tailwind v4's built-in `overline` (text-decoration: overline). Read as a stray decorative line. | Renamed the utility to `.eyebrow` across the codebase. |
| 2 | Landing hero | The mustard "WE GOT YOU." highlight overlapped the bottom of "SLOW." (tight 0.86 leading + inline padding). | Made the highlight its own block with spacing above it. |
| 3 | Dark mode: live order, home banner, timeline, landing fine print, shift grid | `ink-fill` inverts to cream in dark mode, and mustard text on cream fell well under AA (PIN digits, "ON THE WAY", timeline checks, fine-print headings). | New token `--accent-on-fill` (mustard in light, `#7A5600` in dark, 5.6:1 on cream). DESIGN.md updated. |
| 4 | Live order (all themes) | A regex edit had stripped the PIN digit classes, so the PIN rendered as four small loose numbers instead of big boxed digits. Caught only because of the screenshot pass. | Restored; re-verified light and dark. |
| 5 | Admin dashboard | Heatmap columns had wildly uneven widths (auto table layout). | `table-fixed` with a fixed label column. |
| 6 | Admin dashboard, dark | Heatmap's top step mixed accent toward ink, which is cream in dark, so "most orders" looked paler than "many". Sequential scale not monotonic. | Ramp is now accent over surface at 0/15/35/60/85/100%, monotonic in both themes. |
| 7 | Admin dashboard | Crashed ("Elevator's out") because the server page passed a formatter function to a client chart. | Chart takes `format: "count" \| "cents"` instead. |
| 8 | Runner hub | "You're on shift" as the title and "ON SHIFT" on the toggle right under it: same message twice. | Title is "Run" with a "Hey Maya" eyebrow; the toggle carries the state. |
| 9 | Runner job board | Meta line truncated ("3 min ago" → "3 mi..."), reading like a distance. | Shortened to "3m ago". |
| 10 | Runner shifts | Nearly every cell had a dashed "thin coverage" outline, so the signal was lost in noise. | Only hours with nobody covering are dashed; legend and copy updated. |
| 11 | Runner earnings | "Late Delivery" title-cased by a stray `capitalize`; list was 50 rows long. | Sentence case; latest 25 rows. |
| 12 | Admin places | "Floors" and "Door delivery" columns ran together ("8Resident runners only"). | Column padding. |
| 13 | Customer order screen | Runner rating showed "New runner" for a runner with 36 ratings: RLS correctly hides other customers' ratings, so the aggregate came back empty. | `runner_rating()` security-definer functions expose only the average and count (migration 0004). |
| 14 | Seed data | Diego showed 7 active strikes while still approved, contradicting the 3-strike rule on the dispute screen. | Seed treats older strikes as already reviewed (one active max). |
| 15 | Seed avatars | Runner avatars were photos of takeout bags, which read as broken images in the runner row. | Removed; initials on mustard are the designed default. |
| 16 | Screenshot method | Full-page captures pinned the bottom nav and checkout bar mid-page. | Capture resizes the viewport to the page height so fixed bars sit at the bottom like on a phone. |

## Checked and intentionally kept

- **Cards** are used only for discrete objects: active orders, active jobs, batch suggestions, pending runner applications. Settings, stats, receipts and explanations are rows, rules and type.
- **Notices** are full tinted bands with an icon. No colored left borders.
- **Unread notifications** have a small mustard square. It's real state (unread), not decoration, and it never pulses.
- **The landing tower animation** is the only looping motion; it stops under `prefers-reduced-motion` (screenshots are taken with reduced motion, showing the bag parked at floor 14).
- **The landing page** avoids the template: asymmetric hero built around the tower, left-aligned editorial type, numbered how-it-works lists (no icon cards), real components in phone frames, real prices from the pricing settings, no stats, testimonials or logos, and a clear "not affiliated with NYU" line.
- **Buttons** are 6px radius everywhere (not pills). Headings are left-aligned; only empty states center.
- **Contrast**: every text/background token pair was computed (WCAG formula) and passes AA in both themes. See DESIGN.md §3.
