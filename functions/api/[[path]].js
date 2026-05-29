function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
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

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (!origin) return true;
  if (origin === requestOrigin(request)) return true;
  return configuredOrigins(env).includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const headers = new Headers();
  if (origin && isAllowedOrigin(request, env)) {
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

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return withCors(new Response(null, { status: 204 }), request, env);
  if (!env.DB) return withCors(errorResponse("Cloudflare D1 binding DB is not configured.", 500), request, env);
  if (!isAllowedOrigin(request, env)) return withCors(errorResponse("Invalid request origin.", 403), request, env);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const segments = path.split("/").filter(Boolean);

  try {
    if (method === "GET" && segments.length === 1 && segments[0] === "data") {
      return withCors(await listData(env), request, env);
    }

    return withCors(errorResponse("Not found.", 404), request, env);
  } catch (error) {
    console.error(error);
    return withCors(errorResponse("Request failed.", 500), request, env);
  }
}
