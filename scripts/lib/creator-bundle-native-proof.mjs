import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { evaluateServeDecision, packRightsProjection, validatePackRightsLedger } from "./creator-bundle-pack-rights.mjs";
import { isRecord, relativePathProblem } from "./creator-bundle-pack-rights-form.mjs";

const LEGACY_REPRESENTATIVES = Object.freeze([
  ["cbv1-ingest-local-cute-park", "Bench_1_1.glb", "cbv1-008-cute-park-pack"],
  ["cbv1-ingest-local-cute-dungeon", "Furniture/Chair_1.glb", "cbv1-024-cute-dungeon-megapack"],
  ["cbv1-ingest-local-cute-graveyard", "Tombstone_1.glb", "cbv1-014-cute-graveyard"],
  ["cbv1-ingest-local-medieval-weapons", "BattleAxe_1_1_A.glb", "cbv1-076-medieval-weapons"],
  ["cbv1-ingest-local-scifi-blue-base", "Other/PilarP_1_A.glb", "cbv1-053-scifi-arena-blue-base"],
  ["cbv1-ingest-local-cartoon-car-megapack", "Other/PoliceCar.glb", "cbv1-081-cartoon-car-megapack"],
  ["cbv1-ingest-local-cartoon-cars-2", "Car_Ambulance_MC_1_B.glb", "cbv1-017-cartoon-cars-2"],
  ["cbv1-ingest-local-army-pack", "Heli_1_B.glb", "cbv1-018-army-pack"],
]);
export const LICENSED_NATIVE_INTAKE = "licensed-20261029";
export const LICENSED_NATIVE_PACKS = Object.freeze([
  Object.freeze({ ingestId: "cbv1-ingest-local-cemetery-statues", ledgerPackId: "cbv1-012-cemetery-statues", models: 50, source: "EA_Characters_Gargoyle_Clean_01a.glb" }),
  Object.freeze({ ingestId: "cbv1-ingest-local-small-props-pack", ledgerPackId: "cbv1-077-small-props-pack", models: 115, source: "Bag_1_A.glb" }),
]);

function belongsToIngest(asset, ingestId) {
  return typeof asset?.path === "string" && asset.path.startsWith(`${ingestId}/native/`);
}

/** 공개 JSON의 자기 선언만 믿지 않고 현재 원장과 실제 모델 소속을 함께 대조한다. */
function expectedNativeRights({ themePacks, ledger, expectedIntake } = {}) {
  const problems = [], byId = new Map();
  if (!isRecord(themePacks) || !Array.isArray(themePacks.packs) || !Array.isArray(themePacks.assets) || !isRecord(ledger)) {
    return { problems: ["기대 권리를 정할 현재 카탈로그와 권리 원장이 필요합니다."], byId };
  }
  if (validatePackRightsLedger(ledger).length > 0) return { problems: ["기대 권리 원장이 유효하지 않습니다."], byId };
  if (themePacks.assets.length === 0) problems.push("현재 카탈로그에 검증할 native 모델이 없습니다.");
  if (expectedIntake !== undefined && expectedIntake !== LICENSED_NATIVE_INTAKE) problems.push("알 수 없는 native 편입 기대 범위입니다.");
  const packs = new Map();
  for (const [index, pack] of themePacks.packs.entries()) {
    const decision = isRecord(pack) ? evaluateServeDecision(ledger, pack, { group: "pack" }) : null;
    if (!decision?.serve) {
      problems.push(`공개 팩의 현재 원장 서빙 권리를 확인할 수 없습니다: ${index}`); continue;
    }
    const projection = packRightsProjection(decision.entry);
    if (!isDeepStrictEqual(pack.rights, projection) || projection.commercialUse !== true) {
      problems.push(`공개 팩 권리가 현재 원장과 다릅니다: ${index}`); continue;
    }
    packs.set(index, { entryId: decision.entry.id, rights: { status: projection.status, licenseName: projection.licenseName,
      commercialUse: projection.commercialUse, attributionRequired: projection.attributionRequired,
      ...(projection.attribution === undefined ? {} : { attribution: projection.attribution }) } });
  }
  for (const asset of themePacks.assets) {
    const pack = Number.isInteger(asset?.pack) ? themePacks.packs[asset.pack] : undefined;
    if (!isRecord(asset) || !isRecord(pack) || typeof asset.id !== "string" || byId.has(asset.id)
      || relativePathProblem(asset.path) !== null || !asset.path.includes("/native/")) {
      problems.push(`모델의 정식 소속·경로·ID가 유효하지 않습니다: ${String(asset?.id)}`); continue;
    }
    const ingestId = asset.path.split("/")[0];
    if (!Array.isArray(pack.ingestPackIds) || !pack.ingestPackIds.includes(ingestId) || !asset.id.startsWith(`${ingestId}-`)) {
      problems.push(`모델 경로와 소속 팩의 인제스션 ID가 다릅니다: ${asset.id}`); continue;
    }
    const expected = packs.get(asset.pack);
    if (!expected) { problems.push(`공개 팩 권리가 현재 원장과 다르거나 서빙 대기입니다: ${asset.id}`); continue; }
    const legacy = LEGACY_REPRESENTATIVES.find(([id]) => id === ingestId);
    if (legacy && (expected.entryId !== legacy[2] || expected.rights.status !== "public-domain" || expected.rights.licenseName !== "CC0-1.0"
        || expected.rights.commercialUse !== true || expected.rights.attributionRequired !== false)) {
      problems.push(`기존 8팩의 CC0 권리·원장 소속 계약이 바뀌었습니다: ${asset.id}`); continue;
    }
    const addedPack = LICENSED_NATIVE_PACKS.find((item) => item.ingestId === ingestId);
    if (addedPack && (expected.entryId !== addedPack.ledgerPackId || expected.rights.status !== "licensed")) {
      problems.push(`새 구매 팩의 licensed 원장 소속이 다릅니다: ${asset.id}`); continue;
    }
    byId.set(asset.id, expected.rights);
  }
  if (expectedIntake === LICENSED_NATIVE_INTAKE) for (const pack of LICENSED_NATIVE_PACKS) {
    if (themePacks.assets.filter((asset) => belongsToIngest(asset, pack.ingestId)).length !== pack.models) {
      problems.push(`이번 paired 편입의 전수 모델 기대 수가 다릅니다: ${pack.ingestId} (${pack.models}개 필요)`);
    }
  }
  return { problems, byId };
}

