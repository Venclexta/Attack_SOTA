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

  const supabaseUrl = String(process.env.SUPABASE_URL || "");
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "");
  const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);
  writeFileSync(
    path.join(distDir, "supabase-config.js"),
    `window.SUPABASE_CONFIG = {\n  enabled: ${supabaseEnabled},\n  url: ${JSON.stringify(supabaseUrl)},\n  anonKey: ${JSON.stringify(supabaseAnonKey)},\n  adminDomain: ${JSON.stringify(process.env.SUPABASE_ADMIN_DOMAIN || "attack-sota.local")}\n};\n`,
  );
}

function rebuildZipArchive() {
  if (process.env.NETLIFY === "true") return false;
  rmSync(zipPath, { force: true });
  execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", distDir, zipPath], {
    cwd: rootDir,
    stdio: "ignore",
  });
  return true;
}

function logSummary(zipCreated) {
  const files = readdirSync(distDir).sort();
  console.log(`Rebuilt ${path.relative(rootDir, distDir)} with ${files.length} files:`);
  for (const file of files) {
    console.log(`- ${file}`);
  }
  if (zipCreated) console.log(`Created ${path.relative(rootDir, zipPath)}`);
}

ensureSourceFilesExist();
rebuildDistDirectory();
const zipCreated = rebuildZipArchive();
logSummary(zipCreated);
