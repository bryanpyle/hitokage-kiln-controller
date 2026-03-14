import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API calls to the FastAPI backend during development
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
      },
      // Proxy WebSocket connections to the FastAPI backend during development
      "/ws": {
        target: "ws://localhost:8081",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/victory-vendor")) {
            return "recharts";
          }
          if (id.includes("node_modules/@mui") || id.includes("node_modules/@emotion")) {
            return "mui";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom") || id.includes("node_modules/scheduler")) {
            return "react";
          }
        },
      },
    },
  },
});
