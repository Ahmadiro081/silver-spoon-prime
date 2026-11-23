import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
              priority: 30,
            },
            {
              name: "vendor-charts",
              test: /node_modules[\\/](recharts|d3-|victory-vendor)[\\/]/,
              priority: 20,
            },
            {
              name: "vendor-motion",
              test: /node_modules[\\/](motion|framer-motion)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
  },
});
