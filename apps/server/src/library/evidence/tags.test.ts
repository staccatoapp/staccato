import { describe, it, expect } from "vitest";
import { inferFileFormat } from "./tags.js";

// Characterization tests for inferFileFormat. The function maps codec/container/
// extension to a normalised format string used downstream for digital-media
// release heuristics. Tests freeze the priority order: codec > container > ext.

describe("inferFileFormat", () => {
  describe("codec takes precedence", () => {
    it("returns flac for FLAC codec", () => {
      expect(inferFileFormat("/music/track.flac", undefined, "FLAC")).toBe("flac");
    });

    it("returns alac for ALAC codec (wins over M4A container)", () => {
      expect(inferFileFormat("/music/track.m4a", "MPEG-4/M4A", "ALAC")).toBe("alac");
    });

    it("returns aac for AAC codec", () => {
      expect(inferFileFormat("/music/track.m4a", undefined, "AAC")).toBe("aac");
    });

    it("returns mp3 for MPEG codec", () => {
      expect(inferFileFormat("/music/track.mp3", undefined, "MPEG 1 Layer 3")).toBe("mp3");
    });

    it("returns opus for Opus codec", () => {
      expect(inferFileFormat("/music/track.opus", undefined, "Opus")).toBe("opus");
    });

    it("returns vorbis for Vorbis codec", () => {
      expect(inferFileFormat("/music/track.ogg", undefined, "Vorbis")).toBe("vorbis");
    });

    it("is case-insensitive for codec strings", () => {
      expect(inferFileFormat("/music/track.flac", undefined, "flac")).toBe("flac");
      expect(inferFileFormat("/music/track.mp3", undefined, "mpeg 1 layer 3")).toBe("mp3");
    });
  });

  describe("container as fallback when no codec", () => {
    it("returns flac from FLAC container", () => {
      expect(inferFileFormat("/music/track.flac", "FLAC", undefined)).toBe("flac");
    });

    it("returns mp3 from MPEG container", () => {
      expect(inferFileFormat("/music/track.mp3", "MPEG", undefined)).toBe("mp3");
    });

    it("returns aac from MP4 container with .m4a extension", () => {
      // "MP4" (no "MPEG" substring) reaches the MPEG4/MP4 branch.
      // "MPEG 4" is caught earlier by the generic MPEG check and returns "mp3".
      expect(inferFileFormat("/music/track.m4a", "MP4", undefined)).toBe("aac");
    });

    it("returns opus from Ogg container with .opus extension", () => {
      expect(inferFileFormat("/music/track.opus", "Ogg", undefined)).toBe("opus");
    });

    it("returns vorbis from Ogg container with .ogg extension", () => {
      expect(inferFileFormat("/music/track.ogg", "Ogg", undefined)).toBe("vorbis");
    });
  });

  describe("extension fallback when neither codec nor container", () => {
    it("returns the lowercased extension for unrecognised formats", () => {
      expect(inferFileFormat("/music/track.wav", undefined, undefined)).toBe("wav");
      expect(inferFileFormat("/music/track.aiff", undefined, undefined)).toBe("aiff");
      expect(inferFileFormat("/music/track.wma", undefined, undefined)).toBe("wma");
    });
  });
});
