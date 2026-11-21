/**
 * Wave 13A · 어울리는 투시 배경 및 3단 깊이 군중 자동 드로잉 엔진.
 * 100% 무과금 로컬 결정적 알고리즘으로 컷의 주인공 시선 높이(소실점),
 * 시간대 OKLCH 팔레트, 주인공 Safe Halo 및 말풍선 회피를 자동 계산해
 * 투시가 일치하는 배경과 3단 깊이 군중 레이어를 함께 생성한다.
 */

import type { StudioBackgroundApply } from "../studio-background-presets";

import {
  generateMatchingWebtoonBackdropSvg,
  type BackdropGenerationOptions,
  type BackdropGenerationResult,
  type PerspectiveRay,
} from "./auto-bg-crowd-backdrop-svg";
import {
  circleIntersectsEllipse,
  circleIntersectsRect,
  computeProtagonistSafeHalo,
  DEPTH_TIER_PROFILES,
  expandRect,
  generateDepthSortedCrowdLayer,
  rectsIntersect,
  type Circle2D,
  type CrowdCollisionAudit,
  type CrowdGenerationOptions,
  type CrowdGenerationResult,
  type CrowdRgbaPixelLayer,
  type CrowdTierSummary,
  type CutRect,
  type DepthTierAttenuation,
  type Ellipse2D,
  type PlacedCrowdMember,
  type SafeHaloRegion,
} from "./auto-bg-crowd-crowd-layer";
import {
  AUTO_BG_THEME_CATALOG,
  buildOklchScenePalette,
  clampNumber,
  CROWD_DENSITY_LABELS_KO,
  CROWD_STYLE_VARIANTS,
  formatOklch,
  getColorTemperatureForTime,
  getCrowdStyleSpec,
  getThemeSpec,
  hashStringSeed,
  oklchToSrgbRgba,
  TIME_OF_DAY_LABELS_KO,
  type AutoBgThemeId,
  type AutoBgThemeSpec,
  type CrowdDensity,
  type CrowdStyleId,
  type CrowdStyleSpec,
  type CutMood,
  type DepthTier,
  type OklchColor,
  type OklchScenePalette,
  type PerspectiveMode,
  type TimeOfDay,
  type WebtoonGenre,
} from "./auto-bg-crowd-palettes";

export {
  AUTO_BG_THEME_CATALOG,
  buildOklchScenePalette,
  circleIntersectsEllipse,
  circleIntersectsRect,
  computeProtagonistSafeHalo,
  CROWD_DENSITY_LABELS_KO,
  CROWD_STYLE_VARIANTS,
  DEPTH_TIER_PROFILES,
  expandRect,
  formatOklch,
  generateDepthSortedCrowdLayer,
  generateMatchingWebtoonBackdropSvg,
  getCrowdStyleSpec,
  getThemeSpec,
  oklchToSrgbRgba,
  rectsIntersect,
  TIME_OF_DAY_LABELS_KO,
};

export type {
  AutoBgThemeId,
  AutoBgThemeSpec,
  BackdropGenerationOptions,
  BackdropGenerationResult,
  Circle2D,
  CrowdCollisionAudit,
  CrowdDensity,
  CrowdGenerationOptions,
  CrowdGenerationResult,
  CrowdRgbaPixelLayer,
  CrowdStyleId,
  CrowdStyleSpec,
  CrowdTierSummary,
  CutMood,
  CutRect,
  DepthTier,
  DepthTierAttenuation,
  Ellipse2D,
  OklchColor,
  OklchScenePalette,
  PerspectiveMode,
  PerspectiveRay,
  PlacedCrowdMember,
  SafeHaloRegion,
  TimeOfDay,
  WebtoonGenre,
};

export type CameraAngleHint = "eye-level" | "low-angle" | "high-angle";

export interface CutContextInput {
  readonly scenePrompt?: string;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly protagonistBox?: CutRect;
  readonly speechBubbles?: readonly CutRect[];
  readonly genreHint?: WebtoonGenre;
  readonly moodHint?: CutMood;
  readonly timeOfDayHint?: TimeOfDay;
  readonly cameraAngle?: CameraAngleHint;
}

