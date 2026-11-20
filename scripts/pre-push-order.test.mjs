import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const hook = fileURLToPath(new URL("../.husky/pre-push", import.meta.url));

for (const failure of ["validate:architecture", "lint-changed.mjs", "secretlint-files.mjs", "run typecheck", ""]) {
  test(`푸시 훅의 실행 순서와 종료 코드 · ${failure || "전체 성공"}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "toonstudio-push-order-"));
    try {
      const log = join(directory, "calls");
      for (const name of ["git", "pnpm", "node"]) {
        writeFileSync(join(directory, name), [
          "#!/bin/sh",
          'echo "$*" >> "$CALLS"',
          'if [ -n "$FAIL_AT" ]; then case "$*" in *"$FAIL_AT"*) exit 17;; esac; fi',
        ].join("\n"), { mode: 0o755 });
      }
      const result = spawnSync("sh", [hook], {
        cwd: directory, env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, CALLS: log, FAIL_AT: failure },
      });
      const calls = readFileSync(log, "utf8").trim().split("\n");
      assert.equal(result.status, failure ? 17 : 0);
      const typecheck = calls.indexOf("run typecheck");
      if (failure && failure !== "run typecheck") {
        assert.equal(typecheck, -1);
      } else {
        for (const check of ["validate:architecture", "lint-changed.mjs", "secretlint-files.mjs"]) {
          const index = calls.findIndex((call) => call.includes(check));
          assert.ok(index >= 0 && index < typecheck);
        }
      }
      assert.equal(calls.some((call) => call.startsWith("scripts/run-changed-unit-tests.mjs")), !failure);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
