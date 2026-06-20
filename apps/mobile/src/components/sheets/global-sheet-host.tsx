import React from "react";

import { AddAlbumSheet } from "@/components/explore/add-album-sheet";
import { AddAllSheet } from "@/components/playlist/add-all-sheet";
import { useSheetStore } from "@/stores/sheet-store";

/**
 * Mounts the app-global bottom sheets once, driven by {@link useSheetStore}.
 * Replaces the nested `LidarrSheetProvider`/`AddAllSheetProvider` wrappers with a
 * single flat sibling (like `PlayerOverlayRoot`): the store is global, so these
 * sheets need no provider in the tree — only a host placed where their data hooks
 * (`useRequestDownload`, `useTheme`) have context, and above the mini player so
 * they float over it. Each sheet renders null while its state is null, so the
 * always-mounted host is cheap.
 */
export function GlobalSheetHost() {
  const lidarrSubject = useSheetStore((s) => s.lidarrSubject);
  const closeLidarr = useSheetStore((s) => s.closeLidarr);
  const addAllView = useSheetStore((s) => s.addAllView);
  const closeAddAll = useSheetStore((s) => s.closeAddAll);

  return (
    <>
      <AddAlbumSheet subject={lidarrSubject} onClose={closeLidarr} />
      <AddAllSheet view={addAllView} onClose={closeAddAll} />
    </>
  );
}
