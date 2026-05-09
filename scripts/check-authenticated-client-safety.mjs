#!/usr/bin/env node
/**
 * Static guard for src/routes/_authenticated.tsx.
 *
 * Walks the static (top-level) ESM import graph reachable from the route
 * and fails if any module statically imports server-only code that would
 * leak into the client bundle.
 *
 * Dynamic `import("...")` calls are intentionally ignored — they're how
 * `createIsomorphicFn().server(...)` safely loads server-only modules.
 *
 * Run: `bun run check:auth-client-safe`
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const ENTRY = resolve(ROOT, "src/routes/_authenticated.tsx");

// Patterns that must NEVER appear as a static import in the client graph.
const FORBIDDEN_SPECIFIERS = [
  { test: (s) => s === "@tanstack/react-start/server", reason: "server-only runtime" },
  { test: (s) => /\.server(\.[tj]sx?)?$/.test(s), reason: "*.server.* module" },
  { test: (s) => s.endsWith("/client.server"), reason: "supabase admin client" },
];

const FORBIDDEN_NAMED = [
  { name: "createServerOnlyFn", reason: "server-only helper" },
  { name: "supabaseAdmin", reason: "service-role client" },
];

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function resolveSpecifier(spec, fromFile) {
  // Only resolve project-local imports. Bare specifiers (npm packages) are
  // checked by name pattern but not walked.
  let basePath;
  if (spec.startsWith("@/")) {
    basePath = resolve(ROOT, "src", spec.slice(2));
  } else if (spec.startsWith("./") || spec.startsWith("../")) {
    basePath = resolve(dirname(fromFile), spec);
  } else {
    return null;
  }

  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath;
  for (const ext of EXTS) {
    const p = basePath + ext;
    if (existsSync(p)) return p;
  }
  for (const ext of EXTS) {
    const p = join(basePath, "index" + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

// Match top-level `import ... from "x"` and `export ... from "x"`.
// Ignores dynamic `import("x")` calls.
const STATIC_IMPORT_RE =
  /^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s*['"]([^'"]+)['"]/gm;

function extractStaticImports(source) {
  const out = new Set();
  for (const m of source.matchAll(STATIC_IMPORT_RE)) out.add(m[1]);
  for (const m of source.matchAll(SIDE_EFFECT_IMPORT_RE)) out.add(m[1]);
  return [...out];
}

function checkNamedImports(source, file, violations) {
  // Catches `import { createServerOnlyFn } from ...` even from packages.
  for (const { name, reason } of FORBIDDEN_NAMED) {
    const re = new RegExp(
      `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['\"]`,
      "m",
    );
    if (re.test(source)) {
      violations.push({ file, spec: name, reason });
    }
  }
}

function walk(file, seen, violations) {
  if (seen.has(file)) return;
  seen.add(file);

  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return;
  }

  checkNamedImports(source, file, violations);

  for (const spec of extractStaticImports(source)) {
    for (const { test, reason } of FORBIDDEN_SPECIFIERS) {
      if (test(spec)) violations.push({ file, spec, reason });
    }
    const resolved = resolveSpecifier(spec, file);
    if (resolved && extname(resolved) !== ".css") walk(resolved, seen, violations);
  }
}

if (!existsSync(ENTRY)) {
  console.error(`[auth-client-safety] entry not found: ${ENTRY}`);
  process.exit(1);
}

const violations = [];
walk(ENTRY, new Set(), violations);

if (violations.length > 0) {
  console.error(
    `\n[auth-client-safety] FAIL: ${violations.length} server-only import(s) reachable from src/routes/_authenticated.tsx:\n`,
  );
  for (const v of violations) {
    const rel = v.file.replace(ROOT + "/", "");
    console.error(`  - ${rel}\n      imports "${v.spec}"  (${v.reason})`);
  }
  console.error(
    `\nFix: move the server-only code behind createServerFn / createIsomorphicFn().server(),\n` +
      `or load it via a dynamic import() inside a server-only branch.\n`,
  );
  process.exit(1);
}

console.log(
  "[auth-client-safety] OK — no server-only static imports reachable from _authenticated.tsx",
);
