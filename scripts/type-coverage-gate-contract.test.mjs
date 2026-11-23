import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SHARDS,
  SHARD_NAMES,
  STUDIO_DOMAIN,
  STUDIO_ENGINE_DIRECTORIES,
  STUDIO_REST_MAX_SOURCE_BYTES,
  executionShards,
  inventoryStudioRestFiles,
  selectShards,
  shardArguments,
  shardOf,
  splitStudioRest,
  summarize,
  typeCoverageFloor,
  withHeapLimit,
} from "./type-coverage-shards.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const ciSource = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const rootTsconfig = JSON.parse(
  readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"),
);
const scopeTsconfig = JSON.parse(
  readFileSync(new URL("../tsconfig.type-coverage.json", import.meta.url), "utf8"),
);

const jobs = ciSource
  .slice(ciSource.indexOf("\njobs:\n") + 7)
  .split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

// The ratchet floor lives in exactly one place: the check:type-coverage
// script. The CI step must call that script, never a second copy of the
// threshold, so the number cannot drift between local and CI runs.
const EXPECTED_SCRIPT = "type-coverage --at-least 95";
const EXPECTED_VERSION = "2.31.2";

test("type-coverage is a pinned dev-only dependency", () => {
  assert.equal(packageJson.devDependencies?.["type-coverage"], EXPECTED_VERSION);
  assert.equal(packageJson.dependencies?.["type-coverage"], undefined);
});

test("the ratchet script fixes the typed-identifier floor at 95 percent", () => {
  assert.equal(packageJson.scripts?.["check:type-coverage"], EXPECTED_SCRIPT);
  const atLeast = Number(EXPECTED_SCRIPT.match(/--at-least (\d+(?:\.\d+)?)/u)?.[1]);
  assert.ok(atLeast >= 95, "floor must not silently drop below the adopted baseline");
});

test("the core typecheck job enforces the ratchet after installing", () => {
  const typecheck = job("typecheck");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  const typecheckRun = typecheck.indexOf("pnpm run typecheck\n");
  const gate = typecheck.indexOf("pnpm run check:type-coverage");
  assert.ok(install >= 0, "typecheck job must install dependencies first");
  assert.ok(typecheckRun > install, "typecheck must run after install");
  assert.ok(gate > typecheckRun, "type-coverage gate must run after the typecheck");
  assert.doesNotMatch(typecheck, /type-coverage --at-least/, "threshold must not be duplicated in the workflow");
});

test("the preflight wiring runs this contract before installing", () => {
  const typecheck = job("typecheck");
  const contract = typecheck.indexOf("scripts/type-coverage-gate-contract.test.mjs");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  assert.ok(contract >= 0, "preflight must execute the type-coverage contract test");
  assert.ok(contract < install, "contract tests run before dependency installation");
});

