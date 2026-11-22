/**
 * 저장소 위생 감사용 순수 정적 분석 스캐너 모음.
 * scripts/audit-repo-hygiene.mjs에서 호출되며 외부 의존성 없이 Node 내장 모듈만 사용한다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const VENDOR_PREFIXES = ["crates/vendor/", "third_party/", "apps/web/public/"];
export const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
export const SCRIPT_TEST_RE = /(?:\.(?:test|spec|node-check|browser-check)\.[cm]?[jt]sx?$|_test\.py$|^test_[^/]+\.py$)/u;

const TEMP_EXT_RE = /(?:\.(?:tmp|bak|orig|old|swp|swo|dmp)|~)$/iu;
const DEBUG_FILENAME_RE = /(?:^|\/)(?:__[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$|zz-[^/]+|(?:tmp|temp|scratch|debug)[-_][^/]+\.(?:[cm]?[jt]sx?|py|sh|zsh))$/iu;
const ALLOWED_DEBUG_HELPERS = new Set(["tools/blender/character_kit/debug_render.py"]);
const PERSONAL_PATH_RE = /\/Users\/[A-Za-z0-9._-]+\/\.gemini\/antigravity/u;
const ALLOWED_DUPLICATE_SCRIPT_PAIRS = new Set(["preview::start"]);
const DUPLICATE_CONFIG_PAIRS = [
  ["knip.json", "knip.jsonc"],
  ["opencode.json", ".opencode.jsonc"],
];

const SCRIPT_PATH_REF_RE = /scripts\/[A-Za-z0-9._/@-]+/gu;
const SCRIPT_BASE_REF_RE = /\b[A-Za-z0-9._-]+\.(?:mjs|cjs|js|mts|cts|ts|tsx|py|sh|zsh|bash|json|jsonc|md|yml|yaml|sql|txt|csv)\b/gu;
const REL_IMPORT_LINE_RE = /^\s*(?:import|export)\s+(?:type\s+)?(?:(?:[^;'"\n]{0,200}|\{[^}]{0,1200}\})\s+from\s+)?["'](\.[^"'\n]+)["']/gmu;
const PY_IMPORT_RE = /(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/gu;
const GENERIC_BASENAMES = new Set([
  "index.js", "index.mjs", "index.ts", "README.md", "package.json",
  "tsconfig.json", "types.ts", "utils.mjs", "utils.ts", "common.mjs", "helpers.mjs", "config.json",
]);

const ASSERT_CALL_RE = /\b(?:expect|expectTypeOf|assert|assertEquals|assertEqual|assertStrictEqual|assertDeepStrictEqual|assertMatch|assertThrows|assertRejects|assertOk|should)\s*(?:\(|\.)/gu;
const TAUTOLOGY_RE = /\bexpect\s*\(\s*(true|false|1|0)\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\1\s*\)|\bexpect\s*\(\s*true\s*\)\s*\.\s*toBeTruthy\s*\(\s*\)|\bexpect\s*\(\s*false\s*\)\s*\.\s*toBeFalsy\s*\(\s*\)|\bassert\s*\.\s*(?:ok|equal|strictEqual)\s*\(\s*true\s*(?:,\s*true\s*)?\)/gu;
const EMPTY_TEST_BLOCK_RE = /\b(?:it|test|describe)\s*\(\s*(?:""|''|``)\s*,\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\s*\([^)]*\))\s*\{\s*\}\s*\)/gu;
const EXCLUSIVE_ONLY_RE = /\b(?:it|test|describe)\s*\.\s*only\s*\(/gu;
const TEST_DECL_RE = /\b(?:it|test)\s*(?:\.[a-zA-Z]+)?\s*\(/u;
const TABLE_DRIVEN_TEST_RE = /\bfor\s*\([^)]*\)\s*\{?\s*(?:it|test)\s*\(/u;

const FAST_ASSERT_PRECHECK_RE = /\b(?:expect|expectTypeOf|assert|should)\b/u;
const FAST_TAUTOLOGY_PRECHECK_RE = /expect\s*\(\s*(?:true|false|1|0)\s*\)|assert\s*\.\s*(?:ok|equal|strictEqual)\s*\(\s*true/u;
const FAST_EMPTY_PRECHECK_RE = /\b(?:it|test|describe)\s*\([^)\n]{1,120},\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\s*\([^)]*\))\s*\{\s*\}\s*\)/u;
const FAST_ONLY_PRECHECK_RE = /\b(?:it|test|describe)\s*\.\s*only\s*\(/u;

export function isVendorFile(rel) {
  return VENDOR_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function canStartRegexLiteral(lastSigChar, lastIdent) {
  if (!lastSigChar) return true;
  if ("([{:;,=!?&|+-*%^~<>}\n".includes(lastSigChar)) return true;
  return ["return", "case", "throw", "typeof", "void", "delete", "in", "of", "await", "yield", "else", "do"].includes(lastIdent);
}

/**
 * 주석·문자열·템플릿 리터럴·정규식 리터럴 본문을 비워 순수 코드 토큰만 남긴다.
 * 따옴표 자체는 보존해 `test("", () => {})` 패턴을 유지하면서
 * 테스트 픽스처 문자열이나 정규식 안의 따옴표/백틱에 의한 오탐을 차단한다.
 */
