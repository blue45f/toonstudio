/**
 * Wave 95 — 2D 웹툰 → WebXR·공간 디스플레이 입체 컷 극장:
 * 순수 동기 FIPS 180-4 SHA-256 서명기, 시차 가려짐(Disocclusion) 여백 감사기,
 * 커브드 극장/수직 공간 스크롤 3D 장면 그래프 컴파일러 및 WebGPU/WebXR WGSL 합성 셰이더 생성·검증기.
 */

import {
  compressLayersIntoComfortZone,
  computeOffAxisStereoProjectionPair,
  isDialogueSpatialRole,
  type ComfortZoneCompressionResult,
  type CompressedSpatialDepthLayer,
  type OffAxisStereoProjectionPair,
  type SpatialDepthLayerInput,
  type SpatialLayerRole,
  type SpatialOpticsConfig,
  type SpatialViewerPresetId,
  type StereoClipDepthRange,
  type StereoComfortTier,
} from "./stereo-vergence-comfort-optics";

// ---------------------------------------------------------------------------
// 1. 순수 동기 ES2017 FIPS 180-4 SHA-256 및 정규 직렬화
// ---------------------------------------------------------------------------

const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8EncodeSpatial(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 0x3f), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(out);
}

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** 외부 암호 의존성 없이 순수 동기 ES2017로 FIPS 180-4 SHA-256 64자리 16진수 해시를 계산한다. */
export function sha256SpatialSceneHex(input: string | Uint8Array): string {
  const data = typeof input === "string" ? utf8EncodeSpatial(input) : input;
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const h = new Uint32Array(SHA256_H0);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = h[0] ?? 0; let b = h[1] ?? 0; let c = h[2] ?? 0; let d = h[3] ?? 0;
    let e = h[4] ?? 0; let f = h[5] ?? 0; let g = h[6] ?? 0; let k = h[7] ?? 0;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (k + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (s0 + maj) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    h[0] = ((h[0] ?? 0) + a) >>> 0; h[1] = ((h[1] ?? 0) + b) >>> 0;
    h[2] = ((h[2] ?? 0) + c) >>> 0; h[3] = ((h[3] ?? 0) + d) >>> 0;
    h[4] = ((h[4] ?? 0) + e) >>> 0; h[5] = ((h[5] ?? 0) + f) >>> 0;
    h[6] = ((h[6] ?? 0) + g) >>> 0; h[7] = ((h[7] ?? 0) + k) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i += 1) hex += (h[i] ?? 0).toString(16).padStart(8, "0");
  return hex;
}

/** 키 정렬 및 `-0` 정규화로 결정론적 JSON 문자열을 만든다. */
export function canonicalizeSpatialPayload(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return String(Object.is(value, -0) || value === 0 ? 0 : Number(value.toFixed(9)));
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeSpatialPayload(item)).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const pairs: string[] = [];
    const keys = Object.keys(rec).sort();
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === undefined || rec[key] === undefined) continue;
      pairs.push(`${JSON.stringify(key)}:${canonicalizeSpatialPayload(rec[key])}`);
    }
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

// ---------------------------------------------------------------------------
// 2. 시차 가려짐(Disocclusion) 여백 감사기
// ---------------------------------------------------------------------------

export interface DisocclusionAdjacentStepAudit {
  readonly backLayerId: string;
  readonly frontLayerId: string;
  readonly backDepthMeters: number;
  readonly frontDepthMeters: number;
  readonly inverseDepthStepInvMeters: number;
  readonly horizontalParallaxPx: number;
  readonly verticalParallaxPx: number;
  readonly requiredPairOverscanPx: number;
}

export interface DisocclusionLayerAudit {
  readonly layerId: string;
  readonly labelKo: string;
  readonly role: SpatialLayerRole;
  readonly depthMeters: number;
  readonly horizontalShiftPx: number;
  readonly verticalShiftPx: number;
  readonly requiredOverscanPx: number;
  readonly suppliedOverscanPx: number;
  readonly missingMarginPx: number;
  readonly disocclusionTearRisk: boolean;
}

