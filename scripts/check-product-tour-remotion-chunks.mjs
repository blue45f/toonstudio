#!/usr/bin/env node
/**
 * 제품 투어 Remotion 단일 인스턴스 게이트 (백로그 G5, 2026-10-22 개정).
 *
 * 무엇을 막는가: `remotion`과 `@remotion/player`의 **피어 조합이 갈린 복사본**이
 * 함께 번들되는 사고. PR #2373이 고친 장애 모양이다 — react 19.2.7/19.3.1로 갈린
 * 두 복사본이 공존하면 <Player>가 제공하는 재생 컨텍스트를 필름 패키지 훅이 찾지
 * 못해 재생 즉시 렌더 오류(MP4 폴백)가 난다(apps/web/vite.config.ts dedupe 주석).
 *
 * 무엇으로 재는가 — 세 겹:
 *  1. 소스: vite.config.ts의 resolve.dedupe가 두 패키지를 선언하는지.
 *  2. 의존성 그래프: pnpm-lock.yaml의 snapshots에서 두 패키지의 인스턴스(피어
 *     조합마다 하나인 스냅샷)가 각각 정확히 하나인지. 번들러가 묶을 수 있는
 *     복사본은 설치된 인스턴스를 넘지 못하므로 스냅샷이 하나면 번들에 복사본이
 *     둘 생길 수 없다. 스냅샷이 둘이면 dedupe가 하나로 모으더라도 #2373 사고의
 *     재료이므로 실패로 본다.
 *  3. 산출물: 빌드 매니페스트(`dist/.vite/manifest.json`)에 제품 투어 페이지
 *     진입점이 있는지, 그리고 매니페스트에 모듈 경로로 드러난 인스턴스가 패키지당
 *     둘 이상이 아닌지.
 *
 * 왜 매니페스트로 청크 안의 인스턴스를 세지 않는가 (초판의 결함, 2026-10-22 규명):
 * Vite 매니페스트는 진입점·동적 import 대상·공유 청크만 적고, 청크 안에 묶인
 * 모듈의 경로는 적지 않는다. 제품 투어 페이지(ProductTourPage)는 ProductTourPlayer를
 * 거쳐 리모션을 정적으로 import하므로 리모션은 ProductTourPage 청크 안에 묶이고
 * 매니페스트에 모듈 경로로 나타나지 않는다. 초판은 "매니페스트 키에
 * `.pnpm/remotion@…/` 경로가 있다"는 가정 위에 있었는데, 그 가정은 리모션이 동적
 * import 대상일 때만 성립한다. 그래서 실빌드에서는 항상 "모듈을 찾지 못했습니다"로
 * 실패했다. 제품 투어 번들이 빠진 것이 아니다(같은 CI 빌드에 ProductTourPage 청크가
 * 있다). 청크 안의 복사본을 직접 세려면 번들 단계에서 모듈 목록을 내보내야 하는데
 * 빌드 파이프라인을 바꾸는 일이라 이 게이트의 범위 밖이다.
 *
 * 실행 지점: CI core 잡의 `build:bundle` 직후(`--require-manifest`).
 * 소스·lockfile 검사는 빌드 없이도 항상 돈다. 매니페스트가 없으면 산출물 검사만
 * 건너뛰고(종료 0) `--require-manifest`에서는 실패(종료 1)로 바꾼다.
 *
 * 사용법:
 *   node scripts/check-product-tour-remotion-chunks.mjs [--require-manifest]
 *   node scripts/check-product-tour-remotion-chunks.mjs --manifest <path> [--lockfile <path>] [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DIST_DIR, REPO_ROOT } from "./lib/repo-paths.mjs";

/** 단일 인스턴스를 강제하는 패키지. 순서는 보고 순서라 고정한다. */
export const REMOTION_SINGLE_INSTANCE_PACKAGES = Object.freeze(["remotion", "@remotion/player"]);

/**
 * 매니페스트에서 제품 투어 페이지 진입점을 찾는 패턴. 라우트가 ProductTourPage를
 * 지연 로드하므로 매니페스트에는 `src/domains/marketing/ProductTourPage.tsx` 키의
 * 동적 진입점으로 나타난다. 파일 이름이나 위치가 바뀌면 이 패턴을 함께 고친다.
 */
export const PRODUCT_TOUR_ENTRY_PATTERN = /(?:^|\/)ProductTourPage\.tsx$/u;

const VITE_CONFIG_PATH = join(REPO_ROOT, "apps/web/vite.config.ts");
const LOCKFILE_PATH = join(REPO_ROOT, "pnpm-lock.yaml");

