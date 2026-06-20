import {
  isSortKeyValidForTab,
  resolveAlbumSort,
  resolveArtistSort,
  resolveInitialTab,
  resolvePlaylistSort,
  sortOptionsForTab,
} from "./library-sort";

describe("sortOptionsForTab", () => {
  it("offers all four keys for albums", () => {
    expect(sortOptionsForTab("albums").map((o) => o.id)).toEqual([
      "createdAt",
      "title",
      "artist",
      "year",
    ]);
  });

  it("offers only createdAt + title for artists and playlists", () => {
    expect(sortOptionsForTab("artists").map((o) => o.id)).toEqual([
      "createdAt",
      "title",
    ]);
    expect(sortOptionsForTab("playlists").map((o) => o.id)).toEqual([
      "createdAt",
      "title",
    ]);
  });
});

describe("isSortKeyValidForTab", () => {
  it("accepts artist/year only on the albums tab", () => {
    expect(isSortKeyValidForTab("albums", "year")).toBe(true);
    expect(isSortKeyValidForTab("albums", "artist")).toBe(true);
    expect(isSortKeyValidForTab("artists", "year")).toBe(false);
    expect(isSortKeyValidForTab("artists", "artist")).toBe(false);
    expect(isSortKeyValidForTab("playlists", "title")).toBe(true);
  });
});

describe("resolveAlbumSort", () => {
  it("passes every pill through unchanged (all keys are valid for albums)", () => {
    expect(resolveAlbumSort("createdAt")).toBe("createdAt");
    expect(resolveAlbumSort("title")).toBe("title");
    expect(resolveAlbumSort("artist")).toBe("artist");
    expect(resolveAlbumSort("year")).toBe("year");
  });
});

describe("resolveArtistSort", () => {
  it("maps title and artist to name sort, everything else to createdAt", () => {
    expect(resolveArtistSort("title")).toBe("title");
    expect(resolveArtistSort("artist")).toBe("title");
    expect(resolveArtistSort("createdAt")).toBe("createdAt");
    expect(resolveArtistSort("year")).toBe("createdAt");
  });
});

describe("resolvePlaylistSort", () => {
  it("maps title to name sort, everything else (artist/year) to createdAt", () => {
    expect(resolvePlaylistSort("title")).toBe("title");
    expect(resolvePlaylistSort("createdAt")).toBe("createdAt");
    expect(resolvePlaylistSort("artist")).toBe("createdAt");
    expect(resolvePlaylistSort("year")).toBe("createdAt");
  });
});

describe("resolveInitialTab", () => {
  it("returns a valid tab param unchanged", () => {
    expect(resolveInitialTab("playlists")).toBe("playlists");
    expect(resolveInitialTab("artists")).toBe("artists");
    expect(resolveInitialTab("albums")).toBe("albums");
  });

  it("defaults to albums for missing or unknown params", () => {
    expect(resolveInitialTab(undefined)).toBe("albums");
    expect(resolveInitialTab("")).toBe("albums");
    expect(resolveInitialTab("nonsense")).toBe("albums");
  });
});
