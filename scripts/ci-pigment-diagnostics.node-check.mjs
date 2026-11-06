import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const required = ["lint", "typecheck", "static", "serial", "a11y", "build", "database"];
function job(name) {
  const body = source.split(`\n  ${name}:\n`)[1]?.split(/\n {2}[a-z][a-z0-9-]*:\n/u)[0];
  assert.ok(body, `CI 작업이 없습니다: ${name}`);
  return body;
}
// 실제 YAML의 조건을 제한된 OR 식으로만 읽는다. 알 수 없는 식은 실행하지 않는다.
function selected(name, event, diagnostic, ref) {
  const condition = job(name).match(/^ {4}if: (.+)$/mu)?.[1];
  if (!condition) return true;
  const values = new Map([
    ["github.event_name != 'workflow_dispatch'", event !== "workflow_dispatch"],
    ["inputs.pigment_diagnostics != true", diagnostic !== true],
    ["github.ref == 'refs/heads/main'", ref === "refs/heads/main"],
  ]);
  const clauses = condition.split(/\s+\|\|\s+/u);
  for (const clause of clauses) assert.ok(values.has(clause), `지원하지 않는 CI 조건: ${clause}`);
  return clauses.some((clause) => values.get(clause));
}

function timeoutMinutes(name, event, ref, shard) {
  const value = job(name).match(/^ {4}timeout-minutes: (.+)$/mu)?.[1];
  assert.ok(value, `작업 예산이 없습니다: ${name}`);
  if (/^\d+$/u.test(value)) return Number(value);
  const expression = value.match(/^\$\{\{ (.+) \}\}$/u)?.[1];
  assert.ok(expression, `조건부 작업 예산이 없습니다: ${name}`);
  const [condition, fallback, extra] = expression.split(" || ");
  assert.equal(extra, undefined); assert.ok(condition);
  assert.match(fallback, /^\d+$/u);
  const clauses = condition.split(" && ");
  const enabled = clauses.pop();
  assert.match(enabled, /^\d+$/u);
  const values = new Map([
    ["github.event_name == 'workflow_dispatch'", event === "workflow_dispatch"],
    ["github.ref != 'refs/heads/main'", ref !== "refs/heads/main"],
    ["matrix.shard == 'studio-editing'", shard === "studio-editing"],
  ]);
  for (const clause of clauses) assert.ok(values.has(clause), `지원하지 않는 작업 예산 조건: ${clause}`);
  return clauses.every((clause) => values.get(clause)) ? Number(enabled) : Number(fallback);
}

test("타입 작업 예산 8조합은 최신 main의 35분을 유지한다", () => {
  let count = 0;
  for (const event of ["workflow_dispatch", "pull_request", "push", "merge_group"]) {
    for (const ref of ["refs/heads/main", "refs/heads/codex/test"]) {
      const expected = 35;
      assert.equal(timeoutMinutes("typecheck", event, ref), expected, `${event}/${ref}`);
      count += 1;
    }
  }
  assert.equal(count, 8);
});

test("static 작업 예산 40조합은 비 main 수동 editing만 40분이며 나머지는 25분이다", () => {
  const shards = [...job("static").matchAll(/^ {10}- ([a-z][a-z0-9-]*)$/gmu)].map((match) => match[1]);
  assert.deepEqual(shards, ["product", "studio-foundation", "studio-editing", "studio-3d", "studio-character"]);
  let count = 0;
  for (const event of ["workflow_dispatch", "pull_request", "push", "merge_group"]) {
    for (const ref of ["refs/heads/main", "refs/heads/codex/test"]) {
      for (const shard of shards) {
        const expected = event === "workflow_dispatch" && ref !== "refs/heads/main" && shard === "studio-editing" ? 40 : 25;
        assert.equal(timeoutMinutes("static", event, ref, shard), expected, `${event}/${ref}/${shard}`);
        count += 1;
      }
    }
  }
  assert.equal(count, 40);
});

