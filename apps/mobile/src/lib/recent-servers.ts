import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "staccato.recentServers";
const MAX_RECENT_SERVERS = 5;

export interface RecentServer {
  url: string;
  lastUsedAt: number;
}

export async function getRecentServers(): Promise<RecentServer[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is RecentServer =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as RecentServer).url === "string" &&
        typeof (item as RecentServer).lastUsedAt === "number",
    );
  } catch (err) {
    console.warn("failed to read recent servers from storage", err);
    return [];
  }
}

/** Upserts a server by URL, newest first, capped at five entries. */
export async function addOrUpdateRecentServer(url: string): Promise<void> {
  const existing = await getRecentServers();
  const updated: RecentServer[] = [
    { url, lastUsedAt: Date.now() },
    ...existing.filter((server) => server.url !== url),
  ].slice(0, MAX_RECENT_SERVERS);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("failed to persist recent servers", err);
  }
}
