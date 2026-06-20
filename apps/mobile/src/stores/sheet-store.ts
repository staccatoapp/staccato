import { create } from "zustand";

import { type LidarrSubject } from "@/components/explore/add-album-sheet";
import { type PlaylistView } from "@/lib/playlist-view-model";

/**
 * Single store for app-global bottom sheets that are opened imperatively from
 * many screens and must render above every overlay (mini player, toasts).
 *
 * This replaces the one-provider-per-sheet pattern: instead of a `<Provider>`
 * per sheet wrapping the tree (and re-rendering every consumer whenever its
 * open/close state flips), the state lives outside React and each sheet is
 * rendered once by {@link GlobalSheetHost}. Adding a new global sheet here is a
 * field + two actions, not a new provider and another level of tree nesting.
 *
 * Each sheet's state is the "subject" it's open for (or null = closed), mirroring
 * the existing `subject`/`view` prop contract the sheet components already accept.
 */
interface SheetState {
  /** Non-null opens the Lidarr request sheet for that subject; null closes it. */
  lidarrSubject: LidarrSubject | null;
  /** Non-null opens the "add all to library" sheet for that playlist; null closes it. */
  addAllView: PlaylistView | null;

  openLidarr: (subject: LidarrSubject) => void;
  closeLidarr: () => void;
  openAddAll: (view: PlaylistView) => void;
  closeAddAll: () => void;
}

export const useSheetStore = create<SheetState>((set) => ({
  lidarrSubject: null,
  addAllView: null,
  openLidarr: (subject) => set({ lidarrSubject: subject }),
  closeLidarr: () => set({ lidarrSubject: null }),
  openAddAll: (view) => set({ addAllView: view }),
  closeAddAll: () => set({ addAllView: null }),
}));

/**
 * Drop-in replacement for the old `useLidarrSheet()` context hook. Each action is
 * selected individually: zustand actions are stable references, so a consumer
 * that only opens the sheet never re-renders when the sheet's own state changes
 * (the re-render win over context). Do not return an object *from the selector* —
 * zustand v5 has no snapshot caching, so a new-object selector would loop.
 */
export function useLidarrSheet() {
  const open = useSheetStore((s) => s.openLidarr);
  const close = useSheetStore((s) => s.closeLidarr);
  return { open, close };
}

/** Drop-in replacement for the old `useAddAllSheet()` context hook. */
export function useAddAllSheet() {
  const open = useSheetStore((s) => s.openAddAll);
  const close = useSheetStore((s) => s.closeAddAll);
  return { open, close };
}
