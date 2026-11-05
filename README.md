# Ludolytics Practice Stats

Live practice stat collection, the Ludolytics report, and a season dashboard for
**VES Boys Basketball**. See [`SPEC.md`](./SPEC.md) for the full design.

> Measure the work. Relentless growth. · #BeLikeMitch

## Tech

React + Vite + TypeScript + Tailwind on the front end, Supabase (Postgres +
realtime + auth) on the back end. Deployed as a static site.

## Getting started

```bash
npm install
cp .env.example .env     # then fill in your Supabase URL + anon key
npm run dev              # http://localhost:5173
```

### Supabase setup (one time)

1. Create a free project at https://supabase.com.
2. In the SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy **Project Settings → API** → URL and anon key into `.env`.

### Validate the practice-plan parser

```bash
npm run test:parser -- /path/to/PracticePlan.docx
```

## Project layout

```
src/
  lib/
    config.ts             stat taxonomy, Casper values, drill rules (defaults)
    stats.ts              pure stat computations (formulas from the report)
    parsePracticePlan.ts  reads a practice-plan .docx into squads + roster
    supabase.ts           Supabase client
  screens/                app screens (setup, live entry, report, dashboard)
supabase/schema.sql       database schema + RLS + realtime
```

## Status

Phase 1 (core collection) in progress. See `SPEC.md`.
