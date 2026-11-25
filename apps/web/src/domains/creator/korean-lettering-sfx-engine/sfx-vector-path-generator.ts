/**
 * 한국어·영어·일본어 웹툰 의성어/의태어(SFX)용 5종 파라메트릭 벡터 엔벨로프 엔진 (Wave 41B).
 *
 * - 5종 엔벨로프: `impact-burst`, `tremble-whisper`, `metallic-slash`, `soft-heartbeat`, `comic-zoom`
 * - 글자별 아크 배치 좌표(x, y, tangent), 기울기(shearX/Y), 원근 테이퍼(perspective taper + 4점 워프 쿼드)
 * - 이중 외곽선(double-stroke: outerPath / innerPath / shadowPath) SVG 경로 데이터 및 시맨틱 SVG 내보내기
 * - 100% 온디바이스 결정론 연산 (원시 hex/rgb/hsl·비결정 난수·브라우저 스토리지 미사용)
 */

export type SfxEnvelopeId =
  | "impact-burst"
  | "tremble-whisper"
  | "metallic-slash"
  | "soft-heartbeat"
  | "comic-zoom";

export type SfxScriptKind = "ko" | "en" | "ja" | "mixed";

export interface SfxPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface SfxWarpedQuad {
  readonly topLeft: SfxPoint2D;
  readonly topRight: SfxPoint2D;
  readonly bottomRight: SfxPoint2D;
  readonly bottomLeft: SfxPoint2D;
}

export interface SfxDoubleStrokePaths {
  readonly outerStrokeWidthPx: number;
  readonly innerStrokeWidthPx: number;
  readonly outerPath: string;
  readonly innerPath: string;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
  readonly shadowPath: string;
}

export interface SfxGlyphVectorNode {
  readonly index: number;
  readonly char: string;
  readonly normalizedT: number;
  readonly signedU: number;
  readonly isExclamation: boolean;
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly arcAngleDeg: number;
  readonly shearXDeg: number;
  readonly shearYDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly taperRatio: number;
  readonly depthZ: number;
  readonly jitterOffsetX: number;
  readonly jitterOffsetY: number;
  readonly warpedQuad: SfxWarpedQuad;
  readonly glyphBoxPath: string;
  readonly doubleStroke: SfxDoubleStrokePaths;
  readonly svgTransform: string;
}

export interface SfxEnvelopeSpec {
  readonly id: SfxEnvelopeId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly sampleText: string;
  readonly defaultArcIntensity: number;
  readonly defaultShearDeg: number;
  readonly defaultTaperAmount: number;
  readonly defaultOuterStrokePx: number;
  readonly defaultInnerStrokePx: number;
  readonly defaultShadowOffsetX: number;
  readonly defaultShadowOffsetY: number;
  readonly fontWeight: number;
}

export interface SfxVectorOptions {
  readonly envelopeId?: SfxEnvelopeId;
  readonly viewBoxWidth?: number;
  readonly viewBoxHeight?: number;
  readonly baseFontSizePx?: number;
  readonly arcIntensity?: number;
  readonly shearMultiplier?: number;
  readonly taperAmount?: number;
  readonly outerStrokeWidthPx?: number;
  readonly innerStrokeWidthPx?: number;
  readonly seed?: number;
}

export interface SfxVectorEnvelopeResult {
  readonly text: string;
  readonly envelopeId: SfxEnvelopeId;
  readonly spec: SfxEnvelopeSpec;
  readonly script: SfxScriptKind;
  readonly viewBoxWidth: number;
  readonly viewBoxHeight: number;
  readonly baseFontSizePx: number;
  readonly arcIntensity: number;
  readonly taperAmount: number;
  readonly outerStrokeWidthPx: number;
  readonly innerStrokeWidthPx: number;
  readonly glyphs: readonly SfxGlyphVectorNode[];
  readonly minScale: number;
  readonly maxScale: number;
  readonly maxAbsShearDeg: number;
  readonly envelopeUpperCurvePath: string;
  readonly envelopeLowerCurvePath: string;
  readonly envelopeClosedPath: string;
  readonly accentPaths: readonly string[];
  readonly combinedOuterStrokePath: string;
  readonly combinedInnerStrokePath: string;
  readonly totalVectorPathCount: number;
  readonly standaloneSvgMarkup: string;
}

