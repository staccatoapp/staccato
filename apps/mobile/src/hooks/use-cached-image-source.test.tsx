import { renderHook, waitFor } from "@testing-library/react-native";

import { getArtworkFileUri } from "@/lib/storage/artwork-cache";
import { getDownloadedArtUri } from "@/lib/storage/download-cache";

import { useCachedImageSource } from "./use-cached-image-source";

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));
jest.mock("@/lib/storage/download-cache", () => ({
  getDownloadedArtUri: jest.fn(),
}));
jest.mock("@/lib/storage/artwork-cache", () => ({
  getArtworkFileUri: jest.fn(),
}));

const mockedDownloaded = jest.mocked(getDownloadedArtUri);
const mockedArtwork = jest.mocked(getArtworkFileUri);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSession.mockReturnValue({
    session: { serverUrl: "https://music.example.com", token: "tok" },
  });
  mockedDownloaded.mockResolvedValue(null);
  mockedArtwork.mockResolvedValue(null);
});

describe("useCachedImageSource", () => {
  it("returns the session-resolved network source when nothing is cached", async () => {
    const { result } = renderHook(() =>
      useCachedImageSource("/metadata/covers/x.jpg"),
    );

    expect(result.current).toEqual({
      uri: "https://music.example.com/metadata/covers/x.jpg",
      headers: { Authorization: "Bearer tok" },
    });
    // Let the (no-op) lookups settle so no act warning leaks into later tests.
    await waitFor(() => expect(mockedArtwork).toHaveBeenCalled());
  });

  it("prefers a durable downloaded copy when one exists", async () => {
    mockedDownloaded.mockResolvedValue("file://downloads/cover.jpg");

    const { result } = renderHook(() =>
      useCachedImageSource("/metadata/covers/x.jpg"),
    );

    await waitFor(() =>
      expect(result.current).toEqual({ uri: "file://downloads/cover.jpg" }),
    );
    expect(mockedArtwork).not.toHaveBeenCalled();
  });

  it("falls back to the transient artwork cache when the durable store misses", async () => {
    mockedDownloaded.mockResolvedValue(null);
    mockedArtwork.mockResolvedValue("file://blobs/cover.jpg");

    const { result } = renderHook(() =>
      useCachedImageSource("/metadata/covers/x.jpg"),
    );

    await waitFor(() =>
      expect(result.current).toEqual({ uri: "file://blobs/cover.jpg" }),
    );
  });

  it("returns null for an unresolvable url", () => {
    const { result } = renderHook(() => useCachedImageSource(null));
    expect(result.current).toBeNull();
    expect(mockedDownloaded).not.toHaveBeenCalled();
  });
});
