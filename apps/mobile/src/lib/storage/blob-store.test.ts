import AsyncStorage from "@react-native-async-storage/async-storage";

import { createBlobStore, type BlobFs } from "./blob-store";

// AsyncStorage is mocked globally in jest-setup.js with its official mock.

interface FakeFs extends BlobFs {
  /** filename -> byte size, simulating what is actually on disk. */
  disk: Map<string, number>;
  /** byte size to report for a given download url (defaults to 10). */
  sizeByUrl: Map<string, number>;
  downloadCalls: {
    url: string;
    filename: string;
    headers?: Record<string, string>;
  }[];
}

function makeFakeFs(): FakeFs {
  const disk = new Map<string, number>();
  const sizeByUrl = new Map<string, number>();
  const downloadCalls: FakeFs["downloadCalls"] = [];
  return {
    disk,
    sizeByUrl,
    downloadCalls,
    ensureDir: jest.fn(),
    uriFor: (filename) => `file://blobs/${filename}`,
    exists: (filename) => disk.has(filename),
    download: jest.fn(async (url, filename, headers) => {
      downloadCalls.push({ url, filename, headers });
      const size = sizeByUrl.get(url) ?? 10;
      disk.set(filename, size);
      return size;
    }),
    remove: jest.fn((filename) => {
      disk.delete(filename);
    }),
  };
}

const CONFIG = {
  name: "test",
  baseDir: "cache" as const,
  indexKey: "staccato.test.index",
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe("createBlobStore", () => {
  it("downloads a missing resource and returns its local file uri", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    const uri = await store.ensure("k", "https://cdn/a.jpg");

    expect(fs.download).toHaveBeenCalledTimes(1);
    expect(uri).toBe(`file://blobs/${fs.downloadCalls[0]!.filename}`);
  });

  it("forwards headers to the download", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    await store.ensure("k", "https://cdn/a.jpg", {
      headers: { Authorization: "Bearer tok" },
    });

    expect(fs.downloadCalls[0]!.headers).toEqual({
      Authorization: "Bearer tok",
    });
  });

  it("reuses the cached file on a hit without downloading again", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    const first = await store.ensure("k", "https://cdn/a.jpg");
    const second = await store.ensure("k", "https://cdn/a.jpg");

    expect(fs.download).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("re-downloads when the indexed file is missing on disk", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    await store.ensure("k", "https://cdn/a.jpg");
    fs.disk.clear(); // OS reclaimed the cache file
    await store.ensure("k", "https://cdn/a.jpg");

    expect(fs.download).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent ensures of the same key into one download", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    const [a, b] = await Promise.all([
      store.ensure("k", "https://cdn/a.jpg"),
      store.ensure("k", "https://cdn/a.jpg"),
    ]);

    expect(fs.download).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("evicts the least-recently-used entry when over the size cap", async () => {
    const fs = makeFakeFs();
    fs.sizeByUrl.set("https://cdn/a.jpg", 10);
    fs.sizeByUrl.set("https://cdn/b.jpg", 10);
    fs.sizeByUrl.set("https://cdn/c.jpg", 10);
    const store = createBlobStore({ ...CONFIG, maxBytes: 25 }, fs);

    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1000);
    await store.ensure("a", "https://cdn/a.jpg");
    now.mockReturnValue(2000);
    await store.ensure("b", "https://cdn/b.jpg");
    now.mockReturnValue(3000);
    await store.ensure("c", "https://cdn/c.jpg"); // total 30 > 25 -> evict "a"

    const aFile = fs.downloadCalls[0]!.filename;
    expect(fs.remove).toHaveBeenCalledWith(aFile);
    expect(fs.disk.has(aFile)).toBe(false);

    // "a" is gone from the index, so requesting it again re-downloads.
    now.mockReturnValue(4000);
    await store.ensure("a", "https://cdn/a.jpg");
    expect(fs.download).toHaveBeenCalledTimes(4);
  });

  it("keeps a recently-touched entry by refreshing its last-access on hit", async () => {
    const fs = makeFakeFs();
    fs.sizeByUrl.set("https://cdn/a.jpg", 10);
    fs.sizeByUrl.set("https://cdn/b.jpg", 10);
    fs.sizeByUrl.set("https://cdn/c.jpg", 10);
    const store = createBlobStore({ ...CONFIG, maxBytes: 25 }, fs);

    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(1000);
    await store.ensure("a", "https://cdn/a.jpg");
    now.mockReturnValue(2000);
    await store.ensure("b", "https://cdn/b.jpg");
    now.mockReturnValue(3000);
    await store.ensure("a", "https://cdn/a.jpg"); // hit -> "a" now newer than "b"
    now.mockReturnValue(4000);
    await store.ensure("c", "https://cdn/c.jpg"); // evict the oldest, which is "b"

    const bFile = fs.downloadCalls[1]!.filename;
    expect(fs.remove).toHaveBeenCalledWith(bFile);
  });

  it("persists the index so a new store instance gets a hit", async () => {
    const fs1 = makeFakeFs();
    const store1 = createBlobStore(CONFIG, fs1);
    await store1.ensure("k", "https://cdn/a.jpg");
    const filename = fs1.downloadCalls[0]!.filename;

    // New instance, fresh adapter, but the file still exists on disk.
    const fs2 = makeFakeFs();
    fs2.disk.set(filename, 10);
    const store2 = createBlobStore(CONFIG, fs2);
    await store2.ensure("k", "https://cdn/a.jpg");

    expect(fs2.download).not.toHaveBeenCalled();
  });

  it("remove deletes the file and drops it from the index", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);
    await store.ensure("k", "https://cdn/a.jpg");
    const filename = fs.downloadCalls[0]!.filename;

    await store.remove("k");

    expect(fs.remove).toHaveBeenCalledWith(filename);
    await store.ensure("k", "https://cdn/a.jpg");
    expect(fs.download).toHaveBeenCalledTimes(2); // gone -> re-downloaded
  });

  it("uses the given extension for the cached filename", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    await store.ensure("k", "https://cdn/a.flac", { extension: "flac" });

    expect(fs.downloadCalls[0]!.filename).toMatch(/\.flac$/);
  });

  it("defaults the filename extension to jpg", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    await store.ensure("k", "https://cdn/a.jpg");

    expect(fs.downloadCalls[0]!.filename).toMatch(/\.jpg$/);
  });

  it("uri returns the local uri for a present key without downloading", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);
    await store.ensure("k", "https://cdn/a.flac", { extension: "flac" });
    const filename = fs.downloadCalls[0]!.filename;

    const uri = await store.uri("k");

    expect(uri).toBe(`file://blobs/${filename}`);
    expect(fs.download).toHaveBeenCalledTimes(1); // no extra download
  });

  it("uri returns null for an unknown key", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);

    expect(await store.uri("missing")).toBeNull();
    expect(fs.download).not.toHaveBeenCalled();
  });

  it("uri returns null when the indexed file is gone from disk", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);
    await store.ensure("k", "https://cdn/a.jpg");
    fs.disk.clear(); // OS reclaimed the file

    expect(await store.uri("k")).toBeNull();
  });

  it("clear removes every cached file", async () => {
    const fs = makeFakeFs();
    const store = createBlobStore(CONFIG, fs);
    await store.ensure("a", "https://cdn/a.jpg");
    await store.ensure("b", "https://cdn/b.jpg");

    await store.clear();

    expect(fs.disk.size).toBe(0);
    expect(await AsyncStorage.getItem(CONFIG.indexKey)).toBeNull();
  });
});
