# FMSG — Find Me Some Jobs

AI-powered job matching platform for South African job seekers. Upload your CV, and FMSG extracts your skills, searches live jobs via Google Jobs (SerpAPI), scores matches against your profile, and generates tailored CVs.

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Database:** Supabase (Postgres, Auth, Storage)
- **AI:** Google Gemini 2.5 Flash / Groq fallback
- **Payments:** Paystack (ZAR)
- **Job Search:** SerpAPI (Google Jobs)
- **Styling:** Tailwind CSS v4

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (admin) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GROQ_API_KEY` | No | Groq fallback API key |
| `SERPAPI_API_KEY` | Yes | SerpAPI key for Google Jobs |
| `JINA_API_KEY` | No | Jina AI reader key |
| `PAYSTACK_SECRET_KEY` | Yes | Paystack secret key |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Yes | Paystack public key |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

Migrations are in `supabase/migrations/`. Run them in order against your Supabase project via the SQL editor or Supabase CLI.

## Deploy

Deployed on Vercel from the `production` branch.

```bash
vercel --prod
```
