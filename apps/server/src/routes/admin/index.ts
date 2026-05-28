import { FastifyPluginAsync } from "fastify";
import scanRoutes from "./scan.js";
import { requireAdmin } from "../../plugins/session.js";
import lidarrRoutes from "./lidarr.js";

const adminRoutes: FastifyPluginAsync = async (protectedApp) => {
  protectedApp.addHook("preHandler", requireAdmin);
  protectedApp.register(scanRoutes);
  protectedApp.register(lidarrRoutes, { prefix: "/lidarr" });
};

export default adminRoutes;
