/**
 * WebNN NPU / 오프라인 경량 비파괴 구도·객체 검출기 (`webnn-composition-object-detector`).
 *
 * - `navigator.ml`(WebNN NPU/GPU/CPU) 자동 실행 프로바이더 라우팅 + 오프라인 적분 이미지·HOG·연결요소 검출기
 * - 얼굴(`face`) · 캐릭터(`character`) · 말풍선(`speech-balloon`) · 텍스트 영역(`text-block`) 바운딩 박스 검출
 * - 비파괴 3분할(Rule of Thirds) · 황금비(Phi) · 안전 여백(Safe Gutter) · 말풍선 충돌 회피 슬롯 산출
 * - `studio-vello-phase1-overlay-adapter`의 `StudioVelloPhase1OverlayState` 규격으로 즉시 직렬화 가능
 */

import type {
  StudioVelloGuideLine,
  StudioVelloMarqueeRect,
  StudioVelloPhase1OverlayState,
  StudioVelloSnapLine,
} from "../canvas/studio-vello-phase1-overlay-adapter";

export type CompositionDetectionKind = "face" | "character" | "speech-balloon" | "text-block";
export type CompositionProviderKind = "webnn-npu" | "webnn-gpu" | "webnn-cpu" | "offline-integral-hog-cc";
export type CompositionGuidePreset = "rule-of-thirds" | "golden-ratio" | "both";

export interface CompositionRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface CompositionPoint { readonly x: number; readonly y: number; }
export interface DetectedObjectFeatures {
  readonly symmetryScore: number; readonly edgeDensity: number; readonly meanLuma: number; readonly skinRatio: number;
}
export interface DetectedCompositionObject {
  readonly id: string; readonly kind: CompositionDetectionKind; readonly rect: CompositionRect;
  readonly confidence: number; readonly source: CompositionProviderKind; readonly features: DetectedObjectFeatures;
}
export interface WebNnNavigatorMlLike {
  readonly createContext: (options?: {
    readonly deviceType?: "npu" | "gpu" | "cpu";
    readonly powerPreference?: "default" | "high-performance" | "low-power";
  }) => Promise<unknown>;
}
export interface WebNnCompositionModelExecutor {
  readonly modelId: string;
  readonly detect: (input: {
    readonly rgba: Uint8ClampedArray | Uint8Array; readonly width: number; readonly height: number;
    readonly deviceType: "npu" | "gpu" | "cpu";
  }) => Promise<readonly DetectedCompositionObject[]>;
}
export interface WebNnCompositionProbeEnv {
  readonly navigatorMl?: WebNnNavigatorMlLike | null;
  readonly webNnExecutor?: WebNnCompositionModelExecutor | null;
}
export interface WebNnCompositionProviderReport {
  readonly webNnSupported: boolean; readonly availableDeviceTypes: readonly ("npu" | "gpu" | "cpu")[];
  readonly selectedProvider: CompositionProviderKind; readonly hasModelExecutor: boolean;
  readonly serverCostKrw: 0; readonly summaryKo: string;
}
export interface SafeBalloonSlot {
  readonly id: string; readonly rank: number; readonly rect: CompositionRect;
  readonly overlapWithFaces: number; readonly overlapWithExistingBalloons: number; readonly overlapWithCharacters: number;
  readonly visualClutterScore: number; readonly score: number;
  readonly readingZone: "upper-left" | "upper-right" | "upper-center" | "side-gutter" | "lower";
  readonly tailTarget: CompositionPoint | null;
}
export interface CompositionAnchorPoint {
  readonly id: string; readonly preset: "rule-of-thirds" | "golden-ratio"; readonly point: CompositionPoint;
}
export interface CompositionAnalysisOptions {
  readonly panelRect?: CompositionRect; readonly existingBalloons?: readonly CompositionRect[];
  readonly safeMarginRatio?: number; readonly desiredBalloonWidthRatio?: number;
  readonly desiredBalloonHeightRatio?: number; readonly maxSafeBalloonSlots?: number;
  readonly workingMaxSide?: number; readonly env?: WebNnCompositionProbeEnv;
}
export interface CompositionAnalysisResult {
  readonly width: number; readonly height: number; readonly panelRect: CompositionRect;
  readonly providerReport: WebNnCompositionProviderReport;
  readonly detections: readonly DetectedCompositionObject[];
  readonly faces: readonly DetectedCompositionObject[]; readonly characters: readonly DetectedCompositionObject[];
  readonly speechBalloons: readonly DetectedCompositionObject[]; readonly textBlocks: readonly DetectedCompositionObject[];
  readonly ruleOfThirdsAnchors: readonly CompositionAnchorPoint[]; readonly goldenRatioAnchors: readonly CompositionAnchorPoint[];
  readonly safeGutterRect: CompositionRect; readonly safeBalloonSlots: readonly SafeBalloonSlot[];
  readonly focalHarmonyScore: number; readonly primaryFocalPoint: CompositionPoint | null;
}
export interface BuildCompositionOverlayOptions {
  readonly guidePreset?: CompositionGuidePreset; readonly includeSafeGutter?: boolean;
  readonly includeDetectionSnaps?: boolean; readonly highlightTopBalloonSlot?: boolean;
}

