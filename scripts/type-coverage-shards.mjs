#!/usr/bin/env node
// type-coverage 전체 범위 측정 — 운영 소스 전체를 샤드로 나눠 샤드마다 별도 프로세스에서 재고 합산한다.
//
// 왜 필요한가(2026-10-15, CI 실행 38658151982):
//   `pnpm run check:type-coverage`(= type-coverage --at-least <임계값>)는 tsconfig 프로그램 전체를 한
//   프로세스에서 분석한다. 프로그램 파싱·바인딩이 힙 약 4GB이고, 분석한 소스가 늘수록 체커 캐시가
//   단조 증가한다(소스 1MB당 힙 약 55~85MB). 테스트를 포함한 13,670개 루트 파일은 힙 12.2GB에서
//   "JavaScript heap out of memory"(exit 134)로 죽었다 — 커버리지 미달이 아니라 도구 메모리 초과다.
//   그래서 PR을 막는 게이트(check:type-coverage)는 테스트를 뺀 운영 소스에서 Studio 도메인
//   (apps/web/src/domains/creator/**, 운영 소스의 약 79%)을 제외한 범위만 잰다(package.json의
//   typeCoverage 설정). 이 스크립트는 제외된 범위까지 포함한 운영 소스 전체를 잰다.
//
// 어떻게 재는가:
//   범위를 서로 겹치지 않는 샤드로 나누고, 샤드마다 type-coverage CLI를 별도 프로세스로 실행한다.
//   프로세스마다 프로그램을 새로 읽으므로 샤드당 힙은 분석한 소스 양에 비례해 약 6GB 안에 머문다.
//   CLI의 --json-output 결과(정확/전체 식별자 수)를 모두 더해 CLI와 같은 방식(소수 둘째 자리 내림)으로
//   퍼센트를 구하고, 임계값과 비교한다.
//
// 임계값은 여기 적지 않는다. package.json 의 scripts["check:type-coverage"] 에서 읽는다 — 임계값이
//   저장소 한 곳에만 있어야 로컬·CI·야간 측정이 어긋나지 않는다(scripts/type-coverage-gate-contract.test.mjs).
//
// 사용(저장소 루트, 의존성 설치 후):
//   node scripts/type-coverage-shards.mjs                      # 모든 샤드를 차례로 실행하고 합산(약 30분)
//   node scripts/type-coverage-shards.mjs --shard studio-root  # 선택한 샤드만(합산도 선택한 샤드끼리)
//   node scripts/type-coverage-shards.mjs --list               # 실행하지 않고 샤드와 CLI 인자만 출력(dry-run)
// 환경변수: TYPE_COVERAGE_HEAP_MB(샤드 프로세스 힙 상한, 기본 9000).
// 부작용: 없음(읽기 전용). 메모리를 크게 쓰므로 한 번에 하나만 실행한다.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STUDIO_DOMAIN = "apps/web/src/domains/creator";

/** 소스 양이 커서 별도 샤드로 뺀 Studio 하위 도메인(합쳐서 Studio 소스의 약 37%). */
export const STUDIO_ENGINE_DIRECTORIES = Object.freeze([
  "bg3d",
  "brush",
  "live",
  "production-hub",
  "render",
  "virtual-space",
  "vrm",
]);

const ENGINE_GLOB = `${STUDIO_DOMAIN}/{${STUDIO_ENGINE_DIRECTORIES.join(",")}}/**`;

/**
 * 서로 겹치지 않고 빠짐없이 합쳐지는 측정 샤드.
 *
 * ignoreFiles 는 type-coverage 의 --ignore-files(minimatch, 저장소 루트 기준 상대 경로)다. 샤드가
 * 분석하는 파일은 "ignoreFiles 에 하나도 걸리지 않는 파일"이다. 앞의 `!` 는 minimatch 부정이라
 * "이 패턴에 걸리지 않는 파일은 무시"를 뜻한다. core 는 null — 인자를 덮어쓰지 않고 package.json
 * 의 typeCoverage 설정(= PR 게이트가 쓰는 설정)을 그대로 쓴다.
 */
export const SHARDS = Object.freeze([
  Object.freeze({
    name: "core",
    description: "Studio 도메인 밖의 운영 소스 — pnpm run check:type-coverage 게이트의 범위",
    ignoreFiles: null,
  }),
  Object.freeze({
    name: "studio-root",
    description: "Studio 도메인 최상위 파일(studio-*.ts, Studio*.tsx 등)",
    ignoreFiles: Object.freeze([`!${STUDIO_DOMAIN}/*`]),
  }),
  Object.freeze({
    name: "studio-engines",
    description: `Studio 대형 하위 도메인(${STUDIO_ENGINE_DIRECTORIES.join(", ")})`,
    ignoreFiles: Object.freeze([`!${ENGINE_GLOB}`]),
  }),
  Object.freeze({
    name: "studio-rest",
    description: "나머지 Studio 하위 도메인",
    ignoreFiles: Object.freeze([`!${STUDIO_DOMAIN}/**`, `${STUDIO_DOMAIN}/*`, ENGINE_GLOB]),
  }),
]);

export const SHARD_NAMES = Object.freeze(SHARDS.map((shard) => shard.name));

/**
 * 저장소 상대 경로 한 개를 분석하는 샤드 이름. SHARDS 의 ignoreFiles 가 실제로 고르는 파일과
 * 같아야 한다 — 계약 테스트가 minimatch 로 모든 추적 파일에서 두 정의를 대조한다.
 */
export function shardOf(file) {
  const prefix = `${STUDIO_DOMAIN}/`;
  if (!file.startsWith(prefix)) return "core";
  const rest = file.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return "studio-root";
  return STUDIO_ENGINE_DIRECTORIES.includes(rest.slice(0, slash)) ? "studio-engines" : "studio-rest";
}

