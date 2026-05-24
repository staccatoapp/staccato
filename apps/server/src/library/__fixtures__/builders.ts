import type {
  ArtistCredit,
  RawTags,
  RecordingCandidate,
  ReleaseCandidate,
} from "../types.js";

export function makeTags(overrides: Partial<RawTags> = {}): RawTags {
  return {
    title: "Test Title",
    artistName: "Test Artist",
    albumTitle: "Test Album",
    albumArtist: "Test Artist",
    trackNumber: 1,
    discNumber: 1,
    durationSeconds: 200,
    year: 2000,
    fileFormat: "flac",
    fileSizeBytes: 1_000_000,
    fileMtime: 0,
    mbRecordingId: null,
    mbAlbumId: null,
    mbAlbumArtistId: null,
    mbReleaseGroupId: null,
    mbTrackArtistId: null,
    ...overrides,
  };
}

export function makeCredit(
  overrides: Partial<ArtistCredit> = {},
): ArtistCredit {
  return {
    mbid: "artist-mbid",
    name: "Test Artist",
    joinPhrase: null,
    ...overrides,
  };
}

export function makeRelease(
  overrides: Partial<ReleaseCandidate> = {},
): ReleaseCandidate {
  return {
    releaseMbid: "release-mbid",
    releaseGroupMbid: "rg-mbid",
    title: "Test Album",
    date: "2000-01-01",
    country: "US",
    status: "Official",
    primaryType: "Album",
    secondaryTypes: [],
    mediaFormats: ["Digital Media"],
    ...overrides,
  };
}

export function makeCandidate(
  overrides: Partial<RecordingCandidate> = {},
): RecordingCandidate {
  return {
    method: "search",
    recordingMbid: "recording-mbid",
    title: "Test Title",
    durationMs: 200_000,
    artistCredits: [makeCredit()],
    releases: [makeRelease()],
    acoustidScore: null,
    ...overrides,
  };
}
