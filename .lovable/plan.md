## Goal
When the guard reports a forbidden import, print the full chain of files from `src/routes/_authenticated.tsx` down to the offending module, so the exact path to fix is obvious from the CI log.

## Current behavior
A violation prints only the immediate importer + specifier:
```
- src/lib/foo.ts
    imports "@/integrations/supabase/client.server"  (supabase admin client)
```
With deep graphs you have to grep upward to learn how `foo.ts` got pulled in.

## New behavior
Each violation prints the chain from entry → … → offender:
```
[auth-client-safety] FAIL: 1 server-only import(s) reachable from src/routes/_authenticated.tsx:

  - imports "@/integrations/supabase/client.server"  (supabase admin client)
    chain:
      src/routes/_authenticated.tsx
        → src/hooks/use-auth.ts
        → src/integrations/supabase/server-fn-fetch.client.ts
        → src/lib/booking.functions.ts
        → "@/integrations/supabase/client.server"   ← forbidden
```

Same for forbidden NAMED-symbol imports — the chain ends at the file that contains the `import { supabaseAdmin } from "..."` statement, with the symbol name as the final arrow.

Suppressed (allowlisted) findings get the same chain rendering so reviewers can see exactly what is being silenced.

## Implementation (`scripts/check-authenticated-client-safety.mjs`)

1. **Track parents in `walk`.** Pass an immutable `path` array of absolute file paths down the recursion. Each call appends `file` before iterating children. The walker already uses a `seen` set to short-circuit cycles — that stays.

2. **Attach chain to violations/suppressed.** Replace the current `{ file, spec, reason }` shape with `{ file, spec, reason, chain }` where `chain` is the array of repo-relative file paths from entry to the importer (inclusive). For named-symbol findings the chain ends at the file containing the import; for specifier findings the same — the offending specifier is rendered as the final `→` line.

3. **Cycle handling.** Because `seen` short-circuits before reaching a forbidden import on the second visit, the recorded chain is naturally the first (shortest) discovery path. That's the right one to show. No extra bookkeeping needed.

4. **Multiple chains to the same offender.** A forbidden specifier can be imported from multiple files. Today each importer produces its own violation — keep that. The chain is per-violation, so each route tells the full story.

5. **Renderer.** Add a small `formatChain(chain, finalArrow)` helper used by both the failure and the suppressed-findings sections. Indentation: 6 spaces for `chain:` body, 8 spaces for arrows, matching existing message style.

6. **De-duplication.** If two violations share the same `(chain.join('>'), spec)` key, collapse to one entry to avoid log noise from a file imported under several aliases. Keep the first chain.

## Self-test additions
- Build a 3-hop graph (`entry → mid1 → mid2 → leaf.server`) and assert the violation's `chain` equals `["src/entry.ts", "src/mid1.ts", "src/mid2.ts"]`.
- Named-symbol case: `entry → bridge` where `bridge` does `import { supabaseAdmin } from "x"`. Assert chain ends at `src/bridge.ts`.
- Suppressed case: same 3-hop graph with a matching `specifiers[]` allowlist entry; assert the suppressed record carries the full chain.

## Out of scope
- ALL chains to a single offender (we keep the first/shortest one to keep output readable).
- Source-line numbers (regex-based scanner doesn't track them; not worth adding without a real parser).
- Changing the exit code, allowlist schema, or CI integration.

## Files touched
- `scripts/check-authenticated-client-safety.mjs` — walker signature, violation shape, renderer, expanded self-test.
