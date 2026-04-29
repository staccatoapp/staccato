import * as mm from "music-metadata";
import * as fs from "node:fs";
import * as path from "node:path";

export interface TrackTags {
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
  mbRecordingId: string | null;
  mbAlbumId: string | null;
  mbAlbumArtistId: string | null;
}

function toFirstString(val: string | string[] | null | undefined): string | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

export async function extractTags(filePath: string): Promise<TrackTags> {
  const { common, format } = await mm.parseFile(filePath, { skipCovers: true });

  return {
    title:
      common.title?.trim() || path.basename(filePath, path.extname(filePath)),
    artistName: common.artist?.trim() || "Unknown Artist",
    albumTitle: common.album?.trim() ?? null,
    albumArtist: common.albumartist?.trim() ?? null,
    trackNumber: common.track.no ?? null,
    discNumber: common.disk.no ?? null,
    durationSeconds:
      format.duration != null ? Math.round(format.duration) : null,
    year: common.year ?? null,
    fileFormat: path.extname(filePath).slice(1).toLowerCase(),
    fileSizeBytes: fs.statSync(filePath).size,
    mbRecordingId: toFirstString(common.musicbrainz_recordingid),
    mbAlbumId: toFirstString(common.musicbrainz_albumid),
    mbAlbumArtistId: toFirstString(common.musicbrainz_albumartistid),
  };
}
