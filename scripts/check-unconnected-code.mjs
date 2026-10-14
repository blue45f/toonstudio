#!/usr/bin/env node
/**
 * Unconnected-code gate.
 *
 * Why this exists (first-run audit F5.1): the save-status components
 * `StudioSaveStatusBar` / `StudioSaveSyncStatusCenter` / `StudioSaveStatusChromeMount`
 * were built, exported, and reviewed — but mounted nowhere, so the editor
 * silently shipped without any save feedback. Existing checks do not catch
 * that class of defect:
 *   - `verify-toonstudio-feature-reachability.mjs` only asserts that a
 *     hand-maintained list of studio modules stays reachable; a brand-new
 *     unmounted module is invisible to it.
 *   - `knip` (`quality:deadcode`) is not wired into `pnpm run ci`, and a
 *     component that is imported by a barrel/host but never rendered still
 *     counts as "used" there.
 *
 * This script scans `apps/web/src`, builds the static import graph, and
 * reports three categories of product code that never reaches a user:
 *   - orphan-module:        no other source file imports the module.
 *   - test-only-module:     only test files import the module.
 *   - unmounted-component:  a .tsx module is imported, but one of its exported
 *                           PascalCase components is never referenced outside
 *                           the import statement of any non-test file (the
 *                           exact F5.1 pattern: imported/registered, never
 *                           rendered).
 *
 * Modes:
 *   (default)          Print a human + JSON report. Exit 0. This is the
 *                      "report" half of the gate: current findings are
 *                      surfaced, never hidden.
 *   --check            Gate mode. Exit 1 only when a finding is NOT present
 *                      in scripts/unconnected-code-baseline.json, i.e. new
 *                      unconnected code flowed in. Baseline entries that no
 *                      longer reproduce are reported as resolved (wire the
 *                      module up or delete the code, then shrink the
 *                      baseline — same ratchet direction as lint:strict's
 *                      --max-warnings budget).
 *   --write-baseline   Snapshot the current findings into the baseline file.
 *                      Run once when this gate is first merged, and again
 *                      only together with a reviewed burn-down of findings.
 *
 * Options:
 *   --root <dir>       Repository root (default: cwd).
 *   --src <dir>        Source root, relative to --root
 *                      (default: apps/web/src).
 *   --baseline <path>  Baseline JSON, relative to --root
 *                      (default: scripts/unconnected-code-baseline.json).
 *   --report <path>    Also write the JSON report to this path
 *                      (relative to --root).
 *   --json             Print only the JSON report to stdout.
 *
 * Entry points that are mounted by convention rather than by an import are
 * never reported: the app entry (src/app/main.tsx), route modules under
 * src/app/routes/ (mounted by the router), web workers (*.worker.*), type
 * declarations (*.d.ts), and generated files (*.generated.*). Test files are
 * consumers, never subjects; modules reachable only from tests are reported
 * as test-only instead of being silently treated as shipped.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const TEST_FILE_PATTERN = /(?:\.test|\.spec)\.[tj]sx?$|__tests__\//;

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    src: "apps/web/src",
    baseline: "scripts/unconnected-code-baseline.json",
    report: null,
    check: false,
    writeBaseline: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--write-baseline") args.writeBaseline = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--root") args.root = resolve(argv[++i]);
    else if (arg === "--src") args.src = argv[++i];
    else if (arg === "--baseline") args.baseline = argv[++i];
    else if (arg === "--report") args.report = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/check-unconnected-code.mjs [--check|--write-baseline] [--root <dir>] [--src <dir>] [--baseline <path>] [--report <path>] [--json]");
      process.exit(0);
    } else {
      console.error(`check-unconnected-code: unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function walk(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (SOURCE_EXTENSIONS.includes(extname(path))) files.push(normalize(path));
  }
  return files;
}

function isTestFile(repoRelativePath) {
  return TEST_FILE_PATTERN.test(repoRelativePath.split(sep).join("/"));
}

/** Files mounted by convention (router, HTML entry, worker loader), not by import. */
function isConventionEntry(srcRelativePath) {
  const posix = srcRelativePath.split(sep).join("/");
  return (
    posix === "app/main.tsx" ||
    posix === "app/main.ts" ||
    posix.startsWith("app/routes/") ||
    /\.worker\.[tj]sx?$/.test(posix) ||
    posix.endsWith(".d.ts") ||
    posix.includes(".generated.")
  );
}

function resolveModule(fromFile, specifier, srcRoot, sourceFiles) {
  let base;
  if (specifier.startsWith("@/")) base = resolve(srcRoot, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ].map(normalize);
  return candidates.find((candidate) => sourceFiles.has(candidate)) ?? null;
}

