import fs from "node:fs";
import { FastifyPluginAsync } from "fastify";
import { getTrackForStream } from "../db/queries/tracks.js";

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  opus: "audio/ogg; codecs=opus",
};

const tracksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/tracks/:id/stream", async (req, reply) => {
    const { id } = req.params as { id: string };
    const track = getTrackForStream(id);

    if (!track) return reply.status(404).send({ error: "Track not found" });

    // 2. Stat the file for size
    let stat: fs.Stats;
    try {
      stat = fs.statSync(track.filePath);
    } catch {
      return reply.status(500).send({ error: "Audio file not found on disk" });
    }

    const fileSize = stat.size;
    const contentType =
      (track.fileFormat && MIME[track.fileFormat]) ??
      "application/octet-stream";
    const rangeHeader = req.headers.range;

    // 3. Always advertise Range support
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Type", contentType);

    if (rangeHeader) {
      // 4a. Partial content (206) for Range requests
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr ?? "0", 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      reply.status(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      reply.header("Content-Length", chunkSize);

      return reply.send(fs.createReadStream(track.filePath, { start, end }));
    } else {
      // 4b. Full file (200)
      reply.header("Content-Length", fileSize);
      return reply.send(fs.createReadStream(track.filePath));
    }
  });
};

export default tracksRoutes;
