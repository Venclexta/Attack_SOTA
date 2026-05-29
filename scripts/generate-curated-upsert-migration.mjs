import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const db = JSON.parse(await readFile(resolve("db/attacks.json"), "utf8"));
const protectedAlgorithmKeys = new Set(["aes-128", "aes-192", "aes-256"]);
const records = db.records.filter((record) => !protectedAlgorithmKeys.has(record.algorithmKey));

function sql(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `ARRAY[${value.map((item) => sql(item)).join(", ")}]::text[]`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

const algorithms = new Map();
const publications = new Map();

for (const record of records) {
  algorithms.set(record.algorithmKey, {
    id: record.algorithmKey,
    name: record.algorithm,
    structure: record.structure,
    algorithm_year: record.algorithmYear || null,
    design_paper: record.designPaper || null,
    design_venue: record.designVenue || null,
    design_url: record.designUrl || null,
    standard: record.standard || "Research primitive",
    type: record.type,
    total_rounds: record.totalRounds,
    tags: record.tags || []
  });
  publications.set(record.sourceKey, {
    id: record.sourceKey,
    venue: record.venue,
    year: record.year,
    title: record.paper,
    url: record.url
  });
}

const lines = [
  "-- Curated attack-data refresh generated from db/attacks.json.",
  "-- This migration upserts curated rows without truncating user-added records.",
  "alter table public.publications drop column if exists authors;",
  "",
  "delete from public.attacks where id in ('aes-biclique-full', 'sm4-sms4-integral', 'sm4-sms4-differential');",
  "delete from public.attacks where algorithm_id = 'aes-128-192-256';",
  "delete from public.algorithms where id = 'aes-128-192-256';",
  ""
];

for (const row of algorithms.values()) {
  lines.push(
    `insert into public.algorithms (id, name, structure, algorithm_year, design_paper, design_venue, design_url, standard, type, total_rounds, tags) values (${sql(row.id)}, ${sql(row.name)}, ${sql(row.structure)}, ${sql(row.algorithm_year)}, ${sql(row.design_paper)}, ${sql(row.design_venue)}, ${sql(row.design_url)}, ${sql(row.standard)}, ${sql(row.type)}, ${sql(row.total_rounds)}, ${sql(row.tags)}) on conflict (id) do update set name = excluded.name, structure = excluded.structure, algorithm_year = excluded.algorithm_year, design_paper = excluded.design_paper, design_venue = excluded.design_venue, design_url = excluded.design_url, standard = excluded.standard, type = excluded.type, total_rounds = excluded.total_rounds, tags = excluded.tags, updated_at = now();`
  );
}

lines.push("");

for (const row of publications.values()) {
  lines.push(
    `insert into public.publications (id, venue, year, title, url) values (${sql(row.id)}, ${sql(row.venue)}, ${sql(row.year)}, ${sql(row.title)}, ${sql(row.url)}) on conflict (id) do update set venue = excluded.venue, year = excluded.year, title = excluded.title, url = excluded.url, updated_at = now();`
  );
}

lines.push("");

for (const record of records) {
  lines.push(
    `insert into public.attacks (id, algorithm_id, publication_id, attack, model, attacked_rounds, round_coverage, data_complexity, time_complexity, memory_complexity) values (${sql(record.id)}, ${sql(record.algorithmKey)}, ${sql(record.sourceKey)}, ${sql(record.attack)}, ${sql(record.model)}, ${sql(record.attackedRounds)}, ${sql(record.roundCoverage)}, ${sql(record.data)}, ${sql(record.time)}, ${sql(record.memory)}) on conflict (id) do update set algorithm_id = excluded.algorithm_id, publication_id = excluded.publication_id, attack = excluded.attack, model = excluded.model, attacked_rounds = excluded.attacked_rounds, round_coverage = excluded.round_coverage, data_complexity = excluded.data_complexity, time_complexity = excluded.time_complexity, memory_complexity = excluded.memory_complexity, updated_at = now();`
  );
}

await writeFile(
  resolve("supabase/migrations/20260510093000_upsert_curated_attack_records.sql"),
  `${lines.join("\n")}\n`
);