export interface DisocclusionAuditReport {
  readonly maxHeadOffsetMeters: number;
  readonly ipdMeters: number;
  readonly effectiveLateralOffsetMeters: number;
  readonly effectiveVerticalOffsetMeters: number;
  readonly adjacentSteps: readonly DisocclusionAdjacentStepAudit[];
  readonly layers: readonly DisocclusionLayerAudit[];
  readonly maxHorizontalParallaxPx: number;
  readonly maxVerticalParallaxPx: number;
  readonly maxRequiredOverscanPx: number;
  readonly atRiskLayerIds: readonly string[];
  readonly hasTearRisk: boolean;
}

type DisocclusionInputLayer = CompressedSpatialDepthLayer | SpatialDepthLayerInput;

function extractLayerDepthMeters(layer: DisocclusionInputLayer, fallbackDepth: number): number {
  const depth = "compressedDepthMeters" in layer ? layer.compressedDepthMeters : layer.rawDepthMeters;
  return Number.isFinite(depth) && depth > 0 ? depth : fallbackDepth;
}

/**
 * 머리 이동(`maxHeadOffsetMeters`)과 양안 기저선(`ipd / 2`)이 만들어내는
 * 인접 깊이 단계 `|1/z_front - 1/z_back|`별 수평·수직 시차(px)를 정확히 계산하고,
 * 제공된 `overscanMarginPx` 부족으로 검은 틈(tear)이 노출되는 레이어를 탐지한다.
 */
export function auditDisocclusionMargins(
  layers: readonly DisocclusionInputLayer[],
  opticsConfig: SpatialOpticsConfig,
  maxHeadOffsetMeters: number = opticsConfig.maxHeadOffsetMeters,
): DisocclusionAuditReport {
  const safeHead = Number.isFinite(maxHeadOffsetMeters) ? Math.max(0, maxHeadOffsetMeters) : 0;
  const safeIpd = Number.isFinite(opticsConfig.ipdMeters) ? Math.max(0, opticsConfig.ipdMeters) : 0;
  const effLateral = safeHead + safeIpd * 0.5;
  const effVertical = safeHead;
  const zc = opticsConfig.convergenceDepthMeters;
  const pxPerMeterX = opticsConfig.viewportPixelWidth / Math.max(0.01, opticsConfig.viewportWidthMeters);
  const pxPerMeterY = opticsConfig.viewportPixelHeight / Math.max(0.01, opticsConfig.viewportHeightMeters);

  const sorted = layers
    .map((layer, index) => ({ layer, index, depthMeters: extractLayerDepthMeters(layer, zc) }))
    .sort((a, b) => (b.depthMeters !== a.depthMeters ? b.depthMeters - a.depthMeters : a.index - b.index));

  const adjacentSteps: DisocclusionAdjacentStepAudit[] = [];
  const adjX = new Array<number>(sorted.length).fill(0);
  const adjY = new Array<number>(sorted.length).fill(0);

  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const back = sorted[i];
    const front = sorted[i + 1];
    if (!back || !front) continue;
    const invStep = Math.abs(1 / front.depthMeters - 1 / back.depthMeters);
    const hPx = effLateral * zc * invStep * pxPerMeterX;
    const vPx = effVertical * zc * invStep * pxPerMeterY;
    adjacentSteps.push({
      backLayerId: back.layer.layerId,
      frontLayerId: front.layer.layerId,
      backDepthMeters: back.depthMeters,
      frontDepthMeters: front.depthMeters,
      inverseDepthStepInvMeters: invStep,
      horizontalParallaxPx: hPx,
      verticalParallaxPx: vPx,
      requiredPairOverscanPx: Math.ceil(Math.max(hPx, vPx)),
    });
    adjX[i] = Math.max(adjX[i] ?? 0, hPx);
    adjY[i] = Math.max(adjY[i] ?? 0, vPx);
  }

  let maxH = 0;
  let maxV = 0;
  let maxReq = 0;
  const atRiskLayerIds: string[] = [];
  const layerAudits: DisocclusionLayerAudit[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];
    if (!entry) continue;
    const borderInv = isDialogueSpatialRole(entry.layer.role) ? 0 : Math.abs(1 / entry.depthMeters - 1 / zc);
    const horizontalShiftPx = Math.max(adjX[i] ?? 0, effLateral * zc * borderInv * pxPerMeterX);
    const verticalShiftPx = Math.max(adjY[i] ?? 0, effVertical * zc * borderInv * pxPerMeterY);
    const requiredOverscanPx = Math.ceil(Math.max(horizontalShiftPx, verticalShiftPx));
    const suppliedOverscanPx = Math.max(0, entry.layer.overscanMarginPx ?? 0);
    const missingMarginPx = Math.max(0, requiredOverscanPx - suppliedOverscanPx);
    const disocclusionTearRisk = missingMarginPx > 0;

    maxH = Math.max(maxH, horizontalShiftPx);
    maxV = Math.max(maxV, verticalShiftPx);
    maxReq = Math.max(maxReq, requiredOverscanPx);
    if (disocclusionTearRisk) atRiskLayerIds.push(entry.layer.layerId);

    layerAudits.push({
      layerId: entry.layer.layerId,
      labelKo: entry.layer.labelKo ?? entry.layer.layerId,
      role: entry.layer.role,
      depthMeters: entry.depthMeters,
      horizontalShiftPx,
      verticalShiftPx,
      requiredOverscanPx,
      suppliedOverscanPx,
      missingMarginPx,
      disocclusionTearRisk,
    });
  }

  return {
    maxHeadOffsetMeters: safeHead,
    ipdMeters: safeIpd,
    effectiveLateralOffsetMeters: effLateral,
    effectiveVerticalOffsetMeters: effVertical,
    adjacentSteps,
    layers: layerAudits,
    maxHorizontalParallaxPx: maxH,
    maxVerticalParallaxPx: maxV,
    maxRequiredOverscanPx: maxReq,
    atRiskLayerIds,
    hasTearRisk: atRiskLayerIds.length > 0,
  };
}

