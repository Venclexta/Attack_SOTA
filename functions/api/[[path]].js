const sessionCookieName = "attack_sota_admin";
const sessionSeconds = 60 * 60 * 4;
const passwordIterations = 100000;

function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}

function isStrongPassword(value) {
  return (
    String(value || "").length >= 8 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function numbers(value) {
  return String(value).match(/\d+(\.\d+)?/g)?.map(Number) || [];
}

function roundCoverage(totalRounds, attackedRounds) {
  const totals = numbers(totalRounds);
  const attacked = numbers(attackedRounds);
  if (!totals.length || !attacked.length) return null;
  return Number(Math.min(1, Math.max(...attacked) / Math.max(...totals)).toFixed(4));
}

function sourceKey(record) {
  return slug(`${record.venue}-${record.year}-${record.paper}`);
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlEncode(value) {
  return bytesToBase64(new TextEncoder().encode(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return new TextDecoder().decode(base64ToBytes(padded));
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function hashPassword(password, salt, iterations = passwordIterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations
    },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function sessionSecret(env) {
  return env.ADMIN_SESSION_SECRET || env.CF_PAGES_COMMIT_SHA || "";
}

function requestOrigin(request) {
  return new URL(request.url).origin;
}

function configuredOrigins(env) {
  return String(env.ADMIN_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || "")
    .split(/[,\s]+/)
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (!origin) return true;
  if (origin === requestOrigin(request)) return true;
  return configuredOrigins(env).includes(origin);
}

function isCrossOriginRequest(request) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  return Boolean(origin && origin !== requestOrigin(request));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const headers = new Headers();
  if (origin && isAllowedOrigin(request, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("vary", "Origin");
  }
  return headers;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(request, env)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function cookieSecurityAttributes(request) {
  if (isCrossOriginRequest(request)) return "; SameSite=None; Secure";
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `; SameSite=Lax${secure}`;
}

function sessionCookie(token, request) {
  return `${sessionCookieName}=${token}; HttpOnly; Path=/; Max-Age=${sessionSeconds}${cookieSecurityAttributes(request)}`;
}

function clearSessionCookie(request) {
  return `${sessionCookieName}=; HttpOnly; Path=/; Max-Age=0${cookieSecurityAttributes(request)}`;
}

async function createSession(admin, env) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: admin.id,
      username: admin.username,
      role: admin.role || "admin",
      exp: Math.floor(Date.now() / 1000) + sessionSeconds
    })
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

async function readSession(request, env) {
  const secret = sessionSecret(env);
  const token = cookieValue(request, sessionCookieName);
  if (!secret || !token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = await hmac(payload, secret);
  if (!constantTimeEqual(signature, expected)) return null;
  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

async function requireAdmin(context) {
  const session = await readSession(context.request, context.env);
  if (!session?.sub) return null;
  const admin = await context.env.DB.prepare(
    `select id, username, email, display_name, role, is_active, created_at, updated_at
     from admin_users
     where id = ? and is_active = 1`
  )
    .bind(session.sub)
    .first();
  return admin || null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function hasValidOrigin(request, env) {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  return isAllowedOrigin(request, env);
}

function mapJoinedRow(row) {
  return {
    id: row.id,
    algorithm: row.algorithm_name,
    type: row.algorithm_type,
    totalRounds: row.total_rounds,
    attackedRounds: row.attacked_rounds,
    attack: row.attack,
    model: row.model,
    data: row.data_complexity,
    time: row.time_complexity,
    memory: row.memory_complexity,
    venue: row.publication_venue,
    year: row.publication_year,
    paper: row.publication_title,
    url: row.publication_url,
    tags: parseTags(row.algorithm_tags),
    structure: row.structure,
    algorithmYear: row.algorithm_year,
    designPaper: row.design_paper || "",
    designVenue: row.design_venue || "",
    designUrl: row.design_url || "",
    standard: row.standard || "Research primitive",
    algorithmKey: row.algorithm_id,
    sourceKey: row.publication_id,
    roundCoverage: row.round_coverage ?? roundCoverage(row.total_rounds, row.attacked_rounds),
    publication: {
      id: row.publication_id,
      venue: row.publication_venue,
      year: row.publication_year,
      title: row.publication_title,
      url: row.publication_url
    }
  };
}

async function listData(env) {
  const { results } = await env.DB.prepare(
    `select
       attacks.id,
       attacks.attack,
       attacks.model,
       attacks.attacked_rounds,
       attacks.round_coverage,
       attacks.data_complexity,
       attacks.time_complexity,
       attacks.memory_complexity,
       algorithms.id as algorithm_id,
       algorithms.name as algorithm_name,
       algorithms.structure,
       algorithms.algorithm_year,
       algorithms.design_paper,
       algorithms.design_venue,
       algorithms.design_url,
       algorithms.standard,
       algorithms.type as algorithm_type,
       algorithms.total_rounds,
       algorithms.tags as algorithm_tags,
       publications.id as publication_id,
       publications.venue as publication_venue,
       publications.year as publication_year,
       publications.title as publication_title,
       publications.url as publication_url
     from attacks
     join algorithms on algorithms.id = attacks.algorithm_id
     join publications on publications.id = attacks.publication_id
     order by lower(algorithms.name), attacks.round_coverage desc, lower(attacks.attack)`
  ).all();

  const attacks = (results || []).map(mapJoinedRow);
  const sourceMap = new Map();
  for (const attack of attacks) {
    sourceMap.set(attack.sourceKey, attack.publication);
  }

  return jsonResponse(
    {
      attacks,
      sources: [...sourceMap.values()],
      meta: {
        source: "cloudflare-d1",
        generatedAt: new Date().toISOString()
      }
    },
    {
      headers: {
        "cache-control": "public, max-age=60"
      }
    }
  );
}

async function loginAdmin(context) {
  const body = await readJson(context.request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return errorResponse("Enter both username and password.", 400);

  const admin = await context.env.DB.prepare(
    `select id, username, email, display_name, role, is_active, password_salt, password_hash, password_iterations
     from admin_users
     where (username = ? or email = ?) and is_active = 1`
  )
    .bind(username, username)
    .first();

  if (!admin) return errorResponse("Invalid credentials.", 401);
  const hash = await hashPassword(password, admin.password_salt, admin.password_iterations || passwordIterations);
  if (!constantTimeEqual(hash, admin.password_hash)) return errorResponse("Invalid credentials.", 401);

  const token = await createSession(admin, context.env);
  return jsonResponse(
    {
      admin: {
        user_id: admin.id,
        username: admin.username,
        email: admin.email,
        display_name: admin.display_name,
        role: admin.role,
        created_at: admin.created_at,
        updated_at: admin.updated_at
      }
    },
    {
      headers: {
        "set-cookie": sessionCookie(token, context.request),
        "cache-control": "no-store"
      }
    }
  );
}

async function sessionStatus(context) {
  const admin = await requireAdmin(context);
  return jsonResponse({ admin: admin ? normalizeAdmin(admin) : null }, { headers: { "cache-control": "no-store" } });
}

function normalizeAdmin(admin) {
  return {
    user_id: admin.id,
    username: admin.username,
    email: admin.email,
    display_name: admin.display_name,
    role: admin.role,
    is_active: Boolean(admin.is_active),
    created_at: admin.created_at,
    updated_at: admin.updated_at
  };
}

async function listAdmins(context) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  const { results } = await context.env.DB.prepare(
    `select id, username, email, display_name, role, is_active, created_at, updated_at
     from admin_users
     order by lower(username)`
  ).all();
  return jsonResponse({ admins: (results || []).map(normalizeAdmin) }, { headers: { "cache-control": "no-store" } });
}

async function createAdmin(context) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  const body = await readJson(context.request);
  const username = String(body.username || "").trim();
  const email = String(body.email || `${username}@attack-sota.local`).trim();
  const displayName = String(body.displayName || username).trim();
  const password = String(body.password || "");
  if (!username) return errorResponse("Username is required.");
  if (!email) return errorResponse("Email is required.");
  if (!isStrongPassword(password)) {
    return errorResponse("Password must be at least 8 characters and include letters and digits.");
  }

  const salt = randomSalt();
  const hash = await hashPassword(password, salt, passwordIterations);
  const id = crypto.randomUUID();
  await context.env.DB.prepare(
    `insert into admin_users
       (id, username, email, display_name, role, is_active, password_salt, password_hash, password_iterations)
     values (?, ?, ?, ?, 'admin', 1, ?, ?, ?)`
  )
    .bind(id, username, email, displayName, salt, hash, passwordIterations)
    .run();

  return jsonResponse({
    admin: normalizeAdmin({
      id,
      username,
      email,
      display_name: displayName,
      role: "admin",
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });
}

async function updateAdminPassword(context, id) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  const body = await readJson(context.request);
  const password = String(body.password || "");
  if (!id) return errorResponse("Administrator id is required.");
  if (!isStrongPassword(password)) {
    return errorResponse("Password must be at least 8 characters and include letters and digits.");
  }
  const salt = randomSalt();
  const hash = await hashPassword(password, salt, passwordIterations);
  await context.env.DB.prepare(
    `update admin_users
     set password_salt = ?, password_hash = ?, password_iterations = ?, updated_at = current_timestamp
     where id = ?`
  )
    .bind(salt, hash, passwordIterations, id)
    .run();
  return jsonResponse({ ok: true });
}

async function deleteAdmin(context, id) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  if (!id) return errorResponse("Administrator id is required.");
  await context.env.DB.prepare("delete from admin_users where id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}

function buildRows(record) {
  const algorithmKey = record.algorithmKey || slug(record.algorithm);
  const publicationKey = record.sourceKey || sourceKey(record);
  return {
    algorithm: [
      algorithmKey,
      record.algorithm,
      record.structure,
      Number(record.algorithmYear) || null,
      record.designPaper || null,
      record.designVenue || null,
      record.designUrl || null,
      record.standard || "Research primitive",
      record.type,
      record.totalRounds,
      JSON.stringify(record.tags || [])
    ],
    publication: [publicationKey, record.venue, Number(record.year), record.paper, record.url],
    attack: [
      record.id,
      algorithmKey,
      publicationKey,
      record.attack,
      record.model,
      record.attackedRounds,
      record.roundCoverage ?? roundCoverage(record.totalRounds, record.attackedRounds),
      record.data || "",
      record.time || "",
      record.memory || ""
    ]
  };
}

async function saveRecord(context) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  const record = await readJson(context.request);
  if (!record.id || !record.algorithm || !record.attack || !record.paper) {
    return errorResponse("Record id, algorithm, attack, and paper are required.");
  }
  const rows = buildRows(record);
  await context.env.DB.batch([
    context.env.DB.prepare(
      `insert into algorithms
         (id, name, structure, algorithm_year, design_paper, design_venue, design_url, standard, type, total_rounds, tags)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         name = excluded.name,
         structure = excluded.structure,
         algorithm_year = excluded.algorithm_year,
         design_paper = excluded.design_paper,
         design_venue = excluded.design_venue,
         design_url = excluded.design_url,
         standard = excluded.standard,
         type = excluded.type,
         total_rounds = excluded.total_rounds,
         tags = excluded.tags,
         updated_at = current_timestamp`
    ).bind(...rows.algorithm),
    context.env.DB.prepare(
      `insert into publications (id, venue, year, title, url)
       values (?, ?, ?, ?, ?)
       on conflict(id) do update set
         venue = excluded.venue,
         year = excluded.year,
         title = excluded.title,
         url = excluded.url,
         updated_at = current_timestamp`
    ).bind(...rows.publication),
    context.env.DB.prepare(
      `insert into attacks
         (id, algorithm_id, publication_id, attack, model, attacked_rounds, round_coverage, data_complexity, time_complexity, memory_complexity)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         algorithm_id = excluded.algorithm_id,
         publication_id = excluded.publication_id,
         attack = excluded.attack,
         model = excluded.model,
         attacked_rounds = excluded.attacked_rounds,
         round_coverage = excluded.round_coverage,
         data_complexity = excluded.data_complexity,
         time_complexity = excluded.time_complexity,
         memory_complexity = excluded.memory_complexity,
         updated_at = current_timestamp`
    ).bind(...rows.attack)
  ]);
  return jsonResponse({ id: record.id });
}

async function deleteRecord(context, id) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  if (!id) return errorResponse("Record id is required.");
  await context.env.DB.prepare("delete from attacks where id = ?").bind(id).run();
  return jsonResponse({ ok: true });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method.toUpperCase() === "OPTIONS") return withCors(new Response(null, { status: 204 }), request, env);
  if (!env.DB) return withCors(errorResponse("Cloudflare D1 binding DB is not configured.", 500), request, env);
  if (!hasValidOrigin(request, env)) return withCors(errorResponse("Invalid request origin.", 403), request, env);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const segments = path.split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    let response;

    if (method === "GET" && segments[0] === "data") response = await listData(env);

    else if (method === "POST" && segments[0] === "admin" && segments[1] === "login") response = await loginAdmin(context);
    else if (method === "POST" && segments[0] === "admin" && segments[1] === "logout") {
      response = jsonResponse(
        { ok: true },
        {
          headers: {
            "set-cookie": clearSessionCookie(request),
            "cache-control": "no-store"
          }
        }
      );
    }
    else if (method === "GET" && segments[0] === "admin" && segments[1] === "session") response = await sessionStatus(context);
    else if (method === "GET" && segments[0] === "admin" && segments[1] === "users") response = await listAdmins(context);
    else if (method === "POST" && segments[0] === "admin" && segments[1] === "users") response = await createAdmin(context);
    else if (method === "PUT" && segments[0] === "admin" && segments[1] === "users" && segments[3] === "password") {
      response = await updateAdminPassword(context, segments[2]);
    }
    else if (method === "DELETE" && segments[0] === "admin" && segments[1] === "users") response = await deleteAdmin(context, segments[2]);

    else if (method === "POST" && segments[0] === "records") response = await saveRecord(context);
    else if (method === "DELETE" && segments[0] === "records") response = await deleteRecord(context, segments[1]);

    else response = errorResponse("Not found.", 404);

    return withCors(response, request, env);
  } catch (error) {
    return withCors(errorResponse(error.message || "Request failed.", 500), request, env);
  }
}
