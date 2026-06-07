import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./extractors/registry.js", () => ({
  listRegisteredExtractors: vi.fn(),
}));

import { listRegisteredExtractors } from "./extractors/registry.js";
import { buildTasteProfile } from "./build-profile.js";
import { buildHeardIndex } from "./heard.js";
import type { SignalExtractor } from "./types.js";

const mList = vi.mocked(listRegisteredExtractors);
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

beforeEach(() => vi.clearAllMocks());

describe("buildTasteProfile", () => {
  it("merges eligible extractor outputs into a TasteProfile", async () => {
    const extractor: SignalExtractor = {
      id: "listening-history",
      extract: vi.fn().mockResolvedValue({
        genreAffinity: [{ genre: "jazz", weight: 1 }],
        heard: buildHeardIndex([]),
      }),
    };
    mList.mockReturnValue([extractor]);

    const profile = await buildTasteProfile("user-1", { log, now: 123 });

    expect(profile.userId).toBe("user-1");
    expect(profile.genreAffinity).toEqual([{ genre: "jazz", weight: 1 }]);
    expect(profile.computedAt).toBe(123);
    expect(profile.adjacency).toEqual({ tags: [], artists: [] });
  });

  it("skips extractors whose isEligible returns false", async () => {
    const eligible: SignalExtractor = {
      id: "a",
      extract: vi
        .fn()
        .mockResolvedValue({ genreAffinity: [{ genre: "a", weight: 1 }] }),
    };
    const ineligible: SignalExtractor = {
      id: "b",
      isEligible: () => false,
      extract: vi
        .fn()
        .mockResolvedValue({ genreAffinity: [{ genre: "b", weight: 1 }] }),
    };
    mList.mockReturnValue([eligible, ineligible]);

    const profile = await buildTasteProfile("user-1", { log, now: 1 });

    expect(ineligible.extract).not.toHaveBeenCalled();
    expect(profile.genreAffinity).toEqual([{ genre: "a", weight: 1 }]);
  });
});
