## Goal
Let the auth client-safety guard accept a small, documented allowlist so genuinely safe server-shaped imports (e.g. a re-export wrapper that the splitter is known to handle) don't have to be silenced by restructuring code — without weakening the default-deny posture.

## Config file
New file: `scripts/auth-client-safety.allowlist.json` (JSONC, comments allowed via the existing strip-comments helper).

Shape:
```jsonc
{
  // Each entry must include a human-readable reason. The guard prints
  // the reason on every match so reviewers can audit usage in PRs.
  "specifiers": [
    // { "spec": "@tanstack/react-start/server", "from": "src/routes/__root.tsx", "reason": "..." }
  ],
  "files": [
    // { "path": "src/integrations/supabase/safe-bridge.ts", "reason": "..." }
  ],
  "named": [
    // { "name": "supabaseAdmin", "from": "src/lib/typed-rpc.ts", "reason": "..." }
  ]
}
```

Three allowlist axes, each scoped narrowly to keep the guarantee:

1. **`specifiers[]`** — silences a specific `(importer, specifier)` pair. Both `from` (importer path, repo-relative) and `spec` (exact specifier string) must match. No globs, no prefix matches — exact only. Prevents a blanket "ignore this specifier everywhere" foot-gun.
2. **`files[]`** — stops the walker from descending into a leaf file (still scanned once for forbidden NAMED symbols so a slip-through is loud). Use for files the splitter is known to tree-shake. Exact repo-relative `path`.
3. **`named[]`** — silences a forbidden named symbol only when imported in a specific file. Same exact-match rule as `specifiers`.

Every entry requires `reason` (non-empty string). Loader fails fast with a clear error if `reason` is missing or empty — keeps the file self-documenting.

## Guard changes (`scripts/check-authenticated-client-safety.mjs`)
- Load the allowlist alongside tsconfig at startup. Missing file → empty allowlist (no error).
- Validate shape: arrays only, required keys per entry, unknown keys rejected. Print the offending entry on failure.
- Plumb the allowlist through `runCheck` / `walk` (don't make it a module global — keeps the self-test isolated).
- In the FORBIDDEN_SPECIFIERS loop, skip pushing a violation when `(file, spec)` matches a `specifiers[]` entry. Track which entries were used.
- In `checkNamedImports`, skip when `(file, name)` matches a `named[]` entry. Track usage.
- In `walk`, after the named-symbol scan, skip recursing into a `files[]`-allowlisted leaf. Track usage.
- After the walk, print a one-line summary of suppressed counts so allowlist usage is visible in CI logs (e.g. `[auth-client-safety] suppressed 2 finding(s) via allowlist`).
- Detect and warn (non-fatal) about **stale allowlist entries** — entries that didn't match anything during the walk. Stale entries print at the end with their reason; CI stays green but reviewers see the noise. (Fatal would block unrelated refactors; warn is the right default.)

## Self-test additions
Extend the existing `--self-test` cases to cover:
- Specifier allowlist suppresses a `*.server.*` static import for the right `(file, spec)` and NOT for a different importer.
- File allowlist stops descent (forbidden import inside the allowlisted leaf is not reported) but still flags forbidden NAMED symbols inside that leaf.
- Named allowlist suppresses `supabaseAdmin` import in the listed file only.
- Allowlist loader rejects entries without `reason`.
- Stale entry produces a warning but exit code stays 0.

## Documentation
Add a header comment block to `scripts/auth-client-safety.allowlist.json` explaining:
- Each entry needs a `reason` and a code-owner-style justification in the PR description.
- Prefer fixing the import graph; only allowlist when restructuring is genuinely impractical.
- Allowlist entries are reviewed during dependency upgrades — stale ones should be removed.

Ship the file with all three arrays empty so the current behavior is unchanged.

## Files touched
- `scripts/check-authenticated-client-safety.mjs` — load + apply + report allowlist; expanded self-test.
- `scripts/auth-client-safety.allowlist.json` — new, empty arrays + doc comments.

## Out of scope
- Glob/regex matching in the allowlist (intentional — exact match keeps the guarantee tight).
- Per-route allowlists (the guard still has a single entry point).
- Fatal-on-stale mode (can be a follow-up flag, e.g. `--strict-allowlist`).