export function nativeCatalogRightsProblems(context) { return expectedNativeRights(context).problems; }

/** 계획 검증 이후 파일이 바뀌어도 브라우저에는 원래 승인된 바이트만 제공한다. */
export function assertPrivateNativeBody(body, object) {
  if (body.length !== object.bytes || createHash("sha256").update(body).digest("hex") !== object.sha256) {
    throw new Error("계획 이후 private GLB 바이트가 변조됐습니다.");
  }
}

/** 공개 메타데이터에서 팩별 검수할 실물 하나를 결정한다. 다른 변형을 임의로 추가하지 않는다. */
export function selectNativeRepresentatives(themePacks, { expectedIntake } = {}) {
  if (expectedIntake !== undefined && expectedIntake !== LICENSED_NATIVE_INTAKE) throw new Error("알 수 없는 native 편입 기대 범위입니다.");
  const additions = LICENSED_NATIVE_PACKS.filter(({ ingestId }) => expectedIntake === LICENSED_NATIVE_INTAKE
    || themePacks.assets.some((asset) => belongsToIngest(asset, ingestId))
    || themePacks.packs?.some((pack) => pack.ingestPackIds?.includes(ingestId) && pack.placeable > 0));
  const choices = [...LEGACY_REPRESENTATIVES, ...additions.map(({ ingestId, source }) => [ingestId, source])];
  return choices.map(([ingest, source]) => {
    const path = `${ingest}/native/${source}`;
    const matches = themePacks.assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => asset.path === path);
    if (matches.length !== 1) throw new Error(`검수 대표 모델이 현재 카탈로그에 없거나 중복입니다: ${path}`);
    const index = matches[0].index;
    return { index, id: themePacks.assets[index].id, path };
  });
}

export function nativeValidationProblems(assets, rows, context) {
  const { problems, byId: expected } = expectedNativeRights(context);
  if (!isDeepStrictEqual(assets, context?.themePacks?.assets)) problems.push("검증 대상 모델 목록이 현재 카탈로그와 다릅니다.");
  if (rows.length !== assets.length) problems.push("전수 검증 결과 개수가 카탈로그와 다릅니다.");
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length) problems.push("검증 결과에 중복 모델이 있습니다.");
  for (const asset of assets) {
    const row = byId.get(asset.id);
    if (!row?.ok || row.sha256 !== `sha256:${asset.sha256}` || row.bytes !== asset.bytes
      || row.profile !== "mobile" || row.packIndex !== asset.pack || !expected.has(asset.id)
      || !isDeepStrictEqual(row.rights, expected.get(asset.id))) {
      problems.push(`모델 검증/해시/크기/모바일/권리 불일치: ${asset.id}${row?.validationCode ? ` (${row.validationCode})` : ""}`);
    }
  }
  return problems;
}

