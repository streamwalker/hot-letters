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
 * A small allowlist (`scripts/auth-client-safety.allowlist.json`) can suppress
 * specific known-safe findings. See that file's header for rules.
 *
 * Run: `bun run check:auth-client-safe`
 *      `node scripts/check-authenticated-client-safety.mjs --self-test`
 */
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve, extname, join, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

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

// ---- JSONC ---------------------------------------------------------------

function stripJsonComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

// ---- tsconfig path alias loading ----------------------------------------

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
    const prefix = star ? pattern.slice(0, -1) : pattern;
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

// ---- allowlist ----------------------------------------------------------

const ALLOWLIST_FILENAME = "scripts/auth-client-safety.allowlist.json";

function loadAllowlist(rootDir) {
  const path = join(rootDir, ALLOWLIST_FILENAME);
  if (!existsSync(path)) {
    return { specifiers: [], files: [], named: [], hits: new WeakMap() };
  }
  let parsed;
  try {
    parsed = JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
  } catch (e) {
    console.error(`[auth-client-safety] Failed to parse ${ALLOWLIST_FILENAME}: ${e.message}`);
    process.exit(1);
  }

  const errors = [];
  const KNOWN = { specifiers: ["spec", "from", "reason"], files: ["path", "reason"], named: ["name", "from", "reason"] };

  function validate(arr, kind) {
    if (arr === undefined) return [];
    if (!Array.isArray(arr)) {
      errors.push(`\`${kind}\` must be an array`);
      return [];
    }
    const out = [];
    for (const [i, entry] of arr.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${kind}[${i}] must be an object`);
        continue;
      }
      for (const k of KNOWN[kind]) {
        if (typeof entry[k] !== "string" || entry[k].trim() === "") {
          errors.push(`${kind}[${i}] missing/empty required string \`${k}\``);
        }
      }
      for (const k of Object.keys(entry)) {
        if (!KNOWN[kind].includes(k)) {
          errors.push(`${kind}[${i}] has unknown key \`${k}\``);
        }
      }
      out.push({ ...entry, _used: false });
    }
    return out;
  }

  // Ignore $comment / underscore-prefixed metadata keys.
  for (const k of Object.keys(parsed)) {
    if (k.startsWith("$") || k.startsWith("_")) continue;
    if (!["specifiers", "files", "named"].includes(k)) {
      errors.push(`unknown top-level key \`${k}\``);
    }
  }

  const allow = {
    specifiers: validate(parsed.specifiers, "specifiers"),
    files: validate(parsed.files, "files"),
    named: validate(parsed.named, "named"),
  };

  if (errors.length) {
    console.error(`[auth-client-safety] Invalid ${ALLOWLIST_FILENAME}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  return allow;
}

function toRepoRel(file, rootDir) {
  const r = relative(rootDir, file);
  return r.split(sep).join("/");
}

function specifierAllowed(allow, fileRel, spec) {
  for (const e of allow.specifiers) {
    if (e.from === fileRel && e.spec === spec) {
      e._used = true;
      return e;
    }
  }
  return null;
}
function namedAllowed(allow, fileRel, name) {
  for (const e of allow.named) {
    if (e.from === fileRel && e.name === name) {
      e._used = true;
      return e;
    }
  }
  return null;
}
function fileAllowed(allow, fileRel) {
  for (const e of allow.files) {
    if (e.path === fileRel) {
      e._used = true;
      return e;
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
    return null;
  }

  for (const c of candidates) {
    const r = tryResolveFile(c);
    if (r) return r;
  }
  return null;
}

// ---- import / re-export extraction --------------------------------------

const STATIC_FROM_RE =
  /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s*['"]([^'"]+)['"]/gm;

function extractStaticImports(source) {
  const out = new Set();
  for (const m of source.matchAll(STATIC_FROM_RE)) out.add(m[1]);
  for (const m of source.matchAll(SIDE_EFFECT_IMPORT_RE)) out.add(m[1]);
  return [...out];
}

function checkNamedImports(source, file, fileRel, chain, allow, violations, suppressed) {
  for (const { name, reason } of FORBIDDEN_NAMED) {
    const re = new RegExp(
      `(?:import|export)\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]`,
      "m",
    );
    if (re.test(source)) {
      const a = namedAllowed(allow, fileRel, name);
      const record = { kind: "named", file, spec: name, reason, chain };
      if (a) suppressed.push({ ...record, allow: a });
      else violations.push(record);
    }
  }
}

function walk(file, parents, seen, violations, suppressed, aliasCfg, allow, rootDir) {
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

  const fileRel = toRepoRel(file, rootDir);
  const chain = [...parents, fileRel];
  checkNamedImports(source, file, fileRel, chain, allow, violations, suppressed);

  // File-level allowlist: scanned for forbidden named symbols above, but we
  // do not descend into its imports.
  if (fileAllowed(allow, fileRel)) return;

  for (const spec of extractStaticImports(source)) {
    for (const { test, reason } of FORBIDDEN_SPECIFIERS) {
      if (test(spec)) {
        const a = specifierAllowed(allow, fileRel, spec);
        const record = { kind: "specifier", file, spec, reason, chain };
        if (a) suppressed.push({ ...record, allow: a });
        else violations.push(record);
      }
    }
    const resolved = resolveSpecifier(spec, file, aliasCfg);
    if (resolved) walk(resolved, chain, seen, violations, suppressed, aliasCfg, allow, rootDir);
  }
}

// ---- runner -------------------------------------------------------------

function runCheck(rootDir, entry) {
  const aliasCfg = loadTsconfigPaths(rootDir);
  const allow = loadAllowlist(rootDir);
  const violations = [];
  const suppressed = [];
  walk(entry, [], new Set(), violations, suppressed, aliasCfg, allow, rootDir);
  const stale = [
    ...allow.specifiers.filter((e) => !e._used).map((e) => ({ kind: "specifiers", entry: e })),
    ...allow.files.filter((e) => !e._used).map((e) => ({ kind: "files", entry: e })),
    ...allow.named.filter((e) => !e._used).map((e) => ({ kind: "named", entry: e })),
  ];
  return { violations: dedupe(violations), suppressed: dedupe(suppressed), stale };
}

function dedupe(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const key = `${r.chain ? r.chain.join(">") : ""}::${r.spec}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function formatChain(chain, finalArrow) {
  const lines = [];
  if (chain && chain.length > 0) {
    lines.push(`      ${chain[0]}`);
    for (let i = 1; i < chain.length; i++) lines.push(`        → ${chain[i]}`);
  }
  if (finalArrow) lines.push(`        → ${finalArrow}`);
  return lines.join("\n");
}

function reportAndExit(result, entryRel) {
  const { violations, suppressed, stale } = result;

  if (suppressed.length > 0) {
    console.log(
      `[auth-client-safety] suppressed ${suppressed.length} finding(s) via allowlist:`,
    );
    for (const s of suppressed) {
      console.log(`  - "${s.spec}"  (${s.reason})  — ${s.allow.reason}`);
      console.log(`    chain:`);
      console.log(formatChain(s.chain, `"${s.spec}"   ← suppressed`));
    }
  }

  if (stale.length > 0) {
    console.warn(
      `[auth-client-safety] WARN: ${stale.length} stale allowlist entr(ies) — please remove:`,
    );
    for (const s of stale) {
      console.warn(`  - ${s.kind}: ${JSON.stringify(s.entry)}`);
    }
  }

  if (violations.length > 0) {
    console.error(
      `\n[auth-client-safety] FAIL: ${violations.length} server-only import(s) reachable from ${entryRel}:\n`,
    );
    for (const v of violations) {
      console.error(`  - imports "${v.spec}"  (${v.reason})`);
      console.error(`    chain:`);
      console.error(formatChain(v.chain, `"${v.spec}"   ← forbidden`));
      console.error("");
    }
    console.error(
      `Fix: move the server-only code behind createServerFn / createIsomorphicFn().server(),\n` +
        `or load it via a dynamic import() inside a server-only branch.\n` +
        `If genuinely safe, add a documented entry to ${ALLOWLIST_FILENAME}.\n`,
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

  function setup(files, tsconfig, allowlist) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
    if (allowlist !== undefined) {
      const p = join(dir, ALLOWLIST_FILENAME);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, typeof allowlist === "string" ? allowlist : JSON.stringify(allowlist, null, 2));
    }
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
  let r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "follows `export * from` re-exports into *.server.*",
    r.violations.some((x) => x.spec.endsWith("./leaf.server")),
    `got: ${JSON.stringify(r.violations)}`,
  );

  // Case 2: non-`@/` alias.
  setup(
    {
      "src/entry.ts": `import "~/bad.server";\n`,
      "src/bad.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: { baseUrl: ".", paths: { "~/*": ["./src/*"] } } },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "resolves non-`@/` tsconfig path alias",
    r.violations.some((x) => x.spec === "~/bad.server"),
    `got: ${JSON.stringify(r.violations)}`,
  );

  // Case 3: re-export of forbidden named symbol.
  setup(
    {
      "src/entry.ts": `export { supabaseAdmin } from "some-pkg";\n`,
    },
    { compilerOptions: {} },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "flags re-exported forbidden named symbols",
    r.violations.some((x) => x.spec === "supabaseAdmin"),
    `got: ${JSON.stringify(r.violations)}`,
  );

  // Case 4: clean graph.
  setup(
    {
      "src/entry.ts": `import { ok } from "./helper";\nexport { ok };\n`,
      "src/helper.ts": `export const ok = 1;\n`,
    },
    { compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect("clean graph yields no violations", r.violations.length === 0, `got: ${JSON.stringify(r.violations)}`);

  // Case 5: specifier allowlist suppresses a matching (file, spec) pair.
  setup(
    {
      "src/entry.ts": `import "./leaf.server";\n`,
      "src/leaf.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: {} },
    {
      specifiers: [
        { from: "src/entry.ts", spec: "./leaf.server", reason: "test: known-safe wrapper" },
      ],
      files: [],
      named: [],
    },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "specifier allowlist suppresses matching (file, spec)",
    r.violations.length === 0 && r.suppressed.length === 1,
    `violations=${JSON.stringify(r.violations)} suppressed=${JSON.stringify(r.suppressed.map((s)=>s.spec))}`,
  );

  // Case 5b: specifier allowlist does NOT suppress a different importer.
  setup(
    {
      "src/entry.ts": `import "./other";\n`,
      "src/other.ts": `import "./leaf.server";\n`,
      "src/leaf.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: {} },
    {
      specifiers: [
        { from: "src/entry.ts", spec: "./leaf.server", reason: "test" },
      ],
      files: [],
      named: [],
    },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "specifier allowlist scoped to importer (different file still flagged)",
    r.violations.some((x) => x.spec === "./leaf.server"),
    `violations=${JSON.stringify(r.violations)}`,
  );

  // Case 6: file allowlist stops descent but still flags forbidden NAMED symbols within.
  setup(
    {
      "src/entry.ts": `import "./bridge";\n`,
      "src/bridge.ts": `import "./leaf.server";\nimport { supabaseAdmin } from "x";\nexport const y = supabaseAdmin;\n`,
      "src/leaf.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: {} },
    {
      specifiers: [],
      files: [{ path: "src/bridge.ts", reason: "test: splitter handles this leaf" }],
      named: [],
    },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "file allowlist stops descent (no leaf.server violation)",
    !r.violations.some((x) => x.spec.endsWith("leaf.server")),
    `violations=${JSON.stringify(r.violations)}`,
  );
  expect(
    "file allowlist still flags forbidden named symbols inside the leaf",
    r.violations.some((x) => x.spec === "supabaseAdmin"),
    `violations=${JSON.stringify(r.violations)}`,
  );

  // Case 7: named allowlist suppresses in listed file only.
  setup(
    {
      "src/entry.ts": `import { supabaseAdmin } from "x";\nexport const z = supabaseAdmin;\n`,
    },
    { compilerOptions: {} },
    {
      specifiers: [],
      files: [],
      named: [{ name: "supabaseAdmin", from: "src/entry.ts", reason: "test" }],
    },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "named allowlist suppresses matching (file, name)",
    r.violations.length === 0 && r.suppressed.some((s) => s.spec === "supabaseAdmin"),
    `violations=${JSON.stringify(r.violations)} suppressed=${JSON.stringify(r.suppressed.map((s)=>s.spec))}`,
  );

  // Case 8: stale entry produces a stale report (warn-only).
  setup(
    {
      "src/entry.ts": `export const ok = 1;\n`,
    },
    { compilerOptions: {} },
    {
      specifiers: [{ from: "src/nope.ts", spec: "./gone", reason: "test stale" }],
      files: [],
      named: [],
    },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  expect(
    "stale allowlist entries are reported (warn-only, no violation)",
    r.violations.length === 0 && r.stale.length === 1,
    `violations=${JSON.stringify(r.violations)} stale=${r.stale.length}`,
  );

  // Case 9: loader rejects entry without `reason` (must exit with code 1).
  setup(
    { "src/entry.ts": `export const ok = 1;\n` },
    { compilerOptions: {} },
    { specifiers: [{ from: "src/entry.ts", spec: "./x" }], files: [], named: [] },
  );
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--__internal-load-allowlist", dir],
    { encoding: "utf8" },
  );
  expect(
    "allowlist loader rejects entry missing `reason`",
    child.status === 1 && /missing\/empty required string `reason`/.test(child.stderr),
    `status=${child.status} stderr=${child.stderr}`,
  );

  // Case 10: 3-hop chain to a forbidden specifier is recorded in `chain`.
  setup(
    {
      "src/entry.ts": `import "./mid1";\n`,
      "src/mid1.ts": `import "./mid2";\n`,
      "src/mid2.ts": `import "./leaf.server";\n`,
      "src/leaf.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: {} },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  {
    const v = r.violations.find((x) => x.spec === "./leaf.server");
    expect(
      "specifier violation carries full entry→importer chain",
      !!v && JSON.stringify(v.chain) === JSON.stringify(["src/entry.ts", "src/mid1.ts", "src/mid2.ts"]),
      `chain=${v ? JSON.stringify(v.chain) : "<no violation>"}`,
    );
  }

  // Case 11: named-symbol violation chain ends at the file containing the import.
  setup(
    {
      "src/entry.ts": `import "./bridge";\n`,
      "src/bridge.ts": `import { supabaseAdmin } from "x";\nexport const y = supabaseAdmin;\n`,
    },
    { compilerOptions: {} },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  {
    const v = r.violations.find((x) => x.spec === "supabaseAdmin");
    expect(
      "named violation chain ends at the importing file",
      !!v && JSON.stringify(v.chain) === JSON.stringify(["src/entry.ts", "src/bridge.ts"]),
      `chain=${v ? JSON.stringify(v.chain) : "<no violation>"}`,
    );
  }

  // Case 12: suppressed (allowlisted) finding also carries chain.
  setup(
    {
      "src/entry.ts": `import "./mid";\n`,
      "src/mid.ts": `import "./leaf.server";\n`,
      "src/leaf.server.ts": `export const x = 1;\n`,
    },
    { compilerOptions: {} },
    {
      specifiers: [{ from: "src/mid.ts", spec: "./leaf.server", reason: "test" }],
      files: [],
      named: [],
    },
  );
  r = runCheck(dir, join(dir, "src/entry.ts"));
  {
    const s = r.suppressed.find((x) => x.spec === "./leaf.server");
    expect(
      "suppressed finding carries full chain",
      !!s && JSON.stringify(s.chain) === JSON.stringify(["src/entry.ts", "src/mid.ts"]),
      `chain=${s ? JSON.stringify(s.chain) : "<no suppressed>"}`,
    );
  }

  rmSync(dir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`\n[auth-client-safety:self-test] ${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("[auth-client-safety:self-test] OK");
}

// ---- entrypoint ---------------------------------------------------------

import { spawnSync } from "node:child_process";

const internalIdx = process.argv.indexOf("--__internal-load-allowlist");
if (internalIdx !== -1) {
  // Used by self-test to verify the loader's fail-fast behavior.
  loadAllowlist(process.argv[internalIdx + 1]);
  process.exit(0);
} else if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const ENTRY = resolve(ROOT, "src/routes/_authenticated.tsx");
  if (!existsSync(ENTRY)) {
    console.error(`[auth-client-safety] entry not found: ${ENTRY}`);
    process.exit(1);
  }
  const result = runCheck(ROOT, ENTRY);
  reportAndExit(result, "src/routes/_authenticated.tsx");
}