// ── 측정 범위(2026-10-15) ────────────────────────────────────────────────────
// CI 실행 38658151982 에서 type-coverage 는 루트 tsconfig.json 프로그램 전체(루트 파일 13,670개,
// 그중 테스트 5,781개)를 읽다가 힙 12.2GB 에서 "JavaScript heap out of memory"(exit 134)로 죽었다.
// 커버리지 미달이 아니라 도구 메모리 초과였다. 임계값과 스크립트 문자열은 그대로 두고(위 계약),
// PR 게이트(pnpm run check:type-coverage)의 측정 범위만 package.json 의 typeCoverage 로 좁혔다:
//
//   이전 범위: tsconfig.json 의 모든 루트 파일(운영 소스 + 테스트) — 힙 12GB 에서도 완주하지 못했다.
//   현재 범위: (1) 같은 프로그램에서 테스트 파일(*.test|spec.*, __tests__/, apps/web/tests/)을 뺀
//              tsconfig.type-coverage.json, (2) 그 위에서 Studio 도메인(apps/web/src/domains/creator/**)은
//              분석(ignoreFiles)에서 뺀다.
//   제외분 측정: pnpm run check:type-coverage:full(scripts/type-coverage-shards.mjs)이 제외분까지
//              포함한 운영 소스 전체를 샤드로 나눠 잰 뒤 합산하고, 야간 진단이 매일 실행한다.
//
// 왜 두 단계인가: 테스트를 빼도 운영 소스만 100MB 라 한 프로세스에는 부족했다(힙 9GB 에서 19분 만에
// OOM). 프로그램 파싱·바인딩이 힙 약 4GB 이고, 분석한 소스가 늘수록 체커 캐시가 단조 증가한다.
// Studio 도메인이 운영 소스의 79%(79.5MB, 5,896파일)라 단독으로 힙 약 5GB·20분 이상이 더 든다.
// 그 밖의 전부(소스 약 21MB)는 한 프로세스에서 힙 약 6GB·5분 안팎에 끝난다.
//
// 범위를 넓히는 방향의 변경은 자유지만, 소스를 몰래 빼서 숫자를 올리는 일은 막아야 하므로
// 아래 테스트가 "추가 제외는 테스트 전용 8개, 분석 제외는 Studio 도메인 하나뿐"임을 고정한다.
// 목록을 바꾸려면 이 목록과 근거(커밋 본문의 이전·현재 범위와 측정값)를 함께 바꿔야 한다.
const SCOPE_PROJECT = "tsconfig.type-coverage.json";
const SCOPE_IGNORED_FILES = ["apps/web/src/domains/creator/**"];
const TEST_ONLY_EXCLUDES = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.mts",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.mts",
  "**/__tests__/**",
  "apps/web/tests/**",
];

test("the type-coverage config selects only the scope, never a second floor or a relaxed metric", () => {
  // typeCoverage.atLeast / is 가 있으면 CLI 인자(--at-least)와 임계값이 두 곳에 생긴다.
  // ignoreCatch·ignoreAsAssertion·strict 같은 플래그도 지표 정의를 조용히 바꾼다.
  // 허용 키는 범위를 정하는 project 와 ignoreFiles 둘뿐이다.
  assert.deepEqual(Object.keys(packageJson.typeCoverage ?? {}), ["project", "ignoreFiles"]);
  assert.equal(packageJson.typeCoverage.project, SCOPE_PROJECT);
  assert.deepEqual(packageJson.typeCoverage.ignoreFiles, SCOPE_IGNORED_FILES);
});

test("the scope config extends the root program and only adds test-file exclusions", () => {
  assert.equal(scopeTsconfig.extends, "./tsconfig.json");
  assert.equal(scopeTsconfig.include, undefined, "include is inherited so new source roots are measured");
  assert.equal(scopeTsconfig.files, undefined, "files must not narrow the measured program");
  // 컴파일러 옵션은 증분 산출물을 끄는 두 가지뿐이어야 한다(엄격도·lib·paths 를 바꾸지 않는다).
  assert.deepEqual(scopeTsconfig.compilerOptions, { incremental: false, noEmit: true });

  const rootExclude = rootTsconfig.exclude ?? [];
  const scopeExclude = scopeTsconfig.exclude ?? [];
  // tsconfig 상속은 exclude 를 병합하지 않고 통째로 덮어쓴다. 루트의 제외 항목을 앞에 그대로 복제하고,
  // 그 뒤에 테스트 전용 항목만 붙는다.
  assert.deepEqual(scopeExclude.slice(0, rootExclude.length), rootExclude);
  assert.deepEqual(scopeExclude.slice(rootExclude.length), TEST_ONLY_EXCLUDES);
});

if (process.env.VITEST) {
  // 설치된 TypeScript 가 필요하므로 의존성 설치 전(preflight node --test)에는 등록하지 않고,
  // 설치 뒤 vitest 샤드에서 실제 파일 집합으로 같은 사실을 한 번 더 확인한다.
  test("the scope program differs from the root program by test files only", async () => {
    const { default: ts } = await import("typescript");
    const { dirname, relative, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

    const rootFiles = (configName) => {
      const configPath = resolve(root, configName);
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      assert.equal(read.error, undefined);
      const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
      return new Set(parsed.fileNames.map((file) => relative(root, file)));
    };
    const isTestFile = (file) =>
      /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)
      || /(?:^|\/)__tests__\//u.test(file)
      || file.startsWith("apps/web/tests/");

    const full = rootFiles("tsconfig.json");
    const scoped = rootFiles(SCOPE_PROJECT);

    const added = [...scoped].filter((file) => !full.has(file));
    const removed = [...full].filter((file) => !scoped.has(file));
    const leftoverTests = [...scoped].filter(isTestFile);
    const removedSources = removed.filter((file) => !isTestFile(file));

    assert.deepEqual(added, [], "the scope program must not add files");
    assert.deepEqual(removedSources, [], "only test files may leave the measured scope");
    assert.deepEqual(leftoverTests, [], "no test file may remain in the measured scope");
    assert.ok(removed.length > 0, "the scope config must actually remove the test files");
  });
}

