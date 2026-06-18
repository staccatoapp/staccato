import { describe, it, expect } from "vitest";
import {
  RecentlyPlayedItemSchema,
  RecentlyPlayedResponseSchema,
} from "./recently-played.js";

const albumItem = {
  kind: "album" as const,
  id: "album-1",
  title: "Rumours",
  artistName: "Fleetwood Mac",
  releaseYear: 1977,
  coverArtUrl: "/metadata/cover/album-1.jpg",
  lastPlayedAt: 1_700_000_000_000,
};

const playlistItem = {
  kind: "playlist" as const,
  id: "playlist-1",
  name: "Late Nights",
  trackCount: 12,
  coverArtUrls: ["/metadata/cover/a.jpg", "/metadata/cover/b.jpg"],
  lastPlayedAt: 1_700_000_100_000,
};

describe("RecentlyPlayedItemSchema", () => {
  it("accepts a valid album item", () => {
    expect(RecentlyPlayedItemSchema.safeParse(albumItem).success).toBe(true);
  });

  it("accepts a valid playlist item", () => {
    expect(RecentlyPlayedItemSchema.safeParse(playlistItem).success).toBe(true);
  });

  it("accepts a null releaseYear / coverArtUrl on an album", () => {
    const result = RecentlyPlayedItemSchema.safeParse({
      ...albumItem,
      releaseYear: null,
      coverArtUrl: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const result = RecentlyPlayedItemSchema.safeParse({
      ...albumItem,
      kind: "artist",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a playlist missing coverArtUrls", () => {
    const { coverArtUrls: _omit, ...rest } = playlistItem;
    expect(RecentlyPlayedItemSchema.safeParse(rest).success).toBe(false);
  });
});

describe("RecentlyPlayedResponseSchema", () => {
  it("accepts a mixed list of albums and playlists", () => {
    const result = RecentlyPlayedResponseSchema.safeParse({
      items: [playlistItem, albumItem],
    });
    expect(result.success).toBe(true);
  });
});
