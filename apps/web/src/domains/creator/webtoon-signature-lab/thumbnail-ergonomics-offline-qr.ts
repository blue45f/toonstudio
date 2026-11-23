/**
 * 웹툰 생존·건강·현장 검수 3종 코어 엔진:
 * 4) 160px 소형 썸네일 & 첫 3컷 이탈률 사전 점검 샌드박스 (auditThumbnailAndFirst3Cuts)
 * 5) 100% 로컬 손목 피로 감지 & 한 손·마우스 휠 단축키 자동 재매핑 (analyzeErgonomicFatigueAndRemap)
 * 6) 오프라인 '비행기 모드' OPFS 연재 금고 & QR 스마트폰 즉시 스크롤 검수 (buildOfflineVaultAndQrMirrorSession)
 */

export interface SrgbUnitTriplet { readonly r: number; readonly g: number; readonly b: number; }

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function srgbToLinear(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 상대 휘도(Relative Luminance) */
export function computeWcagRelativeLuminance(color: SrgbUnitTriplet): number {
  return 0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b);
}

/** WCAG 2.1 명암 대비비 (1.0..21.0) */
export function computeWcagContrastRatio(a: SrgbUnitTriplet, b: SrgbUnitTriplet): number {
  const la = computeWcagRelativeLuminance(a);
  const lb = computeWcagRelativeLuminance(b);
  return roundTo((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05), 2);
}

// === 4. 160px 소형 썸네일 & 첫 3컷 이탈률 사전 점검 샌드박스 ===

export type FeedThemeMode = "light" | "dark";
export type RetentionGrade = "S" | "A" | "B" | "C" | "D";

export interface NormalizedBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface ThumbnailSpecInput {
  readonly widthPx: number; readonly heightPx: number;
  readonly characterBox: NormalizedBox; readonly faceBox: NormalizedBox;
  readonly titleBox: NormalizedBox & { readonly fontSizePxAtSource: number; readonly strokeOutlinePx?: number; readonly lineCount: number };
  readonly titleTextSrgb: SrgbUnitTriplet; readonly backgroundSrgb: SrgbUnitTriplet; readonly borderEdgeSrgb: SrgbUnitTriplet;
  readonly visualClutterScore: number;
}
export interface FirstCutHookInput {
  readonly cutIndex: 1 | 2 | 3; readonly heightPx: number; readonly wordCount: number;
  readonly hasVisualHook: boolean; readonly hasEmotionalConflict: boolean;
  readonly contrastRatio: number; readonly scrollDepthToHookPx: number;
}
export interface ThumbnailAndFirst3CutsInput {
  readonly seriesTitle: string; readonly targetFeedWidthPx?: number;
  readonly thumbnail: ThumbnailSpecInput; readonly first3Cuts: readonly FirstCutHookInput[];
}
export interface FeedSimulationAudit {
  readonly mode: FeedThemeMode; readonly simulatedWidthPx: number; readonly simulatedHeightPx: number;
  readonly edgeContrastRatio: number; readonly blendsIntoFeed: boolean; readonly feedScore: number;
  readonly verdictKo: string; readonly verdictEn: string;
}
export interface FirstCutAuditItem {
  readonly cutIndex: 1 | 2 | 3; readonly hookScore: number;
  readonly textWallRisk: boolean; readonly scrollDelayRisk: boolean;
  readonly noteKo: string; readonly noteEn: string;
}
export interface RetentionImprovementAction {
  readonly priority: "high" | "medium" | "low";
  readonly target: "thumbnail" | "title" | "light-dark-feed" | "first-3-cuts";
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
}
export interface ThumbnailAndFirst3CutsReport {
  readonly seriesTitle: string; readonly simulatedWidthPx: number;
  readonly characterOccupancyPercent: number; readonly faceOccupancyPercent: number;
  readonly titleContrastRatio: number; readonly titleWcagAaPass: boolean;
  readonly renderedTitleFontPxAt160: number; readonly titleLegibilityScore: number;
  readonly lightFeedAudit: FeedSimulationAudit; readonly darkFeedAudit: FeedSimulationAudit;
  readonly thumbnailScore: number; readonly first3CutsAudit: readonly FirstCutAuditItem[];
  readonly first3CutsHookScore: number; readonly estimatedBounceRiskPercent: number;
  readonly overallRetentionScore: number; readonly grade: RetentionGrade;
  readonly improvementActions: readonly RetentionImprovementAction[];
}

const LIGHT_FEED_SURFACE: SrgbUnitTriplet = { r: 0.97, g: 0.97, b: 0.975 };
const DARK_FEED_SURFACE: SrgbUnitTriplet = { r: 0.085, g: 0.09, b: 0.11 };

