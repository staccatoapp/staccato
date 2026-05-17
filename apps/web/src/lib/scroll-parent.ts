import { createContext, useContext } from "react";

export const ScrollParentContext = createContext<HTMLElement | null>(null);

export function useScrollParent(): HTMLElement | null {
  return useContext(ScrollParentContext);
}
