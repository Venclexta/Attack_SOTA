import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const database = JSON.parse(await readFile(resolve("db/attacks.json"), "utf8"));

const attacks = database.records.map((record) => {
  const {
    algorithmKey,
    sourceKey,
    roundCoverage,
    publication,
    ...siteRecord
  } = record;
  return siteRecord;
});

const siteData = {
  meta: database.meta,
  sources: database.sources,
  attacks
};

await writeFile(resolve("data.js"), `window.attackData = ${JSON.stringify(siteData, null, 2)};\n`);
