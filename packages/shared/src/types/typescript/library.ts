import type { Artist } from "./artists.js";
import type { AlbumListItem } from "./albums.js";
import type { TrackSearchResult } from "./tracks.js";

export type LibrarySearchResults = {
  artists: Artist[];
  albums: AlbumListItem[];
  tracks: TrackSearchResult[];
};
