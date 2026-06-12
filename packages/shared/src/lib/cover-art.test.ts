import { describe, expect, it } from "vitest";
import { topFrequentKeys } from "./cover-art.js";

describe("topFrequentKeys", () => {
  it("returns an empty array for empty input", () => {
    expect(topFrequentKeys([])).toEqual([]);
  });

  it("ranks keys by frequency, most frequent first", () => {
    expect(topFrequentKeys(["a", "b", "a", "c", "a", "b"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("breaks frequency ties by first appearance (stable)", () => {
    // b and a both appear twice; b is seen first, so it ranks first.
    expect(topFrequentKeys(["b", "a", "b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("drops null, undefined, and empty-string keys", () => {
    expect(topFrequentKeys(["a", null, undefined, "", "a"])).toEqual(["a"]);
  });

  it("respects the limit", () => {
    expect(topFrequentKeys(["a", "b", "c", "d", "e"], 4)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("returns all ranked keys when no limit is given", () => {
    expect(topFrequentKeys(["a", "b", "c", "d", "e"])).toHaveLength(5);
  });
});