export function stripCommentsAndStringBodies(source) {
  const chunks = [];
  const len = source.length;
  let i = 0;
  let plainStart = 0;
  let lastSigChar = "";
  let lastIdent = "";

  const flushPlain = (end) => {
    if (end > plainStart) chunks.push(source.slice(plainStart, end));
  };

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      flushPlain(i);
      i += 2;
      while (i < len && source[i] !== "\n") i += 1;
      plainStart = i;
      continue;
    }

    if (ch === "/" && next === "*") {
      flushPlain(i);
      i += 2;
      while (i < len && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") chunks.push("\n");
        i += 1;
      }
      i += 2;
      plainStart = i;
      continue;
    }

    if (ch === "/" && canStartRegexLiteral(lastSigChar, lastIdent)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < len && source[j] !== "\n") {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        else if (source[j] === "/" && !inClass) {
          closed = true;
          j += 1;
          while (j < len && /[a-z]/iu.test(source[j])) j += 1;
          break;
        }
        j += 1;
      }
      if (closed) {
        flushPlain(i);
        chunks.push("//");
        i = j;
        plainStart = i;
        lastSigChar = "/";
        lastIdent = "";
        continue;
      }
    }

    if (ch === "\"" || ch === "'" || ch === "`") {
      flushPlain(i);
      const quote = ch;
      chunks.push(quote);
      i += 1;
      while (i < len) {
        const c = source[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === quote) {
          chunks.push(quote);
          i += 1;
          break;
        }
        if (c === "\n") chunks.push("\n");
        i += 1;
      }
      plainStart = i;
      lastSigChar = quote;
      lastIdent = "";
      continue;
    }

    if (/[A-Za-z_$]/u.test(ch)) {
      const start = i;
      i += 1;
      while (i < len && /[\w$]/u.test(source[i])) i += 1;
      lastIdent = source.slice(start, i);
      lastSigChar = lastIdent[lastIdent.length - 1];
      continue;
    }

    if (ch !== " " && ch !== "\t" && ch !== "\r") {
      lastSigChar = ch;
      lastIdent = "";
    }
    i += 1;
  }

  flushPlain(len);
  return chunks.join("");
}

export function auditTempAndDebugFiles(files, contents) {
  const findings = [];
  for (const rel of files) {
    if (isVendorFile(rel)) continue;
    if (TEMP_EXT_RE.test(rel)) {
      findings.push({ file: rel, reason: "임시·백업 확장자 파일" });
      continue;
    }
    if (rel.endsWith(".log") && !rel.startsWith("docs/evidence/")) {
      findings.push({ file: rel, reason: "추적된 로그 산출물 파일" });
      continue;
    }
    if (DEBUG_FILENAME_RE.test(rel) && !ALLOWED_DEBUG_HELPERS.has(rel)) {
      findings.push({ file: rel, reason: "임시·디버그·프로브 파일명 패턴" });
      continue;
    }
    if (rel.startsWith("scripts/") && !rel.startsWith("scripts/experiments/") && !SCRIPT_TEST_RE.test(rel)) {
      const text = contents.get(rel);
      if (text && PERSONAL_PATH_RE.test(text)) {
        findings.push({ file: rel, reason: "개인 로컬 에이전트 아티팩트 경로 하드코딩" });
      }
    }
  }
  return findings;
}

