import AsyncStorage from "@react-native-async-storage/async-storage";

import { addOrUpdateRecentServer, getRecentServers } from "./recent-servers";

// AsyncStorage is mocked globally in jest-setup.js with its official mock.

describe("recent servers", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it("returns an empty list when nothing is stored", async () => {
    expect(await getRecentServers()).toEqual([]);
  });

  it("adds a server with a lastUsedAt timestamp", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    await addOrUpdateRecentServer("https://music.example.com");
    expect(await getRecentServers()).toEqual([
      { url: "https://music.example.com", lastUsedAt: 1000 },
    ]);
  });

  it("moves an existing server to the top instead of duplicating it", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    await addOrUpdateRecentServer("https://a.example.com");
    jest.spyOn(Date, "now").mockReturnValue(2000);
    await addOrUpdateRecentServer("https://b.example.com");
    jest.spyOn(Date, "now").mockReturnValue(3000);
    await addOrUpdateRecentServer("https://a.example.com");

    const servers = await getRecentServers();
    expect(servers.map((s) => s.url)).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
    expect(servers[0]!.lastUsedAt).toBe(3000);
  });

  it("keeps at most five servers, dropping the oldest", async () => {
    for (let i = 0; i < 6; i++) {
      jest.spyOn(Date, "now").mockReturnValue(1000 + i);
      await addOrUpdateRecentServer(`https://server-${i}.example.com`);
    }
    const servers = await getRecentServers();
    expect(servers).toHaveLength(5);
    expect(servers.map((s) => s.url)).not.toContain(
      "https://server-0.example.com",
    );
    expect(servers[0]!.url).toBe("https://server-5.example.com");
  });

  it("returns an empty list when stored data is corrupt", async () => {
    await AsyncStorage.setItem("staccato.recentServers", "not json");
    expect(await getRecentServers()).toEqual([]);
  });
});