/** 이전 성공 증거는 같은 카탈로그 바이트·전수 SHA·Worker 성공 기록일 때만 재사용한다. */
export function reusableNativeValidationProblems({ assets, rows, summary, catalogSha256, themePacks, ledger, expectedIntake }) {
  const problems = nativeValidationProblems(assets, rows, { themePacks, ledger, expectedIntake });
  const calls = assets.length + 2 * (summary.renders?.length ?? 0);
  if (summary.status !== "ok" || summary.catalogSha256 !== catalogSha256 || summary.assets !== assets.length
    || summary.validated !== assets.length || summary.bytes !== assets.reduce((sum, asset) => sum + asset.bytes, 0)
    || summary.failures?.length !== 0 || summary.problems?.length !== 0 || summary.wrongHash?.code !== "hash-mismatch"
    || summary.worker?.requests !== calls || summary.worker.responses !== calls || summary.worker.rejected !== 0
    || summary.worker.profileErrors !== 0 || summary.worker.errors?.length !== 0
    || !(summary.worker.urls?.length > 0) || summary.worker.urls.some((url) => !url.includes("studio-bg3d-glb-validation.worker.ts"))) {
    problems.push("기존 전수 증거의 카탈로그/권리/바이트 SHA/실제 Worker 계약이 달라 재사용할 수 없습니다.");
  }
  return problems;
}

/** 결과 수만 맞춘 성공·Worker 폴백·누락된 모델·권리 변조를 모두 실패로 닫는다. */
export function nativeProofProblems({ assets, rows, worker, representatives, renders, wrongHash, errors, lane = "hardware", reusedValidation, themePacks, ledger, expectedIntake }) {
  const problems = [...errors, ...nativeValidationProblems(assets, rows, { themePacks, ledger, expectedIntake })];
  const expectedCalls = (reusedValidation ? 0 : assets.length) + 2 * representatives.length;
  if (reusedValidation && (reusedValidation.validated !== assets.length || !/^[a-f0-9]{64}$/.test(reusedValidation.summarySha256)
    || !/^[a-f0-9]{64}$/.test(reusedValidation.rowsSha256) || !/^[a-f0-9]{64}$/.test(reusedValidation.sourceCatalogSha256))) {
    problems.push("재사용한 전수 증거의 연결 해시가 없습니다.");
  }
  if (!worker || worker.requests !== expectedCalls || worker.responses !== expectedCalls
    || worker.rejected !== 0 || worker.profileErrors !== 0 || worker.errors.length > 0
    || worker.urls.length === 0 || worker.urls.some((url) => !url.includes("studio-bg3d-glb-validation.worker.ts"))) {
    problems.push("실제 모바일 검증 Worker 요청/성공 응답 수 또는 실행 경로가 다릅니다.");
  }
  if (wrongHash?.code !== "hash-mismatch") problems.push("예상 SHA 변조가 제품 무결성 경계에서 거부되지 않았습니다.");
  if (renders.length !== representatives.length) problems.push("팩별 대표 화면 검수가 누락됐습니다.");
  for (const representative of representatives) {
    const render = renders.find((row) => row.id === representative.id);
    const asset = assets[representative.index];
    const software = /SwiftShader|llvmpipe|software/i.test(render?.backend?.renderer ?? "");
    const backendMatches = lane === "swiftshader" ? software
      : !software && /Apple|Metal|NVIDIA|AMD|Intel|Radeon/i.test(render?.backend?.renderer ?? "");
    if (!asset || asset.id !== representative.id || !render || render.packIndex !== asset.pack
      || render.sha256 !== `sha256:${asset.sha256}` || render.bytes !== asset.bytes
      || render.shaderErrors?.length !== 0 || !(render.foregroundPixels > 4800)
      || !(render.materials?.length > 0) || !backendMatches || render.camera?.corners?.length !== 8
      || render.camera.corners.some(([x, y, z]) => ![x, y, z].every(Number.isFinite)
        || Math.abs(x) >= 0.95 || Math.abs(y) >= 0.95 || z <= -1 || z >= 1)
      || !Array.isArray(render.normalizedSize) || render.normalizedSize.length !== 3
      || !render.normalizedSize.every((value) => Number.isFinite(value) && value >= 0)
      || Math.abs(Math.max(...render.normalizedSize) - 2) > 0.0001) {
      problems.push(`대표 모델 렌더/재질/스케일 증거가 불완전합니다: ${representative.id}`);
    }
  }
  return problems;
}
