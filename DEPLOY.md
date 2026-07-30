# Deploying ChitFund CMS

## Architecture

| Piece | Host | Why |
|-------|------|-----|
| Next.js frontend (`apps/web`) | **Vercel** | First-class Next.js hosting |
| NestJS API (`apps/api`) | **Railway / Render / Fly** | Long-running Node server, uploads, cron |
| Database | **Supabase Postgres** | Already migrated |

Vercel does **not** run a traditional NestJS server well. Deploy the frontend on Vercel and the API on a Node host that uses the same GitHub repo.

---

## 1. Push to GitHub

Repo: https://github.com/shaik-kabeer/chit_fund_crm

Secrets stay out of git (`.env` / `.env.local` are gitignored). Configure values in each host’s Environment Variables UI.

---

## 2. Vercel (frontend)

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Set **Root Directory** to `apps/web` (important for this monorepo).
3. Framework preset: **Next.js** (reads `apps/web/vercel.json` for install/build).
4. Add Environment Variable:
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://YOUR-API-HOST/api` |

5. Deploy. Copy the Vercel URL (e.g. `https://chit-fund-crm.vercel.app`).

---

## 3. API host (Railway example)

1. New Railway project → Deploy from GitHub → same repo.
2. Set **Root Directory** / start command for Nest:
   - Build: `npm install && npm run build --workspace=@chitfund/shared && npm run build --workspace=@chitfund/api`
   - Start: `npm run start --workspace=@chitfund/api` (or `node apps/api/dist/main.js`)
3. Environment variables (from `.env.example`):

| Name | Notes |
|------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase pooler URI (URL-encode `@` in password as `%40`) |
| `JWT_ACCESS_SECRET` | long random string |
| `JWT_REFRESH_SECRET` | different long random string |
| `FRONTEND_URL` | your Vercel URL, e.g. `https://chit-fund-crm.vercel.app` |
| `API_PREFIX` | `api` |
| `PORT` | Railway sets this automatically — Nest already reads `PORT` |

4. After API is live, set Vercel’s `NEXT_PUBLIC_API_URL` to `https://YOUR-API.up.railway.app/api` and redeploy the frontend.

---

## 4. Local development

Create local files (never commit them):

- `apps/api/.env` — copy from root `.env.example`
- `packages/database/.env` — same `DATABASE_URL`
- `apps/web/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:4000/api`

```bash
npm install
npm run db:generate
npm run dev
```