/**
 * 모듈 id에서 패키지 인스턴스 식별자를 뽑는다.
 * - pnpm 경로: `.pnpm/<인스턴스>/node_modules/<pkg>/…` → `<인스턴스>`
 *   (예: `remotion@4.0.536_react@19.3.1`, `@remotion+player@4.0.536_react@19.3.1`)
 * - 일반 경로: `node_modules/<pkg>/…` → `<pkg>@plain`
 * 해당 패키지의 모듈이 아니면 null.
 */
export function extractPackageInstanceId(moduleId, packageName) {
  if (typeof moduleId !== "string" || moduleId.length === 0) return null;
  // 앞에 슬래시를 붙여 "node_modules/…"로 시작하는 상대 경로도 같은 규칙으로 본다.
  const normalized = `/${moduleId.replaceAll("\\", "/").replace(/^\/+/, "")}`;
  const needle = `/node_modules/${packageName}/`;
  const at = normalized.lastIndexOf(needle);
  if (at < 0) return null;
  const pnpmMarker = "/.pnpm/";
  const pnpmAt = normalized.lastIndexOf(pnpmMarker, at);
  if (pnpmAt >= 0) {
    const instance = normalized.slice(pnpmAt + pnpmMarker.length, at).split("/").pop() ?? "";
    return instance.length > 0 ? instance : `${packageName}@unknown`;
  }
  return `${packageName}@plain`;
}

/**
 * Vite 매니페스트를 패키지별 {인스턴스 → 청크 파일 집합}으로 접는다.
 * 매니페스트 항목의 key와 `src` 양쪽을 모듈 id 후보로 본다.
 *
 * 여기에 잡히는 것은 매니페스트에 **모듈 경로로 적힌** 인스턴스뿐이다. 리모션을
 * 정적으로 import하는 현행 구조에서는 청크 안에 묶여 아무것도 잡히지 않는 것이
 * 정상이다(파일 머리말 참고).
 */
export function collectRemotionInstances(manifest) {
  const collected = new Map(
    REMOTION_SINGLE_INSTANCE_PACKAGES.map((name) => [name, new Map()]),
  );
  if (manifest === null || typeof manifest !== "object") return collected;
  for (const [key, entry] of Object.entries(manifest)) {
    if (entry === null || typeof entry !== "object") continue;
    const chunkFile = typeof entry.file === "string" ? entry.file : "(unknown chunk)";
    const moduleIds = [key, typeof entry.src === "string" ? entry.src : ""];
    for (const packageName of REMOTION_SINGLE_INSTANCE_PACKAGES) {
      const byInstance = collected.get(packageName);
      for (const moduleId of moduleIds) {
        const instanceId = extractPackageInstanceId(moduleId, packageName);
        if (instanceId === null) continue;
        const files = byInstance.get(instanceId) ?? new Set();
        files.add(chunkFile);
        byInstance.set(instanceId, files);
      }
    }
  }
  return collected;
}

/** 매니페스트에서 제품 투어 페이지 진입점 {key, file}을 찾는다. 없으면 null. */
export function findProductTourEntry(manifest) {
  if (manifest === null || typeof manifest !== "object") return null;
  for (const [key, entry] of Object.entries(manifest)) {
    if (entry === null || typeof entry !== "object") continue;
    if (typeof entry.file !== "string" || entry.file.length === 0) continue;
    const ids = [key, typeof entry.src === "string" ? entry.src : ""];
    if (ids.some((id) => PRODUCT_TOUR_ENTRY_PATTERN.test(id))) return { key, file: entry.file };
  }
  return null;
}

/** 중복 인스턴스 실패 문구. 매니페스트·lockfile 판정이 같은 안내를 쓴다. */
function duplicateInstanceFailure(packageName, instances) {
  return `${packageName}: 인스턴스가 ${instances.length}개입니다 (${instances.join(", ")}). `
    + "피어 그래프가 갈린 복사본이 함께 번들되면 Remotion 재생 컨텍스트가 갈라져 MP4 폴백이 발생합니다. "
    + "pnpm-lock.yaml에서 해당 패키지의 피어 조합을 하나로 수렴하세요 (PR #2373 방식).";
}

/**
 * 매니페스트 판정. failures가 비어 있으면 통과다.
 * - 제품 투어 페이지 진입점이 없으면 실패한다(번들이 빠졌거나 진입점 이름이 바뀜).
 * - 매니페스트에 모듈 경로로 드러난 인스턴스가 패키지당 둘 이상이면 실패한다.
 *   하나도 드러나지 않는 것은 실패가 아니다: 정적으로 번들된 모듈은 매니페스트에
 *   적히지 않는다. 그 경우의 단일 인스턴스 보증은 lockfile 판정이 맡는다.
 */
