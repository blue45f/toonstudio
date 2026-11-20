/**
 * 스케치·3D 블록아웃 -> 3D 멀티프로바이더 · 자동 쿼드 리토폴로지 · 파츠 분해 · 툰 베이킹 리파이너리
 * (Tripo3D P2 / Meshy Smart Topology / Hyper3D Rodin / CSM.ai Cube 클린룸 구현).
 *
 * - 멀티 프로바이더 어댑터(tripo3d | meshy | hyper3d-rodin | csm-cube | toonbridge-local),
 *   결정적 멱등성 키, 크레딧 사전 추정, 취소 지원
 * - 매니폴드 품질 게이트(비다양체 0 / 미터 스케일 / 바닥 접지 Y=0) + 적응형 정점 클러스터링 디시메이션 + 쿼드 페어링
 * - 연결 셸 자동 파츠 분해 매니페스트(문·뚜껑·바퀴 경첩/회전축 추론)
 * - PBR BaseColor 조명 제거(De-lighting) -> WorkStyleDna 팔레트·MToon 2~3단 셀 램프·윤곽선 마스크 베이킹 + Rights BOM
 */

export const GEN3D_REFINERY_SCHEMA_VERSION = 1 as const;

export type Gen3dProviderId = "tripo3d" | "meshy" | "hyper3d-rodin" | "csm-cube" | "toonbridge-local";
export type Gen3dBudgetTier = "bg-prop" | "hero-prop" | "character";

export const GEN3D_POLY_BUDGET_BY_TIER: Readonly<Record<Gen3dBudgetTier, number>> = Object.freeze({
  "bg-prop": 8_000, "hero-prop": 25_000, character: 50_000,
});

export interface SketchStroke2d { readonly points: readonly (readonly [number, number])[]; readonly strokeWidthPx: number; }
export interface BlockoutPrimitiveSpec {
  readonly id: string; readonly label: string; readonly shape: "box" | "cylinder" | "sphere" | "cone";
  readonly position: readonly [number, number, number];
  readonly sizeMeters: readonly [number, number, number];
  readonly articulationHint?: "static" | "hinge-door" | "hinge-lid" | "wheel";
}

export interface WorkStyleDnaPalette {
  readonly styleId: string;
  readonly swatchesRgb: readonly (readonly [number, number, number])[];
  readonly toonSteps: 2 | 3;
  readonly outlineSensitivity: number;
}

export interface SketchBlockoutGenerationRequest {
  readonly provider: Gen3dProviderId; readonly prompt: string; readonly budgetTier: Gen3dBudgetTier;
  readonly sketchStrokes?: readonly SketchStroke2d[];
  readonly blockoutPrimitives?: readonly BlockoutPrimitiveSpec[];
  readonly targetHeightMeters: number; readonly styleDna: WorkStyleDnaPalette;
  readonly seed: number; readonly commercialLicenseRequired?: boolean;
}

export interface RefineryRawMesh {
  readonly positions: Float32Array; readonly indices: Uint32Array;
  readonly albedoRgba?: Uint8ClampedArray; readonly albedoWidth?: number; readonly albedoHeight?: number;
  readonly sourceLicense: "cc0" | "commercial-royalty-free" | "byok-provider-tos" | "local-procedural";
}

export interface Gen3dProviderAdapter {
  readonly providerId: Gen3dProviderId;
  readonly usesGplRemeshBinary: boolean;
  generate(request: SketchBlockoutGenerationRequest, idempotencyKey: string, signal?: AbortSignal): Promise<RefineryRawMesh>;
}

export interface RefineryCostEstimate {
  readonly provider: Gen3dProviderId; readonly estimatedCredits: number;
  readonly estimatedSeconds: number; readonly targetMaxTriangles: number;
}

export interface MeshQualityAuditReport {
  readonly vertexCount: number; readonly triangleCount: number;
  readonly quadPairCount: number; readonly remainingTriangleCount: number; readonly quadRatio: number;
  readonly nonManifoldEdgeCount: number; readonly looseVertexCount: number; readonly degenerateFaceCount: number;
  readonly minY: number; readonly heightMeters: number; readonly withinPolyBudget: boolean;
}

export interface SegmentedMeshPart {
  readonly partId: string; readonly label: string; readonly visible: boolean; readonly triangleCount: number;
  readonly boundsMin: readonly [number, number, number]; readonly boundsMax: readonly [number, number, number];
  readonly pivotPosition: readonly [number, number, number]; readonly hingeAxis: readonly [number, number, number];
  readonly articulationKind: "static" | "hinge-door" | "hinge-lid" | "wheel";
}

