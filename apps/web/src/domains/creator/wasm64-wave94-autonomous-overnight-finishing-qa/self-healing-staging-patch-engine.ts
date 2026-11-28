/**
 * Wave 94 — 스테이징 격리 무인 자가 복구 패치 엔진 (`self-healing-staging-patch-engine`).
 *
 * - 순수 동기 ES2017 FIPS 180-4 SHA-256(`sha256OvernightQaHex`)으로 원본 마스터 스냅샷
 *   불변성(`masterSha256Before === masterSha256After`, `masterUnmutated === true`)을 증명한다.
 * - 오직 `SAFE_AUTO_PATCH` 항목만 격리 스테이징 사본에 결정론적으로 적용한다.
 * - 매 패치 직후 Post-Heal Regression Verification Gate로 회귀를 감지해 해당 패치만 단독 롤백
 *   (`AUTO_ROLLED_BACK_REGRESSION`)하며 `HARD_HUMAN_BLOCKER`는 절대 우회하지 않는다.
 * - 아침 작가 결정(`applyMorningPatchDecisions`)으로 개별 패치 수락/되돌림을 결정론적으로 재구성한다.
 */

import {
  DEFAULT_INK_LUMA_THRESHOLD,
  PLATFORM_SLICE_SPECS,
  isDarkInkRgba,
  rectBisectedByCutY,
  rectsOverlapPositive,
  scanOvernightEpisodeDefects,
  type CompactRgbaTileBuffer,
  type OvernightDefectClass,
  type OvernightEpisodeSnapshot,
  type OvernightPanelState,
  type OvernightScanOptions,
  type OvernightScanReport,
  type OvernightSpeechBalloon,
  type PixelCoord2d,
  type Rect2d,
} from "./overnight-episode-defect-scanner";

// 1. 순수 동기 ES2017 FIPS 180-4 SHA-256 (BigInt 리터럴 / Node crypto 무의존)
const SHA256_H0 = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
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

function encodeUtf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) { cp = ((cp - 0xd800) << 10) + (lo - 0xdc00) + 0x10000; i += 1; }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 0x3f), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(out);
}

const rotr32 = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/** FIPS 180-4 SHA-256 해시를 순수 동기로 계산해 64자리 소문자 16진수로 반환한다. */
export function sha256OvernightQaHex(input: string | Uint8Array): string {
  const data = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = SHA256_H0[0] ?? 0; let h1 = SHA256_H0[1] ?? 0; let h2 = SHA256_H0[2] ?? 0; let h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0; let h5 = SHA256_H0[5] ?? 0; let h6 = SHA256_H0[6] ?? 0; let h7 = SHA256_H0[7] ?? 0;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0; const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const t1 = (h + s1 + (((e & f) ^ (~e & g)) >>> 0) + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const t2 = (s0 + (((a & b) ^ (a & c) ^ (b & c)) >>> 0)) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

function bytesToHex(bytes: Uint8ClampedArray): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) parts.push((bytes[i] ?? 0).toString(16).padStart(2, "0"));
  return parts.join("");
}

/** 회차 스냅샷과 모든 래스터 타일 RGBA 바이트를 정규 JSON 문자열로 직렬화한다. */
export function canonicalSerializeEpisodeSnapshot(s: OvernightEpisodeSnapshot): string {
  return JSON.stringify({
    auditDateIso: s.auditDateIso ?? null,
    canvasHeightPx: s.canvasHeightPx,
    canvasWidthPx: s.canvasWidthPx,
    colorProfile: s.colorProfile ?? "srgb",
    episodeId: s.episodeId,
    faceKeepOutBoxes: s.faceKeepOutBoxes.map((f) => [f.boxId, f.characterId, f.panelId, f.bbox.x, f.bbox.y, f.bbox.width, f.bbox.height]),
    panels: s.panels.map((p) => ({
      bounds: [p.bounds.x, p.bounds.y, p.bounds.width, p.bounds.height],
      layers: p.layers.map((l) => [
        l.layerId, l.name, l.role, l.visible, l.opacity, l.blendMode, l.colorProfile ?? "srgb", l.hasStrayAlphaHalo === true,
        l.rasterTile ? [l.rasterTile.width, l.rasterTile.height, bytesToHex(l.rasterTile.rgba)] : null,
      ]),
      panelId: p.panelId,
      safeMarginPx: p.safeMarginPx ?? null,
      sequenceIndex: p.sequenceIndex,
    })),
    plannedSliceCutsY: s.plannedSliceCutsY ? Array.from(s.plannedSliceCutsY) : null,
    platformSpec: s.platformSpec,
    rightsBomAssets: s.rightsBomAssets.map((a) => [a.assetId, a.assetName, a.assetType, a.licenseStatus, a.expiresAtIso ?? null, Array.from(a.usedInPanelIds)]),
    speechBalloons: s.speechBalloons.map((b) => [b.balloonId, b.panelId, b.bbox.x, b.bbox.y, b.bbox.width, b.bbox.height, b.text, b.minReadableFontPx, b.fontSizePx ?? null]),
    title: s.title,
  });
}

