// Characterization tests: freeze the behavior of parsePagination, which is
// called on every paginated API route.

import { describe, expect, it } from "vitest";
import { parsePagination } from "./pagination.js";

describe("parsePagination", () => {
  it("returns defaults when both params are missing", () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
  });

  it("parses string limit and offset", () => {
    expect(parsePagination({ limit: "20", offset: "10" })).toEqual({
      limit: 20,
      offset: 10,
    });
  });

  it("parses numeric limit and offset", () => {
    expect(parsePagination({ limit: 20, offset: 10 })).toEqual({
      limit: 20,
      offset: 10,
    });
  });

  it("caps limit at 200 when the value exceeds MAX_LIMIT", () => {
    expect(parsePagination({ limit: "300" })).toEqual({ limit: 200, offset: 0 });
  });

  it("falls back to default limit of 50 when limit is non-numeric", () => {
    expect(parsePagination({ limit: "abc" })).toEqual({ limit: 50, offset: 0 });
  });

  it("falls back to offset 0 when offset is non-numeric", () => {
    expect(parsePagination({ offset: "abc" })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it("falls back to default limit when limit is '0' (falsy number quirk)", () => {
    // Number("0") is 0, which is falsy; || DEFAULT_LIMIT kicks in.
    // This is a known quirk — callers should not pass limit=0 to mean "no limit".
    expect(parsePagination({ limit: "0" })).toEqual({ limit: 50, offset: 0 });
  });

  it("accepts explicit offset of 0 without falling back", () => {
    // offset uses the same || pattern but 0 is a valid offset
    expect(parsePagination({ limit: "1", offset: "0" })).toEqual({
      limit: 1,
      offset: 0,
    });
  });

  it("accepts undefined values gracefully (same as missing)", () => {
    expect(parsePagination({ limit: undefined, offset: undefined })).toEqual({
      limit: 50,
      offset: 0,
    });
  });
});
