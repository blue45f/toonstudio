import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";
import { CORE_DATABASE_VITEST_TARGETS } from "./ci-core-regression-shards.mjs";
import { fixtureGitEnvironment, sparsePatterns } from "./ci-checkout-test-helpers.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const productionIntegritySource = readFileSync(
  new URL("../.github/workflows/studio-production-integrity.yml", import.meta.url),
  "utf8",
);
const requiredTargets = readFileSync(
  new URL("./ci-required-vitest-targets.txt", import.meta.url),
  "utf8",
).trim().split(/\r?\n/).filter(Boolean);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const jobs = source.slice(source.indexOf("\njobs:\n") + 7).split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

function targetExists(target) {
  const absoluteTarget = join(repoRoot, target);
  if (existsSync(absoluteTarget)) return true;

  const directory = dirname(absoluteTarget);
  if (!existsSync(directory)) return false;
  const name = basename(target);
  if (!name.includes("*")) {
    return readdirSync(directory).some(
      (entry) => entry.startsWith(name) && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry),
    );
  }

  const expression = new RegExp(
    `^${name
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*")}$`,
  );
  return readdirSync(directory).some((entry) => expression.test(entry));
}

test("checkout 조건식 파서는 알려진 literal 이외의 실행식과 조건을 거부한다", () => {
  const block = (expression) => `          sparse-checkout: |\n            /*\n            ${expression}\n`;
  assert.throws(() => sparsePatterns(block("${{ fromJSON(inputs.paths) }}")), /지원하지 않는 checkout 조건식/u);
  assert.throws(() => sparsePatterns(block("${{ matrix.shard != 'product' && '/docs/' || '' }}")), /지원하지 않는 checkout 조건식/u);
  assert.deepEqual(sparsePatterns(block("${{ matrix.shard == 'studio-3d' && '/models/' || '' }}"), { shard: "studio-3d" }), ["/*", "/models/"]);
});


test("production integrity follows the real menu verifier and its CI bootstrap", () => {
  for (const path of [
    "scripts/verify-studio-menus.mts",
    "scripts/verify-studio-menus-ci.mjs",
    "apps/web/src/domains/creator/StudioBetaNoticeGate.tsx",
    "apps/web/src/domains/creator/studio-beta-notice-storage.ts",
  ]) {
    assert.equal(
      productionIntegritySource.split(`      - '${path}'`).length - 1,
      2,
      `production integrity must run for pull requests and main pushes that change ${path}`,
    );
  }
  assert.ok(productionIntegritySource.includes(
    "      - name: Inspect actual production browser\n"
      + "        run: pnpm exec tsx scripts/verify-studio-menus-ci.mjs\n",
  ));
  assert.doesNotMatch(productionIntegritySource, /run: pnpm run verify:studio-menus/u);
  const finishingQualitySource = readFileSync(
    new URL("../.github/workflows/studio-finishing-quality.yml", import.meta.url), "utf8",
  );
  for (const workflow of [productionIntegritySource, finishingQualitySource]) {
    // 메뉴 검증기의 대기 로직이 도우미 파일로 나뉘어 있으므로, 도우미만 바뀌어도 브라우저 메뉴 검증이 돌아야 한다.
    assert.equal(
      workflow.split("      - 'scripts/lib/studio-verify-render-settle*'").length - 1,
      2,
      "메뉴 검증 도우미를 바꾸는 PR 과 main 푸시에서도 브라우저 메뉴 검증이 실행돼야 한다",
    );
    const start = workflow.indexOf("      - name: Verify canonical resize and offline rejection contracts\n");
    assert.ok(start >= 0, "브라우저 메뉴 검증에는 정본 변경과 오프라인 거절 검증이 필수다");
    const authorityStep = workflow.slice(start, workflow.indexOf("      - name: Build", start));
    assert.match(authorityStep, /run: \|\n {10}pnpm exec vitest run/u);
    for (const target of [
      "apps/web/src/domains/creator/offline-branch/studio-offline-branch-runtime.test.ts",
      "apps/web/src/domains/creator/offline-branch/studio-offline-host-integration.test.ts",
      "apps/web/src/domains/creator/studio-cuttoon-editor/studio-deferred-stroke-commit.test.ts",
      "scripts/verify-studio-menus.test.ts",
    ]) assert.ok(authorityStep.includes(target), `missing paired authority contract: ${target}`);
    assert.doesNotMatch(authorityStep, /continue-on-error|if:|\|\| true/u);
  }
});