export function auditThumbnailAndFirst3Cuts(input: ThumbnailAndFirst3CutsInput): ThumbnailAndFirst3CutsReport {
  const targetWidthPx = Math.max(120, Math.min(240, Math.round(input.targetFeedWidthPx ?? 160)));
  const thumb = input.thumbnail;
  const scale = targetWidthPx / Math.max(1, thumb.widthPx);
  const simulatedHeightPx = Math.round(thumb.heightPx * scale);

  const characterOccupancyPercent = roundTo(clamp(thumb.characterBox.width, 0, 1) * clamp(thumb.characterBox.height, 0, 1) * 100, 1);
  const faceOccupancyPercent = roundTo(clamp(thumb.faceBox.width, 0, 1) * clamp(thumb.faceBox.height, 0, 1) * 100, 1);

  let occupancyScore = 100;
  if (characterOccupancyPercent < 24) occupancyScore = Math.round(clamp((characterOccupancyPercent / 24) * 62, 12, 62));
  else if (characterOccupancyPercent > 78) occupancyScore = Math.round(clamp(100 - (characterOccupancyPercent - 78) * 1.6, 60, 96));
  if (faceOccupancyPercent < 8) occupancyScore = Math.round(occupancyScore * 0.68);
  else if (faceOccupancyPercent >= 12) occupancyScore = Math.min(100, occupancyScore + 6);

  const baseContrast = computeWcagContrastRatio(thumb.titleTextSrgb, thumb.backgroundSrgb);
  const titleContrastRatio = roundTo(Math.min(21, baseContrast + Math.min(1.6, (thumb.titleBox.strokeOutlinePx ?? 0) * scale * 0.55)), 2);
  const titleWcagAaPass = titleContrastRatio >= 4.5;
  const renderedTitleFontPxAt160 = roundTo(thumb.titleBox.fontSizePxAtSource * scale, 1);

  const fontSizeScore = renderedTitleFontPxAt160 >= 13
    ? 100
    : renderedTitleFontPxAt160 >= 10
      ? Math.round(68 + ((renderedTitleFontPxAt160 - 10) / 3) * 32)
      : Math.round(clamp((renderedTitleFontPxAt160 / 10) * 58, 10, 58));
  const contrastScore = Math.round(clamp(((titleContrastRatio - 1) / 6.5) * 100, 8, 100));
  const clutterPenalty = Math.round(clamp(thumb.visualClutterScore, 0, 1) * 28);
  const linePenalty = thumb.titleBox.lineCount > 2 ? (thumb.titleBox.lineCount - 2) * 12 : 0;
  const titleLegibilityScore = Math.round(clamp(fontSizeScore * 0.45 + contrastScore * 0.55 - clutterPenalty * 0.5 - linePenalty, 5, 100));

  const evaluateFeed = (mode: FeedThemeMode): FeedSimulationAudit => {
    const edgeContrastRatio = computeWcagContrastRatio(thumb.borderEdgeSrgb, mode === "light" ? LIGHT_FEED_SURFACE : DARK_FEED_SURFACE);
    const blendsIntoFeed = edgeContrastRatio < 1.65;
    const feedScore = Math.round(
      clamp((blendsIntoFeed ? edgeContrastRatio * 34 : Math.min(100, 58 + edgeContrastRatio * 9)) * 0.4 + occupancyScore * 0.3 + titleLegibilityScore * 0.3 - clutterPenalty * 0.35, 8, 100),
    );
    return {
      mode, simulatedWidthPx: targetWidthPx, simulatedHeightPx, edgeContrastRatio, blendsIntoFeed, feedScore,
      verdictKo: blendsIntoFeed
        ? `${mode === "light" ? "라이트" : "다크"} 피드 배경과 카드 테두리가 섞입니다(대비 ${edgeContrastRatio}:1).`
        : `${mode === "light" ? "라이트" : "다크"} 피드에서 카드 윤곽과 인물이 또렷합니다(대비 ${edgeContrastRatio}:1).`,
      verdictEn: blendsIntoFeed
        ? `Thumbnail border blends into ${mode} feed (${edgeContrastRatio}:1 edge contrast).`
        : `Card silhouette separates cleanly on ${mode} feed (${edgeContrastRatio}:1 edge contrast).`,
    };
  };

  const lightFeedAudit = evaluateFeed("light");
  const darkFeedAudit = evaluateFeed("dark");
  const thumbnailScore = Math.round(
    clamp(occupancyScore * 0.35 + titleLegibilityScore * 0.35 + Math.min(lightFeedAudit.feedScore, darkFeedAudit.feedScore) * 0.2 + Math.max(lightFeedAudit.feedScore, darkFeedAudit.feedScore) * 0.1 - clutterPenalty * 0.25, 5, 100),
  );

  const sortedCuts = [...input.first3Cuts].sort((a, b) => a.cutIndex - b.cutIndex).slice(0, 3);
  const first3CutsAudit: FirstCutAuditItem[] = [];
  let cutScoreSum = 0;

  for (const cut of sortedCuts) {
    const wordCeiling = cut.cutIndex === 1 ? 26 : 38;
    const textWallRisk = cut.wordCount > wordCeiling;
    const scrollDelayRisk = cut.cutIndex === 1 && cut.scrollDepthToHookPx > 820;
    let score = 38 + (cut.hasVisualHook ? 26 : 0) + (cut.hasEmotionalConflict ? 22 : 0) + Math.round(clamp((cut.contrastRatio - 1) / 10, 0, 1) * 14);
    if (textWallRisk) score -= Math.min(28, (cut.wordCount - wordCeiling) * 0.9);
    if (scrollDelayRisk) score -= 18;
    const clampedScore = Math.round(clamp(score, 8, 100));
    cutScoreSum += clampedScore;
    first3CutsAudit.push({
      cutIndex: cut.cutIndex, hookScore: clampedScore, textWallRisk, scrollDelayRisk,
      noteKo: textWallRisk ? `${cut.cutIndex}컷 대사(${cut.wordCount}단어)가 길어 초반 이탈 위험이 높습니다.` : scrollDelayRisk ? `첫 시각 후크 도달(${cut.scrollDepthToHookPx}px)이 늦습니다.` : cut.hasVisualHook && cut.hasEmotionalConflict ? `${cut.cutIndex}컷 시각·감정 후크가 즉시 작동합니다.` : `${cut.cutIndex}컷에 시각 또는 감정 갈등 후크를 보강하세요.`,
      noteEn: textWallRisk ? `Cut ${cut.cutIndex} has ${cut.wordCount} words, risking an early text-wall bounce.` : scrollDelayRisk ? `Visual hook arrives late at ${cut.scrollDepthToHookPx}px scroll depth.` : cut.hasVisualHook && cut.hasEmotionalConflict ? `Cut ${cut.cutIndex} delivers strong visual and narrative pull.` : `Reinforce Cut ${cut.cutIndex} with a clearer visual or emotional cue.`,
    });
  }

  const first3CutsHookScore = first3CutsAudit.length > 0 ? Math.round(clamp(cutScoreSum / first3CutsAudit.length, 5, 100)) : 0;
  const overallRetentionScore = Math.round(clamp(thumbnailScore * 0.5 + first3CutsHookScore * 0.5, 5, 100));
  const estimatedBounceRiskPercent = roundTo(clamp(100 - overallRetentionScore * 0.88, 6, 94), 1);
  const grade: RetentionGrade = overallRetentionScore >= 88 ? "S" : overallRetentionScore >= 76 ? "A" : overallRetentionScore >= 62 ? "B" : overallRetentionScore >= 46 ? "C" : "D";

  const improvementActions: RetentionImprovementAction[] = [];
  if (characterOccupancyPercent < 28 || faceOccupancyPercent < 9) {
    improvementActions.push({
      priority: "high", target: "thumbnail",
      titleKo: "160px 피드용 인물·얼굴 클로즈업 확대", titleEn: "Zoom in character & face for 160px feeds",
      detailKo: `현재 인물 ${characterOccupancyPercent}%·얼굴 ${faceOccupancyPercent}%입니다. 인물을 35% 이상, 얼굴을 11% 이상으로 확대하세요.`,
      detailEn: `Character occupies ${characterOccupancyPercent}% (face ${faceOccupancyPercent}%). Scale >= 35% / face >= 11%.`,
    });
  }
  if (!titleWcagAaPass || renderedTitleFontPxAt160 < 11) {
    improvementActions.push({
      priority: "high", target: "title",
      titleKo: "제목 명암 대비(WCAG AA 4.5:1) 및 축소 폰트 상향", titleEn: "Raise title WCAG AA contrast (>= 4.5:1) & 160px font size",
      detailKo: `현재 제목 대비 ${titleContrastRatio}:1, 160px 환산 ${renderedTitleFontPxAt160}px입니다. 2줄 이하·대비 4.5:1 이상을 확보하세요.`,
      detailEn: `Title contrast is ${titleContrastRatio}:1 at ${renderedTitleFontPxAt160}px effective height. Keep <= 2 lines with >= 4.5:1 contrast.`,
    });
  }
  if (lightFeedAudit.blendsIntoFeed || darkFeedAudit.blendsIntoFeed) {
    const targetFeedKo = lightFeedAudit.blendsIntoFeed && darkFeedAudit.blendsIntoFeed ? "라이트/다크 양쪽 피드" : lightFeedAudit.blendsIntoFeed ? "라이트 피드" : "다크 피드";
    improvementActions.push({
      priority: "medium", target: "light-dark-feed",
      titleKo: `${targetFeedKo} 경계 분리 림·배경 대비 보강`, titleEn: "Add inner rim contrast for light/dark feed separation",
      detailKo: `라이트 대비 ${lightFeedAudit.edgeContrastRatio}:1 / 다크 대비 ${darkFeedAudit.edgeContrastRatio}:1입니다. 카드 외곽 림 프레임을 보강하세요.`,
      detailEn: `Light edge ${lightFeedAudit.edgeContrastRatio}:1 vs Dark edge ${darkFeedAudit.edgeContrastRatio}:1. Add subtle rim framing.`,
    });
  }
  if (first3CutsHookScore < 70) {
    improvementActions.push({
      priority: "high", target: "first-3-cuts",
      titleKo: "첫 3컷 텍스트 밀도 축소 및 800px 이내 후크 배치", titleEn: "Trim opening text wall & land hook within 800px",
      detailKo: `첫 3컷 후크 점수 ${first3CutsHookScore}점입니다. 초반 설명 문장을 줄이고 첫 스크롤에 시각 질문을 배치하세요.`,
      detailEn: `First-3-cuts hook score is ${first3CutsHookScore}/100. Condense exposition and surface core tension early.`,
    });
  }

  return {
    seriesTitle: input.seriesTitle, simulatedWidthPx: targetWidthPx,
    characterOccupancyPercent, faceOccupancyPercent, titleContrastRatio, titleWcagAaPass,
    renderedTitleFontPxAt160, titleLegibilityScore, lightFeedAudit, darkFeedAudit, thumbnailScore,
    first3CutsAudit, first3CutsHookScore, estimatedBounceRiskPercent, overallRetentionScore, grade, improvementActions,
  };
}

