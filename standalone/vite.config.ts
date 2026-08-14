import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  // Load the committed public Firebase configuration from the repository root.
  envDir: "..",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../standalone-build",
    emptyOutDir: true,
    cssCodeSplit: false,
  },
});
