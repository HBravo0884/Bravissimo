import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths so the build works on any host or sub-folder.
  base: "./",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "shared/**/*.test.ts", "server/**/*.test.ts"],
  },
});
