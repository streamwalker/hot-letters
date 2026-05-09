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
 * Re-exports (`export * from`, `export { x } from`) ARE followed because
 * they are static and ship to the client just like imports.
 *
 * Path aliases are resolved generically from `tsconfig.json`'s
 * `compilerOptions.paths`, not hard-coded to `@/`.
 *
 * Run: `bun run check:auth-client-safe`
 *      `node scripts/check-authenticated-client-safety.mjs --self-test`
 */
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve, extname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

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

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const IGNORED_EXTS = new Set([".css", ".scss", ".sass", ".less", ".json", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".html", ".md", ".txt", ".woff", ".woff2", ".ttf", ".otf"]);

// ---- tsconfig path alias loading ----------------------------------------

function stripJsonComments(src) {
  // Strip /* */ and // comments; tsconfig allows JSONC.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function loadTsconfigPaths(rootDir) {
  const tsconfigPath = join(rootDir, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return { aliases: [], baseDir: rootDir };
  let parsed;
  try {
    parsed = JSON.parse(stripJsonComments(readFileSync(tsconfigPath, "utf8")));
  } catch {
    return { aliases: [], baseDir: rootDir };
  }
  const co = parsed.compilerOptions || {};
  const baseDir = co.baseUrl ? resolve(rootDir, co.baseUrl) : rootDir;
  const paths = co.paths || {};
  const aliases = [];
  for (const [pattern, targetsRaw] of Object.entries(paths)) {
    const targets = Array.isArray(targetsRaw) ? targetsRaw : [];
    const star = pattern.endsWith("/*");
    const prefix = star ? pattern.slice(0, -1) : pattern; // keep trailing slash if star
    aliases.push({
      pattern,
      prefix,
      star,
      targets: targets.map((t) => ({
        raw: t,
        star: t.endsWith("/*"),
        prefix: t.endsWith("/*") ? t.slice(0, -1) : t,
      })),
    });
  }
  // Longest prefix wins (TS semantics).
  aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  return { aliases, baseDir };
}

function applyAlias(spec, aliasCfg) {
  for (const a of aliasCfg.aliases) {
    if (a.star) {
      if (spec === a.prefix.slice(0, -1) || spec.startsWith(a.prefix)) {
        const rest = spec.slice(a.prefix.length);
        const out = [];
        for (const t of a.targets) {
          if (t.star) out.push(resolve(aliasCfg.baseDir, t.prefix + rest));
          else out.push(resolve(aliasCfg.baseDir, t.raw));
        }
        return out;
      }
    } else if (spec === a.pattern) {
      return a.targets.map((t) => resolve(aliasCfg.baseDir, t.raw));
    }
  }
  return null;
}

// ---- resolution ---------------------------------------------------------

function tryResolveFile(basePath) {
  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath;
  for (const ext of SOURCE_EXTS) {
    const p = basePath + ext;
    if (existsSync(p)) return p;
  }
  if (existsSync(basePath) && statSync(basePath).isDirectory()) {
    for (const ext of SOURCE_EXTS) {
      const p = join(basePath, "index" + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function stripQuery(spec) {
  const i = spec.indexOf("?");
  return i === -1 ? spec : spec.slice(0, i);
}

function resolveSpecifier(rawSpec, fromFile, aliasCfg) {
  const spec = stripQuery(rawSpec);
  const candidates = [];

  const aliasMatches = applyAlias(spec, aliasCfg);
  if (aliasMatches) {
    candidates.push(...aliasMatches);
  } else if (spec.startsWith("./") || spec.startsWith("../")) {
    candidates.push(resolve(dirname(fromFile), spec));
  } else if (isAbsolute(spec)) {
    candidates.push(spec);
  } else {
    return null; // bare specifier — not walked
  }

  for (const c of candidates) {
    const r = tryResolveFile(c);
    if (r) return r;
  }
  return null;
}

// ---- import / re-export extraction --------------------------------------

// Matches static `import ... from "x"` AND `export ... from "x"` (incl.
// `export * from`, `export * as ns from`, `export { a } from`).
const STATIC_FROM_RE =
  /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s*['"]([^'"]+)['"]/gm;

function extractStaticImports(source) {
  const out = new Set();
  for (const m of source.matchAll(STATIC_FROM_RE)) out.add(m[1]);
  for (const m of source.matchAll(SIDE_EFFECT_IMPORT_RE)) out.add(m[1]);
  return [...out];
}

function checkNamedImports(source, file, violations) {
  // Catches `import { X } from ...` and `export { X } from ...` for
  // forbidden symbol names — even from packages we don't walk into.
  for (const { name, reason } of FORBIDDEN_NAMED) {
    const re = new RegExp(
      `(?:import|export)\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]`,
      "m",
    );
    if (re.test(source)) {
      violations.push({ file, spec: name, reason });
    }
  }
}

function walk(file, seen, violations, aliasCfg) {
  if (seen.has(file)) return;
  seen.add(file);

  const ext = extname(file);
  if (IGNORED_EXTS.has(ext)) return;

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
    const resolved = resolveSpecifier(spec, file, aliasCfg);
    if (resolved) walk(resolved, seen, violations, aliasCfg);
  }
}

// ---- runner -------------------------------------------------------------

function runCheck(rootDir, entry) {
  const aliasCfg = loadTsconfigPaths(rootDir);
  const violations = [];
  walk(entry, new Set(), violations, aliasCfg);
  return violations;
}

function reportAndExit(violations, entryRel) {
  if (violations.length > 0) {
    console.error(
      `\n[auth-client-safety] FAIL: ${violations.length} server-only import(s) reachable from ${entryRel}:\n`,
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
    `[auth-client-safety] OK — no server-only static imports reachable from ${entryRel}`,
  );
}

// ---- self-test ----------------------------------------------------------

function selfTest() {
  const dir = join(tmpdir(), `auth-guard-selftest-${process.pid}-${Date.now()}`);
  let failed = 0;

  function setup(files, tsconfig) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }

  function expect(name, cond, detail) {
    if (cond) {
      console.log(`  ok   - ${name}`);
    } else {
      failed++;
      console.error(`  FAIL - ${name}: ${detail}`);
    }
  }

  // Case 1: re-export of *.server.* via `export * from`.
  setup(
    {
      "src/entry.ts": `export * from "./middle";\n`,
      "src/middle.ts": `export * from "./leaf.server";\n`,
      "src/leaf.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } },
  );
  let v = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "follows `export * from` re-exports into *.server.*",
    v.some((x) => x.spec.endsWith("./leaf.server")),
    `got: ${JSON.stringify(v)}`,
  );

  // Case 2: non-`@/` alias (`~/`) resolves and the leaf is flagged.
  setup(
    {
      "src/entry.ts": `import "~/bad.server";\n`,
      "src/bad.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: { baseUrl: ".", paths: { "~/*": ["./src/*"] } } },
  );
  v = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "resolves non-`@/` tsconfig path alias",
    v.some((x) => x.spec === "~/bad.server"),
    `got: ${JSON.stringify(v)}`,
  );

  // Case 3: re-export of forbidden named symbol.
  setup(
    {
      "src/entry.ts": `export { supabaseAdmin } from "some-pkg";\n`,
    },
    { compilerOptions: {} },
  );
  v = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "flags re-exported forbidden named symbols",
    v.some((x) => x.spec === "supabaseAdmin"),
    `got: ${JSON.stringify(v)}`,
  );

  // Case 4: clean graph passes.
  setup(
    {
      "src/entry.ts": `import { ok } from "./helper";\nexport { ok };\n`,
      "src/helper.ts": `export const ok = 1;\n`,
    },
    { compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } },
  );
  v = runCheck(dir, join(dir, "src/entry.ts"));
  expect("clean graph yields no violations", v.length === 0, `got: ${JSON.stringify(v)}`);

  rmSync(dir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`\n[auth-client-safety:self-test] ${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("[auth-client-safety:self-test] OK");
}

// ---- entrypoint ---------------------------------------------------------

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const ENTRY = resolve(ROOT, "src/routes/_authenticated.tsx");
  if (!existsSync(ENTRY)) {
    console.error(`[auth-client-safety] entry not found: ${ENTRY}`);
    process.exit(1);
  }
  const violations = runCheck(ROOT, ENTRY);
  reportAndExit(violations, "src/routes/_authenticated.tsx");
}
