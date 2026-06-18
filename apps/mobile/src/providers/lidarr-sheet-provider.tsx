import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import {
  AddAlbumSheet,
  type LidarrSubject,
} from "@/components/explore/add-album-sheet";

interface LidarrSheetContextValue {
  open: (subject: LidarrSubject) => void;
  close: () => void;
}

const LidarrSheetContext = createContext<LidarrSheetContextValue | null>(null);

export function LidarrSheetProvider({ children }: { children: ReactNode }) {
  const [subject, setSubject] = useState<LidarrSubject | null>(null);
  const close = () => setSubject(null);

  return (
    <LidarrSheetContext.Provider value={{ open: setSubject, close }}>
      {children}
      <AddAlbumSheet subject={subject} onClose={close} />
    </LidarrSheetContext.Provider>
  );
}

export function useLidarrSheet(): LidarrSheetContextValue {
  const ctx = useContext(LidarrSheetContext);
  if (!ctx)
    throw new Error("useLidarrSheet must be used inside LidarrSheetProvider");
  return ctx;
}
