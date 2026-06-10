import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/queries/playlist-suggestions-cache.js", () => ({
  findDueSuggestionRowIds: vi.fn(() => []),
  findSuggestionRowById: vi.fn(),
  claimSuggestionForRefresh: vi.fn(),
  writeSuggestionReady: vi.fn(),
  writeSuggestionError: vi.fn(),
  deleteSuggestionRow: vi.fn(),
}));
vi.mock("./compute.js", () => ({ computeSuggestions: vi.fn() }));
vi.mock("../../db/queries/playlists.js", () => ({
  getPlaylist: vi.fn(() => ({ id: "p1" })),
}));

import {
  claimSuggestionForRefresh,
  writeSuggestionReady,
  writeSuggestionError,
  deleteSuggestionRow,
} from "../../db/queries/playlist-suggestions-cache.js";
import { computeSuggestions } from "./compute.js";
import { getPlaylist } from "../../db/queries/playlists.js";
import { refreshOneSuggestion } from "./refresher.js";

const mockClaim = vi.mocked(claimSuggestionForRefresh);
const mockCompute = vi.mocked(computeSuggestions);

beforeEach(() => vi.clearAllMocks());

describe("refreshOneSuggestion", () => {
  it("bails when the claim is lost (already inflight)", async () => {
    mockClaim.mockReturnValue(null);
    await refreshOneSuggestion("row1");
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it("computes and writes ready, scheduling +24h on a non-empty payload", async () => {
    mockClaim.mockReturnValue({
      id: "row1",
      userId: "u1",
      playlistId: "p1",
    } as never);
    vi.mocked(getPlaylist).mockReturnValue({ id: "p1" } as never);
    mockCompute.mockResolvedValue([{ recordingMbid: "m" } as never]);
    await refreshOneSuggestion("row1");
    expect(writeSuggestionReady).toHaveBeenCalled();
    const [, , , nextRefreshAt] =
      vi.mocked(writeSuggestionReady).mock.calls[0]!;
    expect(nextRefreshAt).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });

  it("deletes the row when the playlist is gone", async () => {
    mockClaim.mockReturnValue({
      id: "row1",
      userId: "u1",
      playlistId: "p1",
    } as never);
    vi.mocked(getPlaylist).mockReturnValue(undefined as never);
    await refreshOneSuggestion("row1");
    expect(deleteSuggestionRow).toHaveBeenCalledWith("row1");
    expect(mockCompute).not.toHaveBeenCalled();
  });

  it("writes error with capped backoff on compute failure", async () => {
    mockClaim.mockReturnValue({
      id: "row1",
      userId: "u1",
      playlistId: "p1",
    } as never);
    vi.mocked(getPlaylist).mockReturnValue({ id: "p1" } as never);
    mockCompute.mockRejectedValue(new Error("boom"));
    await refreshOneSuggestion("row1");
    expect(writeSuggestionError).toHaveBeenCalled();
  });
});
