import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const read = (name) => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
const integration = parse(read("toonstudio-integration"));
const core = parse(read("ci"));
const title = "체크아웃 전 미사용 SDK 정리와 디스크 여유 확인";

test("통합 작업은 검증된 Core SDK 정리의 안전 경계를 그대로 사용한다", () => {
  const job = integration.jobs.validate;
  assert.equal(job["runs-on"], "ubuntu-24.04");
  const index = job.steps.findIndex((s) => s.name === title);
  const checkout = job.steps.findIndex((s) => s.uses?.startsWith("actions/checkout@"));
  assert(index >= 0 && index < checkout);
  const cleanup = job.steps[index];
  const approved = core.jobs.build.steps.find((s) => s.name === title);
  assert.deepEqual(cleanup, approved, "기존 shell·환경 가드·삭제 경로·20GiB 경계를 모두 유지합니다.");
  assert.match(cleanup.run, /available_bytes < 21474836480/u);
});

test("디스크 정리는 통합 입력·시험·캐시·시간 제한을 축소하지 않는다", () => {
  const job = integration.jobs.validate;
  assert.equal(job["timeout-minutes"], 24);
  assert.equal(job.strategy["fail-fast"], false);
  const checkout = job.steps.find((s) => s.uses?.startsWith("actions/checkout@"));
  assert(checkout.with["sparse-checkout"].split("\n").includes("apps/web/public"));
  assert.equal(checkout.with["persist-credentials"], false);
  const node = job.steps.find((s) => s.uses?.startsWith("actions/setup-node@"));
  assert.equal(node.with.cache, "pnpm");
  assert(job.steps.some((s) => s.run === "pnpm install --frozen-lockfile --prefer-offline"));
  assert(job.steps.some((s) => s.run === 'bash scripts/verify-toonstudio-integration.sh "${{ matrix.track }}"'));
  assert.doesNotMatch(read("toonstudio-integration"), /continue-on-error/u);
  assert.doesNotMatch(readFileSync(new URL("./verify-toonstudio-integration.sh", import.meta.url), "utf8"), /android|dotnet|sdkmanager|gradlew/iu);
});


test("브러시 build·browser는 Core와 같은 SDK 정리·20 GiB 게이트를 체크아웃 전에 사용한다", () => {
  const brush = parse(read("studio-brush-filter-stability"));
  const approved = core.jobs.build.steps.find((step) => step.name === title);
  for (const id of ["build", "browser"]) {
    const job = brush.jobs[id];
    assert.equal(job["runs-on"], "ubuntu-24.04");
    const cleanup = job.steps.findIndex((step) => step.name === title);
    const checkout = job.steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
    assert(cleanup >= 0 && cleanup < checkout);
    assert.deepEqual(job.steps[cleanup], approved, `${id}: 기존 SDK 환경·경로·여유 검사를 보존합니다.`);
  }
});

test("브러시 디스크 보완은 전체 입력·산출물·matrix·검증을 유지하고 전후 측정만 더한다", () => {
  const source = read("studio-brush-filter-stability");
  const brush = parse(source), job = brush.jobs.browser;
  assert.deepEqual(job.strategy.matrix.suite, ["filters", "desktop", "long", "shapes", "mobile", "durability", "source"]);
  assert.equal(job.strategy["fail-fast"], false);
  assert.equal(job["timeout-minutes"], 100);
  assert.equal(brush.jobs.build["timeout-minutes"], 25);
  for (const id of ["build", "browser"]) {
    const checkout = brush.jobs[id].steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    assert.equal(checkout.with?.["sparse-checkout"], undefined, "전체 원본·public 입력을 유지합니다.");
  }
  const download = job.steps.findIndex((step) => step.uses?.startsWith("actions/download-artifact@"));
  assert.deepEqual(job.steps[download].with, { name: "studio-stability-dist", path: "dist" });
  for (const offset of [-1, 1]) {
    const measurement = job.steps[download + offset];
    assert.match(measurement.name, /전체 빌드 산출물 수신 (?:전|후) 디스크·inode 사용량 기록/u);
    for (const command of ["df -P -B1", "df -Pi", "du -s -B1", "apps/web/public", "node_modules", "$RUNNER_TEMP"]) assert(measurement.run.includes(command));
    assert.doesNotMatch(measurement.run, /\brm\b|\bsudo\b|\bfind\b|\btruncate\b/u);
  }
  const artifact = brush.jobs.build.steps.find((step) => step.with?.name === "studio-stability-dist");
  assert.deepEqual(artifact.with, { name: "studio-stability-dist", path: "dist", "include-hidden-files": true, "retention-days": 3 });
  assert(job.steps.some((step) => step.run === "pnpm exec playwright install --with-deps chromium"));
  assert(job.steps.some((step) => step.run === "pnpm run verify:studio-brushes"));
  assert(job.steps.some((step) => step.run === "test -s dist/.vite/manifest.json"));
  assert.doesNotMatch(source, /continue-on-error|[|][|] true/u);
});
