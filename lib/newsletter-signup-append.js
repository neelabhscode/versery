import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, BlobPreconditionFailedError, head, put } from "@vercel/blob";

const LOCAL_REL = path.join("data", "newsletter-signups.txt");

function sanitizeEmailForLog(email) {
  return String(email ?? "")
    .trim()
    .replace(/[\t\n\r]/g, " ")
    .slice(0, 254);
}

function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function formatSignupLine(email) {
  return `${new Date().toISOString()}\t${sanitizeEmailForLog(email)}\n`;
}

/**
 * Append one signup: local `data/newsletter-signups.txt` when the filesystem is writable,
 * otherwise Vercel Blob at `versery-newsletter-signups.txt` when `BLOB_READ_WRITE_TOKEN` is set.
 */
export async function persistNewsletterSignup(rawEmail) {
  const email = sanitizeEmailForLog(rawEmail);
  if (!isValidEmail(email)) {
    const err = new Error("invalid_email");
    err.code = "INVALID_EMAIL";
    throw err;
  }
  const line = formatSignupLine(email);
  const localPath = path.join(process.cwd(), LOCAL_REL);

  try {
    await mkdir(path.dirname(localPath), { recursive: true });
    await appendFile(localPath, line, "utf8");
    return { storage: "local_file" };
  } catch {
    /* fall through — e.g. read-only FS on Vercel */
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    const err = new Error("no_blob_token");
    err.code = "NO_STORAGE";
    throw err;
  }

  await appendViaBlob(line, token);
  return { storage: "vercel_blob" };
}

async function appendViaBlob(line, token) {
  const pathname = "versery-newsletter-signups.txt";
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let existing = "";
    let etag;

    try {
      const meta = await head(pathname, { token });
      etag = meta.etag;
      const r = await fetch(meta.url);
      if (r.ok) existing = await r.text();
    } catch (e) {
      if (!(e instanceof BlobNotFoundError)) throw e;
    }

    try {
      await put(pathname, existing + line, {
        access: "private",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "text/plain; charset=utf-8",
        ...(etag ? { ifMatch: etag } : {}),
      });
      return;
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) continue;
      throw e;
    }
  }

  const err = new Error("blob_append_exhausted_retries");
  err.code = "BLOB_CONFLICT";
  throw err;
}
