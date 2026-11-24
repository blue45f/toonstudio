/**
 * Wave 39C — 엔진 1·2: 비파괴 3층 채색 리라이트 & 컷 밖 돌파 마스킹(Out-of-Panel Breakout).
 *
 * - 알베도(밑색) · 그림자(Shadow) · 반사광/키라이트(Bounce/Key) RGBA 버퍼를 선형 색공간에서 비파괴 합성해
 *   정오·노을·네온·달빛·실내등 5종 프리셋으로 1클릭 재조명하고 sRGB [0, 255]로 안전 클램프한다.
 * - 칼날·머리카락·효과음 레이어의 `breakoutEnabled` 플래그와 오버플로 바운딩 영역으로 수동 지우개 없는
 *   컷 돌파 안전 클립 마스크(SVG 경로 + 클립 사각형)를 계산한다.
 */

export type RelightPresetId = "noon" | "sunset" | "neon" | "moonlight" | "indoor";

export interface RelightPresetSpec {
  readonly id: RelightPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly kelvin: number;
  readonly albedoTint: readonly [number, number, number];
  readonly shadowTint: readonly [number, number, number];
  readonly shadowDepth: number;
  readonly keyColor: readonly [number, number, number];
  readonly keyIntensity: number;
  readonly bounceColor: readonly [number, number, number];
  readonly bounceIntensity: number;
  readonly ambientFloor: number;
  readonly exposure: number;
  readonly previewOklch: string;
}

export interface ThreeLayerColorBuffers {
  readonly width: number;
  readonly height: number;
  readonly albedo: Uint8ClampedArray;
  readonly shadow: Uint8ClampedArray;
  readonly bounceKey: Uint8ClampedArray;
}

export interface RelightOverrides {
  readonly shadowStrength?: number;
  readonly keyGain?: number;
  readonly bounceGain?: number;
  readonly exposureBias?: number;
}

export interface RelightCompositeMetrics {
  readonly pixelCount: number;
  readonly opaquePixelCount: number;
  readonly meanLuminance: number;
  readonly highlightClippedPct: number;
  readonly shadowCrushedPct: number;
  readonly dynamicRangeStops: number;
  readonly dominantOklch: string;
}

export interface RelightCompositeResult {
  readonly presetId: RelightPresetId;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly metrics: RelightCompositeMetrics;
}

