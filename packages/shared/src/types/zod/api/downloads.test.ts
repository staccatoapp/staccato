import { describe, it, expect } from "vitest";
import { DownloadRequestSchema } from "./downloads.js";

const validDownloadRequest = {
  id: "abc123",
  releaseGroupMbid: "rg-mbid",
  artistMbid: "artist-mbid",
  artistName: "Test Artist",
  albumTitle: "Test Album",
  status: "requested" as const,
  errorMessage: null,
  lidarrAlbumId: null,
  createdAt: "2025-05-30T10:00:00.000Z",
  updatedAt: "2025-05-30T11:00:00.000Z",
};

describe("DownloadRequestSchema", () => {
  it("accepts a valid payload with ISO string dates", () => {
    const result = DownloadRequestSchema.safeParse(validDownloadRequest);
    expect(result.success).toBe(true);
  });

  it("accepts null for createdAt and updatedAt", () => {
    const result = DownloadRequestSchema.safeParse({
      ...validDownloadRequest,
      createdAt: null,
      updatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a Date object for createdAt — wire format must be a string", () => {
    const result = DownloadRequestSchema.safeParse({
      ...validDownloadRequest,
      createdAt: new Date("2025-05-30T10:00:00.000Z"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a Date object for updatedAt — wire format must be a string", () => {
    const result = DownloadRequestSchema.safeParse({
      ...validDownloadRequest,
      updatedAt: new Date("2025-05-30T11:00:00.000Z"),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const result = DownloadRequestSchema.safeParse({
      ...validDownloadRequest,
      status: "unknown_status",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    const statuses = [
      "requested",
      "sent_to_lidarr",
      "downloading",
      "completed",
      "failed",
    ] as const;
    for (const status of statuses) {
      const result = DownloadRequestSchema.safeParse({
        ...validDownloadRequest,
        status,
      });
      expect(result.success).toBe(true);
    }
  });
});
