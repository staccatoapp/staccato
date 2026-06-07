// Internal Last.fm types. Never exported to packages/shared.

export type LastfmEntityType = "track" | "album" | "artist";

/** A weighted tag from Last.fm getTopTags. `weight` is the raw `count`
 * (looks normalised toward 100 — verify exact semantics in client.test.ts). */
export interface LastfmTag {
  name: string;
  weight: number;
}

/** Popularity counters from track.getInfo / artist.getInfo. */
export interface LastfmPopularity {
  listeners: number;
  playcount: number;
}

/** How we address a Last.fm entity: by MBID when present, else by name. */
export interface LastfmEntityRef {
  mbid?: string | null;
  artist?: string | null; // required for the name fallback
  title?: string | null; // track title (track level)
  album?: string | null; // album title (album level)
}
