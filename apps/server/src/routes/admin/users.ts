import { FastifyPluginAsync } from "fastify";
import * as argon2 from "argon2";
import { AdminUserResponseSchema, CreateUserSchema } from "@staccato/shared";
import {
  createUser,
  findUserByUsername,
  listUsers,
} from "../../db/queries/users.js";

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => {
    const users = listUsers();
    return users.map((user) =>
      AdminUserResponseSchema.parse({
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
      }),
    );
  });

  fastify.post("/", async (req, reply) => {
    const { username, password } = CreateUserSchema.parse(req.body);

    try {
      const existing = findUserByUsername(username);
      if (existing) {
        req.log.warn(
          { username },
          "create user failed: username already taken",
        );
        return reply.code(409).send({ error: "Username already taken" });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });
      const user = createUser({ username, passwordHash, isAdmin: false });

      req.log.info(
        { userId: user.id, username: user.username },
        "user created by admin",
      );

      return reply.code(201).send(
        AdminUserResponseSchema.parse({
          id: user.id,
          username: user.username,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
        }),
      );
    } catch (err) {
      req.log.error({ err }, "failed to create user");
      throw err;
    }
  });
};

export default usersRoutes;
