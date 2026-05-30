# Cloudflare Deployment

Recommended production stack:

- Cloudflare Registrar or external domain using Cloudflare DNS.
- Cloudflare Pages for the static website.
- Cloudflare Pages Functions for the public read API and the restricted same-origin admin API.
- Cloudflare D1 for the editable database.
- `data.js` as a static fallback if the database API is unavailable.

This keeps public browsing on static HTML/CSS/JS while exposing D1 only through Pages Functions. The admin editor is included only in the Cloudflare Pages build and is not linked from the public homepage.

The Cloudflare and Netlify builds set `publicMode: "live"` in `cloudflare-config.js`, so public pages read the current database through `/api/data`. The bundled `data.js` snapshot remains a safe fallback if the API is temporarily unavailable.

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

6. Set an `ADMIN_SESSION_SECRET` Pages environment variable to a long random value.
7. If a second frontend such as Netlify reads the public API, add its origin to `ALLOWED_ORIGINS`.

## Import Data

Run these with Wrangler after logging in:

```bash
npx wrangler d1 execute attack-sota --remote --file cloudflare/d1/schema.sql
npx wrangler d1 execute attack-sota --remote --file cloudflare/d1/seed.sql
```

## Update Data

Update data either through the restricted Cloudflare admin editor or directly in Cloudflare D1 with the dashboard console, Wrangler, or another trusted database tool. Website administrators authenticate against the D1 `admin_users` table; they do not need Cloudflare account access. After substantial updates, export the data back to `db/attacks.json` and rebuild the static snapshot if you want the repository fallback to match production.

## Domain

If the domain is registered at Cloudflare, attach it directly in Pages under **Custom domains**. If it is registered elsewhere, change the domain's nameservers to Cloudflare or add the DNS record requested by Pages.

## Public Performance

The public pages are still static HTML/CSS/JS. `data.js` is shipped with the site as a fallback, and `/api/data` has a short cache header so recently loaded database responses can be reused.
