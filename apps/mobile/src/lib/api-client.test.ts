import { z } from "zod";

import { ApiError, createApiClient } from "./api-client";

const PingSchema = z.object({ ok: z.boolean() });

function mockFetchOnce(status: number, body: unknown) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
  const fetchMock = jest.fn().mockResolvedValue(response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("createApiClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("GETs baseUrl + path and parses the response with the schema", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true });
    const client = createApiClient("https://music.example.com");
    const result = await client.get("/api/health", PingSchema);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://music.example.com/api/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("sends a bearer token when configured", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true });
    const client = createApiClient("https://music.example.com", "tok-123");
    await client.get("/api/auth/me", PingSchema);

    const headers = fetchMock.mock.calls[0]![1].headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer tok-123");
  });

  it("POSTs a JSON body", async () => {
    const fetchMock = mockFetchOnce(201, { ok: true });
    const client = createApiClient("https://music.example.com");
    await client.post("/api/auth/token", { username: "a" }, PingSchema);

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ username: "a" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("throws ApiError with the status for non-2xx responses", async () => {
    mockFetchOnce(401, { error: "Invalid credentials" });
    const client = createApiClient("https://music.example.com");
    await expect(client.get("/api/auth/me", PingSchema)).rejects.toMatchObject({
      status: 401,
    });
    await expect(client.get("/api/auth/me", PingSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("throws ApiError when the response body fails schema validation", async () => {
    mockFetchOnce(200, { unexpected: "shape" });
    const client = createApiClient("https://music.example.com");
    await expect(client.get("/api/health", PingSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("PUTs a JSON body and parses the response with the schema", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true });
    const client = createApiClient("https://music.example.com", "tok-123");
    const result = await client.put(
      "/api/playback/devices/active",
      { isPlaying: true },
      PingSchema,
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://music.example.com/api/playback/devices/active");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ isPlaying: true }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-123",
    );
    expect(result).toEqual({ ok: true });
  });

  it("throws ApiError with the status when a PUT fails", async () => {
    mockFetchOnce(400, { error: "Invalid request" });
    const client = createApiClient("https://music.example.com");
    await expect(
      client.put("/api/playback/devices/active", {}, PingSchema),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns null for a 204 response when the schema allows null", async () => {
    mockFetchOnce(204, undefined);
    const client = createApiClient("https://music.example.com");
    const result = await client.get("/api/thing", PingSchema.nullable());
    expect(result).toBeNull();
  });

  it("throws ApiError for a 204 response when the schema does not allow null", async () => {
    mockFetchOnce(204, undefined);
    const client = createApiClient("https://music.example.com");
    await expect(client.get("/api/thing", PingSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
