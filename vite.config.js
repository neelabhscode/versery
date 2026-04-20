import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { persistNewsletterSignup } from "./lib/newsletter-signup-append.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = (env.VITE_SITE_URL || "https://www.versery.today").replace(/\/$/, "");

  return {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/framer-motion")) return "framer-motion";
            if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "vendor";
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
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
      {
        name: "newsletter-signup-dev-api",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const pathname = req.url?.split("?")[0] ?? "";
            if (pathname !== "/api/newsletter-signup" || req.method !== "POST") {
              next();
              return;
            }
            try {
              const chunks = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                if (size > 4096) {
                  res.statusCode = 413;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: "body_too_large" }));
                  return;
                }
                chunks.push(chunk);
              }
              const raw = Buffer.concat(chunks).toString("utf8");
              const params = new URLSearchParams(raw);
              await persistNewsletterSignup(params.get("email"));
              res.statusCode = 204;
              res.end();
            } catch (e) {
              if (e.code === "INVALID_EMAIL") {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "invalid_email" }));
                return;
              }
              console.error("[newsletter-signup dev]", e);
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "unavailable" }));
            }
          });
        },
      },
    ],
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      strictPort: false,
    },
  };
});
