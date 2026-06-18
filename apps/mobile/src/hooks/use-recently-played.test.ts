import { recentlyPlayedToHomeItems } from "./use-recently-played";

describe("recentlyPlayedToHomeItems", () => {
  it("maps an album item to a HomeAlbum shape", () => {
    const [item] = recentlyPlayedToHomeItems([
      {
        kind: "album",
        id: "al-1",
        title: "Rumours",
        artistName: "Fleetwood Mac",
        releaseYear: 1977,
        coverArtUrl: "/c.jpg",
        lastPlayedAt: 1,
      },
    ]);
    expect(item).toMatchObject({
      id: "al-1",
      title: "Rumours",
      artistName: "Fleetwood Mac",
      artUrl: "/c.jpg",
    });
    // Discriminator the QuickStartGrid relies on.
    expect(item && "title" in item).toBe(true);
  });

  it("maps a playlist item to a HomePlaylist shape", () => {
    const [item] = recentlyPlayedToHomeItems([
      {
        kind: "playlist",
        id: "pl-1",
        name: "Chill",
        trackCount: 9,
        coverArtUrls: ["/a.jpg", "/b.jpg"],
        lastPlayedAt: 2,
      },
    ]);
    expect(item).toMatchObject({
      id: "pl-1",
      name: "Chill",
      trackCount: 9,
      artUrls: ["/a.jpg", "/b.jpg"],
    });
  });

  it("preserves the order of the source items", () => {
    const items = recentlyPlayedToHomeItems([
      {
        kind: "playlist",
        id: "pl-1",
        name: "A",
        trackCount: 1,
        coverArtUrls: [],
        lastPlayedAt: 3,
      },
      {
        kind: "album",
        id: "al-1",
        title: "B",
        artistName: "x",
        releaseYear: null,
        coverArtUrl: null,
        lastPlayedAt: 2,
      },
    ]);
    expect(items.map((i) => i.id)).toEqual(["pl-1", "al-1"]);
  });
});