/** 회차 스냅샷의 결정론적 SHA-256 해시를 계산한다. */
export function computeEpisodeSnapshotSha256(snapshot: OvernightEpisodeSnapshot): string {
  return sha256OvernightQaHex(canonicalSerializeEpisodeSnapshot(snapshot));
}

// 2. 격리 스테이징용 깊은 복제
type DeepMutable<T> = T extends Uint8ClampedArray
  ? Uint8ClampedArray
  : T extends readonly (infer U)[]
    ? DeepMutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
      : T;

type MutableEpisodeSnapshot = DeepMutable<OvernightEpisodeSnapshot>;
type MutablePanelState = MutableEpisodeSnapshot["panels"][number];

/** 모든 래스터 버퍼와 배열을 포함해 마스터 스냅샷을 완전히 격리 복제한다. */
export function cloneEpisodeSnapshot(s: OvernightEpisodeSnapshot): MutableEpisodeSnapshot {
  return {
    ...s,
    plannedSliceCutsY: s.plannedSliceCutsY ? Array.from(s.plannedSliceCutsY) : undefined,
    panels: s.panels.map((p) => ({
      ...p,
      bounds: { ...p.bounds },
      layers: p.layers.map((l) => ({
        ...l,
        rasterTile: l.rasterTile ? { width: l.rasterTile.width, height: l.rasterTile.height, rgba: new Uint8ClampedArray(l.rasterTile.rgba) } : undefined,
      })),
    })),
    speechBalloons: s.speechBalloons.map((b) => ({ ...b, bbox: { ...b.bbox } })),
    faceKeepOutBoxes: s.faceKeepOutBoxes.map((f) => ({ ...f, bbox: { ...f.bbox } })),
    rightsBomAssets: s.rightsBomAssets.map((a) => ({ ...a, usedInPanelIds: Array.from(a.usedInPanelIds) })),
  };
}

// 3. 패치 연산·실행 결과·아침 결정 계약
export type SelfHealingPatchStatus = "APPLIED" | "AUTO_ROLLED_BACK_REGRESSION";
export type MorningPatchDecision = "accept" | "revert";

export type SelfHealingPatchOperation =
  | { readonly kind: "fill-pinhole"; readonly panelId: string; readonly layerId: string; readonly pixels: readonly PixelCoord2d[]; readonly fillRgba: readonly [number, number, number, number] }
  | { readonly kind: "hide-draft-guide-layer"; readonly panelId: string; readonly layerId: string }
  | { readonly kind: "nudge-speech-balloon"; readonly panelId: string; readonly balloonId: string; readonly previousBbox: Rect2d; readonly nextBbox: Rect2d; readonly deltaX: number; readonly deltaY: number }
  | { readonly kind: "plan-vertical-slice-cuts"; readonly previousCutsY: readonly number[]; readonly nextCutsY: readonly number[]; readonly maxSliceHeightPx: number };

export interface SelfHealingPatchRecord {
  readonly patchId: string;
  readonly defectIds: readonly string[];
  readonly defectClass: OvernightDefectClass;
  readonly status: SelfHealingPatchStatus;
  readonly summaryKo: string;
  readonly operation: SelfHealingPatchOperation | null;
  readonly resolvedDefectIds: readonly string[];
  readonly introducedDefectIds: readonly string[];
  readonly rollbackReasonKo?: string;
}

export interface GutterBandInterval { readonly startY: number; readonly endY: number }

