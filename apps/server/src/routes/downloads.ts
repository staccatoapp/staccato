import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CreateDownloadRequestSchema, DownloadRequest } from "@staccato/shared";
import {
  createDownloadRequest,
  deleteDownloadRequest,
  findExistingActiveRequest,
  getDownloadRequestsByUser,
  DownloadRequestRow,
} from "../db/queries/download-requests.js";
import { submitToLidarr } from "../lidarr/submit.js";

function toDto(row: DownloadRequestRow): DownloadRequest {
  return {
    id: row.id,
    releaseGroupMbid: row.musicbrainzReleaseGroupId,
    artistMbid: row.musicbrainzArtistId,
    artistName: row.artistName,
    albumTitle: row.albumTitle,
    status: row.status,
    errorMessage: row.errorMessage,
    lidarrAlbumId: row.lidarrAlbumId,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

const downloadRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (req, reply) => {
    const parsed = CreateDownloadRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn(
        { err: parsed.error },
        "POST /downloads: invalid request body",
      );
      return reply.status(400).send({ error: "Invalid request" });
    }
    const body = parsed.data;

    const existing = findExistingActiveRequest(
      req.userId,
      body.releaseGroupMbid,
    );
    if (existing) {
      return reply
        .status(409)
        .send({ error: "Request already active", request: toDto(existing) });
    }

    const row = createDownloadRequest({
      userId: req.userId,
      musicbrainzReleaseGroupId: body.releaseGroupMbid,
      musicbrainzArtistId: body.artistMbid,
      artistName: body.artistName,
      albumTitle: body.albumTitle,
      status: "requested",
    });

    const override =
      body.qualityProfileId !== undefined
        ? { qualityProfileId: body.qualityProfileId }
        : undefined;
    submitToLidarr(row.id, req.log, override).catch((err) =>
      req.log.error(
        { err, requestId: row.id },
        "[downloads] submitToLidarr failed",
      ),
    );

    return reply.status(202).send(toDto(row));
  });

  app.get("/", async (req, reply) => {
    const rows = getDownloadRequestsByUser(req.userId);
    return reply.send(rows.map(toDto));
  });

  app.delete("/:id", async (req, reply) => {
    const parsedParams = z.object({ id: z.string() }).safeParse(req.params);
    if (!parsedParams.success)
      return reply.status(400).send({ error: "Invalid request" });
    const { id } = parsedParams.data;
    const deleted = deleteDownloadRequest(id, req.userId);
    if (!deleted) return reply.status(404).send({ error: "Not found" });
    return reply.status(204).send();
  });
};

export default downloadRoutes;
