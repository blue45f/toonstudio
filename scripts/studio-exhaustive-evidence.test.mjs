import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const workflow = readFileSync(new URL("../.github/workflows/main-full-qa-studio.yml", import.meta.url), "utf8");

test("생산 import graph는 숨김 디렉터리까지 전송하며 누락·빈 파일은 양쪽 경계에서 거부한다", () => {
  const upload = workflow.match(/name: Preserve production bundle[\s\S]*?(?=\n\n)/u)?.[0];
  assert.match(upload ?? "", /path: dist\/\n {10}include-hidden-files: true/u);
  const checks = ["Require the production import graph before transport", "Verify the production import graph survived transport"]
    .map(name => workflow.match(new RegExp(`name: ${name}\\n {8}run: (.+)`, "u"))?.[1]);
  const directory = mkdtempSync(join(tmpdir(), "studio-exhaustive-manifest-"));
  try {
    mkdirSync(join(directory, "dist/.vite"), { recursive: true });
    const manifest = join(directory, "dist/.vite/manifest.json");
    for (const script of checks) {
      assert.ok(script, "빌드 또는 복원 경계에 import graph 확인이 없습니다.");
      rmSync(manifest, { force: true });
      const run = () => spawnSync("bash", ["-c", script], { cwd: directory, timeout: 2_000 });
      assert.equal(run().status, 1, "누락한 graph를 거부해야 합니다.");
      writeFileSync(manifest, "");
      assert.equal(run().status, 1, "빈 graph를 거부해야 합니다.");
      writeFileSync(manifest, JSON.stringify({ "src/main.tsx": { file: "assets/main.js", isEntry: true } }));
      assert.equal(run().status, 0);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
    let pathEnv = process.env.PATH ?? "";
    if (spawnSync("bash", ["-c", "command -v timeout"], { encoding: "utf8" }).status !== 0) {
      const binDir = join(directory, "bin");
      mkdirSync(binDir, { recursive: true });
      const timeoutShim = join(binDir, "timeout");
      writeFileSync(
        timeoutShim,
        `#!${process.execPath}
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
while (args[0]?.startsWith("-")) args.shift();
const rawDuration = args.shift() ?? "60s";
const match = /^(\\d+)(ms|s|m|h)?$/u.exec(rawDuration);
const unitMs = match?.[2] === "ms" ? 1 : match?.[2] === "m" ? 60_000 : match?.[2] === "h" ? 3_600_000 : 1_000;
const timeoutMs = Math.max(1, Number(match?.[1] ?? 60) * unitMs);
const res = spawnSync(args[0], args.slice(1), { stdio: "inherit", timeout: timeoutMs });
if (res.error?.code === "ETIMEDOUT") process.exit(124);
process.exit(res.status ?? 1);
`,
      );
      chmodSync(timeoutShim, 0o755);
      pathEnv = `${binDir}${delimiter}${pathEnv}`;
    }
    const result = spawnSync("bash", ["-c", script], {
      cwd: directory,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: pathEnv,
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
