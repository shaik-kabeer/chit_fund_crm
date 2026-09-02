# ChitFund CMS

A chit fund management system built with Next.js, Prisma, and Supabase.

## Architecture

- **Frontend + API**: `apps/web` — Next.js App Router with embedded API routes
- **Database**: `packages/database` — Prisma schema and migrations (Supabase PostgreSQL)
- **Shared**: `packages/shared` — Zod schemas, TypeScript types, utility functions, constants

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase PostgreSQL via Prisma ORM
- **Auth**: JWT (access + refresh tokens via httpOnly cookies)
- **UI**: Tailwind CSS, Radix UI, Recharts
- **Forms**: react-hook-form with Zod resolvers
- **State**: Zustand + TanStack Query
- **Testing**: Vitest
- **Deployment**: Vercel (single project)

## Getting Started

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
# Fill in DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

npm run db:generate --workspace=@chitfund/database
npm run dev --workspace=@chitfund/web
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev --workspace=@chitfund/web` | Start dev server |
| `npm run build --workspace=@chitfund/web` | Production build |
| `npm run test --workspace=@chitfund/web` | Run tests |
| `npm run lint --workspace=@chitfund/web` | ESLint check |
| `npm run db:generate --workspace=@chitfund/database` | Generate Prisma client |
| `npm run db:migrate --workspace=@chitfund/database` | Run migrations |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Supabase Postgres connection string |
| `JWT_ACCESS_SECRET` | Yes | Secret for access token signing |
| `JWT_REFRESH_SECRET` | Yes | Secret for refresh token signing |
| `CRON_SECRET` | Yes | Bearer token for Vercel Cron endpoints |
| `NEXT_PUBLIC_API_URL` | No | Defaults to `/api` |

## Features

- Multi-role auth (Super Admin, Branch Admin, Collector, Customer)
- Chit group lifecycle (Draft → Open → Active → Completed)
- Payment submission, verification, and tracking
- KYC management and approval workflows
- Audit logging for all critical actions
- Overdue detection via daily cron
- Analytics dashboard with charts
- CSV export for reports
- Rate-limited auth endpoints

## Deploy

See **[DEPLOY.md](./DEPLOY.md)** for GitHub → Vercel + Supabase setup.

## Demo logins

After seeding, credentials are taken from env vars (never commit real passwords):

- `SEED_ADMIN_PASSWORD` — staff accounts
- `SEED_CUSTOMER_PASSWORD` — member accounts

Set those in your private `apps/web/.env.local` or shell before running `npm run db:seed`.
