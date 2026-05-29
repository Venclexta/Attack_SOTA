import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const context = { window: {} };
vm.createContext(context);
vm.runInContext(await readFile(resolve("supabase-config.js"), "utf8"), context);

const config = context.window.SUPABASE_CONFIG || {};
if (!config.url || !config.anonKey) {
  throw new Error("supabase-config.js does not contain a Supabase url and anonKey.");
}

const localDatabase = JSON.parse(await readFile(resolve("db/attacks.json"), "utf8"));

function numbers(value) {
  return String(value).match(/\d+(\.\d+)?/g)?.map(Number) || [];
}

function roundCoverage(totalRounds, attackedRounds) {
  const totals = numbers(totalRounds);
  const attacked = numbers(attackedRounds);
  if (!totals.length || !attacked.length) return null;
  return Number(Math.min(1, Math.max(...attacked) / Math.max(...totals)).toFixed(4));
}

async function supabaseGet(path) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
      accept: "application/json"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase export failed (${response.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function fetchAllAttacks() {
  const select = [
    "id",
    "attack",
    "model",
    "attacked_rounds",
    "round_coverage",
    "data_complexity",
    "time_complexity",
    "memory_complexity",
    "algorithm:algorithms!attacks_algorithm_id_fkey(id,name,structure,algorithm_year,design_paper,design_venue,design_url,standard,type,total_rounds,tags)",
    "publication:publications!attacks_publication_id_fkey(id,venue,year,title,url)"
  ].join(",");

  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseGet(
      `attacks?select=${encodeURIComponent(select)}&order=algorithm_id.asc,id.asc&limit=${pageSize}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const attacks = await fetchAllAttacks();
const sourceMap = new Map();

const records = attacks.map((row) => {
  const algorithm = row.algorithm || {};
  const publication = row.publication || {};
  const sourceKey = publication.id || "";
  const algorithmKey = algorithm.id || "";
  const publicationRecord = {
    id: sourceKey,
    venue: publication.venue,
    year: publication.year,
    title: publication.title,
    url: publication.url
  };
  if (sourceKey) sourceMap.set(sourceKey, publicationRecord);

  return {
    id: row.id,
    algorithm: algorithm.name,
    type: algorithm.type,
    totalRounds: algorithm.total_rounds,
    attackedRounds: row.attacked_rounds,
    attack: row.attack,
    model: row.model,
    data: row.data_complexity || "",
    time: row.time_complexity || "",
    memory: row.memory_complexity || "",
    venue: publication.venue,
    year: publication.year,
    paper: publication.title,
    url: publication.url,
    tags: algorithm.tags || [],
    structure: algorithm.structure,
    algorithmYear: algorithm.algorithm_year,
    standard: algorithm.standard || "Research primitive",
    algorithmKey,
    sourceKey,
    roundCoverage: row.round_coverage ?? roundCoverage(algorithm.total_rounds, row.attacked_rounds),
    publication: publicationRecord,
    designPaper: algorithm.design_paper || "",
    designVenue: algorithm.design_venue || "",
    designUrl: algorithm.design_url || ""
  };
});

const database = {
  schemaVersion: localDatabase.schemaVersion || 1,
  generatedAt: new Date().toISOString(),
  meta: {
    ...(localDatabase.meta || {}),
    source: "supabase-export",
    exportedFrom: config.url
  },
  sources: [...sourceMap.values()],
  records
};

await writeFile(resolve("db/attacks.json"), `${JSON.stringify(database, null, 2)}\n`);
console.log(`Exported ${records.length} attack records from Supabase to db/attacks.json`);
