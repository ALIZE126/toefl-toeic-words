import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 相对路径：部署到 GitHub Pages 子路径或任意静态托管都能打开
  base: "./",
  server: { host: true, port: 5173 },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
