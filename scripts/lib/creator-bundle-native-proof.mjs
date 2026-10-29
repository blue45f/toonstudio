import { createHash } from "node:crypto";

/** 계획 검증 이후 파일이 바뀌어도 브라우저에는 원래 승인된 바이트만 제공한다. */
export function assertPrivateNativeBody(body, object) {
  if (body.length !== object.bytes || createHash("sha256").update(body).digest("hex") !== object.sha256) {
    throw new Error("계획 이후 private GLB 바이트가 변조됐습니다.");
  }
}

/** 공개 메타데이터에서 팩별 검수할 실물 하나를 결정한다. 다른 변형을 임의로 추가하지 않는다. */
export function selectNativeRepresentatives(themePacks) {
  const choices = [
    ["cbv1-ingest-local-cute-park", "Bench_1_1.glb"],
    ["cbv1-ingest-local-cute-dungeon", "Furniture/Chair_1.glb"],
    ["cbv1-ingest-local-cute-graveyard", "Tombstone_1.glb"],
    ["cbv1-ingest-local-medieval-weapons", "BattleAxe_1_1_A.glb"],
    ["cbv1-ingest-local-scifi-blue-base", "Other/PilarP_1_A.glb"],
    ["cbv1-ingest-local-cartoon-car-megapack", "Other/PoliceCar.glb"],
    ["cbv1-ingest-local-cartoon-cars-2", "Car_Ambulance_MC_1_B.glb"],
    ["cbv1-ingest-local-army-pack", "Heli_1_B.glb"],
  ];
  return choices.map(([ingest, source]) => {
    const path = `${ingest}/native/${source}`;
    const index = themePacks.assets.findIndex((asset) => asset.path === path);
    if (index < 0) throw new Error(`검수 대표 모델이 현재 카탈로그에 없습니다: ${path}`);
    return { index, id: themePacks.assets[index].id, path };
  });
}

export function nativeValidationProblems(assets, rows) {
  const problems = [];
  if (rows.length !== assets.length) problems.push("전수 검증 결과 개수가 카탈로그와 다릅니다.");
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length) problems.push("검증 결과에 중복 모델이 있습니다.");
  for (const asset of assets) {
    const row = byId.get(asset.id);
    if (!row?.ok || row.sha256 !== `sha256:${asset.sha256}` || row.bytes !== asset.bytes
      || row.profile !== "mobile" || row.rights?.status !== "public-domain"
      || row.rights?.licenseName !== "CC0-1.0" || row.rights?.commercialUse !== true || row.rights?.attributionRequired !== false) {
      problems.push(`모델 검증/해시/크기/모바일/권리 불일치: ${asset.id}${row?.validationCode ? ` (${row.validationCode})` : ""}`);
    }
  }
  return problems;
}

/** 이전 성공 증거는 같은 카탈로그 바이트·전수 SHA·Worker 성공 기록일 때만 재사용한다. */
export function reusableNativeValidationProblems({ assets, rows, summary, catalogSha256 }) {
  const problems = nativeValidationProblems(assets, rows);
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
export function nativeProofProblems({ assets, rows, worker, representatives, renders, wrongHash, errors, lane = "hardware", reusedValidation }) {
  const problems = [...errors, ...nativeValidationProblems(assets, rows)];
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
    if (!render || render.sha256 !== `sha256:${asset.sha256}` || render.bytes !== asset.bytes
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
