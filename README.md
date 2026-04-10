# Craft

Craft is a red, Pinterest-inspired video generator for shalwar kameez product content. Upload one source image, describe the motion you want, and the app stores both the reference image and the generated short-form video in a local library.

## Stack

- Next.js App Router + TypeScript
- SQLite via `better-sqlite3`
- Local disk storage under `data/`
- OpenAI video generation with `sora-2`
- Vitest + Playwright test coverage

## Environment

Add one of these keys to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_key
# or
OpenAIAPIKey=your_openai_key
```

`OPENAI_API_KEY` is preferred. `OpenAIAPIKey` is supported to match the existing Seline project convention.

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

- Generated assets and metadata are stored locally in `data/` and ignored by Git.
- The UI accepts `1-5` second requests, but the current OpenAI short-clip path may render at `4` seconds when a shorter duration is not supported. The requested and submitted durations are both stored in the library.
- The app copies completed video files into local storage immediately because OpenAI download URLs expire.

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
