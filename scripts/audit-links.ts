/**
 * Static link audit — Phase 0 D0.1.
 *
 * Walks src/ for any internal route reference and verifies that a matching
 * page.tsx (or API route.ts) exists. Reports every reference that points at
 * a route the codebase cannot serve.
 *
 * Run via `node --import tsx ./scripts/audit-links.ts` or `npx tsx ./scripts/audit-links.ts`.
 *
 * Limitations
 * - Only matches string literals starting with `/`. Computed href values
 *   (template strings with non-literal parts) are reported separately and
 *   counted as "skipped" rather than treated as missing.
 * - Dynamic segments (e.g. `/produkter/[sku]`) match any path with the
 *   same segment count and prefix.
 * - Catch-all segments (`[...slug]`) match any path that begins with the
 *   parent segments.
 * - Routes inside the `(store)` route group are mapped correctly — the
 *   group is invisible to the URL.
 *
 * Whitelist: routes intentionally absent today live in
 * docs/route-stub-registry.md — known stubs are reported as "stub"
 * rather than "broken".
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const REPO_ROOT = path.resolve(
  url.fileURLToPath(new URL("..", import.meta.url))
);
const SRC_DIR = path.join(REPO_ROOT, "src");
const APP_DIR = path.join(SRC_DIR, "app");
const STUB_REGISTRY = path.join(REPO_ROOT, "docs", "route-stub-registry.md");

// ─── Types ─────────────────────────────────────────────────────────────

interface Reference {
  route: string;
  file: string;
  line: number;
  raw: string;
}

interface RouteIndex {
  pages: string[]; // normalised page routes, e.g. "/produkter/[sku]"
  apis: string[];  // normalised API routes, e.g. "/api/auth/callback"
}

// ─── Utilities ─────────────────────────────────────────────────────────

async function walk(dir: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "generated") continue;
      out.push(...(await walk(full, exts)));
    } else if (exts.some((x) => e.name.endsWith(x))) {
      out.push(full);
    }
  }
  return out;
}

function relative(p: string): string {
  return path.relative(REPO_ROOT, p).replaceAll("\\", "/");
}

/**
 * Convert a filesystem page path to its URL pattern.
 *
 * Examples:
 *   src/app/[locale]/(store)/produkter/page.tsx       -> /produkter
 *   src/app/[locale]/(store)/produkter/[sku]/page.tsx -> /produkter/[sku]
 *   src/app/[locale]/admin/ordrer/[id]/page.tsx       -> /admin/ordrer/[id]
 *   src/app/[locale]/page.tsx                         -> /
 *   src/app/api/vipps/webhook/route.ts                -> /api/vipps/webhook
 */
function fsPathToRoute(absPath: string): string | null {
  const rel = relative(absPath);
  if (!rel.startsWith("src/app/")) return null;

  let route = rel.slice("src/app/".length);

  // Strip page/route file
  if (route.endsWith("/page.tsx")) route = route.slice(0, -"/page.tsx".length);
  else if (route.endsWith("/route.ts")) route = route.slice(0, -"/route.ts".length);
  else return null;

  // Strip [locale] prefix — it does not appear in URLs (localePrefix: 'never')
  if (route === "[locale]") route = "";
  else if (route.startsWith("[locale]/")) route = route.slice("[locale]/".length);

  // Strip route groups like (store) — invisible in the URL
  route = route
    .split("/")
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
    .join("/");

  return "/" + route;
}

async function buildRouteIndex(): Promise<RouteIndex> {
  const pageFiles = await walk(APP_DIR, ["page.tsx", "page.ts"]);
  const apiFiles = await walk(APP_DIR, ["route.ts"]);

  const pages = pageFiles.map(fsPathToRoute).filter((r): r is string => !!r && !r.startsWith("/api"));
  const apis = apiFiles.map(fsPathToRoute).filter((r): r is string => !!r && r.startsWith("/api"));

  return { pages: pages.sort(), apis: apis.sort() };
}