export interface SfxTextPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly text: string;
  readonly envelopeId: SfxEnvelopeId;
  readonly script: SfxScriptKind;
}

export const SFX_ENVELOPE_IDS: readonly SfxEnvelopeId[] = [
  "impact-burst",
  "tremble-whisper",
  "metallic-slash",
  "soft-heartbeat",
  "comic-zoom",
];

export const SFX_ENVELOPE_SPECS: Readonly<Record<SfxEnvelopeId, SfxEnvelopeSpec>> = {
  "impact-burst": {
    id: "impact-burst", labelKo: "충격 폭발", labelEn: "Impact Burst",
    summaryKo: "중앙이 솟구치는 볼록 아크·강한 교차 기울기·폭발 충격파 이중 외곽선을 생성합니다.",
    summaryEn: "Convex radial arch with high-energy shear, burst shockwaves, and bold double-stroke.",
    sampleText: "콰광!", defaultArcIntensity: 0.68, defaultShearDeg: -14, defaultTaperAmount: 0.34,
    defaultOuterStrokePx: 9, defaultInnerStrokePx: 3.5, defaultShadowOffsetX: 5, defaultShadowOffsetY: 6, fontWeight: 900,
  },
  "tremble-whisper": {
    id: "tremble-whisper", labelKo: "전율 속삭임", labelEn: "Tremble Whisper",
    summaryKo: "결정론적 미세 떨림 지터와 불규칙 진폭 파동, 얇은 잔향 외곽선으로 공포·긴장을 표현합니다.",
    summaryEn: "Deterministic micro-tremor jitter and thin echo strokes for eerie tension.",
    sampleText: "부들부들", defaultArcIntensity: -0.18, defaultShearDeg: 6, defaultTaperAmount: -0.22,
    defaultOuterStrokePx: 4, defaultInnerStrokePx: 1.5, defaultShadowOffsetX: 2, defaultShadowOffsetY: 2.5, fontWeight: 600,
  },
  "metallic-slash": {
    id: "metallic-slash", labelKo: "금속 참격", labelEn: "Metallic Slash",
    summaryKo: "날카로운 대각선 베기 궤적·강한 전방 이탤릭 기울기(-24°)·칼끝 원근 테이퍼를 만듭니다.",
    summaryEn: "Diagonal blade sweep with steep forward shear (-24°) and sharp tip taper.",
    sampleText: "스윽", defaultArcIntensity: 0.52, defaultShearDeg: -24, defaultTaperAmount: -0.48,
    defaultOuterStrokePx: 6.5, defaultInnerStrokePx: 2.2, defaultShadowOffsetX: 6, defaultShadowOffsetY: 2, fontWeight: 800,
  },
  "soft-heartbeat": {
    id: "soft-heartbeat", labelKo: "부드러운 두근", labelEn: "Soft Heartbeat",
    summaryKo: "둥글게 튀어오르는 리듬 아크와 맥박 스케일 펄스, 포근한 동심원 외곽선을 구성합니다.",
    summaryEn: "Bouncy pulse rhythm arc with gentle shear and warm concentric halo rings.",
    sampleText: "두근", defaultArcIntensity: 0.42, defaultShearDeg: -5, defaultTaperAmount: 0.14,
    defaultOuterStrokePx: 7.5, defaultInnerStrokePx: 3, defaultShadowOffsetX: 2.5, defaultShadowOffsetY: 3.5, fontWeight: 700,
  },
  "comic-zoom": {
    id: "comic-zoom", labelKo: "원근 돌진 줌", labelEn: "Comic Perspective Zoom",
    summaryKo: "소실점에서 화면 앞으로 튀어나오는 1점 투시 사다리꼴 테이퍼와 속도선 벡터를 생성합니다.",
    summaryEn: "1-point perspective trapezoid extrusion leaping toward the reader with speed rays.",
    sampleText: "번쩍", defaultArcIntensity: 0.24, defaultShearDeg: -12, defaultTaperAmount: 0.62,
    defaultOuterStrokePx: 10, defaultInnerStrokePx: 3.5, defaultShadowOffsetX: 7, defaultShadowOffsetY: 7, fontWeight: 900,
  },
};

