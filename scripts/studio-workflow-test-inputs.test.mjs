import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = new URL("../", import.meta.url);

for (const name of ["market-cc0-delivery", "studio-local-document-regressions", "non-studio-experience-quality", "studio-finishing-quality", "studio-collaboration-sync"]) {
  test(`${name}의 실제 검사 명령은 존재하는 소스·시험 파일만 참조한다`, () => {
    const workflow = parse(readFileSync(new URL(`.github/workflows/${name}.yml`, root), "utf8"));
    let inputs = 0;
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        for (const match of (step.run ?? "").matchAll(/(?<![\w/])((?:apps|packages|scripts|tests)\/[A-Za-z0-9_./-]+\.(?:mjs|mts|cjs|tsx?|jsx?))(?=[\s'"\\]|$)/gu)) {
          inputs++;
          assert.ok(existsSync(fileURLToPath(new URL(match[1], root))), `${name}: 누락된 검사 입력 ${match[1]}`);
        }
      }
    }
    assert.ok(inputs > 0, "실제 실행 입력을 검사해야 합니다.");
  });
}
