import { describe, expect, it } from "vitest";
import { getSliderValue } from "./slider";

describe("getSliderValue", () => {
  it("returns a number value directly", () => {
    expect(getSliderValue(42, 0)).toBe(42);
  });

  it("returns first element of an array", () => {
    expect(getSliderValue([42, 100], 0)).toBe(42);
  });

  it("returns fallback when array is empty", () => {
    expect(getSliderValue([], 5)).toBe(5);
  });

  it("returns 0 for a single-element array containing 0", () => {
    expect(getSliderValue([0], 5)).toBe(0);
  });

  it("returns 0 number value directly", () => {
    expect(getSliderValue(0, 99)).toBe(0);
  });
});
