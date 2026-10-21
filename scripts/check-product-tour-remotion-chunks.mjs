#!/usr/bin/env node
/**
 * 제품 투어 Remotion 단일 인스턴스 게이트 (백로그 G5, 2026-10-22).
 *
 * 무엇을 재는가: 프로덕션 빌드 산출물(`dist/.vite/manifest.json`) 안에서
 * `remotion`과 `@remotion/player`가 각각 **하나의 패키지 인스턴스**로만
 * 번들됐는지. PR #2373의 본질 수정은 피어 그래프 수렴(react 19.2.7/19.3.1로
 * 갈린 remotion 복사본 제거)이었고, 이 게이트는 그 회귀가 배포 빌드에서
 * 재발했는지를 매니페스트의 pnpm 인스턴스 경로로 판정한다.
 *
 * 왜 청크 파일 수가 아니라 인스턴스인가: 같은 인스턴스의 모듈이 여러 청크로
 * 나뉘는 코드 스플리팅은 정상이다. 반대로 피어 조합이 갈린 복사본은
 * `.pnpm/remotion@<버전>_<피어>/…`처럼 서로 다른 인스턴스 경로로 나타나고,
 * 그때만 <Player>가 제공하는 재생 컨텍스트를 필름 패키지 훅이 찾지 못해
 * 재생 즉시 렌더 오류(MP4 폴백)가 난다(apps/web/vite.config.ts dedupe 주석).
 *
 * 실행 지점: CI core 잡의 `build:bundle` 직후(`--require-manifest`).
 * 로컬에서는 매니페스트가 없으면 종료 코드 2로 "빌드 산출물 없음"을 알린다
 * (통과로 위장하지 않는다). 소스 측 dedupe 선언 검사는 매니페스트 없이도 돈다.
 *
 * 사용법:
 *   node scripts/check-product-tour-remotion-chunks.mjs [--require-manifest]
 *   node scripts/check-product-tour-remotion-chunks.mjs --manifest <path> [--json]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DIST_DIR, REPO_ROOT } from "./lib/repo-paths.mjs";

/** 단일 인스턴스를 강제하는 패키지. 순서는 보고 순서라 고정한다. */
export const REMOTION_SINGLE_INSTANCE_PACKAGES = Object.freeze(["remotion", "@remotion/player"]);

const VITE_CONFIG_PATH = join(REPO_ROOT, "apps/web/vite.config.ts");

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

/** 매니페스트 판정. failures가 비어 있으면 통과다. */
export function evaluateRemotionManifest(manifest) {
  const collected = collectRemotionInstances(manifest);
  const failures = [];
  const summary = [];
  for (const packageName of REMOTION_SINGLE_INSTANCE_PACKAGES) {
    const byInstance = collected.get(packageName);
    const instances = [...byInstance.keys()].sort();
    const chunkFiles = [...new Set([...byInstance.values()].flatMap((files) => [...files]))].sort();
    summary.push({ packageName, instances, chunkFiles });
    if (instances.length === 0) {
      failures.push(
        `${packageName}: 매니페스트에서 모듈을 찾지 못했습니다. 제품 투어 번들이 빠졌거나 매니페스트 형식이 바뀌었습니다.`,
      );
    } else if (instances.length > 1) {
      failures.push(
        `${packageName}: 인스턴스가 ${instances.length}개입니다 (${instances.join(", ")}). `
        + "피어 그래프가 갈린 복사본이 함께 번들되면 Remotion 재생 컨텍스트가 갈라져 MP4 폴백이 발생합니다. "
        + "pnpm-lock.yaml에서 해당 패키지의 피어 조합을 하나로 수렴하세요 (PR #2373 방식).",
      );
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

function parseArgs(argv) {
  const args = { manifest: null, requireManifest: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--require-manifest") args.requireManifest = true;
    else if (value === "--json") args.json = true;
    else if (value === "--manifest") {
      args.manifest = argv[index + 1] ?? null;
      index += 1;
    } else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`알 수 없는 인자: ${value}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "사용법: node scripts/check-product-tour-remotion-chunks.mjs [--manifest <path>] [--require-manifest] [--json]\n",
    );
    return 0;
  }

  const failures = [];

  // 1) 소스 게이트: dedupe 선언 (의존성 설치·빌드 없이도 항상 실행된다).
  if (existsSync(VITE_CONFIG_PATH)) {
    const sourceResult = evaluateViteDedupeSource(readFileSync(VITE_CONFIG_PATH, "utf8"));
    failures.push(...sourceResult.failures);
  } else {
    failures.push(`vite 설정을 찾지 못했습니다: ${VITE_CONFIG_PATH}`);
  }

  // 2) 산출물 게이트: 빌드 매니페스트의 인스턴스 수.
  const manifestPath = args.manifest
    ? resolve(args.manifest)
    : join(DIST_DIR, ".vite", "manifest.json");
  let manifestResult = null;
  if (!existsSync(manifestPath)) {
    if (args.requireManifest) {
      failures.push(
        `빌드 매니페스트가 없습니다: ${manifestPath}. 먼저 \`pnpm run build:bundle\`을 실행한 뒤 이 게이트를 실행하세요.`,
      );
    } else if (args.json) {
      manifestResult = { skipped: true, reason: "manifest-not-found", manifestPath };
    } else {
      process.stderr.write(
        `[product-tour-remotion-chunks] 빌드 매니페스트가 없어 산출물 검사를 건너뜁니다: ${manifestPath}\n`
        + "  CI에서는 build:bundle 직후 --require-manifest로 실행해 이 건너뜀을 실패로 바꿉니다.\n",
      );
    }
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      failures.push(`매니페스트를 읽지 못했습니다 (${manifestPath}): ${error.message}`);
    }
    if (manifest !== undefined) {
      manifestResult = evaluateRemotionManifest(manifest);
      failures.push(...manifestResult.failures);
    }
  }

  const report = {
    gate: "product-tour-remotion-single-instance",
    ok: failures.length === 0,
    failures,
    manifest: manifestResult,
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (failures.length === 0) {
    const detail = manifestResult?.summary
      ?.map((row) => `${row.packageName} = ${row.instances.join(", ")} (${row.chunkFiles.length}개 청크)`)
      .join(" · ");
    process.stdout.write(
      `[product-tour-remotion-chunks] 통과${detail ? ` — ${detail}` : " (소스 dedupe만 검사)"}\n`,
    );
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
