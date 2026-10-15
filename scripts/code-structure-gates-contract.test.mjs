import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

/**
 * 코드 구조 가드레일(소스 파일 크기·Studio 진입 그래프 래칫)의 배선 계약.
 *
 * 이 테스트는 dependency 설치 전 preflight 에서도 실행되므로 sparse checkout 이 제외하는 docs/ 를 읽지 않는다
 * (문서 존재는 validate:architecture 가 검사한다). 스크립트·기준선·워크플로·훅만 본다.
 */
const read = (relativePath) => readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
const packageScripts = JSON.parse(read("package.json")).scripts;
const workflow = read(".github/workflows/ci.yml");
const jobs = workflow.slice(workflow.indexOf("\njobs:\n") + 7).split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);
const job = (name) => {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
};

test("두 가드레일은 package.json 스크립트로 노출되고 설정값은 스크립트·기준선 한 곳에만 있다", () => {
  assert.equal(packageScripts["check:source-file-size"], "node scripts/check-source-file-size.mjs");
  assert.equal(packageScripts["check:studio-eager-graph"], "node scripts/check-studio-eager-graph.mjs");
  assert.match(packageScripts["test:code-structure-gates"], /check-source-file-size\.test\.mjs/u);
  assert.match(packageScripts["test:code-structure-gates"], /check-studio-eager-graph\.test\.mjs/u);
  assert.match(packageScripts["test:code-structure-gates"], /code-structure-gates-contract\.test\.mjs/u);
  for (const name of ["check:source-file-size", "check:studio-eager-graph"]) {
    assert.doesNotMatch(packageScripts[name], /--update-baseline|--tighten/u, `${name}: 기본 스크립트는 읽기 전용 검사여야 합니다`);
  }
});

test("validate:architecture 흐름에 두 가드레일이 기존 검증 뒤에 연결된다", () => {
  const chain = packageScripts["validate:architecture"].split(" && ");
  const position = (command) => chain.indexOf(command);
  assert.equal(position("node scripts/validate-architecture.mjs"), 0);
  for (const command of [
    "pnpm run validate:documentation",
    "pnpm run validate:source-layout",
    "pnpm run validate:app-boundaries",
    "pnpm run check:source-file-size",
    "pnpm run check:studio-eager-graph",
  ]) assert.ok(position(command) > 0, `validate:architecture 에 ${command} 가 없습니다`);
  assert.ok(position("pnpm run check:source-file-size") > position("pnpm run validate:app-boundaries"));
  assert.ok(position("pnpm run check:studio-eager-graph") > position("pnpm run check:source-file-size"));

  const architecture = read("scripts/validate-architecture.mjs");
  for (const required of [
    '"scripts/check-source-file-size.mjs"',
    '"scripts/source-file-size-baseline.json"',
    '"scripts/check-studio-eager-graph.mjs"',
    '"scripts/studio-eager-graph-baseline.json"',
    '"docs/engineering/code-structure-and-bundle-patterns.md"',
    '"check:source-file-size"',
    '"check:studio-eager-graph"',
  ]) assert.ok(architecture.includes(required), `validate-architecture.mjs 가 ${required} 를 요구해야 합니다`);
});

test("CI typecheck(preflight) lane 이 설치 전 파일 크기 래칫, 설치 후 진입 그래프 래칫을 typecheck 보다 먼저 실행한다", () => {
  const typecheck = job("typecheck");
  const at = (text) => typecheck.indexOf(text);
  const contracts = at("node --test");
  const fanout = at("python3 scripts/verify-pr-workflow-fanout.py");
  const sizeGate = at("run: node scripts/check-source-file-size.mjs\n");
  const install = at("pnpm install --frozen-lockfile");
  const graphGate = at("run: pnpm run check:studio-eager-graph\n");
  const typecheckRun = at("pnpm run typecheck\n");
  assert.ok(contracts >= 0 && fanout > contracts, "계약 테스트가 먼저 실행되어야 합니다");
  assert.ok(sizeGate > fanout, "파일 크기 래칫은 fan-out 정책 검사 뒤에 실행됩니다");
  assert.ok(install > sizeGate, "파일 크기 래칫은 의존성 설치 전에 끝납니다(dependency-free)");
  assert.ok(graphGate > install, "진입 그래프 래칫은 TypeScript 가 필요하므로 설치 뒤에 실행됩니다");
  assert.ok(typecheckRun > graphGate, "래칫은 오래 걸리는 typecheck 보다 먼저 실패해야 합니다");

  const preflight = typecheck.slice(contracts, typecheck.indexOf("\n", contracts));
  for (const test of ["scripts/code-structure-gates-contract.test.mjs", "scripts/check-source-file-size.test.mjs"]) {
    assert.ok(preflight.includes(test), `preflight 가 ${test} 를 실행해야 합니다`);
  }
  assert.ok(!preflight.includes("check-studio-eager-graph.test.mjs"), "TypeScript 가 필요한 테스트는 설치 전에 실행할 수 없습니다");
  assert.doesNotMatch(typecheck.slice(sizeGate - 200, graphGate + 200), /continue-on-error|\|\| true/u);
  // 임계값(800줄, +1%)은 워크플로에 복제하지 않는다 — 스크립트·기준선이 유일한 출처다.
  assert.doesNotMatch(typecheck, /--limit|800/u);
});

test("설치 후 실행되는 진입 그래프 테스트는 필수 Vitest 회귀 목록에 들어 있다", () => {
  const targets = read("scripts/ci-required-vitest-targets.txt").split(/\r?\n/u).filter(Boolean);
  assert.ok(targets.includes("scripts/check-studio-eager-graph.test.mjs"));
  assert.ok(!targets.includes("scripts/check-source-file-size.test.mjs"), "preflight 에서 이미 실행한다");
  assert.deepEqual(targets, [...targets].sort(), "필수 목록은 정렬을 유지한다");
});

test("로컬 pre-push 는 validate:architecture 를 실행하므로 두 가드레일이 푸시 전에 같은 방식으로 돈다", () => {
  const prePush = read(".husky/pre-push");
  assert.match(prePush, /^pnpm run validate:architecture$/mu);
});

test("Studio 어댑터 진입점은 번들 게이트와 같고 기준선 파일은 스크립트 옆에 있다", () => {
  const bundleGate = read("scripts/check-studio-bundle.mjs");
  const studioEntry = bundleGate.match(/const studioEntry =\s*"([^"]+)"/u)?.[1];
  assert.ok(studioEntry);
  const graphGate = read("scripts/lib/studio-eager-graph.mjs");
  assert.ok(graphGate.includes(`"apps/web/${studioEntry}"`), "진입 그래프 가드레일의 Studio 진입점이 번들 게이트와 달라졌습니다");
  for (const file of ["scripts/source-file-size-baseline.json", "scripts/studio-eager-graph-baseline.json"]) {
    assert.doesNotThrow(() => JSON.parse(read(file)), `${file} 은 유효한 JSON 이어야 합니다`);
  }
});

test("apps/web 규칙은 상세를 중복하지 않고 문서 링크와 두 줄 요약만 둔다", () => {
  const webRules = read("apps/web/AGENTS.md");
  assert.match(webRules, /docs\/engineering\/code-structure-and-bundle-patterns\.md/u);
  assert.match(webRules, /새 파일[^\n]*800줄/u);
  assert.match(webRules, /진입 그래프[^\n]*금지 도메인/u);
  assert.ok(webRules.split("\n").length < 45, "하위 AGENTS.md 에 규칙 본문을 복제하지 않는다");
});
