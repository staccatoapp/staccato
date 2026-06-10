import { describe, expect, it } from "vitest";
import { displayHost, normaliseServerUrl } from "./server-url.js";

describe("normaliseServerUrl", () => {
  it("returns an empty string for empty or whitespace-only input", () => {
    expect(normaliseServerUrl("")).toBe("");
    expect(normaliseServerUrl("   ")).toBe("");
  });

  it("prepends https:// when no scheme is given", () => {
    expect(normaliseServerUrl("music.example.com")).toBe(
      "https://music.example.com",
    );
  });

  it("preserves an explicit http scheme (LAN servers)", () => {
    expect(normaliseServerUrl("http://192.168.1.10:8280")).toBe(
      "http://192.168.1.10:8280",
    );
  });

  it("preserves an explicit https scheme", () => {
    expect(normaliseServerUrl("https://music.example.com")).toBe(
      "https://music.example.com",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseServerUrl("  music.example.com  ")).toBe(
      "https://music.example.com",
    );
  });

  it("strips trailing slashes", () => {
    expect(normaliseServerUrl("https://music.example.com/")).toBe(
      "https://music.example.com",
    );
    expect(normaliseServerUrl("music.example.com//")).toBe(
      "https://music.example.com",
    );
  });

  it("keeps a port and path intact apart from the trailing slash", () => {
    expect(normaliseServerUrl("music.example.com:8280/staccato/")).toBe(
      "https://music.example.com:8280/staccato",
    );
  });
});

describe("displayHost", () => {
  it("strips the https scheme", () => {
    expect(displayHost("https://music.example.com")).toBe("music.example.com");
  });

  it("strips the http scheme and keeps the port", () => {
    expect(displayHost("http://192.168.1.10:8280")).toBe("192.168.1.10:8280");
  });

  it("strips trailing slashes", () => {
    expect(displayHost("https://music.example.com/")).toBe(
      "music.example.com",
    );
  });

  it("returns input unchanged when there is no scheme", () => {
    expect(displayHost("music.example.com")).toBe("music.example.com");
  });
});
