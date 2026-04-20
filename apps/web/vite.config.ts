import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8280", // TODO - fix port handling. PORT env should modify the port exposed for the static pages, NOT the API (the API is fully internal to the container)
    },
  },
});
