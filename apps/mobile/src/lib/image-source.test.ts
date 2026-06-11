import { resolveImageSource } from "./image-source";

describe("resolveImageSource", () => {
  const serverUrl = "https://music.example.com";
  const token = "tok";

  it("absolutises a server-relative path and attaches the bearer token", () => {
    expect(
      resolveImageSource("/metadata/covers/abc.jpg", serverUrl, token),
    ).toEqual({
      uri: "https://music.example.com/metadata/covers/abc.jpg",
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("omits the Authorization header for a relative path when no token is present", () => {
    expect(
      resolveImageSource("/metadata/covers/abc.jpg", serverUrl, undefined),
    ).toEqual({
      uri: "https://music.example.com/metadata/covers/abc.jpg",
    });
  });

  it("trims a trailing slash on the server url before joining", () => {
    expect(
      resolveImageSource(
        "/metadata/covers/abc.jpg",
        "https://music.example.com/",
        token,
      ),
    ).toEqual({
      uri: "https://music.example.com/metadata/covers/abc.jpg",
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("passes an absolute https url through without the bearer token", () => {
    expect(
      resolveImageSource(
        "https://metadata.example.net/cover-art/release-group/rg-1",
        serverUrl,
        token,
      ),
    ).toEqual({
      uri: "https://metadata.example.net/cover-art/release-group/rg-1",
    });
  });

  it("passes an absolute http url through without the bearer token", () => {
    expect(
      resolveImageSource("http://insecure.example.net/x.jpg", serverUrl, token),
    ).toEqual({ uri: "http://insecure.example.net/x.jpg" });
  });

  it("returns null for a relative path when there is no server url", () => {
    expect(
      resolveImageSource("/metadata/covers/abc.jpg", undefined, token),
    ).toBeNull();
  });

  it("returns null for a null url", () => {
    expect(resolveImageSource(null, serverUrl, token)).toBeNull();
  });

  it("returns null for an empty url", () => {
    expect(resolveImageSource("", serverUrl, token)).toBeNull();
  });

  it("returns null for an unrecognised non-url value (e.g. a sentinel)", () => {
    expect(
      resolveImageSource("cover:external:rg-1", serverUrl, token),
    ).toBeNull();
  });
});
