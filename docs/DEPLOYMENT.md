# Deployment Guide

This is the Phase 1 version of this guide — accurate for getting a local
dev environment running against a real Supabase project today. It will be
expanded in Phase 9 with production-specific verification steps (custom
domain, QR code generation against the live URL, etc).

## 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) and click **New Project**.
2. Choose an organization, name (e.g. `exam-seat-finder`), a strong database
   password (save it somewhere safe — you generally won't need it directly
   since the app uses the API keys below, not a raw connection string), and
   a region close to your users.
3. Wait for provisioning to finish (a couple of minutes).

## 2. Apply the database schema

From **Project Settings → API**, note your **Project URL**, **anon public**
key, and **service_role** key — you'll need them in step 4.

Then apply every migration in `supabase/migrations/` **in filename order**
(`0001`, `0002`, `0003`, … — never skip ahead or apply out of order, later
files depend on earlier ones existing). Either:

**Option A — Supabase CLI (recommended):**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # ref is in the project URL
supabase db push
```

**Option B — SQL Editor:** open the Supabase Dashboard → SQL Editor → paste
the full contents of each file in `supabase/migrations/`, in order, → Run.

Verify it worked: **Table Editor** should show `settings`, `admin_profiles`,
`examination_periods`, `daily_examination_events`,
`master_timetable_records`, `students`, `rooms`, `room_seats`,
`room_allocations`, `seat_allocations`, `seating_rules`, `import_batches`,
`import_errors`, and `audit_logs` (14 tables as of migration `0007`) — no
`halls` or `exams` table (renamed/retired in `0003`/`0005`). `0007` doesn't
add a table, just two columns (`import_batches.warning_rows`,
`import_errors.severity`).

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

`SUPABASE_SERVICE_ROLE_KEY` is a secret — it must only ever exist in
`.env.local` (gitignored) or in Vercel's encrypted environment variable
store, never in code, never in a NEXT_PUBLIC_ variable, never in a commit.

The `NEXT_PUBLIC_COLLEGE_*` / `NEXT_PUBLIC_COE_*` / `NEXT_PUBLIC_WEBSITE_*`
variables are optional — placeholders are used if you leave them blank, and
you can change them any time before going live.

## 4. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## 5. Admin accounts

There is no admin sign-up page by design — accounts are provisioned
directly in Supabase by whoever administers the project (you), not
self-service. Two steps:

**a) Create the Supabase Auth user:**

Supabase Dashboard → **Authentication → Users → Add user**. Set an email
and password (or use "Send invite email" instead of setting a password
directly, if you'd rather the admin set their own). Copy the new user's
**UID** once created.

**b) Link them as an active admin:**

Supabase Dashboard → **SQL Editor**, run (replacing the UID and name):

```sql
insert into public.admin_profiles (id, full_name, role)
values ('<paste-the-user-uid-here>', 'Jane Doe, COE Office', 'admin');
```

Use `'superadmin'` instead of `'admin'` if you want to reserve that
distinction for later (both roles currently have identical access — the
column exists for future use, e.g. restricting settings/admin-management to
superadmins).

That admin can now sign in at `/admin/login`. To revoke access without
deleting history, set `is_active = false` on their `admin_profiles` row
rather than deleting it (deleting the row still leaves their Supabase Auth
user able to authenticate, just with no admin_profiles match — the app
treats that the same as not-an-admin, but an explicit `is_active = false`
is clearer to audit later).

## 6. GitHub

```bash
cd "EXAM SEAT FINDER"
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

(Only run this when you're ready — nothing is pushed automatically.)

## 7. Deploy to Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the
   GitHub repo.
2. Framework preset: Next.js (auto-detected).
3. Add the same environment variables from step 3 under **Project Settings
   → Environment Variables** (Production, and Preview if you want preview
   deployments to work against the same or a separate Supabase project).
4. Deploy.

## 8. Verify production

After deploying, actually open the production URL and confirm:

- The student home page loads and renders correctly on mobile.
- No console errors related to missing environment variables.

Do not consider deployment "done" until this has been checked against the
real deployed URL — a successful build is not the same as a working site.

## 9. QR code

Covered in Phase 7 once the admin portal exists to generate/print it. In the
meantime, any QR generator pointed at your production URL (the student home
page) will work, since that page needs no query parameters.

## 10. Phase 10 pre-launch checklist

Everything below was added or verified in Phase 10 (Security, Performance,
Responsive/Mobile, Reliability, Testing, Accessibility, Production
Hardening). Items marked **[manual]** are Supabase Dashboard / account
settings this project's code cannot inspect or change — verify them
yourself before going live.

**Security**
- [x] Baseline security headers (`X-Frame-Options`, `X-Content-Type-Options`,
      `Referrer-Policy`) — set in `next.config.ts`, apply automatically to
      every route. A Content-Security-Policy was deliberately **not** added
      in Phase 10 — it's high-value but easy to get wrong without careful
      per-directive tuning; treat as separate future work.
- [x] Public seat-lookup rate limiting — a **best-effort, per-process
      in-memory** limiter (`src/lib/rate-limit.ts`), 20 requests/minute per
      IP. This is a deliberate tradeoff for this project's current
      single-college scale: it is **not** distributed — on a
      multi-instance serverless deployment, a burst that lands across
      several warm instances effectively gets a higher combined limit, and
      counters reset on every cold start. It raises the bar against casual
      scripted abuse; it is not a hard guarantee. If real traffic ever
      outgrows this, swap it for a distributed limiter (e.g. Upstash
      Redis) — only `src/lib/rate-limit.ts` and its one call site need to
      change.
- [x] Register-number input capped at 32 characters before it reaches the
      database.
- [x] RLS architecture, `is_active_admin()`, the Phase 8 `SECURITY
      DEFINER` functions, and the service-role-key boundary are
      **unchanged** — reviewed, not modified, in Phase 10.
- **[manual]** Confirm the Supabase project's database password has been
  rotated from any value used during development, and that the
  `SUPABASE_SERVICE_ROLE_KEY` in Vercel's environment variables matches the
  current project (never the anon key, never committed anywhere).

**Error monitoring**
- [x] Root (`error.tsx`, `global-error.tsx`), admin-section
      (`(dashboard)/error.tsx`), and not-found (`not-found.tsx`) boundaries
      added — errors are caught and shown as a friendly message, never a
      raw stack trace, and logged via `console.error` (visible in Vercel's
      function logs).
- [ ] **Deferred by design**: no external error-reporting/monitoring
      service (Sentry or similar) is integrated. If you want alerting on
      production errors rather than having to check Vercel logs manually,
      that's a deliberate future addition, not an oversight.

**Backups / recovery** — **[manual]**, Supabase Dashboard only:
- [ ] Confirm Point-in-Time Recovery (PITR) or daily backups are enabled
      on the production Supabase project (Project Settings → Database →
      Backups). This is a paid-tier feature on some Supabase plans —
      confirm your plan includes it.
- [ ] Know where the "restore" flow lives in the dashboard *before* you
      need it.

**Performance**
- [x] Rooms, Daily Exam Sessions, and Reports lists are now paginated (20
      per page) instead of loading every row unconditionally.
- [x] The automatic seating allocation algorithm was benchmarked at 100,
      250, and 500 participants with realistic room layouts and rules
      before Phase 10 shipped — see the Phase 10 implementation report for
      the actual numbers.

**Accessibility** — manual + automated pass completed; see the Phase 10
implementation report for specific findings and fixes.

**Node version** — `package.json` now declares `"engines": {"node":
">=20.9.0"}`, matching this project's actual runtime requirements.