test("접근성 작업 예산 8조합은 비 main 수동 실행만 35분이며 기본·PR·main은 20분이다", () => {
  let count = 0;
  for (const event of ["workflow_dispatch", "pull_request", "push", "merge_group"]) {
    for (const ref of ["refs/heads/main", "refs/heads/codex/test"]) {
      const expected = event === "workflow_dispatch" && ref !== "refs/heads/main" ? 35 : 20;
      assert.equal(timeoutMinutes("a11y", event, ref), expected, `${event}/${ref}`);
      count += 1;
    }
  }
  assert.equal(count, 8);
});

test("브라우저 부분 진단은 명시 선택이며 기본값은 전체 검증이다", () => {
  const input = source.match(/^ {6}pigment_diagnostics:\n((?: {8}.+\n)+)/mu)?.[1];
  assert.ok(input);
  assert.match(input, /type: boolean/u);
  assert.match(input, /default: false/u);
  for (const diagnostic of [false, undefined]) {
    for (const name of required) assert.equal(selected(name, "workflow_dispatch", diagnostic, "refs/heads/codex/test"), true);
  }
});

test("PR·push·merge_group과 main은 부분 진단 입력으로 필수 작업을 생략하지 않는다", () => {
  for (const event of ["pull_request", "push", "merge_group"]) {
    for (const name of required) assert.equal(selected(name, event, true, "refs/heads/codex/test"), true);
  }
  for (const name of required) assert.equal(selected(name, "workflow_dispatch", true, "refs/heads/main"), true);
});

test("부분 진단에서는 브라우저 작업만 선택하고 전체 성공 gate는 우회하지 않는다", () => {
  const results = Object.fromEntries(required.map((name) => [name, {
    result: selected(name, "workflow_dispatch", true, "refs/heads/codex/test") ? "success" : "skipped",
  }]));
  assert.deepEqual(required.filter((name) => results[name].result === "success"), ["a11y"]);
  assert.doesNotMatch(job("core"), /pigment_diagnostics/u);
  assert.doesNotMatch(job("verify"), /pigment_diagnostics/u);
  const body = job("core").match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n {10}NODE/u)?.[1];
  assert.ok(body);
  const run = (value) => spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: body.replace(/^ {10}/gmu, ""),
    env: { ...process.env, CORE_RESULTS: JSON.stringify(value) }, encoding: "utf8",
  });
  const partial = run(results);
  assert.notEqual(partial.status, 0);
  assert.match(partial.stderr, /actual success/u);
  assert.equal(run(Object.fromEntries(required.map((name) => [name, { result: "success" }]))).status, 0);
});