const PHI_INV = 0.6180339887498949;
const PHI_COMP = 1 - PHI_INV;
const OVERLAY_COLORS = {
  ruleOfThirds: { r: 0.14, g: 0.56, b: 0.88, a: 0.72 },
  goldenRatio: { r: 0.78, g: 0.54, b: 0.14, a: 0.68 },
  safeGutter: { r: 0.12, g: 0.44, b: 0.33, a: 0.78 },
  faceSnap: { r: 0.92, g: 0.34, b: 0.42, a: 0.85 },
  balloonFill: { r: 0.12, g: 0.44, b: 0.33, a: 0.14 },
  balloonStroke: { r: 0.12, g: 0.44, b: 0.33, a: 0.92 },
} as const;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function rectIntersectionArea(a: CompositionRect, b: CompositionRect): number {
  const x0 = Math.max(a.x, b.x); const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width); const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? (x1 - x0) * (y1 - y0) : 0;
}

export function rectIoU(a: CompositionRect, b: CompositionRect): number {
  const inter = rectIntersectionArea(a, b);
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** WebNN(`navigator.ml`) NPU/GPU/CPU 컨텍스트 가용성을 비파괴적으로 프로빙한다. */
export async function probeWebNnCompositionProvider(env?: WebNnCompositionProbeEnv): Promise<WebNnCompositionProviderReport> {
  const globalNav = typeof navigator !== "undefined" ? (navigator as unknown as { readonly ml?: WebNnNavigatorMlLike }) : null;
  const ml = env?.navigatorMl !== undefined ? env.navigatorMl : globalNav?.ml ?? null;
  const hasModelExecutor = Boolean(env?.webNnExecutor);
  const availableDeviceTypes: ("npu" | "gpu" | "cpu")[] = [];

  if (ml && typeof ml.createContext === "function") {
    for (const deviceType of ["npu", "gpu", "cpu"] as const) {
      try {
        const ctx = await ml.createContext({ deviceType });
        if (ctx !== null && ctx !== undefined) availableDeviceTypes.push(deviceType);
      } catch {
        // 해당 프로바이더 미지원 시 다음 계층으로 안전 폴백
      }
    }
  }

  let selectedProvider: CompositionProviderKind = "offline-integral-hog-cc";
  if (availableDeviceTypes.length > 0 && hasModelExecutor) {
    const first = availableDeviceTypes[0]!;
    selectedProvider = first === "npu" ? "webnn-npu" : first === "gpu" ? "webnn-gpu" : "webnn-cpu";
  }

  const summaryKo =
    selectedProvider !== "offline-integral-hog-cc"
      ? `WebNN(${selectedProvider}) 가속 검출기로 구도·객체를 분석합니다.`
      : availableDeviceTypes.length > 0
        ? `WebNN(${availableDeviceTypes.join("/")}) 감지됨 — 모델 미연결로 오프라인 적분·HOG·연결요소 검출기를 사용합니다.`
        : "WebNN 미지원 환경 — 오프라인 적분 이미지·HOG·연결요소 검출기로 무서버 분석합니다.";

  return { webNnSupported: availableDeviceTypes.length > 0, availableDeviceTypes, selectedProvider, hasModelExecutor, serverCostKrw: 0, summaryKo };
}

// ---------------------------------------------------------------------------
// 오프라인 적분 이미지(SAT) + 4-방향 HOG + BFS 연결요소 검출기
// ---------------------------------------------------------------------------

interface WorkingFeaturePlanes {
  readonly gw: number; readonly gh: number; readonly scaleX: number; readonly scaleY: number;
  readonly luma: Float32Array; readonly skinMask: Uint8Array; readonly inkMask: Uint8Array; readonly fgMask: Uint8Array;
  readonly satLuma: Float64Array; readonly satSkin: Float64Array; readonly satEdge: Float64Array;
  readonly satHog: readonly Float64Array[];
}

interface GridComponent { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number; readonly pixelCount: number; }

function buildSat(src: Uint8Array | Float32Array, w: number, h: number): Float64Array {
  const stride = w + 1;
  const sat = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    const ro = y * w; const dst = (y + 1) * stride; const prev = y * stride;
    for (let x = 0; x < w; x += 1) {
      rowSum += src[ro + x] ?? 0;
      sat[dst + x + 1] = sat[prev + x + 1]! + rowSum;
    }
  }
  return sat;
}

function querySat(sat: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const stride = w + 1;
  const h = Math.floor(sat.length / stride) - 1;
  const cx0 = clamp(Math.floor(x0), 0, w); const cy0 = clamp(Math.floor(y0), 0, h);
  const cx1 = clamp(Math.ceil(x1), cx0, w); const cy1 = clamp(Math.ceil(y1), cy0, h);
  return (sat[cy1 * stride + cx1] ?? 0) - (sat[cy0 * stride + cx1] ?? 0) - (sat[cy1 * stride + cx0] ?? 0) + (sat[cy0 * stride + cx0] ?? 0);
}

function isWarmSkinPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 180) return false;
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return (y >= 75 && cb >= 78 && cb <= 128 && cr >= 133 && cr <= 176 && r > g && g >= b - 6) ||
    (r >= 200 && g >= 145 && b >= 115 && r - b >= 20 && r - g >= 10 && r - g <= 78);
}

function extractWorkingFeaturePlanes(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, maxSide: number): WorkingFeaturePlanes {
  const safeW = Math.max(1, Math.round(width)); const safeH = Math.max(1, Math.round(height));
  const scale = Math.max(safeW, safeH) > maxSide ? maxSide / Math.max(safeW, safeH) : 1;
  const gw = Math.max(8, Math.round(safeW * scale)); const gh = Math.max(8, Math.round(safeH * scale));
  const scaleX = safeW / gw; const scaleY = safeH / gh;
  const count = gw * gh;

  const rBuf = new Uint8Array(count); const gBuf = new Uint8Array(count); const bBuf = new Uint8Array(count);
  const luma = new Float32Array(count); const skinRaw = new Uint8Array(count); const inkMask = new Uint8Array(count);

  for (let y = 0; y < gh; y += 1) {
    const sy = Math.min(safeH - 1, Math.floor((y + 0.5) * scaleY));
    for (let x = 0; x < gw; x += 1) {
      const sx = Math.min(safeW - 1, Math.floor((x + 0.5) * scaleX));
      const o = (sy * safeW + sx) * 4;
      const a = rgba[o + 3] ?? 255;
      const alpha = a / 255;
      const er = Math.round((rgba[o] ?? 255) * alpha + 255 * (1 - alpha));
      const eg = Math.round((rgba[o + 1] ?? 255) * alpha + 255 * (1 - alpha));
      const eb = Math.round((rgba[o + 2] ?? 255) * alpha + 255 * (1 - alpha));
      const idx = y * gw + x;
      rBuf[idx] = er; gBuf[idx] = eg; bBuf[idx] = eb;
      const lum = 0.299 * er + 0.587 * eg + 0.114 * eb;
      luma[idx] = lum;
      skinRaw[idx] = isWarmSkinPixel(er, eg, eb, a) ? 1 : 0;
      inkMask[idx] = lum < 98 ? 1 : 0;
    }
  }

  let bgR = 0; let bgG = 0; let bgB = 0; let bgCount = 0;
  const accBg = (idx: number): void => { bgR += rBuf[idx]!; bgG += gBuf[idx]!; bgB += bBuf[idx]!; bgCount += 1; };
  for (let x = 0; x < gw; x += 1) { accBg(x); accBg((gh - 1) * gw + x); }
  for (let y = 1; y < gh - 1; y += 1) { accBg(y * gw); accBg(y * gw + gw - 1); }
  const meanBgR = bgR / Math.max(1, bgCount); const meanBgG = bgG / Math.max(1, bgCount); const meanBgB = bgB / Math.max(1, bgCount);

  const skinMask = new Uint8Array(count);
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const idx = y * gw + x;
      if (skinRaw[idx]) { skinMask[idx] = 1; continue; }
      const nearSkin = (x > 0 && skinRaw[idx - 1]) || (x + 1 < gw && skinRaw[idx + 1]) || (y > 0 && skinRaw[idx - gw]) || (y + 1 < gh && skinRaw[idx + gw]);
      if (nearSkin && (inkMask[idx] === 0 || (x > 0 && x + 1 < gw && skinRaw[idx - 1] && skinRaw[idx + 1]))) skinMask[idx] = 1;
    }
  }

  const fgMask = new Uint8Array(count); const edgeMag = new Float32Array(count);
  const hog = [new Float32Array(count), new Float32Array(count), new Float32Array(count), new Float32Array(count)] as const;
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const idx = y * gw + x;
      const dist = Math.abs(rBuf[idx]! - meanBgR) + Math.abs(gBuf[idx]! - meanBgG) + Math.abs(bBuf[idx]! - meanBgB);
      const gx = (luma[y * gw + Math.min(gw - 1, x + 1)] ?? 0) - (luma[y * gw + Math.max(0, x - 1)] ?? 0);
      const gy = (luma[Math.min(gh - 1, y + 1) * gw + x] ?? 0) - (luma[Math.max(0, y - 1) * gw + x] ?? 0);
      const mag = Math.min(1, Math.hypot(gx, gy) / 255);
      edgeMag[idx] = mag;
      if (mag > 0.04) {
        let ang = Math.atan2(gy, gx);
        if (ang < 0) ang += Math.PI;
        hog[Math.min(3, Math.floor((ang / Math.PI) * 4))]![idx] = mag;
      }
      if (dist > 34 || inkMask[idx] === 1 || skinRaw[idx] === 1) fgMask[idx] = 1;
    }
  }

  return {
    gw, gh, scaleX, scaleY, luma, skinMask, inkMask, fgMask,
    satLuma: buildSat(luma, gw, gh), satSkin: buildSat(skinRaw, gw, gh), satEdge: buildSat(edgeMag, gw, gh),
    satHog: [buildSat(hog[0], gw, gh), buildSat(hog[1], gw, gh), buildSat(hog[2], gw, gh), buildSat(hog[3], gw, gh)],
  };
}