export const DEFAULT_SFX_PRESETS: readonly SfxTextPreset[] = [
  { id: "ko-kwakwang", labelKo: "콰광! (충격 폭발)", labelEn: "콰광! (Impact)", text: "콰광!", envelopeId: "impact-burst", script: "ko" },
  { id: "ko-dugeun", labelKo: "두근 (심장 맥박)", labelEn: "두근 (Heartbeat)", text: "두근", envelopeId: "soft-heartbeat", script: "ko" },
  { id: "ko-seueuk", labelKo: "스윽 (금속 참격)", labelEn: "스윽 (Slash)", text: "스윽", envelopeId: "metallic-slash", script: "ko" },
  { id: "ko-beonjjeok", labelKo: "번쩍 (원근 줌)", labelEn: "번쩍 (Zoom)", text: "번쩍", envelopeId: "comic-zoom", script: "ko" },
  { id: "en-crack", labelKo: "CRACK! (영문 파열)", labelEn: "CRACK! (Burst)", text: "CRACK!", envelopeId: "impact-burst", script: "en" },
  { id: "ko-budeul", labelKo: "부들부들 (전율)", labelEn: "부들부들 (Tremble)", text: "부들부들", envelopeId: "tremble-whisper", script: "ko" },
  { id: "ja-dodon", labelKo: "ドドン! (일어 줌)", labelEn: "ドドン! (JP Zoom)", text: "ドドン!", envelopeId: "comic-zoom", script: "ja" },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deterministicSignedNoise(seed: number, index: number, channel: number): number {
  const raw = Math.sin((seed + 17) * 12.9898 + (index + 1) * 78.233 + (channel + 3) * 37.719) * 43758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}

/** 의성어 문자열의 주요 스크립트(한글/영문/일어/혼합)를 판별한다. */
export function detectSfxScript(text: string): SfxScriptKind {
  let ko = 0;
  let ja = 0;
  let en = 0;
  for (const ch of Array.from(text)) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3130 && code <= 0x318f)) ko += 1;
    else if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff)) ja += 1;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) en += 1;
  }
  const activeKinds = (ko > 0 ? 1 : 0) + (ja > 0 ? 1 : 0) + (en > 0 ? 1 : 0);
  if (activeKinds > 1) return "mixed";
  if (ko > 0) return "ko";
  if (ja > 0) return "ja";
  return "en";
}

function measureGlyphAspectRatio(ch: string): number {
  if (ch === "!" || ch === "?" || ch === "…" || ch === "." || ch === "~") return 0.56;
  const code = ch.codePointAt(0) ?? 0;
  if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3130 && code <= 0x318f)) return 1.0;
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff)) return 0.96;
  return 0.72;
}

function quadToPath(quad: SfxWarpedQuad): string {
  return `M ${round2(quad.topLeft.x)} ${round2(quad.topLeft.y)} L ${round2(quad.topRight.x)} ${round2(quad.topRight.y)} L ${round2(quad.bottomRight.x)} ${round2(quad.bottomRight.y)} L ${round2(quad.bottomLeft.x)} ${round2(quad.bottomLeft.y)} Z`;
}

function offsetQuad(quad: SfxWarpedQuad, dx: number, dy: number): SfxWarpedQuad {
  return {
    topLeft: { x: round2(quad.topLeft.x + dx), y: round2(quad.topLeft.y + dy) },
    topRight: { x: round2(quad.topRight.x + dx), y: round2(quad.topRight.y + dy) },
    bottomRight: { x: round2(quad.bottomRight.x + dx), y: round2(quad.bottomRight.y + dy) },
    bottomLeft: { x: round2(quad.bottomLeft.x + dx), y: round2(quad.bottomLeft.y + dy) },
  };
}

