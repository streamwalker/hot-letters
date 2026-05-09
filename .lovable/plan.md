## Goal
Make `scripts/check-authenticated-client-safety.mjs` more accurate so it doesn't miss server-only code that leaks via re-exports or non-`@/` path aliases.

## Changes

### 1. Re-export detection
Today the regex catches `import ... from "x"` and `import "x"`. Extend `extractStaticImports` to also follow:
- `export * from "x"`
- `export * as ns from "x"`
- `export { a, b } from "x"`
- `export { default as x } from "x"`

These are static and ship to the client, so they must be walked just like `import ... from`. Update the regex to a single pattern that matches `import|export` with an optional clause and a required `from "..."`, plus the existing side-effect `import "..."` form.

Also extend `checkNamedImports` to catch named **re-exports** of forbidden symbols, e.g. `export { createServerOnlyFn } from "..."` and `export { supabaseAdmin } from "@/integrations/supabase/client.server"`.

### 2. TypeScript path alias resolution
Replace the hard-coded `@/` branch with a generic resolver driven by `tsconfig.json` `compilerOptions.paths`:
- Read and parse `tsconfig.json` once at startup (strip `//` and `/* */` comments — tsconfig allows them).
- Build an alias table from `paths`, normalized against `baseUrl` (default: tsconfig dir).
- For each specifier, try the longest matching alias prefix (TS semantics): a pattern `"@/*": ["./src/*"]` maps `@/foo/bar` → `<root>/src/foo/bar`. Patterns without `*` map exact specifiers. If multiple targets are listed, try each in order.
- Fall back to relative resolution (`./`, `../`) as today.
- Bare specifiers (npm packages) are still not walked, only checked by name pattern.

This means if someone later adds e.g. `"~/*": ["./src/*"]` or `"@server/*": ["./src/server/*"]`, the guard keeps working without code changes.

### 3. Resolution polish
- When following a directory import, also try `index` lookups in the order TS uses (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`).
- Skip non-source extensions (`.css`, `.json`, `.svg`, `.html`, `.raw`, `?raw` query suffixes) so we don't try to scan asset files. Strip Vite query suffixes (`?raw`, `?url`, `?worker`) before resolving.
- De-duplicate via the existing `seen` set keyed by absolute resolved path.

### 4. Self-test
Add a tiny inline self-test gated by `--self-test` flag: synthesize two in-memory cases (one with a re-export of `client.server`, one with an aliased import via a non-`@/` alias) and assert the checker reports them. This avoids adding a separate test runner while giving CI a way to catch regressions in the guard itself.

Wire it into the existing CI step as a second invocation: `node scripts/check-authenticated-client-safety.mjs --self-test` before the real scan.

## Out of scope
- Following imports into `node_modules` (still treated as opaque; only name-pattern checks apply).
- Parsing TypeScript with a real AST — the regex approach is good enough for ESM static syntax and keeps the script dependency-free.
- Changing the entry file or expanding the guard to other routes (can be a follow-up).

## Files touched
- `scripts/check-authenticated-client-safety.mjs` — extended resolver + re-export handling + self-test.
- `.github/workflows/ci.yml` — add `--self-test` invocation alongside the existing check step.
