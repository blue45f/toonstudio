import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assertPrivateNativeBody, ATLAS_NATIVE_INTAKE, ATLAS_NATIVE_PACK, ATLAS_NATIVE_BASE_COUNTS, ATLAS_NATIVE_EXPECTED_MODELS, LICENSED_NATIVE_INTAKE, LICENSED_NATIVE_PACKS, LUMA_NATIVE_INTAKE, LUMA_NATIVE_PACK, LUMA_NATIVE_EXPECTED_MODELS, isReleaseNativeIntake, isSupportedNativeIntake, nativeCatalogRightsProblems, nativeProofProblems, reusableNativeValidationProblems, selectNativeRepresentatives } from "./lib/creator-bundle-native-proof.mjs";
import { packRightsProjection } from "./lib/creator-bundle-pack-rights.mjs";
import { LUMA_NATIVE_COMPOSITE_CONFIG_PATH, NATIVE_COMPOSITE_CONFIG_PATH, createNativeBundleReleaseTrace } from "./lib/creator-bundle-native-release.mjs";
import { FIXTURE_LIBRARY_PACK, fixtureLedger, fixtureLicenseText, ledgerEntry, qualifyingEvidence } from "./lib/creator-bundle-pack-rights-test-support.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const rights = { status: "public-domain", licenseName: "CC0-1.0", commercialUse: true, attributionRequired: false };
const sha256 = "a".repeat(64);
function fixture({ licensed = false, attribution } = {}) {
  const ingestId = licensed ? LICENSED_NATIVE_PACKS[0].ingestId : "cbv1-ingest-local-cute-park";
  const id = `${ingestId}-unit-model`, sourceRights = licensed
    ? { ...rights, status: "licensed", licenseName: "합성 native 검증 라이선스", ...(attribution === undefined ? {} : { attributionRequired: true, attribution }) }
    : { ...rights };
  const entry = ledgerEntry({ title: "합성 native 팩", catalogIds: [licensed ? LICENSED_NATIVE_PACKS[0].ledgerPackId : "cbv1-008-cute-park-pack"],
    creator: licensed ? "EmaceArt" : "RG Poly", licenseClass: licensed ? "emaceart-local-license" : "cc0-explicit",
    libraryPacks: [FIXTURE_LIBRARY_PACK], serve: "allow", grant: { ...sourceRights },
    evidence: [qualifyingEvidence("local-license-file"), ...(licensed
      ? [qualifyingEvidence("purchase-receipt"), qualifyingEvidence("producer-written-confirmation")] : [])] });
  const assets = [{ id, pack: 0, path: `${ingestId}/native/Unit.glb`, bytes: 123, sha256 }];
  const ledger = fixtureLedger([entry], [fixtureLicenseText({ class: licensed ? "emaceart-app-shipping-explicit" : "rg-poly-cc0" })]);
  const themePacks = { packs: [{ title: entry.title, creator: entry.creator, catalogIds: entry.catalogIds,
    ingestPackIds: [ingestId], placeable: 1, rights: packRightsProjection(entry) }], assets };
  return {
    assets, themePacks, ledger,
    rows: [{ id, packIndex: 0, ok: true, bytes: 123, sha256: `sha256:${sha256}`, profile: "mobile", rights: { ...sourceRights } }],
    worker: { requests: 3, responses: 3, rejected: 0, profileErrors: 0, errors: [], urls: ["http://127.0.0.1/studio-bg3d-glb-validation.worker.ts"] },
    representatives: [{ index: 0, id }],
    renders: [{ id, packIndex: 0, bytes: 123, sha256: `sha256:${sha256}`, shaderErrors: [], foregroundPixels: 8000,
      materials: [{ type: "MeshStandardMaterial" }], backend: { renderer: "ANGLE Metal Renderer: Apple M2 Max" },
      camera: { corners: Array.from({ length: 8 }, () => [0.5, 0.5, 0.5]) }, normalizedSize: [2, 1, 1] }],
    wrongHash: { code: "hash-mismatch" }, errors: [],
  };
}

