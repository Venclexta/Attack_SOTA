const sessionCookieName = "attack_sota_admin";
const sessionSeconds = 60 * 60 * 4;
const passwordIterations = 100000;
const maxLoginAttempts = 5;
const lockSeconds = 10 * 60;

function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
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

function numbers(value) {
  return String(value).match(/\d+(\.\d+)?/g)?.map(Number) || [];
}

function roundCoverage(totalRounds, attackedRounds) {
  const totals = numbers(totalRounds);
  const attacked = numbers(attackedRounds);
  if (!totals.length || !attacked.length) return null;
  return Number(Math.min(1, Math.max(...attacked) / Math.max(...totals)).toFixed(4));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseTags(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function requestOrigin(request) {
  return new URL(request.url).origin;
}

function configuredOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(/[,\s]+/)
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isAllowedPublicOrigin(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (!origin) return true;
  if (origin === requestOrigin(request)) return true;
  return configuredOrigins(env).includes(origin);
}

function isSameOrigin(request) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  return !origin || origin === requestOrigin(request);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const headers = new Headers();
  if (origin && isAllowedPublicOrigin(request, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "GET, OPTIONS");
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

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function sessionSecret(env) {
  return String(env.ADMIN_SESSION_SECRET || "");
}

function cookieSecurityAttributes(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `; SameSite=Strict${secure}`;
}

function sessionCookie(token, request) {
  return `${sessionCookieName}=${token}; HttpOnly; Path=/; Max-Age=${sessionSeconds}${cookieSecurityAttributes(request)}`;
}

function clearSessionCookie(request) {
  return `${sessionCookieName}=; HttpOnly; Path=/; Max-Age=0${cookieSecurityAttributes(request)}`;
}

async function createSession(admin, env) {
  const secret = sessionSecret(env);
  if (!secret) throw new Error("Administrator session secret is not configured.");
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

async function ensureAdminTables(env) {
  await env.DB.batch([
    env.DB.prepare(
      `create table if not exists admin_users (
        id text primary key,
        username text not null unique,
        email text not null unique,
        display_name text,
        role text not null default 'admin' check (role in ('admin')),
        is_active integer not null default 1,
        password_salt text not null,
        password_hash text not null,
        password_iterations integer not null default 100000,
        created_at text not null default current_timestamp,
        updated_at text not null default current_timestamp
      )`
    ),
    env.DB.prepare("create index if not exists admin_users_username_idx on admin_users(username)"),
    env.DB.prepare("create index if not exists admin_users_email_idx on admin_users(email)"),
    env.DB.prepare(
      `create table if not exists admin_login_attempts (
        key text primary key,
        attempts integer not null default 0,
        locked_until integer not null default 0,
        updated_at text not null default current_timestamp
      )`
    )
  ]);
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

async function requireAdmin(context) {
  await ensureAdminTables(context.env);
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

function clientIp(request) {
  return String(
    request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "unknown"
  ).slice(0, 80);
}

function loginAttemptKey(request, username) {
  return `${clientIp(request)}:${String(username || "").toLowerCase().slice(0, 80)}`;
}

async function loginLimitState(env, key) {
  return (
    (await env.DB.prepare("select attempts, locked_until from admin_login_attempts where key = ?").bind(key).first()) ||
    { attempts: 0, locked_until: 0 }
  );
}

async function recordLoginFailure(env, key) {
  const current = await loginLimitState(env, key);
  const attempts = Number(current.attempts || 0) + 1;
  const lockedUntil = attempts >= maxLoginAttempts ? Math.floor(Date.now() / 1000) + lockSeconds : 0;
  await env.DB.prepare(
    `insert into admin_login_attempts (key, attempts, locked_until, updated_at)
     values (?, ?, ?, current_timestamp)
     on conflict(key) do update set
       attempts = excluded.attempts,
       locked_until = excluded.locked_until,
       updated_at = current_timestamp`
  )
    .bind(key, attempts, lockedUntil)
    .run();
}

async function clearLoginFailures(env, key) {
  await env.DB.prepare("delete from admin_login_attempts where key = ?").bind(key).run();
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
  for (const attack of attacks) sourceMap.set(attack.sourceKey, attack.publication);

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

function cleanString(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanOptionalString(value, max = 500) {
  return cleanString(value, max);
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((tag) => cleanString(tag, 80))
        .filter(Boolean)
        .slice(0, 40)
    )
  ];
}

function sourceKey(record) {
  return slug(`${record.venue}-${record.year}-${record.paper}`);
}

function normalizeRecord(input) {
  const record = {
    id: cleanString(input.id, 160),
    algorithm: cleanString(input.algorithm, 160),
    structure: cleanString(input.structure, 120),
    algorithmYear: Number(input.algorithmYear) || null,
    designPaper: cleanOptionalString(input.designPaper, 500),
    designVenue: cleanOptionalString(input.designVenue, 160),
    designUrl: cleanOptionalString(input.designUrl, 500),
    standard: cleanOptionalString(input.standard, 160) || "Research primitive",
    type: cleanString(input.type, 20),
    totalRounds: cleanString(input.totalRounds, 80),
    attackedRounds: cleanString(input.attackedRounds, 80),
    attack: cleanString(input.attack, 160),
    model: cleanString(input.model, 200),
    data: cleanOptionalString(input.data, 160),
    time: cleanOptionalString(input.time, 160),
    memory: cleanOptionalString(input.memory, 160),
    venue: cleanString(input.venue, 120),
    year: Number(input.year) || null,
    paper: cleanString(input.paper, 500),
    url: cleanString(input.url, 500),
    tags: cleanTags(input.tags),
    algorithmKey: cleanString(input.algorithmKey, 160),
    sourceKey: cleanString(input.sourceKey, 240)
  };

  if (!record.id) throw new Error("Record id is required.");
  if (!record.algorithm) throw new Error("Algorithm name is required.");
  if (!["block", "hash"].includes(record.type)) throw new Error("Primitive type must be block or hash.");
  if (!record.structure) throw new Error("Structure is required.");
  if (!record.totalRounds) throw new Error("Total rounds is required.");
  if (!record.attack) throw new Error("Attack method is required.");
  if (!record.model) throw new Error("Attack model is required.");
  if (!record.attackedRounds) throw new Error("Attacked rounds is required.");
  if (!record.venue) throw new Error("Publication venue is required.");
  if (!Number.isInteger(record.year) || record.year < 1900 || record.year > 2200) {
    throw new Error("Publication year is invalid.");
  }
  if (record.algorithmYear !== null && (!Number.isInteger(record.algorithmYear) || record.algorithmYear < 1900 || record.algorithmYear > 2200)) {
    throw new Error("Algorithm year is invalid.");
  }
  if (!record.paper) throw new Error("Publication title is required.");
  if (!validUrl(record.url)) throw new Error("Publication URL must be http or https.");
  if (record.designUrl && !validUrl(record.designUrl)) throw new Error("Design paper URL must be http or https.");

  record.algorithmKey = slug(record.algorithmKey || record.algorithm);
  record.sourceKey = slug(record.sourceKey || sourceKey(record));
  record.roundCoverage = roundCoverage(record.totalRounds, record.attackedRounds);
  return record;
}

function buildRows(record) {
  return {
    algorithm: [
      record.algorithmKey,
      record.algorithm,
      record.structure,
      record.algorithmYear,
      record.designPaper || null,
      record.designVenue || null,
      record.designUrl || null,
      record.standard,
      record.type,
      record.totalRounds,
      JSON.stringify(record.tags)
    ],
    publication: [record.sourceKey, record.venue, record.year, record.paper, record.url],
    attack: [
      record.id,
      record.algorithmKey,
      record.sourceKey,
      record.attack,
      record.model,
      record.attackedRounds,
      record.roundCoverage,
      record.data,
      record.time,
      record.memory
    ]
  };
}

async function loginAdmin(context) {
  await ensureAdminTables(context.env);
  if (!sessionSecret(context.env)) return errorResponse("Administrator session secret is not configured.", 500);
  const body = await readJson(context.request);
  const username = cleanString(body.username, 160);
  const password = String(body.password || "");
  if (!username || !password) return errorResponse("Enter both username and password.", 400);

  const attemptKey = loginAttemptKey(context.request, username);
  const limit = await loginLimitState(context.env, attemptKey);
  if (Number(limit.locked_until || 0) > Math.floor(Date.now() / 1000)) {
    return errorResponse("Too many failed attempts. Try again later.", 429);
  }

  const admin = await context.env.DB.prepare(
    `select id, username, email, display_name, role, is_active, password_salt, password_hash, password_iterations
     from admin_users
     where (username = ? or email = ?) and is_active = 1`
  )
    .bind(username, username)
    .first();

  if (!admin) {
    await recordLoginFailure(context.env, attemptKey);
    return errorResponse("Invalid credentials.", 401);
  }

  const hash = await hashPassword(password, admin.password_salt, admin.password_iterations || passwordIterations);
  if (!constantTimeEqual(hash, admin.password_hash)) {
    await recordLoginFailure(context.env, attemptKey);
    return errorResponse("Invalid credentials.", 401);
  }

  await clearLoginFailures(context.env, attemptKey);
  const token = await createSession(admin, context.env);
  return jsonResponse(
    { admin: normalizeAdmin(admin) },
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

async function saveRecord(context) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  const record = normalizeRecord(await readJson(context.request));
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

  return jsonResponse({ id: record.id }, { headers: { "cache-control": "no-store" } });
}

async function deleteRecord(context, id) {
  const admin = await requireAdmin(context);
  if (!admin) return errorResponse("Administrator session required.", 401);
  const recordId = cleanString(decodeURIComponent(id || ""), 160);
  if (!recordId) return errorResponse("Record id is required.");
  await context.env.DB.prepare("delete from attacks where id = ?").bind(recordId).run();
  return jsonResponse({ ok: true }, { headers: { "cache-control": "no-store" } });
}

function isAdminPath(segments) {
  return segments[0] === "admin";
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const segments = path.split("/").filter(Boolean);

  if (!env.DB) return withCors(errorResponse("Cloudflare D1 binding DB is not configured.", 500), request, env);

  if (method === "OPTIONS") {
    if (isAdminPath(segments)) {
      return isSameOrigin(request)
        ? new Response(null, { status: 204 })
        : errorResponse("Invalid request origin.", 403);
    }
    return withCors(new Response(null, { status: 204 }), request, env);
  }

  if (isAdminPath(segments) && !isSameOrigin(request)) {
    return errorResponse("Invalid request origin.", 403);
  }
  if (!isAdminPath(segments) && !isAllowedPublicOrigin(request, env)) {
    return withCors(errorResponse("Invalid request origin.", 403), request, env);
  }

  try {
    let response;

    if (method === "GET" && segments.length === 1 && segments[0] === "data") response = await listData(env);
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
    else if (method === "POST" && segments[0] === "admin" && segments[1] === "records") response = await saveRecord(context);
    else if (method === "DELETE" && segments[0] === "admin" && segments[1] === "records") {
      response = await deleteRecord(context, segments[2]);
    }
    else response = errorResponse("Not found.", 404);

    return isAdminPath(segments) ? response : withCors(response, request, env);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && /required|invalid|must|URL|year/i.test(error.message)
      ? error.message
      : "Request failed.";
    const response = errorResponse(message, message === "Request failed." ? 500 : 400);
    return isAdminPath(segments) ? response : withCors(response, request, env);
  }
}
