import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

globalThis.window = {};
await import(pathToFileURL(resolve("data.js")).href);

const source = globalThis.window.attackData;

function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function numbers(value) {
  return String(value)
    .match(/\d+(\.\d+)?/g)
    ?.map(Number) ?? [];
}

function roundCoverage(record) {
  const total = Math.max(...numbers(record.totalRounds), 0);
  const attacked = Math.max(...numbers(record.attackedRounds), 0);
  if (!total || !attacked) return null;
  return Number(Math.min(1, attacked / total).toFixed(4));
}

const records = source.attacks.map(({ note, ...record }) => ({
  ...record,
  algorithmKey: slug(record.algorithm),
  sourceKey: slug(`${record.venue}-${record.year}-${record.paper}`),
  roundCoverage: roundCoverage(record),
  publication: {
    venue: record.venue,
    year: record.year,
    title: record.paper,
    url: record.url
  }
}));

const database = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  meta: source.meta,
  sources: source.sources,
  records
};

await writeFile(resolve("db/attacks.json"), `${JSON.stringify(database, null, 2)}\n`);
