import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "netlify-dist");
const zipPath = path.join(rootDir, "netlify-dist.zip");

const publishFiles = [
  "_headers",
  "admin.html",
  "admin.js",
  "algorithm.html",
  "algorithm.js",
  "app.js",
  "backend.js",
  "cloudflare-config.js",
  "data.js",
  "index.html",
  "manage.html",
  "robots.txt",
  "styles.css",
  "supabase-config.js",
];

function ensureSourceFilesExist() {
  const missing = publishFiles.filter(
    (relativePath) => !existsSync(path.join(rootDir, relativePath)),
  );

  if (missing.length > 0) {
    throw new Error(`Missing publish files:\n- ${missing.join("\n- ")}`);
  }
}

function rebuildDistDirectory() {
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  for (const relativePath of publishFiles) {
    cpSync(path.join(rootDir, relativePath), path.join(distDir, relativePath), {
      recursive: true,
    });
  }

  const apiBase = String(process.env.CLOUDFLARE_API_BASE || "").replace(/\/$/, "");
  const cloudflareEnabled = apiBase ? "true" : "false";
  const publicMode = process.env.CLOUDFLARE_PUBLIC_MODE === "live" ? "live" : "static";
  writeFileSync(
    path.join(distDir, "cloudflare-config.js"),
    `window.CLOUDFLARE_CONFIG = {\n  enabled: ${cloudflareEnabled},\n  apiBase: ${JSON.stringify(apiBase)},\n  publicMode: ${JSON.stringify(publicMode)}\n};\n`,
  );
}

function rebuildZipArchive() {
  rmSync(zipPath, { force: true });
  execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", distDir, zipPath], {
    cwd: rootDir,
    stdio: "ignore",
  });
}

function logSummary() {
  const files = readdirSync(distDir).sort();
  console.log(`Rebuilt ${path.relative(rootDir, distDir)} with ${files.length} files:`);
  for (const file of files) {
    console.log(`- ${file}`);
  }
  console.log(`Created ${path.relative(rootDir, zipPath)}`);
}

ensureSourceFilesExist();
rebuildDistDirectory();
rebuildZipArchive();
logSummary();