function transformLocalCorner(
  lx: number, ly: number, cx: number, cy: number,
  angleDeg: number, shearXDeg: number, shearYDeg: number,
): SfxPoint2D {
  const rad = (angleDeg * Math.PI) / 180;
  const sx = lx + ly * Math.tan((clamp(shearXDeg, -45, 45) * Math.PI) / 180);
  const sy = ly + lx * Math.tan((clamp(shearYDeg, -30, 30) * Math.PI) / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: round2(cx + sx * cos - sy * sin), y: round2(cy + sx * sin + sy * cos) };
}

function buildWarpedQuad(
  cx: number, cy: number, halfW: number, halfH: number,
  leftEdgeScale: number, rightEdgeScale: number,
  angleDeg: number, shearXDeg: number, shearYDeg: number, expandPx = 0,
): SfxWarpedQuad {
  const hw = halfW + expandPx;
  const lh = halfH * leftEdgeScale + expandPx;
  const rh = halfH * rightEdgeScale + expandPx;
  return {
    topLeft: transformLocalCorner(-hw, -lh, cx, cy, angleDeg, shearXDeg, shearYDeg),
    topRight: transformLocalCorner(hw, -rh, cx, cy, angleDeg, shearXDeg, shearYDeg),
    bottomRight: transformLocalCorner(hw, rh, cx, cy, angleDeg, shearXDeg, shearYDeg),
    bottomLeft: transformLocalCorner(-hw, lh, cx, cy, angleDeg, shearXDeg, shearYDeg),
  };
}

