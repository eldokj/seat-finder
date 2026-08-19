# Exam Seat Finder

A daily examination seating system for a college Controller of Examinations
(COE) office, built around a rule-based seating engine. Students scan a QR
code, enter their register number, and see their allotted room and seat for
the currently published examination event — no account, no login, no
choosing which exam. Admins upload one Consolidated Exam + Student Data
Excel file (what's being examined, for which programme/course, and who's
sitting it — Strength is always calculated automatically, never typed in),
configure examination rooms down to the individual seat, and let a
configurable rule engine (or manual placement) generate the seating.

> **Status:** Phases 1–9 complete — project scaffold, database schema,
> admin authentication + dashboard, the full rule-based seating data model,
> Rooms + Daily Examination Events, Master Timetable + Student Roster Excel
> import, the Room Layout editor, the Seating Allocation screen + rule
> engine (automatic and manual), the student public portal, and QR
> code/reports/printing/export. The **Import/Export architecture**
> (consolidated Exam + Student Data import, Room Master and Room Layout
> import/export, Seating Rules JSON export/import) is also complete,
> inserted between Phase 9 and Phase 10. **Phase 10** (security, testing,
> performance, responsive polish) is next. See
> [Development phases](#development-phases) below.

## Tech stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth (admin accounts only — students never authenticate)
- **Testing:** Vitest (pure validation/parsing logic — see `docs/SCHEMA.md`)
- **Excel:** SheetJS (`xlsx`, installed from the vendor's own CDN — see below)
- **Hosting (recommended):** GitHub + Vercel + Supabase

## Project structure

```
src/
  app/
    page.tsx              Student home page (register number search)
    layout.tsx             Root layout, page metadata from branding config
    api/public/            Public (unauthenticated) API routes
    admin/
      login/               Admin sign-in (public route, outside the auth guard)
      (dashboard)/          Protected admin shell + dashboard (route group)
        daily-events/        Daily Examination Event list/create/detail + status transitions
        rooms/                Room list/create/detail + activate/deactivate
        exam-data/            Consolidated Exam + Student Data Excel upload/preview/import (the only exam-data import workflow)
  components/
    student/                Student-portal UI components
    admin/                  Admin-portal UI components (nav, status badges, confirm button, form fields)
    admin/import/            Shared import preview UI (status table, summary cards)
  lib/
    supabase/               Supabase client factories (browser/server/admin/proxy)
    admin/                  Admin session lookup + audit logging helpers
    validation/              Zod schemas (room, daily-event) + pure import validation/classification logic
    excel/                  Excel parsing, column matching, and the consolidated import pipeline
    config/                 Branding config, shared user-facing message copy
    utils/                  Pure helper functions (register number normalization, dates)
  types/
    database.ts              Hand-maintained types mirroring the DB schema
  proxy.ts                     Refreshes the admin auth session cookie (scoped to /admin/*)
supabase/
  migrations/                SQL migrations, applied in order
docs/
  SCHEMA.md                  Database schema documentation
  DEPLOYMENT.md               Supabase + Vercel setup instructions
```

Phases 1–9 and the Import/Export architecture are complete — see
[Development phases](#development-phases) below for what each phase
covered. Phase 10 (security, testing, performance, responsive polish) is
next.

## Local development

**Prerequisites:** Node.js 20+, a Supabase project (see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — this is the student
portal home page. Admin portal: `/admin/login`.

Run the unit test suite (pure Excel-import validation/parsing logic — no
live database needed):

```bash
npm run test
```

## Environment variables

See [`.env.example`](.env.example) for the full list with explanations.
Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Everything else has a working placeholder
default.

## Database

The schema is defined across [`supabase/migrations/`](supabase/migrations/)
(applied in filename order) and documented in
[`docs/SCHEMA.md`](docs/SCHEMA.md). Apply it to a Supabase project with the
Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

or paste each migration file into the Supabase Dashboard's SQL Editor, in
order.

## A note on `xlsx`

Excel parsing uses SheetJS's `xlsx` package, installed directly from
`cdn.sheetjs.com` rather than the npm registry — the last version SheetJS
published to npm (0.18.5) has two unpatched CVEs (prototype pollution,
ReDoS). Don't run a plain `npm install xlsx`; it'll silently reintroduce
them. See the dependency's URL in `package.json` for the exact pinned
version.

## Development phases

This project is being built in reviewable phases rather than all at once.
The list below was revised after Phase 3 (seating model redesign), again
after Phase 4 (Timetable/Roster import moved ahead of the Room Layout
editor), and again after Phase 9 (an Import/Export architecture pass was
inserted ahead of Phase 10):

1. Project setup, DB schema, basic UI, env config — complete
2. Admin authentication + dashboard — complete
3. ~~Exam management + hall management~~ (superseded by the Phase 4 redesign)
4. Seating architecture: full schema + Rooms/Daily Events rebuild — complete
5. Exam data Excel import — complete (originally a two-step Master
   Timetable + Student Roster upload; later replaced entirely by the
   Consolidated Exam + Student Import — see Phase 9's note below)
6. Room Layout editor (visual grid, configurable seat numbering) — complete
7. Seating Allocation screen + rule engine (automatic + manual adjustment) — complete
8. Student public portal — live register-number search — complete
9. QR code, reports, printing/export — complete
   - **Import/Export architecture** — complete: Consolidated Exam + Student
     Data import (auto-computed Strength — never typed in) is now the
     **only** exam-data import workflow; the original two-step Master
     Timetable / Student Roster importers were fully removed as a later
     product decision (they briefly coexisted as "legacy" first). Also:
     Room Master + Room Layout import/export, Seating Rules JSON
     export/import
10. Security, testing, performance, responsive polish ← next
11. Deployment preparation

## College branding

Nothing in the UI hardcodes a college name/logo. All branding is centralized
in [`src/lib/config/branding.ts`](src/lib/config/branding.ts), currently
sourced from environment variables (see `.env.example`). A later phase adds
an admin Settings page backed by the `settings` table so staff can edit this
without a redeploy.
