# Deploying ChitFund CMS

## Architecture (single Vercel deploy)

| Piece | Host | Why |
|-------|------|-----|
| Next.js UI + `/api/*` routes (`apps/web`) | **Vercel** | One project: App Router handlers + Prisma |
| Database | **Supabase Postgres** | Already migrated |
| NestJS (`apps/api`) | **Parked / optional later** | Left in repo as reference; not required for production |

```text
Browser → Vercel (apps/web) → /api/* → Prisma → Supabase
```

---

## 1. Push to GitHub

Repo: https://github.com/shaik-kabeer/chit_fund_crm

Secrets stay out of git (`.env` / `.env.local` are gitignored). Configure values in Vercel’s Environment Variables UI.

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
| `NEXT_PUBLIC_API_URL` | Optional | `/api` (or leave unset — client defaults to `/api`) |
| `DEFAULT_ORG_ID` | Optional | org id for member self-register |
| `FRONTEND_URL` | Optional | not needed for same-origin cookies |

5. Deploy. Open the Vercel URL and use staff/customer login as usual.

Payment screenshots are stored as **data URLs** in the payment record (no separate Blob/storage setup).

---

## 3. Nest API host (parked / optional later)

`apps/api` remains in the repo if you ever want a separate Nest deployment again. It is **not** required when using the Next.js `/api` routes above.

---

## 4. Local development (web-only)

Create `apps/web/.env.local` (never commit):

```bash
NEXT_PUBLIC_API_URL=/api
DATABASE_URL=...same Supabase pooler URI...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
```

Also keep `packages/database/.env` with the same `DATABASE_URL` for Prisma CLI (`db:generate`, `db:seed`).

```bash
npm install
npm run db:generate
npm run dev --workspace=@chitfund/web
```

Open http://localhost:3000 — API calls go to same-origin `/api`.

To run the parked Nest API locally instead, point `NEXT_PUBLIC_API_URL=http://localhost:4000/api` and start `apps/api`.
