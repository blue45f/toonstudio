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
