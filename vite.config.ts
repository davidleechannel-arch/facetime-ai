import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works from any sub-path (e.g. GitHub Pages /facetime-ai/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
