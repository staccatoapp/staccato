import { describe, it, expect } from "vitest";
import { MBID_RE } from "./id-patterns.js";

describe("MBID_RE", () => {
  it("matches a valid mbid", () => {
    expect(MBID_RE.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });
  it("matches uppercase hex", () => {
    expect(MBID_RE.test("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });
  it("rejects missing dashes", () => {
    expect(MBID_RE.test("550e8400e29b41d4a716446655440000")).toBe(false);
  });
  it("rejects wrong segment lengths", () => {
    expect(MBID_RE.test("550e8400-e29b-41d4-a716-4466554400")).toBe(false);
  });
  it("rejects non-hex characters", () => {
    expect(MBID_RE.test("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
  });
});
