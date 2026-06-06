# Cheque Entry Manager

A mobile-first Progressive Web App (PWA) for managing cheque entries and generating bank deposit slip reports. Built for Indian businesses and accountants.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/cheque-manager run dev` — run the frontend PWA
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- PWA: vite-plugin-pwa (installable on Android)

## Where things live

- DB schema: `lib/db/src/schema/` — chequeEntries.ts, banks.ts, parties.ts, settings.ts
- API spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/`
- API routes: `artifacts/api-server/src/routes/` — cheques.ts, banks.ts, parties.ts, settingsRoute.ts
- Frontend pages: `artifacts/cheque-manager/src/pages/` — Home.tsx, Reports.tsx, Settings.tsx

## Architecture decisions

- OpenAPI-first contract: all API shapes defined in openapi.yaml before implementation
- Supabase integration planned for later — currently uses Replit PostgreSQL with a `parties` table that mirrors Supabase data
- Duplicate cheque detection: 409 response when same cheque date + amount + party + cheque no already exists
- billNos stored as text array in PostgreSQL, displayed as "7909+7908+7910" format
- A4 portrait print enforced via CSS `@page { size: A4 portrait; }` — landscape disabled

## Product

- **Cheque Entry Form**: Fast entry with auto cheque date (DD only), multiple bill numbers, party name auto-lookup, bank autocomplete
- **Reports Page**: Filterable table with A4 print deposit slip (bank header + bold table + totals footer)
- **Settings Page**: Manage report header (bank name, account no, mobile no) and bank master list
- **PWA**: Installable on Android, offline cache via service worker

## User preferences

- Supabase will be connected later — parties table is ready for data import
- App language: Hindi/English mixed (Hinglish) for communication

## Gotchas

- After OpenAPI spec changes, always run codegen before touching frontend
- billNos is a PostgreSQL text array — use `.array()` method on drizzle column definition
- chequeAmount stored as numeric string in DB, parsed to float in API responses
- FormLabel from shadcn must always be inside FormField — use Label for standalone labels

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- SQL to connect Supabase: copy party data into `parties` table (bill_no, party_name, cheque_no)