export const RELIGHT_PRESETS: readonly RelightPresetSpec[] = [
  {
    id: "noon",
    labelKo: "정오",
    labelEn: "Noon Daylight",
    descriptionKo: "선명한 5600K 주광과 청명한 하늘 반사광으로 깔끔한 연재 기준 톤을 유지합니다.",
    descriptionEn: "Crisp 5600K daylight with clean sky bounce for standard daytime panels.",
    kelvin: 5600,
    albedoTint: [1.0, 1.0, 1.0],
    shadowTint: [0.46, 0.54, 0.72],
    shadowDepth: 0.72,
    keyColor: [1.0, 0.98, 0.93],
    keyIntensity: 0.42,
    bounceColor: [0.58, 0.78, 1.0],
    bounceIntensity: 0.24,
    ambientFloor: 0.03,
    exposure: 1.04,
    previewOklch: "oklch(0.84 0.09 86)",
  },
  {
    id: "sunset",
    labelKo: "노을",
    labelEn: "Golden Sunset",
    descriptionKo: "3100K 주홍 키라이트와 보랏빛 그림자로 감정선이 깊은 황혼 컷을 연출합니다.",
    descriptionEn: "Warm 3100K amber key light with violet shadow fill for dramatic twilight scenes.",
    kelvin: 3100,
    albedoTint: [1.06, 0.92, 0.82],
    shadowTint: [0.42, 0.31, 0.56],
    shadowDepth: 0.82,
    keyColor: [1.0, 0.56, 0.22],
    keyIntensity: 0.68,
    bounceColor: [0.92, 0.48, 0.62],
    bounceIntensity: 0.32,
    ambientFloor: 0.025,
    exposure: 1.02,
    previewOklch: "oklch(0.71 0.17 44)",
  },
  {
    id: "neon",
    labelKo: "네온",
    labelEn: "Cyber Neon",
    descriptionKo: "시안·마젠타 이중 림라이트와 깊은 남색 그림자로 야간 도심 액션감을 살립니다.",
    descriptionEn: "Dual cyan/magenta rim lights over deep indigo shadows for night urban action.",
    kelvin: 7800,
    albedoTint: [0.86, 0.9, 1.04],
    shadowTint: [0.18, 0.16, 0.38],
    shadowDepth: 0.88,
    keyColor: [0.18, 0.92, 1.0],
    keyIntensity: 0.78,
    bounceColor: [1.0, 0.24, 0.78],
    bounceIntensity: 0.64,
    ambientFloor: 0.02,
    exposure: 0.96,
    previewOklch: "oklch(0.68 0.21 322)",
  },
  {
    id: "moonlight",
    labelKo: "달빛",
    labelEn: "Silver Moonlight",
    descriptionKo: "9200K 은청색 역광과 낮은 채도의 야간 그림자로 고요한 긴장감을 형성합니다.",
    descriptionEn: "Cool 9200K silver-blue rim light and desaturated night shadows for suspense.",
    kelvin: 9200,
    albedoTint: [0.76, 0.84, 1.02],
    shadowTint: [0.16, 0.24, 0.42],
    shadowDepth: 0.86,
    keyColor: [0.64, 0.82, 1.0],
    keyIntensity: 0.56,
    bounceColor: [0.42, 0.62, 0.92],
    bounceIntensity: 0.34,
    ambientFloor: 0.018,
    exposure: 0.84,
    previewOklch: "oklch(0.62 0.13 248)",
  },
  {
    id: "indoor",
    labelKo: "실내등",
    labelEn: "Warm Indoor Lamp",
    descriptionKo: "3800K 부드러운 텅스텐 실내등과 따뜻한 벽면 반사광으로 일상·대화 컷을 안정화합니다.",
    descriptionEn: "Soft 3800K tungsten indoor light with warm bounce for calm dialogue panels.",
    kelvin: 3800,
    albedoTint: [1.04, 0.98, 0.89],
    shadowTint: [0.44, 0.38, 0.34],
    shadowDepth: 0.68,
    keyColor: [1.0, 0.84, 0.62],
    keyIntensity: 0.5,
    bounceColor: [0.96, 0.82, 0.66],
    bounceIntensity: 0.3,
    ambientFloor: 0.038,
    exposure: 1.0,
    previewOklch: "oklch(0.78 0.11 72)",
  },
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** IEC 61966-2-1 sRGB 바이트(0..255)를 선형 광량(0..1)으로 변환한다. */
export function srgbByteToLinear(byteValue: number): number {
  const c = clamp01(byteValue / 255);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 선형 광량(0..1+)을 부드러운 롤오프 후 sRGB 바이트(0..255)로 클램프 인코딩한다. */
export function linearToSrgbByte(linearValue: number): number {
  const safe = Math.max(0, Number.isFinite(linearValue) ? linearValue : 0);
  // 하이라이트 급격한 클리핑을 줄이는 소프트 숄더 (0.90 이상 완만 압축)
  const shoulder = safe <= 0.9 ? safe : 0.9 + (0.1 * (safe - 0.9)) / (0.1 + (safe - 0.9));
  const clamped = clamp01(shoulder);
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(encoded * 255)));
}

