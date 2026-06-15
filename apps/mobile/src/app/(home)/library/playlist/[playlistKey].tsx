import React from "react";

import { PlaylistScreen } from "@/components/playlist/playlist-screen";

/** In-library playlist detail pushed within the Library tab stack. */
export default function LibraryPlaylistScreen() {
  return <PlaylistScreen mode="inLibrary" />;
}
