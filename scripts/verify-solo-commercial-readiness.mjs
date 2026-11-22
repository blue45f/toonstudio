#!/usr/bin/env node
/**
 * 1인 기업 상업 라이선스·보안 태세 자동 감시 가드.
 *
 * 외부 의존성 없이 Node 내장 모듈만으로 1초 이내에 다음을 점검한다:
 * 1. package.json / pnpm-lock.yaml / (선택) node_modules에서 mixbox·GPL·AGPL·SSPL·CC-BY-NC 유입 차단
 * 2. Remotion(@remotion/* 포함) 3인 이하 무료 경계 안내 및 4인 이상 상업 라이선스 경보
 * 3. p5(p5.brush 경유 포함) 및 opencascade.js LGPL 동적 경계 상태 리포트
 * 4. OpenSSF Scorecard 워크플로 보안 태세(최소 권한·오프피크 스케줄·SHA 고정·아티팩트 보관일) 점검
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REMOTION_FREE_MAX_TEAM_SIZE = 3;
const WORKSPACE_CONTAINERS = ["apps", "packages", "deploy"];
const DEP_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const BLOCKED_PACKAGE_RULES = [
  {
    code: "BLOCKED_PACKAGE_MIXBOX",
    category: "CC-BY-NC",
    match: (name) => /^(?:@[^/]+\/)?mixbox(?:[-/].*)?$/iu.test(name),
    license: "CC-BY-NC-4.0 (Mixbox non-commercial)",
    reasonKo: "Mixbox는 비상업(CC-BY-NC-4.0) 라이선스이므로 상용 제품 의존성 유입을 차단합니다.",
  },
];

const KNOWN_LGPL_LOCKFILE_LICENSES = new Map([
  ["opencascade.js", "LGPL-2.1-only"],
  ["p5", "LGPL-2.1"],
]);

function normalizeLicenseField(raw) {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => (typeof item === "string" ? item : item?.type))
      .filter((item) => typeof item === "string" && item.trim().length > 0);
    return parts.join(" OR ");
  }
  if (typeof raw === "object" && typeof raw.type === "string") {
    return raw.type.trim();
  }
  return "";
}

function classifySingleLicenseToken(token) {
  const clean = token.trim().replace(/^['"]|['"]$/gu, "");
  if (!clean) return { kind: "permissive", matchedCategory: null };
  if (/\bCC-BY-NC(?:-[A-Z0-9.]+)?\b/iu.test(clean) || /\bNonCommercial\b/iu.test(clean)) {
    return { kind: "blocked", matchedCategory: "CC-BY-NC" };
  }
  if (/\bSSPL(?:\b|-)/iu.test(clean)) {
    return { kind: "blocked", matchedCategory: "SSPL" };
  }
  if (/\bAGPL(?:\b|-)/iu.test(clean)) {
    return { kind: "blocked", matchedCategory: "AGPL" };
  }
  if (/\bLGPL(?:\b|-)/iu.test(clean)) {
    return { kind: "lgpl", matchedCategory: "LGPL" };
  }
  if (/(?<![A-Z])GPL(?:\b|-)/iu.test(clean)) {
    return { kind: "blocked", matchedCategory: "GPL" };
  }
  return { kind: "permissive", matchedCategory: null };
}

function tokenizeSpdx(expr) {
  const tokens = [];
  const re = /\(|\)|\bAND\b|\bOR\b|[^()\s]+/gu;
  for (const match of expr.matchAll(re)) {
    tokens.push(match[0]);
  }
  return tokens;
}

/**
 * SPDX 라이선스 식을 파싱해 OR(선택 가능)·AND(동시 충족) 규칙에 따라 위험 등급을 분류한다.
 * 예: `(BSD-3-Clause OR GPL-2.0)` → permissive-dual (차단 아님), `(MIT AND GPL-3.0)` → blocked.
 */
