import React from "react";

import { AlbumScreen } from "@/components/album/album-screen";

/** Album detail pushed within the Library tab stack. */
export default function LibraryAlbumScreen() {
  return <AlbumScreen basePath="/(protected)/library/album/[albumKey]" />;
}