function labelConnectedComponents(mask: Uint8Array, w: number, h: number, minPixels: number): GridComponent[] {
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const out: GridComponent[] = [];
  for (let i = 0; i < w * h; i += 1) {
    if (mask[i] === 0 || visited[i] === 1) continue;
    let head = 0; let tail = 0;
    queue[tail++] = i; visited[i] = 1;
    let minX = w; let minY = h; let maxX = 0; let maxY = 0; let pixels = 0;
    while (head < tail) {
      const cur = queue[head++]!;
      const cx = cur % w; const cy = (cur - cx) / w;
      pixels += 1;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      if (cx > 0 && mask[cur - 1] === 1 && visited[cur - 1] === 0) { visited[cur - 1] = 1; queue[tail++] = cur - 1; }
      if (cx + 1 < w && mask[cur + 1] === 1 && visited[cur + 1] === 0) { visited[cur + 1] = 1; queue[tail++] = cur + 1; }
      if (cy > 0 && mask[cur - w] === 1 && visited[cur - w] === 0) { visited[cur - w] = 1; queue[tail++] = cur - w; }
      if (cy + 1 < h && mask[cur + w] === 1 && visited[cur + w] === 0) { visited[cur + w] = 1; queue[tail++] = cur + w; }
    }
    if (pixels >= minPixels) out.push({ minX, minY, maxX, maxY, pixelCount: pixels });
  }
  return out;
}

function computeBilateralHogSymmetry(planes: WorkingFeaturePlanes, x0: number, y0: number, x1: number, y1: number): number {
  const midX = Math.floor((x0 + x1) * 0.5);
  if (midX <= x0 || midX >= x1 || y1 <= y0) return 0.5;
  let diffSum = 0; let totalSum = 0;
  for (let b = 0; b < 4; b += 1) {
    const lv = querySat(planes.satHog[b]!, planes.gw, x0, y0, midX, y1);
    const rv = querySat(planes.satHog[b]!, planes.gw, midX, y0, x1, y1);
    diffSum += Math.abs(lv - rv); totalSum += lv + rv;
  }
  return totalSum <= 1e-6 ? 0.5 : clamp(1 - diffSum / totalSum, 0, 1);
}

function applyClassNms(items: readonly DetectedCompositionObject[], iouThreshold: number): DetectedCompositionObject[] {
  const sorted = [...items].sort((a, b) => b.confidence - a.confidence);
  const kept: DetectedCompositionObject[] = [];
  for (const cand of sorted) {
    if (!kept.some((prev) => prev.kind === cand.kind && rectIoU(prev.rect, cand.rect) > iouThreshold)) kept.push(cand);
  }
  return kept;
}