export function evaluateRemotionManifest(manifest) {
  const failures = [];
  const tourEntry = findProductTourEntry(manifest);
  if (tourEntry === null) {
    failures.push(
      "제품 투어 페이지 진입점(ProductTourPage.tsx)을 매니페스트에서 찾지 못했습니다. "
      + "제품 투어 번들이 빠졌거나 진입점 이름·경로가 바뀌었습니다. 후자라면 PRODUCT_TOUR_ENTRY_PATTERN을 고치세요.",
    );
  }
  const collected = collectRemotionInstances(manifest);
  const summary = [];
  for (const packageName of REMOTION_SINGLE_INSTANCE_PACKAGES) {
    const byInstance = collected.get(packageName);
    const instances = [...byInstance.keys()].sort();
    const chunkFiles = [...new Set([...byInstance.values()].flatMap((files) => [...files]))].sort();
    summary.push({ packageName, instances, chunkFiles });
    if (instances.length > 1) failures.push(duplicateInstanceFailure(packageName, instances));
  }
  return { ok: failures.length === 0, failures, summary, tourEntry };
}

/**
 * pnpm-lock.yaml(v9)의 snapshots 섹션에서 패키지별 인스턴스 키를 모은다.
 * 스냅샷 키는 `<이름>@<버전>(<피어 조합>)`이라 피어 조합이 다르면 다른 인스턴스다.
 * packages 섹션(`<이름>@<버전>`)은 인스턴스가 아니므로 읽지 않는다.
 */
