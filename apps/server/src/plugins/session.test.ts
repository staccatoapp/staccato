import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAdmin } from "./session.js";
import * as usersQueries from "../db/queries/users.js";

vi.mock("fastify-plugin", () => ({ default: (fn: unknown) => fn }));
vi.mock("@fastify/secure-session", () => ({ default: vi.fn() }));
vi.mock("../db/queries/users.js");

const makeReply = () => {
  const reply = { code: vi.fn(), send: vi.fn() };
  reply.code.mockReturnValue(reply);
  return reply;
};

const makeRequest = (userId = "user-1") => ({
  userId,
  log: { warn: vi.fn() },
});

describe("requireAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when user does not exist", async () => {
    vi.mocked(usersQueries.findUserById).mockReturnValue(undefined);
    const req = makeRequest();
    const reply = makeReply();
    await requireAdmin(req as never, reply as never);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: "Forbidden" });
  });

  it("returns 403 when user is not admin", async () => {
    vi.mocked(usersQueries.findUserById).mockReturnValue({
      id: "user-1",
      isAdmin: false,
    } as never);
    const req = makeRequest();
    const reply = makeReply();
    await requireAdmin(req as never, reply as never);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: "Forbidden" });
  });

  it("does not touch reply when user is admin", async () => {
    vi.mocked(usersQueries.findUserById).mockReturnValue({
      id: "user-1",
      isAdmin: true,
    } as never);
    const req = makeRequest();
    const reply = makeReply();
    await requireAdmin(req as never, reply as never);
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("logs a warning when access is denied", async () => {
    vi.mocked(usersQueries.findUserById).mockReturnValue({
      id: "user-1",
      isAdmin: false,
    } as never);
    const req = makeRequest();
    const reply = makeReply();
    await requireAdmin(req as never, reply as never);
    expect(req.log.warn).toHaveBeenCalledWith(
      { userId: "user-1" },
      "admin-only route accessed by non-admin",
    );
  });
});
