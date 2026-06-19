import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Filesystem operations a {@link BlobStore} needs, keyed by an opaque filename
 * it owns. Abstracted so the store's index / dedup / eviction logic can be
 * tested without the native filesystem, and so the same store can target the
 * evictable cache dir (artwork) or the durable document dir (future offline
 * downloads) by swapping the adapter.
 */
export interface BlobFs {
  /** Ensure the backing directory exists (idempotent). */
  ensureDir(): void | Promise<void>;
  /** The `file://` uri for a filename in the backing directory. */
  uriFor(filename: string): string;
  /** Whether a file currently exists on disk. */
  exists(filename: string): boolean;
  /** Download `url` (optionally authed) to `filename`, returning its byte size. */
  download(
    url: string,
    filename: string,
    headers?: Record<string, string>,
  ): Promise<number>;
  /** Delete a file from disk. */
  remove(filename: string): void;
}

export interface BlobStoreConfig {
  /** Sub-directory name under the base dir; also disambiguates instances. */
  name: string;
  /** `cache` is OS-evictable (artwork); `document` is durable (downloads). */
  baseDir: "cache" | "document";
  /** AsyncStorage key the JSON index is persisted under. */
  indexKey: string;
  /** Optional size cap in bytes; when set, LRU eviction keeps usage under it. */
  maxBytes?: number;
}

export interface BlobStore {
  /**
   * Ensure the resource at `url` is cached locally under `key`, returning its
   * `file://` uri. Concurrent calls for the same key share one download.
   */
  ensure(
    key: string,
    url: string,
    opts?: { headers?: Record<string, string> },
  ): Promise<string>;
  /** Remove a single cached entry (file + index). */
  remove(key: string): Promise<void>;
  /** Remove every cached entry and the persisted index. */
  clear(): Promise<void>;
}

interface IndexEntry {
  filename: string;
  bytes: number;
  lastAccessedAt: number;
}

type Index = Record<string, IndexEntry>;

/** FNV-1a (32-bit) hex hash — a cache key, not a security boundary. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isIndexEntry(value: unknown): value is IndexEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IndexEntry).filename === "string" &&
    typeof (value as IndexEntry).bytes === "number" &&
    typeof (value as IndexEntry).lastAccessedAt === "number"
  );
}

/** Default adapter backing the store with expo-file-system. */
function createExpoBlobFs(baseDir: "cache" | "document", name: string): BlobFs {
  const root = baseDir === "document" ? Paths.document : Paths.cache;
  const dir = new Directory(root, name);
  return {
    ensureDir: () => dir.create({ idempotent: true }),
    uriFor: (filename) => new File(dir, filename).uri,
    exists: (filename) => new File(dir, filename).exists,
    download: async (url, filename, headers) => {
      const file = await File.downloadFileAsync(
        url,
        new File(dir, filename),
        headers ? { headers } : undefined,
      );
      return file.size;
    },
    remove: (filename) => new File(dir, filename).delete(),
  };
}

export function createBlobStore(
  config: BlobStoreConfig,
  fs: BlobFs = createExpoBlobFs(config.baseDir, config.name),
): BlobStore {
  let index: Index | null = null;
  const inFlight = new Map<string, Promise<string>>();

  async function loadIndex(): Promise<Index> {
    if (index) return index;
    try {
      const raw = await AsyncStorage.getItem(config.indexKey);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      const next: Index = {};
      if (parsed && typeof parsed === "object") {
        for (const [key, entry] of Object.entries(parsed)) {
          if (isIndexEntry(entry)) next[key] = entry;
        }
      }
      index = next;
    } catch (err) {
      console.warn("failed to read blob-store index, starting empty", {
        indexKey: config.indexKey,
        err,
      });
      index = {};
    }
    return index;
  }

  async function persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(config.indexKey, JSON.stringify(index ?? {}));
    } catch (err) {
      console.warn("failed to persist blob-store index", {
        indexKey: config.indexKey,
        err,
      });
    }
  }

  function evict(current: Index): void {
    if (!config.maxBytes) return;
    const total = () =>
      Object.values(current).reduce((sum, e) => sum + e.bytes, 0);
    while (total() > config.maxBytes && Object.keys(current).length > 1) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [key, entry] of Object.entries(current)) {
        if (entry.lastAccessedAt < oldestAt) {
          oldestAt = entry.lastAccessedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      const victim = current[oldestKey]!;
      try {
        fs.remove(victim.filename);
      } catch (err) {
        console.warn("failed to evict blob-store file", {
          filename: victim.filename,
          err,
        });
      }
      delete current[oldestKey];
    }
  }

  async function doEnsure(
    key: string,
    url: string,
    opts?: { headers?: Record<string, string> },
  ): Promise<string> {
    const current = await loadIndex();
    const existing = current[key];
    if (existing && fs.exists(existing.filename)) {
      existing.lastAccessedAt = Date.now();
      await persist();
      return fs.uriFor(existing.filename);
    }

    await fs.ensureDir();
    const filename = `${fnv1a(key)}.jpg`;
    const bytes = await fs.download(url, filename, opts?.headers);
    current[key] = { filename, bytes, lastAccessedAt: Date.now() };
    evict(current);
    await persist();
    return fs.uriFor(filename);
  }

  return {
    ensure(key, url, opts) {
      const pending = inFlight.get(key);
      if (pending) return pending;
      const promise = doEnsure(key, url, opts).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
    async remove(key) {
      const current = await loadIndex();
      const entry = current[key];
      if (!entry) return;
      try {
        fs.remove(entry.filename);
      } catch (err) {
        console.warn("failed to remove blob-store file", {
          filename: entry.filename,
          err,
        });
      }
      delete current[key];
      await persist();
    },
    async clear() {
      const current = await loadIndex();
      for (const entry of Object.values(current)) {
        try {
          fs.remove(entry.filename);
        } catch (err) {
          console.warn("failed to remove blob-store file during clear", {
            filename: entry.filename,
            err,
          });
        }
      }
      index = {};
      try {
        await AsyncStorage.removeItem(config.indexKey);
      } catch (err) {
        console.warn("failed to clear blob-store index", {
          indexKey: config.indexKey,
          err,
        });
      }
    },
  };
}
