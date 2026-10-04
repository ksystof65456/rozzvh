# Rozvrh

Česká PWA pro týdenní rozvrh vysokoškoláků, s účty a soukromými rozvrhy v Supabase.

## Run & Operate

- Install the imported workspace dependencies with `pnpm install --frozen-lockfile`.
- Start the managed workflow `artifacts/rozzvh: web` in Replit; it runs `pnpm --filter @workspace/rozzvh run dev` with the assigned `PORT` and `BASE_PATH`.
- Open the Rozvrh preview at `/rozzvh/`.
- `pnpm --filter @workspace/rozzvh run typecheck` — check the timetable app.
- `pnpm --filter @workspace/rozzvh run build` — build the static app.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required app configuration: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon or publishable key only, never a service-role key). Add these through Replit Secrets and restart the web workflow. Vite embeds them in the client build.
- In the existing Supabase project, apply `artifacts/rozzvh/supabase/schema.sql` if its schema is not already installed, and allow the Replit preview URL ending in `/rozzvh/` in Supabase Authentication's Site URL / Redirect URLs.
- Without Supabase configuration, the app shows a setup notice; sign-in and schedules cannot work.
- Rozvrh calls Supabase directly. The imported API server and Canvas preview are not needed to run the timetable app.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Rozvrh auth and data: Supabase (existing external project; do not migrate its data).
- Imported shared API scaffold: Express + PostgreSQL/Drizzle, separate from Rozvrh's Supabase data.
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
