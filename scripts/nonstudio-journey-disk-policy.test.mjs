import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const read = (name) => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
const source = read("nonstudio-journey-audit");
const job = parse(source).jobs["focused-regressions"];
const title = "체크아웃 전 미사용 SDK 정리와 디스크 여유 확인";

test("비 스튜디오 회귀는 기존 Core SDK 정리의 안전 경계를 그대로 사용한다", () => {
  assert.equal(job["runs-on"], "ubuntu-24.04");
  const cleanupIndex = job.steps.findIndex((step) => step.name === title);
  const checkoutIndex = job.steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
  assert(cleanupIndex >= 0 && cleanupIndex < checkoutIndex);
  const approved = parse(read("ci")).jobs.build.steps.find((step) => step.name === title);
  assert.deepEqual(job.steps[cleanupIndex], approved);
});

test("디스크 정리는 공개 표면 회귀 입력과 실행 조건을 축소하지 않는다", () => {
  assert.equal(job["timeout-minutes"], 20);
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.deepEqual(checkout.with, { "persist-credentials": false });
  const node = job.steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
  assert.equal(node.with.cache, "pnpm");
  assert(job.steps.some((step) => step.run === "pnpm install --frozen-lockfile --prefer-offline"));
  assert(job.steps.some((step) => step.run === "node --test scripts/nonstudio-journey-contract.test.mjs"));
  const component = job.steps.find((step) => step.name === "Component and existing policy regressions");
  assert.match(component.run, /site-experience\.test\.tsx/u);
  assert.match(component.run, /community-scope-directory\.test\.tsx/u);
  assert.match(component.run, /policy-page\.test\.tsx/u);
  assert.match(component.run, /site-public-routes\.test\.ts/u);
  assert.match(component.run, /app-shell-no-splash\.test\.ts/u);
  assert.match(component.run, /StudioRouterDocumentNavigationBoundary\.test\.tsx/u);
  assert.equal(component.if, undefined);
  assert.equal(job.steps.find((step) => step.name === "Actual branch component browser checks with synthetic fixtures").if, "github.event_name == 'push'");
  assert.doesNotMatch(source, /continue-on-error/u);
});
