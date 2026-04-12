import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = "https://www.versery.today";

function xmlEscape(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urlBlock(loc, priority, changefreq) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

const poems = JSON.parse(readFileSync(join(__dirname, "public/poems.json"), "utf8"));
const poets = JSON.parse(readFileSync(join(__dirname, "public/poets.json"), "utf8"));
const collections = JSON.parse(readFileSync(join(__dirname, "public/collections.json"), "utf8"));

const chunks = [];

chunks.push(urlBlock(`${BASE}/`, "1.0", "daily"));
chunks.push(urlBlock(`${BASE}/compass`, "0.6", "weekly"));
chunks.push(urlBlock(`${BASE}/voices`, "0.6", "weekly"));
chunks.push(urlBlock(`${BASE}/collections`, "0.6", "weekly"));

for (const poem of poems) {
  if (!poem?.id) continue;
  chunks.push(urlBlock(`${BASE}/poem/${encodeURIComponent(poem.id)}`, "0.8", "weekly"));
}

for (const poet of poets) {
  if (!poet?.id) continue;
  chunks.push(urlBlock(`${BASE}/voices/${encodeURIComponent(poet.id)}`, "0.7", "weekly"));
}

if (Array.isArray(collections)) {
  for (const col of collections) {
    if (!col?.id) continue;
    chunks.push(urlBlock(`${BASE}/collections/${encodeURIComponent(col.id)}`, "0.7", "weekly"));
  }
}

const out = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${chunks.join("\n")}
</urlset>
`;

writeFileSync(join(__dirname, "public/sitemap.xml"), out, "utf8");