const IMPORT_SPECIFIER_PATTERNS = [
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu,
  /import\(\s*["']([^"']+)["']\s*\)/gu,
];

function importsFor(file, sourceText, srcRoot, sourceFiles) {
  const imports = new Set();
  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    for (const match of sourceText.matchAll(pattern)) {
      const resolved = resolveModule(file, match[1], srcRoot, sourceFiles);
      if (resolved) imports.add(resolved);
    }
  }
  return imports;
}

/** Exported PascalCase component names declared by a .tsx module. */
function exportedComponents(sourceText) {
  const names = new Set();
  const patterns = [
    /export\s+(?:default\s+)?function\s+([A-Z][\w$]*)/gu,
    /export\s+const\s+([A-Z][\w$]*)\s*(?::[^=;]+)?=/gu,
    /export\s+class\s+([A-Z][\w$]*)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) names.add(match[1]);
  }
  const defaultReference = sourceText.match(/export\s+default\s+([A-Z][\w$]*)\s*;/u);
  if (defaultReference) names.add(defaultReference[1]);
  const exportList = /export\s*\{([\s\S]*?)\}/gu;
  for (const match of sourceText.matchAll(exportList)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().replace(/^type\s+/u, "");
      if (!name) continue;
      const exported = name.match(/\bas\s+([A-Z][\w$]*)$/u);
      const plain = name.match(/^([A-Z][\w$]*)$/u);
      if (exported) names.add(exported[1]);
      else if (plain) names.add(plain[1]);
    }
  }
  return [...names];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Local bindings one file imports from one specific module, as
 * Map<localName, originalName>. Handles default, named, aliased
 * (`X as Y`), and namespace (`* as Ns` -> originalName "*") imports.
 */
function bindingsForModule(importerText, importerFile, targetFile, srcRoot, sourceFiles) {
  const bindings = new Map();
  const pattern = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gu;
  for (const match of importerText.matchAll(pattern)) {
    if (resolveModule(importerFile, match[2], srcRoot, sourceFiles) !== targetFile) continue;
    const clause = match[1].trim();
    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/u);
    if (namespace) bindings.set(namespace[1], "*");
    const named = clause.match(/\{([\s\S]*?)\}/u);
    if (named) {
      for (const part of named[1].split(",")) {
        const name = part.trim().replace(/^type\s+/u, "");
        if (!name) continue;
        const alias = name.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/u);
        if (alias) bindings.set(alias[2], alias[1]);
        else if (/^[A-Za-z_$][\w$]*$/u.test(name)) bindings.set(name, name);
      }
    }
    const rest = clause.replace(/\{[\s\S]*?\}/u, "").replace(/\*\s+as\s+[A-Za-z_$][\w$]*/u, "");
    const defaultBinding = rest.match(/([A-Za-z_$][\w$]*)/u);
    if (defaultBinding) bindings.set(defaultBinding[1], "default");
  }
  return bindings;
}

/** Strip import and re-export statements so identifier scans see real usage only. */
function withoutImportStatements(sourceText) {
  return sourceText
    .replace(/import\s+(?:type\s+)?[\s\S]*?\s+from\s+["'][^"']+["'];?/gu, "")
    .replace(/import\s+["'][^"']+["'];?/gu, "")
    .replace(/export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']+["'];?/gu, "")
    .replace(/export\s+\*\s+(?:as\s+[A-Za-z_$][\w$]*\s+)?from\s+["'][^"']+["'];?/gu, "");
}

/**
 * Re-export edges of one file: Map<targetFile, Map<exportedName, originalName>>.
 * `export * from "./x"` is recorded as exportedName "*" -> originalName "*".
 */
function reexportsFor(file, sourceText, srcRoot, sourceFiles) {
  const edges = new Map();
  const add = (target, exportedName, originalName) => {
    if (!edges.has(target)) edges.set(target, new Map());
    edges.get(target).set(exportedName, originalName);
  };
  const namedPattern = /export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/gu;
  for (const match of sourceText.matchAll(namedPattern)) {
    const target = resolveModule(file, match[2], srcRoot, sourceFiles);
    if (!target) continue;
    for (const part of match[1].split(",")) {
      const name = part.trim().replace(/^type\s+/u, "");
      if (!name) continue;
      const alias = name.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/u);
      if (alias) add(target, alias[2], alias[1]);
      else if (/^[A-Za-z_$][\w$]*$/u.test(name)) add(target, name, name);
    }
  }
  const starPattern = /export\s+\*\s+from\s+["']([^"']+)["']/gu;
  for (const match of sourceText.matchAll(starPattern)) {
    const target = resolveModule(file, match[1], srcRoot, sourceFiles);
    if (target) add(target, "*", "*");
  }
  return edges;
}