// === 5. 100% 로컬 손목 피로 감지 & 한 손 단축키 자동 재매핑 ===

export type DominantHand = "right" | "left";
export type FatigueLevel = "fresh" | "caution" | "elevated" | "rest-now";

export interface UndoBurstEvent { readonly timestampSec: number; readonly toolId: string; }
export interface PressureWristSample {
  readonly timestampSec: number; readonly durationSec: number;
  readonly pressure01: number; readonly wristDeviationDeg: number; readonly tiltDeg: number; readonly toolId: string;
}
export interface ErgonomicSessionInput {
  readonly sessionDurationMin: number; readonly dominantHand: DominantHand; readonly mouseWheelAvailable: boolean;
  readonly undoEvents: readonly UndoBurstEvent[]; readonly strokeSamples: readonly PressureWristSample[];
  readonly toolUsageCounts: Readonly<Record<string, number>>;
}
export interface MicroStretchStep {
  readonly stepOrder: 1 | 2 | 3; readonly durationSec: number;
  readonly targetAreaKo: string; readonly targetAreaEn: string;
  readonly instructionKo: string; readonly instructionEn: string;
}
export interface OneHandShortcutRemap {
  readonly rank: 1 | 2 | 3; readonly toolId: string; readonly labelKo: string; readonly labelEn: string;
  readonly usageCount: number; readonly previousBinding: string;
  readonly recommendedOneHandKey: string; readonly recommendedMouseWheel: string;
  readonly rationaleKo: string; readonly rationaleEn: string;
}
export interface ErgonomicFatigueReport {
  readonly privacyMode: "local-memory-only"; readonly networkTelemetrySent: false;
  readonly dominantHand: DominantHand; readonly shortcutHand: DominantHand; readonly sessionDurationMin: number;
  readonly rapidUndoBurstCount: number; readonly undoPerMinute: number;
  readonly highPressureStreakSec: number; readonly excessiveWristBendRatio: number; readonly peakWristDeviationDeg: number;
  readonly fatigueScore: number; readonly fatigueLevel: FatigueLevel; readonly stretchRecommended: boolean;
  readonly microStretchPlan: readonly MicroStretchStep[]; readonly top3Remaps: readonly OneHandShortcutRemap[];
  readonly wristTravelReductionPercent: number;
}

