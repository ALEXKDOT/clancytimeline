import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../standalone-build",
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
