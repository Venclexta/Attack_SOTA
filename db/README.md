# Cloud-Friendly Data Layer

`db/attacks.json` is the cloud-ready seed database for the site. It keeps one record per published attack result and adds derived fields that are useful for APIs and SQL imports:

- `algorithmKey`: stable slug for grouping records by algorithm.
- `roundCoverage`: numeric coverage ratio from `0` to `1` when rounds can be parsed.
- `publication`: nested publication object for future joins or source deduplication.

Recommended cloud tables:

```sql
algorithms(id, name, structure, type, total_rounds, tags)
attacks(id, algorithm_id, attack, model, attacked_rounds, round_coverage, data_complexity, time_complexity, memory_complexity)
publications(id, venue, year, title, url)
attack_publications(attack_id, publication_id)
```

See `postgres-schema.sql` for a concrete Supabase/Postgres schema.

Supabase-ready project files are now included in the repo:

- `supabase/config.toml`
- `supabase/migrations/20260508120000_init_attack_sota.sql`
- `supabase/seed.sql`
- `supabase-config.example.js`
- `backend.js`

For a document database, keep `records` as-is and index:

```text
algorithmKey
type
tags
publication.venue
publication.year
roundCoverage
```

Recommended update workflow:

1. Edit `db/attacks.json` as the canonical cloud data file.
2. Run `node scripts/build-data-js.mjs` to refresh the local static fallback.
3. Commit or upload `db/attacks.json` to the cloud backend.
4. Validate against `db/attacks.schema.json` in CI or before import.

If you make quick local edits in `data.js`, run `node scripts/export-db.mjs` to regenerate `db/attacks.json`.

Recommended Supabase setup workflow:

1. Create a Supabase project in the dashboard.
2. Copy `supabase-config.example.js` to `supabase-config.js` values by editing `supabase-config.js`.
3. Set `enabled: true`, then fill `url`, `anonKey`, and `adminEmail`.
4. Run `./tools/supabase-cli/supabase login` and connect the CLI to your account.
5. Run `./tools/supabase-cli/supabase link --project-ref <your-project-ref>`.
6. Run `./tools/supabase-cli/supabase db push`.
7. Run `./tools/supabase-cli/supabase db seed`.

Once configured, the public pages will read from Supabase first, and `manage.html` will use real database CRUD instead of local draft fallback.

Cloudflare D1 is also supported for long-lived static hosting with a custom domain and large public traffic bursts:

- `functions/api/[[path]].js` exposes the Pages Functions API.
- `cloudflare-config.js` controls whether the browser uses the Cloudflare API.
- `cloudflare/d1/schema.sql` and `cloudflare/d1/seed.sql` are generated from `db/attacks.json`.
- `cloudflare/README.md` contains the deployment workflow.

When the site is deployed behind HTTP, the frontend can be changed to fetch `/db/attacks.json` directly. For local `file://` use, `data.js` remains the no-build fallback because browsers often block JSON fetches from local files.