const STUDIO_TOOL_META: Readonly<Record<string, { readonly labelKo: string; readonly labelEn: string; readonly defaultBinding: string }>> = {
  undo: { labelKo: "실행 취소(Undo)", labelEn: "Undo", defaultBinding: "Ctrl+Z" },
  "brush-pen": { labelKo: "G펜 / 메인 브러시", labelEn: "G-Pen / Main Brush", defaultBinding: "P" },
  eraser: { labelKo: "지우개", labelEn: "Eraser", defaultBinding: "E" },
  eyedropper: { labelKo: "스포이트", labelEn: "Eyedropper", defaultBinding: "Alt+Click" },
  "lasso-select": { labelKo: "올가미 선택", labelEn: "Lasso Select", defaultBinding: "M" },
  "pan-canvas": { labelKo: "캔버스 손바닥 이동", labelEn: "Pan Canvas", defaultBinding: "Space+Drag" },
  zoom: { labelKo: "확대 / 축소", labelEn: "Zoom View", defaultBinding: "Ctrl+Plus/Minus" },
  "flip-horizontal": { labelKo: "좌우 반전 검수", labelEn: "Flip Horizontal", defaultBinding: "Shift+H" },
  "bucket-fill": { labelKo: "닫고 채우기", labelEn: "Close & Fill", defaultBinding: "G" },
  "layer-toggle": { labelKo: "레이어 전환", labelEn: "Switch Layer", defaultBinding: "Ctrl+Shift+L" },
};

const LEFT_HAND_SLOTS = [
  { key: "Q (왼손 약지 홈)", wheel: "마우스 휠 클릭" },
  { key: "W (왼손 중지 홈)", wheel: "Shift + 마우스 휠" },
  { key: "A (왼손 약지 인접)", wheel: "Alt + 마우스 휠" },
] as const;

const RIGHT_HAND_SLOTS = [
  { key: "O (오른손 약지 홈)", wheel: "마우스 휠 클릭" },
  { key: "I (오른손 중지 홈)", wheel: "Shift + 마우스 휠" },
  { key: "L (오른손 약지 인접)", wheel: "Alt + 마우스 휠" },
] as const;

export function analyzeErgonomicFatigueAndRemap(input: ErgonomicSessionInput): ErgonomicFatigueReport {
  const durationMin = Math.max(1, input.sessionDurationMin);
  const shortcutHand: DominantHand = input.dominantHand === "right" ? "left" : "right";

  // 20초 윈도우 내 5회 이상 반복 Undo 버스트 탐지
  const sortedUndos = [...input.undoEvents].sort((a, b) => a.timestampSec - b.timestampSec);
  let rapidUndoBurstCount = 0;
  let lastBurstEndSec = -999;
  for (let i = 0; i < sortedUndos.length; i += 1) {
    const startEvt = sortedUndos[i];
    if (!startEvt || startEvt.timestampSec < lastBurstEndSec) continue;
    let count = 1;
    let endSec = startEvt.timestampSec;
    for (let j = i + 1; j < sortedUndos.length; j += 1) {
      const nextEvt = sortedUndos[j];
      if (!nextEvt || nextEvt.timestampSec - startEvt.timestampSec > 20) break;
      count += 1;
      endSec = nextEvt.timestampSec;
    }
    if (count >= 5) {
      rapidUndoBurstCount += 1;
      lastBurstEndSec = endSec + 1;
    }
  }
  const undoPerMinute = roundTo(sortedUndos.length / durationMin, 2);

  // 고필압(>=0.78) 연속 시간 & 손목 꺾임(|deg|>=22) 분석
  const sortedSamples = [...input.strokeSamples].sort((a, b) => a.timestampSec - b.timestampSec);
  let highPressureStreakSec = 0;
  let currentStreakSec = 0;
  let prevEndSec = -999;
  let bentCount = 0;
  let peakWristDeviationDeg = 0;

  for (const sample of sortedSamples) {
    const absDev = Math.abs(sample.wristDeviationDeg);
    if (absDev > peakWristDeviationDeg) peakWristDeviationDeg = absDev;
    if (absDev >= 22) bentCount += 1;
    const contiguous = sample.timestampSec - prevEndSec <= 6;
    if (sample.pressure01 >= 0.78) {
      currentStreakSec = contiguous ? currentStreakSec + sample.durationSec : sample.durationSec;
      if (currentStreakSec > highPressureStreakSec) highPressureStreakSec = currentStreakSec;
    } else {
      currentStreakSec = 0;
    }
    prevEndSec = sample.timestampSec + sample.durationSec;
  }

  const excessiveWristBendRatio = sortedSamples.length > 0 ? roundTo(bentCount / sortedSamples.length, 3) : 0;
  const undoRisk = clamp(rapidUndoBurstCount * 14 + Math.max(0, undoPerMinute - 1.5) * 6, 0, 34);
  const pressureRisk = clamp((highPressureStreakSec / 180) * 32, 0, 32);
  const wristBendRisk = clamp(excessiveWristBendRatio * 34 + Math.max(0, peakWristDeviationDeg - 24) * 0.7, 0, 34);
  const durationFactor = clamp((durationMin - 35) * 0.25, 0, 14);
  const fatigueScore = Math.round(clamp(undoRisk + pressureRisk + wristBendRisk + durationFactor, 0, 100));
  const fatigueLevel: FatigueLevel = fatigueScore >= 75 ? "rest-now" : fatigueScore >= 52 ? "elevated" : fatigueScore >= 28 ? "caution" : "fresh";

  const microStretchPlan: readonly MicroStretchStep[] = [
    {
      stepOrder: 1, durationSec: 20, targetAreaKo: "손목 굴근(전완 안쪽) 이완", targetAreaEn: "Wrist Flexor Release",
      instructionKo: highPressureStreakSec >= 90 ? "고필압 연속 구간 감지: 팔을 앞으로 펴고 손가락을 반대 손으로 20초간 부드럽게 당겨 주세요." : "펜을 내려놓고 손바닥을 펴 전완 안쪽을 20초간 늘려 주세요.",
      instructionEn: highPressureStreakSec >= 90 ? "Sustained high pen pressure detected: extend arm palm-forward and gently pull fingers back for 20s." : "Set stylus down and gently stretch inner forearm flexor for 20s.",
    },
    {
      stepOrder: 2, durationSec: 20, targetAreaKo: "척측 편위(손목 꺾임) 중립 회복", targetAreaEn: "Ulnar/Radial Neutral Reset",
      instructionKo: excessiveWristBendRatio >= 0.35 ? `손목 꺾임 비율 ${(excessiveWristBendRatio * 100).toFixed(0)}%: 가벼운 주먹을 쥐고 손목을 양방향으로 천천히 10회 회전하세요.` : "양손 손목을 중립 일직선으로 두고 천천히 원을 그리며 이완하세요.",
      instructionEn: excessiveWristBendRatio >= 0.35 ? `Wrist bend ratio reached ${(excessiveWristBendRatio * 100).toFixed(0)}%: roll relaxed wrists slowly 10 times each direction.` : "Keep wrists neutral and perform slow tension-release circles for 20s.",
    },
    {
      stepOrder: 3, durationSec: 15, targetAreaKo: "엄지·어깨 긴장 내려놓기", targetAreaEn: "Thumb Opposition & Shoulder Drop",
      instructionKo: "엄지 끝을 검지~새끼손가락에 가볍게 터치한 뒤 어깨를 3초 올렸다 툭 떨어뜨리세요.",
      instructionEn: "Tap thumb lightly to each fingertip, then shrug shoulders for 3s and drop completely.",
    },
  ];

  const rankedTools = Object.entries(input.toolUsageCounts)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);
  const handSlots = shortcutHand === "left" ? LEFT_HAND_SLOTS : RIGHT_HAND_SLOTS;
  const totalUses = Object.values(input.toolUsageCounts).reduce((sum, n) => sum + Math.max(0, n), 0);
  let top3Sum = 0;

  const top3Remaps: OneHandShortcutRemap[] = rankedTools.map(([toolId, usageCount], idx) => {
    top3Sum += usageCount;
    const meta = STUDIO_TOOL_META[toolId] ?? { labelKo: toolId, labelEn: toolId, defaultBinding: "Ctrl+Shift" };
    const slot = handSlots[idx] ?? handSlots[0];
    const rank = (idx + 1) as 1 | 2 | 3;
    return {
      rank, toolId, labelKo: meta.labelKo, labelEn: meta.labelEn, usageCount,
      previousBinding: meta.defaultBinding,
      recommendedOneHandKey: slot.key,
      recommendedMouseWheel: input.mouseWheelAvailable ? slot.wheel : "휠 미사용(한 손 단일키 전용)",
      rationaleKo: `세션 최빈 ${rank}위(${usageCount}회) 도구를 조합키(${meta.defaultBinding}) 없이 한 손 홈열로 재배치합니다.`,
      rationaleEn: `Moves #${rank} most-used tool (${usageCount} uses) from ${meta.defaultBinding} to a single-key / wheel trigger.`,
    };
  });

  const wristTravelReductionPercent = roundTo(clamp((totalUses > 0 ? top3Sum / totalUses : 0) * (input.mouseWheelAvailable ? 56 : 42), 0, 62), 1);

  return {
    privacyMode: "local-memory-only", networkTelemetrySent: false, dominantHand: input.dominantHand, shortcutHand,
    sessionDurationMin: durationMin, rapidUndoBurstCount, undoPerMinute,
    highPressureStreakSec: roundTo(highPressureStreakSec, 1), excessiveWristBendRatio,
    peakWristDeviationDeg: roundTo(peakWristDeviationDeg, 1), fatigueScore, fatigueLevel,
    stretchRecommended: fatigueScore >= 45, microStretchPlan, top3Remaps, wristTravelReductionPercent,
  };
}