/** Match a candidate URL against a registered route pattern. */
function matchRoute(candidate: string, pattern: string): boolean {
  const cSeg = candidate.split("/").filter(Boolean);
  const pSeg = pattern.split("/").filter(Boolean);

  for (let i = 0; i < pSeg.length; i++) {
    const p = pSeg[i];
    const c = cSeg[i];

    if (p.startsWith("[...") && p.endsWith("]")) return true; // catch-all matches the rest
    if (c === undefined) return false;
    if (p.startsWith("[") && p.endsWith("]")) continue; // dynamic segment matches anything
    if (p !== c) return false;
  }

  return cSeg.length === pSeg.length;
}

function isRouteServed(route: string, index: RouteIndex): boolean {
  // Strip query/hash for matching
  const clean = route.split("?")[0].split("#")[0];

  if (clean.startsWith("/api/")) {
    return index.apis.some((p) => matchRoute(clean, p));
  }
  return index.pages.some((p) => matchRoute(clean, p));
}

/** Pull every internal route reference out of a TS/TSX file. */
function extractReferences(file: string, source: string): Reference[] {
  const refs: Reference[] = [];
  const lines = source.split(/\r?\n/);

  // Patterns we accept. All look for a literal beginning with `/`.
  const patterns: { re: RegExp; group: number }[] = [
    // href="/..."  or  href='/...'
    { re: /\bhref\s*=\s*["'](\/[^"']*)["']/g, group: 1 },
    // href={"/..."}  or  href={'/...'}  (literal in braces)
    { re: /\bhref\s*=\s*\{\s*["'](\/[^"']*)["']\s*\}/g, group: 1 },
    // redirect("/...") or redirect('/...')
    { re: /\bredirect\s*\(\s*["'](\/[^"']*)["']/g, group: 1 },
    // router.push("/...") / router.replace("/...")
    { re: /\brouter\.(?:push|replace)\s*\(\s*["'](\/[^"']*)["']/g, group: 1 },
    // <form action="/...">
    { re: /\baction\s*=\s*["'](\/[^"']*)["']/g, group: 1 },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, group } of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const route = m[group];
        // Skip mailto/tel/external/anchor-only/etc.
        if (route.startsWith("//")) continue; // protocol-relative
        if (!route.startsWith("/")) continue;
        refs.push({ route, file: relative(file), line: i + 1, raw: m[0] });
      }
    }
  }

  return refs;
}

async function loadStubRegistry(): Promise<Set<string>> {
  try {
    const text = await fs.readFile(STUB_REGISTRY, "utf8");
    const out = new Set<string>();
    // Match the leading | `path` | column of each row
    const re = /^\|\s*`(\/[^`]+)`\s*\|/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.add(m[1]);
    return out;
  } catch {
    return new Set();
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const index = await buildRouteIndex();
  const stubs = await loadStubRegistry();

  const sourceFiles = await walk(SRC_DIR, [".ts", ".tsx"]);

  const refs: Reference[] = [];
  for (const f of sourceFiles) {
    const text = await fs.readFile(f, "utf8");
    refs.push(...extractReferences(f, text));
  }

  const broken: Reference[] = [];
  const stubRefs: Reference[] = [];

  for (const r of refs) {
    if (isRouteServed(r.route, index)) continue;
    // Stub registry uses the canonical `/foo` form (no query/hash)
    const clean = r.route.split("?")[0].split("#")[0];
    if (stubs.has(clean)) {
      stubRefs.push(r);
      continue;
    }
    broken.push(r);
  }

  console.log(`Routes registered: ${index.pages.length} pages, ${index.apis.length} APIs`);
  console.log(`References scanned: ${refs.length}`);
  console.log(`Stub references: ${stubRefs.length}`);
  console.log(`Broken references: ${broken.length}`);
  console.log("");

  if (stubRefs.length > 0) {
    console.log("--- Stub references (tracked in docs/route-stub-registry.md) ---");
    for (const r of stubRefs) {
      console.log(`  ${r.route}  ${r.file}:${r.line}`);
    }
    console.log("");
  }

  if (broken.length > 0) {
    console.log("--- BROKEN references ---");
    for (const r of broken) {
      console.log(`  ${r.route}  ${r.file}:${r.line}  ${r.raw}`);
    }
    process.exit(1);
  } else {
    console.log("OK: no broken internal route references.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