export interface VerticalSlicePlanResult {
  readonly feasible: boolean;
  readonly cutsY: readonly number[];
  readonly sliceHeightsPx: readonly number[];
  readonly safeGutterBands: readonly GutterBandInterval[];
  readonly failureReasonKo?: string;
}

export interface OvernightSelfHealingOptions { readonly scanOptions?: OvernightScanOptions }

export interface OvernightSelfHealingRunResult {
  readonly episodeId: string;
  readonly title: string;
  readonly platformSpec: OvernightEpisodeSnapshot["platformSpec"];
  readonly masterSha256Before: string;
  readonly masterSha256After: string;
  readonly masterUnmutated: boolean;
  readonly stagingSha256After: string;
  readonly masterBaselineClone: OvernightEpisodeSnapshot;
  readonly stagingSnapshot: OvernightEpisodeSnapshot;
  readonly beforeScan: OvernightScanReport;
  readonly afterScan: OvernightScanReport;
  readonly patches: readonly SelfHealingPatchRecord[];
  readonly appliedPatchCount: number;
  readonly rolledBackPatchCount: number;
  readonly verticalSlicePlan: VerticalSlicePlanResult | null;
  readonly exportReady: boolean;
  readonly scanOptions: OvernightScanOptions;
}

export interface MorningPatchDecisionResult {
  readonly episodeId: string;
  readonly masterSha256: string;
  readonly masterUnmutated: boolean;
  readonly finalStagingSnapshot: OvernightEpisodeSnapshot;
  readonly finalStagingSha256: string;
  readonly finalScan: OvernightScanReport;
  readonly acceptedPatchIds: readonly string[];
  readonly revertedPatchIds: readonly string[];
  readonly keptRolledBackPatchIds: readonly string[];
  readonly unknownDecisionPatchIds: readonly string[];
  readonly exportReady: boolean;
}

// 4. 여백(거터) 기반 세로 슬라이스 플래너
function mergeIntervals(intervals: readonly GutterBandInterval[]): GutterBandInterval[] {
  const sorted = intervals.filter((iv) => iv.endY > iv.startY).sort((a, b) => (a.startY !== b.startY ? a.startY - b.startY : a.endY - b.endY));
  const merged: GutterBandInterval[] = [];
  for (const cur of sorted) {
    const prev = merged[merged.length - 1];
    if (!prev || cur.startY > prev.endY) merged.push({ startY: cur.startY, endY: cur.endY });
    else if (cur.endY > prev.endY) merged[merged.length - 1] = { startY: prev.startY, endY: cur.endY };
  }
  return merged;
}

function subtractIntervals(base: readonly GutterBandInterval[], exclusions: readonly GutterBandInterval[]): GutterBandInterval[] {
  let current = Array.from(base);
  for (const ex of exclusions) {
    const next: GutterBandInterval[] = [];
    for (const iv of current) {
      if (ex.endY <= iv.startY || ex.startY >= iv.endY) next.push(iv);
      else {
        if (ex.startY > iv.startY) next.push({ startY: iv.startY, endY: ex.startY });
        if (ex.endY < iv.endY) next.push({ startY: ex.endY, endY: iv.endY });
      }
    }
    current = next;
  }
  return current.filter((iv) => iv.endY - iv.startY >= 1);
}

