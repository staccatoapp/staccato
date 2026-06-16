import { ApiError, createApiClient } from "./api-client";
import {
  clearStoredToken,
  getStoredServerUrl,
  getStoredToken,
} from "./auth-storage";
import { loadInitialSession } from "./session-bootstrap";

jest.mock("./auth-storage");
jest.mock("./api-client", () => {
  const actual = jest.requireActual("./api-client");
  return { ...actual, createApiClient: jest.fn() };
});

const mockedGetToken = jest.mocked(getStoredToken);
const mockedGetServerUrl = jest.mocked(getStoredServerUrl);
const mockedClearToken = jest.mocked(clearStoredToken);
const mockedCreateClient = jest.mocked(createApiClient);

function mockClient(get: jest.Mock) {
  mockedCreateClient.mockReturnValue({
    get,
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  });
}

describe("loadInitialSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns null when no token is stored", async () => {
    mockedGetToken.mockResolvedValue(null);
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    expect(await loadInitialSession()).toBeNull();
  });

  it("returns null when no server url is stored", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue(null);
    expect(await loadInitialSession()).toBeNull();
  });

  it("returns the session when the stored token is accepted", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    mockClient(jest.fn().mockResolvedValue({ id: "u1" }));
    expect(await loadInitialSession()).toEqual({
      serverUrl: "https://music.example.com",
      token: "tok",
    });
  });

  it("clears the token and returns null on a 401", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    mockClient(jest.fn().mockRejectedValue(new ApiError(401, "unauthorized")));
    expect(await loadInitialSession()).toBeNull();
    expect(mockedClearToken).toHaveBeenCalled();
  });

  it("keeps the token but returns null when the server is unreachable", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    mockClient(jest.fn().mockRejectedValue(new Error("network down")));
    expect(await loadInitialSession()).toBeNull();
    expect(mockedClearToken).not.toHaveBeenCalled();
  });
});
