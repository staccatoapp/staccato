import { describe, expect, it } from "vitest";
import { normalizeString } from "./normalize.js";

// Characterization tests: these freeze current behavior of normalizeString so
// any future change to the normalization logic surfaces as a failing test.

describe("normalizeString", () => {
  it("lowercases the input", () => {
    expect(normalizeString("HELLO WORLD")).toBe("hello world");
  });

  it("lowercases mixed-case input", () => {
    expect(normalizeString("ThE QuIcK BrOwN FoX")).toBe("the quick brown fox");
  });

  it("maps ASCII hyphens to spaces", () => {
    expect(normalizeString("Jay-Z")).toBe("jay z");
  });

  it("maps Unicode en dash (–) to a space", () => {
    expect(normalizeString("track–one")).toBe("track one");
  });

  it("maps Unicode em dash (—) to a space", () => {
    expect(normalizeString("track—one")).toBe("track one");
  });

  it("maps Unicode hyphen (‐) to a space", () => {
    expect(normalizeString("track‐one")).toBe("track one");
  });

  it("maps Unicode non-breaking hyphen (‑) to a space", () => {
    expect(normalizeString("track‑one")).toBe("track one");
  });

  it("maps Unicode figure dash (‒) to a space", () => {
    expect(normalizeString("track‒one")).toBe("track one");
  });

  it("maps Unicode horizontal bar (―) to a space", () => {
    expect(normalizeString("track―one")).toBe("track one");
  });

  it("strips accented characters entirely rather than folding them (current behavior)", () => {
    // known limitation: 'é' is removed rather than converted to 'e'
    expect(normalizeString("Beyoncé")).toBe("beyonc");
  });

  it("strips accented characters in a longer word", () => {
    expect(normalizeString("café")).toBe("caf");
  });

  it("removes punctuation", () => {
    expect(normalizeString("Hello, World!")).toBe("hello world");
  });

  it("removes punctuation such as periods and apostrophes", () => {
    expect(normalizeString("don't stop")).toBe("dont stop");
  });

  it("collapses multiple spaces into one", () => {
    expect(normalizeString("hello   world")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeString("  hello world  ")).toBe("hello world");
  });

  it("trims and collapses whitespace together", () => {
    expect(normalizeString("  hello   world  ")).toBe("hello world");
  });

  it("handles an already-normalized string with no changes", () => {
    expect(normalizeString("hello world")).toBe("hello world");
  });

  it("returns an empty string for an empty input", () => {
    expect(normalizeString("")).toBe("");
  });

  it("returns an empty string for a whitespace-only input", () => {
    expect(normalizeString("   ")).toBe("");
  });

  it("preserves digits", () => {
    expect(normalizeString("Track 1")).toBe("track 1");
  });

  it("handles a dash-to-space conversion that creates multiple spaces, then collapses them", () => {
    expect(normalizeString("a - b")).toBe("a b");
  });
});