export function classifyLicenseExpression(rawLicense) {
  const expr = normalizeLicenseField(rawLicense);
  if (!expr) {
    return { status: "unknown", blockedCategories: [], hasLgpl: false, expression: "" };
  }

  const tokens = tokenizeSpdx(expr);
  let pos = 0;

  function parseOr() {
    const branches = [parseAnd()];
    while (pos < tokens.length && tokens[pos] === "OR") {
      pos += 1;
      branches.push(parseAnd());
    }
    if (branches.length === 1) return branches[0];
    const nonBlocked = branches.filter((b) => !b.blocked);
    if (nonBlocked.length > 0) {
      const purePermissive = nonBlocked.some((b) => !b.hasLgpl);
      return {
        blocked: false,
        blockedCategories: [],
        hasLgpl: !purePermissive,
      };
    }
    return {
      blocked: true,
      blockedCategories: [...new Set(branches.flatMap((b) => b.blockedCategories))],
      hasLgpl: branches.some((b) => b.hasLgpl),
    };
  }

  function parseAnd() {
    const parts = [parseAtom()];
    while (pos < tokens.length && tokens[pos] === "AND") {
      pos += 1;
      parts.push(parseAtom());
    }
    if (parts.length === 1) return parts[0];
    const blockedCategories = [...new Set(parts.flatMap((p) => p.blockedCategories))];
    return {
      blocked: parts.some((p) => p.blocked),
      blockedCategories,
      hasLgpl: parts.some((p) => p.hasLgpl),
    };
  }

  function parseAtom() {
    if (pos < tokens.length && tokens[pos] === "(") {
      pos += 1;
      const inner = parseOr();
      if (pos < tokens.length && tokens[pos] === ")") pos += 1;
      return inner;
    }
    const words = [];
    while (
      pos < tokens.length &&
      tokens[pos] !== "(" &&
      tokens[pos] !== ")" &&
      tokens[pos] !== "AND" &&
      tokens[pos] !== "OR"
    ) {
      words.push(tokens[pos]);
      pos += 1;
    }
    const single = classifySingleLicenseToken(words.join(" "));
    return {
      blocked: single.kind === "blocked",
      blockedCategories: single.kind === "blocked" && single.matchedCategory ? [single.matchedCategory] : [],
      hasLgpl: single.kind === "lgpl",
    };
  }

  const evaluated = parseOr();
  if (evaluated.blocked) {
    return {
      status: "blocked",
      blockedCategories: evaluated.blockedCategories,
      hasLgpl: evaluated.hasLgpl,
      expression: expr,
    };
  }
  if (evaluated.hasLgpl) {
    return {
      status: "lgpl",
      blockedCategories: [],
      hasLgpl: true,
      expression: expr,
    };
  }
  return {
    status: "permissive",
    blockedCategories: [],
    hasLgpl: false,
    expression: expr,
  };
}

function collectManifestPaths(rootDir) {
  const results = [];
  const rootPkg = path.join(rootDir, "package.json");
  if (existsSync(rootPkg)) results.push("package.json");

  for (const container of WORKSPACE_CONTAINERS) {
    const dir = path.join(rootDir, container);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.posix.join(container, entry.name, "package.json");
      if (existsSync(path.join(rootDir, rel))) results.push(rel);
    }
  }
  return results;
}

