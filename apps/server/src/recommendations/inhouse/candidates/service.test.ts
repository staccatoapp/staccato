import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lastfm/client.js", () => ({
  getTopTracksForTag: vi.fn(),
}));

import { getTopTracksForTag } from "../../../lastfm/client.js";
import { candidateService } from "./service.js";

const mTop = vi.mocked(getTopTracksForTag);

beforeEach(() => vi.clearAllMocks());

describe("candidateService.popularTracksForTag", () => {
  it("normalises client tracks, stamping popularityRank from the index", async () => {
    mTop.mockResolvedValue([
      { name: "Alright", artist: "Kendrick Lamar", mbid: "m1" },
      { name: "Nuvole Bianche", artist: "Ludovico", mbid: null },
    ]);

    const out = await candidateService.popularTracksForTag("hip-hop");

    expect(out).toEqual([
      {
        name: "Alright",
        artist: "Kendrick Lamar",
        mbid: "m1",
        popularityRank: 0,
      },
      {
        name: "Nuvole Bianche",
        artist: "Ludovico",
        mbid: null,
        popularityRank: 1,
      },
    ]);
    expect(mTop).toHaveBeenCalledWith("hip-hop");
  });

  it("returns [] when the client yields nothing", async () => {
    mTop.mockResolvedValue([]);
    expect(await candidateService.popularTracksForTag("obscure")).toEqual([]);
  });
});
