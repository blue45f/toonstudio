#!/usr/bin/env node
/**
 * 기술 소개 라이선스 인벤토리(apps/web/src/domains/legal/technology/engineering-license-inventory.ts)의
 * 수집·대조 스크립트. 인벤토리를 손으로 고치기 전에 이 스크립트로 실측해 차분을 확인하고 데이터에 반영한다.
 *
 * 수집 기준 (인벤토리 파일 머리말과 동일):
 * - 워크스페이스 전 패키지(루트, apps/*, packages/*, tests/integration/*)의 package.json에서
 *   직접 의존성(dependencies + optionalDependencies, workspace 내부 패키지 제외)을 뽑는다.
 * - 버전은 pnpm-lock.yaml의 importers가 고정한 resolved version(피어 접미사 제거)만 쓴다.
 *   전이 관계로만 고정된 버전은 이 표의 범위가 아니므로 넣지 않는다.
 * - 라이선스·홈페이지·저장소는 설치된 패키지의 package.json(license/homepage/repository)에서 읽는다.
 * - license 필드가 "SEE LICENSE IN <파일>" 포인터인 패키지는 그 파일의 제목을 라이선스 명으로 쓴다
 *   (LICENSE_FILE_TITLES — remotion 계열이 해당하며, 제목은 설치본 LICENSE.md에서 확인했다).
 * - devDependencies와 전이 의존성은 범위 밖이다 (전이 전체는 generate-third-party-notices.mjs 담당).
 *
 * 읽기 전용 스크립트다. 파일을 쓰지 않는다.
 *
 * 사용법:
 *   node scripts/collect-engineering-licenses.mjs           # 수집 요약 + 인벤토리와의 차분 출력
 *   node scripts/collect-engineering-licenses.mjs --json    # 수집 결과 전체를 JSON으로 출력
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INVENTORY_RELATIVE_PATH =
  "apps/web/src/domains/legal/technology/engineering-license-inventory.ts";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function workspacePackageJsonPaths(root) {
  const paths = [join(root, "package.json")];
  for (const group of ["apps", "packages"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(groupDir, entry.name, "package.json");
      if (existsSync(candidate)) paths.push(candidate);
    }
  }
  const integrationDir = join(root, "tests/integration");
  if (existsSync(integrationDir)) {
    for (const entry of readdirSync(integrationDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(integrationDir, entry.name, "package.json");
      if (existsSync(candidate)) paths.push(candidate);
    }
  }
  return paths.sort();
}

/** pnpm-lock.yaml importers에서 의존성 이름 → resolved version 집합을 뽑는다. */
export function parseLockfileResolvedVersions(lockfileText) {
  const resolved = new Map();
  let inImporters = false;
  let inDeps = false;
  let currentName = null;
  for (const line of lockfileText.split("\n")) {
    if (/^importers:\s*$/.test(line)) {
      inImporters = true;
      continue;
    }
    if (inImporters && /^\S/.test(line)) break; // 다음 최상위 키에서 종료
    if (!inImporters) continue;
    if (/^    (dependencies|optionalDependencies):\s*$/.test(line)) {
      inDeps = true;
      currentName = null;
      continue;
    }
    if (/^    \S/.test(line)) {
      inDeps = false;
      currentName = null;
      continue;
    }
    if (!inDeps) continue;
    const nameMatch = line.match(/^      ('([^']+)'|([^\s:]+)):\s*$/);
    if (nameMatch) {
      currentName = (nameMatch[2] ?? nameMatch[3]).trim();
      continue;
    }
    const versionMatch = line.match(/^        version:\s*(\S+)\s*$/);
    if (versionMatch && currentName) {
      const version = versionMatch[1].replace(/\(.*$/, "");
      if (!resolved.has(currentName)) resolved.set(currentName, new Set());
      resolved.get(currentName).add(version);
      currentName = null;
    }
  }
  return resolved;
}

export function normalizeRepository(repository) {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  if (cleaned.startsWith("http")) return cleaned;
  // npm이 허용하는 GitHub shorthand 표기: "github:owner/repo"와 "owner/repo".
  const githubShorthand = cleaned.replace(/^github:/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(githubShorthand)) {
    return `https://github.com/${githubShorthand}`;
  }
  return undefined;
}

/**
 * license 필드가 "SEE LICENSE IN <파일>" 포인터인 패키지의 실제 라이선스 명.
 * 값은 설치본 패키지의 해당 파일 제목에서 확인했다 (2026-10-07, remotion LICENSE.md 제목 "Remotion License").
 */
export const LICENSE_FILE_TITLES = {
  remotion: "Remotion License",
  "@remotion/player": "Remotion License",
};

export function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license === "object" && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses.map((entry) => entry.type).filter(Boolean).join(" OR ");
  }
  return undefined;
}

/** node_modules/.pnpm에서 name@version에 해당하는 설치본 package.json을 찾는다. */
function installedPackage(root, name, version) {
  const pnpmDir = join(root, "node_modules/.pnpm");
  if (!existsSync(pnpmDir)) return undefined;
  const dirName = `${name.replace("/", "+")}@${version}`;
  const candidates = readdirSync(pnpmDir)
    .filter((entry) => entry === dirName || entry.startsWith(`${dirName}_`))
    .sort();
  for (const candidate of candidates) {
    const pkgPath = join(pnpmDir, candidate, "node_modules", name, "package.json");
    if (existsSync(pkgPath)) return readJson(pkgPath);
  }
  return undefined;
}

