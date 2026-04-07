import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = (env.VITE_SITE_URL || "https://www.versery.today").replace(/\/$/, "");

  return {
    plugins: [
      react(),
      {
        name: "html-transform-site-url",
        transformIndexHtml(html) {
          return html.replaceAll("__SITE_URL__", siteUrl);
        },
      },
    ],
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: false,
    },
  };
});