/** 임계값은 package.json 의 check:type-coverage 스크립트 한 곳에서만 읽는다. */
export function typeCoverageFloor(packageJson) {
  const script = packageJson?.scripts?.["check:type-coverage"];
  const match = typeof script === "string" ? script.match(/--at-least (\d+(?:\.\d+)?)/u) : null;
  if (!match) {
    throw new Error('package.json scripts["check:type-coverage"] 에서 --at-least 임계값을 읽을 수 없습니다');
  }
  return Number(match[1]);
}

/** 샤드 하나를 재는 type-coverage CLI 인자. 임계값(--at-least)은 넘기지 않는다 — 합산 뒤에 비교한다. */
export function shardArguments(shard) {
  const args = ["--json-output"];
  for (const pattern of shard.ignoreFiles ?? []) args.push("--ignore-files", pattern);
  return args;
}

/** NODE_OPTIONS 의 기존 힙 상한을 지우고 요청한 값으로 바꾼다(다른 옵션은 보존). */
export function withHeapLimit(nodeOptions, heapMegabytes) {
  const kept = (nodeOptions ?? "")
    .split(/\s+/u)
    .filter((option) => option !== "" && !option.startsWith("--max-old-space-size"));
  return [...kept, `--max-old-space-size=${heapMegabytes}`].join(" ");
}

/** CLI(type-coverage)와 같은 방식 — 정확/전체 비율을 소수 둘째 자리에서 내림한다. */
export function summarize(results, floor) {
  const correctCount = results.reduce((sum, result) => sum + result.correctCount, 0);
  const totalCount = results.reduce((sum, result) => sum + result.totalCount, 0);
  const percent = totalCount === 0 ? 0 : Math.floor((10000 * correctCount) / totalCount) / 100;
  return { correctCount, totalCount, percent, passed: totalCount > 0 && percent >= floor };
}

function parseHeapMegabytes(raw) {
  const value = Number(raw ?? 9000);
  if (!Number.isInteger(value) || value < 2048) {
    throw new Error(`TYPE_COVERAGE_HEAP_MB 는 2048 이상의 정수여야 합니다: ${String(raw)}`);
  }
  return value;
}

function parseCliArguments(argv) {
  const selected = [];
  let list = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--list" || argument === "--dry-run") {
      list = true;
    } else if (argument === "--shard") {
      const name = argv[index + 1];
      if (!SHARD_NAMES.includes(name)) {
        throw new Error(`알 수 없는 샤드: ${String(name)} (사용 가능: ${SHARD_NAMES.join(", ")})`);
      }
      selected.push(name);
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자: ${argument}`);
    }
  }
  return { list, selected: selected.length > 0 ? selected : [...SHARD_NAMES] };
}

function typeCoverageBin(root) {
  return createRequire(resolve(root, "package.json")).resolve("type-coverage/bin/type-coverage");
}

function measureShard(shard, { root, heapMegabytes }) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [typeCoverageBin(root), ...shardArguments(shard)], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: withHeapLimit(process.env.NODE_OPTIONS, heapMegabytes) },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = String(result.stdout ?? "").trim().slice(-500);
    throw new Error(
      `샤드 ${shard.name} 측정이 실패했습니다(종료 코드 ${String(result.status ?? result.signal)}, ${seconds}초). `
      + "종료 코드 134 는 힙 부족이므로 TYPE_COVERAGE_HEAP_MB 를 올리거나 샤드를 더 잘게 나눕니다."
      + (output === "" ? "" : `\n${output}`),
    );
  }
  const text = result.stdout;
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (!Number.isFinite(parsed.correctCount) || !Number.isFinite(parsed.totalCount)) {
    throw new Error(`샤드 ${shard.name} 의 type-coverage 출력에 식별자 수가 없습니다`);
  }
  return { name: shard.name, correctCount: parsed.correctCount, totalCount: parsed.totalCount, seconds };
}

function formatShardLine(result) {
  const percent = result.totalCount === 0
    ? "-"
    : `${(Math.floor((10000 * result.correctCount) / result.totalCount) / 100).toFixed(2)}%`;
  return `  ${result.name.padEnd(15)} (${result.correctCount} / ${result.totalCount}) ${percent}  ${result.seconds}초`;
}

export function main(argv, { root = resolve(dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const { list, selected } = parseCliArguments(argv);
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const floor = typeCoverageFloor(packageJson);
  const shards = SHARDS.filter((shard) => selected.includes(shard.name));

  if (list) {
    for (const shard of shards) {
      console.log(`${shard.name}\t${shard.description}\ttype-coverage ${shardArguments(shard).join(" ")}`);
    }
    return 0;
  }

  const heapMegabytes = parseHeapMegabytes(process.env.TYPE_COVERAGE_HEAP_MB);
  console.log(`type-coverage 샤드 측정: ${shards.map((shard) => shard.name).join(", ")} (샤드당 힙 ${heapMegabytes}MB, 임계값 ${floor}%)`);
  const results = [];
  for (const shard of shards) {
    console.log(`- ${shard.name}: ${shard.description}`);
    const result = measureShard(shard, { root, heapMegabytes });
    results.push(result);
    console.log(formatShardLine(result));
  }

  const summary = summarize(results, floor);
  const label = shards.length === SHARDS.length ? "전체 범위" : `선택한 샤드(${shards.map((shard) => shard.name).join(", ")})`;
  console.log(`${label}: (${summary.correctCount} / ${summary.totalCount}) ${summary.percent.toFixed(2)}%`);
  if (!summary.passed) {
    console.error(`type-coverage 비율(${summary.percent.toFixed(2)}%)이 임계값(${floor}%)보다 낮습니다.`);
    return 1;
  }
  console.log("type-coverage success.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