for (const [inputName, environmentName, enabledValue, disabledValue] of [
  ["profile_capture_cpu", "TOONSTUDIO_PROFILE_CAPTURE_CPU", "1", "0"],
  ["trace_capture_frames", "TOONSTUDIO_TRACE_CAPTURE_FRAMES", "1", "0"],
  ["capture_new_headless", "PLAYWRIGHT_CHANNEL", "chromium", ""],
  ["capture_without_dom_snapshots", "TOONSTUDIO_CAPTURE_WITHOUT_DOM_SNAPSHOTS", "1", "0"],
]) test(`${inputName}는 비 main 수동 부분 진단에서 독립 선택한 값만 적용한다`, () => {
  const input = source.match(new RegExp(`^ {6}${inputName}:\\n((?: {8}.+\\n)+)`, "mu"))?.[1];
  assert.ok(input);
  assert.match(input, /type: boolean/u);
  assert.match(input, /default: false/u);
  const expressions = [...source.matchAll(new RegExp(`^ {10}${environmentName}: \\$\\{\\{ (.+) \\}\\}$`, "gmu"))];
  assert.equal(expressions.length, 1);
  const expression = expressions[0]?.[1];
  assert.ok(expression);
  const [condition, otherwise, extra] = expression.split(" || ");
  assert.equal(otherwise, `'${disabledValue}'`);
  assert.equal(extra, undefined);
  assert.ok(condition);
  const owner = job("a11y").split(/(?=^ {6}- )/mu).find((step) => step.includes(`          ${environmentName}: `));
  assert.ok(owner, "관측 환경변수는 제품 검증 단계에 있어야 합니다.");
  assert.match(owner, /^ {6}- name: 자체 안료 실제 제품 UI·저장·재열기·명시 전환$/mu);
  assert.match(owner, /run: pnpm exec playwright test --config playwright\.pigment-product\.config\.ts --project=chromium --workers=1 --retries=0 --global-timeout=540000/u);
  for (const event of ["workflow_dispatch", "pull_request", "push", "merge_group"]) {
    for (const diagnostic of [true, false, undefined]) {
      for (const profile of [true, false, undefined]) {
        for (const trace of [true, false, undefined]) {
          for (const headless of [true, false, undefined]) {
            for (const withoutSnapshots of [true, false, undefined]) {
              const choices = {
                profile_capture_cpu: profile, trace_capture_frames: trace,
                capture_new_headless: headless, capture_without_dom_snapshots: withoutSnapshots,
              };
              for (const ref of ["refs/heads/main", "refs/heads/codex/test"]) {
                const values = new Map([
                  ["github.event_name == 'workflow_dispatch'", event === "workflow_dispatch"],
                  ["inputs.pigment_diagnostics == true", diagnostic === true],
                  [`inputs.${inputName} == true`, choices[inputName] === true],
                  ["github.ref != 'refs/heads/main'", ref !== "refs/heads/main"],
                  [`'${enabledValue}'`, true],
                ]);
                const clauses = condition.split(" && ");
                for (const clause of clauses) assert.ok(values.has(clause), `지원하지 않는 관측 조건: ${clause}`);
                const actual = clauses.every((clause) => values.get(clause)) ? enabledValue : disabledValue;
                const expected = event === "workflow_dispatch" && diagnostic === true && choices[inputName] === true && ref !== "refs/heads/main"
                  ? enabledValue : disabledValue;
                assert.equal(actual, expected, `${event}/${inputName}/${String(diagnostic)}/${String(profile)}/${String(trace)}/${String(headless)}/${String(withoutSnapshots)}/${ref}`);
              }
            }
          }
        }
      }
    }
  }
  assert.doesNotMatch(job("core"), new RegExp(`${inputName}|${environmentName}`, "u"));
  assert.doesNotMatch(job("verify"), new RegExp(`${inputName}|${environmentName}`, "u"));
});

