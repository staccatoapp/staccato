import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../config/config.js", () => ({
  getConfig: vi.fn(() => ({
    STACCATO_METADATA_URL: "http://localhost:8290/v1",
    STACCATO_METADATA_API_KEY: "test-facade-secret",
    MB_CONCURRENCY: 1,
    MB_INTERVAL_CAP: 1,
    MB_RATE_LIMIT_MS: 0,
  })),
}));

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../constants.js", () => ({
  APP_USER_AGENT: "staccato-test/1.0",
}));

describe("throttledFetch — Authorization header", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it("sends Authorization: Bearer header when STACCATO_METADATA_API_KEY is set", async () => {
    const { throttledFetch } = await import("./client.js");
    await throttledFetch("http://localhost:8290/v1/recordings/some-mbid");

    expect(mockFetch).toHaveBeenCalledOnce();
    const call = mockFetch.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-facade-secret",
    });
  });
});
