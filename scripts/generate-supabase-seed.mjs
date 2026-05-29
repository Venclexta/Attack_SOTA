import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const db = JSON.parse(await readFile(resolve("db/attacks.json"), "utf8"));

function sql(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `ARRAY[${value.map((item) => sql(item)).join(", ")}]::text[]`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

const algorithms = new Map();
const publications = new Map();

for (const record of db.records) {
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
  "-- Generated from db/attacks.json",
  "truncate table attacks, publications, algorithms cascade;",
  ""
];

for (const row of algorithms.values()) {
  lines.push(
    `insert into algorithms (id, name, structure, algorithm_year, design_paper, design_venue, design_url, standard, type, total_rounds, tags) values (${sql(row.id)}, ${sql(row.name)}, ${sql(row.structure)}, ${sql(row.algorithm_year)}, ${sql(row.design_paper)}, ${sql(row.design_venue)}, ${sql(row.design_url)}, ${sql(row.standard)}, ${sql(row.type)}, ${sql(row.total_rounds)}, ${sql(row.tags)});`
  );
}

lines.push("");

for (const row of publications.values()) {
  lines.push(
    `insert into publications (id, venue, year, title, url) values (${sql(row.id)}, ${sql(row.venue)}, ${sql(row.year)}, ${sql(row.title)}, ${sql(row.url)});`
  );
}

lines.push("");

for (const record of db.records) {
  lines.push(
    `insert into attacks (id, algorithm_id, publication_id, attack, model, attacked_rounds, round_coverage, data_complexity, time_complexity, memory_complexity) values (${sql(record.id)}, ${sql(record.algorithmKey)}, ${sql(record.sourceKey)}, ${sql(record.attack)}, ${sql(record.model)}, ${sql(record.attackedRounds)}, ${sql(record.roundCoverage)}, ${sql(record.data)}, ${sql(record.time)}, ${sql(record.memory)});`
  );
}

await mkdir(resolve("supabase/migrations"), { recursive: true });
await writeFile(resolve("supabase/seed.sql"), `${lines.join("\n")}\n`);
await writeFile(
  resolve("supabase/migrations/20260508120000_init_attack_sota.sql"),
  `${await readFile(resolve("db/postgres-schema.sql"), "utf8")}\n`
);