// ---------------------------------------------------------------------------
// 3. 2D 웹툰 → WebXR/공간 극장 3D 장면 그래프 컴파일러
// ---------------------------------------------------------------------------

export type SpatialTheaterLayoutMode = "curved-theater-arc" | "vertical-spatial-scroll";
export type SpatialStereoRenderMode =
  | "multiview-side-by-side"
  | "layered-quad-xr"
  | "mono-reduced-motion";

export interface SpatialEpisodePanelInput {
  readonly panelId: string;
  readonly titleKo?: string;
  readonly panelWidthPx: number;
  readonly panelHeightPx: number;
  readonly gutterAfterPx?: number;
  readonly layers: readonly SpatialDepthLayerInput[];
}

export interface SpatialTheaterCompileOptions {
  readonly layoutMode?: SpatialTheaterLayoutMode;
  readonly nearMeters?: number;
  readonly farMeters?: number;
  readonly depthRange?: StereoClipDepthRange;
  readonly prefersReducedMotion?: boolean;
  readonly maxHeadOffsetMeters?: number;
  readonly stereoRenderMode?: SpatialStereoRenderMode;
  readonly arcStepDeg?: number;
}

export interface CompiledSpatialLayerNode {
  readonly nodeId: string;
  readonly panelId: string;
  readonly layerId: string;
  readonly labelKo: string;
  readonly role: SpatialLayerRole;
  readonly depthRankBackToFront: number;
  readonly compressedDepthMeters: number;
  readonly compressedDisparityArcmin: number;
  readonly sizeScale: number;
  readonly worldWidthMeters: number;
  readonly worldHeightMeters: number;
  readonly positionMeters: readonly [number, number, number];
  readonly rotationEulerRad: readonly [number, number, number];
  readonly vacConflictDiopters: number;
  readonly dialogueDiplopiaGuarded: boolean;
  readonly wasVacClamped: boolean;
  readonly disocclusion: DisocclusionLayerAudit;
  readonly opacity: number;
}

