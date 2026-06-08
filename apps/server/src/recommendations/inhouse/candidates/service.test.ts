import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lastfm/client.js", () => ({
  getTopTracksForTag: vi.fn(),
  getTopTracksForArtist: vi.fn(),
}));

import {
  getTopTracksForTag,
  getTopTracksForArtist,
} from "../../../lastfm/client.js";
import { candidateService } from "./service.js";

const mTop = vi.mocked(getTopTracksForTag);
const mArtist = vi.mocked(getTopTracksForArtist);

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

describe("candidateService.topTracksForArtist", () => {
  it("normalises client tracks, stamping popularityRank from the index", async () => {
    mArtist.mockResolvedValue([
      { name: "HUMBLE.", artist: "Kendrick Lamar", mbid: "m1" },
      { name: "DNA.", artist: "Kendrick Lamar", mbid: null },
    ]);

    const out = await candidateService.topTracksForArtist(
      "Kendrick Lamar",
      "artist-mbid",
    );

    expect(out).toEqual([
      {
        name: "HUMBLE.",
        artist: "Kendrick Lamar",
        mbid: "m1",
        popularityRank: 0,
      },
      { name: "DNA.", artist: "Kendrick Lamar", mbid: null, popularityRank: 1 },
    ]);
    expect(mArtist).toHaveBeenCalledWith({
      artist: "Kendrick Lamar",
      mbid: "artist-mbid",
    });
  });

  it("addresses by name only when no mbid is given", async () => {
    mArtist.mockResolvedValue([]);
    await candidateService.topTracksForArtist("Some Neighbour");
    expect(mArtist).toHaveBeenCalledWith({
      artist: "Some Neighbour",
      mbid: null,
    });
  });
});