export interface ToonBakedMaterialBundle {
  readonly width: number; readonly height: number;
  readonly toonAlbedoRgba: Uint8ClampedArray; readonly outlineMask: Uint8Array; readonly celRampLut: Uint8Array;
  readonly delighingLuminanceVarianceRatio: number;
}

export interface Gen3dRightsBomEntry {
  readonly assetDigest: string; readonly idempotencyKey: string; readonly provider: Gen3dProviderId;
  readonly sourceLicense: RefineryRawMesh["sourceLicense"];
  readonly commercialClearance: boolean; readonly toonbridgeIsolated: boolean; readonly recordedAtIso: string;
}

export interface SketchToToon3dRefineryResult {
  readonly idempotencyKey: string; readonly costEstimate: RefineryCostEstimate;
  readonly mesh: { readonly positions: Float32Array; readonly indices: Uint32Array };
  readonly qualityReport: MeshQualityAuditReport;
  readonly partManifest: readonly SegmentedMeshPart[];
  readonly toonMaterial: ToonBakedMaterialBundle;
  readonly rightsBom: Gen3dRightsBomEntry;
}

const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

function fnv1aDigestHex(input: string): string {
  let h1 = 0x811c9dc5; let h2 = 0x050c5d1f;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch + i), 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function computeRefineryIdempotencyKey(request: SketchBlockoutGenerationRequest): string {
  const payload = JSON.stringify({
    provider: request.provider, prompt: request.prompt.trim().toLowerCase(), budgetTier: request.budgetTier,
    targetHeightMeters: Number(request.targetHeightMeters.toFixed(4)), seed: Math.floor(request.seed),
    blockouts: request.blockoutPrimitives ?? [], strokes: (request.sketchStrokes ?? []).map((s) => s.points.length),
  });
  return `refinery-${request.provider}-${fnv1aDigestHex(payload)}`;
}

export function estimateRefineryCost(request: SketchBlockoutGenerationRequest): RefineryCostEstimate {
  const baseCredits: Record<Gen3dProviderId, number> = { tripo3d: 20, meshy: 18, "hyper3d-rodin": 25, "csm-cube": 22, "toonbridge-local": 0 };
  const baseSec: Record<Gen3dProviderId, number> = { tripo3d: 24, meshy: 28, "hyper3d-rodin": 32, "csm-cube": 30, "toonbridge-local": 8 };
  const mult = request.budgetTier === "bg-prop" ? 1.0 : request.budgetTier === "hero-prop" ? 1.4 : 1.8;
  return {
    provider: request.provider,
    estimatedCredits: Math.round(baseCredits[request.provider] * mult),
    estimatedSeconds: Math.round(baseSec[request.provider] * mult),
    targetMaxTriangles: GEN3D_POLY_BUDGET_BY_TIER[request.budgetTier],
  };
}

