# Experiences.fun

A social operating system for discovering, joining, hosting, and earning recognition for real-world community experiences.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm test` — run workspace regression tests
- `pnpm run build` — run tests, typecheck, and build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Mobile app: `artifacts/mobile`
- API server: `artifacts/api-server`
- Mobile semantic theme: `artifacts/mobile/constants/colors.ts`
- Brand source of truth: `attached_assets/Pasted--EXPERIENCES-FUN-BRAND-GUIDELINES-You-are-building-the-_1790122260061.txt`

## Architecture decisions

- Browser access intentionally supports a local guest onboarding path; authenticated Telegram users retain server-backed profile and participation behavior.
- Navigation uses immediate local screen state and mirrors the active screen to Expo Router query parameters for reliable web-preview tabs and deep links.

## Product

- Discover local experiences, join and verify participation, track XP and contribution history, connect with friends, and manage hosted experiences.

## User preferences

- Follow the Experiences.fun brand guidelines for all UI changes. Use the defined pink, purple, aqua, blue, and neutral palette; action-focused copy; moderate radii; and social, energetic, human presentation.

## Gotchas

- Expo runs in CI mode, so restart `artifacts/mobile: expo` after code changes before relying on screenshots.
- The React Native DevTools libglib warning does not prevent Metro or the web preview from running.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
