import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  ensureDownloadedArt,
  ensureTrackDownloaded,
  getDownloadedTrackUri,
} from "@/lib/storage/download-cache";

import {
  COLLECTIONS_KEY,
  useDownloadsStore,
  type DownloadableCollection,
} from "./downloads-store";

jest.mock("@/lib/storage/download-cache", () => ({
  ensureTrackDownloaded: jest.fn(),
  ensureDownloadedArt: jest.fn(),
  getDownloadedTrackUri: jest.fn(),
}));

const SESSION = { serverUrl: "https://music.home.arpa", token: "tok" };

function collection(
  overrides: Partial<DownloadableCollection> = {},
): DownloadableCollection {
  return {
    id: "pl-1",
    kind: "playlist",
    name: "Roadtrip",
    coverArtUrls: ["/metadata/covers/a.jpg"],
    tracks: [
      {
        trackId: "t1",
        fileExtension: "flac",
        coverArtUrl: "/metadata/covers/a.jpg",
      },
      {
        trackId: "t2",
        fileExtension: "mp3",
        coverArtUrl: "/metadata/covers/a.jpg",
      },
    ],
    snapshot: { mock: true },
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useDownloadsStore.setState({ collections: {}, trackUris: {} });
  jest.mocked(ensureTrackDownloaded).mockReset();
  jest.mocked(ensureDownloadedArt).mockReset().mockResolvedValue(null);
  jest.mocked(getDownloadedTrackUri).mockReset();
});

describe("download", () => {
  it("marks downloaded and maps every track uri on success", async () => {
    jest
      .mocked(ensureTrackDownloaded)
      .mockImplementation(async (id) => `file://downloads/${id}.audio`);

    await useDownloadsStore.getState().download(collection(), SESSION);

    const { collections, trackUris } = useDownloadsStore.getState();
    expect(collections["pl-1"]).toEqual({
      state: "downloaded",
      completed: 2,
      total: 2,
    });
    expect(trackUris).toEqual({
      t1: "file://downloads/t1.audio",
      t2: "file://downloads/t2.audio",
    });
  });

  it("downloads each track with its own format", async () => {
    jest.mocked(ensureTrackDownloaded).mockResolvedValue("file://x");
    await useDownloadsStore.getState().download(collection(), SESSION);

    expect(ensureTrackDownloaded).toHaveBeenCalledWith("t1", "flac", SESSION);
    expect(ensureTrackDownloaded).toHaveBeenCalledWith("t2", "mp3", SESSION);
  });

  it("ends in partial state when a track fails, keeping the ones that landed", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest
      .mocked(ensureTrackDownloaded)
      .mockResolvedValueOnce("file://downloads/t1.audio")
      .mockRejectedValueOnce(new Error("network down"));

    await useDownloadsStore.getState().download(collection(), SESSION);

    const { collections, trackUris } = useDownloadsStore.getState();
    expect(collections["pl-1"]).toEqual({
      state: "partial",
      completed: 1,
      total: 2,
    });
    expect(trackUris).toEqual({ t1: "file://downloads/t1.audio" });
  });

  it("persists a manifest entry so it can be rehydrated later", async () => {
    jest.mocked(ensureTrackDownloaded).mockResolvedValue("file://x");
    await useDownloadsStore.getState().download(collection(), SESSION);

    const raw = await AsyncStorage.getItem(COLLECTIONS_KEY);
    const manifest = JSON.parse(raw!);
    expect(manifest["pl-1"]).toMatchObject({
      id: "pl-1",
      kind: "playlist",
      name: "Roadtrip",
      trackIds: ["t1", "t2"],
      snapshot: { mock: true },
    });
  });

  it("persists both manifests when two collections download concurrently", async () => {
    jest.mocked(ensureTrackDownloaded).mockResolvedValue("file://x");

    await Promise.all([
      useDownloadsStore
        .getState()
        .download(collection({ id: "pl-A" }), SESSION),
      useDownloadsStore
        .getState()
        .download(collection({ id: "pl-B" }), SESSION),
    ]);

    const raw = await AsyncStorage.getItem(COLLECTIONS_KEY);
    const manifest = JSON.parse(raw!);
    expect(Object.keys(manifest).sort()).toEqual(["pl-A", "pl-B"]);
  });

  it("pins each track's cover art (plus the collection covers) for offline", async () => {
    jest.mocked(ensureTrackDownloaded).mockResolvedValue("file://x");
    const c = collection({
      coverArtUrls: ["/metadata/covers/mosaic.jpg"],
      tracks: [
        {
          trackId: "t1",
          fileExtension: "flac",
          coverArtUrl: "/metadata/covers/t1.jpg",
        },
        {
          trackId: "t2",
          fileExtension: "mp3",
          coverArtUrl: "/metadata/covers/t2.jpg",
        },
      ],
    });

    await useDownloadsStore.getState().download(c, SESSION);

    expect(ensureDownloadedArt).toHaveBeenCalledWith(
      "/metadata/covers/mosaic.jpg",
      SESSION,
    );
    expect(ensureDownloadedArt).toHaveBeenCalledWith(
      "/metadata/covers/t1.jpg",
      SESSION,
    );
    expect(ensureDownloadedArt).toHaveBeenCalledWith(
      "/metadata/covers/t2.jpg",
      SESSION,
    );
  });

  it("seeds progress from already-downloaded tracks when retrying a partial", async () => {
    // One of two tracks already landed in a prior partial download.
    useDownloadsStore.setState({
      trackUris: { t1: "file://downloads/t1.audio" },
      collections: { "pl-1": { state: "partial", completed: 1, total: 2 } },
    });
    jest.mocked(ensureTrackDownloaded).mockResolvedValue("file://x");

    const downloading: number[] = [];
    const unsub = useDownloadsStore.subscribe((s) => {
      const status = s.collections["pl-1"];
      if (status?.state === "downloading") downloading.push(status.completed);
    });

    await useDownloadsStore.getState().download(collection(), SESSION);
    unsub();

    // The ring starts at 1/2 (the already-present track), not 0/2.
    expect(downloading[0]).toBe(1);
    expect(downloading.every((c) => c <= 2)).toBe(true);
    expect(useDownloadsStore.getState().collections["pl-1"]).toEqual({
      state: "downloaded",
      completed: 2,
      total: 2,
    });
  });

  it("ignores a re-download while one is already downloaded", async () => {
    jest.mocked(ensureTrackDownloaded).mockResolvedValue("file://x");
    await useDownloadsStore.getState().download(collection(), SESSION);
    jest.mocked(ensureTrackDownloaded).mockClear();

    await useDownloadsStore.getState().download(collection(), SESSION);
    expect(ensureTrackDownloaded).not.toHaveBeenCalled();
  });
});

