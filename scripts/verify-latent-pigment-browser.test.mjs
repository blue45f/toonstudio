import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, it as test } from "vitest";

import { compareModuleSources, isExternalMixboxModule, verifyArtifactDigests } from "./verify-latent-pigment-browser.mjs";

const temporary = [];
afterEach(() => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

const hash = (value) => createHash("sha256").update(value).digest("hex");

test("외부 패키지의 이름·pnpm·직접 경로를 거부하고 저장 호환 식별자는 허용한다", () => {
  for (const id of ["mixbox", "mixbox/mixbox.esm.js", "/repo/node_modules/mixbox/mixbox.js",
    "/repo/node_modules/.pnpm/mixbox@2.0.0/node_modules/mixbox/mixbox.esm.js?commonjs",
    "C:\\repo\\node_modules\\mixbox\\mixbox.js"]) assert.equal(isExternalMixboxModule(id), true, id);
  for (const id of ["pigment-mixbox", "mixbox-js-v2", "/repo/brush-studio-v6-recipe-catalog-mixbox.ts",
    "/repo/node_modules/mixbox-example/index.js"]) assert.equal(isExternalMixboxModule(id), false, id);
});

test("기록 이후 변경·삭제된 소스를 현재 증거와 구분한다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "latent-pigment-source-evidence-"));
  temporary.push(root);
  await writeFile(path.join(root, "unchanged.ts"), "원본");
  await writeFile(path.join(root, "changed.ts"), "변경");
  const audit = { modules: [
    { id: "unchanged.ts", sha256: hash("원본") }, { id: "changed.ts", sha256: hash("원본") },
    { id: "missing.ts", sha256: hash("원본") }, { id: "\0rolldown/runtime.js", sha256: null, virtual: true },
  ] };
  const state = await compareModuleSources(root, audit);
  assert.equal(state.stale, true);
  assert.deepEqual(state.changed, [{ id: "changed.ts", recordedSha256: hash("원본"), currentSha256: hash("변경") }]);
  assert.deepEqual(state.unavailable, ["missing.ts"]);
});

test("이전 결과의 성공 원장이 변조되면 검증된 증거로 받아들이지 않는다", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "latent-pigment-artifact-evidence-"));
  temporary.push(output);
  await writeFile(path.join(output, "result.json"), '{"pass":true}');
  const record = { schemaVersion: 2, artifacts: { "result.json": hash('{"pass":true}') } };
  assert.equal((await verifyArtifactDigests(output, record)).verified, true);
  await writeFile(path.join(output, "result.json"), '{"pass":false}');
  const altered = await verifyArtifactDigests(output, record);
  assert.equal(altered.verified, false);
  assert.equal(altered.artifacts[0].verified, false);
  assert.equal((await verifyArtifactDigests(output, {})).verified, false);
});