export function analyze({ root, src }) {
  const srcRoot = resolve(root, src);
  const allFiles = walk(srcRoot);
  const sourceFiles = new Set(allFiles);
  const texts = new Map(allFiles.map((file) => [file, readFileSync(file, "utf8")]));

  // file -> set of importing files (product and test importers tracked apart)
  const importers = new Map(allFiles.map((file) => [file, { product: new Set(), test: new Set() }]));
  for (const file of allFiles) {
    const bucket = isTestFile(relative(root, file)) ? "test" : "product";
    for (const dependency of importsFor(file, texts.get(file), srcRoot, sourceFiles)) {
      if (dependency !== file) importers.get(dependency)[bucket].add(file);
    }
  }

  // Per-file identifier usage outside import statements, for component checks.
  const usageTexts = new Map(
    allFiles
      .filter((file) => !isTestFile(relative(root, file)))
      .map((file) => [file, withoutImportStatements(texts.get(file))]),
  );

  // Import bindings and re-export edges per file, plus a reverse index
  // (target file -> files that import or re-export from it), so component
  // usage can be traced through barrels: page -> barrel -> component module.
  const importBindingsByFile = new Map();
  const reexportsByFile = new Map();
  const dependentsByTarget = new Map(allFiles.map((file) => [file, new Set()]));
  for (const file of allFiles) {
    if (isTestFile(relative(root, file))) continue;
    const bindingMap = new Map();
    for (const target of importsFor(file, texts.get(file), srcRoot, sourceFiles)) {
      bindingMap.set(target, bindingsForModule(texts.get(file), file, target, srcRoot, sourceFiles));
      if (target !== file) dependentsByTarget.get(target).add(file);
    }
    importBindingsByFile.set(file, bindingMap);
    const reexports = reexportsFor(file, texts.get(file), srcRoot, sourceFiles);
    reexportsByFile.set(file, reexports);
    for (const target of reexports.keys()) {
      if (target !== file) dependentsByTarget.get(target).add(file);
    }
  }
  // Modules loaded through a dynamic import() in product code are mounted by
  // construction (lazy boundaries); their exported components are treated as
  // used so code-split surfaces are never false-flagged as unmounted.
  const dynamicImportTargets = new Map(allFiles.map((file) => [file, new Set()]));
  for (const file of allFiles) {
    if (isTestFile(relative(root, file))) continue;
    for (const match of texts.get(file).matchAll(/import\(\s*["']([^"']+)["']\s*\)/gu)) {
      const target = resolveModule(file, match[1], srcRoot, sourceFiles);
      if (target && target !== file) dynamicImportTargets.get(target).add(file);
    }
  }

  const defaultExportName = new Map(
    allFiles.map((file) => [
      file,
      texts.get(file).match(/export\s+default\s+function\s+([A-Z][\w$]*)/u)?.[1] ??
        texts.get(file).match(/export\s+default\s+([A-Z][\w$]*)\s*;/u)?.[1] ??
        null,
    ]),
  );

  /**
   * Is `component`, exported by `moduleFile`, actually referenced by product
   * code? Walks dependents outward: re-export edges forward the name (with
   * aliasing) through barrels; an import edge terminates the walk and counts
   * only when the local binding is referenced outside import/export
   * statements in the importing file.
   */
  function componentIsUsed(moduleFile, component) {
    const queue = [[moduleFile, component]];
    const visited = new Set([`${moduleFile}#${component}`]);
    while (queue.length > 0) {
      const [currentFile, currentName] = queue.shift();
      for (const dependent of dependentsByTarget.get(currentFile) ?? []) {
        const reexports = reexportsByFile.get(dependent)?.get(currentFile);
        if (reexports) {
          for (const [exportedName, originalName] of reexports) {
            const forwards =
              originalName === currentName || (originalName === "*" && exportedName === "*")
                ? exportedName === "*"
                  ? currentName
                  : exportedName
                : null;
            if (forwards !== null) {
              const key = `${dependent}#${forwards}`;
              if (!visited.has(key)) {
                visited.add(key);
                queue.push([dependent, forwards]);
              }
            }
          }
        }
        const bindings = importBindingsByFile.get(dependent)?.get(currentFile);
        if (bindings) {
          const usageText = usageTexts.get(dependent) ?? "";
          for (const [localName, originalName] of bindings) {
            const matches =
              originalName === currentName ||
              (originalName === "default" && defaultExportName.get(currentFile) === currentName);
            if (matches && new RegExp(`\\b${escapeRegExp(localName)}\\b`, "u").test(usageText)) {
              return true;
            }
            if (
              originalName === "*" &&
              new RegExp(`\\b${escapeRegExp(localName)}\\.${escapeRegExp(currentName)}\\b`, "u").test(usageText)
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  const findings = [];
  for (const file of allFiles) {
    const repoPath = relative(root, file).split(sep).join("/");
    if (isTestFile(repoPath)) continue;
    const srcPath = relative(srcRoot, file).split(sep).join("/");
    if (isConventionEntry(srcPath)) continue;

    const { product, test } = importers.get(file);
    if (product.size === 0 && test.size === 0) {
      findings.push({ category: "orphan-module", path: repoPath, name: null });
      continue;
    }
    if (product.size === 0) {
      findings.push({ category: "test-only-module", path: repoPath, name: null });
      continue;
    }
    if (!file.endsWith(".tsx")) continue;

    // Imported somewhere: an exported component is unmounted when no product
    // file that imports this module ever references its local binding outside
    // the import statement (JSX tag, createElement, lazy(), value use).
    if ((dynamicImportTargets.get(file)?.size ?? 0) > 0) continue;
    for (const component of exportedComponents(texts.get(file))) {
      if (!componentIsUsed(file, component)) {
        findings.push({ category: "unmounted-component", path: repoPath, name: component });
      }
    }
  }

  findings.sort((a, b) =>
    `${a.category}:${a.path}#${a.name ?? ""}`.localeCompare(`${b.category}:${b.path}#${b.name ?? ""}`),
  );
  return findings;
}

function findingKey(finding) {
  return `${finding.category}:${finding.path}${finding.name ? `#${finding.name}` : ""}`;
}

function readBaseline(root, baselinePath) {
  const absolute = resolve(root, baselinePath);
  if (!existsSync(absolute)) return { entries: [], missing: true };
  const parsed = JSON.parse(readFileSync(absolute, "utf8"));
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return { entries: entries.map((entry) => (typeof entry === "string" ? entry : findingKey(entry))), missing: false };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const findings = analyze(args);
  const keys = findings.map(findingKey);

  if (args.writeBaseline) {
    const baseline = {
      $comment:
        "Known unconnected code at gate adoption. Shrink this list by wiring modules up or deleting them; --check fails on any finding not listed here.",
      entries: keys,
    };
    writeFileSync(resolve(args.root, args.baseline), `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`check-unconnected-code: baseline written (${keys.length} entries) -> ${args.baseline}`);
    return;
  }

  const { entries: baselineKeys, missing: baselineMissing } = readBaseline(args.root, args.baseline);
  const baselineSet = new Set(baselineKeys);
  const newFindings = findings.filter((finding) => !baselineSet.has(findingKey(finding)));
  const resolvedKeys = baselineKeys.filter((key) => !keys.includes(key));

  const report = {
    tool: "check-unconnected-code",
    src: args.src,
    totalFindings: findings.length,
    byCategory: findings.reduce((acc, finding) => {
      acc[finding.category] = (acc[finding.category] ?? 0) + 1;
      return acc;
    }, {}),
    findings,
    newFindings,
    resolvedBaselineEntries: resolvedKeys,
  };

  if (args.report) {
    writeFileSync(resolve(args.root, args.report), `${JSON.stringify(report, null, 2)}\n`);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `check-unconnected-code: ${findings.length} unconnected finding(s) ` +
        `(${report.byCategory["orphan-module"] ?? 0} orphan-module, ` +
        `${report.byCategory["test-only-module"] ?? 0} test-only-module, ` +
        `${report.byCategory["unmounted-component"] ?? 0} unmounted-component), ` +
        `${newFindings.length} new vs baseline, ${resolvedKeys.length} baseline entr(ies) resolved.`,
    );
    for (const finding of findings) {
      const marker = baselineSet.has(findingKey(finding)) ? "known" : "NEW";
      console.log(`- [${marker}] ${findingKey(finding)}`);
    }
    for (const key of resolvedKeys) {
      console.log(`- [resolved] ${key} (remove from baseline)`);
    }
  }

  if (args.check) {
    if (baselineMissing) {
      console.error(
        `check-unconnected-code: baseline not found at ${args.baseline}. ` +
          "Run `node scripts/check-unconnected-code.mjs --write-baseline` once and commit the result.",
      );
      process.exit(1);
    }
    if (newFindings.length > 0) {
      console.error(
        `check-unconnected-code: gate failed — ${newFindings.length} new unconnected finding(s) not in baseline. ` +
          "Mount the component/module, or (reviewed only) refresh the baseline with --write-baseline.",
      );
      process.exit(1);
    }
    console.log("check-unconnected-code: gate passed (no new unconnected code).");
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) main();
