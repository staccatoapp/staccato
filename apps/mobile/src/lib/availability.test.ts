import type { UnifiedAlbumDetail } from "@staccato/shared";

import {
  albumServerAvailability,
  availabilityFromCounts,
  availabilityFromPending,
} from "./availability";

function localAlbum(
  pendingTrackCount: number,
  trackCount = 2,
): UnifiedAlbumDetail {
  return {
    source: "local",
    album: { pendingTrackCount },
    tracks: Array.from({ length: trackCount }, (_, i) => ({ id: `t-${i}` })),
  } as unknown as UnifiedAlbumDetail;
}

function externalAlbum(): UnifiedAlbumDetail {
  return {
    source: "external",
    album: {},
    tracks: [{ id: "t-0" }, { id: "t-1" }],
  } as unknown as UnifiedAlbumDetail;
}

describe("albumServerAvailability", () => {
  it("reports inLibrary for a local album with no pending tracks", () => {
    expect(albumServerAvailability(localAlbum(0))).toBe("inLibrary");
  });

  it("reports partial for a local album with pending tracks", () => {
    expect(albumServerAvailability(localAlbum(1))).toBe("partial");
  });

  it("reports recommended for an external album", () => {
    expect(albumServerAvailability(externalAlbum())).toBe("recommended");
  });
});

describe("availabilityFromPending", () => {
  it("is inLibrary when nothing is pending", () => {
    expect(availabilityFromPending(0)).toBe("inLibrary");
  });

  it("is partial when at least one track is pending", () => {
    expect(availabilityFromPending(3)).toBe("partial");
  });
});

describe("availabilityFromCounts", () => {
  it("is recommended when none of the tracks are owned", () => {
    expect(availabilityFromCounts(0, 12)).toBe("recommended");
  });

  it("is partial when some but not all tracks are owned", () => {
    expect(availabilityFromCounts(5, 12)).toBe("partial");
  });

  it("is inLibrary when every track is owned", () => {
    expect(availabilityFromCounts(12, 12)).toBe("inLibrary");
  });

  it("treats an empty collection as inLibrary (nothing missing)", () => {
    expect(availabilityFromCounts(0, 0)).toBe("inLibrary");
  });
});
