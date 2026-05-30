# Data Layer

`db/attacks.json` is the canonical seed dataset for the website. It keeps one record per published attack and includes derived fields used by the Cloudflare D1 import:

- `algorithmKey`: stable algorithm id.
- `sourceKey`: stable publication id.
- `roundCoverage`: parsed attacked-round coverage.
- `publication`: normalized publication metadata.

Recommended update workflow:

1. Edit production data through the restricted Cloudflare admin editor, Cloudflare D1 dashboard console, Wrangler, or another trusted database tool.
2. Export or manually update `db/attacks.json` when you want the repository snapshot to match the live database.
3. Run `node scripts/build-data-js.mjs` to refresh the static fallback.
4. Run `npm run db:cloudflare` to regenerate `cloudflare/d1/schema.sql` and `cloudflare/d1/seed.sql`.

Cloudflare D1 files:

- `cloudflare/d1/schema.sql`: schema for a fresh D1 database.
- `cloudflare/d1/seed.sql`: seed data generated from `db/attacks.json`.

The public site uses `data.js` as a static fallback. Netlify is configured to read the live Cloudflare Pages API at `https://attack-sota.pages.dev`.