export function auditRootSprawl(files) {
  const rootFiles = files.filter((rel) => !rel.includes("/"));
  const rootSet = new Set(rootFiles);
  return {
    totalRootFiles: rootFiles.length,
    playwrightConfigs: rootFiles.filter((f) => /^playwright\..+\.config\.[cm]?[jt]s$/u.test(f)).length,
    tsconfigFiles: rootFiles.filter((f) => /^tsconfig\..+\.json$/u.test(f)).length,
    vitestFiles: rootFiles.filter((f) => /^vitest\./u.test(f)).length,
    envFiles: rootFiles.filter((f) => f.startsWith(".env")).length,
    duplicateConfigPairs: DUPLICATE_CONFIG_PAIRS.filter(([a, b]) => rootSet.has(a) && rootSet.has(b)),
  };
}

function extractPathCandidates(command) {
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
  const paths = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const prev = tokens[i - 1];
    if (prev === "--output" || prev === "--out" || prev === ">") continue;
    let tok = tokens[i].replace(/^['"]|['"]$/gu, "");
    if (tok.startsWith("--config=")) tok = tok.slice("--config=".length);
    if (
      tok.startsWith("--") || tok.startsWith("http://") || tok.startsWith("https://")
      || tok.startsWith("/tmp/") || tok.startsWith("dist/") || tok.startsWith("node_modules/")
      || tok.startsWith(".tstrace") || tok.includes("*") || tok.includes("$")
    ) {
      continue;
    }
    const looksLikePath =
      /^(?:scripts|apps|packages|e2e|tests|tools|deploy|config)\//u.test(tok)
      || /^(?:playwright|vitest|tsconfig|lighthouserc)\..*\.(?:ts|mts|mjs|js|cjs|json)$/u.test(tok);
    if (looksLikePath) paths.push(tok);
  }
  return paths;
}

export function auditPackageScripts(root, files, contents) {
  const rootPkgText = contents.get("package.json");
  if (!rootPkgText) {
    return {
      totalRootScripts: 0,
      missingPaths: [],
      missingSubscripts: [],
      missingWorkspaceScripts: [],
      duplicateCommands: [],
      unusedAliasWrappers: [],
    };
  }
  const rootPkg = JSON.parse(rootPkgText);
  const scripts = rootPkg.scripts ?? {};
  const workspaceMap = new Map();
  for (const rel of files) {
    if (rel !== "package.json" && rel.endsWith("/package.json")) {
      try {
        const parsed = JSON.parse(contents.get(rel) || readFileSync(path.join(root, rel), "utf8"));
        if (parsed.name) workspaceMap.set(parsed.name, { file: rel, pkg: parsed });
      } catch {
        // 잘못된 JSON은 validate-architecture가 별도로 보고한다.
      }
    }
  }

  const missingPaths = [];
  const missingSubscripts = [];
  const missingWorkspaceScripts = [];
  const byCommand = new Map();
  const wrapperCandidates = [];

  for (const [name, rawCmd] of Object.entries(scripts)) {
    const cmd = String(rawCmd).trim();
    const list = byCommand.get(cmd) ?? [];
    list.push(name);
    byCommand.set(cmd, list);

    for (const targetPath of extractPathCandidates(cmd)) {
      if (!existsSync(path.join(root, targetPath))) {
        missingPaths.push({ manifest: "package.json", script: name, target: targetPath });
      }
    }
    for (const match of cmd.matchAll(/pnpm\s+--filter\s+([@a-zA-Z0-9._/-]+)\s+(?:run\s+)?([a-zA-Z0-9:_-]+)/gu)) {
      const [, wsName, targetScript] = match;
      const ws = workspaceMap.get(wsName);
      if (!ws) {
        missingWorkspaceScripts.push({ script: name, workspace: wsName, target: targetScript, reason: "존재하지 않는 워크스페이스" });
      } else if (!ws.pkg.scripts?.[targetScript]) {
        missingWorkspaceScripts.push({ script: name, workspace: wsName, target: targetScript, reason: `${ws.file}에 스크립트 없음` });
      }
    }
    for (const match of cmd.matchAll(/pnpm(?:\s+run)?\s+([a-zA-Z0-9:_-]+)/gu)) {
      const sub = match[1];
      if (["exec", "dlx", "install", "audit", "test", "build", "dev", "start", "-r", "--filter"].includes(sub)) continue;
      const before = cmd.slice(Math.max(0, match.index - 40), match.index);
      if (/--filter\s+\S+\s*$|^-r\b|\s-r\b/u.test(before)) continue;
      if (!scripts[sub]) missingSubscripts.push({ script: name, target: sub });
    }
    const aliasMatch = cmd.match(/^pnpm(?:\s+run)?\s+([a-zA-Z0-9:_-]+)$/u);
    if (aliasMatch && scripts[aliasMatch[1]]) wrapperCandidates.push({ alias: name, target: aliasMatch[1] });
  }

  for (const [, ws] of workspaceMap.entries()) {
    const wsDir = path.dirname(ws.file);
    for (const [scriptName, rawCmd] of Object.entries(ws.pkg.scripts ?? {})) {
      const tokens = String(rawCmd).match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? [];
      for (const rawTok of tokens) {
        const tok = rawTok.replace(/^['"]|['"]$/gu, "");
        if (tok.includes("*") || tok.includes("$") || tok.startsWith("http")) continue;
        if (/^(?:scripts|src|tools|tests|e2e)\/[A-Za-z0-9._/-]+\.[a-z]+$/u.test(tok)) {
          if (!existsSync(path.join(root, wsDir, tok)) && !existsSync(path.join(root, tok))) {
            missingPaths.push({ manifest: ws.file, script: scriptName, target: tok });
          }
        }
      }
    }
  }

  const duplicateCommands = [];
  for (const [cmd, names] of byCommand.entries()) {
    if (names.length < 2) continue;
    const key = [...names].sort().join("::");
    if (ALLOWED_DUPLICATE_SCRIPT_PAIRS.has(key)) continue;
    duplicateCommands.push({ scripts: names.sort(), command: cmd });
  }

  const unusedAliasWrappers = [];
  for (const { alias, target } of wrapperCandidates) {
    if (alias.startsWith("pre") || alias.startsWith("post")) continue;
    let referenced = Object.entries(scripts).some(([otherName, otherCmd]) => otherName !== alias && String(otherCmd).includes(alias));
    if (!referenced) {
      for (const [rel, text] of contents.entries()) {
        if (rel !== "package.json" && text.includes(alias)) {
          referenced = true;
          break;
        }
      }
    }
    if (!referenced) unusedAliasWrappers.push({ alias, target });
  }

  return {
    totalRootScripts: Object.keys(scripts).length,
    missingPaths,
    missingSubscripts,
    missingWorkspaceScripts,
    duplicateCommands,
    unusedAliasWrappers,
  };
}

function resolveRelativeTarget(root, fromFile, specifier, fileSet) {
  const raw = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [raw];
  if (raw.endsWith(".js")) {
    candidates.push(`${raw.slice(0, -3)}.ts`, `${raw.slice(0, -3)}.tsx`, `${raw.slice(0, -3)}.mts`, `${raw.slice(0, -3)}.d.ts`);
  } else if (raw.endsWith(".mjs")) {
    candidates.push(`${raw.slice(0, -4)}.mts`, `${raw.slice(0, -4)}.ts`, `${raw.slice(0, -4)}.d.mts`);
  } else if (raw.endsWith(".cjs")) {
    candidates.push(`${raw.slice(0, -4)}.cts`, `${raw.slice(0, -4)}.d.cts`);
  } else if (!path.posix.extname(raw)) {
    for (const ext of [
      ".mjs", ".js", ".cjs", ".mts", ".ts", ".tsx", ".d.ts", ".d.mts", ".json",
      "/index.mjs", "/index.js", "/index.ts", "/index.mts", "/index.d.ts",
    ]) {
      candidates.push(`${raw}${ext}`);
    }
  }
  for (const candidate of candidates) {
    if (fileSet.has(candidate) || existsSync(path.join(root, candidate))) return candidate;
  }
  return null;
}

function isAmbientDeclarationForSibling(rel, fileSet) {
  const match = rel.match(/^(.+)\.d\.(m?ts|cts)$/u);
  if (!match) return false;
  return [".mjs", ".js", ".cjs", ".mts", ".ts"].some((ext) => fileSet.has(`${match[1]}${ext}`));
}

export function auditOrphanScripts(root, files, contents) {
  const fileSet = new Set(files);
  const scriptFiles = files.filter((rel) => rel.startsWith("scripts/"));
  const scriptSet = new Set(scriptFiles);
  const byBase = new Map();
  const byStem = new Map();

  for (const rel of scriptFiles) {
    const base = path.posix.basename(rel);
    const ext = path.posix.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    const baseList = byBase.get(base) ?? [];
    baseList.push(rel);
    byBase.set(base, baseList);
    if (stem.length >= 4) {
      const stemList = byStem.get(stem) ?? [];
      stemList.push(rel);
      byStem.set(stem, stemList);
    }
  }

  const referencedBy = new Map(scriptFiles.map((f) => [f, new Set()]));
  const brokenImportsByScript = new Map();

  for (const [src, text] of contents.entries()) {
    if (!text) continue;
    const isScriptFile = src.startsWith("scripts/");
    const hasScriptsMention = text.includes("scripts/");
    if (!isScriptFile && !hasScriptsMention) continue;

    const hits = new Set();
    if (hasScriptsMention) {
      for (const match of text.matchAll(SCRIPT_PATH_REF_RE)) {
        const candidate = match[0].replace(/[.,;:'")\]`]+$/u, "");
        if (scriptSet.has(candidate)) hits.add(candidate);
        if (candidate.endsWith(".js") && scriptSet.has(`${candidate.slice(0, -3)}.ts`)) hits.add(`${candidate.slice(0, -3)}.ts`);
        if (candidate.endsWith(".mjs") && scriptSet.has(`${candidate.slice(0, -4)}.mts`)) hits.add(`${candidate.slice(0, -4)}.mts`);
      }
    }
    if (isScriptFile || src === "package.json" || src.startsWith(".github/") || src.startsWith("config/")) {
      for (const match of text.matchAll(SCRIPT_BASE_REF_RE)) {
        const base = match[0];
        if (GENERIC_BASENAMES.has(base)) continue;
        for (const target of byBase.get(base) ?? []) hits.add(target);
        if (base.endsWith(".js")) {
          for (const alt of [`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.mts`]) {
            for (const target of byBase.get(alt) ?? []) hits.add(target);
          }
        } else if (base.endsWith(".mjs")) {
          for (const target of byBase.get(`${base.slice(0, -4)}.mts`) ?? []) hits.add(target);
        }
      }
    }
    if (isScriptFile && /\.[cm]?[jt]sx?$/u.test(src)) {
      for (const match of text.matchAll(REL_IMPORT_LINE_RE)) {
        const spec = match[1];
        if (!spec.startsWith(".") || spec.includes("${")) continue;
        const resolved = resolveRelativeTarget(root, src, spec, fileSet);
        if (resolved) {
          if (scriptSet.has(resolved)) hits.add(resolved);
        } else if (!SCRIPT_TEST_RE.test(src) && !src.startsWith("scripts/experiments/")) {
          const broken = brokenImportsByScript.get(src) ?? [];
          broken.push(spec);
          brokenImportsByScript.set(src, broken);
        }
      }
    }
    if (isScriptFile && src.endsWith(".py")) {
      for (const match of text.matchAll(PY_IMPORT_RE)) {
        const mod = (match[1] || match[2] || "").split(".").pop();
        if (mod && byStem.has(mod)) {
          for (const target of byStem.get(mod)) {
            if (target.endsWith(".py")) hits.add(target);
          }
        }
      }
    }
    for (const target of hits) {
      if (target !== src) referencedBy.get(target).add(src);
    }
  }

  const deadOrphanScripts = [];
  const unreferencedTopLevelScripts = [];

  for (const rel of scriptFiles) {
    if (rel.startsWith("scripts/experiments/") || SCRIPT_TEST_RE.test(rel)) continue;
    if (rel.endsWith(".md") || rel.endsWith(".json") || rel.endsWith(".txt")) continue;
    if (isAmbientDeclarationForSibling(rel, fileSet)) continue;
    if (referencedBy.get(rel).size > 0) continue;

    const text = contents.get(rel) ?? "";
    const brokenImports = brokenImportsByScript.get(rel) ?? [];
    const hasPersonalPath = PERSONAL_PATH_RE.test(text);
    const isOneOffPatcher =
      /\b(?:patch|replace_once)\s*\(/u.test(text)
      && /\b(?:writeFile|writeFileSync|write_text)\b/u.test(text)
      && /\.replace\s*\(/u.test(text)
      && /(?:apps\/web\/src|apps\/api\/src)/u.test(text);
    const hasDeadPreMonorepoSrc =
      /(?:path\.join|join|resolve)\([^)\n]*["']src\/(?:domains|shared|app|components)\//u.test(text)
      || /from\s+["']\.\.\/src\/(?:domains|shared|app|components)\//u.test(text);

    if (hasPersonalPath || isOneOffPatcher || hasDeadPreMonorepoSrc || brokenImports.length > 0) {
      const reasons = [];
      if (hasPersonalPath) reasons.push("개인 로컬 경로 하드코딩");
      if (isOneOffPatcher) reasons.push("1회성 소스 패치 스크립트");
      if (hasDeadPreMonorepoSrc) reasons.push("폐기된 루트 src/ 경로 참조");
      if (brokenImports.length > 0) reasons.push(`깨진 상대 임포트(${brokenImports.join(", ")})`);
      deadOrphanScripts.push({ file: rel, reasons });
    } else if (rel.split("/").length === 2) {
      unreferencedTopLevelScripts.push(rel);
    }
  }

  return {
    totalScripts: scriptFiles.length,
    topLevelScripts: scriptFiles.filter((f) => f.split("/").length === 2).length,
    deadOrphanScripts,
    unreferencedTopLevelScripts,
  };
}

export function auditHollowTests(testFiles, contents) {
  const tautologyOnly = [];
  const zeroAssertions = [];
  const emptyBodies = [];
  const exclusiveOnly = [];
  const debugProbeTests = [];

  for (const rel of testFiles) {
    const raw = contents.get(rel) ?? "";
    if (!raw.trim()) {
      zeroAssertions.push({ file: rel, reason: "빈 테스트 파일" });
      continue;
    }

    const mightNeedDeepInspect =
      !FAST_ASSERT_PRECHECK_RE.test(raw)
      || FAST_TAUTOLOGY_PRECHECK_RE.test(raw)
      || FAST_EMPTY_PRECHECK_RE.test(raw)
      || FAST_ONLY_PRECHECK_RE.test(raw)
      || /(?:^|\/)(?:__[^/]*probe|debug[-_])/iu.test(rel);
    if (!mightNeedDeepInspect) continue;

    const code = stripCommentsAndStringBodies(raw);
    const onlyMatches = code.match(EXCLUSIVE_ONLY_RE);
    if (onlyMatches) exclusiveOnly.push({ file: rel, count: onlyMatches.length });

    const emptyMatches = code.match(EMPTY_TEST_BLOCK_RE);
    if (emptyMatches) emptyBodies.push({ file: rel, count: emptyMatches.length });

    const tautologies = code.match(TAUTOLOGY_RE) ?? [];
    const assertCalls = code.match(ASSERT_CALL_RE) ?? [];
    const hasTestDecl = TEST_DECL_RE.test(code);
    const isTableDriven = TABLE_DRIVEN_TEST_RE.test(code);

    if (tautologies.length > 0 && tautologies.length >= assertCalls.length) {
      tautologyOnly.push({ file: rel, tautologies: tautologies.length });
    } else if (hasTestDecl && !isTableDriven && !emptyMatches && assertCalls.length === 0) {
      const hasHelperCall = /\b(?:assert|expect|verify|check|ensure|validate)[A-Z][A-Za-z0-9_]*\s*\(/u.test(code);
      if (!hasHelperCall) {
        zeroAssertions.push({ file: rel, reason: "테스트 선언은 있으나 assertion 호출 0건" });
      }
    }

    const lineCount = raw.trim().split("\n").length;
    if (
      lineCount <= 25
      && /\bconsole\.(?:log|debug|dir)\s*\(/u.test(code)
      && /(?:^|\/)(?:__[^/]*probe|debug[-_])/iu.test(rel)
    ) {
      debugProbeTests.push({ file: rel, lines: lineCount });
    }
  }

  return {
    scannedTestFiles: testFiles.length,
    tautologyOnly,
    zeroAssertions,
    emptyBodies,
    exclusiveOnly,
    debugProbeTests,
  };
}
