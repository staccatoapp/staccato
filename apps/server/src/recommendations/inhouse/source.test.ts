import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/server-config.js", () => ({
  serverConfig: { get: vi.fn() },
}));
vi.mock("./profile/build-profile.js", () => ({
  buildTasteProfile: vi.fn(),
}));
vi.mock("./generators/registry.js", () => ({
  listRegisteredGenerators: vi.fn(),
  registerGenerator: vi.fn(), // called by the generators/index.js side-effect
}));
vi.mock("./resolution/resolve.js", () => ({
  resolvePlaylists: vi.fn(),
}));

import { serverConfig } from "../../config/server-config.js";
import { buildTasteProfile } from "./profile/build-profile.js";
import { listRegisteredGenerators } from "./generators/registry.js";
import { resolvePlaylists } from "./resolution/resolve.js";
import { buildHeardIndex } from "./profile/heard.js";
import type { TasteProfile } from "./profile/types.js";
import type { Generator } from "./generators/types.js";
import type { RecommendedPlaylist } from "@staccato/shared";
import type { UserSettingsRow } from "../../db/queries/settings.js";
import { inhouseSource } from "./source.js";

const mConfig = vi.mocked(serverConfig.get);
const mBuild = vi.mocked(buildTasteProfile);
const mGenerators = vi.mocked(listRegisteredGenerators);
const mResolve = vi.mocked(resolvePlaylists);

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

function configWithKey(apiKey: string | null) {
  mConfig.mockReturnValue({
    lastfm: { apiKey, secret: null },
  } as ReturnType<typeof serverConfig.get>);
}

const emptyProfile: TasteProfile = {
  userId: "u1",
  genreAffinity: [],
  artistAffinity: [],
  albumAffinity: [],
  decadeAffinity: [],
  adjacency: { tags: [], artists: [] },
  heard: buildHeardIndex([]),
  computedAt: 0,
};

const validPlaylist: RecommendedPlaylist = {
  id: "inhouse:genre:rock",
  name: "Rock Mix",
  description: "d",
  trackCount: 1,
  tracks: [
    {
      recordingMbid: "m",
      title: "t",
      artistName: "a",
      artistMbid: null,
      albumTitle: null,
      releaseGroupMbid: null,
      durationMs: null,
      coverArtUrl: null,
      inLibrary: false,
      localTrackId: null,
    },
  ],
  coverArtUrl: null,
  expiresAt: null,
  source: "staccato",
};

beforeEach(() => {
  vi.clearAllMocks();
  configWithKey("api-key");
  mBuild.mockResolvedValue(emptyProfile);
  mResolve.mockResolvedValue([]);
});

describe("inhouseSource.isEligible", () => {
  it("is eligible when a server-global Last.fm api key is configured", () => {
    configWithKey("api-key");
    expect(inhouseSource.isEligible({} as UserSettingsRow)).toBe(true);
  });

  it("is ineligible when no Last.fm api key is configured", () => {
    configWithKey(null);
    expect(inhouseSource.isEligible({} as UserSettingsRow)).toBe(false);
  });
});

describe("inhouseSource.buildContext", () => {
  it("carries the user id for profile identity", () => {
    expect(
      inhouseSource.buildContext({ userId: "user-42" } as UserSettingsRow),
    ).toEqual({ userId: "user-42" });
  });
});

describe("inhouseSource.fetch", () => {
  it("runs applicable generators, collects specs, resolves and validates", async () => {
    const applicable: Generator = {
      id: "applicable",
      isApplicable: vi.fn(() => true),
      generate: vi.fn().mockResolvedValue([
        {
          id: "inhouse:genre:rock",
          name: "Rock Mix",
          description: "d",
          candidates: [],
        },
      ]),
    };
    const inapplicable: Generator = {
      id: "inapplicable",
      isApplicable: vi.fn(() => false),
      generate: vi.fn(),
    };
    mGenerators.mockReturnValue([applicable, inapplicable]);
    mResolve.mockResolvedValue([validPlaylist]);

    const out = await inhouseSource.fetch({ userId: "u1" }, log as never);

    expect(mBuild).toHaveBeenCalledWith("u1", expect.objectContaining({ log }));
    expect(inapplicable.generate).not.toHaveBeenCalled();
    expect(mResolve).toHaveBeenCalledWith(
      [
        {
          id: "inhouse:genre:rock",
          name: "Rock Mix",
          description: "d",
          candidates: [],
        },
      ],
      log,
    );
    expect(out).toEqual([validPlaylist]);
  });

  it("returns an empty array on cold start (no applicable generator)", async () => {
    mGenerators.mockReturnValue([]);
    const out = await inhouseSource.fetch({ userId: "u1" }, log as never);
    expect(out).toEqual([]);
    expect(mResolve).toHaveBeenCalledWith([], log);
  });

  it("skips a generator that throws, without failing the whole fetch", async () => {
    const boom: Generator = {
      id: "boom",
      isApplicable: () => true,
      generate: vi.fn().mockRejectedValue(new Error("lastfm down")),
    };
    mGenerators.mockReturnValue([boom]);

    const out = await inhouseSource.fetch({ userId: "u1" }, log as never);

    expect(out).toEqual([]);
    expect(log.warn).toHaveBeenCalled();
  });
});
