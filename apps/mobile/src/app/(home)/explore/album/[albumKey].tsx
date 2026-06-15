import React from "react";

import { AlbumScreen } from "@/components/album/album-screen";

/** Album detail pushed within the Explore tab stack. */
export default function ExploreAlbumScreen() {
  return <AlbumScreen basePath="/(home)/explore/album/[albumKey]" />;
}
