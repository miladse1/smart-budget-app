import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local only by default, so other devices on the network cannot reach the dev server or,
    // through its proxy, the API. Docker sets VITE_DEV_HOST=0.0.0.0 inside the container and
    // publishes the port on 127.0.0.1 only.
    host: process.env.VITE_DEV_HOST || "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": proxyTarget,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
  },
});
