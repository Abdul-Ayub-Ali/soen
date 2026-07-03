import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    proxy: {
      "/users": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/groups": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/messages": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ai": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/cdn": {
        target: "https://unpkg.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cdn/, ""),
      },
    },
  },
});
