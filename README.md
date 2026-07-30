# ChitFund CMS

Full-stack Chit Fund Management System — Next.js, NestJS, PostgreSQL (Supabase), Turborepo.

## Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind
- **Backend**: NestJS + Prisma
- **Database**: Supabase Postgres
- **Monorepo**: Turborepo

## Quick start (local)

1. `npm install`
2. Copy `.env.example` values into local (gitignored) files:
   - `apps/api/.env`
   - `packages/database/.env`
   - `apps/web/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:4000/api`)
3. `npm run db:generate`
4. `npm run dev`

- Web: http://localhost:3000  
- API: http://localhost:4000/api  
- Swagger: http://localhost:4000/api/docs  

## Environment variables

**Do not commit `.env` files.** In production, set variables in Vercel / Railway / etc.  
See `.env.example` and [DEPLOY.md](./DEPLOY.md).

In production the API ignores `.env` files and reads only `process.env`.

## Deploy

See **[DEPLOY.md](./DEPLOY.md)** for GitHub → Vercel (frontend) + API host + Supabase.

## Demo logins (after seed / migrated data)

| Role | Phone | Password |
|------|-------|----------|
| Admin | `9876500001` | `Admin@123` |
| Member | `9876543001` | `Customer@123` |
