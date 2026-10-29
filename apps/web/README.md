# NyayaSetu web app

## Run locally

From the repository root, install workspace dependencies with `npm install`. Copy `apps/web/.env.example` to `apps/web/.env.local`, fill the Supabase URL, anon key, and server-only service-role key, then run `npm run dev`.

The app uses Next.js 16 App Router with JavaScript, Supabase SSR cookies, email OTP, TOTP for privileged roles, a server-side role/session guard in `src/proxy.js`, PostgreSQL RLS, and an append-only audit log. Portal pages are protected placeholders; case workflows are planned for later phases.

## Database

Migrations live in `supabase/migrations`. Review `docs/phase-1-setup.md` before linking or pushing to a hosted project. Run `npm run db:test` after starting the local Supabase stack. The Phase 1 RLS checks are in `supabase/tests/phase1_rls.test.sql`.