test("core retains every mandatory quality lane without a bypass", () => {
  assert.doesNotMatch(source, /CI_CORE_BYPASS|continue-on-error|if:\s*\$\{\{\s*false/);
  assert.match(source, /permissions:\n {2}contents: read\n {2}pull-requests: read/);

  for (const name of REQUIRED_CORE_GATES) {
    const block = job(name);
    assert.doesNotMatch(block, /^ {4}needs:/m, `${name} must start independently`);
    if (name !== "core") assert.match(block, /pnpm install --frozen-lockfile/);
  }
  const lint = job("lint");
  assert.match(lint, /node scripts\/lint-changed\.mjs --files-from=/);
  assert.match(lint, /--full-on-config/);
  assert.match(lint, /pnpm run lint:strict/);

  assert.match(job("typecheck"), /pnpm run typecheck\n/);
  assert.match(job("typecheck"), /pnpm run typecheck:cloudflare-realtime/);
  assert.ok(
    job("static").includes('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"'),
    "static lanes must execute their semantic shard",
  );
  assert.doesNotMatch(
    job("static"),
    /mapfile -t targets|pnpm exec vitest run/,
    "the matrix job must not duplicate the full regression portfolio in every shard",
  );
  for (const command of [
    "pnpm --filter @webtoon-nest/api build",
    "pnpm run build:bundle",
    "pnpm run check:studio-bundle",
    "test -s dist/.vite/manifest.json",
  ]) {
    assert.ok(job("build").includes(command), `missing build gate: ${command}`);
  }
  assert.doesNotMatch(job("build"), /pnpm run build(?!:)/, "web typecheck must not repeat in build");
  assert.ok(job("serial").includes("pnpm run test:perf"));
});

test("호스팅 full 검사와 Market의 SDK 정리는 실제 shell과 가짜 실행기로 경계·실패·입력 보존을 검증한다", () => {
  const stepName = "체크아웃 전 미사용 SDK 정리와 디스크 여유 확인";
  const removal = "sudo rm -rf -- /usr/local/lib/android/sdk /usr/share/dotnet/sdk";
  const market = readFileSync(new URL("../.github/workflows/market-cc0-delivery.yml", import.meta.url), "utf8");
  const marketJob = market.slice(market.indexOf("\n  verify:\n"));
  const bodies = [];
  const blocks = [...["build", "database", "a11y", "serial"].map((name) => [name, job(name)]), ["market verify", marketJob]];
  for (const [name, block] of blocks) {
    const step = block.split(/(?=^ {6}- )/mu).find((entry) => entry.startsWith(`      - name: ${stepName}\n`));
    assert.ok(step, `${name}: 체크아웃 전 공간 확보 단계 누락`);
    assert.match(block, /runs-on: ubuntu-24\.04/u);
    assert.match(step, /shell: bash/u);
    assert.ok(step.includes("TOONSTUDIO_CI_RUNNER_ENVIRONMENT: ${{ runner.environment }}"));
    assert.ok(step.includes("TOONSTUDIO_CI_RUNNER_OS: ${{ runner.os }}"));
    assert.ok(block.indexOf(step) < block.indexOf("uses: actions/checkout@v7"));
    assert.match(block, /uses: actions\/setup-node@v7\n {8}with:\n {10}node-version: 24\n {10}cache: pnpm/u);
    assert.ok(block.includes("run: pnpm install --frozen-lockfile --prefer-offline"));
    assert.doesNotMatch(block.replace(step, ""), /android|dotnet|sdkmanager|gradlew/u, "이 검사에는 제거 대상 SDK 소비자가 없어야 합니다.");
    const body = step.match(/^ {8}run: \|\n((?: {10}[^\n]*\n)+)/mu)?.[1].replace(/^ {10}/gmu, "");
    assert.ok(body);
    assert.equal(body.split(removal).length - 1, 1);
    assert.doesNotMatch(body, /continue-on-error|\|\| true|\/[^\s]*sudo|\brm\b(?! -rf -- \/usr\/local\/lib\/android\/sdk \/usr\/share\/dotnet\/sdk)/u);
    assert.ok(body.includes('workspace=$(cd "$GITHUB_WORKSPACE" && pwd -P)'));
    assert.ok(body.includes('"$workspace" == "$target/"*'));
    assert.ok(body.includes('"$target" == "$workspace/"*'));
    assert.match(body, /available_bytes < 21474836480/u);
    bodies.push(body);
  }
  assert.equal(bodies.length, 5);
  assert.ok(bodies.every((body) => body === bodies[0]), "다섯 검사는 같은 안전 경계를 사용해야 합니다.");
  assert.equal(source.split(removal).length - 1, 4);
  assert.equal(market.split(removal).length - 1, 1);
  assert.ok(market.includes("node --import tsx scripts/generate-market-cc0-catalog.mts --check"));
  for (const target of ["studio-entry-redirect", "studio-marketplace-catalog-open", "studio-host-architecture-ratchet", "studio-pixel-selection-scene-target", "studio-marketplace-cc0-catalog", "studio-community-marketplace", "studio-marketplace-deep-link", "studio-creator-pack-runtime", "StudioCommunityMarketplacePanel.race", "studio-cc0-asset-delivery", "StudioCommunityMarketplacePanel", "MarketResourceDetailArticle"]) {
    assert.ok(market.includes(`${target}.test.`), `Market 필수 회귀 누락: ${target}`);
  }
  assert.match(market, /pnpm exec vitest run/u);
  assert.doesNotMatch(market, /continue-on-error|\|\| true/u);
  for (const name of ["static", "lint", "typecheck"]) assert.ok(!job(name).includes(stepName));
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hosted-sdk-cleanup-contract-")));
  const bin = join(root, "bin");
  const workspace = join(root, "workspace");
  const sudoLog = join(root, "sudo-calls");
  mkdirSync(bin);
  mkdirSync(workspace);
  const writeExecutable = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  // PATH에는 이 네 가짜 실행기만 둔다. sudo는 인자를 기록한 뒤 종료하며 명령을 실행하지 않는다.
  writeExecutable("sudo", 'printf "%s\\0" "$@" >> "$FAKE_SUDO_LOG"\nprintf "\\n" >> "$FAKE_SUDO_LOG"\nexit "${FAKE_SUDO_EXIT:-0}"');
  writeExecutable("uname", 'printf "%s\\n" "${FAKE_KERNEL:-Linux}"');
  writeExecutable("du", 'printf "0\\t%s\\n" "${4:-fixture}"');
  writeExecutable("df", 'if [ "$2" = "-B1" ]; then\n  if [ "${FAKE_DF_HEADER:-1}" = 1 ]; then printf "Filesystem 1-blocks Used Available Capacity Mounted\\n"; fi\n  printf "fixture 999999999999 0 %s 0%% /\\n" "$FAKE_AVAILABLE"\nelse\n  printf "Filesystem Inodes IUsed IFree IUse%% Mounted\\nfixture 100 1 99 1%% /\\n"\nfi');
  const sentinels = [".git/preserved", "apps/web/public/preserved.bin", "node_modules/preserved"];
  for (const file of sentinels) {
    mkdirSync(dirname(join(workspace, file)), { recursive: true });
    writeFileSync(join(workspace, file), `그대로 보존: ${file}\n`);
  }
  const before = sentinels.map((file) => readFileSync(join(workspace, file)));
  const environment = {
    PATH: bin, GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", ImageOS: "ubuntu24",
    TOONSTUDIO_CI_RUNNER_ENVIRONMENT: "github-hosted", TOONSTUDIO_CI_RUNNER_OS: "Linux",
    GITHUB_WORKSPACE: workspace, FAKE_AVAILABLE: "21474836480", FAKE_SUDO_LOG: sudoLog,
  };
  const mockStat = 'test() { if [[ "$#" == 2 && "$1" == -L ]]; then [[ -n "${FAKE_SYMLINK:-}" && "${FAKE_SYMLINK:-}" == "$2" ]]; return; fi; builtin test "$@"; }\n';
  const execute = (changes = {}, missing = []) => {
    if (existsSync(sudoLog)) rmSync(sudoLog);
    const env = { ...environment, ...changes };
    for (const key of missing) delete env[key];
    const result = spawnSync("/bin/bash", ["-c", mockStat + bodies[0]], { cwd: workspace, env, encoding: "utf8", timeout: 10_000 });
    const calls = existsSync(sudoLog) ? readFileSync(sudoLog, "utf8").trim().split("\n").map((line) => line.split("\0").filter(Boolean)) : [];
    for (let index = 0; index < sentinels.length; index += 1) {
      assert.deepEqual(readFileSync(join(workspace, sentinels[index])), before[index], `필수 입력 변경: ${sentinels[index]}`);
    }
    return { ...result, calls };
  };
  const expected = [["rm", "-rf", "--", "/usr/local/lib/android/sdk", "/usr/share/dotnet/sdk"]];
  try {
    const success = execute();
    assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(success.calls, expected);
    const decimal = execute({ FAKE_AVAILABLE: "021474836480" });
    assert.equal(decimal.status, 0, decimal.stderr);
    assert.deepEqual(decimal.calls, expected, "앞자리 0이 있는 정수도 10진수로 해석해야 합니다.");
    for (const changes of [
      { RUNNER_OS: "macOS" }, { RUNNER_ENVIRONMENT: "self-hosted" }, { ImageOS: "ubuntu22" },
      { GITHUB_ACTIONS: "false" }, { FAKE_KERNEL: "Darwin" },
      { TOONSTUDIO_CI_RUNNER_OS: "macOS" }, { TOONSTUDIO_CI_RUNNER_ENVIRONMENT: "self-hosted" },
      { GITHUB_WORKSPACE: "/" }, { GITHUB_WORKSPACE: "relative/workspace" },
      { FAKE_SYMLINK: "/usr/local/lib/android" }, { FAKE_SYMLINK: workspace },
    ]) {
      const rejected = execute(changes);
      assert.notEqual(rejected.status, 0, JSON.stringify(changes));
      assert.deepEqual(rejected.calls, [], "환경·중첩·링크 거절 전에 sudo를 호출하면 안 됩니다.");
    }
    for (const key of ["GITHUB_ACTIONS", "RUNNER_ENVIRONMENT", "RUNNER_OS", "ImageOS", "GITHUB_WORKSPACE", "TOONSTUDIO_CI_RUNNER_ENVIRONMENT", "TOONSTUDIO_CI_RUNNER_OS"]) {
      const rejected = execute({}, [key]);
      assert.notEqual(rejected.status, 0, `필수 변수 누락: ${key}`);
      assert.deepEqual(rejected.calls, []);
    }
    const sudoFailure = execute({ FAKE_SUDO_EXIT: "23" });
    assert.equal(sudoFailure.status, 23, "정리 실패를 재시도하거나 성공으로 바꾸면 안 됩니다.");
    assert.deepEqual(sudoFailure.calls, expected);
    for (const value of ["invalid", "-1", "12.5", "9999999999999999999"]) {
      const invalid = execute({ FAKE_AVAILABLE: value });
      assert.notEqual(invalid.status, 0, `잘못된 df 정수: ${value}`);
      assert.deepEqual(invalid.calls, [], "측정값 검증 실패 전에 sudo를 호출하면 안 됩니다.");
    }
    const noHeader = execute({ FAKE_DF_HEADER: "0" });
    assert.notEqual(noHeader.status, 0);
    assert.deepEqual(noHeader.calls, []);
    const insufficient = execute({ FAKE_AVAILABLE: "21474836479" });
    assert.notEqual(insufficient.status, 0, "20 GiB보다 1바이트 부족하면 실패해야 합니다.");
    assert.deepEqual(insufficient.calls, expected);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("번들 Python 회귀는 foundation에서 고정 wheel을 준비하고 두 필수 패턴을 실패 없이 생략하지 않는다", () => {
  const steps = job("static").split(/(?=^ {6}- )/mu);
  const named = (name) => {
    const matches = steps.filter((step) => step.startsWith(`      - name: ${name}\n`));
    assert.equal(matches.length, 1, name);
    assert.match(matches[0], /^ {8}if: matrix\.shard == 'studio-foundation'$/mu);
    assert.doesNotMatch(matches[0], /continue-on-error|\|\| true/u);
    return matches[0];
  };
  const setup = named("번들 Python 검증 환경 준비");
  const install = named("번들 Python 검증 의존성 설치");
  const tests = named("번들 정규화·렌더 Python 회귀 검증");
  assert.match(setup, /uses: actions\/setup-python@v7\n {8}with:\n {10}python-version: '3\.12'/u);
  const requirementPath = "scripts/requirements-creator-bundle-verification.txt";
  const installCommand = `python -m pip install --only-binary=:all: --require-hashes -r ${requirementPath}`;
  assert.ok(install.includes(`        run: >-\n          ${installCommand}\n`));
  assert.equal(source.split(installCommand).length - 1, 1);
  const requirements = readFileSync(join(repoRoot, requirementPath), "utf8");
  assert.match(requirements, /^Pillow==13\.0\.0 \\$/mu);
  const hashes = [...requirements.matchAll(/--hash=sha256:([a-f0-9]{64})/gu)].map((match) => match[1]);
  assert.equal(hashes.length, 82);
  assert.equal(new Set(hashes).size, hashes.length);
  const patterns = ["test_creator_bundle*.py", "test_studio_asset_glb.py"];
  for (const pattern of patterns) {
    const command = `python -m unittest discover -s scripts/tests -p '${pattern}' -v`;
    assert.ok(tests.includes(command), pattern);
    assert.equal(source.split(command).length - 1, 1, pattern);
  }
  for (const target of ["test_creator_bundle_render_preparation.py", "test_creator_bundle_publication.py", "test_creator_bundle_renders.py", "test_creator_bundle_scenes.py", "test_studio_asset_glb.py"]) {
    assert.ok(existsSync(join(repoRoot, "scripts/tests", target)), target);
  }
  assert.ok(steps.indexOf(setup) < steps.indexOf(install) && steps.indexOf(install) < steps.indexOf(tests));
  assert.ok(job("static").indexOf(tests) < job("static").indexOf("Run semantic regression shard"));
  const run = tests.match(/^ {8}run: \|\n((?: {10}[^\n]*\n)+)/mu)?.[1].replace(/^ {10}/gmu, "");
  assert.ok(run?.startsWith("set -euo pipefail\n"));
  const scratch = mkdtempSync(join(tmpdir(), "bundle-python-ci-contract-"));
  const log = join(scratch, "calls.jsonl");
  try {
    writeFileSync(join(scratch, "python"), '#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.appendFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");\nif (process.env.FAIL_PATTERN && process.argv.includes(process.env.FAIL_PATTERN)) process.exit(7);\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${scratch}:${process.env.PATH}`, CALL_LOG: log, FAIL_PATTERN: "" };
    const result = spawnSync("bash", ["-c", run], { cwd: repoRoot, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const calls = () => readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const expected = patterns.map((pattern) => ["-m", "unittest", "discover", "-s", "scripts/tests", "-p", pattern, "-v"]);
    assert.deepEqual(calls(), expected);
    writeFileSync(log, "");
    const failed = spawnSync("bash", ["-c", run], { cwd: repoRoot, env: { ...env, FAIL_PATTERN: patterns[0] }, encoding: "utf8" });
    assert.equal(failed.status, 7);
    assert.deepEqual(calls(), [expected[0]], "첫 Python 회귀 실패는 다음 명령을 막아야 한다");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("protected core aggregates every lane without another checkout", () => {
  assert.ok(job("core").includes(`needs: [${REQUIRED_CORE_GATES.join(", ")}]`));
  assert.ok(job("core").includes("if: ${{ always() && !cancelled() }}"));
  assert.ok(job("core").includes("CORE_RESULTS: ${{ toJSON(needs) }}"));
  for (const name of REQUIRED_CORE_GATES) {
    assert.ok(job("core").includes(`"${name}"`), `inline aggregate is missing ${name}`);
  }
  assert.doesNotMatch(job("core"), /actions\/checkout|pnpm install/);
  assert.ok(job("verify").includes("needs: core"));
  assert.ok(job("verify").includes('test "$CORE_RESULT" = success'));
});

test("review database invariants execute with real PostgreSQL and the accepted graph triggers", () => {
  const database = job("database");
  assert.match(database, /image: postgres:16-alpine/u);
  assert.match(database, /TEST_DATABASE_URL: postgresql:\/\/studio_review_test@127\.0\.0\.1:5432\/studio_review_integration/u);
  assert.match(database, /STUDIO_LIVE_POSTGRES_INTEGRATION_URL: postgresql:\/\/studio_review_test@127\.0\.0\.1:5432\/studio_review_integration/u);
  assert.match(database, /node scripts\/prepare-studio-review-test-db\.mjs/u);
  assert.match(database, /pnpm exec vitest run --no-file-parallelism/u);
  assert.match(database, /studio-review-voice-note\.integration\.test\.ts/u);

  const preparation = readFileSync(
    new URL("./prepare-studio-review-test-db.mjs", import.meta.url),
    "utf8",
  );
  const migrationFiles = [...preparation.matchAll(/"(\d{4}_[a-z0-9_]+\.sql)"/gu)]
    .map((match) => match[1]);
  assert.ok(migrationFiles.includes("0087_studio_pinned_review_share.sql"));
  assert.ok(migrationFiles.includes("0088_studio_review_delivery.sql"));
  assert.ok(migrationFiles.includes("0090_studio_review_voice_note.sql"));
  assert.ok(migrationFiles.includes("0091_creator_work_publication_media.sql"));
  assert.ok(migrationFiles.includes("0116_studio_review_comment_pen_strokes.sql"));
  assert.ok(!migrationFiles.includes("0084_studio_pinned_review_share.sql"));
  for (const migration of migrationFiles) {
    assert.ok(
      existsSync(join(repoRoot, "apps/api/src/platform/database/migrations", migration)),
      `Review DB preparation references a missing migration: ${migration}`,
    );
  }

  for (const suite of CORE_DATABASE_VITEST_TARGETS) {
    assert.ok(database.includes(suite), `Missing real database suite: ${suite}`);
  }
  for (const suite of [
    "apps/api/src/modules/creator/studio-scoped-producer-http.integration.test.ts",
    "apps/api/src/modules/creator/studio-scoped-write-rest.integration.test.ts",
    "apps/api/src/modules/production-collaboration/production-auth-http.integration.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-capture-source-revision.integration.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-pen-comment.integration.test.ts",
  ]) {
    assert.ok(CORE_DATABASE_VITEST_TARGETS.includes(suite), `고정 원고·첨삭·실제 인증 DB 검증의 소유 누락: ${suite}`);
    assert.ok(database.includes(suite), `보호된 실제 DB job의 검증 누락: ${suite}`);
  }
  assert.ok(REQUIRED_CORE_GATES.includes("database"), "database failures must block protected core");
});

test("mandatory lanes start independently and dependency-free contracts run first", () => {
  assert.doesNotMatch(source, /^ {2}preflight:\n/m);
  for (const name of ["lint", "typecheck", "static", "serial", "build"]) {
    assert.doesNotMatch(job(name), /^ {4}needs:/m, `${name} should start independently`);
  }
  const typecheck = job("typecheck");
  const contractTest = typecheck.indexOf("node --test scripts/ci-core-gate.test.mjs");
  const fanoutPolicy = typecheck.indexOf("python3 scripts/verify-pr-workflow-fanout.py");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  assert.ok(contractTest >= 0, "typecheck lane must execute CI contract tests");
  assert.ok(fanoutPolicy > contractTest, "fanout policy should follow the contract suite");
  assert.ok(install > fanoutPolicy, "dependency installation must follow dependency-free checks");
  for (const contract of [
    "scripts/ci-core-regression-shards.test.mjs",
    "scripts/lint-changed-policy.test.mjs",
    "scripts/run-core-vitest.test.mjs",
  ]) {
    assert.ok(typecheck.includes(contract), `preflight is missing ${contract}`);
  }

  for (const excludedPath of [
    "!/apps/web/public/assets/",
    "!/apps/web/public/vrm/",
    "!/artifacts/",
    "!/docs/",
    "!/tests/benchmarks/results/",
  ]) {
    assert.match(typecheck, new RegExp(excludedPath.replaceAll(".", "\\.")));
  }
  for (const requiredManifest of [
    "/apps/web/public/assets/3d/environments/refined-v6/manifest.json",
    "/apps/web/public/assets/3d/environments/expansion-v1/manifest.json",
    "/apps/web/public/assets/3d/environments/webtoon-v7/manifest.json",
    "/apps/web/public/assets/3d/environments/mcp-free-v1/manifest.json",
  ]) {
    assert.ok(typecheck.includes(requiredManifest), `typecheck checkout is missing ${requiredManifest}`);
  }
});
test("PR lint is scoped while push and merge validation stay repository-wide", () => {
  const lint = job("lint");
  assert.match(lint, /if: github\.event_name == 'pull_request'/);
  assert.match(lint, /pulls\/\$PR_NUMBER\/files\?per_page=100&page=\$page/);
  assert.match(lint, /node scripts\/lint-changed\.mjs --files-from=/);
  assert.match(lint, /--full-on-config/);
  assert.match(lint, /if: github\.event_name != 'pull_request'/);
  assert.match(lint, /run: pnpm run lint:strict/);
  assert.match(lint, /path: node_modules\/\.cache\/eslint\n/);
  for (const path of [
    "filter: blob:none",
    "!/apps/web/public/assets/",
    "/apps/web/public/assets/reference-rebuild/",
    "!/apps/web/public/vrm/",
  ]) {
    assert.ok(lint.includes(path), `lint sparse checkout is missing ${path}`);
  }
});

test("초기 checkout은 foundation의 실제 아트만 포함하고 다른 검사에서는 제외한다", () => {
  const world = "apps/web/public/assets/virtual-studio/world/default-world.json";
  const requiredArt = [
    // 필수 소품 회귀가 읽는 네 분류를 모두 복원하되 다른 스튜디오 자산은 제외한다.
    "apps/web/public/assets/studio/props/daily/webtoon_cafe_table_for_two.webp",
    "apps/web/public/assets/studio/props/school/webtoon_school_desk_study_cluster.webp",
    "apps/web/public/assets/studio/props/fantasy/webtoon_royal_letter_seal_cluster.webp",
    "apps/web/public/assets/studio/props/urban/webtoon_street_fixture_cluster.webp",
    "apps/web/public/assets/virtual-studio/production-v2/art-manifest.json",
    "apps/web/public/assets/virtual-studio/production-v2/master-central-lossless.webp",
    "apps/web/public/assets/virtual-studio/production-v2/player-pink-direction-down.png",
    "apps/web/public/assets/virtual-studio/production-v2/player-pink-walk-down.webp",
    "apps/web/public/assets/virtual-studio/living-world/art-manifest.json",
    "apps/web/public/assets/virtual-studio/living-world/master-clean-plate.webp",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/art-manifest.json",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-concierge-direction-down.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-editor-state-review.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-atelier-state-draw.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v1/npc-archivist-walk-up.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/art-manifest.json",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-concierge-direction-down.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-editor-state-review.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-atelier-state-draw.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v2/npc-archivist-walk-up.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/art-manifest.json",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-concierge-direction-down.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-producer-state-review.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-artist-state-draw.png",
    "apps/web/public/assets/virtual-studio/npc-cast-v3/npc-host-walk-up.png",
    // 가상 스튜디오 근접 상호작용이 읽는 LPC 캐릭터 시트와 NPC 대화 초상화(매니페스트 단위 회귀가 읽는다).
    "apps/web/public/assets/virtual-studio/characters-lpc-v1/manifest.json",
    "apps/web/public/assets/virtual-studio/characters-lpc-v1/credits.json",
    "apps/web/public/assets/virtual-studio/portraits-v1/manifest.json",
    "apps/web/public/assets/virtual-studio/portraits-v1/npc-concierge.webp",
    "apps/web/public/assets/virtual-studio/art-v4-manifest.json",
    "apps/web/public/assets/virtual-studio/art-v4/world/sky-island.webp",
    "apps/web/public/assets/virtual-studio/art-v4/authoring/tile-atlas.webp",
    "apps/web/public/assets/virtual-studio/npc-cast-v4/npc-concierge-sheet.webp",
    "apps/web/public/assets/virtual-studio/style-packs/sky-island/npc-cast-v4/npc-concierge-walk-down.webp",
    "apps/web/public/assets/virtual-studio/style-packs/webtoon/tiles/world-base.webp",
    "apps/web/public/assets/virtual-studio/style-packs-v5/art-v5-manifest.json",
    "apps/web/public/assets/virtual-studio/style-packs-v5/sky-island/world/world-base.webp",
    "apps/web/public/assets/virtual-studio/style-packs-v5/retro/players/player-pink-walk-down.webp",
    "apps/web/public/assets/virtual-studio/style-packs-v5/neon/npcs/npc-concierge-direction-down.webp",
    "apps/web/public/assets/virtual-studio/living-town-v6/art-v6-manifest.json",
    "apps/web/public/assets/virtual-studio/living-town-v6/sky-island/path-overlay.webp",
    "apps/web/public/assets/virtual-studio/living-town-v6/retro/waterfall-sheet.webp",
    "apps/web/public/assets/virtual-studio/imagegen25-v7/manifest.json",
    "apps/web/public/assets/virtual-studio/imagegen25-v7/places/personal-atelier.webp",
    "apps/web/public/assets/virtual-studio/imagegen25-v7/backgrounds/sky.webp",
    "apps/web/public/assets/virtual-studio/imagegen25-v7/tiles/terrain-atlas.webp",
    ...["art-manifest.json", "sky.png", "forest.png", "coast.png", "city.png", "furniture.png", "terrain.png"]
      .map((file) => `apps/web/public/assets/virtual-studio/experience-v8/${file}`),
    ...["art-manifest.json", ...["campus-day", "campus-garden", "campus-social", "studio-tour"].flatMap((id) => [480, 1024].map((width) => `${id}-${width}.webp`))].map((file) => `apps/web/public/assets/virtual-studio/cinematic-v9/${file}`),
    "apps/web/public/assets/virtual-studio/world-v2/manifest.json",
    "apps/web/public/assets/virtual-studio/world-v2/tiles/limestone-native.png",
    "apps/web/public/assets/virtual-studio/world-v2/tiles/grass-native.png",
    "apps/web/public/assets/virtual-studio/world-v2/characters/pixel-maker/manifest.json",
    ...["down", "up", "left", "right"].map((direction) =>
      `apps/web/public/assets/virtual-studio/world-v2/characters/pixel-maker/walk-${direction}.png`),
    "apps/web/public/assets/virtual-studio/drawn-characters-v1/art-manifest.json",
    ...["gentle-window-rain.ogg", "window-rain.ogg", "provenance.json", "CC0-1.0.txt"].map((name) =>
      `apps/web/public/assets/virtual-studio/ambient-audio/${name}`),
    ...["pink", "silver", "dark", "purple"].flatMap((skin) =>
      ["walk-down", "walk-right", "walk-left", "walk-up", "sit", "wave"].map((state) =>
        `apps/web/public/assets/virtual-studio/drawn-characters-v1/player-${skin}-${state}.png`)),
  ];
  const unrelatedArt = [
    "apps/web/public/assets/studio/unrelated-pack/large-image.webp",
    "apps/web/public/assets/3d/environments/refined-v6/large-model.glb",
    "apps/web/public/assets/virtual-studio/unrelated-pack/large-image.png",
  ];
  const excluded = [...requiredArt, ...unrelatedArt];
  const staticJob = job("static");
  const foundationPatterns = sparsePatterns(staticJob, { shard: "studio-foundation" });
  for (const pattern of [
    "/apps/web/public/assets/virtual-studio/production-v2/",
    "/apps/web/public/assets/virtual-studio/living-world/",
    "/apps/web/public/assets/virtual-studio/drawn-characters-v1/",
    "/apps/web/public/assets/virtual-studio/ambient-audio/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v1/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v2/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v3/",
    "/apps/web/public/assets/virtual-studio/npc-cast-v4/",
    "/apps/web/public/assets/virtual-studio/characters-lpc-v1/",
    "/apps/web/public/assets/virtual-studio/portraits-v1/",
    "/apps/web/public/assets/virtual-studio/art-v4/",
    "/apps/web/public/assets/virtual-studio/art-v4-manifest.json",
    "/apps/web/public/assets/virtual-studio/style-packs/",
    "/apps/web/public/assets/virtual-studio/style-packs-v5/",
    "/apps/web/public/assets/virtual-studio/living-town-v6/",
    "/apps/web/public/assets/virtual-studio/imagegen25-v7/",
    "/apps/web/public/assets/virtual-studio/experience-v8/",
    "/apps/web/public/assets/virtual-studio/cinematic-v9/",
    "/apps/web/public/assets/virtual-studio/world-v2/",
    "/apps/web/public/assets/studio/props/",
  ]) assert.ok(foundationPatterns.includes(pattern), `초기 foundation 아트 누락: ${pattern}`);
  assert.doesNotMatch(staticJob, /git sparse-checkout add/u, "정적 입력은 인증이 살아 있는 최초 checkout에서 준비해야 합니다.");
  assert.ok(requiredTargets.includes("scripts/verify-virtual-studio-art-manifest.test.mjs"),
    "the full build art gate does not replace the existing foundation art regression target");
  const artTestScript = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).scripts["test:studio-virtual-art"];
  assert.match(artTestScript, /verify-virtual-studio-v3-art\.test\.mjs/u,
    "the production art gate must execute the v3 NPC/style-pack integrity test");
  assert.match(artTestScript, /verify-virtual-studio-v4-art\.test\.mjs/u,
    "the production art gate must execute the v4 generated campus and NPC integrity test");
  assert.match(artTestScript, /verify-virtual-studio-v5-art\.test\.mjs/u,
    "the production art gate must execute the independent v5 RPG art integrity test");
  assert.match(artTestScript, /verify-virtual-studio-living-town-v6\.test\.mjs/u,
    "the production art gate must execute the Image Generation 2.5-directed living town integrity test");
  assert.match(artTestScript, /verify-virtual-studio-imagegen25-v7\.test\.mjs/u,
    "the production art gate must execute the Image Generation 2.5 place and environment integrity test");
  assert.match(artTestScript, /verify-virtual-studio-world-v2-art\.test\.mjs/u,
    "원본 타일과 캐릭터의 무결성 검사를 실행해야 합니다.");
  const scratch = mkdtempSync(join(tmpdir(), "virtual-studio-ci-inputs-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, env: fixtureGitEnvironment(scratch), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "--quiet");
    for (const file of [world, ...excluded, "package.json"]) {
      const path = join(scratch, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "{}\n");
    }
    git("add", ".");
    git("-c", "user.name=Virtual Studio CI Test", "-c", "user.email=ci@example.invalid",
      "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    for (const lane of ["lint", "typecheck", "static"]) {
      const checkout = sparsePatterns(job(lane));
      writeFileSync(join(scratch, ".git/info/sparse-checkout"), `${checkout.join("\n")}\n`);
      git("read-tree", "-mu", "HEAD");
      assert.ok(existsSync(join(scratch, world)), `${lane} must include imported world JSON`);
      for (const file of excluded) assert.equal(existsSync(join(scratch, file)), false,
        `${lane} must not download artwork/model binaries: ${file}`);
    }
    writeFileSync(join(scratch, ".git/info/sparse-checkout"), `${foundationPatterns.join("\n")}\n`);
    git("read-tree", "-mu", "HEAD");
    for (const file of [world, ...requiredArt]) assert.ok(existsSync(join(scratch, file)),
      `foundation must retain its real art test input: ${file}`);
    for (const file of unrelatedArt) assert.equal(existsSync(join(scratch, file)), false,
      `foundation must still exclude unrelated artwork/models: ${file}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("product 초기 checkout은 문서 정본을 포함하고 대형 아트는 제외한다", () => {
  const patterns = sparsePatterns(job("static"), { shard: "product" });
  for (const path of [
    "/docs/",
    "/apps/web/public/assets/3d/outfits/README.md",
    "/apps/web/public/assets/studio/cc0-20260906/README.md",
    "/apps/web/public/assets/3d/LICENSES.md",
    "/apps/web/public/assets/3d/environments/expansion-v1/LICENSES.md",
    "/apps/web/public/assets/3d/environments/mcp-free-v1/LICENSES.md",
    "/apps/web/public/assets/3d/environments/authored-v1/LICENSES.md",
    "/apps/web/public/assets/3d/environments/refined-v6/LICENSES.md",
    "/apps/web/public/assets/3d/environments/webtoon-v7/LICENSES.md",
    "/apps/web/public/assets/3d/refined-v8/LICENSES.md",
    "/apps/web/public/vrm/LICENSES.md",
    "/tests/benchmarks/results/app-startup-perf.json",
    "/tests/benchmarks/results/i18n-fix.json",
  ]) assert.ok(patterns.includes(path), `초기 product 문서 누락: ${path}`);
  assert.doesNotMatch(job("static"), /Restore documentation authority for product regressions/u);
});

test("다섯 shard는 기존 48개와 foundation 추가 63개 선언을 최초 checkout에서 정확히 보존한다", () => {
  const asset = "/apps/web/public/assets/";
  const foundationInputs = [
    "/apps/web/public/assets/3d/environments/bundle-v1/deploy-index.b90b58fd4c87e9fddb2e39a7f1cbeb75ce93f0bc19f4f1cc053ac696e55e377c.json",
    "/apps/web/public/assets/3d/environments/bundle-v1/theme-packs.e855c272c15db1f75a7a398c93f01c9ce6ff27342f2b10b2707e4daf9abe3ce4.json",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/cgi-director-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/cgi-director-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/chief-pd-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/chief-pd-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/colorist-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/colorist-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/line-artist-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/cast/line-artist-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/diverse-creator-cast-clean-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/four-studio-themes-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/cyber-neon-lab.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/hanok-botanical-atelier.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/lofi-cat-storyhouse.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v11/themes/seoul-editorial-hq.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/action-mocap-actor-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/action-mocap-actor-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/sound-letterer-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/sound-letterer-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/story-writer-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/story-writer-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/studio-cat-mascot-idle.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/cast/studio-cat-mascot-work.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/genre-studio-themes-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/specialist-cast-clean-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/brooklyn-indie-comics-loft.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/murim-bamboo-pavilion.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/romance-palace-conservatory.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v12/themes/scifi-orbital-command.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/creator-emote-and-walk-sheet.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/celebrate-highfive.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/coffee-cat-break.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/crunch-flame-focus.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/emotes/stride-walk.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/four-more-studio-themes-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/blender-hologram-stage-table.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/deadline-espresso-cat-lounge.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/dual-cintiq-critique-pod.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/props/webtoon-sound-foley-booth.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/abyssal-bioluminescent-worldlab.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/dolby-sound-dubbing-studio.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/magic-academy-astral-library.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v13/webtoon-props-and-zones-atlas.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/global-ip-pitch-boardroom.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/recruit-interview-conservatory.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/retro-arcade-gacha-lounge.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/tarot-story-oracle-pavilion.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-down.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-left.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-right.webp",
    "/apps/web/public/assets/virtual-studio/studio-art-v14/walk/creator-walk-up.webp",
    "/apps/web/public/vrm/LICENSES.md",
    ...["Sendagaya_Shino", "Sendagaya_Shibu", "Kate", "Jennifer", "Erika", "Olivia", "Jimmy", "Anna", "Cyberpal"].map((id) => `/apps/web/public/vrm/${id}.vrm`),
  ];
  const owned = {
    product: ["/docs/", ...[
      "3d/outfits/README.md", "studio/cc0-20260906/README.md", "3d/LICENSES.md",
      ...["expansion-v1", "mcp-free-v1", "authored-v1", "refined-v6", "webtoon-v7"].map((id) => `3d/environments/${id}/LICENSES.md`),
      "3d/refined-v8/LICENSES.md",
    ].map((path) => asset + path), "/apps/web/public/vrm/LICENSES.md",
    "/tests/benchmarks/results/app-startup-perf.json", "/tests/benchmarks/results/i18n-fix.json"],
    "studio-foundation": [
      ...["production-v2", "living-world", "drawn-characters-v1", "ambient-audio", "npc-cast-v1", "npc-cast-v2", "npc-cast-v3", "npc-cast-v4", "characters-lpc-v1", "portraits-v1", "art-v4", "style-packs", "style-packs-v5", "living-town-v6", "imagegen25-v7", "experience-v8", "cinematic-v9", "world-v2", "office-cast-v2", "office-themes-v1"].map((id) => `${asset}virtual-studio/${id}/`),
      `${asset}virtual-studio/art-v4-manifest.json`, `${asset}studio/props/`,
      `${asset}virtual-studio/toon-office-v1/characters/`, `${asset}studio/illustration-20260926/`,
      `${asset}studio/bundle-renders-v1/`, `${asset}studio/bundle-scenes-v1/`, `${asset}virtual-studio/bundle-decor-v1/`,
      ...foundationInputs,
    ],
    "studio-editing": [],
    "studio-3d": [`${asset}3d/environments/authored-v1/`],
    "studio-character": ["Sendagaya_Shibu", "Sendagaya_Shino", "Sakurada_Fumiriya", "AliciaSolid", "Darkness_Shibu", "Jimmy", "Jennifer"].map((id) => `/apps/web/public/vrm/${id}.vrm`),
  };
  assert.equal(foundationInputs.length, 63);
  assert.equal(new Set(foundationInputs).size, 63);
  assert.ok(foundationInputs.every((path) => !path.endsWith("/")), "추가 입력은 개별 파일이어야 합니다.");
  assert.deepEqual(Object.values(owned).map((paths) => paths.length), [13, 90, 0, 1, 7]);
  const declarations = [...job("static").matchAll(/\$\{\{ matrix\.shard == '([^']+)' && '([^']+)' \|\| '' \}\}/gu)];
  assert.match(job("static"), /persist-credentials: false/u);
  assert.match(job("static"), /sparse-checkout-cone-mode: false/u);
  assert.equal(declarations.length, 111, "기존 48개와 foundation 63개 선언을 정확히 보존해야 합니다.");
  assert.equal(new Set(declarations.map((match) => match[2])).size, 106, "라이선스와 character도 검사하는 네 VRM만 shard 사이에 공유합니다.");
  for (const [shard, paths] of Object.entries(owned)) {
    assert.deepEqual(declarations.filter((match) => match[1] === shard).map((match) => match[2]).sort(), [...paths].sort(), shard);
  }
  const root = mkdtempSync(join(tmpdir(), "core-shard-initial-checkout-"));
  const env = fixtureGitEnvironment(root);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  const input = (path) => `${path.slice(1)}${path.endsWith("/") ? "fixture-payload.bin" : ""}`;
  const world = "apps/web/public/assets/virtual-studio/world/default-world.json";
  const unrelated = ["apps/web/public/assets/unrelated/large.glb", "apps/web/public/vrm/unrelated.vrm", "artifacts/unrelated.bin",
    "apps/web/public/assets/virtual-studio/studio-art-v11/unrelated-large.webp",
    "apps/web/public/assets/3d/environments/bundle-v1/unrelated-large.glb"];
  try {
    git("init", "--quiet");
    for (const file of [world, ...Object.values(owned).flat().map(input), ...unrelated, "package.json"]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), "fixture\n");
    }
    git("add", ".");
    git("-c", "user.name=CI Fixture", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    for (const shard of Object.keys(owned)) {
      writeFileSync(join(root, ".git/info/sparse-checkout"), `${sparsePatterns(job("static"), { shard }).join("\n")}\n`);
      git("read-tree", "-mu", "HEAD");
      assert.ok(existsSync(join(root, world)), `${shard}: 공통 메타데이터 누락`);
      for (const [owner, paths] of Object.entries(owned)) {
        for (const path of paths) {
          // 3D 팩 전체에 속한 라이선스는 기존 팩 복원에도 포함되던 공통 입력이다.
          const sharedPackLicense = shard === "studio-3d" && path === `${asset}3d/environments/authored-v1/LICENSES.md`;
          const ownedByShard = owned[shard].includes(path);
          assert.equal(existsSync(join(root, input(path))), ownedByShard || sharedPackLicense, `${shard}: ${owner} 입력 경계 ${path}`);
        }
      }
      for (const file of unrelated) assert.equal(existsSync(join(root, file)), false, `${shard}: 무관한 대형 자산 ${file}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("static regression checkout retains all imported 3D manifests but excludes their model payloads", () => {
  const patterns = sparsePatterns(job("static"));
  const manifests = ["refined-v6", "expansion-v1", "webtoon-v7"].map((pack) => `apps/web/public/assets/3d/environments/${pack}/manifest.json`);
  const models = ["refined-v6/hospital_reception.glb", "expansion-v1/library_reading_room.glb", "webtoon-v7/webtoon_rooftop_utility_platform.glb", "unrelated/large.glb"].map((file) => `apps/web/public/assets/3d/environments/${file}`);
  const scratch = mkdtempSync(join(tmpdir(), "core-3d-manifests-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, env: fixtureGitEnvironment(scratch), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "--quiet");
    for (const file of [...manifests, ...models, "package.json"]) { mkdirSync(dirname(join(scratch, file)), { recursive: true }); writeFileSync(join(scratch, file), "{}\n"); }
    git("add", ".");
    git("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true"); git("config", "core.sparseCheckoutCone", "false");
    writeFileSync(join(scratch, ".git/info/sparse-checkout"), `${patterns.join("\n")}\n`); git("read-tree", "-mu", "HEAD");
    for (const file of manifests) assert.ok(existsSync(join(scratch, file)), `missing 3D import: ${file}`);
    for (const file of models) assert.equal(existsSync(join(scratch, file)), false, `unrelated binary admitted: ${file}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("번들 sparse checkout은 작은 manifest와 실제 회귀가 읽는 래스터만 복원한다", () => {
  const roots = ["studio/bundle-renders-v1", "studio/bundle-scenes-v1", "virtual-studio/bundle-decor-v1"];
  const prefix = "apps/web/public/assets/";
  const manifests = roots.map((root) => `${prefix}${root}/manifest.json`);
  const [renders, scenes, decor] = manifests.map((file) => JSON.parse(readFileSync(join(repoRoot, file), "utf8")));
  const rasters = [
    ...renders.assets.filter((asset) => typeof asset.sha256 === "string")
      .flatMap((asset) => [asset.path, asset.previewPath].map((path) => `${prefix}${roots[0]}/${path}`)),
    ...scenes.assets.flatMap((asset) => [asset.src, asset.previewSrc].map((path) => `apps/web/public${path}`)),
    ...decor.assets.map((asset) => `${prefix}${roots[2]}/${asset.path}`),
  ];
  assert.equal(new Set(rasters).size, rasters.length);
  const metadata = ["3d/environments/bundle-v1/theme-packs.json", "virtual-studio/bundle-v1/manifest.json"].map((path) => prefix + path);
  for (const file of [...manifests, ...metadata, ...rasters]) {
    assert.match(file, /^apps\/web\/public\/assets\/[A-Za-z0-9_/-]+\.(?:json|webp)$/u,
      `임시 Git fixture 밖의 경로는 허용하지 않습니다: ${file}`);
  }
  const excluded = ["studio/bundle-v2/private-model.glb", "studio/unrelated/large.webp", "3d/unrelated/model.glb"].map((path) => prefix + path);
  const requiredPatterns = roots.map((root) => `/${prefix}${root}/`);
  const foundationPatterns = sparsePatterns(job("static"), { shard: "studio-foundation" });
  for (const path of requiredPatterns) assert.ok(foundationPatterns.includes(path), `초기 번들 본문 누락: ${path}`);
  const scratch = mkdtempSync(join(tmpdir(), "core-bundle-sparse-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, env: fixtureGitEnvironment(scratch), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  const apply = (block, context) => {
    const patterns = sparsePatterns(block, context);
    writeFileSync(join(scratch, ".git/info/sparse-checkout"), `${patterns.join("\n")}\n`);
    git("read-tree", "-mu", "HEAD");
  };
  try {
    git("init", "--quiet");
    for (const file of [...manifests, ...metadata, ...rasters, ...excluded, "package.json"]) {
      mkdirSync(dirname(join(scratch, file)), { recursive: true }); writeFileSync(join(scratch, file), "fixture\n");
    }
    git("add", ".");
    git("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true"); git("config", "core.sparseCheckoutCone", "false");
    for (const lane of ["lint", "typecheck", "static"]) {
      apply(job(lane));
      for (const file of manifests) assert.ok(existsSync(join(scratch, file)), `${lane}: manifest 누락 ${file}`);
      for (const file of rasters) assert.equal(existsSync(join(scratch, file)), false, `${lane}: 무관한 래스터 다운로드 ${file}`);
    }
    apply(job("static"), { shard: "studio-foundation" });
    for (const file of [...manifests, ...metadata, ...rasters]) assert.ok(existsSync(join(scratch, file)), `foundation 입력 누락 ${file}`);
    const focused = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
    apply(focused);
    for (const file of rasters) assert.equal(existsSync(join(scratch, file)), false, `manual smoke의 불필요한 번들 본문 ${file}`);
    assert.doesNotMatch(focused, /git sparse-checkout add/u, "PR 본문도 인증 범위 안에서 최초 checkout해야 합니다.");
    apply(focused, { eventName: "pull_request" });
    for (const file of [...manifests, ...metadata, ...rasters]) assert.ok(existsSync(join(scratch, file)), `related 테스트 입력 누락 ${file}`);
    for (const file of excluded) assert.equal(existsSync(join(scratch, file)), false, `무관한 모델·래스터 복원 ${file}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("production build verifies Virtual Studio art after the single existing build", () => {
  const build = job("build");
  const buildAt = build.indexOf("pnpm run build:bundle");
  const testsAt = build.indexOf("pnpm run test:studio-virtual-art");
  const verificationAt = build.indexOf("pnpm run verify:studio-virtual-art");
  assert.ok(buildAt >= 0 && testsAt > buildAt && verificationAt > testsAt,
    "the protected build must run art regression tests and output integrity verification");
  assert.equal(build.split("pnpm run build:bundle").length - 1, 1);
  assert.doesNotMatch(build, /sparse-checkout:/u, "art verification needs the existing full build checkout");
});

test("PR caches restore without paying cache-save post steps", () => {
  for (const [name, cacheId] of [
    ["lint", "eslint-cache"],
    ["typecheck", "typescript-cache"],
  ]) {
    const block = job(name);
    assert.match(block, new RegExp(`id: ${cacheId}\\n\\s+uses: actions/cache/restore@v\\d+`));
    assert.match(block, /uses: actions\/cache\/save@v\d+/);
    assert.match(block, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    assert.doesNotMatch(block, /uses: actions\/cache@v\d+/);
  }
});

test("the required Vitest manifest is sorted, unique, resolvable and executed once", () => {
  assert.deepEqual(requiredTargets, [...requiredTargets].sort());
  assert.equal(new Set(requiredTargets).size, requiredTargets.length);
  assert.ok(requiredTargets.length >= 160, "unexpected regression coverage shrink");
  for (const target of requiredTargets) {
    assert.ok(targetExists(target), `missing mandatory Vitest target: ${target}`);
  }
  assert.ok(
    job("static").includes('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"'),
  );
});

test("semantic regression lanes delegate ownership to the shard runner", () => {
  const block = job("static");
  const install = block.indexOf("pnpm install --frozen-lockfile");
  const runner = block.indexOf('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"');
  assert.ok(install >= 0 && runner > install);
  assert.equal(
    block.split("node scripts/ci-core-regression-shards.mjs").length - 1,
    1,
    "each matrix lane must invoke exactly one semantic shard runner",
  );
});

test("production visual audit and protected core share the Vitest policy suite", () => {
  const audit = readFileSync(
    new URL("../.github/workflows/studio-3d-production-visual-audit.yml", import.meta.url),
    "utf8",
  );
  assert.ok(audit.includes("      - name: Verify audit policy\n        run: pnpm exec vitest run scripts/lib/studio-3d-production-audit-policy.test.mjs\n"));
  assert.doesNotMatch(audit, /node\s+--test\s+scripts\/lib\/studio-3d-production-audit-policy\.test\.mjs/);
  assert.ok(requiredTargets.includes("scripts/lib/studio-3d-production-audit-policy.test.mjs"));
  assert.ok(
    job("static").includes('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"'),
  );
});
test("manual validation cannot cancel push validation and retries retain evidence", () => {
  assert.ok(source.includes(
    "group: core-v3-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}",
  ));
  assert.ok(job("serial").includes("name: core-serial-attempt-${{ github.run_attempt }}"));
  assert.ok(job("build").includes("name: core-build-attempt-${{ github.run_attempt }}"));
});

test("ToonStudio session validation shares one setup and delegates full gates to protected core", () => {
  const session = readFileSync(
    new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url),
    "utf8",
  );
  const sessionJobs = session.slice(session.indexOf("\njobs:\n") + 7)
    .split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m)
    .filter((entry) => /^ {2}[a-z][a-z0-9-]*:\n/.test(entry));
  assert.equal(sessionJobs.length, 1, "session validation should pay setup cost once");
  assert.match(session, /filter: blob:none/);
  assert.match(session, /!\/apps\/web\/public\/assets\//);
  assert.match(session, /git diff --no-renames --name-only -z --diff-filter=ACMR "\$BASE_SHA" HEAD/);
  assert.match(session, /pnpm exec eslint --max-warnings=0 --no-warn-ignored/);
  assert.match(session, /pnpm exec vitest related/);
  assert.doesNotMatch(session, /lint:quick|pnpm (?:run )?build(?:\s|$)|pnpm exec tsc/);
});

test("PR 전체 이력의 filtered merge checkout은 추가 인증 없이 기준 tree와 현재 변경 경로를 읽는다", () => {
  const focused = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
  assert.ok(focused.includes("fetch-depth: ${{ github.event_name != 'pull_request' && 1 || 0 }}"));
  assert.match(focused, /persist-credentials: false/u);
  assert.doesNotMatch(focused, /git fetch/u, "인증이 끝난 뒤 원격에서 기준 커밋을 다시 받으면 안 됩니다.");
  const steps = focused.split(/(?=^ {6}- )/mu);
  const baseStep = steps.find((step) => step.startsWith("      - name: PR 기준 커밋 존재 확인\n"));
  const selector = steps.find((step) => step.startsWith("      - name: Collect changed ToonStudio sources\n"));
  assert.ok(baseStep && selector);
  assert.match(baseStep, /if: github\.event_name == 'pull_request'/u);
  assert.match(baseStep, /run: git cat-file -e "\$BASE_SHA\^\{commit\}"/u);
  for (const step of [baseStep, selector]) {
    assert.ok(step.includes("BASE_SHA: ${{ github.event.pull_request.base.sha }}"));
    assert.match(step, /GIT_NO_LAZY_FETCH: ['"]1['"]/u);
  }
  const command = selector.match(/^ {8}run: \|\n((?: {10}[^\n]*\n)+)/mu)?.[1].replace(/^ {10}/gmu, "");
  assert.ok(command);
  assert.match(command, /git diff --no-renames --name-only -z --diff-filter=ACMR "\$BASE_SHA" HEAD --/u);
  const root = mkdtempSync(join(tmpdir(), "focused-filtered-base-"));
  const repository = join(root, "remote");
  const workspace = join(root, "workspace");
  const env = fixtureGitEnvironment(root);
  const runGit = (cwd, args, extra = {}) => spawnSync("git", args, { cwd, env: { ...env, ...extra }, encoding: "utf8" });
  const git = (cwd, ...args) => {
    const result = runGit(cwd, args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const write = (file, body) => {
    mkdirSync(dirname(join(repository, file)), { recursive: true });
    writeFileSync(join(repository, file), body);
  };
  const identity = ["-c", "user.name=CI Fixture", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false"];
  try {
    mkdirSync(repository);
    git(repository, "init", "--quiet", "-b", "main");
    git(repository, "config", "uploadpack.allowFilter", "true");
    write("apps/web/src/domains/fixture/rename-old.ts", "export const original = 1;\n".repeat(300));
    write("apps/web/src/domains/fixture/modified.ts", "export const version = 1;\n");
    write("apps/web/src/domains/fixture/deleted.ts", "export const removed = true;\n");
    write("apps/web/src/domains/fixture/unchanged.ts", "export const unchanged = true;\n");
    write("outside/ignored.ts", "export const outside = 1;\n");
    git(repository, "add", ".");
    git(repository, ...identity, "commit", "--quiet", "-m", "base");
    const baseSha = git(repository, "rev-parse", "HEAD");
    const baseTree = git(repository, "rev-parse", "HEAD^{tree}");
    const oldBlob = git(repository, "rev-parse", "HEAD:apps/web/src/domains/fixture/rename-old.ts");
    git(repository, "checkout", "--quiet", "-b", "feature");
    git(repository, "mv", "apps/web/src/domains/fixture/rename-old.ts", "apps/web/src/domains/fixture/rename-new.ts");
    write("apps/web/src/domains/fixture/rename-new.ts", `${"export const original = 1;\n".repeat(299)}export const original = 2;\n`);
    write("apps/web/src/domains/fixture/modified.ts", "export const version = 2;\n");
    write("apps/web/src/domains/fixture/new.ts", "export const added = true;\n");
    write("outside/ignored.ts", "export const outside = 2;\n");
    rmSync(join(repository, "apps/web/src/domains/fixture/deleted.ts"));
    git(repository, "add", "-A");
    git(repository, ...identity, "commit", "--quiet", "-m", "feature");
    git(repository, "checkout", "--quiet", "main");
    git(repository, ...identity, "merge", "--quiet", "--no-ff", "feature", "-m", "merge");
    git(root, "clone", "--quiet", "--filter=blob:none", "--depth=2", "--no-checkout", `file://${repository}`, workspace);
    git(workspace, "remote", "set-url", "origin", `file://${join(root, "unavailable-remote")}`);
    const noFetch = { GIT_NO_LAZY_FETCH: "1" };
    assert.equal(runGit(workspace, ["cat-file", "-e", `${baseSha}^{commit}`], noFetch).status, 0);
    assert.equal(runGit(workspace, ["cat-file", "-e", baseTree], noFetch).status, 0);
    assert.notEqual(runGit(workspace, ["cat-file", "-e", oldBlob], noFetch).status, 0, "필터된 기준 원문 blob은 없어야 합니다.");
    const result = spawnSync("bash", ["-c", command], {
      cwd: workspace, env: { ...env, ...noFetch, BASE_SHA: baseSha, RUNNER_TEMP: root }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const actual = readFileSync(join(root, "toonstudio-related-files"), "utf8").split("\0").filter(Boolean).sort();
    assert.deepEqual(actual, ["apps/web/src/domains/fixture/modified.ts", "apps/web/src/domains/fixture/new.ts", "apps/web/src/domains/fixture/rename-new.ts"]);
    assert.notEqual(runGit(workspace, ["cat-file", "-e", oldBlob], noFetch).status, 0, "경로 비교가 기준 원문을 내려받으면 안 됩니다.");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("focused integration checks cannot collide with the protected core status", () => {
  const integration = readFileSync(
    new URL("../.github/workflows/toonstudio-integration.yml", import.meta.url),
    "utf8",
  );
  const start = integration.indexOf("\n  validate:\n");
  assert.ok(start >= 0, "missing focused integration validation job");
  const validation = integration.slice(start);
  const displayName = validation.match(/^ {4}name: (.+)$/m)?.[1];
  assert.ok(displayName, "integration checks must declare a namespaced display name");
  const tracks = ["core", "ui", "editor"];
  const checks = tracks.map((track) => displayName.replace("${{ matrix.track }}", track));
  assert.deepEqual(checks, tracks.map((track) => `ToonStudio integration / ${track}`));
  assert.equal(new Set(checks).size, tracks.length);
  assert.ok(checks.every((name) => name !== "core" && name !== "verify"));
  assert.match(job("core"), /^ {4}name: core$/m, "preserve protected merge gate");
  assert.match(
    validation,
    /run: bash scripts\/verify-toonstudio-integration\.sh "\$\{\{ matrix\.track \}\}"/,
  );
});


test("focused ToonStudio checkout includes imported metadata, validated artwork and fault evidence without unrelated inputs", () => {
  const workflow = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
  const patterns = sparsePatterns(workflow);
  const manifests = ["3d/environments/refined-v6/manifest.json", "3d/environments/expansion-v1/manifest.json", "3d/environments/webtoon-v7/manifest.json", "3d/environments/mcp-free-v1/manifest.json", "virtual-studio/world/default-world.json"].map((file) => `apps/web/public/assets/${file}`);
  const validatedArt = [
    "world-v2/characters/pixel-maker/manifest.json",
    ...["down", "right", "left", "up"].map((direction) => `world-v2/characters/pixel-maker/walk-${direction}.png`),
    "style-packs-v5/art-v5-manifest.json",
    ...["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]
      .map((style) => `style-packs-v5/${style}/npcs/npc-producer-walk-down.webp`),
    "cinematic-v9/art-manifest.json",
    ...["campus-day", "campus-garden", "campus-social", "studio-tour"].flatMap((id) => [480, 1024].map((width) => `cinematic-v9/${id}-${width}.webp`)),
    "experience-v8/art-manifest.json",
    "experience-v8/npc-art-manifest.json",
    "experience-v8/avatar-webtoon.png",
    "experience-v8/npc-concierge.png",
    "experience-v8/landmarks-pastel.png",
    "experience-v8/backdrop-neon-city.png",
  ].map((file) => `apps/web/public/assets/virtual-studio/${file}`);
  const requiredInputs = [...manifests, ...validatedArt];
  const faultEvidence = "tests/benchmarks/results/v12-runtime-fault-matrix.json";
  const unrelatedResult = "tests/benchmarks/results/unrelated-benchmark.json";
  const artwork = "apps/web/public/assets/3d/environments/unrelated-pack/large-model.glb";
  const scratch = mkdtempSync(join(tmpdir(), "toonstudio-focused-inputs-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: scratch, env: fixtureGitEnvironment(scratch), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "--quiet");
    for (const file of [...requiredInputs, faultEvidence, unrelatedResult, artwork, "package.json"]) {
      mkdirSync(dirname(join(scratch, file)), { recursive: true });
      writeFileSync(join(scratch, file), "{}\n");
    }
    git("add", ".");
    git("-c", "user.name=CI Test", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    writeFileSync(join(scratch, ".git/info/sparse-checkout"), `${patterns.join("\n")}\n`);
    git("read-tree", "-mu", "HEAD");
    for (const file of [...requiredInputs, faultEvidence]) assert.ok(existsSync(join(scratch, file)), `missing import: ${file}`);
    assert.equal(existsSync(join(scratch, unrelatedResult)), false);
    assert.equal(existsSync(join(scratch, artwork)), false);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});


test("reference-project certification executes the real entrypoint and emits its receipt", () => {
  const workflow = readFileSync(new URL("../.github/workflows/studio-competitor-replacement-certification.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("node scripts/verify-studio-reference-projects.mjs --run --receipt qa-results/studio-reference-projects/receipt.json"));
  assert.doesNotMatch(workflow, /pnpm run verify:studio-reference-projects\b/u);
  assert.ok(existsSync(join(repoRoot, "scripts/verify-studio-reference-projects.mjs")));
  assert.match(workflow, /path: qa-results\/studio-reference-projects/u);
  assert.doesNotMatch(workflow, /continue-on-error|--check\b/u);
});


test("focused session checkout retains every non-brand route-purpose image", () => {
  const focused = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
  const profiles = readFileSync(new URL("../apps/web/src/shared/lib/site-route-visual.ts", import.meta.url), "utf8");
  const images = [...new Set([...profiles.matchAll(/image:\s*"(\/assets\/[^"\n]+)"/gu)].map((match) => match[1]))];
  assert.ok(images.length >= 2, "route-purpose fixture must include both spatial and review artwork");
  for (const image of images) {
    const trackedPath = join("apps/web/public", image.slice(1));
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", trackedPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(
      tracked.status,
      0,
      `route-purpose artwork is missing from the repository: ${image}
${tracked.stderr}`,
    );
    assert.ok(
      focused.includes(`/apps/web/public${image}`),
      `focused checkout omits actual route-purpose artwork: ${image}`,
    );
  }
});


test("full-suite health probes cannot race the target database's NOLOGIN bootstrap gate", () => {
  for (const name of ["full-test-diagnostic.yml"]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
    assert.match(workflow, /POSTGRES_DB: studio_full_integration/u);
    assert.match(workflow, /--health-cmd "pg_isready -U studio_full_test -d postgres"/u);
    assert.doesNotMatch(workflow, /--health-cmd [^\n]*-d studio_full_integration/u);
    assert.match(workflow, /node scripts\/bootstrap-empty-production-database\.mjs --execute --allow-loopback/u);
    assert.match(workflow, /node scripts\/run-full-test-ci\.mjs/u);
    assert.doesNotMatch(workflow, /continue-on-error/u);
  }
  const bootstrap = readFileSync(new URL("./bootstrap-empty-production-database.mjs", import.meta.url), "utf8");
  assert.ok(bootstrap.includes("database client raced the runtime login gate"));
  assert.ok(bootstrap.includes("ALTER ROLE %I NOLOGIN"));
});

test("제작 보드의 실제 브라우저 검증과 증거가 필수 접근성 lane에 연결된다", () => {
  const source = job("a11y");
  assert.match(source, /run: pnpm exec playwright test --config playwright\.production-workflows\.config\.ts/u);
  assert.match(source, /path: \.qa\/production-workflows/u);
  assert.ok(source.indexOf("pnpm run test:a11y") < source.indexOf("playwright.production-workflows.config.ts"));
  assert.doesNotMatch(source, /continue-on-error|\|\| true/u);
});