export interface CutContextAnalysis {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly recommendedTheme: AutoBgThemeId;
  readonly recommendedTimeOfDay: TimeOfDay;
  readonly recommendedGenre: WebtoonGenre;
  readonly recommendedMood: CutMood;
  readonly perspectiveMode: PerspectiveMode;
  readonly vanishingPointX: number;
  readonly vanishingPointY: number;
  readonly secondaryVanishingPointX: number;
  readonly horizonRatio: number;
  readonly colorTemperatureKelvin: number;
  readonly palette: OklchScenePalette;
  readonly recommendedCrowdDensity: CrowdDensity;
  readonly recommendedCrowdCount: number;
  readonly protagonistBox: CutRect;
  readonly safeHalo: SafeHaloRegion;
  readonly speechBubbles: readonly CutRect[];
  readonly seed: number;
  readonly reasoningKo: string;
}

export interface AutoBgCrowdQuickPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly scenePrompt: string;
  readonly theme: AutoBgThemeId;
  readonly timeOfDay: TimeOfDay;
  readonly density: CrowdDensity;
}

export const AUTO_BG_CROWD_QUICK_PRESETS: readonly AutoBgCrowdQuickPreset[] = Object.freeze([
  {
    id: "preset-seoul-sunset",
    labelKo: "서울 노을 거리",
    scenePrompt: "노을 지는 서울 홍대 거리에서 주인공이 뒤돌아보는 장면",
    theme: "seoul-street",
    timeOfDay: "sunset",
    density: "medium",
  },
  {
    id: "preset-cafe-day",
    labelKo: "감성 카페 창가",
    scenePrompt: "오후 햇살이 들어오는 감성 카페 창가에서 마주 앉은 장면",
    theme: "cozy-cafe",
    timeOfDay: "day",
    density: "sparse",
  },
  {
    id: "preset-rofan-ballroom",
    labelKo: "로판 황궁 연회장",
    scenePrompt: "샹들리에가 빛나는 로판 황궁 대연회장에서 왈츠가 시작되는 밤",
    theme: "rofan-ballroom",
    timeOfDay: "night",
    density: "bustling",
  },
  {
    id: "preset-school-hallway",
    labelKo: "방과 후 학원 복도",
    scenePrompt: "노을 빛이 비치는 방과 후 학교 복도 창가에서 고백하는 장면",
    theme: "school-hallway",
    timeOfDay: "sunset",
    density: "medium",
  },
  {
    id: "preset-rainy-alley",
    labelKo: "비 오는 밤 골목",
    scenePrompt: "비 오는 밤 골목길에서 우산을 쓰고 긴장하며 걷는 장면",
    theme: "rainy-alley",
    timeOfDay: "rain",
    density: "sparse",
  },
  {
    id: "preset-han-river",
    labelKo: "한강 야경 산책",
    scenePrompt: "불빛이 반짝이는 한강 야경 다리 아래 강변 산책로",
    theme: "han-river-night",
    timeOfDay: "night",
    density: "sparse",
  },
]);

export function defaultProtagonistBox(canvasWidth: number, canvasHeight: number): CutRect {
  return {
    x: Math.round(canvasWidth * 0.34),
    y: Math.round(canvasHeight * 0.24),
    width: Math.round(canvasWidth * 0.32),
    height: Math.round(canvasHeight * 0.66),
  };
}

export function defaultSpeechBubbles(canvasWidth: number, canvasHeight: number): readonly CutRect[] {
  return Object.freeze([
    {
      x: Math.round(canvasWidth * 0.62),
      y: Math.round(canvasHeight * 0.06),
      width: Math.round(canvasWidth * 0.3),
      height: Math.round(canvasHeight * 0.14),
    },
  ]);
}

function inferThemeFromContext(
  prompt: string,
  genreHint?: WebtoonGenre,
): AutoBgThemeId {
  const normalized = prompt.trim().toLowerCase();
  let bestTheme: AutoBgThemeId | null = null;
  let bestScore = 0;

  for (const spec of AUTO_BG_THEME_CATALOG) {
    let score = 0;
    for (const kw of spec.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        score += kw.length >= 2 ? 3 : 2;
      }
    }
    if (genreHint && spec.defaultGenre === genreHint) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTheme = spec.id;
    }
  }

  if (bestTheme) return bestTheme;
  if (genreHint) {
    const byGenre = AUTO_BG_THEME_CATALOG.find((s) => s.defaultGenre === genreHint);
    if (byGenre) return byGenre.id;
  }
  return "seoul-street";
}

