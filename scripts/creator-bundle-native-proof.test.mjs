import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertPrivateNativeBody, nativeProofProblems, reusableNativeValidationProblems, selectNativeRepresentatives } from "./lib/creator-bundle-native-proof.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const rights = { status: "public-domain", licenseName: "CC0-1.0", commercialUse: true, attributionRequired: false };
const sha256 = "a".repeat(64);
function fixture() {
  return {
    assets: [{ id: "one", bytes: 123, sha256 }],
    rows: [{ id: "one", ok: true, bytes: 123, sha256: `sha256:${sha256}`, profile: "mobile", rights }],
    worker: { requests: 3, responses: 3, rejected: 0, profileErrors: 0, errors: [], urls: ["http://127.0.0.1/studio-bg3d-glb-validation.worker.ts"] },
    representatives: [{ index: 0, id: "one" }],
    renders: [{ id: "one", bytes: 123, sha256: `sha256:${sha256}`, shaderErrors: [], foregroundPixels: 8000,
      materials: [{ type: "MeshStandardMaterial" }], backend: { renderer: "ANGLE Metal Renderer: Apple M2 Max" },
      camera: { corners: Array.from({ length: 8 }, () => [0.5, 0.5, 0.5]) }, normalizedSize: [2, 1, 1] }],
    wrongHash: { code: "hash-mismatch" }, errors: [],
  };
}

test("실제 카탈로그에서 서로 다른 8팩의 대표 모델을 정확히 선택한다", () => {
  const catalog = JSON.parse(readFileSync(new URL("../apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json", import.meta.url)));
  const selected = selectNativeRepresentatives(catalog);
  assert.equal(selected.length, 8);
  assert.equal(new Set(selected.map(({ index }) => catalog.assets[index].pack)).size, 8);
  assert.throws(() => selectNativeRepresentatives({ assets: [] }), /대표 모델/);
});

test("SHA URL 응답 전 다시 해시하여 크기가 같은 변조도 거부한다", () => {
  const body = Buffer.from("verified private GLB body");
  const object = { bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
  assert.doesNotThrow(() => assertPrivateNativeBody(body, object));
  const tampered = Buffer.from(body); tampered[3] ^= 1;
  assert.throws(() => assertPrivateNativeBody(tampered, object), /변조/);
  assert.throws(() => assertPrivateNativeBody(body.subarray(1), object), /변조/);
});

test("전체 SHA/권리/모바일 Worker와 실제 대표 렌더 증거가 모두 일치해야 통과한다", () => {
  assert.deepEqual(nativeProofProblems(fixture()), []);
  const mutations = [
    (value) => { value.rows = []; },
    (value) => { value.rows.push(value.rows[0]); },
    (value) => { value.rows[0].sha256 = `sha256:${"b".repeat(64)}`; },
    (value) => { value.rows[0].profile = "desktop"; },
    (value) => { value.rows[0].rights = { ...rights, status: "unknown" }; },
    (value) => { value.rows[0].rights = { ...rights, commercialUse: false }; },
    (value) => { value.rows[0].rights = { ...rights, attributionRequired: true }; },
    (value) => { value.worker.requests = 0; },
    (value) => { value.worker.responses = 2; },
    (value) => { value.worker.rejected = 1; },
    (value) => { value.worker.urls = ["direct-backend"]; },
    (value) => { value.wrongHash.code = "invalid-file"; },
    (value) => { value.renders = []; },
    (value) => { value.renders[0].normalizedSize = [20, 10, 10]; },
    (value) => { value.renders[0].normalizedSize = [NaN, 1, 1]; },
    (value) => { value.renders[0].backend.renderer = "Google SwiftShader"; },
    (value) => { value.renders[0].shaderErrors = ["compile failed"]; },
    (value) => { value.renders[0].foregroundPixels = 0; },
    (value) => { value.renders[0].camera.corners[0] = [1.2, 0, 0.5]; },
  ];
  for (const mutate of mutations) {
    const value = fixture(); mutate(value);
    assert.ok(nativeProofProblems(value).length > 0, mutate.toString());
  }
});

test("전수 증거 재사용은 같은 카탈로그와 모든 원본 SHA/Worker 성공 기록을 요구한다", () => {
  const proof = fixture();
  const catalogSha256 = "c".repeat(64);
  const summary = { status: "ok", catalogSha256, assets: 1, validated: 1, bytes: 123,
    failures: [], problems: [], wrongHash: proof.wrongHash, worker: proof.worker, renders: proof.renders };
  const value = { assets: proof.assets, rows: proof.rows, summary, catalogSha256 };
  assert.deepEqual(reusableNativeValidationProblems(value), []);
  for (const mutate of [
    (input) => { input.catalogSha256 = "d".repeat(64); },
    (input) => { input.assets[0].sha256 = "e".repeat(64); },
    (input) => { input.rows[0].rights.status = "unknown"; },
    (input) => { input.summary.status = "failed"; },
    (input) => { input.summary.worker.responses = 1; },
    (input) => { input.summary.worker.rejected = 1; },
  ]) {
    const input = structuredClone(value); mutate(input);
    assert.ok(reusableNativeValidationProblems(input).length > 0, mutate.toString());
  }
  const reused = { ...proof, worker: { ...proof.worker, requests: 2, responses: 2 },
    reusedValidation: { validated: 1, sourceCatalogSha256: catalogSha256, summarySha256: sha256, rowsSha256: sha256 } };
  assert.deepEqual(nativeProofProblems(reused), []);
  reused.reusedValidation.rowsSha256 = "";
  assert.ok(nativeProofProblems(reused).length > 0);
});