test("V2 클리핑 교차 의미는 비 main 수동 부분 진단에서만 한 시험을 선택한다", () => {
  const dispatchInputs = source.split("  workflow_dispatch:\n")[1]?.split("  pull_request:\n")[0];
  assert.ok(dispatchInputs);
  assert.deepEqual([...dispatchInputs.matchAll(/^ {6}([a-z_]+):$/gmu)].map((match) => match[1]), [
    "pigment_diagnostics", "profile_capture_cpu", "trace_capture_frames", "capture_new_headless", "capture_without_dom_snapshots",
  ]);
  const spec = readFileSync(new URL("../e2e/studio-pigment-product-workflow.spec.ts", import.meta.url), "utf8");
  assert.match(spec, /if \(process\.env\.TOONSTUDIO_PIGMENT_CLIP_CONTRAST === "1"\) \{\n {2}for \(const clipBelow of \[false, true\]\)/u);
  const originalTitles = [
    "기본 권리 차단과 자체 안료 선택·SQLite 저장·재열기·원고 입력·내구 저장·PNG/SVG",
    "실제 V1 원고의 원본 다운로드·명시 전환·undo/redo·재열기·내보내기",
    "실제 V2 원고의 원본 다운로드·명시 전환·undo/redo·재열기·내보내기",
  ];
  const semanticTitle = "분리 진단: V2 클리핑 교차 픽셀 의미";
  const contrastTitles = [
    ...[false, true].map((clipBelow) => `분리 진단: V2 클리핑 clipBelow=${clipBelow} 원본 보존·전환·재열기·PNG`),
    semanticTitle,
  ];
  const owner = job("a11y").split(/(?=^ {6}- )/mu).find((step) => step.includes("          TOONSTUDIO_PIGMENT_CLIP_CONTRAST: "));
  assert.ok(owner);
  assert.match(owner, /^ {6}- name: 자체 안료 실제 제품 UI·저장·재열기·명시 전환$/mu);
  assert.match(owner, /^ {8}run: pnpm exec playwright test --config playwright\.pigment-product\.config\.ts --project=chromium --workers=1 --retries=0 --global-timeout=540000 --grep "\$TOONSTUDIO_PIGMENT_TEST_FILTER"$/mu);
  const gates = [
    ["TOONSTUDIO_PIGMENT_CLIP_CONTRAST", "1", "0"],
    ["TOONSTUDIO_PIGMENT_TEST_FILTER", "(^| )분리 진단: V2 클리핑 교차 픽셀 의미", ".*"],
  ].map(([name, enabled, disabled]) => {
    const matches = [...source.matchAll(new RegExp(`^ *${name}: "?\\$\\{\\{ (.+) \\}\\}"?$`, "gmu"))];
    assert.equal(matches.length, 1);
    const expression = matches[0]?.[1];
    assert.ok(expression);
    const [condition, otherwise, extra] = expression.split(" || ");
    assert.equal(otherwise, `'${disabled}'`); assert.equal(extra, undefined); assert.ok(condition);
    assert.doesNotMatch(job("core"), new RegExp(name, "u"));
    assert.doesNotMatch(job("verify"), new RegExp(name, "u"));
    return { condition, enabled, disabled };
  });
  const states = [true, false, undefined];
  const observerStates = states.flatMap((profile) => states.flatMap((trace) => states.flatMap((headless) =>
    states.map((snapshots) => ({ profile, trace, headless, snapshots })))));
  for (const event of ["workflow_dispatch", "pull_request", "push", "merge_group"]) {
    for (const diagnostic of states) {
      for (const ref of ["refs/heads/main", "refs/heads/codex/test"]) {
        for (const observers of observerStates) {
          const partial = event === "workflow_dispatch" && diagnostic === true && ref !== "refs/heads/main";
          const [contrast, filter] = gates.map(({ condition, enabled, disabled }) => {
            const values = new Map([
              ["github.event_name == 'workflow_dispatch'", event === "workflow_dispatch"],
              ["inputs.pigment_diagnostics == true", diagnostic === true],
              ["github.ref != 'refs/heads/main'", ref !== "refs/heads/main"],
              [`'${enabled}'`, true],
            ]);
            const clauses = condition.split(" && ");
            for (const clause of clauses) assert.ok(values.has(clause), `지원하지 않는 대조 조건: ${clause}`);
            return clauses.every((clause) => values.get(clause)) ? enabled : disabled;
          });
          assert.equal(contrast, partial ? "1" : "0");
          assert.equal(filter, partial ? "(^| )분리 진단: V2 클리핑 교차 픽셀 의미" : ".*");
          // Playwright grep는 project/file이 앞에 붙은 전체 제목에 적용된다.
          const registered = contrast === "1" ? [...originalTitles, ...contrastTitles] : originalTitles;
          const chosen = registered.filter((title) => new RegExp(filter, "u").test(`chromium studio-pigment-product-workflow.spec.ts ${title}`));
          assert.deepEqual(chosen, partial ? [semanticTitle] : originalTitles, JSON.stringify({ event, diagnostic, ref, observers }));
        }
      }
    }
  }
});
