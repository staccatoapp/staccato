import * as mm from "music-metadata";
import path from "node:path";
import type { RawTags } from "../types.js";

function toFirstString(
  val: string | string[] | null | undefined,
): string | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function inferFileFormat(
  filePath: string,
  container: string | undefined,
  codec: string | undefined,
): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (codec) {
    if (codec.toUpperCase().includes("ALAC")) return "alac";
    if (codec.toUpperCase().includes("AAC")) return "aac";
    if (codec.toUpperCase().includes("FLAC")) return "flac";
    if (codec.toUpperCase().includes("MPEG")) return "mp3";
    if (codec.toUpperCase().includes("OPUS")) return "opus";
    if (codec.toUpperCase().includes("VORBIS")) return "vorbis";
  }
  if (container) {
    const c = container.toUpperCase();
    if (c.includes("FLAC")) return "flac";
    if (c.includes("MPEG")) return "mp3";
    if (c.includes("MPEG 4") || c.includes("MP4")) return ext === "m4a" ? "aac" : ext;
    if (c.includes("OGG")) return ext === "opus" ? "opus" : "vorbis";
  }
  return ext;
}

export async function extractTags(
  filePath: string,
  size: number,
  mtimeMs: number,
): Promise<RawTags> {
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
    fileFormat: inferFileFormat(
      filePath,
      format.container ?? undefined,
      format.codec ?? undefined,
    ),
    fileSizeBytes: size,
    fileMtime: Math.floor(mtimeMs),
    mbRecordingId: toFirstString(common.musicbrainz_recordingid),
    mbAlbumId: toFirstString(common.musicbrainz_albumid),
    mbAlbumArtistId: toFirstString(common.musicbrainz_albumartistid),
    mbReleaseGroupId: common.musicbrainz_releasegroupid ?? null,
    mbTrackArtistId: toFirstString(common.musicbrainz_artistid),
  };
}
