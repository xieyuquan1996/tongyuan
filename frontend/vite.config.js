import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Vite config.
//
// In dev, /api/* is proxied to the Go relay running on :8080 (VITE_API_TARGET
// overrides). When VITE_USE_MOCK=true (the default), the browser-side mock
// backend in src/lib/mock.js intercepts /api/* before it hits the network, so
// the SPA is fully functional before the real backend ships those endpoints.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_TARGET || "http://localhost:8080";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