function inferTimeOfDay(
  prompt: string,
  theme: AutoBgThemeId,
  hint?: TimeOfDay,
): TimeOfDay {
  if (hint) return hint;
  const text = prompt.toLowerCase();
  if (/비\s|빗물|우산|소나기|장마|폭우|rain/u.test(text)) return "rain";
  if (/새벽|여명|동틀|이른\s*아침|dawn/u.test(text)) return "dawn";
  if (/노을|석양|황혼|해질|방과\s*후|저녁놀|sunset/u.test(text)) return "sunset";
  if (/밤|야경|심야|자정|별빛|달빛|네온|night/u.test(text)) return "night";
  if (/한낮|대낮|정오|오전|오후\s*햇살|맑은\s*날|day/u.test(text)) return "day";
  return getThemeSpec(theme).defaultTimeOfDay;
}

function inferMood(prompt: string, theme: AutoBgThemeId, hint?: CutMood): CutMood {
  if (hint) return hint;
  const text = prompt.toLowerCase();
  if (/고백|설렘|왈츠|키스|달콤|로맨틱|romantic/u.test(text)) return "romantic";
  if (/추격|긴장|대치|위기|싸움|느와르|tense/u.test(text)) return "tense";
  if (/그리움|쓸쓸|이별|눈물|고독|melancholic/u.test(text)) return "melancholic";
  if (/환호|공연|축제|열기|뛰어|energetic/u.test(text)) return "energetic";
  if (/비밀|안개|강호|기묘|mysterious/u.test(text)) return "mysterious";
  if (/평온|여유|커피|산책|calm/u.test(text)) return "calm";
  return getThemeSpec(theme).defaultMood;
}

function inferCrowdDensity(prompt: string, theme: AutoBgThemeId): CrowdDensity {
  const text = prompt.toLowerCase();
  if (/텅\s*빈|아무도\s*없|사람\s*없|인적\s*없|단둘|혼자만/u.test(text)) return "none";
  if (/북적|인파|만원|붐비|수많은|관객|무도회|연회|축제/u.test(text)) return "bustling";
  if (/한산|조용|드문드문|몇\s*명|소수/u.test(text)) return "sparse";
  if (/행인|학생들|손님들|사람들|거리/u.test(text)) return "medium";
  return getThemeSpec(theme).defaultDensity;
}

function recommendedCountForDensity(density: CrowdDensity): number {
  switch (density) {
    case "none":
      return 0;
    case "sparse":
      return 6;
    case "medium":
      return 12;
    case "bustling":
      return 20;
  }
}

/**
 * 컷 컨텍스트 분석기: 주인공 바운딩박스·장면 설명·장르·감정·시간대·말풍선 영역에서
 * 배경과 군중이 공유하는 소실점, OKLCH 색온도 팔레트, 테마, 군중 밀도를 자동 추론한다.
 */