/** 말풍선·얼굴·패널을 절대 가로지르지 않고 빈 거터 구간 내부에만 안전한 세로 분할선을 계산한다. */
export function planGutterAwareVerticalSlices(episode: OvernightEpisodeSnapshot): VerticalSlicePlanResult {
  const maxH = PLATFORM_SLICE_SPECS[episode.platformSpec].maxSliceHeightPx;
  const totalH = episode.canvasHeightPx;
  const panelSpans = mergeIntervals(episode.panels.map((p) => ({ startY: Math.max(0, p.bounds.y), endY: Math.min(totalH, p.bounds.y + p.bounds.height) })));
  const protectedSpans = mergeIntervals([
    ...episode.speechBalloons.map((b) => ({ startY: Math.max(0, b.bbox.y), endY: Math.min(totalH, b.bbox.y + b.bbox.height) })),
    ...episode.faceKeepOutBoxes.map((f) => ({ startY: Math.max(0, f.bbox.y), endY: Math.min(totalH, f.bbox.y + f.bbox.height) })),
  ]);

  const rawGutters: GutterBandInterval[] = [];
  for (let i = 0; i + 1 < panelSpans.length; i += 1) {
    const upper = panelSpans[i]; const lower = panelSpans[i + 1];
    if (upper && lower && lower.startY > upper.endY) rawGutters.push({ startY: upper.endY, endY: lower.startY });
  }
  const safeGutterBands = subtractIntervals(rawGutters, protectedSpans);
  if (totalH <= maxH) return { feasible: true, cutsY: [0, totalH], sliceHeightsPx: [totalH], safeGutterBands };

  const cuts: number[] = [0];
  let cursorY = 0;
  while (totalH - cursorY > maxH) {
    const windowMaxY = cursorY + maxH;
    let bestCutY: number | null = null;
    for (const band of safeGutterBands) {
      const lo = Math.max(band.startY, cursorY + 1);
      const hi = Math.min(band.endY, windowMaxY);
      if (hi < lo) continue;
      let y = Math.round((lo + hi) / 2);
      if (y <= band.startY && band.endY - band.startY >= 2) y = Math.ceil(band.startY) + 1;
      if (y >= band.endY && band.endY - band.startY >= 2) y = Math.floor(band.endY) - 1;
      if (y <= cursorY || y > windowMaxY) continue;
      if (episode.speechBalloons.some((b) => rectBisectedByCutY(b.bbox, y))) continue;
      if (episode.faceKeepOutBoxes.some((f) => rectBisectedByCutY(f.bbox, y))) continue;
      if (bestCutY === null || y > bestCutY) bestCutY = y;
    }
    if (bestCutY === null) {
      return {
        feasible: false,
        cutsY: episode.plannedSliceCutsY ? Array.from(episode.plannedSliceCutsY) : [0, totalH],
        sliceHeightsPx: [],
        safeGutterBands,
        failureReasonKo: `Y=${cursorY}..${windowMaxY}px 구간 안에 말풍선·얼굴·패널을 피하는 빈 거터가 없어 안전한 자동 분할이 불가능합니다.`,
      };
    }
    cuts.push(bestCutY);
    cursorY = bestCutY;
  }
  cuts.push(totalH);
  return { feasible: true, cutsY: cuts, sliceHeightsPx: cuts.slice(1).map((y, i) => y - (cuts[i] ?? 0)), safeGutterBands };
}