export interface CompiledSpatialPanelNode {
  readonly panelId: string;
  readonly titleKo: string;
  readonly panelIndex: number;
  readonly panelWidthPx: number;
  readonly panelHeightPx: number;
  readonly baseWorldWidthMeters: number;
  readonly baseWorldHeightMeters: number;
  readonly anchorAzimuthRad: number;
  readonly anchorCenterY: number;
  readonly compression: ComfortZoneCompressionResult;
  readonly disocclusionAudit: DisocclusionAuditReport;
  readonly layers: readonly CompiledSpatialLayerNode[];
}

export interface SpatialDrawCallBudget {
  readonly totalPanels: number;
  readonly totalLayers: number;
  readonly stereoRenderMode: SpatialStereoRenderMode;
  readonly singlePassMultiview: boolean;
  readonly estimatedDrawCalls: number;
}

export interface CompiledSpatialTheaterSceneGraph {
  readonly schemaVersion: "wave95.spatial-theater.v1";
  readonly presetId: SpatialViewerPresetId;
  readonly presetLabelKo: string;
  readonly comfortTier: StereoComfortTier;
  readonly layoutMode: SpatialTheaterLayoutMode;
  readonly prefersReducedMotion: boolean;
  readonly effectiveIpdMeters: number;
  readonly maxHeadParallaxMeters: number;
  readonly convergenceDepthMeters: number;
  readonly optics: SpatialOpticsConfig;
  readonly stereoProjection: OffAxisStereoProjectionPair;
  readonly panels: readonly CompiledSpatialPanelNode[];
  readonly maxCrossedDisparityArcmin: number;
  readonly maxUncrossedDisparityArcmin: number;
  readonly maxDialogueAbsDisparityArcmin: number;
  readonly maxVacConflictDiopters: number;
  readonly allPanelsWithinVacComfort: boolean;
  readonly allDialogueDiplopiaSafe: boolean;
  readonly overallDisocclusionTearRisk: boolean;
  readonly maxRequiredOverscanPx: number;
  readonly atRiskLayerRefs: readonly string[];
  readonly drawCallBudget: SpatialDrawCallBudget;
  readonly sceneHashSha256: string;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * 2D 웹툰 회차 컷 배열을 커브드 극장 또는 수직 공간 스크롤 3D 장면 그래프로 컴파일한다.
 * `prefersReducedMotion: true`에서는 `effectiveIpdMeters = 0`, `maxHeadParallaxMeters = 0`,
 * 모든 레이어 시차 `0'`의 평면 안전 모드로 강제 전환한다.
 */
export function compileSpatialTheaterSceneGraph(
  episodePanels: readonly SpatialEpisodePanelInput[],
  opticsConfig: SpatialOpticsConfig,
  options?: SpatialTheaterCompileOptions,
): CompiledSpatialTheaterSceneGraph {
  const prefersReducedMotion = options?.prefersReducedMotion === true;
  const effectiveIpdMeters = prefersReducedMotion ? 0 : opticsConfig.ipdMeters;
  const maxHeadParallaxMeters = prefersReducedMotion
    ? 0
    : Math.max(0, options?.maxHeadOffsetMeters ?? opticsConfig.maxHeadOffsetMeters);

  const effectiveOptics: SpatialOpticsConfig = {
    ...opticsConfig,
    ipdMeters: effectiveIpdMeters,
    maxHeadOffsetMeters: maxHeadParallaxMeters,
  };
  const layoutMode: SpatialTheaterLayoutMode =
    options?.layoutMode ??
    (effectiveOptics.theaterCurvatureRadiusMeters !== null ? "curved-theater-arc" : "vertical-spatial-scroll");
  const stereoRenderMode: SpatialStereoRenderMode = prefersReducedMotion
    ? "mono-reduced-motion"
    : (options?.stereoRenderMode ?? "layered-quad-xr");

  const stereoProjection = computeOffAxisStereoProjectionPair(
    effectiveOptics,
    options?.nearMeters ?? 0.15,
    options?.farMeters ?? 50.0,
    options?.depthRange ?? "neg-one-to-one",
  );

  const metersPerPx = effectiveOptics.viewportWidthMeters / Math.max(1, effectiveOptics.viewportPixelWidth);
  const panelCount = episodePanels.length;
  const clampedArcStepDeg =
    panelCount <= 1 ? 0 : Math.min(Math.max(8, options?.arcStepDeg ?? 26), 135 / Math.max(1, panelCount - 1));

  let cursorY = 0; let totalLayers = 0; let maxCrossed = 0; let maxUncrossed = 0;
  let maxDialogueAbs = 0; let maxVacDiopters = 0; let maxRequiredOverscanPx = 0;
  let allPanelsWithinVacComfort = true; let allDialogueDiplopiaSafe = true; let overallDisocclusionTearRisk = false;
  const atRiskLayerRefs: string[] = [];
  const compiledPanels: CompiledSpatialPanelNode[] = [];

  for (let p = 0; p < panelCount; p += 1) {
    const panel = episodePanels[p];
    if (!panel) continue;
    const safeW = Math.max(1, panel.panelWidthPx);
    const safeH = Math.max(1, panel.panelHeightPx);
    const baseW = safeW * metersPerPx;
    const baseH = safeH * metersPerPx;
    const anchorCenterY = layoutMode === "vertical-spatial-scroll" ? cursorY - baseH * 0.5 : 0;
    if (layoutMode === "vertical-spatial-scroll") cursorY -= baseH + Math.max(0, panel.gutterAfterPx ?? 96) * metersPerPx;
    const anchorAzimuthRad =
      layoutMode === "curved-theater-arc" ? (p - (panelCount - 1) * 0.5) * clampedArcStepDeg * DEG_TO_RAD : 0;

    const compression = compressLayersIntoComfortZone(panel.layers, effectiveOptics);
    const disocclusionAudit = auditDisocclusionMargins(compression.layers, effectiveOptics, maxHeadParallaxMeters);
    const auditMap = new Map<string, DisocclusionLayerAudit>(disocclusionAudit.layers.map((r) => [r.layerId, r]));
    const sinPhi = Math.sin(anchorAzimuthRad);
    const cosPhi = Math.cos(anchorAzimuthRad);

    const layerNodes: CompiledSpatialLayerNode[] = compression.layers.map((layer) => {
      const depth = layer.compressedDepthMeters;
      const disocclusion: DisocclusionLayerAudit = auditMap.get(layer.layerId) ?? {
        layerId: layer.layerId, labelKo: layer.labelKo, role: layer.role, depthMeters: depth,
        horizontalShiftPx: 0, verticalShiftPx: 0, requiredOverscanPx: 0,
        suppliedOverscanPx: layer.overscanMarginPx, missingMarginPx: 0, disocclusionTearRisk: false,
      };
      return {
        nodeId: `${panel.panelId}::${layer.layerId}`, panelId: panel.panelId, layerId: layer.layerId,
        labelKo: layer.labelKo, role: layer.role, depthRankBackToFront: layer.depthRankBackToFront,
        compressedDepthMeters: depth, compressedDisparityArcmin: layer.compressedDisparityArcmin,
        sizeScale: layer.sizeScale, worldWidthMeters: baseW * layer.sizeScale, worldHeightMeters: baseH * layer.sizeScale,
        positionMeters: layoutMode === "curved-theater-arc" ? [depth * sinPhi, anchorCenterY, -depth * cosPhi] : [0, anchorCenterY, -depth],
        rotationEulerRad: layoutMode === "curved-theater-arc" ? [0, -anchorAzimuthRad, 0] : [0, 0, 0],
        vacConflictDiopters: layer.vacConflictDiopters, dialogueDiplopiaGuarded: layer.dialogueDiplopiaGuarded,
        wasVacClamped: layer.wasVacClamped, disocclusion, opacity: layer.opacity,
      };
    });

    totalLayers += layerNodes.length;
    maxCrossed = Math.max(maxCrossed, compression.maxCrossedDisparityArcmin);
    maxUncrossed = Math.max(maxUncrossed, compression.maxUncrossedDisparityArcmin);
    maxDialogueAbs = Math.max(maxDialogueAbs, compression.maxDialogueAbsDisparityArcmin);
    maxVacDiopters = Math.max(maxVacDiopters, compression.maxVacConflictDiopters);
    if (!compression.allWithinVacComfortBounds || !compression.strictDepthMonotonic) allPanelsWithinVacComfort = false;
    if (!compression.dialogueDiplopiaSafe) allDialogueDiplopiaSafe = false;
    if (disocclusionAudit.hasTearRisk) {
      overallDisocclusionTearRisk = true;
      for (const lid of disocclusionAudit.atRiskLayerIds) atRiskLayerRefs.push(`${panel.panelId}/${lid}`);
    }
    maxRequiredOverscanPx = Math.max(maxRequiredOverscanPx, disocclusionAudit.maxRequiredOverscanPx);

    compiledPanels.push({
      panelId: panel.panelId, titleKo: panel.titleKo ?? panel.panelId, panelIndex: p,
      panelWidthPx: safeW, panelHeightPx: safeH, baseWorldWidthMeters: baseW, baseWorldHeightMeters: baseH,
      anchorAzimuthRad, anchorCenterY, compression, disocclusionAudit, layers: layerNodes,
    });
  }

  const singlePassMultiview = stereoRenderMode !== "multiview-side-by-side";
  const unsignedScene = {
    schemaVersion: "wave95.spatial-theater.v1" as const,
    presetId: effectiveOptics.presetId, presetLabelKo: effectiveOptics.labelKo, comfortTier: effectiveOptics.comfortTier,
    layoutMode, prefersReducedMotion, effectiveIpdMeters, maxHeadParallaxMeters,
    convergenceDepthMeters: effectiveOptics.convergenceDepthMeters, optics: effectiveOptics,
    stereoProjection, panels: compiledPanels,
    maxCrossedDisparityArcmin: maxCrossed, maxUncrossedDisparityArcmin: maxUncrossed,
    maxDialogueAbsDisparityArcmin: maxDialogueAbs, maxVacConflictDiopters: maxVacDiopters,
    allPanelsWithinVacComfort, allDialogueDiplopiaSafe, overallDisocclusionTearRisk,
    maxRequiredOverscanPx, atRiskLayerRefs,
    drawCallBudget: {
      totalPanels: compiledPanels.length, totalLayers, stereoRenderMode,
      singlePassMultiview, estimatedDrawCalls: singlePassMultiview ? totalLayers : totalLayers * 2,
    },
  };

  return { ...unsignedScene, sceneHashSha256: sha256SpatialSceneHex(canonicalizeSpatialPayload(unsignedScene)) };
}

// ---------------------------------------------------------------------------
// 4. WebGPU/WebXR 다중 평면 시차·스테레오 합성 WGSL 셰이더 생성 및 정적 검증기
// ---------------------------------------------------------------------------

export interface SpatialTheaterWgslArtifact {
  readonly stereoMode: SpatialStereoRenderMode;
  readonly entryPoint: "mainSpatialParallaxCompose";
  readonly workgroupSize: readonly [8, 8, 1];
  readonly uniformByteLength: 176;
  readonly requiredBindings: readonly [0, 1, 2, 3];
  readonly source: string;
}

export interface SpatialTheaterWgslValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly discoveredBindings: readonly number[];
  readonly entryPoints: readonly string[];
  readonly stereoModeTag: string;
}

