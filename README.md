# School Portal

A bilingual (English/Turkish) portal for running a small weekend school: student records, classes and timetables, attendance, curriculum progress, assessments, annual report cards, guidance requests, materials and manual payments. All names and data in this repository are fictional or generic. The institution it was built for is not identified.

## Stack
- **Front end:** React + TypeScript (Vite), shipped as a static site on Netlify.
- **Back end:** Supabase (PostgreSQL with row-level security, email/password auth) plus a few Netlify Functions for user invitations, user management and notifications.
- **Database:** 26 incremental SQL migrations in `supabase/migrations/` with versioned curriculum and configuration data.
- **Operations:** encrypted nightly backup to cloud storage (`scripts/backup-school.mjs`, GitHub Actions), restore tooling, audit log.

## Highlights
- Role-based workspaces: management, teachers, guidance staff and a parent portal.
- Teachers start from "Today": dated lessons, attendance, participation scoring, private recoverable drafts and term assessment tasks.
- Four annual report cards generated from assessments, with a configurable curriculum and approval flow.
- Guidance workflow in five steps (new, review, shared plan, follow-up, closure) with a red/orange/yellow risk scale.
- Bulk student import from a spreadsheet with a preview and validation step.
- Demo mode that runs entirely in the browser with fictional data.

## Run locally
```bash
npm ci
npm run dev          # demo mode, no backend needed
npm run typecheck
npm run build
```
See `docs/SETUP.md` for the Supabase and Netlify setup and `docs/OPERATIONS.md` for backups and restore.

License: MIT
