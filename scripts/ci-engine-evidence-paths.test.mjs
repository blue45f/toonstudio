import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/main-full-qa-fast-diagnostics.yml", import.meta.url), "utf8");
const contracts = [
  ["engine-core", "Run one engine option gate", "TOONSPECTRUM_BRUSH_MEDIA_VERIFY_DIR", "artifacts/engine-core/${{ matrix.gate }}", "verify-studio-brush-media.mts"],
  ["engine-core", "Run one engine option gate", "TOONSPECTRUM_NATIVE_RASTER_VERIFY_DIR", "artifacts/engine-core/${{ matrix.gate }}", "verify-studio-native-raster-tools.mts"],
  ["engine-extended", "Hokusai, living ink and hybrid DCC", "TOONSPECTRUM_LIVING_INK_VERIFY_DIR", "artifacts/engine-extended/living-ink-execution", "verify-studio-living-ink-execution.mjs"],
  ["engine-extended", "Hokusai, living ink and hybrid DCC", "TOONSPECTRUM_LIVING_INK_PROBE_RESULTS_PATH", "artifacts/engine-extended/living-ink-probes.json", "verify-studio-living-ink-execution.mjs"],
  ["engine-extended", "Hokusai, living ink and hybrid DCC", "TOONSPECTRUM_LIVING_INK_INTEGRATION_DIR", "artifacts/engine-extended/living-ink-integration", "verify-studio-living-ink-integration.mts"],
];
const sources = Object.fromEntries(contracts.map(([, , , , script]) => [script,
  readFileSync(new URL(script, import.meta.url), "utf8")]));

function jobSteps(text, id) {
  const job = text.match(new RegExp(`^ {2}${id}:\\n([\\s\\S]*?)(?=^ {2}[a-z][\\w-]*:|$(?![\\s\\S]))`, "mu"))?.[1];
  assert.ok(job, `${id}: 진단 job을 보존해야 한다`);
  return job.split(/\n(?= {6}- )/u);
}

function validateEngineEvidence(text, scriptSources = sources) {
  for (const [job, name, variable, directory, script] of contracts) {
    const step = jobSteps(text, job).find((entry) => entry.includes(`name: ${name}\n`));
    assert.ok(step, `${name}: 검증 단계가 있어야 한다`);
    const actual = step.match(new RegExp(`^ {10}${variable}: (.+)$`, "mu"))?.[1];
    assert.equal(actual, "${{ github.workspace }}/" + directory, `${variable}: 업로드 하위 출력 경로를 유지해야 한다`);
    assert.ok(scriptSources[script].includes(`process.env.${variable}`), `${script}: 실제 환경 변수와 같아야 한다`);
  }
  for (const [job, name, directory] of [
    ["engine-core", "Preserve engine gate evidence", "artifacts/engine-core/${{ matrix.gate }}/"],
    ["engine-extended", "Preserve extended engine evidence", "artifacts/engine-extended/"],
  ]) {
    const upload = jobSteps(text, job).find((entry) => entry.includes(`name: ${name}\n`));
    assert.ok(upload, `${job}: 증거 업로드 단계가 필요하다`);
    assert.match(upload, /^ {8}if: .*always\(\)/mu, "실패시에도 진단 증거를 보존해야 한다");
    assert.match(upload, /uses: actions\/upload-artifact@/u);
    assert.ok(upload.includes(`path: ${directory}`), `${job}: 실제 출력 경로를 업로드해야 한다`);
    assert.match(upload, /^ {10}retention-days: 7$/mu);
    if (job === "engine-core") {
      assert.ok(upload.includes("matrix.gate == 'brush-media'"));
      assert.ok(upload.includes("matrix.gate == 'native-raster'"));
      assert.ok(upload.includes("name: main-full-qa-isolated-engine-${{ matrix.gate }}-${{ github.sha }}"));
    }
  }
  assert.ok(text.includes("run: ${{ matrix.command }}"));
  for (const command of ["verify:studio-brush-media", "verify:studio-native-raster-tools", "verify:studio-living-ink-execution", "verify:studio-living-ink-integration"]) {
    assert.ok(text.includes(`pnpm run ${command}`), `${command}: 실제 검사를 생략하지 않는다`);
  }
}

test("브러시·래스터·Living Ink 진단 출력과 실패 증거 업로드가 연결된다", () => {
  validateEngineEvidence(workflow);
});

test("엔진 출력 경로 누락과 /tmp 경로 회귀를 거부한다", () => {
  for (const [, , variable] of contracts) {
    const line = new RegExp(`^ {10}${variable}: .+$`, "mu");
    for (const replacement of ["", `          ${variable}: /tmp/uncollected`]) {
      assert.throws(() => validateEngineEvidence(workflow.replace(line, replacement)));
    }
  }
});

test("엔진 업로드 누락·실패시 생략·검사 제거를 거부한다", () => {
  for (const change of [
    (text) => text.replace("name: Preserve engine gate evidence", "name: Missing evidence"),
    (text) => text.replace("name: Preserve extended engine evidence", "name: Missing evidence"),
    (text) => text.replaceAll("always()", "success()"),
    (text) => text.replace("path: artifacts/engine-extended/", "path: elsewhere/"),
    (text) => text.replace("pnpm run verify:studio-living-ink-integration", "echo skipped"),
  ]) assert.throws(() => validateEngineEvidence(change(workflow)));
});

test("엔진 스크립트의 실제 출력 변수와 연결이 끊기면 거부한다", () => {
  for (const [, , variable, , script] of contracts) {
    assert.throws(() => validateEngineEvidence(workflow, { ...sources,
      [script]: sources[script].replaceAll(`process.env.${variable}`, "undefined"),
    }));
  }
});
