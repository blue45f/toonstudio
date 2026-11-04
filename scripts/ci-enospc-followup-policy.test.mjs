import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const read = (name) => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
const title = "체크아웃 전 미사용 SDK 정리와 디스크 여유 확인";
const approved = parse(read("ci")).jobs.build.steps.find((step) => step.name === title);
for (const [workflow, jobId, timeout] of [
  ["studio-production-integrity", "production-integrity", 25],
  ["full-test-diagnostic", "full-test", 90],
  ["studio-finishing-quality", "quality-static", 25],
  ["studio-finishing-quality", "finishing-quality", 30],
]) {
  test(`${workflow}/${jobId}는 기존 Core SDK 정리 안전 경계를 체크아웃 전에 사용한다`, () => {
    const job = parse(read(workflow)).jobs[jobId];
    assert.equal(job["runs-on"], "ubuntu-24.04");
    assert.equal(job["timeout-minutes"], timeout);
    const cleanup = job.steps.findIndex((step) => step.name === title);
    const checkout = job.steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
    assert(cleanup >= 0 && cleanup < checkout);
    assert.deepEqual(job.steps[cleanup], approved);
    assert.deepEqual(job.steps[checkout].with, { "persist-credentials": false });
    assert.equal(job.steps.find((step) => step.uses?.startsWith("actions/setup-node@")).with.cache, "pnpm");
    assert(job.steps.some((step) => step.run === "pnpm install --frozen-lockfile --prefer-offline"));
    assert(job.steps.some((step) => step.run === "node --test scripts/ci-enospc-followup-policy.test.mjs"));
    assert.doesNotMatch(read(workflow), /continue-on-error/u);
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
