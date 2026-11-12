import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { verifyTypecheckedBuildInputs } from "./verify-typechecked-build-inputs.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const SHA = "a".repeat(40);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "typed-bundle-inputs-"));
  const config = { compilerOptions: {
    strict: true, noEmit: true, skipLibCheck: true, types: [],
    module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true,
    allowSyntheticDefaultImports: true, target: "ES2020",
  }, include: ["*.ts"] };
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify(config));
  writeFileSync(join(root, "entry.ts"), 'import settings from "./settings.json"; export const limit = settings.limit;');
  writeFileSync(join(root, "settings.json"), '{"limit":3}');
  return {
    root, config, snapshot: join(root, "before-types.json"),
    options: { root, expectedSha: SHA, readHead: () => SHA, typecheckOutcome: "success" },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("영수증이 없어도 실제 전체 타입 성공과 변경 없는 입력이면 번들을 허용한다", () => {
  const f = fixture();
  try {
    verifyTypecheckedBuildInputs("record", f.snapshot, f.options);
    verifyTypecheckedBuildInputs("verify", f.snapshot, f.options);
    const saved = JSON.parse(readFileSync(f.snapshot, "utf8"));
    assert.deepEqual(Object.keys(saved), ["schemaVersion", "sha", "fingerprint"]);
    assert.match(saved.fingerprint, /^[a-f0-9]{64}$/u);
  } finally { f.dispose(); }
});

test("실패·skip·미실행은 snapshot이 있어도 실제 타입 성공을 대신할 수 없다", () => {
  const f = fixture();
  try {
    verifyTypecheckedBuildInputs("record", f.snapshot, f.options);
    for (const typecheckOutcome of [undefined, "failure", "skipped", "cancelled"]) {
      assert.throws(() => verifyTypecheckedBuildInputs("verify", f.snapshot, {
        ...f.options, typecheckOutcome,
      }), /실제 성공/u);
    }
  } finally { f.dispose(); }
});

test("prebuild가 바꿀 수 있는 JSON·compiler options·새 root source를 모두 거절한다", () => {
  for (const change of [
    (f) => writeFileSync(join(f.root, "settings.json"), '{"limit":"changed"}'),
    (f) => writeFileSync(join(f.root, "tsconfig.json"), JSON.stringify({
      ...f.config, compilerOptions: { ...f.config.compilerOptions, target: "ES2022" },
    })),
    (f) => writeFileSync(join(f.root, "added.ts"), "export const afterTypecheck = 1;"),
  ]) {
    const f = fixture();
    try {
      verifyTypecheckedBuildInputs("record", f.snapshot, f.options);
      change(f);
      assert.throws(() => verifyTypecheckedBuildInputs("verify", f.snapshot, f.options), /생성 후 전체 타입 검사/u);
    } finally { f.dispose(); }
  }
});

test("snapshot 누락·손상과 CI/checkout SHA 변경을 거절하고 기존 snapshot을 덮지 않는다", () => {
  const f = fixture();
  try {
    assert.throws(() => verifyTypecheckedBuildInputs("verify", f.snapshot, f.options));
    verifyTypecheckedBuildInputs("record", f.snapshot, f.options);
    assert.throws(() => verifyTypecheckedBuildInputs("record", f.snapshot, f.options), /EEXIST/u);
    assert.throws(() => verifyTypecheckedBuildInputs("verify", f.snapshot, {
      ...f.options, readHead: () => "b".repeat(40),
    }), /체크아웃 SHA/u);
    assert.throws(() => verifyTypecheckedBuildInputs("verify", f.snapshot, {
      ...f.options, expectedSha: "b".repeat(40), readHead: () => "b".repeat(40),
    }), /전체 타입 검사/u);
    writeFileSync(f.snapshot, '{"schemaVersion":1,"sha":"bad","fingerprint":"bad"}');
    assert.throws(() => verifyTypecheckedBuildInputs("verify", f.snapshot, f.options), /전체 타입 검사/u);
  } finally { f.dispose(); }
});

test("세 CI는 실제 types outcome 성공·생성 후 입력 확인·동일 Vite와 CSP를 유지한다", () => {
  const root = new URL("../", import.meta.url);
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  const scripts = JSON.parse(read("package.json")).scripts;
  assert.equal(scripts.build, "pnpm run typecheck:web && " + scripts["build:bundle"]);
  assert.equal(scripts["prebuild:bundle"], "pnpm run prebuild");
  assert.equal(scripts["postbuild:bundle"], "pnpm run postbuild");
  assert.match(scripts.postbuild, /verify-static-csp/u);
  for (const [filename, jobName, typeCommand, bundleCommand] of [
    ["admin-hardening-regression.yml", "admin-regression", "pnpm run typecheck", "pnpm run build:bundle"],
    ["creator-resources.yml", "integration", "pnpm typecheck", "pnpm run build:bundle"],
    ["feedback-community-validation.yml", "feedback-community", "node scripts/ci-shared-typecheck.mjs reuse-or-run", "pnpm run build:bundle 2>&1 | tee artifacts/feedback/production-build.log"],
  ]) {
    const workflow = parseYaml(read(".github/workflows/" + filename));
    for (const event of ["pull_request", "push"]) {
      for (const helper of ["scripts/verify-typechecked-build-inputs.mjs", "scripts/verify-typechecked-build-inputs.test.mjs"]) {
        assert.equal(workflow.on[event].paths.filter((path) => path === helper).length, 1,
          `${filename}/${event}는 입력 guard 변경을 정확한 경로로 추적해야 한다`);
      }
    }
    const job = workflow.jobs[jobName];
    const types = job.steps.find((step) => step.id === "types");
    const build = job.steps.find((step) => step.run?.includes(bundleCommand));
    assert(types && build, filename);
    assert(job.steps.indexOf(types) < job.steps.indexOf(build), filename);
    assert(types.run.indexOf("verify-typechecked-build-inputs.mjs record") < types.run.indexOf(typeCommand), filename);
    assert(types.run.includes(typeCommand), filename);
    assert(build.if.includes("steps.types.outcome == 'success'"), filename);
    assert.equal(build.env.TYPECHECK_OUTCOME, "${{ steps.types.outcome }}", filename);
    assert.match(build.run, /set -euo pipefail/u);
    const firstVerify = build.run.indexOf("verify-typechecked-build-inputs.mjs verify");
    const bundle = build.run.indexOf(bundleCommand);
    const lastVerify = build.run.lastIndexOf("verify-typechecked-build-inputs.mjs verify");
    assert(build.run.indexOf("pnpm run prebuild") < firstVerify && firstVerify < bundle && bundle < lastVerify, filename);
    assert.doesNotMatch(build.run, /\|\|\s*true|set\s+\+e/u);
    if (filename === "feedback-community-validation.yml") {
      assert.equal(types["continue-on-error"], true, "기존 다중 증거 수집만 유지한다");
      const aggregate = job.steps.find((step) => step.name === "Require every check to pass");
      assert.equal(aggregate.env.TYPES, "${{ steps.types.outcome }}");
      assert.equal(aggregate.env.PRODUCTION, "${{ steps.production.outcome }}");
      assert(aggregate.run.includes("os.environ.get(key) != 'success'"));
    } else {
      assert.notEqual(types["continue-on-error"], true);
      assert.notEqual(build["continue-on-error"], true);
    }
  }
});
