import { describe, expect, it } from "vitest";
import { coverageMap, nextCoveredWindow, shouldSuspend, suggestBatches, unclaimEarnsStrike, type Job } from "@/lib/domain/runners";
import { haversineMiles } from "@/lib/domain/geo";

describe("strikes and suspension", () => {
  it("suspends at the threshold (default 3)", () => {
    expect(shouldSuspend(2, 3)).toBe(false);
    expect(shouldSuspend(3, 3)).toBe(true);
    expect(shouldSuspend(4, 3)).toBe(true);
  });
  it("respects a configured threshold", () => {
    expect(shouldSuspend(4, 5)).toBe(false);
    expect(shouldSuspend(5, 5)).toBe(true);
  });
  it("first unclaim per week is free, repeats strike", () => {
    expect(unclaimEarnsStrike(1, 1)).toBe(false);
    expect(unclaimEarnsStrike(2, 1)).toBe(true);
    expect(unclaimEarnsStrike(3, 1)).toBe(true);
    expect(unclaimEarnsStrike(1, 0)).toBe(true);
  });
});

describe("batch suggestions", () => {
  const job = (id: string, spot: string, lat: number, lng: number, building: string, floor: number, t: number): Job => ({
    id, spotId: spot, spotLat: lat, spotLng: lng, buildingId: building, floor, createdAt: new Date(t),
  });

  it("groups same-spot orders to the same building, sorted by floor", () => {
    const b = suggestBatches(
      [job("a", "s1", 40.73, -73.99, "tower", 14, 1), job("b", "s1", 40.73, -73.99, "tower", 7, 2), job("c", "s1", 40.73, -73.99, "mercer", 3, 3)],
      4,
      haversineMiles,
    );
    expect(b).toHaveLength(1);
    expect(b[0].jobs.map((j) => j.floor)).toEqual([7, 14]);
    expect(b[0].buildingId).toBe("tower");
  });

  it("includes nearby spots but not far ones", () => {
    const b = suggestBatches(
      [job("a", "s1", 40.73, -73.99, "tower", 4, 1), job("b", "s2", 40.7303, -73.99, "tower", 9, 2), job("c", "s3", 40.735, -73.99, "tower", 2, 3)],
      4,
      haversineMiles,
    );
    expect(b).toHaveLength(1);
    expect(b[0].jobs.map((j) => j.id).sort()).toEqual(["a", "b"]);
  });

  it("caps batch size at the runner's remaining capacity", () => {
    const jobs = [1, 2, 3, 4, 5].map((i) => job(`j${i}`, "s1", 40.73, -73.99, "tower", i, i));
    const b = suggestBatches(jobs, 2, haversineMiles);
    expect(b.every((x) => x.jobs.length <= 2)).toBe(true);
    expect(suggestBatches(jobs, 1, haversineMiles)).toEqual([]);
  });
});

describe("shift coverage", () => {
  const cov = coverageMap([
    { runnerId: "r1", day: 2, hour: 20 },
    { runnerId: "r1", day: 2, hour: 21 },
    { runnerId: "r2", day: 2, hour: 21 },
    { runnerId: "r1", day: 0, hour: 1 },
  ]);
  it("counts runners per slot", () => {
    expect(cov.get("2-21")).toBe(2);
    expect(cov.get("2-20")).toBe(1);
  });
  it("finds the next covered window and its length", () => {
    expect(nextCoveredWindow(cov, { weekday: 2, hour: 15 })).toEqual({ day: 2, startHour: 20, hours: 2, daysAhead: 0 });
  });
  it("wraps across the week", () => {
    expect(nextCoveredWindow(cov, { weekday: 3, hour: 0 })).toEqual({ day: 0, startHour: 1, hours: 1, daysAhead: 4 });
  });
  it("returns null with no shifts", () => {
    expect(nextCoveredWindow(new Map(), { weekday: 1, hour: 9 })).toBeNull();
  });
});