// 5. 개별 SAFE_AUTO_PATCH 실행기 & 회귀 검증 게이트
function resolveMajorityCelFillRgba(
  panel: MutablePanelState,
  celTile: CompactRgbaTileBuffer,
  pinholePixels: readonly PixelCoord2d[],
  inkLumaThreshold: number,
): readonly [number, number, number, number] | null {
  const { width, height, rgba } = celTile;
  const pinholeSet = new Set(pinholePixels.map((p) => p.y * width + p.x));
  const inkTiles = panel.layers
    .filter((l) => l.visible && l.role === "ink" && l.rasterTile?.width === width && l.rasterTile?.height === height)
    .map((l) => l.rasterTile)
    .filter((t): t is CompactRgbaTileBuffer => t !== undefined);

  const sample = (offsets: readonly (readonly [number, number])[]): Map<string, number> => {
    const counts = new Map<string, number>();
    const seen = new Set<number>();
    for (const px of pinholePixels) {
      for (const [dx, dy] of offsets) {
        const nx = px.x + dx; const ny = px.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const flat = ny * width + nx;
        if (pinholeSet.has(flat) || seen.has(flat)) continue;
        if (inkTiles.some((t) => (t.rgba[flat * 4 + 3] ?? 0) >= 128)) continue;
        const r = rgba[flat * 4] ?? 0; const g = rgba[flat * 4 + 1] ?? 0;
        const b = rgba[flat * 4 + 2] ?? 0; const a = rgba[flat * 4 + 3] ?? 0;
        if (a < 128 || isDarkInkRgba(r, g, b, a, inkLumaThreshold)) continue;
        seen.add(flat);
        const key = `${r},${g},${b},${a}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  };

  let counts = sample([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  if (counts.size === 0) counts = sample([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  if (counts.size === 0) return null;

  let bestKey = ""; let bestCount = -1;
  counts.forEach((count, key) => {
    if (count > bestCount || (count === bestCount && (bestKey === "" || key < bestKey))) { bestCount = count; bestKey = key; }
  });
  const [r = 0, g = 0, b = 0, a = 255] = bestKey.split(",").map(Number);
  return [r, g, b, a];
}

function applyOperationToStaging(staging: MutableEpisodeSnapshot, op: SelfHealingPatchOperation, inkLumaThreshold: number): boolean {
  if (op.kind === "fill-pinhole") {
    const layer = staging.panels.find((p) => p.panelId === op.panelId)?.layers.find((l) => l.layerId === op.layerId);
    if (!layer?.rasterTile) return false;
    const { width, height, rgba } = layer.rasterTile;
    for (const px of op.pixels) {
      if (px.x < 0 || px.y < 0 || px.x >= width || px.y >= height) continue;
      const idx = (px.y * width + px.x) * 4;
      if (isDarkInkRgba(rgba[idx] ?? 0, rgba[idx + 1] ?? 0, rgba[idx + 2] ?? 0, rgba[idx + 3] ?? 0, inkLumaThreshold)) continue;
      rgba[idx] = op.fillRgba[0]; rgba[idx + 1] = op.fillRgba[1]; rgba[idx + 2] = op.fillRgba[2]; rgba[idx + 3] = op.fillRgba[3];
    }
    return true;
  }
  if (op.kind === "hide-draft-guide-layer") {
    const layer = staging.panels.find((p) => p.panelId === op.panelId)?.layers.find((l) => l.layerId === op.layerId);
    if (!layer) return false;
    layer.visible = false;
    return true;
  }
  if (op.kind === "nudge-speech-balloon") {
    const balloon = staging.speechBalloons.find((b) => b.balloonId === op.balloonId);
    if (!balloon) return false;
    balloon.bbox = { ...op.nextBbox };
    return true;
  }
  staging.plannedSliceCutsY = Array.from(op.nextCutsY);
  return true;
}

function buildMinimumBalloonNudgeOp(staging: MutableEpisodeSnapshot, balloon: OvernightSpeechBalloon, panel: OvernightPanelState): SelfHealingPatchOperation {
  const req = panel.safeMarginPx ?? PLATFORM_SLICE_SPECS[staging.platformSpec].defaultPanelSafeMarginPx;
  const mx = Math.min(req, Math.max(0, Math.floor((panel.bounds.width - balloon.bbox.width) / 2)));
  const my = Math.min(req, Math.max(0, Math.floor((panel.bounds.height - balloon.bbox.height) / 2)));
  const targetX = Math.max(panel.bounds.x + mx, Math.min(panel.bounds.x + panel.bounds.width - mx - balloon.bbox.width, balloon.bbox.x));
  const targetY = Math.max(panel.bounds.y + my, Math.min(panel.bounds.y + panel.bounds.height - my - balloon.bbox.height, balloon.bbox.y));
  return {
    kind: "nudge-speech-balloon",
    panelId: panel.panelId,
    balloonId: balloon.balloonId,
    previousBbox: { ...balloon.bbox },
    nextBbox: { ...balloon.bbox, x: targetX, y: targetY },
    deltaX: targetX - balloon.bbox.x,
    deltaY: targetY - balloon.bbox.y,
  };
}

function verifyPatchWithRegressionGate(
  currentStaging: MutableEpisodeSnapshot,
  beforePatchScan: OvernightScanReport,
  targetDefectIds: readonly string[],
  op: SelfHealingPatchOperation,
  scanOptions: OvernightScanOptions,
): {
  readonly passed: boolean;
  readonly nextStaging: MutableEpisodeSnapshot;
  readonly nextScan: OvernightScanReport;
  readonly resolvedDefectIds: readonly string[];
  readonly introducedDefectIds: readonly string[];
  readonly rollbackReasonKo?: string;
} {
  const tentative = cloneEpisodeSnapshot(currentStaging);
  if (!applyOperationToStaging(tentative, op, scanOptions.inkLumaThreshold ?? DEFAULT_INK_LUMA_THRESHOLD)) {
    return { passed: false, nextStaging: currentStaging, nextScan: beforePatchScan, resolvedDefectIds: [], introducedDefectIds: [], rollbackReasonKo: "대상 요소를 스테이징에서 찾지 못해 패치를 되돌렸습니다." };
  }
  const afterPatchScan = scanOvernightEpisodeDefects(tentative, scanOptions);
  const beforeIds = new Set(beforePatchScan.defects.map((d) => d.defectId));
  const afterIds = new Set(afterPatchScan.defects.map((d) => d.defectId));
  const resolvedDefectIds = beforePatchScan.defects.filter((d) => !afterIds.has(d.defectId)).map((d) => d.defectId);
  const introducedDefectIds = afterPatchScan.defects.filter((d) => !beforeIds.has(d.defectId)).map((d) => d.defectId);
  const allTargetsResolved = targetDefectIds.every((id) => !afterIds.has(id));
  const faceOverlapIds =
    op.kind === "nudge-speech-balloon"
      ? tentative.faceKeepOutBoxes.filter((f) => f.panelId === op.panelId && rectsOverlapPositive(op.nextBbox, f.bbox)).map((f) => f.boxId)
      : [];

  if (introducedDefectIds.length > 0 || faceOverlapIds.length > 0 || !allTargetsResolved) {
    const rollbackReasonKo =
      faceOverlapIds.length > 0
        ? `캐릭터 얼굴 보호 영역(${faceOverlapIds.join(", ")})과 겹침이 발생해 자동 되돌림`
        : introducedDefectIds.length > 0
          ? `패치 직후 새 결함 ${introducedDefectIds.length}건(${introducedDefectIds.join(", ")})이 감지되어 자동 되돌림`
          : "패치 후에도 대상 결함이 해소되지 않아 자동 되돌림";
    return { passed: false, nextStaging: currentStaging, nextScan: beforePatchScan, resolvedDefectIds: [], introducedDefectIds, rollbackReasonKo };
  }
  return { passed: true, nextStaging: tentative, nextScan: afterPatchScan, resolvedDefectIds, introducedDefectIds: [] };
}

/** 무인 야간 자율 마감 QA·자가 복구 파이프라인을 격리 스테이징에서 실행한다. */
export function runOvernightSelfHealingPipeline(
  masterEpisode: OvernightEpisodeSnapshot,
  options: OvernightSelfHealingOptions = {},
): OvernightSelfHealingRunResult {
  const scanOptions: OvernightScanOptions = options.scanOptions ?? {};
  const inkLumaThreshold = scanOptions.inkLumaThreshold ?? DEFAULT_INK_LUMA_THRESHOLD;
  const masterSha256Before = computeEpisodeSnapshotSha256(masterEpisode);
  const masterBaselineClone = cloneEpisodeSnapshot(masterEpisode);
  let staging = cloneEpisodeSnapshot(masterEpisode);

  const beforeScan = scanOvernightEpisodeDefects(staging, scanOptions);
  let currentScan = beforeScan;
  const patches: SelfHealingPatchRecord[] = [];
  let patchSeq = 0;
  let verticalSlicePlan: VerticalSlicePlanResult | null = null;
  let handledSliceBudget = false;
  const safeDefects = beforeScan.defects.filter((d) => d.safetyTier === "SAFE_AUTO_PATCH");

  const nextPatchId = (suffix: string): string => {
    patchSeq += 1;
    return `patch-${String(patchSeq).padStart(3, "0")}-${suffix}`;
  };

  const applyAndVerify = (
    suffix: string,
    defectClass: OvernightDefectClass,
    targetIds: readonly string[],
    op: SelfHealingPatchOperation,
    okSummaryKo: string,
    failSummaryKo: string,
  ): void => {
    const gate = verifyPatchWithRegressionGate(staging, currentScan, targetIds, op, scanOptions);
    staging = gate.nextStaging;
    currentScan = gate.nextScan;
    patches.push({
      patchId: nextPatchId(suffix),
      defectIds: targetIds,
      defectClass,
      status: gate.passed ? "APPLIED" : "AUTO_ROLLED_BACK_REGRESSION",
      summaryKo: gate.passed ? okSummaryKo : failSummaryKo,
      operation: op,
      resolvedDefectIds: gate.resolvedDefectIds,
      introducedDefectIds: gate.introducedDefectIds,
      rollbackReasonKo: gate.rollbackReasonKo,
    });
  };

  for (const defect of safeDefects) {
    if (defect.defectClass === "transparent-pinhole-gap") {
      const panel = staging.panels.find((p) => p.panelId === defect.panelId);
      const layer = panel?.layers.find((l) => l.layerId === defect.layerId);
      if (!panel || !layer?.rasterTile || !defect.pinholePixels?.length) continue;
      const fillRgba = resolveMajorityCelFillRgba(panel, layer.rasterTile, defect.pinholePixels, inkLumaThreshold);
      if (!fillRgba) {
        patches.push({
          patchId: nextPatchId("pinhole"), defectIds: [defect.defectId], defectClass: defect.defectClass, status: "AUTO_ROLLED_BACK_REGRESSION",
          summaryKo: `패널 ${panel.panelId} 채색 핀홀 기준색을 결정할 수 없어 복구를 취소했습니다.`, operation: null, resolvedDefectIds: [], introducedDefectIds: [],
          rollbackReasonKo: "인접 비-잉크 채색 픽셀을 찾지 못했습니다.",
        });
        continue;
      }
      applyAndVerify(
        "pinhole", defect.defectClass, [defect.defectId],
        { kind: "fill-pinhole", panelId: panel.panelId, layerId: layer.layerId, pixels: defect.pinholePixels, fillRgba },
        `패널 ${panel.panelId} '${layer.name}' 투명 핀홀 ${defect.pinholePixels.length}픽셀을 인접 채색 대표색 RGBA(${fillRgba.join(",")})로 메웠습니다.`,
        `패널 ${panel.panelId} '${layer.name}' 핀홀 복구가 회귀 검증에 걸려 자동 되돌림 처리되었습니다.`,
      );
    } else if (defect.defectClass === "draft-guide-layer-left-visible" && defect.panelId && defect.layerId) {
      applyAndVerify(
        "hide-draft", defect.defectClass, [defect.defectId],
        { kind: "hide-draft-guide-layer", panelId: defect.panelId, layerId: defect.layerId },
        `패널 ${defect.panelId} 보조 레이어(${defect.layerId})를 스테이징에서 비표시로 전환했습니다.`,
        `패널 ${defect.panelId} 보조 레이어 숨김이 회귀 검증 실패로 자동 되돌림 처리되었습니다.`,
      );
    } else if (defect.defectClass === "speech-balloon-edge-clip" && defect.subtype === "panel-edge-clip") {
      const panel = staging.panels.find((p) => p.panelId === defect.panelId);
      const balloon = staging.speechBalloons.find((b) => b.balloonId === defect.balloonId);
      if (!panel || !balloon) continue;
      const op = buildMinimumBalloonNudgeOp(staging, balloon, panel);
      const deltaKo = op.kind === "nudge-speech-balloon" ? `(${op.deltaX >= 0 ? "+" : ""}${op.deltaX}px, ${op.deltaY >= 0 ? "+" : ""}${op.deltaY}px)` : "";
      applyAndVerify(
        "nudge-balloon", defect.defectClass, [defect.defectId], op,
        `패널 ${panel.panelId} 말풍선 '${balloon.balloonId}'를 얼굴 보호 영역 충돌 없이 안쪽으로 ${deltaKo} 이동했습니다.`,
        `패널 ${panel.panelId} 말풍선 '${balloon.balloonId}' 안쪽 이동 시 얼굴 보호 영역 충돌이 감지되어 해당 패치만 자동 되돌렸습니다.`,
      );
    } else if (defect.defectClass === "vertical-slice-budget-violation" && !handledSliceBudget) {
      handledSliceBudget = true;
      const targetIds = safeDefects.filter((d) => d.defectClass === "vertical-slice-budget-violation").map((d) => d.defectId);
      const plan = planGutterAwareVerticalSlices(staging);
      verticalSlicePlan = plan;
      if (!plan.feasible) {
        patches.push({
          patchId: nextPatchId("slice-plan"), defectIds: targetIds, defectClass: "vertical-slice-budget-violation", status: "AUTO_ROLLED_BACK_REGRESSION",
          summaryKo: "안전한 빈 거터 분할 경로를 찾지 못해 세로 분할 자동 패치를 되돌렸습니다.", operation: null, resolvedDefectIds: [], introducedDefectIds: [],
          rollbackReasonKo: plan.failureReasonKo,
        });
        continue;
      }
      const interior = plan.cutsY.slice(1, -1);
      applyAndVerify(
        "slice-plan", "vertical-slice-budget-violation", targetIds,
        {
          kind: "plan-vertical-slice-cuts",
          previousCutsY: staging.plannedSliceCutsY ? Array.from(staging.plannedSliceCutsY) : [0, staging.canvasHeightPx],
          nextCutsY: plan.cutsY,
          maxSliceHeightPx: PLATFORM_SLICE_SPECS[staging.platformSpec].maxSliceHeightPx,
        },
        `빈 거터 구간에만 세로 분할선 ${interior.length}곳(${interior.map((y) => `${y}px`).join(", ")})을 배치해 ${plan.sliceHeightsPx.length}개 안전 슬라이스로 분할했습니다.`,
        "세로 슬라이스 자동 분할이 회귀 검증에 걸려 자동 되돌림 처리되었습니다.",
      );
    }
  }

  const afterScan = scanOvernightEpisodeDefects(staging, scanOptions);
  const stagingSha256After = computeEpisodeSnapshotSha256(staging);
  const masterSha256After = computeEpisodeSnapshotSha256(masterEpisode);
  const masterUnmutated = masterSha256Before === masterSha256After;
  const appliedPatchCount = patches.filter((p) => p.status === "APPLIED").length;
  const rolledBackPatchCount = patches.filter((p) => p.status === "AUTO_ROLLED_BACK_REGRESSION").length;

  return {
    episodeId: masterEpisode.episodeId,
    title: masterEpisode.title,
    platformSpec: masterEpisode.platformSpec,
    masterSha256Before,
    masterSha256After,
    masterUnmutated,
    stagingSha256After,
    masterBaselineClone,
    stagingSnapshot: staging,
    beforeScan,
    afterScan,
    patches,
    appliedPatchCount,
    rolledBackPatchCount,
    verticalSlicePlan,
    exportReady: masterUnmutated && afterScan.hardBlockerCount === 0 && afterScan.defects.length === 0 && rolledBackPatchCount === 0,
    scanOptions,
  };
}

/** 아침 검토 시 작가의 개별 패치 수락(`accept`)/되돌림(`revert`) 결정을 결정론적으로 재구성한다. */
export function applyMorningPatchDecisions(
  runResult: OvernightSelfHealingRunResult,
  decisions: Readonly<Record<string, MorningPatchDecision>>,
): MorningPatchDecisionResult {
  const inkLumaThreshold = runResult.scanOptions.inkLumaThreshold ?? DEFAULT_INK_LUMA_THRESHOLD;
  const masterHashBefore = computeEpisodeSnapshotSha256(runResult.masterBaselineClone);
  const reconstructed = cloneEpisodeSnapshot(runResult.masterBaselineClone);
  const knownIds = new Set(runResult.patches.map((p) => p.patchId));
  const unknownDecisionPatchIds = Object.keys(decisions).filter((id) => !knownIds.has(id)).sort();

  const acceptedPatchIds: string[] = [];
  const revertedPatchIds: string[] = [];
  const keptRolledBackPatchIds: string[] = [];

  for (const patch of runResult.patches) {
    if (patch.status === "AUTO_ROLLED_BACK_REGRESSION" || patch.operation === null) {
      keptRolledBackPatchIds.push(patch.patchId);
      continue;
    }
    if ((decisions[patch.patchId] ?? "accept") === "accept") {
      applyOperationToStaging(reconstructed, patch.operation, inkLumaThreshold);
      acceptedPatchIds.push(patch.patchId);
    } else {
      revertedPatchIds.push(patch.patchId);
    }
  }

  const finalScan = scanOvernightEpisodeDefects(reconstructed, runResult.scanOptions);
  const finalStagingSha256 = computeEpisodeSnapshotSha256(reconstructed);
  const masterUnmutated =
    masterHashBefore === computeEpisodeSnapshotSha256(runResult.masterBaselineClone) &&
    masterHashBefore === runResult.masterSha256Before;

  return {
    episodeId: runResult.episodeId,
    masterSha256: runResult.masterSha256Before,
    masterUnmutated,
    finalStagingSnapshot: reconstructed,
    finalStagingSha256,
    finalScan,
    acceptedPatchIds,
    revertedPatchIds,
    keptRolledBackPatchIds,
    unknownDecisionPatchIds,
    exportReady: masterUnmutated && finalScan.hardBlockerCount === 0 && finalScan.defects.length === 0 && keptRolledBackPatchIds.length === 0,
  };
}