// === 6. 오프라인 ‘비행기 모드’ 연재 금고 & QR 스마트폰 즉시 스크롤 검수 세션 ===

export interface OfflineVaultFileEntry {
  readonly path: string; readonly sizeBytes: number;
  readonly expectedChecksum: string; readonly actualChecksum: string; readonly persistedInOpfs: boolean;
}
export interface OfflineVaultQrInput {
  readonly workId: string; readonly episodeTitle: string; readonly episodeNumber: number;
  readonly airplaneModeActive: boolean; readonly opfsAvailable: boolean;
  readonly opfsQuotaBytes: number; readonly opfsUsedBytes: number;
  readonly lastSnapshotIso: string; readonly pendingSyncOps: number;
  readonly files: readonly OfflineVaultFileEntry[];
  readonly lanHost: string; readonly lanPort: number;
  readonly scrollCutCount: number; readonly viewportWidthPx?: number;
  readonly sessionTtlMinutes?: number; readonly issuedAtIso: string;
}
export interface OpfsChecklistItem {
  readonly id: "opfs-origin-storage" | "checksum-integrity" | "storage-headroom" | "airplane-zero-network" | "snapshot-freshness";
  readonly status: "pass" | "warn" | "fail";
  readonly labelKo: string; readonly labelEn: string; readonly detailKo: string; readonly detailEn: string;
}
export interface QrScrollMirrorSession {
  readonly sessionId: string; readonly pairingToken: string; readonly lanOnly: true; readonly externalCloudUsed: false;
  readonly mirrorUrl: string; readonly issuedAtIso: string; readonly expiresAtIso: string;
  readonly viewportWidthPx: number; readonly scrollCutCount: number; readonly mirrorPayloadJson: string;
}
export interface OfflineVaultAndQrMirrorResult {
  readonly workId: string; readonly episodeTitle: string; readonly airplaneModeActive: boolean;
  readonly vaultStatus: "sealed-safe" | "degraded" | "fault"; readonly integrityScore: number;
  readonly freeHeadroomRatio: number; readonly verifiedFileCount: number; readonly totalFileCount: number;
  readonly corruptedFilePaths: readonly string[]; readonly unpersistedFilePaths: readonly string[];
  readonly checklist: readonly OpfsChecklistItem[]; readonly mirrorSession: QrScrollMirrorSession;
  readonly qrModuleCount: 25; readonly qrMatrix: readonly (readonly boolean[])[];
  readonly qrSvgMarkup: string; readonly finderPatternIntact: boolean;
}

function deterministicHexHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x243f6a88;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((ch + i * 31) & 0xff), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** Version 2 (25×25) 결정론적 QR 매트릭스 생성 (3개 파인더·정렬·타이밍·마스크 데이터 비트) */
function buildDeterministicQrMatrix25(payload: string): readonly (readonly boolean[])[] {
  const size = 25;
  const grid: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));

  const setCell = (r: number, c: number, dark: boolean, lock = true): void => {
    const row = grid[r];
    const rRow = reserved[r];
    if (!row || !rRow || c < 0 || c >= size) return;
    row[c] = dark;
    if (lock) rRow[c] = true;
  };

  const placeFinder = (top: number, left: number): void => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark = inOuter && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setCell(r, c, dark, true);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      setCell(18 + dr, 18 + dc, Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0), true);
    }
  }
  for (let i = 8; i < size - 8; i += 1) {
    setCell(6, i, i % 2 === 0, true);
    setCell(i, 6, i % 2 === 0, true);
  }
  setCell(size - 8, 8, true, true);
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) { setCell(8, i, i % 2 === 0, true); setCell(i, 8, i % 2 === 1, true); }
  }
  for (let i = size - 8; i < size; i += 1) {
    setCell(8, i, i % 2 === 0, true); setCell(i, 8, i % 2 === 1, true);
  }

  const bytes: number[] = [];
  for (let i = 0; i < payload.length; i += 1) bytes.push(payload.charCodeAt(i) & 0xff);
  const digest = deterministicHexHash(payload);
  for (let i = 0; i < digest.length; i += 2) bytes.push(Number.parseInt(digest.slice(i, i + 2), 16) & 0xff);
  if (bytes.length === 0) bytes.push(0xa5);

  const bits: boolean[] = [];
  for (const byte of bytes) {
    for (let shift = 7; shift >= 0; shift -= 1) bits.push(((byte >> shift) & 1) === 1);
  }

  let bitCursor = 0;
  for (let colRight = size - 1; colRight > 0; colRight -= 2) {
    if (colRight === 6) colRight -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = ((size - 1 - colRight) >> 1) % 2 === 0 ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc += 1) {
        const col = colRight - dc;
        if (reserved[row]?.[col]) continue;
        const rawBit = bits[bitCursor % bits.length] ?? false;
        bitCursor += 1;
        setCell(row, col, rawBit !== ((row + col) % 2 === 0), false);
      }
    }
  }
  return grid;
}

function renderQrSvgMarkup(matrix: readonly (readonly boolean[])[], label: string): string {
  const size = matrix.length;
  const quiet = 2;
  const viewBox = size + quiet * 2;
  const rects: string[] = [];
  for (let r = 0; r < size; r += 1) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < size; c += 1) {
      if (row[c]) rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" />`);
    }
  }
  const safeLabel = label.replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}" role="img" aria-label="${safeLabel}" shape-rendering="crispEdges"><g fill="currentColor">${rects.join("")}</g></svg>`;
}

function verifyFinderPatterns(matrix: readonly (readonly boolean[])[]): boolean {
  const size = matrix.length;
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const expected = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        if ((matrix[top + r]?.[left + c] ?? false) !== expected) return false;
      }
    }
  }
  return true;
}

