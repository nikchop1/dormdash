export const TZ = "America/New_York";

/** Current time. A function so server components can call it without tripping render-purity lint. */
export const nowMs = () => Date.now();

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Wall-clock parts of a moment in New York. */
export function nyParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    weekday: WEEKDAYS.indexOf(p.weekday as string),
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    minuteOfDay: Number(p.hour) * 60 + Number(p.minute),
    dateKey: `${p.year}-${p.month}-${p.day}`,
  };
}

/** Offset (minutes) of New York from UTC at a given instant, e.g. -240 in summer. */
export function nyOffsetMinutes(d: Date): number {
  const p = nyParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/** The UTC instant for a New York wall-clock time. */
export function fromNyWallClock(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const off = nyOffsetMinutes(guess);
  const result = new Date(guess.getTime() - off * 60000);
  // Re-check across a DST boundary.
  const off2 = nyOffsetMinutes(result);
  return off2 === off ? result : new Date(guess.getTime() - off2 * 60000);
}

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

export const fmtTime = (d: Date | string) => timeFmt.format(new Date(d)).replace(" ", " ").toLowerCase();
export const fmtDate = (d: Date | string) => dateFmt.format(new Date(d));
export const fmtDateTime = (d: Date | string) => dateTimeFmt.format(new Date(d)).replace(" AM", "am").replace(" PM", "pm");

/** "Today", "Tomorrow", or a weekday name, relative to now in New York. */
export function relativeDay(d: Date, now = new Date()): string {
  const a = nyParts(d);
  const b = nyParts(now);
  const dayMs = 86400000;
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  const diff = Math.round((da - db) / dayMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return DAY_NAMES[a.weekday];
  return fmtDate(d);
}

export function hourLabel(h: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${h < 12 ? "am" : "pm"}`;
}

export function minutesBetween(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / 60000;
}
