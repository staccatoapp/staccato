import React from "react";

import { AlbumScreen } from "@/components/album/album-screen";

/** Album detail pushed within the Home tab stack. */
export default function HomeAlbumScreen() {
  return <AlbumScreen basePath="/(protected)/(home)/album/[albumKey]" />;
}
