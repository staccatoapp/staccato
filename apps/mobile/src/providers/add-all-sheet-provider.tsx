import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { AddAllSheet } from "@/components/playlist/add-all-sheet";
import { type PlaylistView } from "@/lib/playlist-view-model";

interface AddAllSheetContextValue {
  open: (view: PlaylistView) => void;
  close: () => void;
}

const AddAllSheetContext = createContext<AddAllSheetContextValue | null>(null);

export function AddAllSheetProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<PlaylistView | null>(null);
  const close = () => setView(null);

  return (
    <AddAllSheetContext.Provider value={{ open: setView, close }}>
      {children}
      <AddAllSheet view={view} onClose={close} />
    </AddAllSheetContext.Provider>
  );
}

export function useAddAllSheet(): AddAllSheetContextValue {
  const ctx = useContext(AddAllSheetContext);
  if (!ctx)
    throw new Error("useAddAllSheet must be used inside AddAllSheetProvider");
  return ctx;
}
