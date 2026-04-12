import { persistNewsletterSignup } from "../lib/newsletter-signup-append.js";

async function readRawBody(req, limitBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) {
      const err = new Error("body_too_large");
      err.code = "BODY_TOO_LARGE";
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  let raw;
  try {
    raw = await readRawBody(req, 4096);
  } catch (e) {
    if (e.code === "BODY_TOO_LARGE") {
      return res.status(413).json({ error: "body_too_large" });
    }
    return res.status(400).json({ error: "bad_body" });
  }

  const params = new URLSearchParams(raw);
  const email = params.get("email");

  try {
    await persistNewsletterSignup(email);
    return res.status(204).end();
  } catch (e) {
    if (e.code === "INVALID_EMAIL") {
      return res.status(400).json({ error: "invalid_email" });
    }
    console.error("[newsletter-signup]", e);
    return res.status(503).json({ error: "unavailable" });
  }
}
