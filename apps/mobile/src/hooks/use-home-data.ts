import { homeData, type HomeScreenData } from "@/lib/home-data";

/**
 * Returns the Home screen dataset. Currently static sample content from the
 * design handoff; replace the body with real API fetching when the endpoints
 * exist.
 */
export function useHomeData(): HomeScreenData {
  return homeData;
}
