import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const read = (name) => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
const title = "체크아웃 전 미사용 SDK 정리와 디스크 여유 확인";
const approved = parse(read("ci")).jobs.build.steps.find((step) => step.name === title);
for (const [workflow, jobId, timeout, runner = "ubuntu-24.04"] of [
  ["studio-production-integrity", "production-integrity", 25],
  ["lighthouse-ci", "lighthouse", 30],
  ["full-test-diagnostic", "full-test", 90],
  ["studio-finishing-quality", "quality-static", 45],
  ["studio-finishing-quality", "finishing-quality", 60],
  ["feedback-community-validation", "feedback-community", 60, "ubuntu-latest"],
  ["kmas-reference-library", "references", 20, "ubuntu-latest"],
  ["non-studio-experience-quality", "non-studio-quality", 45],
  ["main-full-qa-studio", "studio-audit", 240],
]) {
  test(`${workflow}/${jobId}는 기존 Core SDK 정리 안전 경계를 체크아웃 전에 사용한다`, () => {
    const job = parse(read(workflow)).jobs[jobId];
    assert.equal(job["runs-on"], runner);
    assert.equal(job["timeout-minutes"], timeout);
    const cleanup = job.steps.findIndex((step) => step.name === title);
    const checkout = job.steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
    assert(cleanup >= 0 && cleanup < checkout);
    const expected = structuredClone(approved);
    if (runner === "ubuntu-latest") expected.run = expected.run
      .replace('"${ImageOS:-}" != ubuntu24', '( "${ImageOS:-}" != ubuntu24 && "${ImageOS:-}" != ubuntu26 )')
      .replace("Ubuntu 24.04에서만", "Ubuntu 24.04 또는 26.04에서만");
    assert.deepEqual(job.steps[cleanup], expected);
    if (runner === "ubuntu-latest") {
      assert.equal(spawnSync("bash", ["-n", "-c", expected.run]).status, 0);
      // 삭제 명령을 실행하지 않고 첫 환경 경계식만 별도로 평가한다.
      const predicate = expected.run.split("\n").find((line) => line.trim().startsWith("if [[ ")).trim()
        .replace('"$(uname -s)"', "Linux").replace(/; then$/u, "; then exit 1; else exit 0; fi");
      const environment = { PATH: process.env.PATH, GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", TOONSTUDIO_CI_RUNNER_ENVIRONMENT: "github-hosted", TOONSTUDIO_CI_RUNNER_OS: "Linux" };
      for (const image of ["ubuntu24", "ubuntu26", "ubuntu22", "ubuntu28", "unknown"]) {
        const result = spawnSync("bash", ["-c", predicate], { env: { ...environment, ImageOS: image } });
        assert.equal(result.status === 0, ["ubuntu24", "ubuntu26"].includes(image), image);
      }
      assert.notEqual(spawnSync("bash", ["-c", predicate], { env: { ...environment, ImageOS: "ubuntu26", RUNNER_ENVIRONMENT: "self-hosted" } }).status, 0);
    }
    if (workflow === "kmas-reference-library") assert.equal(job.steps[checkout].with, undefined);
    else assert.deepEqual(job.steps[checkout].with, { "persist-credentials": false });
    assert.equal(job.steps.find((step) => step.uses?.startsWith("actions/setup-node@")).with.cache, "pnpm");
    assert(job.steps.some((step) => step.run === "pnpm install --frozen-lockfile --prefer-offline"));
    assert(job.steps.some((step) => step.run === "node --test scripts/ci-enospc-followup-policy.test.mjs"));
    if (workflow === "main-full-qa-studio") {
      const install = job.steps.findIndex((step) => step.run === "pnpm install --frozen-lockfile --prefer-offline");
      const policy = job.steps.findIndex((step) => step.run === "node --test scripts/ci-enospc-followup-policy.test.mjs");
      assert(install < policy, "YAML 파서가 필요한 정책 검사는 의존성 설치 뒤에 실행한다");
    }
    // 피드백의 기존 결과 수집은 아래 엄격한 최종 집계 시험으로 검증한다.
    if (workflow !== "feedback-community-validation") assert.doesNotMatch(read(workflow), /continue-on-error/u);
  });
}
test("전체 진단은 실제 PostgreSQL·Rust·전체 시험과 성능 입력을 유지한다", () => {
  const job = parse(read("full-test-diagnostic")).jobs["full-test"];
  assert.equal(job.services.postgres.image, "postgres:16-alpine");
  assert(job.steps.some((step) => step.run?.includes("rustup toolchain install 1.97.0 --profile minimal --target wasm32-unknown-unknown")));
  assert(job.steps.some((step) => step.run?.includes("bootstrap-empty-production-database.mjs --execute --allow-loopback")));
  assert(job.steps.some((step) => step.run === "node scripts/run-full-test-ci.mjs"));
});
test("제작 통합은 실제 경로·Inspector·브라우저 검증을 유지한다", () => {
  const job = parse(read("studio-production-integrity")).jobs["production-integrity"];
  assert(job.steps.some((step) => step.run === "node --test scripts/ci-executed-gates.test.mjs"));
  assert(job.steps.some((step) => step.name === "Verify actual production routes and Inspector integration"));
  assert(job.steps.some((step) => step.name === "Inspect actual production browser"));
  assert(job.steps.some((step) => step.name === "Build production browser without repeating the core typecheck"));
});


test("피드백은 기존 전체 build·PostgreSQL·브라우저 검사와 모든 성공 집계를 유지한다", () => {
  const job = parse(read("feedback-community-validation")).jobs["feedback-community"];
  assert.equal(job.services.postgres.image, "postgres:16");
  assert(job.steps.some((step) => step.id === "production" && step.run === "pnpm run build 2>&1 | tee artifacts/feedback/production-build.log"));
  assert(job.steps.some((step) => step.id === "database" && step.run.includes("scripts/verify-feedback-community-db.mts")));
  assert(job.steps.some((step) => step.id === "browser" && step.run.includes("playwright test --config playwright.feedback.config.ts")));
  const gate = job.steps.find((step) => step.name === "Require every check to pass");
  assert.equal(gate.if, "always()");
  const keys = ["LINT", "TYPES", "UNIT", "DATABASE", "BROWSER_INSTALL", "BROWSER", "BUILD", "PRODUCTION"];
  assert.deepEqual(Object.keys(gate.env), keys);
  const success = Object.fromEntries(keys.map((key) => [key, "success"]));
  const invoke = (env) => spawnSync("bash", ["-c", gate.run], { env: { PATH: process.env.PATH, ...env } });
  assert.equal(invoke(success).status, 0);
  for (const key of keys) {
    for (const result of ["failure", "cancelled", "skipped", ""]) assert.notEqual(invoke({ ...success, [key]: result }).status, 0, `${key}/${result}`);
    const missing = { ...success }; delete missing[key];
    assert.notEqual(invoke(missing).status, 0, `${key}/missing`);
  }
});