function clusterDecimateOnce(positions: Float32Array, indices: Uint32Array, cellSize: number) {
  const vCount = Math.floor(positions.length / 3);
  const bucketToNew = new Map<string, number>();
  const accX: number[] = []; const accY: number[] = []; const accZ: number[] = []; const accCount: number[] = [];
  const oldToNew = new Uint32Array(vCount);
  for (let v = 0; v < vCount; v += 1) {
    const x = positions[v * 3]!; const y = positions[v * 3 + 1]!; const z = positions[v * 3 + 2]!;
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}:${Math.floor(z / cellSize)}`;
    let id = bucketToNew.get(key);
    if (id === undefined) {
      id = accCount.length; bucketToNew.set(key, id);
      accX.push(x); accY.push(y); accZ.push(z); accCount.push(1);
    } else {
      accX[id] = accX[id]! + x; accY[id] = accY[id]! + y; accZ[id] = accZ[id]! + z; accCount[id] = accCount[id]! + 1;
    }
    oldToNew[v] = id;
  }

  const decPos = new Float32Array(accCount.length * 3);
  let decMinY = Infinity;
  for (let i = 0; i < accCount.length; i += 1) {
    const y = accY[i]! / accCount[i]!;
    decPos[i * 3] = accX[i]! / accCount[i]!; decPos[i * 3 + 1] = y; decPos[i * 3 + 2] = accZ[i]! / accCount[i]!;
    if (y < decMinY) decMinY = y;
  }
  for (let i = 0; i < accCount.length; i += 1) decPos[i * 3 + 1] = decPos[i * 3 + 1]! - decMinY;

  const decIdx: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = oldToNew[indices[t]!]!; const b = oldToNew[indices[t + 1]!]!; const c = oldToNew[indices[t + 2]!]!;
    if (a !== b && b !== c && c !== a) decIdx.push(a, b, c);
  }
  return { positions: decPos, indices: new Uint32Array(decIdx) };
}

/** 매니폴드·미터 스케일·지면 접지(Y=0) 정규화 및 목표 예산 초과 시 적응형 클러스터링 디시메이션을 수행한다. */
export function inspectAndNormalizeRefineryMesh(
  rawPositions: Float32Array, rawIndices: Uint32Array, options: { readonly targetHeightMeters: number; readonly maxTriangles: number },
): { readonly positions: Float32Array; readonly indices: Uint32Array; readonly report: MeshQualityAuditReport } {
  let positions = new Float32Array(rawPositions);
  let indices = new Uint32Array(rawIndices);
  const vCountRaw = Math.floor(positions.length / 3);
  if (vCountRaw < 3 || indices.length < 3) throw new Error("유효한 3D 메시 정점/삼각형이 없습니다.");

  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let v = 0; v < vCountRaw; v += 1) {
    const x = positions[v * 3]!; const y = positions[v * 3 + 1]!; const z = positions[v * 3 + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const scale = Math.max(0.05, options.targetHeightMeters) / Math.max(1e-4, maxY - minY);
  const cx = (minX + maxX) * 0.5; const cz = (minZ + maxZ) * 0.5;
  for (let v = 0; v < vCountRaw; v += 1) {
    positions[v * 3] = (positions[v * 3]! - cx) * scale;
    positions[v * 3 + 1] = (positions[v * 3 + 1]! - minY) * scale;
    positions[v * 3 + 2] = (positions[v * 3 + 2]! - cz) * scale;
  }

  // 적응형 공간 격자 클러스터링: 최대 바운딩 스팬 기준으로 목표 예산 이하가 될 때까지 격자 확장
  if (indices.length / 3 > options.maxTriangles) {
    const maxSpan = Math.max((maxX - minX) * scale, (maxY - minY) * scale, (maxZ - minZ) * scale, 0.1);
    let cellSize = maxSpan / Math.max(2, Math.floor(Math.sqrt(options.maxTriangles * 0.65)));
    for (let pass = 0; pass < 8 && indices.length / 3 > options.maxTriangles; pass += 1) {
      const candidate = clusterDecimateOnce(positions, indices, cellSize);
      if (candidate.indices.length >= 3) { positions = candidate.positions; indices = candidate.indices; }
      cellSize *= 1.38;
    }
  }

  const vCount = Math.floor(positions.length / 3);
  const usedVert = new Uint8Array(vCount);
  const edgeUse = new Map<string, number[]>();
  const triCount = Math.floor(indices.length / 3);
  const faceNormals: [number, number, number][] = new Array(triCount);
  let degenerateFaceCount = 0;

  for (let f = 0; f < triCount; f += 1) {
    const a = indices[f * 3]!; const b = indices[f * 3 + 1]!; const c = indices[f * 3 + 2]!;
    usedVert[a] = 1; usedVert[b] = 1; usedVert[c] = 1;
    const ux = positions[b * 3]! - positions[a * 3]!; const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!; const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const vx = positions[c * 3]! - positions[a * 3]!; const vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!; const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const area2 = Math.hypot(nx, ny, nz);
    if (area2 < 1e-10) { degenerateFaceCount += 1; faceNormals[f] = [0, 1, 0]; }
    else faceNormals[f] = [nx / area2, ny / area2, nz / area2];

    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      let list = edgeUse.get(key);
      if (!list) { list = []; edgeUse.set(key, list); }
      list.push(f);
    }
  }

  let looseVertexCount = 0;
  for (let v = 0; v < vCount; v += 1) { if (usedVert[v] === 0) looseVertexCount += 1; }

  let nonManifoldEdgeCount = 0;
  const pairedFace = new Uint8Array(triCount);
  let quadPairCount = 0;
  for (const faces of edgeUse.values()) {
    if (faces.length !== 2) { nonManifoldEdgeCount += 1; continue; }
    const f0 = faces[0]!; const f1 = faces[1]!;
    if (pairedFace[f0] === 0 && pairedFace[f1] === 0) {
      const n0 = faceNormals[f0]!; const n1 = faceNormals[f1]!;
      if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] >= 0.95) {
        pairedFace[f0] = 1; pairedFace[f1] = 1; quadPairCount += 1;
      }
    }
  }

  let finalMinY = Infinity; let finalMaxY = -Infinity;
  for (let v = 0; v < vCount; v += 1) {
    const y = positions[v * 3 + 1]!;
    if (y < finalMinY) finalMinY = y;
    if (y > finalMaxY) finalMaxY = y;
  }

  return {
    positions, indices,
    report: {
      vertexCount: vCount, triangleCount: triCount, quadPairCount,
      remainingTriangleCount: triCount - quadPairCount * 2,
      quadRatio: triCount > 0 ? (quadPairCount * 2) / triCount : 0,
      nonManifoldEdgeCount, looseVertexCount, degenerateFaceCount,
      minY: Number(finalMinY.toFixed(6)), heightMeters: Number((finalMaxY - finalMinY).toFixed(4)),
      withinPolyBudget: triCount <= options.maxTriangles,
    },
  };
}

/** 연결 셸 분석으로 단일 메시를 파츠 매니페스트로 자동 분해하고 힌지/피벗 축을 추론한다. */
export function segmentMeshIntoParts(
  positions: Float32Array, indices: Uint32Array, blockoutHints: readonly BlockoutPrimitiveSpec[] = [],
): readonly SegmentedMeshPart[] {
  const triCount = Math.floor(indices.length / 3);
  const vertToFaces: number[][] = Array.from({ length: Math.floor(positions.length / 3) }, () => []);
  for (let f = 0; f < triCount; f += 1) {
    vertToFaces[indices[f * 3]!]!.push(f); vertToFaces[indices[f * 3 + 1]!]!.push(f); vertToFaces[indices[f * 3 + 2]!]!.push(f);
  }
  const visited = new Uint8Array(triCount);
  const parts: SegmentedMeshPart[] = [];

  for (let start = 0; start < triCount; start += 1) {
    if (visited[start] === 1) continue;
    const stack = [start]; visited[start] = 1;
    let partTris = 0;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    while (stack.length > 0) {
      const f = stack.pop()!; partTris += 1;
      for (let k = 0; k < 3; k += 1) {
        const v = indices[f * 3 + k]!;
        const x = positions[v * 3]!; const y = positions[v * 3 + 1]!; const z = positions[v * 3 + 2]!;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        for (const nf of vertToFaces[v]!) { if (visited[nf] === 0) { visited[nf] = 1; stack.push(nf); } }
      }
    }
    const idx = parts.length;
    const hint = blockoutHints[idx];
    const kind: SegmentedMeshPart["articulationKind"] =
      hint?.articulationHint ?? (maxZ - minZ < Math.min(maxX - minX, maxY - minY) * 0.25 ? "hinge-door" : "static");
    const pivotPosition: readonly [number, number, number] =
      kind === "hinge-door" ? [minX, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5]
      : kind === "hinge-lid" ? [(minX + maxX) * 0.5, minY, minZ]
      : [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5];
    const hingeAxis: readonly [number, number, number] = kind === "hinge-lid" || kind === "wheel" ? [1, 0, 0] : [0, 1, 0];

    parts.push({
      partId: hint?.id ?? `part-${idx + 1}`, label: hint?.label ?? `분할 파츠 ${idx + 1}`, visible: true,
      triangleCount: partTris, boundsMin: [minX, minY, minZ], boundsMax: [maxX, maxY, maxZ],
      pivotPosition, hingeAxis, articulationKind: kind,
    });
  }
  return parts;
}

/** PBR BaseColor에서 구워진 그림자를 완화(De-lighting)하고 WorkStyleDna 셀 램프·윤곽선 마스크를 베이킹한다. */
export function bakePbrAlbedoToToonTexture(
  albedoRgba: Uint8ClampedArray, width: number, height: number, styleDna: WorkStyleDnaPalette,
): ToonBakedMaterialBundle {
  const safeW = Math.max(2, Math.floor(width)); const safeH = Math.max(2, Math.floor(height));
  const pixelCount = safeW * safeH;
  const luma = new Float32Array(pixelCount);
  let meanLuma = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const o = i * 4;
    luma[i] = (0.299 * albedoRgba[o]! + 0.587 * albedoRgba[o + 1]! + 0.114 * albedoRgba[o + 2]!) / 255;
    meanLuma += luma[i]!;
  }
  meanLuma /= Math.max(1, pixelCount);
  let rawVar = 0;
  for (let i = 0; i < pixelCount; i += 1) rawVar += (luma[i]! - meanLuma) ** 2;

  const toonAlbedoRgba = new Uint8ClampedArray(pixelCount * 4);
  const outlineMask = new Uint8Array(pixelCount);
  const delitLuma = new Float32Array(pixelCount);
  const swatches = styleDna.swatchesRgb.length > 0 ? styleDna.swatchesRgb : [[0.82, 0.78, 0.72] as const];
  const sens = clamp(styleDna.outlineSensitivity, 0.05, 1);

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = y * safeW + x; const o = idx * 4;
      let localSum = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const ny = clamp(y + oy, 0, safeH - 1);
        for (let ox = -1; ox <= 1; ox += 1) localSum += luma[ny * safeW + clamp(x + ox, 0, safeW - 1)]!;
      }
      const localAvg = localSum / 9;
      const gain = localAvg > 0.05 ? clamp(Math.pow(meanLuma / localAvg, 0.65), 0.7, 1.45) : 1;
      const r = clamp((albedoRgba[o]! / 255) * gain, 0, 1);
      const g = clamp((albedoRgba[o + 1]! / 255) * gain, 0, 1);
      const b = clamp((albedoRgba[o + 2]! / 255) * gain, 0, 1);

      let bestSw = swatches[0]!; let bestDist = Infinity;
      for (const sw of swatches) {
        const dSq = (r - sw[0]) ** 2 + (g - sw[1]) ** 2 + (b - sw[2]) ** 2;
        if (dSq < bestDist) { bestDist = dSq; bestSw = sw; }
      }
      const nr = r * 0.55 + bestSw[0] * 0.45; const ng = g * 0.55 + bestSw[1] * 0.45; const nb = b * 0.55 + bestSw[2] * 0.45;
      toonAlbedoRgba[o] = Math.round(nr * 255); toonAlbedoRgba[o + 1] = Math.round(ng * 255);
      toonAlbedoRgba[o + 2] = Math.round(nb * 255); toonAlbedoRgba[o + 3] = albedoRgba[o + 3]!;
      delitLuma[idx] = 0.299 * nr + 0.587 * ng + 0.114 * nb;

      const grad = Math.hypot(
        luma[y * safeW + clamp(x + 1, 0, safeW - 1)]! - luma[y * safeW + clamp(x - 1, 0, safeW - 1)]!,
        luma[clamp(y + 1, 0, safeH - 1) * safeW + x]! - luma[clamp(y - 1, 0, safeH - 1) * safeW + x]!,
      );
      outlineMask[idx] = Math.round(clamp(grad * (1.8 + sens * 3.0), 0, 1) * 255);
    }
  }

  let newMean = 0;
  for (let i = 0; i < pixelCount; i += 1) newMean += delitLuma[i]!;
  newMean /= Math.max(1, pixelCount);
  let newVar = 0;
  for (let i = 0; i < pixelCount; i += 1) newVar += (delitLuma[i]! - newMean) ** 2;

  const celRampLut = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    celRampLut[i] = styleDna.toonSteps === 2 ? (t < 0.48 ? 115 : 255) : t < 0.34 ? 95 : t < 0.68 ? 185 : 255;
  }

  return { width: safeW, height: safeH, toonAlbedoRgba, outlineMask, celRampLut, delighingLuminanceVarianceRatio: rawVar > 1e-8 ? newVar / rawVar : 1 };
}

export function buildGen3dRightsBomEntry(
  request: SketchBlockoutGenerationRequest, idempotencyKey: string, rawMesh: RefineryRawMesh,
  toonbridgeIsolated: boolean, recordedAtIso = "2026-11-20T00:00:00.000Z",
): Gen3dRightsBomEntry {
  const digestSeed = `${idempotencyKey}:${rawMesh.positions.length}:${rawMesh.indices.length}:${rawMesh.sourceLicense}`;
  return {
    assetDigest: `sha-sim-${fnv1aDigestHex(digestSeed)}`,
    idempotencyKey, provider: request.provider, sourceLicense: rawMesh.sourceLicense,
    commercialClearance: rawMesh.sourceLicense !== "byok-provider-tos" || !request.commercialLicenseRequired,
    toonbridgeIsolated, recordedAtIso,
  };
}

function appendManifoldBox(pos: number[], idx: number[], c: readonly [number, number, number], s: readonly [number, number, number]): void {
  const base = pos.length / 3;
  const hx = s[0] * 0.5; const hy = s[1] * 0.5; const hz = s[2] * 0.5;
  pos.push(
    c[0] - hx, c[1] - hy, c[2] - hz, c[0] + hx, c[1] - hy, c[2] - hz, c[0] + hx, c[1] + hy, c[2] - hz, c[0] - hx, c[1] + hy, c[2] - hz,
    c[0] - hx, c[1] - hy, c[2] + hz, c[0] + hx, c[1] - hy, c[2] + hz, c[0] + hx, c[1] + hy, c[2] + hz, c[0] - hx, c[1] + hy, c[2] + hz,
  );
  for (const t of [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]) idx.push(base + t);
}

/** 오프라인 결정적 블록아웃 기반 기본 로컬 어댑터. */
export function createLocalBlockoutProviderAdapter(providerId: Gen3dProviderId = "toonbridge-local"): Gen3dProviderAdapter {
  return {
    providerId,
    usesGplRemeshBinary: providerId === "toonbridge-local",
    async generate(request, _idempotencyKey, signal): Promise<RefineryRawMesh> {
      if (signal?.aborted) throw new Error("3D 생성 요청이 실행 전에 취소되었습니다.");
      const pos: number[] = []; const idx: number[] = [];
      const blocks = request.blockoutPrimitives && request.blockoutPrimitives.length > 0
        ? request.blockoutPrimitives
        : [{ id: "body-main", label: "기본 몸체", shape: "box" as const, position: [0, 0.5, 0] as const, sizeMeters: [0.8, 1.0, 0.6] as const }];
      for (const b of blocks) appendManifoldBox(pos, idx, b.position, b.sizeMeters);

      const w = 16; const h = 16;
      const albedo = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) {
        const shade = 0.45 + 0.55 * (y / (h - 1));
        for (let x = 0; x < w; x += 1) {
          const o = (y * w + x) * 4;
          albedo[o] = Math.round(190 * shade); albedo[o + 1] = Math.round(155 * shade);
          albedo[o + 2] = Math.round(130 * shade); albedo[o + 3] = 255;
        }
      }
      return {
        positions: new Float32Array(pos), indices: new Uint32Array(idx),
        albedoRgba: albedo, albedoWidth: w, albedoHeight: h,
        sourceLicense: providerId === "toonbridge-local" ? "local-procedural" : "commercial-royalty-free",
      };
    },
  };
}

/** 스케치·블록아웃 -> 생성 -> 품질 게이트/리토포 -> 파츠 분해 -> 툰 베이킹 -> Rights BOM 통합 실행기. */
export async function runSketchToToon3dRefinery(
  request: SketchBlockoutGenerationRequest, adapter?: Gen3dProviderAdapter, signal?: AbortSignal,
): Promise<SketchToToon3dRefineryResult> {
  if (signal?.aborted) throw new Error("3D 리파이너리 파이프라인이 취소되었습니다.");
  const activeAdapter = adapter ?? createLocalBlockoutProviderAdapter(request.provider);
  const idempotencyKey = computeRefineryIdempotencyKey(request);
  const costEstimate = estimateRefineryCost(request);
  const raw = await activeAdapter.generate(request, idempotencyKey, signal);
  if (signal?.aborted) throw new Error("3D 리파이너리 파이프라인이 생성 직후 취소되었습니다.");

  const normalized = inspectAndNormalizeRefineryMesh(raw.positions, raw.indices, {
    targetHeightMeters: request.targetHeightMeters, maxTriangles: costEstimate.targetMaxTriangles,
  });
  const partManifest = segmentMeshIntoParts(normalized.positions, normalized.indices, request.blockoutPrimitives ?? []);
  const texW = raw.albedoWidth ?? 8; const texH = raw.albedoHeight ?? 8;
  const toonMaterial = bakePbrAlbedoToToonTexture(raw.albedoRgba ?? new Uint8ClampedArray(texW * texH * 4).fill(200), texW, texH, request.styleDna);
  const rightsBom = buildGen3dRightsBomEntry(request, idempotencyKey, raw, activeAdapter.usesGplRemeshBinary);

  return { idempotencyKey, costEstimate, mesh: { positions: normalized.positions, indices: normalized.indices }, qualityReport: normalized.report, partManifest, toonMaterial, rightsBom };
}
