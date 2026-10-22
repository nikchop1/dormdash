# FloorDrop design system

This document is the source of truth for how FloorDrop looks, reads and moves. Every
screen follows it. Tokens live in `src/app/globals.css` (CSS variables + Tailwind
`@theme`); components in `src/components/ui` consume only those tokens.

## 1. Personality

**Fast, warm, a little cheeky, unmistakably NYC student life.** Think 1am on a
Tuesday, a slow elevator, a hallway that smells like someone else's ramen. We sound
like a friend who happens to be good at logistics, not a SaaS dashboard.

- Concrete over abstract. "Floor 14. Elevator's slow. We got you." not "Fast, reliable delivery."
- Short sentences. Periods do the work. **No em-dashes in UI copy.** Use a period, a comma, a colon or a middot (·).
- Funny where it's cheap (empty states, loading, landing). Straight and precise where it costs money or trust (payments, refunds, disputes, safety, account deletion).
- Banned words: seamless, elevate, unlock, supercharge, effortless, revolutionize, next-level, game-changer, "in today's fast-paced world".
- Every error says **what happened** and **what to do next**.

## 2. Visual idea: the elevator panel

Our recurring motif is the **elevator floor indicator**: a boxed, condensed number with a
small up-triangle, like the display above every dorm elevator. It shows up as:

- `FloorBadge` (▲14) on orders, jobs and the profile, anywhere a floor is mentioned.
- The landing page hero: a dorm-tower cross-section and a big floor counter climbing to 14.
- The live order screen: the ETA and status read like an elevator display. Big, tabular, ink on paper.

Supporting custom marks (inline SVG, `src/components/brand`): the logo (a bag inside an
elevator-door slot), the bag glyph, the tower cross-section.

## 3. Color

One accent, committed: **Mustard** (NYC cab yellow, deli mustard). It's for primary
actions, the floor motif and a few highlights. Never for body text on paper (contrast),
never as a big decorative wash.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F4EFE6` | `#15130F` | App background. Warm off-white, never pure white. |
| `--surface` | `#FBF8F2` | `#1E1B16` | Things that sit on paper: inputs, sheets, cards for discrete objects. |
| `--sunken` | `#EBE4D8` | `#0F0D0A` | Wells: segmented controls, skeletons, code chips. |
| `--ink` | `#1B1A17` | `#F1EBDF` | Primary text, icons, dark buttons. |
| `--ink-2` | `#57524A` | `#BDB4A4` | Secondary text. |
| `--ink-3` | `#655E54` | `#968D7E` | Captions, meta. AA on paper in both themes. |
| `--line` | `#D9D0C1` | `#36312A` | Dividers, input borders. |
| `--line-strong` | `#1B1A17` | `#F1EBDF` | Section rules (2px), focused borders. |
| `--accent` | `#EFB21C` | `#EFB21C` | Primary button fill, floor badge, active nav marker. |
| `--accent-hover` | `#DDA00A` | `#F5C343` | Hover on accent. |
| `--accent-press` | `#C48D00` | `#D9A513` | Pressed. |
| `--on-accent` | `#1B1A17` | `#15130F` | Text on mustard (9:1). |
| `--accent-ink` | `#7A5600` | `#F2C14A` | Accent-colored text/icons on paper (AA). |
| `--accent-soft` | `#F7E3A8` | `#3A2F12` | Tinted highlight (busy pricing note, selected tip). |
| `--success` / `-soft` | `#186A42` / `#D6EBDD` | `#5CC48C` / `#173326` | Delivered, payouts sent. |
| `--warning` / `-soft` | `#8F5A00` / `#F5E3BC` | `#E8B04A` / `#3A2C10` | Busy pricing, thin coverage, lobby handoff. |
| `--danger` / `-soft` | `#B3261E` / `#F8D9D4` | `#FF7A6B` / `#3D1A16` | Errors, destructive actions, strikes. |

**Banned:** purple, violet, indigo (including NYU violet), gradients of any kind, gradient
text, blurred blobs, neon. No hard-coded hex values in components. Tokens only.

Dark mode is designed, not inverted: warm near-black paper, the surface steps *up* in
lightness, mustard stays the same hue (it already pops), and secondary inks are re-tuned
for AA on the dark paper. Theme follows the OS, with a manual override in Profile.

## 4. Typography

- **Display: Big Shoulders** (Google Fonts, variable, opsz + wght). Condensed, sturdy,
  signage-like. Headlines, the big ETA, floor numbers, prices in hero spots. Weights 700–900, uppercase only for short labels.
- **Text: IBM Plex Sans** (Google Fonts, variable). Highly readable at small sizes, a
  little mechanical warmth. Everything else.
- Numbers that change or get compared (prices, ETAs, earnings, PINs, counts) use
  **tabular numerals** (`.tnum` / `font-variant-numeric: tabular-nums`).

Type scale (mobile first; `--text-*` tokens):

| Token | Size / line | Face | Use |
|---|---|---|---|
| `display-xl` | 88/0.9 (desktop 128) | Big Shoulders 900 | Landing hero number |
| `display-lg` | 56/0.95 | Big Shoulders 800 | ETA, big counters |
| `display` | 40/1 | Big Shoulders 800 | Page titles on hero screens |
| `title` | 28/1.05 | Big Shoulders 800 | Screen titles |
| `heading` | 20/1.25 | Plex 600 | Section headings |
| `body-lg` | 18/1.5 | Plex 400 | Lead paragraphs |
| `body` | 16/1.5 | Plex 400 | Default |
| `small` | 14/1.43 | Plex 400/500 | Secondary info, list meta |
| `caption` | 12/1.33 | Plex 500, +0.04em, uppercase | Overlines, table headers |

