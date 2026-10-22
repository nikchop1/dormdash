import { describe, expect, it } from "vitest";
import { formatMiles, haversineMiles, roundMiles } from "@/lib/domain/geo";
import { fromNyWallClock, nyParts } from "@/lib/domain/time";

describe("haversine distance", () => {
  it("is zero for the same point", () => {
    expect(haversineMiles({ lat: 40.73, lng: -73.99 }, { lat: 40.73, lng: -73.99 })).toBe(0);
  });

  it("matches a known distance (Washington Sq Arch to Empire State Building ~1.8 mi)", () => {
    const d = haversineMiles({ lat: 40.73116, lng: -73.99706 }, { lat: 40.74844, lng: -73.98566 });
    expect(d).toBeGreaterThan(1.3);
    expect(d).toBeLessThan(1.4); // straight-line, not walking distance
  });

  it("one block north-south on Manhattan is about 0.05 mi", () => {
    const d = haversineMiles({ lat: 40.7308, lng: -73.9973 }, { lat: 40.7315, lng: -73.9973 });
    expect(roundMiles(d)).toBeCloseTo(0.048, 2);
  });

  it("is symmetric", () => {
    const a = { lat: 40.7339, lng: -73.9962 };
    const b = { lat: 40.7287, lng: -73.9967 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 10);
  });

  it("formats short distances in feet", () => {
    expect(formatMiles(0.05)).toBe("260 ft");
    expect(formatMiles(0.21)).toBe("0.21 mi");
  });
});

describe("New York time helpers", () => {
  it("round-trips wall clock across DST", () => {
    for (const [y, m, d, h] of [
      [2026, 1, 15, 21],
      [2026, 7, 4, 23],
      [2026, 11, 2, 12],
    ]) {
      const t = fromNyWallClock(y, m, d, h, 30);
      const p = nyParts(t);
      expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([y, m, d, h, 30]);
    }
  });
  it("knows the weekday", () => {
    expect(nyParts(fromNyWallClock(2026, 10, 22, 12, 0)).weekday).toBe(4); // Thursday
  });
});