/** WebGPU/WebXR 다중 평면 시차·스테레오 합성 컴퓨트 WGSL 셰이더를 생성한다. */
export function buildSpatialParallaxDepthWgsl(
  stereoMode: SpatialStereoRenderMode,
): SpatialTheaterWgslArtifact {
  const modeCode = stereoMode === "mono-reduced-motion" ? 0 : stereoMode === "multiview-side-by-side" ? 1 : 2;
  const eyeSnippet =
    stereoMode === "mono-reduced-motion"
      ? `  let eyeSign: f32 = 0.0; let eyeIndex: u32 = 0u;
  let localPx = vec2<f32>(f32(gid.x), f32(gid.y));
  let eyeDims = uTheater.viewportAndEyePx.xy;
  let headShiftMeters = vec2<f32>(0.0, 0.0);`
      : stereoMode === "multiview-side-by-side"
        ? `  let halfW = u32(max(1.0, uTheater.viewportAndEyePx.x * 0.5));
  let eyeIndex: u32 = select(0u, 1u, gid.x >= halfW);
  let eyeSign: f32 = select(-1.0, 1.0, eyeIndex == 1u);
  let localPx = vec2<f32>(f32(select(gid.x, gid.x - halfW, eyeIndex == 1u)), f32(gid.y));
  let eyeDims = vec2<f32>(f32(halfW), uTheater.viewportAndEyePx.y);
  let headShiftMeters = select(uTheater.headOffsetAndMode.xy, vec2<f32>(0.0, 0.0), uTheater.opticsParams.w > 0.5);`
        : `  let eyeIndex: u32 = min(gid.z, 1u);
  let eyeSign: f32 = select(-1.0, 1.0, eyeIndex == 1u);
  let localPx = vec2<f32>(f32(gid.x), f32(gid.y));
  let eyeDims = uTheater.viewportAndEyePx.xy;
  let headShiftMeters = select(uTheater.headOffsetAndMode.xy, vec2<f32>(0.0, 0.0), uTheater.opticsParams.w > 0.5);`;

  const source = /* wgsl */ `// wave95-stereo-mode:${stereoMode} (code=${modeCode})
struct SpatialTheaterUniforms {
  viewportAndEyePx: vec4<f32>, opticsParams: vec4<f32>, headOffsetAndMode: vec4<f32>,
  leftProjRow0: vec4<f32>, leftProjRow1: vec4<f32>, leftProjRow2: vec4<f32>, leftProjRow3: vec4<f32>,
  rightProjRow0: vec4<f32>, rightProjRow1: vec4<f32>, rightProjRow2: vec4<f32>, rightProjRow3: vec4<f32>,
};
struct SpatialLayerDescriptor { depthAndScale: vec4<f32>, uvBoundsAndOverscan: vec4<f32>, };
@group(0) @binding(0) var<uniform> uTheater: SpatialTheaterUniforms;
@group(0) @binding(1) var<storage, read> layerDescriptors: array<SpatialLayerDescriptor>;
@group(0) @binding(2) var<storage, read> layerAtlasPixels: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> stereoOutputPixels: array<vec4<f32>>;

fn computeParallaxUvOffset(depthM: f32, convM: f32, eyeLatM: f32, headVertM: f32, vpM: vec2<f32>) -> vec2<f32> {
  let invDelta = (1.0 / max(0.05, depthM)) - (1.0 / max(0.05, convM));
  return vec2<f32>((eyeLatM * convM * invDelta) / max(0.1, vpM.x), (headVertM * convM * invDelta) / max(0.1, vpM.y));
}

fn sampleLayerWithOverscanGuard(layerIdx: u32, uv: vec2<f32>, overscanNorm: vec2<f32>, eyeDims: vec2<f32>) -> vec4<f32> {
  if (uv.x < -overscanNorm.x || uv.x > 1.0 + overscanNorm.x || uv.y < -overscanNorm.y || uv.y > 1.0 + overscanNorm.y) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }
  let cUv = clamp(uv, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
  let w = u32(max(1.0, eyeDims.x)); let h = u32(max(1.0, eyeDims.y));
  return layerAtlasPixels[layerIdx * w * h + min(h - 1u, u32(cUv.y * f32(h))) * w + min(w - 1u, u32(cUv.x * f32(w)))];
}

@compute @workgroup_size(8, 8, 1)
fn mainSpatialParallaxCompose(@builtin(global_invocation_id) gid: vec3<u32>) {
  let totalW = u32(max(1.0, uTheater.viewportAndEyePx.x));
  let totalH = u32(max(1.0, uTheater.viewportAndEyePx.y));
  if (gid.x >= totalW || gid.y >= totalH) { return; }
${eyeSnippet}
  let baseUv = (localPx + vec2<f32>(0.5, 0.5)) / max(vec2<f32>(1.0, 1.0), eyeDims);
  let effIpd = select(uTheater.opticsParams.x, 0.0, uTheater.opticsParams.w > 0.5);
  let eyeLatM = headShiftMeters.x + eyeSign * effIpd * 0.5;
  let vpM = vec2<f32>(max(0.15, uTheater.viewportAndEyePx.z), max(0.15, uTheater.viewportAndEyePx.w));
  let layerCount = u32(max(0.0, uTheater.headOffsetAndMode.z));
  var accum = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  for (var idx: u32 = 0u; idx < layerCount; idx = idx + 1u) {
    let desc = layerDescriptors[idx];
    let uv = baseUv + computeParallaxUvOffset(desc.depthAndScale.x, uTheater.opticsParams.y, eyeLatM, headShiftMeters.y, vpM);
    let src = sampleLayerWithOverscanGuard(idx, uv, desc.uvBoundsAndOverscan.zw, eyeDims);
    let a = clamp(src.a * desc.depthAndScale.w, 0.0, 1.0);
    accum = vec4<f32>(src.rgb * a + accum.rgb * (1.0 - a), a + accum.a * (1.0 - a));
  }
  stereoOutputPixels[eyeIndex * totalW * totalH + gid.y * totalW + gid.x] = accum;
}
`;
  return {
    stereoMode,
    entryPoint: "mainSpatialParallaxCompose",
    workgroupSize: [8, 8, 1],
    uniformByteLength: 176,
    requiredBindings: [0, 1, 2, 3],
    source,
  };
}