export function buildOfflineVaultAndQrMirrorSession(input: OfflineVaultQrInput): OfflineVaultAndQrMirrorResult {
  const viewportWidthPx = Math.max(320, Math.min(480, Math.round(input.viewportWidthPx ?? 390)));
  const ttlMin = Math.max(5, Math.min(120, Math.round(input.sessionTtlMinutes ?? 20)));
  const issuedMs = Date.parse(input.issuedAtIso);
  const safeIssuedMs = Number.isFinite(issuedMs) ? issuedMs : Date.parse("2026-11-23T12:00:00Z");
  const expiresAtIso = new Date(safeIssuedMs + ttlMin * 60_000).toISOString();

  const corruptedFilePaths: string[] = [];
  const unpersistedFilePaths: string[] = [];
  let verifiedFileCount = 0;
  for (const file of input.files) {
    const checksumOk = file.expectedChecksum.length > 0 && file.expectedChecksum === file.actualChecksum;
    if (!checksumOk) corruptedFilePaths.push(file.path);
    if (!file.persistedInOpfs) unpersistedFilePaths.push(file.path);
    if (checksumOk && file.persistedInOpfs) verifiedFileCount += 1;
  }

  const quota = Math.max(1, input.opfsQuotaBytes);
  const freeBytes = Math.max(0, quota - input.opfsUsedBytes);
  const freeHeadroomRatio = roundTo(freeBytes / quota, 3);
  const headroomSafe = freeHeadroomRatio >= 0.15 && freeBytes >= 64 * 1024 * 1024;
  const snapshotMs = Date.parse(input.lastSnapshotIso);
  const snapshotFresh = Number.isFinite(snapshotMs) && Math.abs(safeIssuedMs - snapshotMs) <= 24 * 3600_000;

  const checklist: OpfsChecklistItem[] = [
    { id: "opfs-origin-storage", status: input.opfsAvailable ? "pass" : "fail", labelKo: "OPFS 로컬 금고 마운트", labelEn: "OPFS Origin-Private Vault Mount", detailKo: input.opfsAvailable ? "SQLite·타일 버퍼가 OPFS 로컬 금고에 격리 보관됩니다." : "OPFS 사용 불가 · 브라우저 저장소 권한을 확인하세요.", detailEn: input.opfsAvailable ? "SQLite WAL and raster tiles are isolated inside OPFS." : "OPFS unavailable; check origin storage permission." },
    { id: "checksum-integrity", status: corruptedFilePaths.length > 0 ? "fail" : unpersistedFilePaths.length > 0 ? "warn" : "pass", labelKo: "파일 체크섬 · OPFS 영속성 무결성", labelEn: "File Checksum & OPFS Persistence", detailKo: corruptedFilePaths.length > 0 ? `체크섬 불일치 ${corruptedFilePaths.length}건(${corruptedFilePaths.join(", ")}). 즉시 복구 필요.` : unpersistedFilePaths.length > 0 ? `미기록 파일 ${unpersistedFilePaths.length}건을 플러시하세요.` : `전체 ${input.files.length}개 연재 파일 체크섬과 OPFS 기록이 100% 일치합니다.`, detailEn: corruptedFilePaths.length > 0 ? `Checksum mismatch in ${corruptedFilePaths.length} file(s): ${corruptedFilePaths.join(", ")}.` : unpersistedFilePaths.length > 0 ? `${unpersistedFilePaths.length} file(s) pending OPFS flush.` : `All ${input.files.length} vault files verified 100%.` },
    { id: "storage-headroom", status: headroomSafe ? "pass" : freeHeadroomRatio >= 0.08 ? "warn" : "fail", labelKo: "오프라인 저장 여유 공간", labelEn: "Offline Storage Headroom", detailKo: `가용 여력 ${(freeHeadroomRatio * 100).toFixed(1)}% (${Math.round(freeBytes / (1024 * 1024))} MiB 남음).`, detailEn: `${(freeHeadroomRatio * 100).toFixed(1)}% headroom (${Math.round(freeBytes / (1024 * 1024))} MiB free).` },
    { id: "airplane-zero-network", status: input.airplaneModeActive && input.pendingSyncOps > 0 ? "warn" : "pass", labelKo: "비행기 모드 무통신 봉인", labelEn: "Airplane-Mode Zero-Network Seal", detailKo: input.airplaneModeActive ? `오프라인 봉인 활성 · 대기 동기화 ${input.pendingSyncOps}건 로컬 저널 보관.` : "온라인 대기 중 · 비행기 모드 전환 시 무통신 작업 유지.", detailEn: input.airplaneModeActive ? `Offline seal active · ${input.pendingSyncOps} sync op(s) safely queued locally.` : "Ready for airplane mode with zero remote dependencies." },
    { id: "snapshot-freshness", status: snapshotFresh ? "pass" : "warn", labelKo: "최근 복구 스냅샷 신선도", labelEn: "Recovery Snapshot Freshness", detailKo: snapshotFresh ? `최신 복구 스냅샷(${input.lastSnapshotIso}) 확인 완료.` : `스냅샷(${input.lastSnapshotIso})이 오래되었습니다. 출발 전 갱신 권장.`, detailEn: snapshotFresh ? `Recent recovery snapshot (${input.lastSnapshotIso}) verified.` : `Snapshot (${input.lastSnapshotIso}) is stale; capture checkpoint.` },
  ];

  const failCount = checklist.filter((c) => c.status === "fail").length;
  const warnCount = checklist.filter((c) => c.status === "warn").length;
  const vaultStatus = failCount > 0 ? "fault" : warnCount > 0 ? "degraded" : "sealed-safe";
  const integrityScore = Math.round(clamp(100 - failCount * 35 - warnCount * 10, 0, 100));

  const fullHash = deterministicHexHash(`${input.workId}:${input.episodeNumber}:${input.lanHost}:${input.lanPort}:${input.issuedAtIso}`);
  const sessionId = `lan-${fullHash.slice(0, 8)}`;
  const pairingToken = fullHash.slice(8, 16);
  const mirrorUrl = `http://${input.lanHost}:${input.lanPort}/mirror/scroll?sid=${sessionId}&tok=${pairingToken}&w=${viewportWidthPx}&cuts=${input.scrollCutCount}`;
  const mirrorPayloadJson = JSON.stringify({ schema: "toonstudio.qr-scroll-mirror.v1", workId: input.workId, episodeNumber: input.episodeNumber, sessionId, lanOnly: true, externalCloudUsed: false, viewportWidthPx, scrollCutCount: input.scrollCutCount, expiresAtIso, mirrorUrl });
  const qrMatrix = buildDeterministicQrMatrix25(mirrorUrl);
  const qrSvgMarkup = renderQrSvgMarkup(qrMatrix, `QR Scroll Mirror ${input.workId} EP${input.episodeNumber}`);

  return {
    workId: input.workId, episodeTitle: input.episodeTitle, airplaneModeActive: input.airplaneModeActive,
    vaultStatus, integrityScore, freeHeadroomRatio, verifiedFileCount, totalFileCount: input.files.length,
    corruptedFilePaths, unpersistedFilePaths, checklist,
    mirrorSession: { sessionId, pairingToken, lanOnly: true, externalCloudUsed: false, mirrorUrl, issuedAtIso: input.issuedAtIso, expiresAtIso, viewportWidthPx, scrollCutCount: input.scrollCutCount, mirrorPayloadJson },
    qrModuleCount: 25, qrMatrix, qrSvgMarkup, finderPatternIntact: verifyFinderPatterns(qrMatrix),
  };
}

// === 데모 픽스처 ===

