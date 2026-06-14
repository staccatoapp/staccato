import { defineConfig } from "vite";
import tanstackRouter from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [tanstackRouter(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    proxy: {
      // ws:true so the playback WebSocket (/api/playback/ws) upgrade is proxied
      // to Fastify in dev, same as the REST routes.
      "/api": { target: "http://localhost:8280", ws: true }, // TODO - fix port handling. PORT env should modify the port exposed for the static pages, NOT the internal API (what was i thinking)
      "/metadata": "http://localhost:8280",
    },
    allowedHosts: ["christos-pc.rhino-panga.ts.net", "100.95.9.124"],
  },
});
