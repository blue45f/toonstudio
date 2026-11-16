import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const workflow = readFileSync(new URL("../.github/workflows/main-full-qa-studio.yml", import.meta.url), "utf8");

test("exhaustive는 실패 후에도 실행하며 각 gate의 일반·native·LivingInk 증거를 보존한다", () => {
  const runBlock = workflow.match(/name: Run every gate in this lane without hiding later failures[\s\S]*?\n {8}run: \|\n([\s\S]*?)(?=\n {6}- name:)/u)?.[1];
  assert.ok(runBlock, "실제 workflow의 실행 블록을 찾지 못했습니다.");
  const script = runBlock.replace(/^ {10}/gmu, "");
  const directory = mkdtempSync(join(tmpdir(), "studio-exhaustive-evidence-"));
  try {
    const probe = join(directory, "probe.mjs");
    writeFileSync(probe, `
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const [gate, status] = process.argv.slice(2);
      for (const [variable, file] of [
        ['TOONSPECTRUM_VERIFY_DIR', 'summary.json'],
        ['TOONSPECTRUM_NATIVE_RASTER_VERIFY_DIR', 'native.json'],
        ['TOONSPECTRUM_LIVING_INK_VERIFY_DIR', 'living-ink.json'],
      ]) writeFileSync(join(process.env[variable], file), JSON.stringify({ gate }));
      process.exit(Number(status));
    `);
    // 임시 파일 경로도 shell 인자 경계를 유지한다.
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    const command = `${quote(process.execPath)} ${quote(probe)}`;
    const result = spawnSync("bash", ["-c", script], {
      cwd: directory,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        QA_LANE: "evidence-test",
        QA_COMMAND_TIMEOUT_MINUTES: "1",
        QA_COMMANDS: `failed-gate|${command} failed-gate 7\nnext-gate|${command} next-gate 0`,
        GITHUB_STEP_SUMMARY: join(directory, "step-summary.md"),
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    const output = join(directory, "artifacts/main-full-qa/evidence-test");
    assert.equal(readFileSync(join(output, "results.tsv"), "utf8"), "failed-gate\t7\nnext-gate\t0\n");
    assert.match(readFileSync(join(output, "failures.txt"), "utf8"), /^failed-gate\t7\t/u);
    for (const gate of ["failed-gate", "next-gate"]) {
      for (const file of ["summary.json", "native.json", "living-ink.json"]) {
        assert.deepEqual(JSON.parse(readFileSync(join(output, "evidence", gate, file), "utf8")), { gate });
      }
    }
    assert.match(readFileSync(join(directory, "step-summary.md"), "utf8"), /next-gate/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
