import { FastifyPluginAsync } from "fastify";
import scanRoutes from "./scan.js";
import { requireAdmin } from "../../plugins/session.js";
import lidarrRoutes from "./lidarr.js";
import usersRoutes from "./users.js";

const adminRoutes: FastifyPluginAsync = async (protectedApp) => {
  protectedApp.addHook("preHandler", requireAdmin);
  protectedApp.register(scanRoutes);
  protectedApp.register(lidarrRoutes, { prefix: "/lidarr" });
  protectedApp.register(usersRoutes, { prefix: "/users" });
};

export default adminRoutes;
