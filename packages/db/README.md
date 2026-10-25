# Database migrations

The Supabase migration source of truth is `../../supabase/migrations/`. This package intentionally contains no second ORM schema so the project has one migration authority. Read `docs/schema.md`, `docs/permissions.md`, and `docs/state-machine.md` before changing migrations.

Apply migrations only after reviewing the linked project reference and taking a backup. The service-role key is server-only and must never be placed in a `NEXT_PUBLIC_` variable.

**Migration authority:** `supabase/migrations/` is the only migration authority. `packages/db/migrations/` is legacy reference only and must not be applied or extended; it is kept for history and is not deleted.
