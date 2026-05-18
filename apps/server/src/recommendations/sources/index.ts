import { registerSource } from "../source.js";
import { listenbrainzCfTracksSource } from "./listenbrainz-cf-tracks.js";
import { listenbrainzPlaylistsSource } from "./listenbrainz-playlists.js";

registerSource(listenbrainzCfTracksSource);
registerSource(listenbrainzPlaylistsSource);