test("실제 카탈로그의 기존 8팩과 실제 편입된 구매 팩의 대표를 정확히 선택한다", () => {
  const catalog = JSON.parse(readFileSync(new URL("../apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json", import.meta.url)));
  const selected = selectNativeRepresentatives(catalog);
  const additions = LICENSED_NATIVE_PACKS.filter(({ ingestId }) => catalog.assets.some((asset) => asset.path.startsWith(`${ingestId}/native/`)));
  assert.equal(selected.length, 8 + additions.length);
  assert.equal(new Set(selected.map(({ index }) => catalog.assets[index].pack)).size, 8 + additions.length);
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
  const value = { assets: proof.assets, rows: proof.rows, summary, catalogSha256, themePacks: proof.themePacks, ledger: proof.ledger };
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

test("licensed 구매 팩의 원장·공개 권리·레코드 출처가 정확히 같아야 전수 증거로 인정한다", () => {
  const value = fixture({ licensed: true, attribution: "합성 원작자 출처" });
  assert.deepEqual(nativeCatalogRightsProblems(value), []);
  assert.deepEqual(nativeProofProblems(value), []);
  assert.equal(value.rows[0].rights.status, "licensed");
  assert.equal(value.rows[0].rights.attribution, "합성 원작자 출처");
  for (const mutate of [
    (proof) => { delete proof.rows[0].rights.attribution; },
    (proof) => { proof.rows[0].rights.attribution = "다른 원작자"; },
    (proof) => { proof.themePacks.packs[0].rights.status = "public-domain"; proof.rows[0].rights.status = "public-domain"; },
    (proof) => { proof.themePacks.packs[0].rights.licenseName = "CC0-1.0"; proof.rows[0].rights.licenseName = "CC0-1.0"; },
    (proof) => { proof.themePacks.packs[0].rights.commercialUse = false; proof.rows[0].rights.commercialUse = false; },
    (proof) => { delete proof.themePacks.packs[0].rights.attribution; delete proof.rows[0].rights.attribution; },
    (proof) => { proof.rows[0].packIndex = 1; },
    (proof) => { proof.renders[0].packIndex = 1; },
  ]) {
    const proof = fixture({ licensed: true, attribution: "합성 원작자 출처" }); mutate(proof);
    assert.ok(nativeProofProblems(proof).length > 0, mutate.toString());
  }
});

test("기대 권리 원장·카탈로그가 없거나 원장 항목이 hold면 CC0 레코드를 제시해도 성공하지 않는다", () => {
  for (const mutate of [
    (proof) => { delete proof.ledger; },
    (proof) => { delete proof.themePacks; },
    (proof) => { proof.ledger.packs = []; },
    (proof) => { proof.ledger.packs[0].serve = "hold"; proof.ledger.packs[0].holdReason = "technical-intake-pending"; proof.ledger.packs[0].holdLabel = "기술 편입 대기"; },
    (proof) => { proof.rows[0].rights.status = "unknown"; },
  ]) {
    const proof = fixture(); mutate(proof);
    assert.ok(nativeProofProblems(proof).length > 0, mutate.toString());
  }
});

test("모델의 다른 팩 표시와 모델이 없는 공개 팩의 권리 변조도 원장 대조에서 거부한다", () => {
  const proof = fixture({ licensed: true });
  const other = ledgerEntry({ title: "다른 합성 팩", catalogIds: ["cbv1-902-other-native"], serve: "allow", grant: { ...proof.rows[0].rights } });
  proof.ledger.packs.push(other);
  proof.themePacks.packs.push({ title: other.title, creator: other.creator, catalogIds: other.catalogIds,
    ingestPackIds: ["cbv1-ingest-other"], placeable: 0, rights: packRightsProjection(other) });
  assert.deepEqual(nativeProofProblems(proof), []);
  proof.assets[0].pack = 1; proof.rows[0].packIndex = 1; proof.renders[0].packIndex = 1;
  assert.ok(nativeProofProblems(proof).some((problem) => /인제스션/u.test(problem)));
  proof.assets[0].pack = 0; proof.rows[0].packIndex = 0; proof.renders[0].packIndex = 0;
  proof.themePacks.packs[1].rights.status = "public-domain";
  assert.ok(nativeProofProblems(proof).some((problem) => /공개 팩 권리/u.test(problem)));
});

test("기존 8팩의 CC0 단언을 공개·원장의 일치만으로 licensed로 바꾸지 않는다", () => {
  const proof = fixture({ licensed: true });
  const ingestId = "cbv1-ingest-local-cute-park";
  proof.assets[0].id = `${ingestId}-unit-model`; proof.assets[0].path = `${ingestId}/native/Unit.glb`;
  proof.themePacks.packs[0].ingestPackIds = [ingestId];
  proof.rows[0].id = proof.assets[0].id; proof.renders[0].id = proof.assets[0].id; proof.representatives[0].id = proof.assets[0].id;
  assert.ok(nativeProofProblems(proof).some((problem) => /기존 8팩의 CC0/u.test(problem)));
});

test("같은 CC0 권리라도 기존 Park 인제스션을 Nature 등 다른 owner에 붙이면 거부한다", () => {
  const proof = fixture(), otherId = "cbv1-030-nature-megapack-extended";
  const entry = proof.ledger.packs[0], pack = proof.themePacks.packs[0];
  entry.id = otherId; entry.catalogIds = [otherId]; entry.title = "다른 CC0 owner 합성 fixture";
  pack.catalogIds = [otherId]; pack.title = entry.title;
  assert.deepEqual(pack.rights, packRightsProjection(entry));
  assert.ok(nativeProofProblems(proof).some((problem) => /원장 소속/u.test(problem)));
});

test("추가 팩 metadata ID만으로 대표를 강제하지 않고 실제 등록된 팩만 독립적으로 요구한다", () => {
  const catalog = JSON.parse(readFileSync(new URL("../apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json", import.meta.url)));
  const base = { ...catalog, assets: catalog.assets.filter((asset) => !LICENSED_NATIVE_PACKS.some(({ ingestId }) => asset.path.startsWith(`${ingestId}/native/`))),
    packs: catalog.packs.map((pack) => ({ ...pack, placeable: 0 })) };
  for (const pack of LICENSED_NATIVE_PACKS) base.packs.push({ ingestPackIds: [pack.ingestId], placeable: 0 });
  assert.equal(selectNativeRepresentatives(base).length, 8);
  const first = LICENSED_NATIVE_PACKS[0];
  base.assets.push({ id: "합성 대표 선택 항목", path: `${first.ingestId}/native/${first.source}`, pack: base.packs.length - 2 });
  assert.equal(selectNativeRepresentatives(base).length, 9);
  base.assets[base.assets.length - 1].path = `${first.ingestId}/native/Other.glb`;
  assert.throws(() => selectNativeRepresentatives(base), /대표 모델/u);
  base.assets.pop(); base.packs[base.packs.length - 1].placeable = 1;
  assert.throws(() => selectNativeRepresentatives(base), /대표 모델/u);
  assert.throws(() => selectNativeRepresentatives(base, { expectedIntake: LICENSED_NATIVE_INTAKE }), /대표 모델/u);
});

test("이번 paired 편입 옵션은 각각 50·115개를 요구하고 일부 등록을 전수 성공으로 세지 않는다", () => {
  const proof = fixture({ licensed: true });
  assert.deepEqual(nativeCatalogRightsProblems(proof), []);
  const problems = nativeCatalogRightsProblems({ ...proof, expectedIntake: LICENSED_NATIVE_INTAKE });
  assert.ok(problems.some((problem) => problem.includes("50개 필요")));
  assert.ok(problems.some((problem) => problem.includes("115개 필요")));
  assert.ok(nativeProofProblems({ ...proof, expectedIntake: LICENSED_NATIVE_INTAKE }).length > 0);
  assert.ok(nativeCatalogRightsProblems({ ...proof, expectedIntake: "unknown-intake" }).length > 0);
  // 모델 바이트/Worker 성공 기록을 만들지 않는 합성 카탈로그 수량 fixture다.
  const second = ledgerEntry({ title: "추가 수량 합성 팩", catalogIds: [LICENSED_NATIVE_PACKS[1].ledgerPackId],
    serve: "allow", grant: { ...proof.ledger.packs[0].grant } });
  proof.ledger.packs.push(second);
  proof.themePacks.packs.push({ title: second.title, creator: second.creator, catalogIds: second.catalogIds,
    ingestPackIds: [LICENSED_NATIVE_PACKS[1].ingestId], placeable: 115, rights: packRightsProjection(second) });
  proof.themePacks.assets = LICENSED_NATIVE_PACKS.flatMap((pack, index) => Array.from({ length: pack.models }, (_, item) => ({
    id: `${pack.ingestId}-unit-${item}`, pack: index, path: `${pack.ingestId}/native/Unit-${item}.glb`, bytes: 123, sha256,
  })));
  assert.deepEqual(nativeCatalogRightsProblems({ ...proof, expectedIntake: LICENSED_NATIVE_INTAKE }), []);
  proof.themePacks.assets.pop();
  assert.ok(nativeCatalogRightsProblems({ ...proof, expectedIntake: LICENSED_NATIVE_INTAKE }).some((problem) => problem.includes("115개 필요")));
});

/** 모델 바이트·Worker·GPU를 실행하지 않는 판정기 입력 fixture다. 실제 전수 성공 증거가 아니다. */
function atlasFixture() {
  const themePacks = JSON.parse(readFileSync(new URL("../apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json", import.meta.url)));
  const ledger = JSON.parse(readFileSync(new URL("../config/creator-bundle-pack-rights.json", import.meta.url)));
  const baseIngestIds = new Set(ATLAS_NATIVE_BASE_COUNTS.map(([ingest]) => ingest));
  const baseAssets = themePacks.assets.filter((asset) => baseIngestIds.has(asset.path.split("/")[0]));
  const pack = themePacks.packs.findIndex((candidate) => candidate.ingestPackIds.includes(ATLAS_NATIVE_PACK.ingestId));
  assert.ok(pack >= 0);
  themePacks.packs[pack].placeable = 3300;
  themePacks.assets = [...baseAssets, ...Array.from({ length: 3300 }, (_, index) => ({
    id: `${ATLAS_NATIVE_PACK.ingestId}-synthetic-${index}`, pack,
    path: `${ATLAS_NATIVE_PACK.ingestId}/native/${index === 0 ? "Farm Plants/Lettuce_C.glb" : `Synthetic/model-${index}.glb`}`,
    bytes: 123, sha256,
  }))];
  themePacks.totals = { ...themePacks.totals, placeableAssets: 5229 };
  const assets = themePacks.assets;
  const rows = assets.map((asset) => {
    const sourceRights = { ...themePacks.packs[asset.pack].rights };
    delete sourceRights.serve;
    return { id: asset.id, packIndex: asset.pack, ok: true, bytes: asset.bytes,
      sha256: `sha256:${asset.sha256}`, profile: "mobile", rights: sourceRights };
  });
  const representatives = selectNativeRepresentatives(themePacks, { expectedIntake: ATLAS_NATIVE_INTAKE });
  const sample = fixture();
  const renders = representatives.map(({ index }) => ({ ...structuredClone(sample.renders[0]),
    id: assets[index].id, packIndex: assets[index].pack, bytes: assets[index].bytes,
    sha256: `sha256:${assets[index].sha256}` }));
  const calls = assets.length + 2 * representatives.length;
  const releaseBinding = { descriptorSha256: "e".repeat(64), descriptorBytes: 512,
    compositeConfigSha256: "f".repeat(64), compositeConfigBytes: 1024,
    catalog: { url: `/assets/3d/environments/bundle-v1/theme-packs.${"c".repeat(64)}.json`, sha256: "c".repeat(64), bytes: 1234 },
    index: { url: `/assets/3d/environments/bundle-v1/deploy-index.${"d".repeat(64)}.json`, sha256: "d".repeat(64), bytes: 234 } };
  const releaseTrace = createNativeBundleReleaseTrace(releaseBinding);
  releaseTrace.catalog.requests = 1; releaseTrace.index.requests = 1; releaseTrace.descriptorRequests = 1;
  const nonce = "00000000-0000-4000-8000-000000000001";
  releaseTrace.completion.requests = 1;
  releaseTrace.completion.responses.push({ method: "GET", requestTarget: `${releaseTrace.completion.url}?release-check=${nonce}`,
    releaseCheckNonce: nonce, status: 200, bodySha256: releaseBinding.index.sha256, bodyBytes: releaseBinding.index.bytes,
    qaSynthetic: true, actualR2Proof: false, productionValidation: false });
  return { ...sample, themePacks, ledger, assets, rows, representatives, renders,
    expectedIntake: ATLAS_NATIVE_INTAKE, catalogSha256: "c".repeat(64),
    worker: { ...sample.worker, requests: calls, responses: calls }, releaseBinding, releaseTrace };
}

test("Atlas 명시 모드는 기존 10팩1929개와 Nature3300개·정확 원장 소속을 함께 요구한다", () => {
  const proof = atlasFixture();
  assert.equal(proof.assets.length, 5229);
  assert.equal(ATLAS_NATIVE_EXPECTED_MODELS, 5229);
  assert.deepEqual(nativeCatalogRightsProblems(proof), []);
  for (const mutate of [
    (value) => { value.assets.pop(); },
    (value) => { value.themePacks.totals.placeableAssets = 1929; },
    (value) => { value.themePacks.packs[value.assets.at(-1).pack].placeable = 3299; },
    (value) => { value.assets[0].path = value.assets[0].path.replace("cute-park", "other-pack"); },
    (value) => { value.themePacks.packs[value.assets.at(-1).pack].rights.status = "licensed"; },
  ]) {
    const value = atlasFixture(); mutate(value);
    assert.ok(nativeCatalogRightsProblems(value).length > 0, mutate.toString());
  }
  const swapped = atlasFixture(), natureIndex = swapped.assets.at(-1).pack;
  const park = swapped.themePacks.packs.find((candidate) => candidate.catalogIds.includes("cbv1-008-cute-park-pack"));
  Object.assign(swapped.themePacks.packs[natureIndex], {
    title: park.title, creator: park.creator, catalogIds: [...park.catalogIds], rights: { ...park.rights },
  });
  assert.ok(nativeCatalogRightsProblems(swapped).some((problem) => /Nature Atlas의 원장 소속/u.test(problem)));
});

test("Atlas 대표는 기존8·Cemetery·SmallProps를 유지하고 실제 Lettuce 경로를 11번째로 요구한다", () => {
  const proof = atlasFixture();
  assert.equal(proof.representatives.length, 11);
  assert.equal(proof.representatives.at(-1).path, "cbv1-ingest-007-030-nature-godot/native/Farm Plants/Lettuce_C.glb");
  const base = selectNativeRepresentatives(proof.themePacks, { expectedIntake: LICENSED_NATIVE_INTAKE });
  assert.deepEqual(proof.representatives.slice(0, 10), base);
  proof.themePacks.assets.at(-3300).path = "cbv1-ingest-007-030-nature-godot/native/Other.glb";
  assert.throws(() => selectNativeRepresentatives(proof.themePacks, { expectedIntake: ATLAS_NATIVE_INTAKE }), /대표 모델/u);
});

test("Atlas 판정은 전수5229 Worker·11대표·현재catalogSHA를 요구하고 샘플 또는 과거receipt를 거부한다", () => {
  const proof = atlasFixture();
  assert.deepEqual(nativeProofProblems(proof), []);
  for (const mutate of [
    (value) => { value.rows = value.rows.slice(0, 1929); },
    (value) => { value.worker.requests = 1929 + 20; value.worker.responses = 1929 + 20; },
    (value) => { value.renders.pop(); },
    (value) => { value.representatives.pop(); value.renders.pop(); value.worker.requests -= 2; value.worker.responses -= 2; },
    (value) => { delete value.catalogSha256; },
    (value) => { delete value.releaseBinding; },
    (value) => { value.releaseTrace.index.requests = 0; },
    (value) => { delete value.releaseTrace.completion; },
    (value) => { value.releaseTrace.completion.requests = 0; },
    (value) => { value.releaseTrace.completion.responses[0].bodySha256 = "f".repeat(64); },
    (value) => { value.releaseTrace.actualR2Proof = true; },
    (value) => { value.releaseTrace.catalog.sha256 = "f".repeat(64); },
    (value) => { value.releaseTrace.unexpected.push("/assets/3d/environments/bundle-v1/theme-packs.json"); },
    (value) => { value.rows.at(-1).rights.status = "licensed"; },
  ]) {
    const value = atlasFixture(); mutate(value);
    assert.ok(nativeProofProblems(value).length > 0, mutate.toString());
  }
  const summary = { status: "ok", expectedIntake: ATLAS_NATIVE_INTAKE, catalogSha256: proof.catalogSha256,
    assets: proof.assets.length, validated: proof.assets.length,
    bytes: proof.assets.reduce((sum, asset) => sum + asset.bytes, 0), failures: [], problems: [],
    wrongHash: proof.wrongHash, worker: proof.worker, renders: proof.renders,
    releaseBinding: proof.releaseBinding, releaseTrace: proof.releaseTrace };
  const reusable = { assets: proof.assets, rows: proof.rows, summary, catalogSha256: proof.catalogSha256,
    themePacks: proof.themePacks, ledger: proof.ledger, expectedIntake: ATLAS_NATIVE_INTAKE,
    releaseBinding: proof.releaseBinding };
  assert.deepEqual(reusableNativeValidationProblems(reusable), []);
  // catalog/index 전용 과거 Atlas receipt는 새 completion 검사 성공 증거로 재해석하지 않는다.
  const historicalSummary = structuredClone(summary);
  delete historicalSummary.releaseTrace.completion;
  delete historicalSummary.releaseTrace.qaSynthetic;
  delete historicalSummary.releaseTrace.actualR2Proof;
  delete historicalSummary.releaseTrace.productionValidation;
  assert.ok(reusableNativeValidationProblems({ ...reusable, summary: historicalSummary }).length > 0);
  for (const patch of [
    { expectedIntake: LICENSED_NATIVE_INTAKE }, { assets: 1929, validated: 1929 },
    { catalogSha256: "d".repeat(64) },
    { releaseBinding: undefined },
    { releaseBinding: { ...proof.releaseBinding, descriptorSha256: "f".repeat(64) } },
    { releaseBinding: { ...proof.releaseBinding, compositeConfigSha256: "a".repeat(64) } },
  ]) assert.ok(reusableNativeValidationProblems({ ...reusable, summary: { ...summary, ...patch } }).length > 0);
  const reusedValidation = { expectedIntake: ATLAS_NATIVE_INTAKE, validated: 5229,
    sourceCatalogSha256: proof.catalogSha256, summarySha256: sha256, rowsSha256: sha256,
    releaseBinding: proof.releaseBinding };
  assert.deepEqual(nativeProofProblems({ ...proof, reusedValidation,
    worker: { ...proof.worker, requests: 22, responses: 22 } }), []);
  assert.ok(nativeProofProblems({ ...proof, reusedValidation: { ...reusedValidation, sourceCatalogSha256: "d".repeat(64) },
    worker: { ...proof.worker, requests: 22, responses: 22 } }).length > 0);
});

/** 5434개 기대 판정용 합성 metadata이며 실제 GLB·Worker·GPU 실행 증거가 아니다. */
function lumaFixture() {
  const proof = atlasFixture(), pack = proof.themePacks.packs.findIndex((candidate) => candidate.ingestPackIds.includes(LUMA_NATIVE_PACK.ingestId));
  assert.ok(pack >= 0);
  const entry = proof.ledger.packs.find((candidate) => candidate.id === LUMA_NATIVE_PACK.ledgerPackId);
  assert.equal(entry.grant.status, "licensed");
  proof.themePacks.packs[pack].placeable = LUMA_NATIVE_PACK.models;
  proof.assets.push(...Array.from({ length: LUMA_NATIVE_PACK.models }, (_, index) => ({
    id: `${LUMA_NATIVE_PACK.ingestId}-synthetic-${index}`, pack,
    path: `${LUMA_NATIVE_PACK.ingestId}/native/${LUMA_NATIVE_PACK.sources[index] ?? `Synthetic/model-${index}.glb`}`,
    bytes: 123, sha256,
  })));
  proof.themePacks.totals.placeableAssets = 5434;
  const sourceRights = { ...packRightsProjection(entry) }; delete sourceRights.serve;
  proof.rows.push(...proof.assets.slice(-LUMA_NATIVE_PACK.models).map((asset) => ({
    id: asset.id, packIndex: pack, ok: true, bytes: asset.bytes, sha256: `sha256:${asset.sha256}`,
    profile: "mobile", rights: { ...sourceRights },
  })));
  proof.expectedIntake = LUMA_NATIVE_INTAKE;
  proof.representatives = selectNativeRepresentatives(proof.themePacks, { expectedIntake: LUMA_NATIVE_INTAKE });
  const sample = fixture().renders[0];
  proof.renders = proof.representatives.map(({ index }) => ({ ...structuredClone(sample),
    id: proof.assets[index].id, packIndex: proof.assets[index].pack, bytes: proof.assets[index].bytes,
    sha256: `sha256:${proof.assets[index].sha256}` }));
  proof.worker.requests = proof.assets.length + 2 * proof.representatives.length;
  proof.worker.responses = proof.worker.requests;
  proof.releaseBinding = { ...proof.releaseBinding, compositeConfigPath: LUMA_NATIVE_COMPOSITE_CONFIG_PATH };
  return proof;
}

test("Luma 모드는 기존 기본·licensed·Atlas 모드와 구분하고 5434개 및 팩별 수를 강제한다", () => {
  assert.equal(isSupportedNativeIntake(LUMA_NATIVE_INTAKE), true);
  assert.equal(isReleaseNativeIntake(LUMA_NATIVE_INTAKE), true);
  assert.equal(isReleaseNativeIntake(undefined), false);
  assert.equal(isReleaseNativeIntake(LICENSED_NATIVE_INTAKE), false);
  assert.equal(isSupportedNativeIntake("luma"), false);
  const proof = lumaFixture();
  assert.equal(LUMA_NATIVE_EXPECTED_MODELS, 5434);
  assert.equal(proof.assets.length, 5434);
  assert.deepEqual(nativeCatalogRightsProblems(proof), []);
  for (const mutate of [
    value => { value.assets.pop(); },
    value => { value.themePacks.totals.placeableAssets = 5229; },
    value => { value.themePacks.packs[value.assets.at(-1).pack].placeable = 204; },
    value => { value.assets[0].path = `${LUMA_NATIVE_PACK.ingestId}/native/Unexpected.glb`; value.assets[0].id = `${LUMA_NATIVE_PACK.ingestId}-unexpected`; value.assets[0].pack = value.assets.at(-1).pack; },
  ]) {
    const value = lumaFixture(); mutate(value);
    assert.ok(nativeCatalogRightsProblems(value).length > 0, mutate.toString());
  }
  assert.ok(nativeCatalogRightsProblems({ ...proof, expectedIntake: ATLAS_NATIVE_INTAKE }).length > 0);
  assert.ok(nativeCatalogRightsProblems({ ...atlasFixture(), expectedIntake: LUMA_NATIVE_INTAKE }).length > 0);
});

test("Luma는 현재 licensed 원장의 정확 owner·grant를 요구하고 Nature CC0와 기존 구매 권리도 보존한다", () => {
  for (const mutate of [
    value => { value.rows.at(-1).rights.status = "public-domain"; },
    value => { value.themePacks.packs[value.assets.at(-1).pack].rights.licenseName = "CC0-1.0"; },
    value => { value.ledger.packs.find((entry) => entry.id === LUMA_NATIVE_PACK.ledgerPackId).grant.status = "public-domain"; value.themePacks.packs[value.assets.at(-1).pack].rights.status = "public-domain"; },
    value => { value.ledger.packs.find((entry) => entry.id === LUMA_NATIVE_PACK.ledgerPackId).grant.redistributionAllowed = true; },
    value => { value.ledger.packs.find((entry) => entry.id === LUMA_NATIVE_PACK.ledgerPackId).grant.inServiceOnly = false; },
    value => { value.themePacks.packs.find((pack) => pack.ingestPackIds.includes(ATLAS_NATIVE_PACK.ingestId)).rights.status = "licensed"; },
    value => { value.rows.find((row) => row.id.startsWith(LICENSED_NATIVE_PACKS[0].ingestId)).rights.status = "public-domain"; },
  ]) {
    const value = lumaFixture(); mutate(value);
    assert.ok(nativeProofProblems(value).length > 0, mutate.toString());
  }
  const proof = lumaFixture(), luma = proof.themePacks.packs[proof.assets.at(-1).pack];
  const other = proof.themePacks.packs.find((pack) => pack.catalogIds.includes(LICENSED_NATIVE_PACKS[0].ledgerPackId));
  Object.assign(luma, { title: other.title, creator: other.creator, catalogIds: [...other.catalogIds], rights: { ...other.rights } });
  assert.ok(nativeCatalogRightsProblems(proof).some((problem) => /Luma의 원장 소속/u.test(problem)));
});

test("Luma 대표는 기존11개에 GreenTree·DSEmace·WaterLily 세 경로를 추가한다", () => {
  const proof = lumaFixture();
  assert.equal(proof.representatives.length, 14);
  assert.deepEqual(proof.representatives.slice(0, 11), selectNativeRepresentatives(proof.themePacks, { expectedIntake: ATLAS_NATIVE_INTAKE }));
  assert.deepEqual(proof.representatives.slice(-3).map(({ path }) => path), LUMA_NATIVE_PACK.sources.map((source) => `${LUMA_NATIVE_PACK.ingestId}/native/${source}`));
  proof.assets[proof.representatives.at(-1).index].path = `${LUMA_NATIVE_PACK.ingestId}/native/Other.glb`;
  assert.throws(() => selectNativeRepresentatives(proof.themePacks, { expectedIntake: LUMA_NATIVE_INTAKE }), /대표 모델/u);
});

test("Luma 증거는 전수5434 Worker·14대표·새 composite 경로·현재 release trace를 함께 요구한다", () => {
  assert.deepEqual(nativeProofProblems(lumaFixture()), []);
  for (const mutate of [
    value => { value.rows = value.rows.slice(0, 5229); },
    value => { value.worker.requests = 5229 + 22; value.worker.responses = 5229 + 22; },
    value => { value.representatives.pop(); value.renders.pop(); value.worker.requests -= 2; value.worker.responses -= 2; },
    value => { delete value.releaseBinding.compositeConfigPath; },
    value => { value.releaseBinding.compositeConfigPath = NATIVE_COMPOSITE_CONFIG_PATH; },
    value => { value.releaseTrace.completion.responses[0].bodySha256 = "f".repeat(64); },
    value => { value.releaseTrace.index.requests = 0; },
  ]) {
    const value = lumaFixture(); mutate(value);
    assert.ok(nativeProofProblems(value).length > 0, mutate.toString());
  }
});

test("Luma 재사용은 같은5434 catalog·명시모드·새 composite binding만 허용하고 과거5229 proof는 거부한다", () => {
  const proof = lumaFixture();
  const summary = { status: "ok", expectedIntake: LUMA_NATIVE_INTAKE, catalogSha256: proof.catalogSha256,
    assets: proof.assets.length, validated: proof.assets.length, bytes: proof.assets.reduce((sum, asset) => sum + asset.bytes, 0),
    failures: [], problems: [], wrongHash: proof.wrongHash, worker: proof.worker, renders: proof.renders,
    releaseBinding: proof.releaseBinding, releaseTrace: proof.releaseTrace };
  const input = { ...proof, summary };
  assert.deepEqual(reusableNativeValidationProblems(input), []);
  for (const patch of [
    { expectedIntake: ATLAS_NATIVE_INTAKE }, { assets: 5229, validated: 5229 }, { catalogSha256: "d".repeat(64) },
    { releaseBinding: { ...proof.releaseBinding, compositeConfigPath: NATIVE_COMPOSITE_CONFIG_PATH } },
    { releaseBinding: { ...proof.releaseBinding, compositeConfigSha256: "a".repeat(64) } },
  ]) assert.ok(reusableNativeValidationProblems({ ...input, summary: { ...summary, ...patch } }).length > 0);
  const old = atlasFixture();
  assert.ok(reusableNativeValidationProblems({ ...input, rows: old.rows,
    summary: { ...summary, assets: 5229, validated: 5229, expectedIntake: ATLAS_NATIVE_INTAKE,
      worker: old.worker, renders: old.renders, releaseBinding: old.releaseBinding } }).length > 0);
  const reusedValidation = { expectedIntake: LUMA_NATIVE_INTAKE, validated: 5434, sourceCatalogSha256: proof.catalogSha256,
    summarySha256: sha256, rowsSha256: sha256, releaseBinding: proof.releaseBinding };
  const worker = { ...proof.worker, requests: 28, responses: 28 };
  assert.deepEqual(nativeProofProblems({ ...proof, reusedValidation, worker }), []);
  assert.ok(nativeProofProblems({ ...proof, worker, reusedValidation: { ...reusedValidation, expectedIntake: ATLAS_NATIVE_INTAKE } }).length > 0);
});
