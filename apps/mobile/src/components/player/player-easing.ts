import { Easing } from "react-native-reanimated";

/** Shared easing for every player slide/scale. */
export const PLAYER_EASING = Easing.bezier(0.2, 0.7, 0.3, 1);

/** Now Playing panel open/close duration (ms). */
export const PANEL_SLIDE_MS = 420;

/** Queue sheet open/close duration (ms). */
export const SHEET_SLIDE_MS = 360;
