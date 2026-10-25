/**
 * 키틀(Kittl) 워프 타이포그래피 · 캔바(Canva) 텍스트 이펙트 · 미리캔버스(MiriCanvas) 한글 타이틀 합성을
 * 툰스튜디오 웹툰·단행본 타이틀 로고 스튜디오용으로 클린룸 내재화한 타이포그래피 엔진.
 *
 * REA 근거:
 * - Kittl: ev_87630ab5f165f576435b29c4ba6a9abc691f9cf5169c15a00b8186a54bd021dd, ev_7420eb0b8b3b502a4ff3f09e1bf06616327c580ad376b54e6c31190a4f0d94d8
 * - MiriCanvas: ev_8dd6d04fb1aecd0d43634e4cfdf07d6e251869ba0914926269e8b8084473b306, ev_c88e78f534e5ee3ed6298e1f12872661db73339920957c583c95cf9f20cde8436
 * - VistaCreate (split-stroke / anchor-center): ev_96ea2b385b9bd2aa20481c40711fe892653a76593ca7b47061d85afe9002b7d7
 */

export type TitleWarpCurveType =
  | "none"
  | "arc"
  | "arch"
  | "wave"
  | "rise"
  | "flag"
  | "slant";

export type TitleCompositeEffectKind =
  | "gold-emboss"
  | "3d-extrusion"
  | "halftone-comic"
  | "chromatic-glitch"
  | "ink-seal"
  | "sticker-double-stroke"
  | "neon-glow"
  | "soft-drop-shadow";

export type WebtoonTitleGenreId =
  | "rofan-royal-gold"
  | "action-hunter-slash"
  | "daily-pop-halftone"
  | "thriller-glitch-splice"
  | "murim-ink-brush"
  | "academy-ribbon-pop"
  | "sf-cyber-holo"
  | "drama-watercolor-soft";

export interface WebtoonTitlePreset {
  readonly id: WebtoonTitleGenreId;
  readonly label: string;
  readonly genreTag: string;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly defaultWarpType: TitleWarpCurveType;
  readonly defaultWarpIntensity: number;
  readonly effectKind: TitleCompositeEffectKind;
  readonly fillGradientStops: readonly [string, string, string];
  readonly primaryStrokeColor: string;
  readonly primaryStrokeWidthPx: number;
  readonly outerStrokeColor: string;
  readonly outerStrokeWidthPx: number;
  readonly extrusionDepthPx: number;
  readonly extrusionAngleDeg: number;
  readonly extrusionColor: string;
  readonly letterSpacingEm: number;
  readonly badgeEmblemText: string;
  readonly ornamentStyle: "sparkle-crown" | "speed-slash" | "halftone-burst" | "glitch-bars" | "ink-stamp" | "ribbon-crest" | "cyber-grid" | "petal-glow";
  readonly description: string;
}

export interface TitleWarpPathResult {
  readonly warpType: TitleWarpCurveType;
  readonly intensity: number;
  readonly pathD: string;
  readonly startPoint: { readonly x: number; readonly y: number };
  readonly endPoint: { readonly x: number; readonly y: number };
  readonly peakOffsetPx: number;
  readonly skewAngleDeg: number;
}

export interface WarpedGlyphTransform {
  readonly charIndex: number;
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly rotationDeg: number;
  readonly scaleY: number;
}

export interface TitleLogoRenderRequest {
  readonly mainTitle: string;
  readonly subtitle?: string;
  readonly badgeText?: string;
  readonly presetId: WebtoonTitleGenreId;
  readonly warpType?: TitleWarpCurveType;
  readonly warpIntensity?: number;
  readonly fontSizePx?: number;
  readonly extrusionDepthPx?: number;
  readonly customPrimaryColor?: string;
  readonly customAccentColor?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
}

