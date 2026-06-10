import {
  clearStoredToken,
  getStoredServerUrl,
  getStoredToken,
} from "./auth-storage";
import { ApiError, createApiClient } from "./api-client";
import { resolveStartRoute } from "./start-route";

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
    delete: jest.fn(),
  });
}

describe("resolveStartRoute", () => {
  beforeEach(() => jest.clearAllMocks());

  it("goes to connect when no token is stored", async () => {
    mockedGetToken.mockResolvedValue(null);
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    expect(await resolveStartRoute()).toBe("/(auth)/connect");
  });

  it("goes to connect when no server url is stored", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue(null);
    expect(await resolveStartRoute()).toBe("/(auth)/connect");
  });

  it("goes home when the stored token is accepted by the server", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    mockClient(jest.fn().mockResolvedValue({ id: "u1" }));
    expect(await resolveStartRoute()).toBe("/(home)");
  });

  it("clears the token and goes to connect on a 401", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    mockClient(jest.fn().mockRejectedValue(new ApiError(401, "unauthorized")));
    expect(await resolveStartRoute()).toBe("/(auth)/connect");
    expect(mockedClearToken).toHaveBeenCalled();
  });

  it("keeps the token but goes to connect when the server is unreachable", async () => {
    mockedGetToken.mockResolvedValue("tok");
    mockedGetServerUrl.mockResolvedValue("https://music.example.com");
    mockClient(jest.fn().mockRejectedValue(new Error("network down")));
    expect(await resolveStartRoute()).toBe("/(auth)/connect");
    expect(mockedClearToken).not.toHaveBeenCalled();
  });
});