/** 생성된 공간 극장 WGSL 셰이더의 구문 균형, 바인딩, 진입점, 비정상 리터럴을 정적 검증한다. */
export function validateSpatialTheaterWgsl(source: string): SpatialTheaterWgslValidation {
  const errors: string[] = [];
  const stereoModeTag = /\/\/\s*wave95-stereo-mode:([a-z0-9-]+)/.exec(source)?.[1] ?? "unknown";
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  let brace = 0; let paren = 0; let bracket = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    else if (ch === "[") bracket += 1;
    else if (ch === "]") bracket -= 1;
    if (brace < 0 || paren < 0 || bracket < 0) {
      errors.push("WGSL 괄호 깊이가 음수로 떨어졌습니다.");
      break;
    }
  }
  if (brace !== 0) errors.push(`중괄호 균형 오류: ${brace}`);
  if (paren !== 0) errors.push(`소괄호 균형 오류: ${paren}`);
  if (bracket !== 0) errors.push(`대괄호 균형 오류: ${bracket}`);
  if (/\b(NaN|Infinity|undefined)\b/.test(stripped)) {
    errors.push("WGSL 소스에 허용되지 않는 리터럴(NaN/Infinity/undefined)이 포함되었습니다.");
  }
  if (!stripped.includes("struct SpatialTheaterUniforms")) errors.push("필수 구조체 SpatialTheaterUniforms가 누락되었습니다.");
  if (!stripped.includes("struct SpatialLayerDescriptor")) errors.push("필수 구조체 SpatialLayerDescriptor가 누락되었습니다.");
  if (!stripped.includes("@compute") || !stripped.includes("@workgroup_size(8, 8, 1)")) {
    errors.push("@compute @workgroup_size(8, 8, 1) 선언이 누락되었습니다.");
  }

  const entryPoints: string[] = [];
  const fnRegex = /@compute[\s\S]*?fn\s+(\w+)\s*\(/g;
  for (let m = fnRegex.exec(stripped); m !== null; m = fnRegex.exec(stripped)) {
    if (m[1]) entryPoints.push(m[1]);
  }
  if (!entryPoints.includes("mainSpatialParallaxCompose")) {
    errors.push("필수 컴퓨트 진입점 mainSpatialParallaxCompose가 누락되었습니다.");
  }

  const discoveredBindings: number[] = [];
  const bindRegex = /@group\(0\)\s+@binding\((\d+)\)\s+var<(uniform|storage)/g;
  for (let m = bindRegex.exec(stripped); m !== null; m = bindRegex.exec(stripped)) {
    discoveredBindings.push(Number(m[1]));
  }
  for (let b = 0; b <= 3; b += 1) {
    if (!discoveredBindings.includes(b)) errors.push(`필수 바인딩 @group(0) @binding(${b})가 누락되었습니다.`);
  }

  return { valid: errors.length === 0, errors, discoveredBindings, entryPoints, stereoModeTag };
}
