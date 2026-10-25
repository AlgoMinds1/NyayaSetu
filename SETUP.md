# NyayaSetu — Setup on a new machine

## Requirements
| Tool | Version | Notes |
|---|---|---|
| Node.js | 24.x (see `.nvmrc`; minimum 20.9) | `nvm use` |
| npm | 10+ (bundled with Node) | workspaces are used |
| Git | any | |
| Supabase project | Postgres 15+ with `vector`, `pg_trgm`, `pg_cron` extensions | enable `pg_cron` in Dashboard → Database → Extensions |
| Supabase CLI | installed via `npm install` (devDependency) | used for `db push` |
| Disk / network | ~1 GB free for the embedding model, downloaded on first use | `Xenova/paraphrase-multilingual-mpnet-base-v2` |

All JS dependencies are pinned in `package-lock.json`; always install with `npm ci`.

## 1. Install
```bash
git clone <repo-url> NyayaSetu
cd NyayaSetu
nvm use
npm ci
```

## 2. Environment
Copy the template and fill it in (never commit `.env.local`):
```bash
cp apps/web/.env.example apps/web/.env.local
```
Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `CRON_SECRET`, `APP_URL`.
Optional: `RESEND_API_KEY` + `NOTIFY_FROM_EMAIL` (email), VAPID keys (`npx web-push generate-vapid-keys`) for push.
Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 3. Database
Migrations live only in `supabase/migrations/` (`packages/db/migrations` is legacy reference).
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
```

## 4. Seed demo data and AI indexes
```bash
npm run seed
cd apps/web
node --env-file=.env.local src/scripts/backfill-embeddings.mjs
npx tsx --conditions=react-server --env-file=.env.local src/scripts/ingest-policy.mjs ../../docs/policy-corpus
cd ../..
```
Demo accounts sign in with email OTP (no passwords). Their `@nyayasetu.test` addresses cannot receive mail, so get a login code locally:
`npm run demo:code -- student.demo@nyayasetu.test`
Officer and college roles must enrol TOTP on first login.
Reset demo data at any time: `npm run demo:reset`.

## 5. Run
```bash
npm run dev
```
Open http://localhost:3000.

## 6. Scheduled jobs
- `pg_cron` (in the database): hourly deadline status refresh, monthly report queue.
- HTTP crons (call hourly from any scheduler with header `x-cron-secret: $CRON_SECRET`):
  - `POST /api/notifications/deadlines`
  - `POST /api/reports/run-scheduled`

## 7. Checks
```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run audit
```
End-to-end (needs a seeded live DB): `cd apps/web && npx playwright install chromium && DEMO_E2E=1 npx playwright test`.
Load test: see `apps/web/load/README.md` (k6).
