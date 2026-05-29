import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const database = JSON.parse(await readFile(resolve("db/attacks.json"), "utf8"));
const algorithms = new Map();

function sql(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

for (const record of database.records) {
  if (!algorithms.has(record.algorithmKey)) {
    algorithms.set(record.algorithmKey, {
      id: record.algorithmKey,
      designPaper: record.designPaper,
      designVenue: record.designVenue,
      designUrl: record.designUrl
    });
  }
}

const rows = [...algorithms.values()].sort((a, b) => a.id.localeCompare(b.id));
const missing = rows.filter((row) => !row.designPaper || !row.designVenue || !row.designUrl);

if (missing.length) {
  throw new Error(`Missing design metadata for: ${missing.map((row) => row.id).join(", ")}`);
}

const lines = [
  "alter table public.algorithms",
  "add column if not exists design_paper text,",
  "add column if not exists design_venue text,",
  "add column if not exists design_url text;",
  "",
  "with design_publications(id, design_paper, design_venue, design_url) as (",
  "  values"
];

rows.forEach((row, index) => {
  const suffix = index === rows.length - 1 ? "" : ",";
  lines.push(
    `    (${sql(row.id)}, ${sql(row.designPaper)}, ${sql(row.designVenue)}, ${sql(row.designUrl)})${suffix}`
  );
});

lines.push(
  ")",
  "update public.algorithms as algorithms",
  "set",
  "  design_paper = design_publications.design_paper,",
  "  design_venue = design_publications.design_venue,",
  "  design_url = design_publications.design_url,",
  "  updated_at = now()",
  "from design_publications",
  "where algorithms.id = design_publications.id;",
  ""
);

await writeFile(
  resolve("supabase/migrations/20260509110000_backfill_algorithm_design_publications.sql"),
  `${lines.join("\n")}\n`
);
