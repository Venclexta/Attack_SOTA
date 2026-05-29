# Cloudflare Deployment

Recommended production stack:

- Cloudflare Registrar or external domain using Cloudflare DNS.
- Cloudflare Pages for the static website.
- Cloudflare Pages Functions for the administrator API.
- Cloudflare D1 for the editable database.
- `data.js` as a static fallback and fast public snapshot.

This keeps high-volume public browsing on Cloudflare's CDN. D1 is mainly used by the admin UI and by the optional live public API.

The Cloudflare build sets `publicMode: "static"` in `cloudflare-config.js`, so public pages read the bundled `data.js` snapshot. The admin pages still read and write D1 live. If you later prefer every public visitor to read the database, change `publicMode` to `"live"`, but that is less suitable for traffic spikes.

## Generate Database Files

`db/attacks.json` is the repository seed dataset. Regenerate the D1 SQL files with:

```bash
npm run db:cloudflare
```

This creates:

- `cloudflare/d1/schema.sql`
- `cloudflare/d1/seed.sql`

## Create Cloudflare Resources

1. Create a Cloudflare Pages project from this repository. Prefer Git integration over drag-and-drop so Pages Functions are deployed together with the static files.
2. Set the build command to:

   ```bash
   npm run build:cloudflare
   ```

3. Set the build output directory to:

   ```text
   cloudflare-dist
   ```

4. Create a D1 database named `attack-sota`.
5. Bind the D1 database to Pages Functions with binding name:

   ```text
   DB
   ```

6. Add an environment variable for session signing:

   ```text
   ADMIN_SESSION_SECRET
   ```

   Use a long random value. Do not reuse an account password.

## Import Data

Run these with Wrangler after logging in:

```bash
npx wrangler d1 execute attack-sota --remote --file cloudflare/d1/schema.sql
npx wrangler d1 execute attack-sota --remote --file cloudflare/d1/seed.sql
```

## Create The First Admin

Generate SQL locally:

```bash
node scripts/create-cloudflare-admin-sql.mjs admin "REPLACE_WITH_STRONG_PASSWORD"
```

Copy the printed SQL and execute it in Cloudflare D1, either through the dashboard query console or Wrangler:

```bash
npx wrangler d1 execute attack-sota --remote --command "PASTE_SQL_HERE"
```

After that, sign in at `/admin.html`. Additional administrators can be created from the website admin page.

## Domain

If the domain is registered at Cloudflare, attach it directly in Pages under **Custom domains**. If it is registered elsewhere, change the domain's nameservers to Cloudflare or add the DNS record requested by Pages.

## Public Performance

The public pages are still static HTML/CSS/JS. `data.js` is shipped with the site, and `/api/data` has a short cache header. For the largest traffic spikes, rebuild and redeploy after data updates so the public pages can rely on the static snapshot instead of querying D1 for every visitor.