Headings are **left-aligned**. Centered text is reserved for empty states and the PIN.

## 5. Space, radius, elevation

- **Spacing**: 4px base. Use Tailwind's default scale (1 = 4px). Screen gutter 16px
  (mobile), 24px (≥ md). Vertical rhythm between sections: 32px. Inside lists: 12–16px.
- **Radius** (deliberately mixed):
  - `--radius-none` 0: lists, rows, section blocks, tables.
  - `--radius-xs` 2px: badges, floor badge, chips.
  - `--radius-sm` 6px: buttons, inputs, segmented controls. **Buttons are not pills.**
  - `--radius-md` 10px: discrete object cards (an order, a job, a batch).
  - `--radius-lg` 20px: top corners of bottom sheets.
  - `--radius-full`: avatars and the switch thumb only.
- **Elevation**: flat by default. Separation comes from 1px `--line` borders, 2px ink
  rules, and whitespace. Shadow (`--shadow-float`) exists only for things that genuinely
  float above content: bottom sheets, toasts, the dropdown menu, the sticky checkout bar.
- **Cards** only for discrete objects (an order, a job, a payout). Settings, sections,
  explanations and stats use rows, dividers and typography, never "everything in a rounded box".

## 6. Motion

- Durations: `--dur-1` 120ms (press, hover), `--dur-2` 200ms (state change, toasts),
  `--dur-3` 320ms (sheets). Easing `--ease-out: cubic-bezier(.2,.8,.2,1)`.
- Motion explains state: the status timeline fills upward when an order advances, a
  sheet slides from the bottom, a toast drops in. No decorative loops.
- The only looping animation is the landing page bag riding the elevator, and it stops
  under `prefers-reduced-motion`. All transforms and transitions are disabled under reduced motion.
- No pulsing "live" dots. Live status is shown with words and the timeline.

## 7. Iconography

- **Lucide**, 20px, 1.75 stroke, `currentColor`. Used where it speeds scanning: nav,
  list leading icons for spot type, buttons with ambiguous verbs. Not as decoration, not
  as feature bullets.
- Custom inline SVG: logo, bag, `FloorBadge`, tower cross-section. These carry the brand.
- **No emoji** anywhere in the UI.

## 8. Components (src/components/ui)

| Component | Notes |
|---|---|
| `Button` | Variants: `primary` (mustard), `ink` (ink fill), `secondary` (outline), `ghost`, `danger`. Sizes sm/md/lg. States: hover, pressed (translateY 1px + darker), focus-visible ring, disabled (40% + not-allowed), loading (inline spinner, label kept for width). Radius-sm. |
| `Field`, `Input`, `Select`, `Textarea` | Label always visible above. Hint below in ink-3. Error replaces hint in danger with an icon, and `aria-invalid`/`aria-describedby` wired. |
| `PasswordInput` | Show/hide toggle (button, labelled), optional strength meter (4 segments). |
| `Checkbox`, `Switch`, `Segmented` | Native inputs underneath for a11y. |
| `Sheet` | Bottom sheet on mobile, centered panel on ≥ md. Focus trapped, Esc closes, scroll locked. |
| `Toast` | Bottom-center above nav. Success/error/info. Auto-dismiss 4s, `role=status`. |
| `List`, `Row` | Edge-to-edge rows separated by 1px lines. The default for anything list-shaped. |
| `Skeleton` | Shaped like the content it replaces (row skeleton, order skeleton). |
| `EmptyState` | Small custom mark, one line of copy with a voice, one action. |
| `FloorBadge` | ▲ + floor number, boxed, condensed, tabular. |
| `Money` | Tabular, `$X.XX`, optional strike-through for refunded. |
| `BottomNav` / `SideNav` | Home · Orders · Run · Profile (+ Admin). Active = ink text + 3px mustard bar. |
| `PageHeader` | Left-aligned title in display face, optional back link and action. |

## 9. Layout

- Mobile first, 390px design width. App screens: single column, max 640px on desktop,
  with a left side rail nav at ≥ md (bottom nav on mobile).
- Admin: wide layout (max 1200px), tables instead of lists, filters in a top bar.
- A 4-column grid on mobile, 12 on desktop. Content aligns to the gutter; nothing floats.

## 10. Accessibility

- WCAG AA contrast for all text in both themes (checked values in the color table).
- Visible focus: 2px ink outline + 2px paper offset (dark: inverted). Never removed.
- Every input has a label; errors are announced; icon buttons have `aria-label`.
- Tap targets ≥ 44px. Keyboard reachable sheets/menus with Esc to close.

## 11. Banned patterns (checked in DESIGN_AUDIT.md)

Purple/indigo/violet anything; gradients and gradient text; mesh or blurred-blob
backgrounds; glassmorphism and decorative backdrop-blur; soft gray shadows on cards;
everything-in-a-card; colored left-border accent cards; decorative or pulsing status
dots; emoji as icons or bullets; the pill-badge + centered-headline + two-buttons +
3-up-icon-cards + fake-testimonials + gradient-CTA landing template; all-pill buttons;
centered headings everywhere; identical stacked sections; fake stats, testimonials,
logos, lorem ipsum, stock people; the banned copy words; em-dashes in UI copy.