export interface TitleLogoRenderOutput {
  readonly preset: WebtoonTitlePreset;
  readonly warpPath: TitleWarpPathResult;
  readonly glyphTransforms: readonly WarpedGlyphTransform[];
  readonly svgMarkup: string;
  readonly cssPreviewFilter: string;
  readonly contrastSummary: {
    readonly strokeToFillDistinction: "high" | "medium";
    readonly mobileThumbnailSafe: boolean;
  };
}

export const DESIGN_PLATFORM_TITLE_PRESETS: readonly WebtoonTitlePreset[] = [
  {
    id: "rofan-royal-gold",
    label: "로맨스 판타지 황실 골드 세리프",
    genreTag: "로판 · 궁정 · 회귀",
    fontFamily: "'MaruBuri', 'Nanum Myeongjo', 'Noto Serif KR', serif",
    fontWeight: 800,
    defaultWarpType: "arc",
    defaultWarpIntensity: 34,
    effectKind: "gold-emboss",
    fillGradientStops: ["#FFF6D1", "#EAB308", "#92400E"],
    primaryStrokeColor: "#2E1065",
    primaryStrokeWidthPx: 8,
    outerStrokeColor: "#FEF08A",
    outerStrokeWidthPx: 14,
    extrusionDepthPx: 6,
    extrusionAngleDeg: 135,
    extrusionColor: "#1E1B4B",
    letterSpacingEm: 0.04,
    badgeEmblemText: "ROYAL FANTASY",
    ornamentStyle: "sparkle-crown",
    description: "황실 보석 광택 3단 골드 그라데이션과 상향 아치(Arc) 워프를 결합한 로판 표지 시그니처",
  },
  {
    id: "action-hunter-slash",
    label: "헌터·액션 네온 메탈릭 슬랜트",
    genreTag: "액션 · 헌터 · 성좌",
    fontFamily: "'Pretendard Variable', 'Black Han Sans', sans-serif",
    fontWeight: 900,
    defaultWarpType: "slant",
    defaultWarpIntensity: 48,
    effectKind: "3d-extrusion",
    fillGradientStops: ["#F8FAFC", "#38BDF8", "#0369A1"],
    primaryStrokeColor: "#090D16",
    primaryStrokeWidthPx: 10,
    outerStrokeColor: "#22D3EE",
    outerStrokeWidthPx: 15,
    extrusionDepthPx: 12,
    extrusionAngleDeg: 145,
    extrusionColor: "#020617",
    letterSpacingEm: -0.02,
    badgeEmblemText: "S-RANK AWAKENING",
    ornamentStyle: "speed-slash",
    description: "강한 사선 시어링(Slant)과 12px 3D 다크 익스트루전으로 타격감을 극대화한 액션 타이틀",
  },
  {
    id: "daily-pop-halftone",
    label: "일상·개그 팝아트 할프톤",
    genreTag: "일상 · 개그 · 인스타툰",
    fontFamily: "'Jua', 'GmarketSansBold', 'Pretendard Variable', sans-serif",
    fontWeight: 800,
    defaultWarpType: "wave",
    defaultWarpIntensity: 28,
    effectKind: "halftone-comic",
    fillGradientStops: ["#FEF08A", "#FACC15", "#F97316"],
    primaryStrokeColor: "#18181B",
    primaryStrokeWidthPx: 10,
    outerStrokeColor: "#FFFFFF",
    outerStrokeWidthPx: 18,
    extrusionDepthPx: 9,
    extrusionAngleDeg: 130,
    extrusionColor: "#EC4899",
    letterSpacingEm: 0.02,
    badgeEmblemText: "COMIC EPISODE",
    ornamentStyle: "halftone-burst",
    description: "미리캔버스·키틀식 더블 화이트 스티커 테두리와 마젠타 할프톤 오프셋 그림자 조합",
  },
  {
    id: "thriller-glitch-splice",
    label: "스릴러·미스터리 글리치 스플라이스",
    genreTag: "스릴러 · 아포칼립스 · 호러",
    fontFamily: "'Pretendard Variable', 'Noto Sans KR', sans-serif",
    fontWeight: 900,
    defaultWarpType: "rise",
    defaultWarpIntensity: 24,
    effectKind: "chromatic-glitch",
    fillGradientStops: ["#F4F4F5", "#E4E4E7", "#A1A1AA"],
    primaryStrokeColor: "#09090B",
    primaryStrokeWidthPx: 9,
    outerStrokeColor: "#EF4444",
    outerStrokeWidthPx: 13,
    extrusionDepthPx: 8,
    extrusionAngleDeg: 160,
    extrusionColor: "#06B6D4",
    letterSpacingEm: 0.06,
    badgeEmblemText: "CONFIDENTIAL CASE",
    ornamentStyle: "glitch-bars",
    description: "레드·시안 색수차(Chromatic Aberration) 스플라이스와 우상향 라이즈(Rise) 긴장감 연출",
  },
  {
    id: "murim-ink-brush",
    label: "무협·시대극 수묵 금박 권운",
    genreTag: "무협 · 사극 · 동양판타지",
    fontFamily: "'Nanum Myeongjo', 'Gowun Batang', serif",
    fontWeight: 900,
    defaultWarpType: "flag",
    defaultWarpIntensity: 30,
    effectKind: "ink-seal",
    fillGradientStops: ["#FEF3C7", "#D97706", "#78350F"],
    primaryStrokeColor: "#0C0A09",
    primaryStrokeWidthPx: 11,
    outerStrokeColor: "#B91C1C",
    outerStrokeWidthPx: 15,
    extrusionDepthPx: 10,
    extrusionAngleDeg: 140,
    extrusionColor: "#1C1917",
    letterSpacingEm: 0.05,
    badgeEmblemText: "천하제일 무림록",
    ornamentStyle: "ink-stamp",
    description: "먹물 농담 외곽선과 주홍 낙관(Seal) 인장, 깃발(Flag) 곡선으로 완성하는 정통 무협 로고",
  },
  {
    id: "academy-ribbon-pop",
    label: "학원·청춘 리본 스티커 엠블럼",
    genreTag: "학원 · 캠퍼스 · 하이틴",
    fontFamily: "'Pretendard Variable', 'SUIT Variable', sans-serif",
    fontWeight: 800,
    defaultWarpType: "arch",
    defaultWarpIntensity: 26,
    effectKind: "sticker-double-stroke",
    fillGradientStops: ["#EFF6FF", "#60A5FA", "#1D4ED8"],
    primaryStrokeColor: "#1E3A8A",
    primaryStrokeWidthPx: 8,
    outerStrokeColor: "#FFFFFF",
    outerStrokeWidthPx: 16,
    extrusionDepthPx: 7,
    extrusionAngleDeg: 125,
    extrusionColor: "#F43F5E",
    letterSpacingEm: 0.01,
    badgeEmblemText: "HIGH SCHOOL DIARY",
    ornamentStyle: "ribbon-crest",
    description: "교복 엠블럼 감성의 네이비·코랄 대비와 두꺼운 화이트 다잉컷 스티커 외곽선",
  },
  {
    id: "sf-cyber-holo",
    label: "SF·사이버펑크 홀로그램 네온",
    genreTag: "SF · 사이버펑크 · 디스토피아",
    fontFamily: "'Pretendard Variable', monospace",
    fontWeight: 900,
    defaultWarpType: "slant",
    defaultWarpIntensity: 38,
    effectKind: "neon-glow",
    fillGradientStops: ["#F0FDFA", "#2DD4BF", "#C084FC"],
    primaryStrokeColor: "#0F172A",
    primaryStrokeWidthPx: 7,
    outerStrokeColor: "#E879F9",
    outerStrokeWidthPx: 13,
    extrusionDepthPx: 9,
    extrusionAngleDeg: 150,
    extrusionColor: "#311042",
    letterSpacingEm: 0.07,
    badgeEmblemText: "NEO-SEOUL 2099",
    ornamentStyle: "cyber-grid",
    description: "민트·퍼플 홀로그램 그라데이션과 네온 아우터 글로우를 결합한 미래형 타이틀",
  },
  {
    id: "drama-watercolor-soft",
    label: "감성 드라마 수채 파스텔",
    genreTag: "드라마 · 힐링 · 오피스",
    fontFamily: "'MaruBuri', 'Gowun Dodum', serif",
    fontWeight: 700,
    defaultWarpType: "arc",
    defaultWarpIntensity: 18,
    effectKind: "soft-drop-shadow",
    fillGradientStops: ["#FFF1F2", "#FDA4AF", "#E11D48"],
    primaryStrokeColor: "#4C0519",
    primaryStrokeWidthPx: 6,
    outerStrokeColor: "#FFFDD0",
    outerStrokeWidthPx: 12,
    extrusionDepthPx: 4,
    extrusionAngleDeg: 120,
    extrusionColor: "#881337",
    letterSpacingEm: 0.04,
    badgeEmblemText: "ORIGINAL STORY",
    ornamentStyle: "petal-glow",
    description: "따뜻한 아이보리·로즈 수채 톤과 완만한 아치 곡선으로 여운을 주는 감성 드라마 타이틀",
  },
] as const;

