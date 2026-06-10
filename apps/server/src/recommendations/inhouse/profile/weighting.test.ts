import { describe, expect, it } from "vitest";
import {
  RECENCY_HALF_LIFE_DAYS,
  recencyDecay,
  trackWeight,
} from "./weighting.js";

const DAY = 24 * 60 * 60 * 1000;

describe("recencyDecay", () => {
  it("is 1.0 for a listen happening now", () => {
    const now = 1_000 * DAY;
    expect(recencyDecay(now, now)).toBeCloseTo(1, 5);
  });

  it("is 0.5 at exactly one half-life", () => {
    const now = 1_000 * DAY;
    const past = now - RECENCY_HALF_LIFE_DAYS * DAY;
    expect(recencyDecay(past, now)).toBeCloseTo(0.5, 5);
  });

  it("clamps future timestamps to 1.0 (never amplifies)", () => {
    const now = 1_000 * DAY;
    expect(recencyDecay(now + 5 * DAY, now)).toBeCloseTo(1, 5);
  });
});

describe("trackWeight", () => {
  it("multiplies play count by recency decay", () => {
    const now = 1_000 * DAY;
    const past = now - RECENCY_HALF_LIFE_DAYS * DAY; // decay 0.5
    expect(trackWeight(10, past, now)).toBeCloseTo(5, 5);
  });

  it("recent heavy listening outweighs old heavy listening", () => {
    const now = 1_000 * DAY;
    const recent = trackWeight(5, now - 1 * DAY, now);
    const old = trackWeight(5, now - 120 * DAY, now);
    expect(recent).toBeGreaterThan(old);
  });
});
