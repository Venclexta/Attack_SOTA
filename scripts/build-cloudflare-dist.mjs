import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "cloudflare-dist");

const publishFiles = [
  "_headers",
  "algorithm.html",
  "algorithm.js",
  "app.js",
  "backend.js",
  "cloudflare-config.js",
  "data.js",
  "index.html",
  "robots.txt",
  "styles.css"
];

function ensureSourceFilesExist() {
  const missing = publishFiles.filter((relativePath) => !existsSync(path.join(rootDir, relativePath)));
  if (missing.length > 0) throw new Error(`Missing publish files:\n- ${missing.join("\n- ")}`);
}

function rebuildDistDirectory() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  for (const relativePath of publishFiles) {
    cpSync(path.join(rootDir, relativePath), path.join(distDir, relativePath), { recursive: true });
  }
  writeFileSync(
    path.join(distDir, "cloudflare-config.js"),
    'window.CLOUDFLARE_CONFIG = {\n  enabled: true,\n  apiBase: "",\n  publicMode: "live"\n};\n'
  );
  writeFileSync(
    path.join(distDir, "_headers"),
    `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
`
  );
}

function logSummary() {
  const files = readdirSync(distDir).sort();
  console.log(`Rebuilt ${path.relative(rootDir, distDir)} with ${files.length} top-level entries:`);
  for (const file of files) console.log(`- ${file}`);
}

ensureSourceFilesExist();
rebuildDistDirectory();
logSummary();