export function analyzeCutContextForBackdrop(input: CutContextInput = {}): CutContextAnalysis {
  const canvasWidth = Math.round(clampNumber(input.canvasWidth ?? 720, 160, 4096));
  const canvasHeight = Math.round(clampNumber(input.canvasHeight ?? 1080, 160, 4096));
  const prompt = (input.scenePrompt ?? "").trim();

  const protagonistBox = input.protagonistBox ?? defaultProtagonistBox(canvasWidth, canvasHeight);
  const speechBubbles = input.speechBubbles ?? [];

  const recommendedTheme = inferThemeFromContext(prompt, input.genreHint);
  const themeSpec = getThemeSpec(recommendedTheme);
  const recommendedTimeOfDay = inferTimeOfDay(prompt, recommendedTheme, input.timeOfDayHint);
  const recommendedGenre = input.genreHint ?? themeSpec.defaultGenre;
  const recommendedMood = inferMood(prompt, recommendedTheme, input.moodHint);
  const recommendedCrowdDensity = inferCrowdDensity(prompt, recommendedTheme);
  const recommendedCrowdCount = recommendedCountForDensity(recommendedCrowdDensity);

  // 주인공 시선 높이 → 배경과 군중의 공통 소실점 Y 잠금
  const protagonistEyeY = protagonistBox.y + protagonistBox.height * 0.16;
  let cameraShift = 0;
  if (input.cameraAngle === "low-angle") cameraShift = canvasHeight * 0.12;
  else if (input.cameraAngle === "high-angle") cameraShift = -canvasHeight * 0.1;
  const vanishingPointY = Math.round(
    clampNumber(protagonistEyeY + cameraShift, canvasHeight * 0.2, canvasHeight * 0.74),
  );

  // 주인공 중심 반대쪽으로 소실점 X를 살짝 배치해 시선 유도력 강화
  const heroCenterX = protagonistBox.x + protagonistBox.width * 0.5;
  const rawVpX =
    recommendedTheme === "rofan-ballroom" || recommendedTheme === "school-hallway"
      ? canvasWidth * 0.5
      : heroCenterX < canvasWidth * 0.45
        ? canvasWidth * 0.58
        : heroCenterX > canvasWidth * 0.55
          ? canvasWidth * 0.42
          : canvasWidth * 0.5;
  const vanishingPointX = Math.round(clampNumber(rawVpX, canvasWidth * 0.2, canvasWidth * 0.8));
  const secondaryVanishingPointX = Math.round(
    vanishingPointX < canvasWidth * 0.5 ? canvasWidth * 0.94 : canvasWidth * 0.06,
  );

  const perspectiveMode: PerspectiveMode =
    /2점|코너|모퉁이|비스듬/u.test(prompt)
      ? "2-point"
      : /1점|정면|복도|중앙/u.test(prompt)
        ? "1-point"
        : themeSpec.defaultPerspective;

  const colorTemperatureKelvin = getColorTemperatureForTime(recommendedTimeOfDay, recommendedTheme);
  const palette = buildOklchScenePalette(recommendedTheme, recommendedTimeOfDay);
  const safeHalo = computeProtagonistSafeHalo(protagonistBox, canvasWidth, canvasHeight);
  const horizonRatio = Number((vanishingPointY / canvasHeight).toFixed(3));
  const seed = hashStringSeed(`${prompt}|${recommendedTheme}|${recommendedTimeOfDay}|${canvasWidth}x${canvasHeight}`);

  const horizonPct = Math.round(horizonRatio * 100);
  const timeLabel = TIME_OF_DAY_LABELS_KO[recommendedTimeOfDay];
  const densityLabel = CROWD_DENSITY_LABELS_KO[recommendedCrowdDensity];
  const reasoningKo = `주인공 눈높이(${horizonPct}%)에 지평선을 잠그고 ${timeLabel} 빛의 ${themeSpec.labelKo} 투시와 ${densityLabel} 군중 배치를 맞췄어요.`;

  return {
    canvasWidth,
    canvasHeight,
    recommendedTheme,
    recommendedTimeOfDay,
    recommendedGenre,
    recommendedMood,
    perspectiveMode,
    vanishingPointX,
    vanishingPointY,
    secondaryVanishingPointX,
    horizonRatio,
    colorTemperatureKelvin,
    palette,
    recommendedCrowdDensity,
    recommendedCrowdCount,
    protagonistBox,
    safeHalo,
    speechBubbles: Object.freeze([...speechBubbles]),
    seed,
    reasoningKo,
  };
}

export interface ComposeAutoBgCrowdOptions {
  readonly width: number;
  readonly height: number;
  readonly theme: AutoBgThemeId;
  readonly timeOfDay: TimeOfDay;
  readonly perspectiveMode: PerspectiveMode;
  readonly vanishingPointX: number;
  readonly vanishingPointY: number;
  readonly secondaryVanishingPointX?: number;
  readonly density: CrowdDensity;
  readonly protagonistBox: CutRect;
  readonly safeHaloPaddingPx?: number;
  readonly speechBubbles?: readonly CutRect[];
  readonly seed?: number;
  readonly showPreviewGuides?: boolean;
  readonly includeRgbaLayer?: boolean;
}

export interface ComposedAutoBgCrowdScene {
  readonly backdrop: BackdropGenerationResult;
  readonly crowd: CrowdGenerationResult;
  readonly previewSvg: string;
  readonly exportSvg: string;
  readonly backgroundApplyPayload: StudioBackgroundApply;
  readonly backdropOnlyApplyPayload: StudioBackgroundApply;
}

function buildSafeHaloPreviewOverlay(
  safeHalo: SafeHaloRegion,
  speechBubbles: readonly CutRect[],
): string {
  const haloStroke = formatOklch({ l: 0.72, c: 0.16, h: 150, a: 0.78 });
  const haloFill = formatOklch({ l: 0.72, c: 0.16, h: 150, a: 0.1 });
  const bubbleStroke = formatOklch({ l: 0.74, c: 0.15, h: 250, a: 0.72 });
  const { rect, faceEllipse } = safeHalo;
  const bubbleMarkup = speechBubbles
    .map(
      (b) =>
        `<rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.width.toFixed(1)}" height="${b.height.toFixed(1)}" rx="10" fill="none" stroke="${bubbleStroke}" stroke-width="1.4" stroke-dasharray="4 4"/>`,
    )
    .join("");

  return [
    `<g id="preview-safe-halo-guide">`,
    `<rect x="${rect.x.toFixed(1)}" y="${rect.y.toFixed(1)}" width="${rect.width.toFixed(1)}" height="${rect.height.toFixed(1)}" rx="14" fill="${haloFill}" stroke="${haloStroke}" stroke-width="1.6" stroke-dasharray="6 4"/>`,
    `<ellipse cx="${faceEllipse.cx.toFixed(1)}" cy="${faceEllipse.cy.toFixed(1)}" rx="${faceEllipse.rx.toFixed(1)}" ry="${faceEllipse.ry.toFixed(1)}" fill="none" stroke="${haloStroke}" stroke-width="1.2" stroke-dasharray="3 3"/>`,
    bubbleMarkup,
    `</g>`,
  ].join("");
}