function buildPolylinePath(points: readonly SfxPoint2D[], closed = false): string {
  if (points.length === 0) return "";
  const segs = points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${round2(pt.x)} ${round2(pt.y)}`);
  return closed ? `${segs.join(" ")} Z` : segs.join(" ");
}

interface GlyphKinematics {
  readonly arcY: number;
  readonly arcAngleDeg: number;
  readonly shearXDeg: number;
  readonly shearYDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly jitterOffsetX: number;
  readonly jitterOffsetY: number;
  readonly depthZ: number;
}

function computeEnvelopeGlyphKinematics(
  envelopeId: SfxEnvelopeId,
  spec: SfxEnvelopeSpec,
  index: number,
  t: number,
  u: number,
  isExclamation: boolean,
  arcIntensity: number,
  shearMultiplier: number,
  taperAmount: number,
  seed: number,
): GlyphKinematics {
  if (envelopeId === "impact-burst") {
    const archLift = (0.6 - u * u) * arcIntensity * 36;
    const centerBoost = 1 + (1 - Math.abs(u) * 0.6) * Math.abs(taperAmount) * 0.55 + (isExclamation ? 0.14 : 0);
    return {
      arcY: -archLift + (index % 2 === 0 ? -3 : 3),
      arcAngleDeg: u * arcIntensity * 22 + (isExclamation ? 10 : 0),
      shearXDeg: (spec.defaultShearDeg + (index % 2 === 0 ? -4 : 5)) * shearMultiplier,
      shearYDeg: -u * 5 * shearMultiplier,
      scaleX: centerBoost,
      scaleY: centerBoost * 1.06,
      jitterOffsetX: 0,
      jitterOffsetY: 0,
      depthZ: 1 - Math.abs(u),
    };
  }

  if (envelopeId === "tremble-whisper") {
    const nX = deterministicSignedNoise(seed, index, 1);
    const nY = deterministicSignedNoise(seed, index, 2);
    const nRot = deterministicSignedNoise(seed, index, 3);
    const jitterOffsetX = nX * 4.2;
    const jitterOffsetY = nY * 7.5;
    const taper = 1 + u * taperAmount * 0.45;
    return {
      arcY: Math.sin(u * Math.PI * 1.5) * arcIntensity * 18 + jitterOffsetY,
      arcAngleDeg: nRot * 9.5,
      shearXDeg: (spec.defaultShearDeg + nX * 7) * shearMultiplier,
      shearYDeg: nY * 4 * shearMultiplier,
      scaleX: clamp(taper * (0.94 + Math.abs(nX) * 0.12), 0.58, 1.35),
      scaleY: clamp(taper * (0.92 + Math.abs(nY) * 0.18), 0.58, 1.35),
      jitterOffsetX,
      jitterOffsetY,
      depthZ: 0.25 + nY * 0.2,
    };
  }

  if (envelopeId === "metallic-slash") {
    const slashRise = -u * 30 * Math.max(0.25, Math.abs(arcIntensity));
    const bladeCurve = -(0.6 - u * u) * arcIntensity * 14;
    const bladeScale = clamp(1 + u * taperAmount * 0.72, 0.52, 1.55);
    return {
      arcY: slashRise + bladeCurve,
      arcAngleDeg: -13 * Math.sign(arcIntensity || 1) + u * 6,
      shearXDeg: (spec.defaultShearDeg - Math.abs(u) * 4) * shearMultiplier,
      shearYDeg: -7 * shearMultiplier,
      scaleX: bladeScale * 1.08,
      scaleY: bladeScale * 0.96,
      jitterOffsetX: 0,
      jitterOffsetY: 0,
      depthZ: 1 - t,
    };
  }

  if (envelopeId === "soft-heartbeat") {
    const bounce = -Math.abs(Math.cos(t * Math.PI)) * arcIntensity * 24;
    const pulse = index % 2 === 0 ? 1.12 : 0.92;
    const softTaper = clamp((1 + u * taperAmount * 0.35) * pulse, 0.72, 1.4);
    return {
      arcY: bounce + (index % 2 === 0 ? -5 : 4),
      arcAngleDeg: (index % 2 === 0 ? -6 : 6) + u * arcIntensity * 10,
      shearXDeg: (spec.defaultShearDeg + (index % 2 === 0 ? -3 : 4)) * shearMultiplier,
      shearYDeg: (index % 2 === 0 ? -2 : 2) * shearMultiplier,
      scaleX: softTaper,
      scaleY: softTaper * (index % 2 === 0 ? 1.05 : 0.98),
      jitterOffsetX: 0,
      jitterOffsetY: 0,
      depthZ: index % 2 === 0 ? 0.8 : 0.45,
    };
  }

  // comic-zoom: 1점 투시 사다리꼴 원근 팽창/축소
  const perspectiveScale = clamp(1 + u * taperAmount * 0.78 + (isExclamation ? 0.1 : 0), 0.46, 1.85);
  return {
    arcY: -(0.6 - u * u) * arcIntensity * 18 - u * taperAmount * 12,
    arcAngleDeg: -u * taperAmount * 9,
    shearXDeg: (spec.defaultShearDeg - u * 6) * shearMultiplier,
    shearYDeg: -taperAmount * 8 * shearMultiplier,
    scaleX: perspectiveScale,
    scaleY: perspectiveScale * (1 + Math.abs(taperAmount) * 0.14),
    jitterOffsetX: 0,
    jitterOffsetY: 0,
    depthZ: t,
  };
}

function buildEnvelopeAccentPaths(
  envelopeId: SfxEnvelopeId,
  glyphs: readonly SfxGlyphVectorNode[],
  viewBoxWidth: number,
  viewBoxHeight: number,
): readonly string[] {
  const cx = viewBoxWidth / 2;
  const cy = viewBoxHeight / 2;
  if (glyphs.length === 0) return [];

  if (envelopeId === "impact-burst") {
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 + 0.14;
      const innerR = i % 2 === 0 ? 58 : 66;
      const outerR = i % 2 === 0 ? 94 : 82;
      return `M ${round2(cx + Math.cos(a) * innerR * 1.45)} ${round2(cy + Math.sin(a) * innerR * 0.72)} L ${round2(cx + Math.cos(a) * outerR * 1.52)} ${round2(cy + Math.sin(a) * outerR * 0.78)}`;
    });
  }

  if (envelopeId === "metallic-slash") {
    const first = glyphs[0];
    const last = glyphs[glyphs.length - 1];
    if (!first || !last) return [];
    const x0 = Math.max(16, first.x - 42);
    const y0 = Math.min(viewBoxHeight - 16, first.y + 34);
    const x1 = Math.min(viewBoxWidth - 16, last.x + 54);
    const y1 = Math.max(16, last.y - 38);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 - 14;
    return [
      `M ${round2(x0)} ${round2(y0)} Q ${round2(mx)} ${round2(my)} ${round2(x1)} ${round2(y1)} Q ${round2(mx + 6)} ${round2(my + 8)} ${round2(x0)} ${round2(y0)} Z`,
      `M ${round2(x1 - 14)} ${round2(y1 - 10)} L ${round2(x1 + 10)} ${round2(y1 + 4)} M ${round2(x1 - 2)} ${round2(y1 - 16)} L ${round2(x1 - 2)} ${round2(y1 + 12)}`,
    ];
  }

  if (envelopeId === "soft-heartbeat") {
    const first = glyphs[0];
    const last = glyphs[glyphs.length - 1];
    if (!first || !last) return [];
    const leftX = Math.max(24, first.x - 36);
    const rightX = Math.min(viewBoxWidth - 24, last.x + 36);
    return [
      `M ${round2(leftX)} ${round2(first.y - 26)} Q ${round2(leftX - 18)} ${round2(first.y)} ${round2(leftX)} ${round2(first.y + 26)}`,
      `M ${round2(leftX - 10)} ${round2(first.y - 18)} Q ${round2(leftX - 24)} ${round2(first.y)} ${round2(leftX - 10)} ${round2(first.y + 18)}`,
      `M ${round2(rightX)} ${round2(last.y - 26)} Q ${round2(rightX + 18)} ${round2(last.y)} ${round2(rightX)} ${round2(last.y + 26)}`,
      `M ${round2(rightX + 10)} ${round2(last.y - 18)} Q ${round2(rightX + 24)} ${round2(last.y)} ${round2(rightX + 10)} ${round2(last.y + 18)}`,
    ];
  }

  if (envelopeId === "tremble-whisper") {
    return glyphs.map((g) =>
      `M ${round2(g.x - g.widthPx * 0.56)} ${round2(g.y - g.heightPx * 0.5)} Q ${round2(g.x - g.widthPx * 0.68)} ${round2(g.y)} ${round2(g.x - g.widthPx * 0.56)} ${round2(g.y + g.heightPx * 0.5)}`,
    );
  }

  const vanishX = viewBoxWidth * 0.08;
  const vanishY = viewBoxHeight * 0.56;
  const targets: readonly SfxPoint2D[] = [
    { x: viewBoxWidth - 14, y: 18 },
    { x: viewBoxWidth - 10, y: viewBoxHeight * 0.28 },
    { x: viewBoxWidth - 10, y: viewBoxHeight * 0.72 },
    { x: viewBoxWidth - 14, y: viewBoxHeight - 18 },
  ];
  return targets.map((pt) =>
    `M ${round2(vanishX + (pt.x - vanishX) * 0.22)} ${round2(vanishY + (pt.y - vanishY) * 0.22)} L ${round2(pt.x)} ${round2(pt.y)}`,
  );
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

function buildStandaloneSemanticSvg(
  viewBoxWidth: number,
  viewBoxHeight: number,
  fontWeight: number,
  baseFontSizePx: number,
  envelopeClosedPath: string,
  accentPaths: readonly string[],
  glyphs: readonly SfxGlyphVectorNode[],
): string {
  const accentMarkup = accentPaths
    .map((d) => `  <path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55" />`)
    .join("\n");
  const glyphMarkup = glyphs
    .map((g) => {
      const escaped = escapeXml(g.char);
      return [
        `  <g transform="${g.svgTransform}">`,
        `    <text x="${g.doubleStroke.shadowOffsetX}" y="${g.doubleStroke.shadowOffsetY}" text-anchor="middle" dominant-baseline="central" font-size="${baseFontSizePx}" font-weight="${fontWeight}" fill="currentColor" opacity="0.28">${escaped}</text>`,
        `    <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${baseFontSizePx}" font-weight="${fontWeight}" fill="none" stroke="currentColor" stroke-width="${g.doubleStroke.outerStrokeWidthPx}" stroke-linejoin="round" paint-order="stroke fill">${escaped}</text>`,
        `    <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${baseFontSizePx}" font-weight="${fontWeight}" fill="currentColor">${escaped}</text>`,
        "  </g>",
      ].join("\n");
    })
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" role="img">`,
    `  <path d="${envelopeClosedPath}" fill="none" stroke="currentColor" stroke-dasharray="4 3" opacity="0.35" />`,
    accentMarkup,
    glyphMarkup,
    "</svg>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/** 5종 파라메트릭 감정 의성어(SFX) 벡터 엔벨로프와 글자별 아크·기울기·원근 테이퍼·이중 외곽선 SVG 경로를 생성한다. */
export function generateSfxVectorEnvelope(
  text: string,
  options?: SfxVectorOptions,
): SfxVectorEnvelopeResult {
  const envelopeId: SfxEnvelopeId = options?.envelopeId ?? "impact-burst";
  const spec = SFX_ENVELOPE_SPECS[envelopeId];
  const viewBoxWidth = round2(clamp(options?.viewBoxWidth ?? 420, 240, 960));
  const viewBoxHeight = round2(clamp(options?.viewBoxHeight ?? 200, 120, 480));
  const arcIntensity = round2(clamp(options?.arcIntensity ?? spec.defaultArcIntensity, -1, 1));
  const shearMultiplier = round2(clamp(options?.shearMultiplier ?? 1, 0, 2));
  const taperAmount = round2(clamp(options?.taperAmount ?? spec.defaultTaperAmount, -0.75, 0.75));
  const outerStrokeWidthPx = round2(clamp(options?.outerStrokeWidthPx ?? spec.defaultOuterStrokePx, 1, 18));
  const innerStrokeWidthPx = round2(clamp(options?.innerStrokeWidthPx ?? spec.defaultInnerStrokePx, 0.5, outerStrokeWidthPx * 0.8));
  const seed = Math.floor(options?.seed ?? 41);

  const normalizedText = text.trim() || spec.sampleText;
  const script = detectSfxScript(normalizedText);
  const rawChars = Array.from(normalizedText).filter((ch) => !/\s/u.test(ch));
  const chars = rawChars.length > 0 ? rawChars : Array.from(spec.sampleText);
  const count = chars.length;

  const autoFontSize = clamp(Math.round((viewBoxWidth * 0.66) / Math.max(2.6, count * 0.92)), 26, 62);
  const baseFontSizePx = round2(clamp(options?.baseFontSizePx ?? autoFontSize, 20, 84));
  const cx = viewBoxWidth / 2;
  const cy = viewBoxHeight / 2;

  const aspectRatios = chars.map((ch) => measureGlyphAspectRatio(ch));
  const totalRelativeUnits = aspectRatios.reduce((acc, r) => acc + r, 0) || 1;
  const spanWidthPx = Math.min(viewBoxWidth * 0.76, totalRelativeUnits * baseFontSizePx * 0.94);

  const glyphs: SfxGlyphVectorNode[] = [];
  let cursorUnits = 0;

  for (let i = 0; i < count; i += 1) {
    const ch = chars[i] ?? "";
    const aspect = aspectRatios[i] ?? 1;
    const isExclamation = ch === "!" || ch === "?";
    const t = count === 1 ? 0.5 : i / (count - 1);
    const u = t * 2 - 1;

    const centerUnits = cursorUnits + aspect * 0.5;
    cursorUnits += aspect;
    const baseX = cx - spanWidthPx / 2 + (centerUnits / totalRelativeUnits) * spanWidthPx;

    const k = computeEnvelopeGlyphKinematics(
      envelopeId, spec, i, t, u, isExclamation, arcIntensity, shearMultiplier, taperAmount, seed,
    );
    const x = round2(baseX + k.jitterOffsetX);
    const y = round2(cy + k.arcY);
    const widthPx = round2(baseFontSizePx * aspect * k.scaleX);
    const heightPx = round2(baseFontSizePx * k.scaleY);
    const taperRatio = round2(clamp(k.scaleY / Math.max(0.25, 1 - Math.abs(taperAmount) * 0.5), 0.45, 2.4));

    const leftEdgeScale = clamp(1 - taperAmount * 0.14, 0.72, 1.28);
    const rightEdgeScale = clamp(1 + taperAmount * 0.14, 0.72, 1.28);
    const coreQuad = buildWarpedQuad(x, y, widthPx * 0.46, heightPx * 0.48, leftEdgeScale, rightEdgeScale, k.arcAngleDeg, k.shearXDeg, k.shearYDeg, 0);
    const outerQuad = buildWarpedQuad(x, y, widthPx * 0.46, heightPx * 0.48, leftEdgeScale, rightEdgeScale, k.arcAngleDeg, k.shearXDeg, k.shearYDeg, outerStrokeWidthPx * 0.65);
    const innerQuad = buildWarpedQuad(x, y, widthPx * 0.46, heightPx * 0.48, leftEdgeScale, rightEdgeScale, k.arcAngleDeg, k.shearXDeg, k.shearYDeg, innerStrokeWidthPx * 0.45);
    const shadowOffsetX = round2(spec.defaultShadowOffsetX * k.scaleX);
    const shadowOffsetY = round2(spec.defaultShadowOffsetY * k.scaleY);

    glyphs.push({
      index: i, char: ch, normalizedT: round2(t), signedU: round2(u), isExclamation,
      x, y, widthPx, heightPx,
      arcAngleDeg: round2(k.arcAngleDeg), shearXDeg: round2(k.shearXDeg), shearYDeg: round2(k.shearYDeg),
      scaleX: round2(k.scaleX), scaleY: round2(k.scaleY), taperRatio, depthZ: round2(k.depthZ),
      jitterOffsetX: round2(k.jitterOffsetX), jitterOffsetY: round2(k.jitterOffsetY),
      warpedQuad: coreQuad, glyphBoxPath: quadToPath(coreQuad),
      doubleStroke: {
        outerStrokeWidthPx, innerStrokeWidthPx,
        outerPath: quadToPath(outerQuad), innerPath: quadToPath(innerQuad),
        shadowOffsetX, shadowOffsetY, shadowPath: quadToPath(offsetQuad(outerQuad, shadowOffsetX, shadowOffsetY)),
      },
      svgTransform: `translate(${x} ${y}) rotate(${round2(k.arcAngleDeg)}) skewX(${round2(k.shearXDeg)}) skewY(${round2(k.shearYDeg)}) scale(${round2(k.scaleX)} ${round2(k.scaleY)})`,
    });
  }

  const upperPoints = glyphs.flatMap((g) => [g.warpedQuad.topLeft, g.warpedQuad.topRight]);
  const lowerPoints = glyphs.flatMap((g) => [g.warpedQuad.bottomLeft, g.warpedQuad.bottomRight]);
  const envelopeUpperCurvePath = buildPolylinePath(upperPoints, false);
  const envelopeLowerCurvePath = buildPolylinePath(lowerPoints, false);
  const envelopeClosedPath = buildPolylinePath([...upperPoints, ...[...lowerPoints].reverse()], true);
  const accentPaths = buildEnvelopeAccentPaths(envelopeId, glyphs, viewBoxWidth, viewBoxHeight);
  const combinedOuterStrokePath = glyphs.map((g) => g.doubleStroke.outerPath).join(" ");
  const combinedInnerStrokePath = glyphs.map((g) => g.doubleStroke.innerPath).join(" ");

  const scales = glyphs.map((g) => g.scaleY);
  const minScale = scales.length > 0 ? round2(Math.min(...scales)) : 1;
  const maxScale = scales.length > 0 ? round2(Math.max(...scales)) : 1;
  const maxAbsShearDeg = glyphs.length > 0 ? round2(Math.max(...glyphs.map((g) => Math.abs(g.shearXDeg)))) : 0;
  const totalVectorPathCount = glyphs.length * 3 + 1 + accentPaths.length;

  return {
    text: normalizedText, envelopeId, spec, script, viewBoxWidth, viewBoxHeight,
    baseFontSizePx, arcIntensity, taperAmount, outerStrokeWidthPx, innerStrokeWidthPx,
    glyphs, minScale, maxScale, maxAbsShearDeg,
    envelopeUpperCurvePath, envelopeLowerCurvePath, envelopeClosedPath, accentPaths,
    combinedOuterStrokePath, combinedInnerStrokePath, totalVectorPathCount,
    standaloneSvgMarkup: buildStandaloneSemanticSvg(
      viewBoxWidth, viewBoxHeight, spec.fontWeight, baseFontSizePx, envelopeClosedPath, accentPaths, glyphs,
    ),
  };
}
