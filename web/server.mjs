// Kvito website – tiny static server without dependencies (Railway service separate from the app).
// Serves ./public, fills {{APP_URL}} in HTML from the APP_URL environment variable, sets cache and security headers.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("./public", import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
// Where "Prijava" / "Začni brezplačno" lead. Change on Railway when the app gets its own domain (e.g. app.kvito.si).
const APP_URL = (process.env.APP_URL || "https://kvito-server-production.up.railway.app").replace(/\/+$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const htmlCache = new Map();

// Short content hash per asset, so each change gets a new URL (?v=…) and browsers never keep an old copy.
const versions = new Map();
async function version(path) {
  if (!versions.has(path)) {
    try {
      versions.set(path, createHash("sha1").update(await readFile(join(ROOT, path))).digest("hex").slice(0, 10));
    } catch {
      versions.set(path, "");
    }
  }
  return versions.get(path);
}

async function loadHtml(file) {
  if (!htmlCache.has(file)) {
    let html = (await readFile(file, "utf8")).replaceAll("{{APP_URL}}", APP_URL);
    const refs = [...new Set([...html.matchAll(/(?:href|src)="(\/[^"?#]+\.(?:css|js|webp|svg|png))"/g)].map((m) => m[1]))];
    for (const ref of refs) {
      const v = await version(ref);
      if (v) html = html.replaceAll(`"${ref}"`, `"${ref}?v=${v}"`);
    }
    htmlCache.set(file, html);
  }
  return htmlCache.get(file);
}

async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, clean);
  if (!file.startsWith(ROOT)) return null; // path traversal
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", ...SECURITY }).end();
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end('{"ok":true}');
      return;
    }
    const file = await resolveFile(req.url || "/");
    const type = file ? TYPES[extname(file)] || "application/octet-stream" : TYPES[".html"];
    if (!file) {
      const body = await loadHtml(join(ROOT, "404.html"));
      res.writeHead(404, { "Content-Type": type, "Cache-Control": "no-cache", ...SECURITY });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }
    const isHtml = extname(file) === ".html";
    const body = isHtml ? await loadHtml(file) : await readFile(file);
    // HTML always fresh. Assets requested with ?v=<hash> never change → cache for a year; without it, revalidate.
    const versioned = /[?&]v=[0-9a-f]+/.test(req.url || "");
    const cache = isHtml || !versioned ? "no-cache" : "public, max-age=31536000, immutable";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, ...SECURITY });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Napaka strežnika.");
  }
});

server.listen(PORT, () => console.log(`Kvito spletna stran posluša na :${PORT} (aplikacija: ${APP_URL})`));

// Close cleanly on redeploy.
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
