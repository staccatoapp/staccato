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
});