describe("hydrate", () => {
  it("rebuilds track uris and downloaded state from the manifest", async () => {
    await AsyncStorage.setItem(
      COLLECTIONS_KEY,
      JSON.stringify({
        "pl-1": {
          id: "pl-1",
          kind: "playlist",
          name: "Roadtrip",
          coverArtUrls: [],
          trackIds: ["t1", "t2"],
          snapshot: {},
          downloadedAt: 1,
        },
      }),
    );
    jest
      .mocked(getDownloadedTrackUri)
      .mockResolvedValueOnce("file://downloads/t1.audio")
      .mockResolvedValueOnce("file://downloads/t2.audio");

    await useDownloadsStore.getState().hydrate();

    const { collections, trackUris } = useDownloadsStore.getState();
    expect(collections["pl-1"]).toEqual({
      state: "downloaded",
      completed: 2,
      total: 2,
    });
    expect(trackUris.t1).toBe("file://downloads/t1.audio");
  });

  it("marks a collection partial when only some files survive", async () => {
    await AsyncStorage.setItem(
      COLLECTIONS_KEY,
      JSON.stringify({
        "pl-1": {
          id: "pl-1",
          kind: "playlist",
          name: "Roadtrip",
          coverArtUrls: [],
          trackIds: ["t1", "t2"],
          snapshot: {},
          downloadedAt: 1,
        },
      }),
    );
    jest
      .mocked(getDownloadedTrackUri)
      .mockResolvedValueOnce("file://downloads/t1.audio")
      .mockResolvedValueOnce(null);

    await useDownloadsStore.getState().hydrate();

    expect(useDownloadsStore.getState().collections["pl-1"]).toEqual({
      state: "partial",
      completed: 1,
      total: 2,
    });
  });
});