export function createDemoThumbnailAndCutsInput(simulateWeakDraft = false): ThumbnailAndFirst3CutsInput {
  if (simulateWeakDraft) {
    return {
      seriesTitle: "안개 속 계약자", targetFeedWidthPx: 160,
      thumbnail: {
        widthPx: 600, heightPx: 780,
        characterBox: { x: 0.36, y: 0.44, width: 0.34, height: 0.42 },
        faceBox: { x: 0.44, y: 0.46, width: 0.16, height: 0.18 },
        titleBox: { x: 0.1, y: 0.72, width: 0.8, height: 0.24, fontSizePxAtSource: 30, strokeOutlinePx: 0, lineCount: 3 },
        titleTextSrgb: { r: 0.78, g: 0.76, b: 0.74 }, backgroundSrgb: { r: 0.62, g: 0.61, b: 0.59 },
        borderEdgeSrgb: { r: 0.11, g: 0.12, b: 0.14 }, visualClutterScore: 0.78,
      },
      first3Cuts: [
        { cutIndex: 1, heightPx: 1200, wordCount: 54, hasVisualHook: false, hasEmotionalConflict: false, contrastRatio: 2.6, scrollDepthToHookPx: 1120 },
        { cutIndex: 2, heightPx: 980, wordCount: 48, hasVisualHook: false, hasEmotionalConflict: true, contrastRatio: 3.1, scrollDepthToHookPx: 1980 },
        { cutIndex: 3, heightPx: 940, wordCount: 44, hasVisualHook: true, hasEmotionalConflict: false, contrastRatio: 3.4, scrollDepthToHookPx: 2800 },
      ],
    };
  }
  return {
    seriesTitle: "새벽 옥상의 증명", targetFeedWidthPx: 160,
    thumbnail: {
      widthPx: 600, heightPx: 780,
      characterBox: { x: 0.14, y: 0.08, width: 0.72, height: 0.74 },
      faceBox: { x: 0.3, y: 0.16, width: 0.4, height: 0.38 },
      titleBox: { x: 0.08, y: 0.74, width: 0.84, height: 0.2, fontSizePxAtSource: 54, strokeOutlinePx: 3, lineCount: 2 },
      titleTextSrgb: { r: 0.98, g: 0.97, b: 0.94 }, backgroundSrgb: { r: 0.14, g: 0.19, b: 0.31 },
      borderEdgeSrgb: { r: 0.46, g: 0.5, b: 0.58 }, visualClutterScore: 0.18,
    },
    first3Cuts: [
      { cutIndex: 1, heightPx: 820, wordCount: 12, hasVisualHook: true, hasEmotionalConflict: true, contrastRatio: 11.4, scrollDepthToHookPx: 420 },
      { cutIndex: 2, heightPx: 860, wordCount: 18, hasVisualHook: true, hasEmotionalConflict: true, contrastRatio: 9.8, scrollDepthToHookPx: 1100 },
      { cutIndex: 3, heightPx: 920, wordCount: 15, hasVisualHook: true, hasEmotionalConflict: true, contrastRatio: 12.2, scrollDepthToHookPx: 1880 },
    ],
  };
}

export function createDemoErgonomicSessionInput(simulateCrunchFatigue = true, dominantHand: DominantHand = "right"): ErgonomicSessionInput {
  if (!simulateCrunchFatigue) {
    return {
      sessionDurationMin: 28, dominantHand, mouseWheelAvailable: true,
      undoEvents: [{ timestampSec: 120, toolId: "brush-pen" }, { timestampSec: 460, toolId: "brush-pen" }, { timestampSec: 910, toolId: "eraser" }],
      strokeSamples: [
        { timestampSec: 100, durationSec: 12, pressure01: 0.48, wristDeviationDeg: 9, tiltDeg: 52, toolId: "brush-pen" },
        { timestampSec: 260, durationSec: 14, pressure01: 0.55, wristDeviationDeg: 11, tiltDeg: 50, toolId: "brush-pen" },
        { timestampSec: 520, durationSec: 10, pressure01: 0.51, wristDeviationDeg: 8, tiltDeg: 54, toolId: "eraser" },
      ],
      toolUsageCounts: { "brush-pen": 64, undo: 28, eraser: 21, eyedropper: 14, "pan-canvas": 11 },
    };
  }
  return {
    sessionDurationMin: 95, dominantHand, mouseWheelAvailable: true,
    undoEvents: [210, 213, 216, 219, 222, 225, 610, 612, 615, 618, 620].map((t) => ({ timestampSec: t, toolId: "brush-pen" })),
    strokeSamples: [
      { timestampSec: 100, durationSec: 45, pressure01: 0.84, wristDeviationDeg: 25, tiltDeg: 44, toolId: "brush-pen" },
      { timestampSec: 147, durationSec: 52, pressure01: 0.89, wristDeviationDeg: 28, tiltDeg: 41, toolId: "brush-pen" },
      { timestampSec: 201, durationSec: 48, pressure01: 0.86, wristDeviationDeg: -24, tiltDeg: 42, toolId: "brush-pen" },
      { timestampSec: 251, durationSec: 44, pressure01: 0.82, wristDeviationDeg: 26, tiltDeg: 43, toolId: "eraser" },
      { timestampSec: 500, durationSec: 36, pressure01: 0.72, wristDeviationDeg: 18, tiltDeg: 48, toolId: "lasso-select" },
    ],
    toolUsageCounts: { undo: 148, "brush-pen": 132, eraser: 87, "pan-canvas": 54, eyedropper: 39, "flip-horizontal": 26 },
  };
}

export function createDemoOfflineVaultQrInput(airplaneModeActive = true, simulateChecksumFault = false): OfflineVaultQrInput {
  const mib = 1024 * 1024;
  return {
    workId: "toon-ep024", episodeTitle: "EP.24 새벽 옥상 대치", episodeNumber: 24,
    airplaneModeActive, opfsAvailable: true, opfsQuotaBytes: 2048 * mib, opfsUsedBytes: 420 * mib,
    lastSnapshotIso: "2026-11-23T11:45:00Z", pendingSyncOps: airplaneModeActive ? 2 : 0,
    files: [
      { path: "opfs://vault/ep024/document.sqlite", sizeBytes: 38 * mib, expectedChecksum: "a41f9b02c8e1", actualChecksum: "a41f9b02c8e1", persistedInOpfs: true },
      { path: "opfs://vault/ep024/cuts-tiles.bin", sizeBytes: 186 * mib, expectedChecksum: "7c310e44a90b", actualChecksum: simulateChecksumFault ? "dead0000bad1" : "7c310e44a90b", persistedInOpfs: true },
      { path: "opfs://vault/ep024/palette-locks.json", sizeBytes: 2 * mib, expectedChecksum: "55ab91de021f", actualChecksum: "55ab91de021f", persistedInOpfs: true },
    ],
    lanHost: "192.168.0.42", lanPort: 4173, scrollCutCount: 48, viewportWidthPx: 390, sessionTtlMinutes: 20, issuedAtIso: "2026-11-23T12:00:00Z",
  };
}
