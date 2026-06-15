import { createLucideIcon } from "lucide-react-native";

/**
 * `play-off` (a slashed play glyph) is not shipped in this version of
 * lucide-react-native, so we recreate it locally from the upstream lucide SVG
 * (https://lucide.dev/icons/play-off). Used by Explore to mark a track whose
 * 30-second preview is unavailable.
 */
export const PlayOff = createLucideIcon("PlayOff", [
  [
    "path",
    {
      d: "m10.215 4.56 9.79 5.71a2 2 0 0 1 .003 3.458l-.393.23",
      key: "playoff-a",
    },
  ],
  [
    "path",
    { d: "m16.042 16.042-8.034 4.686A2 2 0 0 1 5 19V5", key: "playoff-b" },
  ],
  ["path", { d: "m2 2 20 20", key: "playoff-c" }],
]);
