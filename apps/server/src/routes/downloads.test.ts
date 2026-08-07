import { describe, it, expect, vi, beforeEach } from "vitest";
import downloadRoutes from "./downloads.js";
import { buildApp } from "./__fixtures__/app.js";
import {
  createDownloadRequest,
  deleteDownloadRequest,
  findExistingActiveRequest,
  getDownloadRequestsByUser,
  type DownloadRequestRow,
} from "../db/queries/download-requests.js";

vi.mock("../db/queries/download-requests.js");
vi.mock("../lidarr/submit.js", () => ({
  submitToLidarr: vi.fn().mockResolvedValue(undefined),
}));

const validBody = {
  releaseGroupMbid: "a2c40320-4f11-4f8d-a929-3c5a57c3df49",
  artistMbid: "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d",
  artistName: "Test Artist",
  albumTitle: "Test Album",
};

const mockRow: DownloadRequestRow = {
  id: "row-1",
  userId: "user-1",
  musicbrainzReleaseGroupId: validBody.releaseGroupMbid,
  musicbrainzArtistId: validBody.artistMbid,
  artistName: validBody.artistName,
  albumTitle: validBody.albumTitle,
  status: "requested",
  errorMessage: null,
  lidarrAlbumId: null,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: null,
};

describe("POST /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(downloadRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { notValid: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 202 with the created request on success", async () => {
    vi.mocked(findExistingActiveRequest).mockReturnValueOnce(undefined);
    vi.mocked(createDownloadRequest).mockReturnValueOnce(mockRow);

    const app = buildApp(downloadRoutes, "user-1");
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.id).toBe("row-1");
    expect(body.status).toBe("requested");
    expect(body.releaseGroupMbid).toBe(validBody.releaseGroupMbid);
    expect(body.artistName).toBe(validBody.artistName);
  });

  it("returns 409 when a matching active request already exists", async () => {
    vi.mocked(findExistingActiveRequest).mockReturnValueOnce(mockRow);

    const app = buildApp(downloadRoutes, "user-1");
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe("Request already active");
    expect(body.request.id).toBe("row-1");
  });
});

describe("GET /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with the requesting user's download requests", async () => {
    vi.mocked(getDownloadRequestsByUser).mockReturnValueOnce([mockRow]);

    const app = buildApp(downloadRoutes, "user-1");
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("row-1");
  });

  it("returns 200 with an empty array when the user has no requests", async () => {
    vi.mocked(getDownloadRequestsByUser).mockReturnValueOnce([]);

    const app = buildApp(downloadRoutes, "user-1");
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe("DELETE /:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 204 when the owner deletes their own request", async () => {
    vi.mocked(deleteDownloadRequest).mockReturnValueOnce(true);

    const app = buildApp(downloadRoutes, "user-1");
    const res = await app.inject({ method: "DELETE", url: "/row-1" });

    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when the request belongs to a different user", async () => {
    vi.mocked(deleteDownloadRequest).mockReturnValueOnce(false);

    const app = buildApp(downloadRoutes, "user-2");
    const res = await app.inject({ method: "DELETE", url: "/row-1" });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the request id does not exist", async () => {
    vi.mocked(deleteDownloadRequest).mockReturnValueOnce(false);

    const app = buildApp(downloadRoutes, "user-1");
    const res = await app.inject({ method: "DELETE", url: "/nonexistent" });

    expect(res.statusCode).toBe(404);
  });
});
