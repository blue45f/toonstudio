import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/main-full-qa-fast-diagnostics.yml", import.meta.url), "utf8");
const probes = [
  { name: "In-app route matrix", variable: "TOONSPECTRUM_INAPP_VERIFY_DIR", script: "verify-studio-inapp-browser.mts", command: "pnpm run verify:studio-inapp-browser" },
  { name: "In-app feature sweep", variable: "TOONSPECTRUM_SWEEP_VERIFY_DIR", script: "verify-studio-inapp-feature-sweep.mts", command: "pnpm run verify:studio-inapp-feature-sweep" },
];
const sources = Object.fromEntries(probes.map(({ script }) => [script,
  readFileSync(new URL(script, import.meta.url), "utf8")]));

function validateEvidencePaths(text, scriptSources = sources) {
  const job = text.match(/^ {2}studio-browser-core:\n([\s\S]*?)(?=^ {2}[a-z][\w-]*:|$(?![\s\S]))/mu)?.[1];
  assert.ok(job, "인앱 브라우저 진단 job을 보존해야 한다");
  const steps = job.split(/\n(?= {6}- )/u);
  const upload = steps.find((step) => step.includes("name: Preserve browser evidence"));
  assert.ok(upload, "진단 증거 업로드 단계가 있어야 한다");
  assert.match(upload, /^ {8}if: always\(\)$/mu, "실패 후에도 증거를 업로드해야 한다");
  assert.match(upload, /uses: actions\/upload-artifact@/u);
  assert.match(upload, /^ {12}artifacts\/$/mu, "명시적 출력 루트가 업로드 경로에 포함돼야 한다");
  const directories = new Set();
  for (const { name, variable, script, command } of probes) {
    const step = steps.find((entry) => entry.includes(`name: ${name}\n`));
    assert.ok(step, `${name}: 검증 단계를 유지해야 한다`);
    assert.match(step, /^ {8}env:$/mu, `${name}: 출력 위치를 단계에 명시해야 한다`);
    const output = step.match(new RegExp(`^ {10}${variable}: (.+)$`, "mu"))?.[1];
    assert.ok(output?.startsWith("${{ github.workspace }}/artifacts/"), `${name}: 업로드 대상 아래에 증거를 남겨야 한다`);
    const relative = output.slice("${{ github.workspace }}/".length);
    assert.equal(posix.normalize(relative), relative, "상위 폴더 이동이나 모호한 출력 경로를 허용하지 않는다");
    assert.ok(!directories.has(relative), "각 검증은 서로 다른 증거 디렉터리를 사용해야 한다");
    directories.add(relative);
    assert.ok(step.includes(`run: ${command}`), `${name}: 실제 검사 명령을 유지해야 한다`);
    const scratch = scriptSources[script].match(/const SCRATCH =([\s\S]*?);/u)?.[1];
    assert.ok(scratch?.includes(`process.env.${variable}`), `${name}: 실제 검증기가 같은 출력 변수를 읽어야 한다`);
  }
}

test("인앱 route와 sweep 결과가 실패해도 보존되는 업로드 경로에 기록된다", () => {
  validateEvidencePaths(workflow);
});

test("출력 변수 누락·업로드 밖 경로·검증 간 증거 충돌을 거부한다", () => {
  for (const { variable } of probes) {
    const line = new RegExp(`^ {10}${variable}: .+$`, "mu");
    for (const replacement of [
      "",
      `          ${variable}: /tmp/not-uploaded`,
      `          ${variable}: \${{ github.workspace }}/artifacts/../not-uploaded`,
    ]) assert.throws(() => validateEvidencePaths(workflow.replace(line, replacement)));
  }
  assert.throws(() => validateEvidencePaths(workflow.replace(
    "artifacts/studio-inapp-feature-sweep", "artifacts/studio-inapp-route-matrix")));
});

test("업로드 누락·실패시 업로드 취소·명령 생략을 거부한다", () => {
  for (const change of [
    (text) => text.replace("            artifacts/", "            other-artifacts/"),
    (text) => text.replace("name: Preserve browser evidence\n        if: always()", "name: Preserve browser evidence\n        if: success()"),
    (text) => text.replace("run: pnpm run verify:studio-inapp-feature-sweep", "run: echo skipped"),
  ]) assert.throws(() => validateEvidencePaths(change(workflow)));
});

test("실제 검증기의 출력 변수 계약이 끊기면 거부한다", () => {
  for (const { script, variable } of probes) {
    assert.throws(() => validateEvidencePaths(workflow, { ...sources,
      [script]: sources[script].replace(`process.env.${variable}`, "undefined"),
    }));
  }
});
