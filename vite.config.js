import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = (env.VITE_SITE_URL || "https://www.versery.today").replace(/\/$/, "");

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["favicon.ico", "favicon.png", "pwa-192x192.png", "pwa-512x512.png"],
        manifest: {
          name: "Versery",
          short_name: "Versery",
          description: "Curated poetry for quiet reading — by mood, voice, and archive.",
          theme_color: "#f9f9f9",
          background_color: "#f9f9f9",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico}"],
          globIgnores: [
            "**/poems.json",
            "**/poets.json",
            "**/collections.json",
            "**/poets/**",
            "**/collections/**",
            "**/og-image.jpg",
          ],
          navigateFallback: "index.html",
          runtimeCaching: [],
        },
        devOptions: {
          enabled: false,
        },
      }),
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
