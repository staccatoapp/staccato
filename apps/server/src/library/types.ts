import type { ResolutionMethod } from "../db/schema/tracks.js";

export interface RawTags {
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumArtist: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
  year: number | null;
  fileFormat: string;
  fileSizeBytes: number;
  fileMtime: number;
  mbRecordingId: string | null;
  mbAlbumId: string | null;
  mbAlbumArtistId: string | null;
  mbReleaseGroupId: string | null;
  mbTrackArtistId: string | null;
}

export interface Evidence {
  filePath: string;
  tags: RawTags;
  fingerprint: string | null;
  fingerprintDuration: number | null;
}

export interface ArtistCredit {
  mbid: string;
  name: string;
  joinPhrase: string | null;
}

export interface ReleaseCandidate {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  date: string | null;
  country: string | null;
  status: string | null;
  primaryType: string | null;
  secondaryTypes: string[];
  mediaFormats: string[];
}

export interface RecordingCandidate {
  method: ResolutionMethod;
  recordingMbid: string;
  title: string;
  durationMs: number | null;
  artistCredits: ArtistCredit[];
  releases: ReleaseCandidate[];
  acoustidScore: number | null;
}

export interface ScoredCandidate extends RecordingCandidate {
  score: number;
}

export interface ResolvedRelease {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  releaseYear: number | null;
  confidence: number;
}

export interface ResolutionResult {
  recording: ScoredCandidate;
  release: ResolvedRelease | null;
}