/** 선형 sRGB(0..1) 3채널을 CSS `oklch(...)` 문자열로 변환한다. */
export function linearRgbToOklchString(r: number, g: number, b: number): string {
  const lr = clamp01(r);
  const lg = clamp01(g);
  const lb = clamp01(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const okL = clamp01(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s);
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.sqrt(okA * okA + okB * okB);
  let hue = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  return `oklch(${okL.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
}

export function getRelightPresetById(presetId: RelightPresetId): RelightPresetSpec {
  return RELIGHT_PRESETS.find((p) => p.id === presetId) ?? RELIGHT_PRESETS[0]!;
}

/**
 * 비파괴 3층 채색(밑색·그림자·반사광/키라이트) RGBA 버퍼를 프리셋 조명으로 1클릭 재합성한다.
 */
export function compositeThreeLayerRelight(
  buffers: ThreeLayerColorBuffers,
  presetId: RelightPresetId,
  overrides?: RelightOverrides,
): RelightCompositeResult {
  const width = Math.max(1, Math.floor(buffers.width));
  const height = Math.max(1, Math.floor(buffers.height));
  const pixelCount = width * height;
  const expectedBytes = pixelCount * 4;

  if (
    buffers.albedo.length < expectedBytes ||
    buffers.shadow.length < expectedBytes ||
    buffers.bounceKey.length < expectedBytes
  ) {
    throw new Error(
      `3층 리라이트 버퍼 길이가 해상도(${width}x${height})에 비해 부족합니다.`,
    );
  }

  const preset = getRelightPresetById(presetId);
  const shadowStrength = clampRange(overrides?.shadowStrength ?? 1, 0, 2);
  const keyGain = clampRange(overrides?.keyGain ?? 1, 0, 2);
  const bounceGain = clampRange(overrides?.bounceGain ?? 1, 0, 2);
  const exposureScale = preset.exposure * Math.pow(2, clampRange(overrides?.exposureBias ?? 0, -1.5, 1.5));

  const out = new Uint8ClampedArray(expectedBytes);

  let opaquePixelCount = 0;
  let lumSum = 0;
  let lumMin = 1;
  let lumMax = 0;
  let clippedCount = 0;
  let crushedCount = 0;
  let sumLinR = 0;
  let sumLinG = 0;
  let sumLinB = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    const alphaByte = buffers.albedo[idx + 3] ?? 0;
    if (alphaByte === 0) {
      out[idx] = 0;
      out[idx + 1] = 0;
      out[idx + 2] = 0;
      out[idx + 3] = 0;
      continue;
    }

    const aR = srgbByteToLinear(buffers.albedo[idx] ?? 0);
    const aG = srgbByteToLinear(buffers.albedo[idx + 1] ?? 0);
    const aB = srgbByteToLinear(buffers.albedo[idx + 2] ?? 0);

    // 그림자 레이어: 알파가 그림자 영역 마스크, 어두운 RGB일수록 그림자 밀도 증가
    const sAlpha = (buffers.shadow[idx + 3] ?? 0) / 255;
    const sLum =
      (0.2126 * (buffers.shadow[idx] ?? 0) +
        0.7152 * (buffers.shadow[idx + 1] ?? 0) +
        0.0722 * (buffers.shadow[idx + 2] ?? 0)) /
      255;
    const shadowCoverage = clamp01(sAlpha * (1 - sLum * 0.55) * preset.shadowDepth * shadowStrength);

    // 반사광·키라이트 레이어: R=키라이트 강도, G=반사/림라이트 강도, B=하이라이트 스페큘러, A=마스크
    const bkAlpha = (buffers.bounceKey[idx + 3] ?? 0) / 255;
    const keyW = ((buffers.bounceKey[idx] ?? 0) / 255) * bkAlpha * preset.keyIntensity * keyGain;
    const bounceW = ((buffers.bounceKey[idx + 1] ?? 0) / 255) * bkAlpha * preset.bounceIntensity * bounceGain;
    const specW = ((buffers.bounceKey[idx + 2] ?? 0) / 255) * bkAlpha * 0.45 * (0.5 * keyGain + 0.5 * bounceGain);

    const baseR = aR * preset.albedoTint[0];
    const baseG = aG * preset.albedoTint[1];
    const baseB = aB * preset.albedoTint[2];

    const shR = baseR * (1 - shadowCoverage) + (baseR * preset.shadowTint[0] + preset.ambientFloor * preset.shadowTint[0]) * shadowCoverage;
    const shG = baseG * (1 - shadowCoverage) + (baseG * preset.shadowTint[1] + preset.ambientFloor * preset.shadowTint[1]) * shadowCoverage;
    const shB = baseB * (1 - shadowCoverage) + (baseB * preset.shadowTint[2] + preset.ambientFloor * preset.shadowTint[2]) * shadowCoverage;

    const litR = (shR + baseR * preset.keyColor[0] * keyW + preset.bounceColor[0] * bounceW + preset.keyColor[0] * specW) * exposureScale;
    const litG = (shG + baseG * preset.keyColor[1] * keyW + preset.bounceColor[1] * bounceW + preset.keyColor[1] * specW) * exposureScale;
    const litB = (shB + baseB * preset.keyColor[2] * keyW + preset.bounceColor[2] * bounceW + preset.keyColor[2] * specW) * exposureScale;

    const rByte = linearToSrgbByte(litR);
    const gByte = linearToSrgbByte(litG);
    const bByte = linearToSrgbByte(litB);

    out[idx] = rByte;
    out[idx + 1] = gByte;
    out[idx + 2] = bByte;
    out[idx + 3] = alphaByte;

    opaquePixelCount += 1;
    const outLinR = srgbByteToLinear(rByte);
    const outLinG = srgbByteToLinear(gByte);
    const outLinB = srgbByteToLinear(bByte);
    sumLinR += outLinR;
    sumLinG += outLinG;
    sumLinB += outLinB;

    const lum = 0.2126 * outLinR + 0.7152 * outLinG + 0.0722 * outLinB;
    lumSum += lum;
    if (lum < lumMin) lumMin = lum;
    if (lum > lumMax) lumMax = lum;
    if (rByte >= 254 || gByte >= 254 || bByte >= 254) clippedCount += 1;
    if (rByte <= 10 && gByte <= 10 && bByte <= 10) crushedCount += 1;
  }

  const denom = Math.max(1, opaquePixelCount);
  const meanLuminance = Number((lumSum / denom).toFixed(4));
  const highlightClippedPct = Number(((clippedCount / denom) * 100).toFixed(2));
  const shadowCrushedPct = Number(((crushedCount / denom) * 100).toFixed(2));
  const dynamicRangeStops = Number(
    Math.log2(Math.max(0.002, lumMax) / Math.max(0.001, lumMin)).toFixed(2),
  );
  const dominantOklch = linearRgbToOklchString(sumLinR / denom, sumLinG / denom, sumLinB / denom);

  return {
    presetId: preset.id,
    width,
    height,
    rgba: out,
    metrics: {
      pixelCount,
      opaquePixelCount,
      meanLuminance,
      highlightClippedPct,
      shadowCrushedPct,
      dynamicRangeStops,
      dominantOklch,
    },
  };
}

/**
 * 실시간 `<canvas>` 프리뷰 및 테스트용 결정론적 3층(밑색·그림자·반사광/키) 웹툰 컷 샘플을 생성한다.
 */
export function createDemoThreeLayerScene(width = 160, height = 104): ThreeLayerColorBuffers {
  const w = Math.max(8, Math.floor(width));
  const h = Math.max(8, Math.floor(height));
  const size = w * h * 4;
  const albedo = new Uint8ClampedArray(size);
  const shadow = new Uint8ClampedArray(size);
  const bounceKey = new Uint8ClampedArray(size);

  const cx = w * 0.48;
  const headCy = h * 0.36;
  const headR = Math.min(w, h) * 0.22;

  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const idx = (y * w + x) * 4;

      // 배경 하늘/도심 그라데이션 밑색
      let aR = Math.round(176 - ny * 48);
      let aG = Math.round(196 - ny * 44);
      let aB = Math.round(224 - ny * 26);

      // 그림자 기본값 (오른쪽 하단 부드러운 음영)
      const shR = 70;
      const shG = 78;
      const shB = 104;
      let shA = nx > 0.62 ? 95 : 22;

      // 반사광·키라이트 (좌상단 키라이트 + 우측 림라이트)
      let keyByte = Math.round(clamp01(1 - nx * 1.15 - ny * 0.45) * 185);
      let bounceByte = Math.round(clamp01((nx - 0.55) * 1.6) * 120);
      let specByte = 0;
      let bkA = 190;

      // 캐릭터 상체 코트 영역
      const inTorso = ny > 0.54 && Math.abs(nx - 0.48) < 0.16 + (ny - 0.54) * 0.42;
      if (inTorso) {
        aR = 72;
        aG = 92;
        aB = 136;
        shA = nx > 0.5 ? 215 : 42;
        keyByte = nx < 0.44 ? 210 : 30;
        bounceByte = nx > 0.58 ? 225 : 40;
      }

      // 캐릭터 얼굴 + 머리카락 실루엣
      const dx = x - cx;
      const dy = y - headCy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= headR * 1.18) {
        const isHair = dy < -headR * 0.18 || dist > headR * 0.88;
        if (isHair) {
          aR = 54;
          aG = 48;
          aB = 72;
          shA = dx > headR * 0.12 ? 225 : 55;
          keyByte = dx < -headR * 0.2 ? 195 : 35;
          bounceByte = dist > headR * 0.96 && dx > 0 ? 245 : 50;
          specByte = Math.abs(dy + headR * 0.42) < headR * 0.15 ? 210 : 0;
        } else {
          // 피부 알베도
          aR = 238;
          aG = 204;
          aB = 186;
          shA = dx > headR * 0.2 ? 185 : 18;
          keyByte = dx < 0 ? 220 : 50;
          bounceByte = dx > headR * 0.52 ? 195 : 28;
          specByte = 0;
        }
      }

      // 대각선 검기/칼날 하이라이트
      const bladeDist = Math.abs((nx - 0.24) * 0.82 - (0.86 - ny) * 0.57);
      if (bladeDist < 0.022 && nx > 0.18 && nx < 0.84) {
        aR = 226;
        aG = 234;
        aB = 244;
        shA = 0;
        keyByte = 250;
        bounceByte = 235;
        specByte = 245;
        bkA = 255;
      }

      albedo[idx] = aR;
      albedo[idx + 1] = aG;
      albedo[idx + 2] = aB;
      albedo[idx + 3] = 255;

      shadow[idx] = shR;
      shadow[idx + 1] = shG;
      shadow[idx + 2] = shB;
      shadow[idx + 3] = shA;

      bounceKey[idx] = keyByte;
      bounceKey[idx + 1] = bounceByte;
      bounceKey[idx + 2] = specByte;
      bounceKey[idx + 3] = bkA;
    }
  }

  return { width: w, height: h, albedo, shadow, bounceKey };
}

// ============================================================================
// 엔진 2: 컷 밖 돌파 마스킹 (Out-of-Panel Breakout)
// ============================================================================

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type BreakoutLayerCategory = "blade" | "hair" | "sfx" | "hand" | "fx" | "background";
export type BreakoutEdge = "top" | "right" | "bottom" | "left";

export interface PanelBreakoutLayerInput {
  readonly id: string;
  readonly name: string;
  readonly category: BreakoutLayerCategory;
  readonly breakoutEnabled: boolean;
  readonly bounds: Rect2D;
  readonly maxOverflowPx?: number;
  readonly zIndex: number;
}

export interface PanelFrameInput {
  readonly panelId: string;
  readonly frame: Rect2D;
  readonly gutterBleedPx: number;
  readonly pageBounds: Rect2D;
}

export interface LayerBreakoutMaskPlan {
  readonly layerId: string;
  readonly layerName: string;
  readonly category: BreakoutLayerCategory;
  readonly breakoutEnabled: boolean;
  readonly mode: "panel-clipped" | "breakout-union" | "contained";
  readonly clippedRect: Rect2D;
  readonly overflowRect: Rect2D | null;
  readonly effectiveClipRect: Rect2D;
  readonly overflowEdges: readonly BreakoutEdge[];
  readonly overflowAreaPx2: number;
  readonly overflowRatio: number;
  readonly clampedToPageEdge: boolean;
  readonly clipPathSvg: string;
}

export interface PanelBreakoutMaskReport {
  readonly panelId: string;
  readonly panelFrame: Rect2D;
  readonly safeBreakoutEnvelope: Rect2D;
  readonly layers: readonly LayerBreakoutMaskPlan[];
  readonly activeBreakoutCount: number;
  readonly manualEraserStrokesSaved: number;
  readonly collisionWarnings: readonly string[];
}

function intersectRect(a: Rect2D, b: Rect2D): Rect2D {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return {
    x: Number(x1.toFixed(2)),
    y: Number(y1.toFixed(2)),
    width: Number(Math.max(0, x2 - x1).toFixed(2)),
    height: Number(Math.max(0, y2 - y1).toFixed(2)),
  };
}

function unionRect(a: Rect2D, b: Rect2D): Rect2D {
  if (a.width <= 0 || a.height <= 0) return b;
  if (b.width <= 0 || b.height <= 0) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: Number(x1.toFixed(2)),
    y: Number(y1.toFixed(2)),
    width: Number((x2 - x1).toFixed(2)),
    height: Number((y2 - y1).toFixed(2)),
  };
}

function rectArea(rect: Rect2D): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function rectToSvgSubpath(rect: Rect2D): string {
  const x = rect.x.toFixed(1);
  const y = rect.y.toFixed(1);
  const w = rect.width.toFixed(1);
  const h = rect.height.toFixed(1);
  return `M${x} ${y}h${w}v${h}h-${w}Z`;
}

/**
 * 컷 경계를 넘는 칼날·머리카락·효과음 레이어에 대해 수동 지우개 없이
 * `breakoutEnabled` 플래그와 오버플로 영역만으로 안전 클립 마스크 계획을 계산한다.
 */
export function computePanelBreakoutMasks(
  panel: PanelFrameInput,
  layers: readonly PanelBreakoutLayerInput[],
): PanelBreakoutMaskReport {
  const gutter = Math.max(0, panel.gutterBleedPx);
  const expandedPanel: Rect2D = {
    x: panel.frame.x - gutter,
    y: panel.frame.y - gutter,
    width: panel.frame.width + gutter * 2,
    height: panel.frame.height + gutter * 2,
  };
  const safeBreakoutEnvelope = intersectRect(expandedPanel, panel.pageBounds);
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  const plans: LayerBreakoutMaskPlan[] = [];
  const warnings: string[] = [];
  let activeBreakoutCount = 0;

  for (const layer of sortedLayers) {
    const insidePanel = intersectRect(layer.bounds, panel.frame);
    const totalArea = Math.max(1, rectArea(layer.bounds));
    const insideArea = rectArea(insidePanel);
    const rawOutside = totalArea - insideArea > 0.5;

    const layerMaxOverflow = Math.max(0, layer.maxOverflowPx ?? gutter);
    const layerEnvelope = intersectRect(
      {
        x: panel.frame.x - Math.min(gutter, layerMaxOverflow),
        y: panel.frame.y - Math.min(gutter, layerMaxOverflow),
        width: panel.frame.width + Math.min(gutter, layerMaxOverflow) * 2,
        height: panel.frame.height + Math.min(gutter, layerMaxOverflow) * 2,
      },
      panel.pageBounds,
    );

    const safeLayerBounds = intersectRect(layer.bounds, layerEnvelope);
    const clampedToPageEdge =
      layer.bounds.x < panel.pageBounds.x ||
      layer.bounds.y < panel.pageBounds.y ||
      layer.bounds.x + layer.bounds.width > panel.pageBounds.x + panel.pageBounds.width ||
      layer.bounds.y + layer.bounds.height > panel.pageBounds.y + panel.pageBounds.height;

    const overflowEdges: BreakoutEdge[] = [];
    if (layer.bounds.y < panel.frame.y) overflowEdges.push("top");
    if (layer.bounds.x + layer.bounds.width > panel.frame.x + panel.frame.width) overflowEdges.push("right");
    if (layer.bounds.y + layer.bounds.height > panel.frame.y + panel.frame.height) overflowEdges.push("bottom");
    if (layer.bounds.x < panel.frame.x) overflowEdges.push("left");

    if (!rawOutside) {
      plans.push({
        layerId: layer.id,
        layerName: layer.name,
        category: layer.category,
        breakoutEnabled: layer.breakoutEnabled,
        mode: "contained",
        clippedRect: insidePanel,
        overflowRect: null,
        effectiveClipRect: panel.frame,
        overflowEdges: [],
        overflowAreaPx2: 0,
        overflowRatio: 0,
        clampedToPageEdge: false,
        clipPathSvg: rectToSvgSubpath(panel.frame),
      });
      continue;
    }

    if (!layer.breakoutEnabled) {
      plans.push({
        layerId: layer.id,
        layerName: layer.name,
        category: layer.category,
        breakoutEnabled: false,
        mode: "panel-clipped",
        clippedRect: insidePanel,
        overflowRect: null,
        effectiveClipRect: panel.frame,
        overflowEdges,
        overflowAreaPx2: 0,
        overflowRatio: 0,
        clampedToPageEdge: false,
        clipPathSvg: rectToSvgSubpath(panel.frame),
      });
      continue;
    }

    // breakoutEnabled === true: 컷 프레임 + 안전 오버플로 바운딩 합집합 마스크
    const safeArea = rectArea(safeLayerBounds);
    const overflowAreaPx2 = Number(Math.max(0, safeArea - insideArea).toFixed(1));
    const overflowRatio = Number(clamp01(overflowAreaPx2 / totalArea).toFixed(3));
    const effectiveClipRect = unionRect(panel.frame, safeLayerBounds);
    const clipPathSvg = `${rectToSvgSubpath(panel.frame)} ${rectToSvgSubpath(safeLayerBounds)}`;

    activeBreakoutCount += 1;
    if (clampedToPageEdge) {
      warnings.push(
        `${layer.name} 레이어가 페이지 외곽 안전 경계에 도달해 자동 클램프되었습니다.`,
      );
    }

    plans.push({
      layerId: layer.id,
      layerName: layer.name,
      category: layer.category,
      breakoutEnabled: true,
      mode: "breakout-union",
      clippedRect: insidePanel,
      overflowRect: safeLayerBounds,
      effectiveClipRect,
      overflowEdges,
      overflowAreaPx2,
      overflowRatio,
      clampedToPageEdge,
      clipPathSvg,
    });
  }

  // 돌파 레이어 1개당 수동 컷선 지우개/마스크 보정 약 6획 절감 추정
  const manualEraserStrokesSaved = activeBreakoutCount * 6;

  return {
    panelId: panel.panelId,
    panelFrame: panel.frame,
    safeBreakoutEnvelope,
    layers: plans,
    activeBreakoutCount,
    manualEraserStrokesSaved,
    collisionWarnings: warnings,
  };
}

/** 특정 레이어의 `breakoutEnabled` 플래그를 불변 갱신한다. */
export function toggleLayerBreakoutFlag(
  layers: readonly PanelBreakoutLayerInput[],
  layerId: string,
  nextEnabled?: boolean,
): readonly PanelBreakoutLayerInput[] {
  return layers.map((layer) =>
    layer.id === layerId
      ? { ...layer, breakoutEnabled: nextEnabled ?? !layer.breakoutEnabled }
      : layer,
  );
}

export const DEFAULT_PANEL_FRAME_FIXTURE: PanelFrameInput = {
  panelId: "PANEL-04-CLIMAX",
  frame: { x: 48, y: 42, width: 224, height: 156 },
  gutterBleedPx: 34,
  pageBounds: { x: 8, y: 8, width: 304, height: 224 },
};

export const DEFAULT_BREAKOUT_LAYERS_FIXTURE: readonly PanelBreakoutLayerInput[] = [
  {
    id: "layer-bg-sky",
    name: "배경 도시·하늘",
    category: "background",
    breakoutEnabled: false,
    bounds: { x: 36, y: 30, width: 252, height: 180 },
    maxOverflowPx: 0,
    zIndex: 1,
  },
  {
    id: "layer-hair-flow",
    name: "휘날리는 머리카락",
    category: "hair",
    breakoutEnabled: true,
    bounds: { x: 26, y: 18, width: 112, height: 92 },
    maxOverflowPx: 32,
    zIndex: 2,
  },
  {
    id: "layer-sword-blade",
    name: "참격 칼날 궤적",
    category: "blade",
    breakoutEnabled: true,
    bounds: { x: 146, y: 16, width: 156, height: 118 },
    maxOverflowPx: 40,
    zIndex: 3,
  },
  {
    id: "layer-sfx-slash",
    name: "효과음 「서걱!」",
    category: "sfx",
    breakoutEnabled: true,
    bounds: { x: 184, y: 142, width: 114, height: 78 },
    maxOverflowPx: 36,
    zIndex: 4,
  },
];