function runOfflineIntegralHogDetector(planes: WorkingFeaturePlanes): DetectedCompositionObject[] {
  const { gw, gh, scaleX, scaleY, luma, inkMask, skinMask, fgMask } = planes;
  const totalPixels = gw * gh;
  const detections: DetectedCompositionObject[] = [];

  const toDocRect = (x0: number, y0: number, x1: number, y1: number): CompositionRect => ({
    x: Math.round(x0 * scaleX), y: Math.round(y0 * scaleY),
    width: Math.max(1, Math.round((x1 - x0 + 1) * scaleX)), height: Math.max(1, Math.round((y1 - y0 + 1) * scaleY)),
  });
  const buildFeatures = (x0: number, y0: number, x1: number, y1: number): DetectedObjectFeatures => {
    const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
    return {
      symmetryScore: computeBilateralHogSymmetry(planes, x0, y0, x1 + 1, y1 + 1),
      edgeDensity: querySat(planes.satEdge, gw, x0, y0, x1 + 1, y1 + 1) / area,
      meanLuma: querySat(planes.satLuma, gw, x0, y0, x1 + 1, y1 + 1) / area,
      skinRatio: querySat(planes.satSkin, gw, x0, y0, x1 + 1, y1 + 1) / area,
    };
  };

  // 1) 경계 BFS로 닫힌 밝은 말풍선 내부 영역 추출
  const exterior = new Uint8Array(totalPixels);
  const q = new Int32Array(totalPixels);
  let head = 0; let tail = 0;
  const pushExt = (idx: number): void => {
    if (exterior[idx] === 0 && inkMask[idx] === 0) { exterior[idx] = 1; q[tail++] = idx; }
  };
  for (let x = 0; x < gw; x += 1) { pushExt(x); pushExt((gh - 1) * gw + x); }
  for (let y = 1; y < gh - 1; y += 1) { pushExt(y * gw); pushExt(y * gw + gw - 1); }
  while (head < tail) {
    const cur = q[head++]!;
    const cx = cur % gw; const cy = (cur - cx) / gw;
    if (cx > 0) pushExt(cur - 1);
    if (cx + 1 < gw) pushExt(cur + 1);
    if (cy > 0) pushExt(cur - gw);
    if (cy + 1 < gh) pushExt(cur + gw);
  }

  const enclosedBright = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i += 1) if (exterior[i] === 0 && (luma[i] ?? 0) >= 205 && skinMask[i] === 0) enclosedBright[i] = 1;

  const balloonMaskGrid = new Uint8Array(totalPixels);
  for (const comp of labelConnectedComponents(enclosedBright, gw, gh, Math.max(16, Math.floor(totalPixels * 0.008)))) {
    const bboxArea = (comp.maxX - comp.minX + 1) * (comp.maxY - comp.minY + 1);
    const areaRatio = bboxArea / totalPixels;
    const fillRatio = comp.pixelCount / Math.max(1, bboxArea);
    if (areaRatio < 0.008 || areaRatio > 0.45 || fillRatio < 0.45) continue;
    const bx0 = Math.max(0, comp.minX - 2); const by0 = Math.max(0, comp.minY - 2);
    const bx1 = Math.min(gw - 1, comp.maxX + 2); const by1 = Math.min(gh - 1, comp.maxY + 2);
    const feats = buildFeatures(bx0, by0, bx1, by1);
    if (feats.skinRatio > 0.15 || feats.meanLuma < 175) continue;
    for (let y = by0; y <= by1; y += 1) for (let x = bx0; x <= bx1; x += 1) balloonMaskGrid[y * gw + x] = 1;

    detections.push({
      id: `balloon-${detections.length + 1}`, kind: "speech-balloon", rect: toDocRect(bx0, by0, bx1, by1),
      confidence: clamp(0.58 + fillRatio * 0.25 + (feats.meanLuma / 255) * 0.15, 0, 0.98),
      source: "offline-integral-hog-cc", features: feats,
    });

    let tMinX = gw; let tMinY = gh; let tMaxX = -1; let tMaxY = -1; let textInk = 0;
    for (let y = Math.min(comp.maxY, comp.minY + 2); y <= Math.max(comp.minY, comp.maxY - 2); y += 1) {
      for (let x = Math.min(comp.maxX, comp.minX + 2); x <= Math.max(comp.minX, comp.maxX - 2); x += 1) {
        if (inkMask[y * gw + x] === 1) {
          textInk += 1;
          if (x < tMinX) tMinX = x; if (x > tMaxX) tMaxX = x;
          if (y < tMinY) tMinY = y; if (y > tMaxY) tMaxY = y;
        }
      }
    }
    if (textInk >= 4 && tMaxX >= tMinX && tMaxY >= tMinY) {
      detections.push({
        id: `text-${detections.length + 1}`, kind: "text-block", rect: toDocRect(tMinX, tMinY, tMaxX, tMaxY),
        confidence: clamp(0.62 + Math.min(0.32, (textInk / Math.max(1, bboxArea)) * 2.4), 0, 0.96),
        source: "offline-integral-hog-cc", features: buildFeatures(tMinX, tMinY, tMaxX, tMaxY),
      });
    }
  }

  // 2) 얼굴(피부색 클러스터 + 양측 HOG 대칭성 + 타원 종횡비)
  for (const comp of labelConnectedComponents(skinMask, gw, gh, Math.max(12, Math.floor(totalPixels * 0.004)))) {
    const fw = comp.maxX - comp.minX + 1; const fh = comp.maxY - comp.minY + 1;
    const aspect = fw / Math.max(1, fh); const areaRatio = (fw * fh) / totalPixels;
    if (areaRatio < 0.004 || areaRatio > 0.35 || aspect < 0.45 || aspect > 1.85 || comp.pixelCount / Math.max(1, fw * fh) < 0.42) continue;
    const feats = buildFeatures(comp.minX, comp.minY, comp.maxX, comp.maxY);
    detections.push({
      id: `face-${detections.length + 1}`, kind: "face", rect: toDocRect(comp.minX, comp.minY, comp.maxX, comp.maxY),
      confidence: clamp(0.45 + feats.symmetryScore * 0.25 + Math.min(0.25, feats.skinRatio * 0.32), 0, 0.97),
      source: "offline-integral-hog-cc", features: feats,
    });
  }

  // 3) 캐릭터 실루엣(말풍선 제외 전경 연결요소)
  const charMask = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i += 1) if (fgMask[i] === 1 && balloonMaskGrid[i] === 0) charMask[i] = 1;
  for (const comp of labelConnectedComponents(charMask, gw, gh, Math.max(36, Math.floor(totalPixels * 0.02)))) {
    const areaRatio = ((comp.maxX - comp.minX + 1) * (comp.maxY - comp.minY + 1)) / totalPixels;
    if (areaRatio < 0.02) continue;
    const feats = buildFeatures(comp.minX, comp.minY, comp.maxX, comp.maxY);
    detections.push({
      id: `character-${detections.length + 1}`, kind: "character", rect: toDocRect(comp.minX, comp.minY, comp.maxX, comp.maxY),
      confidence: clamp(0.52 + Math.min(0.24, areaRatio * 0.8) + Math.min(0.2, feats.edgeDensity * 1.2), 0, 0.96),
      source: "offline-integral-hog-cc", features: feats,
    });
  }

  return applyClassNms(detections, 0.45);
}