export function collectEngineeringLicenses(root) {
  const packageJsonPaths = workspacePackageJsonPaths(root);
  const workspaceNames = new Set(
    packageJsonPaths.map((path) => readJson(path).name).filter(Boolean),
  );
  const declared = new Map(); // name -> Set<declaring workspace dir>
  for (const path of packageJsonPaths) {
    const pkg = readJson(path);
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const [name, specifier] of Object.entries(deps)) {
      if (typeof specifier === "string" && specifier.startsWith("workspace:")) continue;
      if (workspaceNames.has(name)) continue;
      if (!declared.has(name)) declared.set(name, new Set());
      declared.get(name).add(relative(root, join(path, "..")));
    }
  }
  const lockfileText = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  const resolved = parseLockfileResolvedVersions(lockfileText);
  const entries = [];
  for (const name of [...declared.keys()].sort()) {
    // 인벤토리의 version 표기는 importers가 고정한 직접 resolved version만 쓴다.
    const versions = [...(resolved.get(name) ?? [])].sort();
    let license;
    let homepage;
    let repository;
    let installed = false;
    for (const version of versions) {
      const pkg = installedPackage(root, name, version);
      if (!pkg) continue;
      installed = true;
      const rawLicense = licenseOf(pkg);
      license ??=
        rawLicense?.startsWith("SEE LICENSE IN") && LICENSE_FILE_TITLES[name]
          ? LICENSE_FILE_TITLES[name]
          : rawLicense;
      homepage ??= typeof pkg.homepage === "string" ? pkg.homepage : undefined;
      repository ??= normalizeRepository(pkg.repository);
    }
    entries.push({
      name,
      versions,
      license: license ?? null,
      homepage: homepage ?? repository ?? null,
      homepageSource: homepage ? "homepage" : repository ? "repository" : null,
      installed,
      declaredIn: [...declared.get(name)].sort(),
    });
  }
  return entries;
}

/** 현재 인벤토리 TS에서 name/version/license를 뽑아 수집 결과와 대조한다. */
export function inventoryDrift(entries, inventorySource) {
  const dataSection = inventorySource.slice(
    inventorySource.indexOf("ENGINEERING_LIBRARY_LICENSES"),
    inventorySource.indexOf("ENGINEERING_MODEL_ASSET_LICENSES"),
  );
  const current = new Map();
  const entryPattern = /name: "([^"]+)",\s*version: "([^"]+)",\s*license: "([^"]+)"/g;
  for (const match of dataSection.matchAll(entryPattern)) {
    current.set(match[1], { version: match[2], license: match[3] });
  }
  const collected = new Map(entries.map((entry) => [entry.name, entry]));
  const missing = [];
  const changed = [];
  for (const [name, entry] of collected) {
    const recorded = current.get(name);
    if (!recorded) {
      missing.push(name);
      continue;
    }
    const versionText = entry.versions.join(", ");
    const recordedVersions = recorded.version.split(", ").sort().join(", ");
    if (recordedVersions !== versionText || (entry.license && recorded.license !== entry.license)) {
      changed.push({
        name,
        recorded: `${recorded.version} / ${recorded.license}`,
        collected: `${versionText} / ${entry.license ?? "(미설치)"}`,
      });
    }
  }
  const extra = [...current.keys()].filter((name) => !collected.has(name));
  return { missing, changed, extra };
}

function main() {
  if (!existsSync(join(ROOT, "pnpm-lock.yaml"))) {
    console.error(
      "오류: pnpm-lock.yaml을 찾지 못했습니다. 저장소 루트에서 의존성을 설치한 뒤 다시 실행하세요. (pnpm install)",
    );
    process.exit(1);
  }
  const entries = collectEngineeringLicenses(ROOT);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }
  const byLicense = new Map();
  for (const entry of entries) {
    const key = entry.license ?? "(미설치 — 레지스트리 대조 필요)";
    byLicense.set(key, (byLicense.get(key) ?? 0) + 1);
  }
  console.log(`직접 의존성 ${entries.length}개 수집 (워크스페이스 package.json + pnpm-lock.yaml + 설치 메타데이터)`);
  for (const [license, count] of [...byLicense.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${license}: ${count}`);
  }
  const notInstalled = entries.filter((entry) => !entry.installed);
  if (notInstalled.length > 0) {
    console.log(`설치본이 없어 라이선스를 읽지 못한 항목 ${notInstalled.length}개: ${notInstalled.map((e) => e.name).join(", ")}`);
  }
  const inventoryPath = join(ROOT, INVENTORY_RELATIVE_PATH);
  if (existsSync(inventoryPath)) {
    const drift = inventoryDrift(entries, readFileSync(inventoryPath, "utf8"));
    console.log("\n인벤토리와의 차분:");
    console.log(`  인벤토리에 없는 신규 의존성: ${drift.missing.length}개${drift.missing.length ? ` — ${drift.missing.join(", ")}` : ""}`);
    console.log(`  인벤토리에만 있는 항목: ${drift.extra.length}개${drift.extra.length ? ` — ${drift.extra.join(", ")}` : ""}`);
    console.log(`  버전·라이선스가 달라진 항목: ${drift.changed.length}개`);
    for (const item of drift.changed) {
      console.log(`    ${item.name}: 기록 ${item.recorded} → 실측 ${item.collected}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
