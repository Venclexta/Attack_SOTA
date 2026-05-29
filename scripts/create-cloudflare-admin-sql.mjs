import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";

const [usernameArg, passwordArg, emailArg, displayNameArg] = process.argv.slice(2);

if (!usernameArg || !passwordArg) {
  console.error("Usage: node scripts/create-cloudflare-admin-sql.mjs <username> <password> [email] [display_name]");
  process.exit(1);
}

function isStrongPassword(value) {
  return (
    String(value || "").length >= 8 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function sql(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

if (!isStrongPassword(passwordArg)) {
  console.error("Password must be at least 8 characters and include letters, digits, and symbols.");
  process.exit(1);
}

const username = usernameArg.trim();
const email = (emailArg || `${username}@attack-sota.local`).trim();
const displayName = (displayNameArg || username).trim();
const salt = randomBytes(16).toString("base64");
const iterations = 210000;
const hash = pbkdf2Sync(passwordArg, Buffer.from(salt, "base64"), iterations, 32, "sha256").toString("base64");

console.log(`insert into admin_users (id, username, email, display_name, role, is_active, password_salt, password_hash, password_iterations)
values (${sql(randomUUID())}, ${sql(username)}, ${sql(email)}, ${sql(displayName)}, 'admin', 1, ${sql(salt)}, ${sql(hash)}, ${iterations})
on conflict(username) do update set
  email = excluded.email,
  display_name = excluded.display_name,
  password_salt = excluded.password_salt,
  password_hash = excluded.password_hash,
  password_iterations = excluded.password_iterations,
  is_active = 1,
  updated_at = current_timestamp;`);
