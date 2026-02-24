# Supersplat - Project Guide

## What This Is

- A **Bun + React + Tailwind CSS + shadcn/ui** web application
- Started from the `bun-react-tailwind-shadcn-template`
- Uses `Bun.serve()` as both the dev server and production server (no Express, no Vite)
- shadcn/ui components use the **new-york** style with **zinc** base color

## Tech Stack

- **Runtime/bundler:** Bun (not Node.js, not Vite, not webpack)
- **Frontend:** React 19, TypeScript, JSX
- **Styling:** Tailwind CSS v4 with CSS variables for theming, `tailwindcss-animate` plugin
- **UI components:** shadcn/ui (Radix UI primitives + CVA + `cn()` utility)
- **Icons:** lucide-react
- **Package manager:** Bun (`bun install`, not npm/yarn/pnpm)

## Commands

- `bun install` -- install dependencies
- `bun dev` -- start dev server with HMR (`bun --hot src/index.tsx`)
- `bun start` -- start production server (`NODE_ENV=production bun src/index.tsx`)
- `bun run build` -- production build to `dist/` via `build.ts`

## Project Structure

```
src/
  index.tsx          # Server entry point (Bun.serve with routes)
  index.html         # HTML shell, loads frontend.tsx
  frontend.tsx       # React entry point (createRoot, HMR setup)
  App.tsx            # Root React component
  APITester.tsx      # API testing widget component
  index.css          # App-level styles (imports globals.css)
  components/
    ui/              # shadcn/ui components (button, card, form, input, label, select)
  lib/
    utils.ts         # cn() utility (clsx + tailwind-merge)
styles/
  globals.css        # Tailwind base, CSS custom properties, dark mode tokens
build.ts             # Production build script (Bun.build API)
bunfig.toml          # Bun config (tailwind plugin, env prefix)
components.json      # shadcn/ui configuration
```

## Key Conventions

- **Path aliases:** `@/*` maps to `./src/*` (configured in tsconfig.json)
- **Component exports:** Named exports preferred (e.g., `export function App()`) -- some also have default exports
- **UI components:** Follow shadcn/ui pattern -- function components, `cn()` for class merging, `data-slot` attributes, CVA for variants
- **Styling:** Utility-first Tailwind classes inline; design tokens via CSS custom properties in `styles/globals.css`
- **TypeScript:** Strict mode enabled (`strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- **No linter/formatter config** -- no ESLint, Prettier, or Biome configured
- **No tests** -- no test files or test config present
- **No CI/CD** -- no `.github/` workflows

## Bun-Specific Notes

- Use `bun` instead of `node`, `bun install` instead of `npm install`
- Bun auto-loads `.env` files -- do not use `dotenv`
- HTML imports work natively: `import index from "./index.html"` in server code
- SVG/CSS module imports have type declarations in `bun-env.d.ts`
- `bun-plugin-tailwind` is configured in `bunfig.toml` for the static file server
- Environment variables exposed to the frontend must be prefixed with `BUN_PUBLIC_`

## API Routes

Defined in `src/index.tsx` via `Bun.serve({ routes: {...} })`:
- `GET /api/hello` -- returns `{ message, method }`
- `PUT /api/hello` -- returns `{ message, method }`
- `GET /api/hello/:name` -- returns `{ message }` with the name param
- `/*` -- serves `index.html` (SPA fallback)

---

## Collaboration Guidelines

### Anti-Patterns (Claude)

- **No scope creep.** Make the smallest diff that solves the problem. No bonus refactors, no style changes, no extra features. If a task is ambiguous, ask -- don't over-build.
- **Don't code autonomously.** Default to proposing changes and waiting for approval. If the user says "I'll implement, you advise" -- respect it completely.
- **Break debug loops.** When a fix attempt fails, stop and explain your mental model of the system state before trying again. Never guess-and-check more than twice without articulating what you think is happening.

### Prompting Tips (Joshu)

These are patterns from your sessions that work well -- use them when things feel off:

- **Stuck in a debug spiral?** Ask: *"Before your next fix, explain what you think the current system state is."*
- **Claude over-engineering?** Open with: *"Only change X. Keep the diff under 20 lines."*
- **Claude coding when you want to drive?** Say: *"I'll implement, you advise"* or *"Ask before writing any code."*
- **Multi-file feature stalling?** Say: *"Decompose this into 3-4 independent workstreams with clear file boundaries. Use the Task tool to execute each as a parallel sub-agent."*
- **Plan ballooning?** After Claude drafts a plan, ask: *"How many hours does this realistically take? Cut it to fit [N] hours."*
