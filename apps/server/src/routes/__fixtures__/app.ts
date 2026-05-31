import Fastify, { FastifyInstance, FastifyPluginAsync } from "fastify";
import { vi } from "vitest";

export type MockSession = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

/**
 * Builds a Fastify test app with a preHandler that sets req.userId.
 * Use for authenticated route tests (albums, playlists, etc.).
 */
export function buildApp(
  plugin: FastifyPluginAsync,
  userId = "user-1",
): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addHook("preHandler", async (req) => {
    (req as { userId?: string }).userId = userId;
  });
  app.register(plugin);
  return app;
}

/**
 * Builds a Fastify test app that injects a fake session object via onRequest.
 * Use for auth route tests where session.set / session.delete need asserting.
 * Pass a userId to simulate an authenticated session; omit for unauthenticated.
 */
export function buildSessionApp(
  plugin: FastifyPluginAsync,
  userId?: string,
): { app: FastifyInstance; session: MockSession } {
  const session: MockSession = {
    get: vi.fn((key: string) => (key === "userId" ? userId : undefined)),
    set: vi.fn(),
    delete: vi.fn(),
  };
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (req) => {
    (req as unknown as { session: MockSession }).session = session;
  });
  app.register(plugin);
  return { app, session };
}
