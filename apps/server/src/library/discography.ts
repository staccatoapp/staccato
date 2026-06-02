import type { ArtistDiscographyItem } from "@staccato/shared";
import type { DiscographyAlbumRow } from "../db/queries/albums.js";
import {
  resolveAlbumCoverNow,
  resolveExternalCoverNow,
} from "../coverart/store.js";
import type { ArtistReleaseGroup } from "../musicbrainz/client.js";

const DISCOGRAPHY_PRIMARY_TYPES = new Set(["Album", "EP"]);

export function isMainRelease(rg: ArtistReleaseGroup): boolean {
  if (!rg.primaryType || !DISCOGRAPHY_PRIMARY_TYPES.has(rg.primaryType)) {
    return false;
  }
  if (rg.secondaryTypes && rg.secondaryTypes.length > 0) return false;
  return true;
}

export function parseYear(date: string | null): number | null {
  if (!date) return null;
  const year = parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

export function libraryItem(row: DiscographyAlbumRow): ArtistDiscographyItem {
  return {
    inLibrary: true,
    id: row.id,
    title: row.title,
    releaseYear: row.releaseYear,
    releaseGroupMbid: row.releaseGroupMbid,
    coverArtUrl: resolveAlbumCoverNow({
      albumId: row.id,
      releaseGroupMbid: row.releaseGroupMbid,
      coverArtUrl: row.coverArtUrl,
    }),
  };
}

export function sortByYearDesc(
  items: ArtistDiscographyItem[],
): ArtistDiscographyItem[] {
  return [...items].sort((a, b) => {
    const ay = a.releaseYear ?? -Infinity;
    const by = b.releaseYear ?? -Infinity;
    return by - ay;
  });
}

export function dedupById(rows: DiscographyAlbumRow[]): DiscographyAlbumRow[] {
  const byId = new Map<string, DiscographyAlbumRow>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()];
}

export function mergeDiscography(
  releaseGroups: ArtistReleaseGroup[],
  libraryAlbums: DiscographyAlbumRow[],
): ArtistDiscographyItem[] {
  const libraryByMbid = new Map<string, DiscographyAlbumRow>();
  const libraryWithoutMbid: DiscographyAlbumRow[] = [];
  for (const album of libraryAlbums) {
    if (album.releaseGroupMbid) {
      libraryByMbid.set(album.releaseGroupMbid, album);
    } else {
      libraryWithoutMbid.push(album);
    }
  }

  const items: ArtistDiscographyItem[] = [];
  const seenMbids = new Set<string>();

  for (const rg of releaseGroups.filter(isMainRelease)) {
    seenMbids.add(rg.releaseGroupMbid);
    const local = libraryByMbid.get(rg.releaseGroupMbid);
    if (local) {
      items.push(libraryItem(local));
    } else {
      items.push({
        inLibrary: false,
        releaseGroupMbid: rg.releaseGroupMbid,
        title: rg.title,
        releaseYear: parseYear(rg.firstReleaseDate),
        coverArtUrl: resolveExternalCoverNow(rg.releaseGroupMbid),
      });
    }
  }

  for (const album of libraryWithoutMbid) items.push(libraryItem(album));
  for (const album of libraryAlbums) {
    if (album.releaseGroupMbid && !seenMbids.has(album.releaseGroupMbid)) {
      items.push(libraryItem(album));
    }
  }

  return sortByYearDesc(items);
}