// ---------------------------------------------------------------------------
// 비파괴 구도 가이드 · 말풍선 충돌 회피 슬롯 · Vello Phase1 어댑터 출력
// ---------------------------------------------------------------------------

const expandRect = (r: CompositionRect, pad: number): CompositionRect => ({
  x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2,
});

function classifyReadingZone(rect: CompositionRect, panel: CompositionRect): SafeBalloonSlot["readingZone"] {
  const cx = (rect.x + rect.width * 0.5 - panel.x) / Math.max(1, panel.width);
  const cy = (rect.y + rect.height * 0.5 - panel.y) / Math.max(1, panel.height);
  if (cy <= 0.45) return cx < 0.36 ? "upper-left" : cx > 0.64 ? "upper-right" : "upper-center";
  return cy >= 0.72 ? "lower" : "side-gutter";
}

function findSafeBalloonSlots(
  panel: CompositionRect,
  safeGutter: CompositionRect,
  planes: WorkingFeaturePlanes,
  faces: readonly DetectedCompositionObject[],
  characters: readonly DetectedCompositionObject[],
  existingBalloons: readonly CompositionRect[],
  options: { readonly desiredWidthRatio: number; readonly desiredHeightRatio: number; readonly maxSlots: number },
): SafeBalloonSlot[] {
  const slotW = Math.max(24, Math.round(safeGutter.width * clamp(options.desiredWidthRatio, 0.14, 0.55)));
  const slotH = Math.max(18, Math.round(safeGutter.height * clamp(options.desiredHeightRatio, 0.1, 0.4)));
  const maxX = safeGutter.x + safeGutter.width - slotW;
  const maxY = safeGutter.y + safeGutter.height - slotH;
  if (maxX < safeGutter.x || maxY < safeGutter.y) return [];

  const guardedFaces = faces.map((f) => expandRect(f.rect, Math.max(4, Math.round(Math.min(panel.width, panel.height) * 0.015))));
  const guardedBalloons = existingBalloons.map((b) => expandRect(b, Math.max(4, Math.round(Math.min(panel.width, panel.height) * 0.012))));
  const primarySpeaker = faces[0]?.rect ?? characters[0]?.rect ?? null;
  const tailTarget: CompositionPoint | null = primarySpeaker
    ? { x: primarySpeaker.x + primarySpeaker.width * 0.5, y: primarySpeaker.y + primarySpeaker.height * 0.45 }
    : null;

  const stepX = Math.max(8, Math.round(safeGutter.width * 0.05));
  const stepY = Math.max(8, Math.round(safeGutter.height * 0.05));
  const candidates: SafeBalloonSlot[] = [];

  for (let y = safeGutter.y; y <= maxY; y += stepY) {
    for (let x = safeGutter.x; x <= maxX; x += stepX) {
      const rect: CompositionRect = { x, y, width: slotW, height: slotH };
      if (guardedFaces.some((gf) => rectIntersectionArea(rect, gf) > 0)) continue;
      if (guardedBalloons.some((gb) => rectIntersectionArea(rect, gb) > 0)) continue;

      let charOverlap = 0;
      for (const ch of characters) charOverlap += rectIntersectionArea(rect, ch.rect);
      const gx0 = x / planes.scaleX; const gy0 = y / planes.scaleY;
      const gx1 = (x + slotW) / planes.scaleX; const gy1 = (y + slotH) / planes.scaleY;
      const clutter = clamp(querySat(planes.satEdge, planes.gw, gx0, gy0, gx1, gy1) / Math.max(1, (gx1 - gx0) * (gy1 - gy0)), 0, 1);
      const relY = (y - panel.y) / Math.max(1, panel.height);
      const readingBonus = relY <= 0.42 ? 0.18 : relY <= 0.65 ? 0.08 : 0.02;
      let speakerProx = 0.1;
      if (tailTarget) {
        const nd = Math.hypot(x + slotW * 0.5 - tailTarget.x, y + slotH * 0.5 - tailTarget.y) / Math.max(1, Math.hypot(panel.width, panel.height));
        speakerProx = clamp(0.18 - Math.abs(nd - 0.32) * 0.35, 0, 0.18);
      }

      candidates.push({
        id: `slot-${x}-${y}`, rank: 0, rect, overlapWithFaces: 0, overlapWithExistingBalloons: 0,
        overlapWithCharacters: charOverlap, visualClutterScore: clutter,
        score: clamp(1 - clutter * 0.55 - (charOverlap / Math.max(1, slotW * slotH)) * 0.45 + readingBonus + speakerProx, 0, 1.4),
        readingZone: classifyReadingZone(rect, panel), tailTarget,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected: SafeBalloonSlot[] = [];
  for (const cand of candidates) {
    if (selected.some((prev) => rectIoU(prev.rect, cand.rect) > 0.22)) continue;
    selected.push({ ...cand, rank: selected.length + 1, id: `safe-balloon-slot-${selected.length + 1}` });
    if (selected.length >= options.maxSlots) break;
  }
  return selected;
}

/** RGBA8 패널에서 객체·얼굴·말풍선을 검출하고 비파괴 구도 가이드 및 충돌 회피 말풍선 슬롯을 산출한다. */
export async function analyzePanelComposition(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: CompositionAnalysisOptions,
): Promise<CompositionAnalysisResult> {
  const safeW = Math.max(1, Math.round(width)); const safeH = Math.max(1, Math.round(height));
  const panelRect: CompositionRect = options?.panelRect ?? { x: 0, y: 0, width: safeW, height: safeH };
  const marginRatio = clamp(options?.safeMarginRatio ?? 0.05, 0, 0.2);
  const mx = Math.round(panelRect.width * marginRatio); const my = Math.round(panelRect.height * marginRatio);
  const safeGutterRect: CompositionRect = { x: panelRect.x + mx, y: panelRect.y + my, width: Math.max(1, panelRect.width - mx * 2), height: Math.max(1, panelRect.height - my * 2) };

  const providerReport = await probeWebNnCompositionProvider(options?.env);
  const planes = extractWorkingFeaturePlanes(rgba, safeW, safeH, clamp(options?.workingMaxSide ?? 160, 48, 320));
  const detections =
    providerReport.selectedProvider !== "offline-integral-hog-cc" && options?.env?.webNnExecutor
      ? await options.env.webNnExecutor.detect({
          rgba, width: safeW, height: safeH,
          deviceType: providerReport.selectedProvider === "webnn-npu" ? "npu" : providerReport.selectedProvider === "webnn-gpu" ? "gpu" : "cpu",
        })
      : runOfflineIntegralHogDetector(planes);

  const faces = detections.filter((d) => d.kind === "face");
  const characters = detections.filter((d) => d.kind === "character");
  const speechBalloons = detections.filter((d) => d.kind === "speech-balloon");
  const textBlocks = detections.filter((d) => d.kind === "text-block");

  const ruleOfThirdsAnchors: CompositionAnchorPoint[] = [
    { id: "rot-nw", preset: "rule-of-thirds", point: { x: panelRect.x + panelRect.width / 3, y: panelRect.y + panelRect.height / 3 } },
    { id: "rot-ne", preset: "rule-of-thirds", point: { x: panelRect.x + (panelRect.width * 2) / 3, y: panelRect.y + panelRect.height / 3 } },
    { id: "rot-sw", preset: "rule-of-thirds", point: { x: panelRect.x + panelRect.width / 3, y: panelRect.y + (panelRect.height * 2) / 3 } },
    { id: "rot-se", preset: "rule-of-thirds", point: { x: panelRect.x + (panelRect.width * 2) / 3, y: panelRect.y + (panelRect.height * 2) / 3 } },
  ];
  const goldenRatioAnchors: CompositionAnchorPoint[] = [
    { id: "phi-nw", preset: "golden-ratio", point: { x: panelRect.x + panelRect.width * PHI_COMP, y: panelRect.y + panelRect.height * PHI_COMP } },
    { id: "phi-ne", preset: "golden-ratio", point: { x: panelRect.x + panelRect.width * PHI_INV, y: panelRect.y + panelRect.height * PHI_COMP } },
    { id: "phi-sw", preset: "golden-ratio", point: { x: panelRect.x + panelRect.width * PHI_COMP, y: panelRect.y + panelRect.height * PHI_INV } },
    { id: "phi-se", preset: "golden-ratio", point: { x: panelRect.x + panelRect.width * PHI_INV, y: panelRect.y + panelRect.height * PHI_INV } },
  ];

  const primaryObj = faces[0] ?? characters[0] ?? null;
  const primaryFocalPoint: CompositionPoint | null = primaryObj
    ? { x: primaryObj.rect.x + primaryObj.rect.width * 0.5, y: primaryObj.rect.y + primaryObj.rect.height * 0.5 }
    : null;
  let focalHarmonyScore = 50;
  if (primaryFocalPoint) {
    const diag = Math.max(1, Math.hypot(panelRect.width, panelRect.height));
    let minNd = 1;
    for (const a of [...ruleOfThirdsAnchors, ...goldenRatioAnchors]) {
      minNd = Math.min(minNd, Math.hypot(primaryFocalPoint.x - a.point.x, primaryFocalPoint.y - a.point.y) / diag);
    }
    focalHarmonyScore = Math.round(clamp((1 - minNd * 2.4) * 100, 15, 100));
  }

  const safeBalloonSlots = findSafeBalloonSlots(
    panelRect, safeGutterRect, planes, faces, characters,
    [...speechBalloons.map((b) => b.rect), ...(options?.existingBalloons ?? [])],
    { desiredWidthRatio: options?.desiredBalloonWidthRatio ?? 0.28, desiredHeightRatio: options?.desiredBalloonHeightRatio ?? 0.17, maxSlots: Math.max(1, options?.maxSafeBalloonSlots ?? 4) },
  );

  return {
    width: safeW, height: safeH, panelRect, providerReport, detections, faces, characters, speechBalloons, textBlocks,
    ruleOfThirdsAnchors, goldenRatioAnchors, safeGutterRect, safeBalloonSlots, focalHarmonyScore, primaryFocalPoint,
  };
}

/** 구도 분석 결과를 `studio-vello-phase1-overlay-adapter` 입력(`StudioVelloPhase1OverlayState`)으로 변환한다. */
export function buildCompositionOverlayState(
  analysis: CompositionAnalysisResult,
  options?: BuildCompositionOverlayOptions,
): StudioVelloPhase1OverlayState {
  const preset = options?.guidePreset ?? "both";
  const guides: StudioVelloGuideLine[] = [];
  const snapLines: StudioVelloSnapLine[] = [];
  const { panelRect: p, safeGutterRect: g } = analysis;

  if (preset === "rule-of-thirds" || preset === "both") {
    guides.push(
      { id: "comp-rot-x1", axis: "x", position: p.x + p.width / 3, kind: "user", color: OVERLAY_COLORS.ruleOfThirds, locked: true },
      { id: "comp-rot-x2", axis: "x", position: p.x + (p.width * 2) / 3, kind: "user", color: OVERLAY_COLORS.ruleOfThirds, locked: true },
      { id: "comp-rot-y1", axis: "y", position: p.y + p.height / 3, kind: "user", color: OVERLAY_COLORS.ruleOfThirds, locked: true },
      { id: "comp-rot-y2", axis: "y", position: p.y + (p.height * 2) / 3, kind: "user", color: OVERLAY_COLORS.ruleOfThirds, locked: true },
    );
  }
  if (preset === "golden-ratio" || preset === "both") {
    guides.push(
      { id: "comp-phi-x1", axis: "x", position: p.x + p.width * PHI_COMP, kind: "margin", color: OVERLAY_COLORS.goldenRatio, locked: true },
      { id: "comp-phi-x2", axis: "x", position: p.x + p.width * PHI_INV, kind: "margin", color: OVERLAY_COLORS.goldenRatio, locked: true },
      { id: "comp-phi-y1", axis: "y", position: p.y + p.height * PHI_COMP, kind: "margin", color: OVERLAY_COLORS.goldenRatio, locked: true },
      { id: "comp-phi-y2", axis: "y", position: p.y + p.height * PHI_INV, kind: "margin", color: OVERLAY_COLORS.goldenRatio, locked: true },
    );
  }
  if (options?.includeSafeGutter !== false) {
    guides.push(
      { id: "comp-gutter-left", axis: "x", position: g.x, kind: "safe-area", color: OVERLAY_COLORS.safeGutter, locked: true },
      { id: "comp-gutter-right", axis: "x", position: g.x + g.width, kind: "safe-area", color: OVERLAY_COLORS.safeGutter, locked: true },
      { id: "comp-gutter-top", axis: "y", position: g.y, kind: "gutter", color: OVERLAY_COLORS.safeGutter, locked: true },
      { id: "comp-gutter-bottom", axis: "y", position: g.y + g.height, kind: "gutter", color: OVERLAY_COLORS.safeGutter, locked: true },
    );
  }
  if (options?.includeDetectionSnaps !== false) {
    for (const face of analysis.faces) {
      snapLines.push(
        { id: `snap-${face.id}-cx`, axis: "x", position: face.rect.x + face.rect.width * 0.5, start: face.rect.y, end: face.rect.y + face.rect.height, color: OVERLAY_COLORS.faceSnap },
        { id: `snap-${face.id}-cy`, axis: "y", position: face.rect.y + face.rect.height * 0.5, start: face.rect.x, end: face.rect.x + face.rect.width, color: OVERLAY_COLORS.faceSnap },
      );
    }
  }
  const topSlot = options?.highlightTopBalloonSlot !== false ? analysis.safeBalloonSlots[0] ?? null : null;
  const marqueeRect: StudioVelloMarqueeRect | null = topSlot
    ? { x: topSlot.rect.x, y: topSlot.rect.y, width: topSlot.rect.width, height: topSlot.rect.height, fillColor: OVERLAY_COLORS.balloonFill, strokeColor: OVERLAY_COLORS.balloonStroke, dashed: true }
    : null;
  return { guides, snapLines, marqueeRect };
}
