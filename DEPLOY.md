# Deploying ChitFund CMS

## Architecture

| Piece | Host | Why |
|-------|------|-----|
| Next.js UI + `/api/*` routes (`apps/web`) | **Vercel** | Single project: App Router handlers + Prisma |
| Database | **Supabase Postgres** | Managed PostgreSQL with Prisma migrations |

```text
Browser → Vercel (apps/web) → /api/* → Prisma → Supabase
```

---

## 1. Push to GitHub

Repo: https://github.com/shaik-kabeer/chit_fund_crm

Secrets stay out of git (`.env` / `.env.local` are gitignored). Configure values in Vercel's Environment Variables UI.

---

## 2. Vercel (full app)

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Set **Root Directory** to `apps/web` (important for this monorepo).
3. Framework preset: **Next.js** (reads `apps/web/vercel.json` for install/build — runs `prisma generate`, builds shared, then web).
4. Add Environment Variables:

| Name | Required | Value |
|------|----------|-------|
| `DATABASE_URL` | Yes | Supabase Session pooler URI (URL-encode `@` in password as `%40`) |
| `JWT_ACCESS_SECRET` | Yes | long random string |
| `JWT_REFRESH_SECRET` | Yes | different long random string |
| `CRON_SECRET` | Yes | Bearer token for Vercel Cron endpoints |
| `NEXT_PUBLIC_API_URL` | Optional | `/api` (or leave unset — client defaults to `/api`) |
| `DEFAULT_ORG_ID` | Optional | org id for member self-register |
| `FRONTEND_URL` | Optional | not needed for same-origin cookies |

5. Deploy. Open the Vercel URL and use staff/customer login as usual.

Payment screenshots are stored as **data URLs** in the payment record (no separate Blob/storage setup).

---

## 3. Local development

Create `apps/web/.env.local` (never commit):

```bash
NEXT_PUBLIC_API_URL=/api
DATABASE_URL=...same Supabase pooler URI...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
CRON_SECRET=...
```

Also keep `packages/database/.env` with the same `DATABASE_URL` for Prisma CLI (`db:generate`, `db:seed`).

```bash
npm install
npm run db:generate
npm run dev --workspace=@chitfund/web
```

Open http://localhost:3000 — API calls go to same-origin `/api`.
