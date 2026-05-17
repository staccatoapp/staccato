import type { ArtistSearchItem } from "./artists.js";
import type { AlbumListItem } from "./albums.js";
import type { TrackSearchResult } from "./tracks.js";

export type LibrarySearchResults = {
  artists: ArtistSearchItem[];
  albums: AlbumListItem[];
  tracks: TrackSearchResult[];
};