// ── 전체 범위 샤드 측정(scripts/type-coverage-shards.mjs) ────────────────────
// PR 게이트에서 빠진 Studio 도메인이 아무 데서도 측정되지 않는 상태로 굳지 않도록,
// 제외분까지 포함한 운영 소스 전체를 샤드 합산으로 재는 경로를 같은 계약 안에서 고정한다.
const shardScript = fileURLToPath(new URL("./type-coverage-shards.mjs", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("the full-scope runner reads its floor from the single ratchet script", () => {
  assert.equal(typeCoverageFloor(packageJson), 95);
  assert.throws(() => typeCoverageFloor({ scripts: { "check:type-coverage": "type-coverage" } }), /임계값/u);
  assert.throws(() => typeCoverageFloor({}), /임계값/u);
  // 임계값 숫자를 러너 소스에 복제하면 두 곳이 어긋난다.
  const runnerSource = readFileSync(shardScript, "utf8");
  assert.doesNotMatch(runnerSource, /--at-least \d/u);
  assert.doesNotMatch(runnerSource, /\b95\b/u);
});

test("the core shard is exactly the PR gate scope and Studio is split into disjoint shards", () => {
  assert.deepEqual(SHARD_NAMES, ["core", "studio-root", "studio-engines", "studio-rest"]);
  const core = SHARDS.find((shard) => shard.name === "core");
  // core 는 CLI 인자를 덮어쓰지 않아 package.json 의 typeCoverage(= PR 게이트 설정)를 그대로 쓴다.
  assert.equal(core?.ignoreFiles, null);
  assert.deepEqual(shardArguments(core), ["--json-output"]);
  assert.deepEqual(packageJson.typeCoverage.ignoreFiles, [`${STUDIO_DOMAIN}/**`]);
  // Studio 샤드는 임계값을 넘기지 않고(합산 뒤 한 번만 비교) 무시 패턴만 CLI 로 덮어쓴다.
  for (const shard of SHARDS.filter((entry) => entry.name !== "core")) {
    const args = shardArguments(shard);
    assert.ok(!args.includes("--at-least"), `${shard.name}: 샤드는 임계값을 따로 비교하지 않는다`);
    assert.ok(!args.includes("--project"), `${shard.name}: 측정 프로그램은 package.json 설정 하나를 쓴다`);
    assert.ok(shard.ignoreFiles.length > 0);
  }
  assert.deepEqual(
    [...STUDIO_ENGINE_DIRECTORIES],
    [...STUDIO_ENGINE_DIRECTORIES].sort(),
    "대형 하위 도메인 목록은 정렬을 유지한다",
  );
});

test("shardOf puts every path in exactly one shard and keeps lookalike directories apart", () => {
  const expected = {
    "apps/web/src/domains/creator/studio-x.ts": "studio-root",
    "apps/web/src/domains/creator/StudioPage.tsx": "studio-root",
    "apps/web/src/domains/creator/bg3d/deep/x.tsx": "studio-engines",
    "apps/web/src/domains/creator/brush/x.ts": "studio-engines",
    "apps/web/src/domains/creator/vrm/x.ts": "studio-engines",
    "apps/web/src/domains/creator/ai/x.ts": "studio-rest",
    "apps/web/src/domains/creator/brush-lab/x.ts": "studio-rest",
    "apps/web/src/domains/creator/live-jam/x.ts": "studio-rest",
    "apps/web/src/domains/creator-resources/x.ts": "core",
    "apps/web/src/shared/x.ts": "core",
    "packages/core/src/x.ts": "core",
    "scripts/x.mts": "core",
  };
  for (const [file, shard] of Object.entries(expected)) {
    assert.equal(shardOf(file), shard, file);
  }
});

test("studio-rest는 입력 순서와 무관하게 바이트 상한 안에서 모든 파일을 정확히 한 번 배정한다", () => {
  const files = [
    { path: `${STUDIO_DOMAIN}/future-domain/c.ts`, bytes: 8 },
    { path: `${STUDIO_DOMAIN}/ai/a.ts`, bytes: 5 },
    { path: `${STUDIO_DOMAIN}/brush-lab/b.test.ts`, bytes: 4 },
    { path: `${STUDIO_DOMAIN}/future-domain/d.json`, bytes: 1 },
  ];
  const shards = splitStudioRest(files, 8);
  assert.deepEqual(shards, splitStudioRest([...files].reverse(), 8));
  assert.deepEqual(shards.flatMap((shard) => shard.files), files.map((file) => file.path).sort());
  assert.equal(new Set(shards.flatMap((shard) => shard.files)).size, files.length);
  assert.ok(shards.every((shard) => shard.sourceBytes <= 8 && shard.parent === "studio-rest"));
  assert.equal(shards.reduce((total, shard) => total + shard.sourceBytes, 0), 18);
  for (const shard of shards) {
    const args = shardArguments(shard);
    assert.deepEqual(args.slice(args.indexOf("--") + 1), shard.files);
    assert.deepEqual(shard.ignoreFiles, SHARDS.find((entry) => entry.name === "studio-rest").ignoreFiles);
  }
  assert.throws(() => splitStudioRest([...files, files[0]], 8), /중복/u);
  assert.throws(() => splitStudioRest(files, 7), /파일 하나가 샤드 예산/u);
  assert.throws(() => splitStudioRest(files, 0), /양의 정수/u);
  assert.throws(() => splitStudioRest([{ path: "outside.ts", bytes: 1 }]), /잘못된/u);
  assert.throws(() => splitStudioRest([{ path: files[0].path, bytes: NaN }]), /잘못된/u);
});

test("파일 목록은 새 도메인·import 가능한 테스트·선언·JSON을 보존하고 기존 다른 그룹과 겹치지 않는다", () => {
  const root = mkdtempSync(join(tmpdir(), "type-coverage-inventory-"));
  const restPaths = [
    "ai/source.ts", "ai/imported.test.ts", "new-domain/types.d.ts", "new-domain/data.json",
    "new-domain/[literal]+entry.mts", "node_modules-adapter/source.ts",
  ];
  try {
    for (const name of [...restPaths, "StudioRoot.tsx", "brush/engine.ts", "bg3d/nested/engine.ts", "new-domain/readme.md", "new-domain/node_modules/vendor/index.ts"]) {
      const file = join(root, STUDIO_DOMAIN, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "export const value = 1;\n");
    }
    const files = inventoryStudioRestFiles(root);
    assert.deepEqual(files.map((file) => file.path), restPaths.map((file) => `${STUDIO_DOMAIN}/${file}`).sort());
    assert.ok(files.every((file) => file.bytes === 24));
    const planned = executionShards(root, 48);
    assert.equal(planned.filter((shard) => shard.parent === "studio-rest").length, 3);
    const selected = selectShards(planned, ["studio-rest", "studio-rest-001", "studio-rest"]);
    assert.deepEqual(selected.flatMap((shard) => shard.files), files.map((file) => file.path));
    assert.deepEqual(selectShards(planned, ["studio-rest-002"]), [planned[4]]);
    assert.throws(() => selectShards(planned, ["studio-rest-999"]), /알 수 없는 샤드/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("작은 파일이 많아져도 파일 인자가 프로세스 전달 예산을 넘지 않는다", () => {
  const files = Array.from({ length: 2500 }, (_, index) => ({
    path: `${STUDIO_DOMAIN}/future-domain/${String(index).padStart(4, "0")}-${"x".repeat(180)}.ts`,
    bytes: 1,
  }));
  const shards = splitStudioRest(files);
  assert.ok(shards.length > 1, "소스 바이트 외에 인자 길이로도 나눠야 합니다");
  assert.deepEqual(shards.flatMap((shard) => shard.files), files.map((file) => file.path));
  assert.ok(shards.every((shard) => shard.files.reduce((total, file) => total + Buffer.byteLength(file) + 1, 0) <= 256 * 1024));
});

test("현재 studio-rest 실행 계획도 전체 입력을 빠짐없이 바이트 상한 안에 넣는다", () => {
  const files = inventoryStudioRestFiles(repositoryRoot);
  const planned = executionShards(repositoryRoot);
  const rest = selectShards(planned, ["studio-rest"]);
  assert.ok(rest.length > 1, "단일 studio-rest 프로세스로 되돌아가면 안 됩니다");
  assert.deepEqual(rest.flatMap((shard) => shard.files), files.map((file) => file.path));
  assert.ok(rest.every((shard) => shard.sourceBytes <= STUDIO_REST_MAX_SOURCE_BYTES));
  assert.ok(rest.every((shard) => shardArguments(shard).every((arg) => !arg.startsWith("--at-least"))));
});

test("summarize sums identifiers across shards and floors the percentage like the CLI", () => {
  assert.deepEqual(summarize([{ correctCount: 949, totalCount: 1000 }], 95), {
    correctCount: 949,
    totalCount: 1000,
    percent: 94.9,
    passed: false,
  });
  assert.equal(summarize([{ correctCount: 950, totalCount: 1000 }], 95).passed, true);
  // 비율의 평균이 아니라 식별자 수의 합이다: 100% 샤드가 0% 샤드를 덮어주지 않는다.
  const combined = summarize(
    [{ correctCount: 900, totalCount: 900 }, { correctCount: 0, totalCount: 100 }],
    95,
  );
  assert.equal(combined.percent, 90);
  assert.equal(combined.passed, false);
  // 아무것도 측정하지 못했다면 통과로 읽지 않는다.
  assert.equal(summarize([], 95).passed, false);
  assert.equal(summarize([{ correctCount: 0, totalCount: 0 }], 95).passed, false);
});

test("withHeapLimit replaces only the heap ceiling", () => {
  assert.equal(withHeapLimit(undefined, 9000), "--max-old-space-size=9000");
  assert.equal(withHeapLimit("--max-old-space-size=8192", 9000), "--max-old-space-size=9000");
  assert.equal(
    withHeapLimit("--trace-warnings --max-old-space-size=8192 --enable-source-maps", 9000),
    "--trace-warnings --enable-source-maps --max-old-space-size=9000",
  );
});

test("the runner lists shards without measuring and rejects unknown shards", () => {
  const listed = spawnSync(process.execPath, [shardScript, "--list"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(listed.status, 0, listed.stderr);
  const lines = listed.stdout.trim().split("\n");
  const plannedNames = executionShards(repositoryRoot).map((shard) => shard.name);
  assert.equal(lines.length, plannedNames.length);
  plannedNames.forEach((name, index) => assert.ok(lines[index].startsWith(`${name}\t`), lines[index]));
  assert.ok(lines.every((line) => line.includes("type-coverage --json-output")));
  assert.ok(lines.filter((line) => line.startsWith("studio-rest-")).every((line) => / -- <\d+개 파일: .+ … .+>$/u.test(line)));

  const single = spawnSync(process.execPath, [shardScript, "--list", "--shard", "studio-root"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(single.status, 0, single.stderr);
  assert.equal(single.stdout.trim().split("\n").length, 1);

  const alias = spawnSync(process.execPath, [shardScript, "--list", "--shard", "studio-rest"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(alias.status, 0, alias.stderr);
  assert.deepEqual(alias.stdout.trim().split("\n").map((line) => line.split("\t")[0]),
    plannedNames.filter((name) => name.startsWith("studio-rest-")));

  const unknown = spawnSync(process.execPath, [shardScript, "--shard", "nope"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /알 수 없는 샤드/u);
});

// type-coverage 본체(수 분, 힙 수 GB)를 돌리지 않고 샤드 실행·집계·실패 경로를 검증한다.
// 가짜 type-coverage 가 받은 인자(--ignore-files)에 따라 정해진 식별자 수를 JSON 으로 돌려준다.
function withFakeTypeCoverage(run, { counts, exitCode = 0, floor = 90 }) {
  const root = mkdtempSync(join(tmpdir(), "type-coverage-shards-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { "check:type-coverage": `type-coverage --at-least ${floor}` } }),
    );
    for (const file of FAKE_REST_FILES) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "export const x = 1;");
    }
    const binDirectory = join(root, "node_modules", "type-coverage", "bin");
    mkdirSync(binDirectory, { recursive: true });
    writeFileSync(
      join(root, "node_modules", "type-coverage", "package.json"),
      JSON.stringify({ name: "type-coverage", version: "0.0.0" }),
    );
    // 파일 하위 샤드는 '--' 뒤의 원문 파일 목록으로, 나머지는 기존 무시 패턴으로 구분한다.
    writeFileSync(
      join(binDirectory, "type-coverage"),
      `const args = process.argv.slice(2);
const key = args.includes("--") ? args.slice(args.indexOf("--") + 1).join("|")
  : args.includes("--ignore-files") ? args[args.indexOf("--ignore-files") + 1] : "core";
const counts = ${JSON.stringify(counts)};
if (${exitCode} !== 0) { console.log(JSON.stringify({ succeeded: false, error: "boom" })); process.exit(${exitCode}); }
const [correctCount, totalCount] = counts[key] ?? [0, 0];
console.log(JSON.stringify({ succeeded: true, correctCount, totalCount, args }));
`,
    );
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runShardMain(root, argv, options = {}) {
  const script = `
    import { main } from ${JSON.stringify(shardScript)};
    try { process.exitCode = main(${JSON.stringify(argv)}, ${JSON.stringify({ root, ...options })}); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, TYPE_COVERAGE_HEAP_MB: "4096" },
  });
}

const FAKE_REST_FILES = [`${STUDIO_DOMAIN}/ai/a.ts`, `${STUDIO_DOMAIN}/ai/b.ts`];
const FAKE_SHARD_COUNTS = {
  core: [900, 900],
  [SHARDS[1].ignoreFiles[0]]: [95, 100],
  [SHARDS[2].ignoreFiles[0]]: [190, 200],
  [FAKE_REST_FILES.join("|")]: [90, 100],
  [FAKE_REST_FILES[0]]: [45, 50],
  [FAKE_REST_FILES[1]]: [45, 50],
};

test("the runner measures each shard in its own process and sums the identifier counts", () => {
  withFakeTypeCoverage((root) => {
    const result = runShardMain(root, []);
    assert.equal(result.status, 0, result.stderr);
    // (900 + 95 + 190 + 90) / (900 + 100 + 200 + 100) = 1275 / 1300 = 98.07%
    assert.match(result.stdout, /전체 범위: \(1275 \/ 1300\) 98\.07%/u);
    assert.match(result.stdout, /type-coverage success\./u);
    for (const name of executionShards(root).map((shard) => shard.name)) {
      assert.match(result.stdout, new RegExp(`- ${name}:`, "u"));
    }
  }, { counts: FAKE_SHARD_COUNTS });
});

test("나머지 샤드 분할 전후 식별자 합계와 전체 임계값 판정은 같고 별칭 중복 지정도 한 번만 측정한다", () => {
  withFakeTypeCoverage((root) => {
    const split = runShardMain(root, [], { maxSourceBytes: 20 });
    assert.equal(split.status, 0, split.stderr);
    assert.match(split.stdout, /전체 범위: \(1275 \/ 1300\) 98\.07%/u);
    const selected = runShardMain(root, ["--shard", "studio-rest", "--shard", "studio-rest-001"], { maxSourceBytes: 20 });
    assert.equal(selected.status, 0, selected.stderr);
    assert.match(selected.stdout, /선택한 샤드\(studio-rest-001, studio-rest-002\): \(90 \/ 100\) 90\.00%/u);
    assert.equal((selected.stdout.match(/- studio-rest-001:/gu) ?? []).length, 1);
  }, { counts: FAKE_SHARD_COUNTS });
});

test("the runner fails when the summed ratio is below the floor read from package.json", () => {
  withFakeTypeCoverage((root) => {
    const result = runShardMain(root, []);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /임계값\(99%\)/u);
    assert.doesNotMatch(result.stdout, /type-coverage success\./u);
  }, { counts: FAKE_SHARD_COUNTS, floor: 99 });
});

test("the runner measures only the selected shards and fails loudly when a shard process dies", () => {
  withFakeTypeCoverage((root) => {
    const selected = runShardMain(root, ["--shard", "core", "--shard", "studio-root"]);
    assert.equal(selected.status, 0, selected.stderr);
    assert.match(selected.stdout, /선택한 샤드\(core, studio-root\): \(995 \/ 1000\) 99\.50%/u);
    assert.doesNotMatch(selected.stdout, /studio-engines/u);
  }, { counts: FAKE_SHARD_COUNTS });

  withFakeTypeCoverage((root) => {
    const crashed = runShardMain(root, ["--shard", "core"]);
    assert.equal(crashed.status, 1);
    assert.match(crashed.stderr, /샤드 core 측정이 실패했습니다\(종료 코드 134/u);
    assert.doesNotMatch(crashed.stdout, /type-coverage success\./u);
  }, { counts: FAKE_SHARD_COUNTS, exitCode: 134 });
});

test("PR core keeps the scoped gate; the full-scope measurement runs in the nightly diagnostics", () => {
  assert.equal(packageJson.scripts?.["check:type-coverage:full"], "node scripts/type-coverage-shards.mjs");
  // 약 30분이 드는 전체 측정은 PR 필수 경로에 넣지 않는다.
  assert.doesNotMatch(ciSource, /check:type-coverage:full|type-coverage-shards/u);
  const nightly = readFileSync(
    new URL("../.github/workflows/main-full-qa-fast-diagnostics.yml", import.meta.url),
    "utf8",
  );
  assert.match(nightly, /- gate: type-coverage-full\n\s+command: pnpm run check:type-coverage:full\n/u);
});

if (process.env.VITEST) {
  // minimatch 는 type-coverage 가 쓰는 것과 같은 버전이어야 하므로 설치 뒤에 그 의존성 옆에서 불러온다.
  test("the shard ignore globs analyze every tracked path in exactly the shard shardOf names", async () => {
    const { createRequire } = await import("node:module");
    const { execFileSync } = await import("node:child_process");
    const { dirname, resolve } = await import("node:path");
    const requireFromRoot = createRequire(resolve(repositoryRoot, "package.json"));
    const requireFromTypeCoverage = createRequire(requireFromRoot.resolve("type-coverage/package.json"));
    const coreManifest = requireFromTypeCoverage.resolve("type-coverage-core/package.json");
    const { minimatch } = createRequire(coreManifest)("minimatch");
    assert.equal(typeof minimatch, "function", dirname(coreManifest));

    const ignoredBy = (shard, file) =>
      (shard.ignoreFiles ?? packageJson.typeCoverage.ignoreFiles).some((pattern) => minimatch(file, pattern));
    const planned = executionShards(repositoryRoot);
    const fileSets = new Map(planned.filter((shard) => shard.files).map((shard) => [shard.name, new Set(shard.files)]));
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    })
      .split("\0")
      .filter((file) => /\.(?:[cm]?[jt]sx?|json)$/u.test(file));
    assert.ok(tracked.length > 1000, "추적 파일 목록을 읽지 못했다");

    for (const file of tracked) {
      const analyzers = SHARDS.filter((shard) => !ignoredBy(shard, file)).map((shard) => shard.name);
      assert.deepEqual(analyzers, [shardOf(file)], file);
      const actual = planned.filter((shard) => (!shard.files || fileSets.get(shard.name).has(file)) && !ignoredBy(shard, file));
      assert.equal(actual.length, 1, `${file}: 실행 샤드에서도 정확히 한 번 포함되어야 합니다`);
      assert.equal(actual[0].parent ?? actual[0].name, shardOf(file), file);
    }
  });
}