export function collectLockfileRemotionInstances(lockfileText) {
  const collected = new Map(
    REMOTION_SINGLE_INSTANCE_PACKAGES.map((name) => [name, new Set()]),
  );
  if (typeof lockfileText !== "string") return collected;
  let inSnapshots = false;
  for (const line of lockfileText.split(/\r?\n/u)) {
    if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("#")) {
      inSnapshots = line.trimEnd() === "snapshots:";
      continue;
    }
    if (!inSnapshots) continue;
    // 스냅샷 키는 정확히 두 칸 들여쓴 줄이다. 더 깊은 들여쓰기는 키의 속성이다.
    const rawKey = /^ {2}(\S.*?):(?: \{\})?\s*$/u.exec(line)?.[1];
    if (rawKey === undefined) continue;
    const key = rawKey.replace(/^(['"])(.*)\1$/u, "$2");
    for (const packageName of REMOTION_SINGLE_INSTANCE_PACKAGES) {
      if (key.startsWith(`${packageName}@`)) collected.get(packageName).add(key);
    }
  }
  return collected;
}

/** lockfile 판정. 패키지당 스냅샷 인스턴스가 정확히 하나여야 통과다. */
export function evaluateLockfileRemotionInstances(lockfileText) {
  const collected = collectLockfileRemotionInstances(lockfileText);
  const failures = [];
  const summary = [];
  for (const packageName of REMOTION_SINGLE_INSTANCE_PACKAGES) {
    const instances = [...collected.get(packageName)].sort();
    summary.push({ packageName, instances });
    if (instances.length === 0) {
      failures.push(
        `${packageName}: pnpm-lock.yaml의 snapshots에서 찾지 못했습니다. `
        + "제품 투어가 이 패키지에 의존하는지, lockfile이 최신인지 확인하세요.",
      );
    } else if (instances.length > 1) {
      failures.push(duplicateInstanceFailure(packageName, instances));
    }
  }
  return { ok: failures.length === 0, failures, summary };
}

/** 소스 측 dedupe 선언이 유지되는지. vite.config.ts의 dedupe 배열만 본다. */
export function evaluateViteDedupeSource(sourceText) {
  const failures = [];
  const dedupeMatch = /dedupe:\s*\[([^\]]*)\]/u.exec(sourceText);
  if (!dedupeMatch) {
    failures.push("apps/web/vite.config.ts에서 resolve.dedupe 선언을 찾지 못했습니다.");
    return { ok: false, failures };
  }
  for (const packageName of REMOTION_SINGLE_INSTANCE_PACKAGES) {
    if (!dedupeMatch[1].includes(`"${packageName}"`)) {
      failures.push(`apps/web/vite.config.ts의 dedupe에 "${packageName}"가 없습니다.`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/**
 * 세 겹 판정을 한 번에 돌린다(입출력 없음). 입력이 undefined인 겹은 건너뛴다.
 * manifest가 null이면 산출물 검사를 건너뛴 것으로 본다.
 */
export function evaluateProductTourGate({ viteConfigText, lockfileText, manifest }) {
  const failures = [];
  const dedupeResult = viteConfigText === undefined ? null : evaluateViteDedupeSource(viteConfigText);
  const lockfileResult = lockfileText === undefined ? null : evaluateLockfileRemotionInstances(lockfileText);
  const manifestResult = manifest === undefined || manifest === null ? null : evaluateRemotionManifest(manifest);
  for (const result of [dedupeResult, lockfileResult, manifestResult]) {
    if (result !== null) failures.push(...result.failures);
  }
  return { ok: failures.length === 0, failures, dedupe: dedupeResult, lockfile: lockfileResult, manifest: manifestResult };
}

function parseArgs(argv) {
  const args = { manifest: null, lockfile: null, requireManifest: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--require-manifest") args.requireManifest = true;
    else if (value === "--json") args.json = true;
    else if (value === "--manifest") {
      args.manifest = argv[index + 1] ?? null;
      index += 1;
    } else if (value === "--lockfile") {
      args.lockfile = argv[index + 1] ?? null;
      index += 1;
    } else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`알 수 없는 인자: ${value}`);
  }
  return args;
}

/** 통과 시 한 줄 요약. 무엇을 실제로 쟀는지 드러내 빈 통과로 읽히지 않게 한다. */
function describePass(result) {
  const parts = [];
  if (result.dedupe?.ok) parts.push("vite dedupe 선언 유지");
  if (result.lockfile) {
    parts.push(`lockfile: ${result.lockfile.summary.map((row) => `${row.packageName} ${row.instances.length}개`).join(", ")}`);
  }
  if (result.manifest) {
    parts.push(`제품 투어 진입점: ${result.manifest.tourEntry?.file ?? "(없음)"}`);
    const visible = result.manifest.summary.filter((row) => row.instances.length > 0);
    parts.push(
      visible.length === 0
        ? "매니페스트에 드러난 모듈 경로: 없음(정적 번들은 매니페스트에 적히지 않음)"
        : `매니페스트에 드러난 모듈 경로: ${visible.map((row) => `${row.packageName} = ${row.instances.join(", ")}`).join(" · ")}`,
    );
  }
  return parts.length > 0 ? ` — ${parts.join(" · ")}` : " (소스 dedupe만 검사)";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "사용법: node scripts/check-product-tour-remotion-chunks.mjs [--manifest <path>] [--lockfile <path>] [--require-manifest] [--json]\n",
    );
    return 0;
  }

  const ioFailures = [];

  // 1) 소스 게이트: dedupe 선언 (의존성 설치·빌드 없이도 항상 실행된다).
  let viteConfigText;
  if (existsSync(VITE_CONFIG_PATH)) viteConfigText = readFileSync(VITE_CONFIG_PATH, "utf8");
  else ioFailures.push(`vite 설정을 찾지 못했습니다: ${VITE_CONFIG_PATH}`);

  // 2) 의존성 그래프 게이트: lockfile의 인스턴스 수 (역시 빌드가 필요 없다).
  const lockfilePath = args.lockfile ? resolve(args.lockfile) : LOCKFILE_PATH;
  let lockfileText;
  if (existsSync(lockfilePath)) lockfileText = readFileSync(lockfilePath, "utf8");
  else ioFailures.push(`pnpm lockfile을 찾지 못했습니다: ${lockfilePath}`);

  // 3) 산출물 게이트: 빌드 매니페스트.
  const manifestPath = args.manifest
    ? resolve(args.manifest)
    : join(DIST_DIR, ".vite", "manifest.json");
  let manifest = null;
  let manifestSkipped = null;
  if (!existsSync(manifestPath)) {
    if (args.requireManifest) {
      ioFailures.push(
        `빌드 매니페스트가 없습니다: ${manifestPath}. 먼저 \`pnpm run build:bundle\`을 실행한 뒤 이 게이트를 실행하세요.`,
      );
    } else if (args.json) {
      manifestSkipped = { skipped: true, reason: "manifest-not-found", manifestPath };
    } else {
      process.stderr.write(
        `[product-tour-remotion-chunks] 빌드 매니페스트가 없어 산출물 검사를 건너뜁니다: ${manifestPath}\n`
        + "  CI에서는 build:bundle 직후 --require-manifest로 실행해 이 건너뜀을 실패로 바꿉니다.\n",
      );
    }
  } else {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      ioFailures.push(`매니페스트를 읽지 못했습니다 (${manifestPath}): ${error.message}`);
    }
  }

  const result = evaluateProductTourGate({ viteConfigText, lockfileText, manifest });
  const failures = [...ioFailures, ...result.failures];

  const report = {
    gate: "product-tour-remotion-single-instance",
    ok: failures.length === 0,
    failures,
    lockfile: result.lockfile,
    manifest: result.manifest ?? manifestSkipped,
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (failures.length === 0) {
    process.stdout.write(`[product-tour-remotion-chunks] 통과${describePass(result)}\n`);
  } else {
    for (const failure of failures) {
      process.stderr.write(`[product-tour-remotion-chunks] 실패 — ${failure}\n`);
    }
  }
  return failures.length === 0 ? 0 : 1;
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`[product-tour-remotion-chunks] 실행 오류 — ${error.message}\n`);
    process.exitCode = 2;
  }
}
