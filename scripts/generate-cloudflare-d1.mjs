import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const db = JSON.parse(await readFile(resolve("db/attacks.json"), "utf8"));

function sql(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function json(value) {
  return sql(JSON.stringify(value ?? []));
}

const schema = `-- Cloudflare D1 schema for Symmetric Cryptanalysis Index.
-- Generated to match db/attacks.json and the browser admin API.

pragma foreign_keys = on;

create table if not exists algorithms (
  id text primary key,
  name text not null,
  structure text not null,
  algorithm_year integer,
  design_paper text,
  design_venue text,
  design_url text,
  standard text not null default 'Research primitive',
  type text not null check (type in ('block', 'hash')),
  total_rounds text not null,
  tags text not null default '[]',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists publications (
  id text primary key,
  venue text not null,
  year integer not null,
  title text not null,
  url text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists attacks (
  id text primary key,
  algorithm_id text not null references algorithms(id) on delete cascade,
  publication_id text not null references publications(id) on delete restrict,
  attack text not null,
  model text not null,
  attacked_rounds text not null,
  round_coverage real,
  data_complexity text not null default '',
  time_complexity text not null default '',
  memory_complexity text not null default '',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists admin_users (
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
);

create index if not exists attacks_algorithm_idx on attacks(algorithm_id);
create index if not exists attacks_coverage_idx on attacks(round_coverage desc);
create index if not exists publications_venue_year_idx on publications(venue, year desc);
create index if not exists algorithms_type_idx on algorithms(type);
create index if not exists algorithms_name_idx on algorithms(name);
create index if not exists admin_users_username_idx on admin_users(username);
create index if not exists admin_users_email_idx on admin_users(email);
`;

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

const seed = [
  "-- Generated from db/attacks.json for Cloudflare D1.",
  "pragma foreign_keys = off;",
  "delete from attacks;",
  "delete from publications;",
  "delete from algorithms;",
  "pragma foreign_keys = on;",
  ""
];

for (const row of algorithms.values()) {
  seed.push(
    `insert into algorithms (id, name, structure, algorithm_year, design_paper, design_venue, design_url, standard, type, total_rounds, tags) values (${sql(row.id)}, ${sql(row.name)}, ${sql(row.structure)}, ${sql(row.algorithm_year)}, ${sql(row.design_paper)}, ${sql(row.design_venue)}, ${sql(row.design_url)}, ${sql(row.standard)}, ${sql(row.type)}, ${sql(row.total_rounds)}, ${json(row.tags)});`
  );
}

seed.push("");

for (const row of publications.values()) {
  seed.push(
    `insert into publications (id, venue, year, title, url) values (${sql(row.id)}, ${sql(row.venue)}, ${sql(row.year)}, ${sql(row.title)}, ${sql(row.url)});`
  );
}

seed.push("");

for (const record of db.records) {
  seed.push(
    `insert into attacks (id, algorithm_id, publication_id, attack, model, attacked_rounds, round_coverage, data_complexity, time_complexity, memory_complexity) values (${sql(record.id)}, ${sql(record.algorithmKey)}, ${sql(record.sourceKey)}, ${sql(record.attack)}, ${sql(record.model)}, ${sql(record.attackedRounds)}, ${sql(record.roundCoverage)}, ${sql(record.data || "")}, ${sql(record.time || "")}, ${sql(record.memory || "")});`
  );
}

await mkdir(resolve("cloudflare/d1"), { recursive: true });
await writeFile(resolve("cloudflare/d1/schema.sql"), `${schema.trim()}\n`);
await writeFile(resolve("cloudflare/d1/seed.sql"), `${seed.join("\n")}\n`);

console.log("Generated cloudflare/d1/schema.sql");
console.log("Generated cloudflare/d1/seed.sql");