export function getWebtoonTitlePreset(presetId: WebtoonTitleGenreId): WebtoonTitlePreset {
  const found = DESIGN_PLATFORM_TITLE_PRESETS.find((preset) => preset.id === presetId);
  if (!found) {
    throw new Error(`지원하지 않는 웹툰 타이틀 프리셋 ID입니다: ${presetId}`);
  }
  return found;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/**
 * 키틀(Kittl) 스타일 워프 베이스라인 SVG `<path d="...">` 경로를 계산한다.
 */
export function buildWarpBaselinePathD(options: {
  readonly warpType: TitleWarpCurveType;
  readonly intensity: number;
  readonly widthPx: number;
  readonly heightPx: number;
}): TitleWarpPathResult {
  const intensity = clamp(Math.round(options.intensity), -100, 100);
  const w = Math.max(240, Math.round(options.widthPx));
  const h = Math.max(120, Math.round(options.heightPx));

  const startX = Math.round(w * 0.08);
  const endX = Math.round(w * 0.92);
  const midX = Math.round((startX + endX) / 2);
  const baseY = Math.round(h * 0.58);
  const maxDeflection = Math.round(h * 0.34 * (intensity / 100));

  switch (options.warpType) {
    case "arc": {
      const ctrlY = baseY - maxDeflection;
      return {
        warpType: "arc",
        intensity,
        pathD: `M ${startX} ${baseY} Q ${midX} ${ctrlY} ${endX} ${baseY}`,
        startPoint: { x: startX, y: baseY },
        endPoint: { x: endX, y: baseY },
        peakOffsetPx: -maxDeflection,
        skewAngleDeg: 0,
      };
    }
    case "arch": {
      const ctrlY = baseY - Math.round(maxDeflection * 1.25);
      const q1X = Math.round(startX + (endX - startX) * 0.25);
      const q3X = Math.round(startX + (endX - startX) * 0.75);
      return {
        warpType: "arch",
        intensity,
        pathD: `M ${startX} ${baseY} C ${q1X} ${ctrlY}, ${q3X} ${ctrlY}, ${endX} ${baseY}`,
        startPoint: { x: startX, y: baseY },
        endPoint: { x: endX, y: baseY },
        peakOffsetPx: Math.round(-maxDeflection * 1.25),
        skewAngleDeg: 0,
      };
    }
    case "wave": {
      const c1X = Math.round(startX + (endX - startX) * 0.33);
      const c2X = Math.round(startX + (endX - startX) * 0.67);
      const c1Y = baseY - maxDeflection;
      const c2Y = baseY + maxDeflection;
      return {
        warpType: "wave",
        intensity,
        pathD: `M ${startX} ${baseY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${baseY}`,
        startPoint: { x: startX, y: baseY },
        endPoint: { x: endX, y: baseY },
        peakOffsetPx: maxDeflection,
        skewAngleDeg: 0,
      };
    }
    case "rise": {
      const startY = baseY + Math.round(maxDeflection * 0.55);
      const endY = baseY - Math.round(maxDeflection * 0.55);
      const c1X = Math.round(startX + (endX - startX) * 0.35);
      const c2X = Math.round(startX + (endX - startX) * 0.65);
      return {
        warpType: "rise",
        intensity,
        pathD: `M ${startX} ${startY} C ${c1X} ${baseY}, ${c2X} ${endY}, ${endX} ${endY}`,
        startPoint: { x: startX, y: startY },
        endPoint: { x: endX, y: endY },
        peakOffsetPx: endY - startY,
        skewAngleDeg: Number((-intensity * 0.14).toFixed(1)),
      };
    }
    case "flag": {
      const c1X = Math.round(startX + (endX - startX) * 0.28);
      const c2X = Math.round(startX + (endX - startX) * 0.72);
      const c1Y = baseY + Math.round(maxDeflection * 0.85);
      const c2Y = baseY - Math.round(maxDeflection * 0.85);
      return {
        warpType: "flag",
        intensity,
        pathD: `M ${startX} ${baseY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${baseY}`,
        startPoint: { x: startX, y: baseY },
        endPoint: { x: endX, y: baseY },
        peakOffsetPx: Math.round(maxDeflection * 0.85),
        skewAngleDeg: 0,
      };
    }
    case "slant": {
      const startY = baseY + Math.round(maxDeflection * 0.4);
      const endY = baseY - Math.round(maxDeflection * 0.4);
      const skewAngleDeg = Number((-intensity * 0.22).toFixed(1));
      return {
        warpType: "slant",
        intensity,
        pathD: `M ${startX} ${startY} L ${endX} ${endY}`,
        startPoint: { x: startX, y: startY },
        endPoint: { x: endX, y: endY },
        peakOffsetPx: endY - startY,
        skewAngleDeg,
      };
    }
    case "none":
    default:
      return {
        warpType: "none",
        intensity: 0,
        pathD: `M ${startX} ${baseY} L ${endX} ${baseY}`,
        startPoint: { x: startX, y: baseY },
        endPoint: { x: endX, y: baseY },
        peakOffsetPx: 0,
        skewAngleDeg: 0,
      };
  }
}

/**
 * 개별 글자(Glyph) 단위로 워프 곡선 위 좌표와 접선 회전각을 계산한다.
 */
export function computeWarpedGlyphTransforms(options: {
  readonly text: string;
  readonly warpType: TitleWarpCurveType;
  readonly intensity: number;
  readonly widthPx: number;
  readonly heightPx: number;
}): readonly WarpedGlyphTransform[] {
  const chars = Array.from(options.text.trim() || "툰스튜디오");
  const w = Math.max(240, options.widthPx);
  const h = Math.max(120, options.heightPx);
  const startX = w * 0.14;
  const spanX = w * 0.72;
  const baseY = h * 0.56;
  const normIntensity = clamp(options.intensity, -100, 100) / 100;
  const maxAmp = h * 0.22 * normIntensity;

  return chars.map((char, index) => {
    const t = chars.length <= 1 ? 0.5 : index / (chars.length - 1);
    const x = Number((startX + spanX * t).toFixed(1));
    let dy = 0;
    let rotationDeg = 0;
    let scaleY = 1;

    switch (options.warpType) {
      case "arc": {
        dy = -Math.sin(t * Math.PI) * maxAmp;
        rotationDeg = (0.5 - t) * 28 * normIntensity;
        break;
      }
      case "arch": {
        dy = -Math.sin(t * Math.PI) * maxAmp * 1.15;
        rotationDeg = (0.5 - t) * 18 * normIntensity;
        scaleY = Number((1 + Math.sin(t * Math.PI) * Math.abs(normIntensity) * 0.22).toFixed(2));
        break;
      }
      case "wave": {
        dy = -Math.sin(t * Math.PI * 2) * maxAmp * 0.75;
        rotationDeg = Math.cos(t * Math.PI * 2) * 16 * normIntensity;
        break;
      }
      case "rise": {
        dy = (0.5 - t) * maxAmp * 1.1;
        rotationDeg = -12 * normIntensity;
        break;
      }
      case "flag": {
        dy = Math.sin(t * Math.PI * 2) * maxAmp * 0.65;
        rotationDeg = -Math.cos(t * Math.PI * 2) * 14 * normIntensity;
        break;
      }
      case "slant": {
        dy = (0.5 - t) * maxAmp * 0.75;
        rotationDeg = -16 * normIntensity;
        scaleY = 1.06;
        break;
      }
      case "none":
      default:
        break;
    }

    return {
      charIndex: index,
      char,
      x,
      y: Number((baseY + dy).toFixed(1)),
      rotationDeg: Number(rotationDeg.toFixed(1)),
      scaleY,
    };
  });
}

/**
 * 웹툰 타이틀 로고 요청을 받아 완전한 독립형 SVG 마크업과 워프 데이터를 생성한다.
 */
export function buildTitleLogoSvgMarkup(
  request: TitleLogoRenderRequest,
): TitleLogoRenderOutput {
  const preset = getWebtoonTitlePreset(request.presetId);
  const widthPx = clamp(Math.round(request.widthPx ?? 840), 320, 2400);
  const heightPx = clamp(Math.round(request.heightPx ?? 320), 160, 1200);
  const warpType = request.warpType ?? preset.defaultWarpType;
  const warpIntensity = clamp(
    Math.round(request.warpIntensity ?? preset.defaultWarpIntensity),
    -100,
    100,
  );
  const fontSizePx = clamp(Math.round(request.fontSizePx ?? 72), 28, 160);
  const extrusionDepthPx = clamp(
    Math.round(request.extrusionDepthPx ?? preset.extrusionDepthPx),
    0,
    28,
  );

  const mainTitle = request.mainTitle.trim() || "황제의 밤을 훔친 마법사";
  const subtitle = (request.subtitle ?? "SEASON 1 · ORIGINAL WEBTOON").trim();
  const badgeText = (request.badgeText ?? preset.badgeEmblemText).trim();

  const stop0 = request.customPrimaryColor ?? preset.fillGradientStops[0];
  const stop1 = request.customAccentColor ?? preset.fillGradientStops[1];
  const stop2 = preset.fillGradientStops[2];

  const warpPath = buildWarpBaselinePathD({
    warpType,
    intensity: warpIntensity,
    widthPx,
    heightPx,
  });

  const glyphTransforms = computeWarpedGlyphTransforms({
    text: mainTitle,
    warpType,
    intensity: warpIntensity,
    widthPx,
    heightPx,
  });

  const rad = (preset.extrusionAngleDeg * Math.PI) / 180;
  const extrudeDx = Math.round(Math.cos(rad) * extrusionDepthPx);
  const extrudeDy = Math.round(Math.sin(rad) * Math.abs(extrusionDepthPx));

  const skewTransform =
    warpPath.skewAngleDeg !== 0
      ? ` transform="skewX(${warpPath.skewAngleDeg})"`
      : "";

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}" role="img" aria-label="${escapeXml(mainTitle)} 타이틀 로고">`,
    `  <defs>`,
    `    <linearGradient id="ts-title-grad-${preset.id}" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="${escapeXml(stop0)}" />`,
    `      <stop offset="52%" stop-color="${escapeXml(stop1)}" />`,
    `      <stop offset="100%" stop-color="${escapeXml(stop2)}" />`,
    `    </linearGradient>`,
    `    <path id="ts-warp-path-${preset.id}" d="${warpPath.pathD}" fill="none" />`,
    `  </defs>`,
    `  <rect width="100%" height="100%" rx="20" fill="#0B1020" fill-opacity="0.88" />`,
    badgeText
      ? `  <g transform="translate(${Math.round(widthPx / 2)}, 42)">` +
        `<rect x="-120" y="-16" width="240" height="28" rx="14" fill="${escapeXml(preset.primaryStrokeColor)}" stroke="${escapeXml( preset.outerStrokeColor)}" stroke-width="1.5" />` +
        `<text x="0" y="3" text-anchor="middle" fill="${escapeXml(stop0)}" font-size="12" font-weight="800" letter-spacing="2">${escapeXml(badgeText)}</text>` +
        `</g>`
      : "",
    `  <g${skewTransform}>`,
    extrusionDepthPx > 0
      ? `    <text font-family="${escapeXml(preset.fontFamily)}" font-size="${fontSizePx}" font-weight="${preset.fontWeight}" fill="${escapeXml(preset.extrusionColor)}" stroke="${escapeXml(preset.extrusionColor)}" stroke-width="${preset.outerStrokeWidthPx}" stroke-linejoin="round" paint-order="stroke fill" transform="translate(${extrudeDx}, ${extrudeDy})"><textPath href="#ts-warp-path-${preset.id}" startOffset="50%" text-anchor="middle">${escapeXml(mainTitle)}</textPath></text>`
      : "",
    `    <text font-family="${escapeXml(preset.fontFamily)}" font-size="${fontSizePx}" font-weight="${preset.fontWeight}" fill="none" stroke="${escapeXml(preset.outerStrokeColor)}" stroke-width="${preset.outerStrokeWidthPx}" stroke-linejoin="round"><textPath href="#ts-warp-path-${preset.id}" startOffset="50%" text-anchor="middle">${escapeXml(mainTitle)}</textPath></text>`,
    `    <text font-family="${escapeXml(preset.fontFamily)}" font-size="${fontSizePx}" font-weight="${preset.fontWeight}" fill="url(#ts-title-grad-${preset.id})" stroke="${escapeXml(preset.primaryStrokeColor)}" stroke-width="${preset.primaryStrokeWidthPx}" stroke-linejoin="round" paint-order="stroke fill"><textPath href="#ts-warp-path-${preset.id}" startOffset="50%" text-anchor="middle">${escapeXml(mainTitle)}</textPath></text>`,
    `  </g>`,
    subtitle
      ? `  <text x="${Math.round(widthPx / 2)}" y="${heightPx - 28}" text-anchor="middle" fill="#E2E8F0" font-size="15" font-weight="700" letter-spacing="3">${escapeXml(subtitle)}</text>`
      : "",
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");

  const cssPreviewFilter =
    preset.effectKind === "neon-glow"
      ? `drop-shadow(0 0 12px ${preset.outerStrokeColor}) drop-shadow(0 4px 10px ${preset.extrusionColor})`
      : preset.effectKind === "chromatic-glitch"
        ? `drop-shadow(-3px 0 0 ${preset.outerStrokeColor}) drop-shadow(3px 0 0 ${preset.extrusionColor})`
        : `drop-shadow(${extrudeDx}px ${extrudeDy}px 0px ${preset.extrusionColor})`;

  return {
    preset,
    warpPath,
    glyphTransforms,
    svgMarkup,
    cssPreviewFilter,
    contrastSummary: {
      strokeToFillDistinction: preset.primaryStrokeWidthPx >= 7 ? "high" : "medium",
      mobileThumbnailSafe: fontSizePx >= 44 && preset.primaryStrokeWidthPx >= 6,
    },
  };
}
