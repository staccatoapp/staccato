import { describe, it, expect } from "vitest";
import { AcoustIdResponseSchema } from "./acoustid.js";

describe("AcoustIdResponseSchema", () => {
  it("accepts a valid response with results and recordings", () => {
    const result = AcoustIdResponseSchema.safeParse({
      status: "ok",
      results: [
        {
          score: 0.9,
          recordings: [
            {
              id: "abc-123",
              title: "Song",
              duration: 240,
              artists: [{ id: "artist-1", name: "Artist", joinphrase: "" }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a response with no results field", () => {
    const result = AcoustIdResponseSchema.safeParse({ status: "ok" });
    expect(result.success).toBe(true);
  });

  it("accepts an error status response", () => {
    const result = AcoustIdResponseSchema.safeParse({ status: "error" });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing the status field", () => {
    const result = AcoustIdResponseSchema.safeParse({ results: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a result whose score is not a number", () => {
    const result = AcoustIdResponseSchema.safeParse({
      status: "ok",
      results: [{ score: "high" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a recording missing its id", () => {
    const result = AcoustIdResponseSchema.safeParse({
      status: "ok",
      results: [{ score: 0.9, recordings: [{ title: "Song" }] }],
    });
    expect(result.success).toBe(false);
  });
});
