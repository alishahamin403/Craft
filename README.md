# Craft

Craft is a red, Pinterest-inspired video generator for shalwar kameez product content. Upload one source image, describe the motion you want, and the app stores both the reference image and the generated short-form video in a local library.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres for users and generation metadata
- Supabase Storage for private uploaded/generated media
- fal.ai video generation across Kling, PixVerse, MiniMax, LTX, Wan, Sora, and Veo endpoints
- Google OAuth sign-in with signed HTTP-only sessions
- Vitest + Playwright test coverage

## Environment

Add these keys to `.env.local`:

```bash
FAL_KEY=your_fal_key
OPENAI_API_KEY=your_openai_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
AUTH_SECRET=generate_a_long_random_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_STORAGE_BUCKET=craft-media
```

`OPENAI_API_KEY` powers image cleanup/outpainting. `FAL_KEY` powers video generation. `AUTH_SECRET` signs the local Craft session cookie. `SUPABASE_SERVICE_ROLE_KEY` must stay server-only.

In Google Cloud Console, create an OAuth 2.0 Web application client and add this redirect URI for local development:

```bash
http://localhost:3000/api/auth/google/callback
```

For production, add the same callback path on your deployed domain.

Before using Supabase, run the SQL files in `supabase/migrations/` from the Supabase SQL Editor in filename order. They create the private app tables, the `craft-media` private storage bucket, and keep database constraints aligned with supported video models.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Tests

```bash
npm run test:unit
npm run test:e2e
```

## Notes

- Generated assets and metadata are stored in Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured. The local SQLite/disk backend is still available for tests with `CRAFT_STORAGE_BACKEND=local`.
- The app offers Low, Medium, and High quality tiers with upfront fal.ai cost estimates. Craft then auto-selects a compatible model from the tier based on prompt, duration, format, and cost.
- New generations are scoped to the signed-in Google user.

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