function parseLockfilePackageKey(rawKey) {
  const cleaned = rawKey.trim().replace(/:$/u, "").replace(/^['"]|['"]$/gu, "");
  if (!cleaned) return null;
  const base = cleaned.split("(")[0] ?? cleaned;
  const lastAt = base.lastIndexOf("@");
  if (lastAt <= 0) return { name: base, version: "" };
  return { name: base.slice(0, lastAt), version: base.slice(lastAt + 1) };
}

function scanPnpmLockfile(lockfileText) {
  const packages = new Map();
  const peerLinks = new Map();
  const inlineLicenseEntries = [];
  const lines = lockfileText.split("\n");
  let topSection = "";
  let currentPackage = null;

  for (const line of lines) {
    if (/^[a-zA-Z]/u.test(line)) {
      topSection = line.trim();
      currentPackage = null;
      continue;
    }

    if (topSection === "packages:" || topSection === "snapshots:") {
      if (/^ {2}[^\s#]/u.test(line)) {
        const parsed = parseLockfilePackageKey(line);
        currentPackage = parsed;
        if (parsed && parsed.name) {
          const existing = packages.get(parsed.name) ?? new Set();
          if (parsed.version) existing.add(parsed.version);
          packages.set(parsed.name, existing);
          // 예: p5.brush@2.2.1(...)(p5@2.3.1) 에서 p5 경유 출처 추출
          for (const match of line.matchAll(/\(([a-z0-9@._/-]+)@([^()]+)\)/giu)) {
            const peerName = match[1];
            const peerVer = match[2];
            if (peerName && peerName !== "patch_hash") {
              const peerVers = packages.get(peerName) ?? new Set();
              peerVers.add(peerVer);
              packages.set(peerName, peerVers);
              const via = peerLinks.get(peerName) ?? new Set();
              via.add(`${parsed.name}@${parsed.version}`);
              peerLinks.set(peerName, via);
            }
          }
        }
        continue;
      }
      if (currentPackage && /^ {4}license:\s*(.+)$/u.test(line)) {
        const licMatch = line.match(/^ {4}license:\s*(.+)$/u);
        if (licMatch?.[1]) {
          inlineLicenseEntries.push({
            name: currentPackage.name,
            version: currentPackage.version,
            license: licMatch[1].trim().replace(/^['"]|['"]$/gu, ""),
          });
        }
      }
    }
  }

  return { packages, peerLinks, inlineLicenseEntries };
}

function scanInstalledNodeModules(rootDir, deepPnpmStore = false) {
  const found = new Map();
  const nodeModulesDir = path.join(rootDir, "node_modules");
  if (!existsSync(nodeModulesDir)) return found;

  const inspectPackageJson = (pkgJsonPath, sourceLabel) => {
    try {
      const parsed = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      const name = typeof parsed.name === "string" ? parsed.name : "";
      const version = typeof parsed.version === "string" ? parsed.version : "";
      if (!name) return false;
      const key = `${name}@${version}`;
      if (found.has(key)) return true;
      found.set(key, {
        name,
        version,
        license: normalizeLicenseField(parsed.license ?? parsed.licenses),
        source: sourceLabel,
      });
      return true;
    } catch {
      return false;
    }
  };

  const scanNodeModulesRoot = (nmDir, labelPrefix) => {
    let entries;
    try {
      entries = readdirSync(nmDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith("@")) {
        const scopeDir = path.join(nmDir, entry.name);
        let scoped;
        try {
          scoped = readdirSync(scopeDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const sub of scoped) {
          if (!sub.isDirectory() && !sub.isSymbolicLink()) continue;
          inspectPackageJson(
            path.join(scopeDir, sub.name, "package.json"),
            `${labelPrefix}/${entry.name}/${sub.name}`,
          );
        }
      } else {
        inspectPackageJson(
          path.join(nmDir, entry.name, "package.json"),
          `${labelPrefix}/${entry.name}`,
        );
      }
    }
  };

  const pnpmStoreDir = path.join(nodeModulesDir, ".pnpm");
  if (deepPnpmStore && existsSync(pnpmStoreDir)) {
    let storeEntries;
    try {
      storeEntries = readdirSync(pnpmStoreDir, { withFileTypes: true });
    } catch {
      storeEntries = [];
    }
    for (const entry of storeEntries) {
      if (!entry.isDirectory() || entry.name === "node_modules") continue;
      const atIdx = entry.name.indexOf("@", 1);
      if (atIdx > 0) {
        const encodedName = entry.name.slice(0, atIdx);
        const pkgRel = encodedName.startsWith("@")
          ? encodedName.replace("+", "/")
          : encodedName;
        const pkgJsonPath = path.join(pnpmStoreDir, entry.name, "node_modules", pkgRel, "package.json");
        if (inspectPackageJson(pkgJsonPath, `node_modules/.pnpm/${pkgRel}`)) {
          continue;
        }
      }
      const nestedNm = path.join(pnpmStoreDir, entry.name, "node_modules");
      if (existsSync(nestedNm)) {
        scanNodeModulesRoot(nestedNm, "node_modules/.pnpm");
      }
    }
  } else {
    scanNodeModulesRoot(nodeModulesDir, "node_modules");
  }

  return found;
}

function inspectOpenSsfWorkflow(rootDir) {
  const relPath = ".github/workflows/openssf-scorecard.yml";
  const absPath = path.join(rootDir, relPath);
  const thirdPartyNoticesPresent = existsSync(path.join(rootDir, "THIRD_PARTY_NOTICES.md"));
  const lockfilePresent = existsSync(path.join(rootDir, "pnpm-lock.yaml"));

  if (!existsSync(absPath)) {
    return {
      openssfWorkflowPresent: false,
      openssfUsesReadAll: false,
      openssfScheduleOnlyOrManual: false,
      openssfPinnedActions: false,
      openssfRetentionDaysValid: false,
      openssfSarifUploadPresent: false,
      thirdPartyNoticesPresent,
      lockfilePresent,
      status: "attention",
      notesKo: ["OpenSSF Scorecard 주간 워크플로(.github/workflows/openssf-scorecard.yml)가 아직 없습니다."],
    };
  }

  const text = readFileSync(absPath, "utf8");
  const openssfUsesReadAll = /^permissions:\s*read-all\b/mu.test(text);
  const hasSchedule = /^ {2}schedule:/mu.test(text);
  const hasDispatch = /^ {2}workflow_dispatch:/mu.test(text);
  const hasPushOrPr = /^ {2}(?:push|pull_request):/mu.test(text);
  const openssfScheduleOnlyOrManual = hasSchedule && hasDispatch && !hasPushOrPr;
  const hasConcurrency = /^concurrency:\s*$/mu.test(text) && /^ {2}group:\s*\S+/mu.test(text);
  const openssfSarifUploadPresent = /github\/codeql-action\/upload-sarif@/u.test(text);

  const usesMatches = [...text.matchAll(/uses:\s*([^\s#]+)/gu)].map((m) => m[1]);
  const openssfPinnedActions =
    usesMatches.length > 0 && usesMatches.every((ref) => /@[0-9a-f]{40}$/u.test(ref));

  const uploadBlocks = text
    .split(/(?=^ {6}- )/mu)
    .filter((block) => block.includes("actions/upload-artifact@"));
  const openssfRetentionDaysValid =
    uploadBlocks.length > 0 &&
    uploadBlocks.every((block) => {
      const m = block.match(/retention-days:\s*(\d+)/u);
      const days = m ? Number(m[1]) : 0;
      return Number.isInteger(days) && days >= 1 && days <= 7;
    });

  const notesKo = [];
  if (openssfUsesReadAll) notesKo.push("openssf-scorecard.yml에 금지된 `permissions: read-all`이 존재합니다.");
  if (!openssfScheduleOnlyOrManual) {
    notesKo.push("openssf-scorecard.yml은 주 1회 schedule + workflow_dispatch 전용이어야 합니다.");
  }
  if (!hasConcurrency) notesKo.push("openssf-scorecard.yml에 concurrency 그룹이 누락되었습니다.");
  if (!openssfPinnedActions) notesKo.push("openssf-scorecard.yml의 모든 액션은 40자리 커밋 SHA 고정이 권장됩니다.");
  if (!openssfRetentionDaysValid) notesKo.push("openssf-scorecard.yml 아티팩트 보관 기간은 7일 이하로 제한해야 합니다.");
  if (!openssfSarifUploadPresent) notesKo.push("OpenSSF Scorecard SARIF 업로드 단계가 누락되었습니다.");

  return {
    openssfWorkflowPresent: true,
    openssfUsesReadAll,
    openssfScheduleOnlyOrManual,
    openssfPinnedActions,
    openssfRetentionDaysValid,
    openssfSarifUploadPresent,
    thirdPartyNoticesPresent,
    lockfilePresent,
    status: notesKo.length === 0 ? "ready" : "attention",
    notesKo,
  };
}

/**
 * 저장소의 1인 기업 상업 라이선스·보안 태세를 평가하고 구조화된 리포트를 반환한다.
 */
export function evaluateSoloCommercialReadiness(options = {}) {
  const startedAt = performance.now();
  const rootDir = path.resolve(options.rootDir ?? DEFAULT_ROOT);
  const teamSize = Math.max(1, Math.floor(Number(options.teamSize ?? 1) || 1));
  const includeNodeModules = options.includeNodeModules !== false;
  const deepNodeModules = options.deepNodeModules === true;

  const blockers = [];
  const blockerKeys = new Set();
  const addBlocker = (item) => {
    const key = `${item.code}:${item.packageName}:${item.version}:${item.source}`;
    if (blockerKeys.has(key)) return;
    blockerKeys.add(key);
    blockers.push(item);
  };

  const remotionMap = new Map();
  const lgplMap = new Map();
  const manifestPaths = collectManifestPaths(rootDir);
  const directDeps = new Map();

  const checkBlockedPackage = (pkgName, version, source, detectedLicense = "") => {
    for (const rule of BLOCKED_PACKAGE_RULES) {
      if (!rule.match(pkgName)) continue;
      addBlocker({
        code: rule.code,
        category: rule.category,
        packageName: pkgName,
        version,
        license: detectedLicense || rule.license,
        source,
        messageKo: `${pkgName}@${version} (${source}): ${rule.reasonKo}`,
      });
    }
  };

  const checkLicenseRisk = (pkgName, version, license, source) => {
    if (!license) return;
    const evaluated = classifyLicenseExpression(license);
    if (evaluated.status === "blocked") {
      const category = evaluated.blockedCategories[0] ?? "GPL";
      addBlocker({
        code: `BLOCKED_LICENSE_${category}`,
        category,
        packageName: pkgName,
        version,
        license,
        source,
        messageKo: `${pkgName}@${version} (${source})에 상업 차단 라이선스(${license})가 감지되었습니다.`,
      });
    } else if (evaluated.status === "lgpl") {
      lgplMap.set(pkgName, { name: pkgName, version, license, source });
    }
  };

  for (const relManifest of manifestPaths) {
    const parsed = JSON.parse(readFileSync(path.join(rootDir, relManifest), "utf8"));
    const ownLicense = normalizeLicenseField(parsed.license ?? parsed.licenses);
    checkLicenseRisk(parsed.name ?? relManifest, parsed.version ?? "workspace", ownLicense, relManifest);

    for (const section of DEP_SECTIONS) {
      const deps = parsed[section];
      if (!deps || typeof deps !== "object") continue;
      for (const [depName, depVersion] of Object.entries(deps)) {
        const ver = String(depVersion);
        if (!directDeps.has(depName)) directDeps.set(depName, relManifest);
        checkBlockedPackage(depName, ver, `${relManifest} (${section})`);
        if (depName === "remotion" || depName.startsWith("@remotion/")) {
          remotionMap.set(`${depName}@${ver}`, { name: depName, version: ver, source: relManifest });
        }
      }
    }
  }

  const lockfilePath = path.join(rootDir, "pnpm-lock.yaml");
  const lockfilePresent = existsSync(lockfilePath);
  let lockfilePackages = 0;
  let lockPeerLinks = new Map();

  if (lockfilePresent) {
    const scannedLock = scanPnpmLockfile(readFileSync(lockfilePath, "utf8"));
    lockfilePackages = scannedLock.packages.size;
    lockPeerLinks = scannedLock.peerLinks;

    for (const [pkgName, versions] of scannedLock.packages.entries()) {
      const versionStr = [...versions].sort().join(", ") || "locked";
      checkBlockedPackage(pkgName, versionStr, "pnpm-lock.yaml");
      if (pkgName === "remotion" || pkgName.startsWith("@remotion/")) {
        for (const ver of versions) {
          remotionMap.set(`${pkgName}@${ver}`, { name: pkgName, version: ver, source: "pnpm-lock.yaml" });
        }
      }
      if (KNOWN_LGPL_LOCKFILE_LICENSES.has(pkgName)) {
        lgplMap.set(pkgName, {
          name: pkgName,
          version: versionStr,
          license: KNOWN_LGPL_LOCKFILE_LICENSES.get(pkgName),
          source: "pnpm-lock.yaml",
        });
      }
    }
    for (const entry of scannedLock.inlineLicenseEntries) {
      checkLicenseRisk(entry.name, entry.version || "locked", entry.license, "pnpm-lock.yaml");
    }
  }

  let nodeModulesPackagesScanned = 0;
  if (includeNodeModules) {
    const installed = scanInstalledNodeModules(rootDir, deepNodeModules);
    nodeModulesPackagesScanned = installed.size;
    for (const pkg of installed.values()) {
      checkBlockedPackage(pkg.name, pkg.version, pkg.source, pkg.license);
      checkLicenseRisk(pkg.name, pkg.version, pkg.license, pkg.source);
    }
  }

  // Remotion 3인 이하 무료 경계 평가
  const remotionPackages = [...remotionMap.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
  const remotionDetected = remotionPackages.length > 0;
  let remotionStatus = "not-installed";
  let remotionNoticeKo = "Remotion 패키지가 설치되어 있지 않습니다.";
  if (remotionDetected) {
    const pkgSummary = [...new Set(remotionPackages.map((p) => `${p.name}@${p.version}`))].join(", ");
    if (teamSize <= REMOTION_FREE_MAX_TEAM_SIZE) {
      remotionStatus = "free-solo-eligible";
      remotionNoticeKo = `Remotion(${pkgSummary}) 감지: 현재 팀 규모(${teamSize}인)는 3인 이하 무료 라이선스 경계 내입니다. 4인 이상으로 확장하기 전에 Remotion 상용 라이선스를 취득하거나 로컬 ₩0 타임랩스(WebCodecs/MediaRecorder) 경로로 전환하세요.`;
    } else {
      remotionStatus = "commercial-license-required";
      remotionNoticeKo = `Remotion(${pkgSummary}) 감지: 현재 팀 규모(${teamSize}인)가 3인 이하 무료 경계를 초과했습니다. 상용 라이선스 구매 또는 Remotion 제거가 필요합니다.`;
      addBlocker({
        code: "REMOTION_COMMERCIAL_LICENSE_REQUIRED",
        category: "REMOTION_OVER_3_SEATS",
        packageName: "remotion",
        version: remotionPackages[0]?.version ?? "installed",
        license: "Remotion License",
        source: remotionPackages[0]?.source ?? "package.json",
        messageKo: remotionNoticeKo,
      });
    }
  }

  // p5 / opencascade.js 및 기타 LGPL 패키지 상태 리포트
  const occtDocPresent = existsSync(path.join(rootDir, "docs/third-party/opencascade-lgpl.md"));
  const lgplPackages = [...lgplMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const viaPeers = lockPeerLinks.get(entry.name);
      const installedVia = directDeps.has(entry.name)
        ? `direct (${directDeps.get(entry.name)})`
        : viaPeers && viaPeers.size > 0
          ? `peer/transitive via ${[...viaPeers].sort().join(", ")}`
          : `transitive (${entry.source})`;

      if (entry.name === "opencascade.js") {
        return {
          name: entry.name,
          version: entry.version,
          license: entry.license,
          installedVia,
          boundaryDocPresent: occtDocPresent,
          status: occtDocPresent ? "tracked-lgpl-boundary" : "review-needed",
          obligationsKo: occtDocPresent
            ? "선택적 지연 로드 WASM 경계와 docs/third-party/opencascade-lgpl.md 고지 문서가 확인되었습니다(정적 링크 금지 유지)."
            : "docs/third-party/opencascade-lgpl.md 경계 문서가 누락되었습니다. 배포 전 LGPL 교체 경계 고지를 복구하세요.",
        };
      }
      if (entry.name === "p5") {
        return {
          name: entry.name,
          version: entry.version,
          license: entry.license,
          installedVia,
          boundaryDocPresent: null,
          status: "tracked-lgpl-boundary",
          obligationsKo:
            "p5.brush 피어/전이 의존성으로 유입된 LGPL-2.1 런타임입니다. 원본 무수정 번들·라이선스 고지(THIRD_PARTY_NOTICES.md) 및 동적 교체 경계를 유지하세요.",
        };
      }
      return {
        name: entry.name,
        version: entry.version,
        license: entry.license,
        installedVia,
        boundaryDocPresent: null,
        status: "tracked-lgpl-boundary",
        obligationsKo:
          "LGPL 의존성입니다. 정적 수정 링크를 피하고 THIRD_PARTY_NOTICES.md 고지를 유지하세요.",
      };
    });

  const securityPosture = inspectOpenSsfWorkflow(rootDir);
  const advisories = [];
  if (remotionDetected && remotionStatus === "free-solo-eligible") {
    advisories.push(remotionNoticeKo);
  }
  for (const lgpl of lgplPackages) {
    advisories.push(`[LGPL] ${lgpl.name}@${lgpl.version} (${lgpl.license}, ${lgpl.installedVia}): ${lgpl.obligationsKo}`);
  }
  for (const note of securityPosture.notesKo) {
    advisories.push(`[OpenSSF] ${note}`);
  }

  const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
  const ok = blockers.length === 0;
  const summaryKo = ok
    ? `1인 기업 상용 준비 통과 (${elapsedMs}ms) — 차단 위반 0건 · Remotion(${remotionStatus}) · LGPL 추적 ${lgplPackages.length}건 · OpenSSF(${securityPosture.status})`
    : `1인 기업 상용 준비 차단 (${elapsedMs}ms) — 치명 위반 ${blockers.length}건 감지`;

  return {
    schemaVersion: 1,
    ok,
    elapsedMs,
    rootDir,
    teamSize,
    summaryKo,
    scanned: {
      manifests: manifestPaths.length,
      lockfilePresent,
      lockfilePackages,
      nodeModulesPackagesScanned,
    },
    blockers,
    advisories,
    remotionBoundary: {
      detected: remotionDetected,
      packages: remotionPackages,
      freeTierMaxTeamSize: REMOTION_FREE_MAX_TEAM_SIZE,
      teamSize,
      status: remotionStatus,
      noticeKo: remotionNoticeKo,
    },
    lgplPackages,
    securityPosture,
  };
}

export function formatSoloCommercialReadinessKo(report) {
  const lines = [
    `[1인 기업 상업 라이선스·보안 태세 점검] ${report.summaryKo}`,
    `- 스캔 범위: 매니페스트 ${report.scanned.manifests}개 · lockfile 패키지 ${report.scanned.lockfilePackages}개 · 설치 패키지 ${report.scanned.nodeModulesPackagesScanned}개 (${report.elapsedMs}ms)`,
    `- Remotion 3인 경계: ${report.remotionBoundary.noticeKo}`,
  ];

  if (report.lgplPackages.length === 0) {
    lines.push("- LGPL 추적 대상: 없음");
  } else {
    lines.push("- LGPL 경계 리포트:");
    for (const pkg of report.lgplPackages) {
      lines.push(`  · ${pkg.name}@${pkg.version} (${pkg.license}) [${pkg.installedVia}] → ${pkg.obligationsKo}`);
    }
  }

  const sp = report.securityPosture;
  lines.push(
    `- OpenSSF Scorecard 태세: ${sp.status === "ready" ? "정상" : "점검 필요"} (워크플로=${sp.openssfWorkflowPresent}, read-all금지=${!sp.openssfUsesReadAll}, 주간/수동전용=${sp.openssfScheduleOnlyOrManual}, SHA고정=${sp.openssfPinnedActions}, 보관일<=7=${sp.openssfRetentionDaysValid}, SARIF=${sp.openssfSarifUploadPresent})`,
  );

  if (report.blockers.length > 0) {
    lines.push(`- 차단 위반 (${report.blockers.length}건):`);
    for (const b of report.blockers) {
      lines.push(`  ✗ [${b.category}] ${b.packageName}@${b.version} (${b.source}): ${b.messageKo}`);
    }
  }

  return lines.join("\n");
}

function parseCliArgs(argv) {
  const opts = {
    rootDir: DEFAULT_ROOT,
    teamSize: 1,
    json: false,
    outPath: null,
    includeNodeModules: true,
    deepNodeModules: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--no-node-modules") opts.includeNodeModules = false;
    else if (arg === "--deep-node-modules") opts.deepNodeModules = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--root" && argv[i + 1]) opts.rootDir = path.resolve(argv[++i]);
    else if (arg === "--team-size" && argv[i + 1]) opts.teamSize = Number(argv[++i]);
    else if (arg === "--out" && argv[i + 1]) opts.outPath = path.resolve(argv[++i]);
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    console.log(
      "사용법: node scripts/verify-solo-commercial-readiness.mjs [--json] [--out <file>] [--root <dir>] [--team-size <n>] [--no-node-modules] [--deep-node-modules]",
    );
    return 0;
  }
  const report = evaluateSoloCommercialReadiness({
    rootDir: opts.rootDir,
    teamSize: opts.teamSize,
    includeNodeModules: opts.includeNodeModules,
    deepNodeModules: opts.deepNodeModules,
  });
  if (opts.outPath) {
    mkdirSync(path.dirname(opts.outPath), { recursive: true });
    writeFileSync(opts.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatSoloCommercialReadinessKo(report));
  }
  return report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