/** 배경 SVG와 3단 깊이 군중 레이어를 하나의 투시 잠금 씬으로 합성한다. */
export function composeAutoBgCrowdScene(
  options: ComposeAutoBgCrowdOptions,
): ComposedAutoBgCrowdScene {
  const backdropClean = generateMatchingWebtoonBackdropSvg({
    width: options.width,
    height: options.height,
    theme: options.theme,
    timeOfDay: options.timeOfDay,
    perspectiveMode: options.perspectiveMode,
    vanishingPointX: options.vanishingPointX,
    vanishingPointY: options.vanishingPointY,
    secondaryVanishingPointX: options.secondaryVanishingPointX,
    showPerspectiveGuides: false,
    seed: options.seed,
  });

  const backdropPreview = options.showPreviewGuides
    ? generateMatchingWebtoonBackdropSvg({
        width: options.width,
        height: options.height,
        theme: options.theme,
        timeOfDay: options.timeOfDay,
        perspectiveMode: options.perspectiveMode,
        vanishingPointX: options.vanishingPointX,
        vanishingPointY: options.vanishingPointY,
        secondaryVanishingPointX: options.secondaryVanishingPointX,
        showPerspectiveGuides: true,
        seed: options.seed,
      })
    : backdropClean;

  const crowd = generateDepthSortedCrowdLayer({
    width: backdropClean.width,
    height: backdropClean.height,
    vanishingPointX: backdropClean.vanishingPoint.x,
    vanishingPointY: backdropClean.vanishingPoint.y,
    theme: options.theme,
    timeOfDay: options.timeOfDay,
    density: options.density,
    protagonistBox: options.protagonistBox,
    safeHaloPaddingPx: options.safeHaloPaddingPx,
    speechBubbles: options.speechBubbles,
    seed: options.seed,
    includeRgbaLayer: options.includeRgbaLayer ?? false,
  });

  const w = backdropClean.width;
  const h = backdropClean.height;
  const combinedDefs = `${backdropClean.defsMarkup}${crowd.defsMarkup}`;
  const exportSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${combinedDefs}</defs><g id="layer-backdrop">${backdropClean.innerMarkup}</g><g id="layer-crowd">${crowd.innerMarkup}</g></svg>`;

  const safeHaloOverlay = options.showPreviewGuides
    ? buildSafeHaloPreviewOverlay(crowd.safeHalo, crowd.speechBubbles)
    : "";
  const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${combinedDefs}</defs><g id="layer-backdrop">${backdropPreview.innerMarkup}</g><g id="layer-crowd">${crowd.innerMarkup}</g>${safeHaloOverlay}</svg>`;

  const themeSpec = getThemeSpec(options.theme);
  const timeLabel = TIME_OF_DAY_LABELS_KO[options.timeOfDay];
  const label = `${themeSpec.labelKo} · ${timeLabel} (군중 ${crowd.members.length}명)`;

  const backgroundApplyPayload: StudioBackgroundApply = {
    kind: "svg",
    svg: exportSvg,
    width: w,
    height: h,
    presetId: `auto-bg-crowd:${options.theme}:${options.timeOfDay}:${options.density}`,
    label,
  };

  const backdropOnlyApplyPayload: StudioBackgroundApply = {
    kind: "svg",
    svg: backdropClean.svg,
    width: w,
    height: h,
    presetId: `auto-bg-only:${options.theme}:${options.timeOfDay}`,
    label: `${themeSpec.labelKo} · ${timeLabel} 배경`,
  };

  return {
    backdrop: backdropClean,
    crowd,
    previewSvg,
    exportSvg,
    backgroundApplyPayload,
    backdropOnlyApplyPayload,
  };
}
