import { FastifyPluginAsync } from "fastify";
import {
  CreateDownloadRequestSchema,
  DownloadRequest,
} from "@staccato/shared";
import { lookupRecording } from "../musicbrainz/client.js";
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
    recordingMbid: row.musicbrainzRecordingId,
    artistName: row.artistName,
    trackTitle: row.trackTitle,
    albumTitle: row.albumTitle,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const downloadRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (req, reply) => {
    const { recordingMbid } = CreateDownloadRequestSchema.parse(req.body);

    const existing = findExistingActiveRequest(recordingMbid);
    if (existing) {
      return reply
        .status(409)
        .send({ error: "Request already active", request: toDto(existing) });
    }

    const recording = await lookupRecording(recordingMbid);
    if (!recording) {
      return reply
        .status(404)
        .send({ error: "Recording not found in MusicBrainz" });
    }

    const row = createDownloadRequest({
      userId: req.userId,
      musicbrainzRecordingId: recordingMbid,
      musicbrainzReleaseGroupId: recording.releaseGroupMbid,
      musicbrainzArtistId: recording.artistMbid,
      artistName: recording.artistName ?? "",
      trackTitle: recording.title,
      albumTitle: recording.releaseName,
      status: "requested",
    });

    submitToLidarr(row.id).catch((err) =>
      console.error("[downloads] submitToLidarr failed", err),
    );

    return reply.status(202).send(toDto(row));
  });

  app.get("/", async (req, reply) => {
    const rows = getDownloadRequestsByUser(req.userId);
    return reply.send(rows.map(toDto));
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = deleteDownloadRequest(id, req.userId);
    if (!deleted) return reply.status(404).send({ error: "Not found" });
    return reply.status(204).send();
  });
};

export default downloadRoutes;
