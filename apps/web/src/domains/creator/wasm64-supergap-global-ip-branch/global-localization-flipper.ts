/**
 * #33 글로벌 4대 문화권 현지화 QA 및 읽기 방향 반전기 (₩0 로컬 · 0 AI 토큰).
 *
 * - 한국(`ko-vertical-scroll`), 일본(`jp-rtl-manga`), 북미/글로벌(`en-ltr-comic`),
 *   중화권(`zh-vertical-scroll`) 간 패널·말풍선·꼬리 앵커·효과음 좌표를 반전·재색인한다.
 * - LTR ↔ RTL 대칭 반전은 완벽한 대합(involution)을 만족하며, 0 AI 토큰으로
 *   텍스트 팽창 오버플로·종서/횡서 비율·여백 침범·비대칭 배경·문화권 호칭 검수 플래그를 산출한다.
 */

import {
  CULTURAL_KEYWORD_RULES,
  DEFAULT_USD_EXCHANGE_RATES,
  GLOBAL_CULTURE_PROFILES,
  localizeCurrenciesAndUnits,
  roundMetric,
  type BalloonWritingMode,
  type ConvertedExpressionRecord,
  type CultureLocalizationProfile,
  type HorizontalReadingFlow,
  type LocalizationCultureId,
  type LocalizationCurrencyCode,
  type LocalizationReviewFlag,
  type LocalizationReviewFlagCode,
  type LocalizationReviewSeverity,
  type MeasurementSystem,
} from "./localization-rules-and-units";

export {
  CULTURAL_KEYWORD_RULES,
  DEFAULT_USD_EXCHANGE_RATES,
  GLOBAL_CULTURE_PROFILES,
  type BalloonWritingMode,
  type ConvertedExpressionRecord,
  type CultureLocalizationProfile,
  type HorizontalReadingFlow,
  type LocalizationCultureId,
  type LocalizationCurrencyCode,
  type LocalizationReviewFlag,
  type LocalizationReviewFlagCode,
  type LocalizationReviewSeverity,
  type MeasurementSystem,
};

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface LocalizationBalloonInput {
  readonly balloonId: string;
  readonly readingOrder: number;
  readonly speakerId?: string;
  readonly bounds: Rect2D;
  readonly tailTip: Point2D;
  readonly tailBase?: Point2D;
  readonly text: string;
  readonly fontSizePx: number;
  readonly writingMode?: BalloonWritingMode;
  readonly balloonShape?: "oval" | "rectangle" | "burst" | "thought" | "narration";
  readonly preserveOriginalText?: boolean;
}

export interface LocalizationSfxInput {
  readonly sfxId: string;
  readonly bounds: Rect2D;
  readonly rotationDeg: number;
  readonly text: string;
  readonly bakedIntoLineart?: boolean;
}

export interface LocalizationPanelInput {
  readonly panelId: string;
  readonly orderIndex: number;
  readonly bounds: Rect2D;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly hasAsymmetricTextInArt?: boolean;
  readonly hasCulturalGestureOrSymbol?: boolean;
  readonly balloons: readonly LocalizationBalloonInput[];
  readonly sfxItems?: readonly LocalizationSfxInput[];
}

export interface LocalizationFlipOptions {
  readonly autoConvertUnits?: boolean;
  readonly autoConvertCurrency?: boolean;
  readonly mirrorLayoutOnDirectionFlip?: boolean;
  readonly mirrorPanelsInCanvas?: boolean;
  readonly exchangeRates?: Partial<Record<LocalizationCurrencyCode, number>>;
  readonly rowClusterToleranceRatio?: number;
  readonly gutterSafetyMarginPx?: number;
}

export interface LocalizationEpisodeInput {
  readonly episodeId: string;
  readonly sourceCulture: LocalizationCultureId;
  readonly targetCulture: LocalizationCultureId;
  readonly panels: readonly LocalizationPanelInput[];
  readonly options?: LocalizationFlipOptions;
}

export interface TransformedBalloonResult {
  readonly balloonId: string;
  readonly speakerId?: string;
  readonly originalReadingOrder: number;
  readonly reindexedReadingOrder: number;
  readonly originalBounds: Rect2D;
  readonly transformedBounds: Rect2D;
  readonly originalTailTip: Point2D;
  readonly transformedTailTip: Point2D;
  readonly originalTailBase: Point2D;
  readonly transformedTailBase: Point2D;
  readonly sourceWritingMode: BalloonWritingMode;
  readonly targetWritingMode: BalloonWritingMode;
  readonly originalText: string;
  readonly localizedText: string;
  readonly fontSizePx: number;
  readonly recommendedFontSizePx: number;
  readonly estimatedOverflowRatio: number;
  readonly recommendedBounds: Rect2D;
}

export interface TransformedSfxResult {
  readonly sfxId: string;
  readonly text: string;
  readonly originalBounds: Rect2D;
  readonly transformedBounds: Rect2D;
  readonly originalRotationDeg: number;
  readonly transformedRotationDeg: number;
  readonly bakedIntoLineart: boolean;
}

export interface TransformedPanelResult {
  readonly panelId: string;
  readonly originalOrderIndex: number;
  readonly reindexedOrderIndex: number;
  readonly originalBounds: Rect2D;
  readonly transformedBounds: Rect2D;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly balloons: readonly TransformedBalloonResult[];
  readonly sfxItems: readonly TransformedSfxResult[];
}

export interface LocalizationAuditSummary {
  readonly totalPanels: number;
  readonly totalBalloons: number;
  readonly totalSfx: number;
  readonly mirroredBalloons: number;
  readonly reindexedPanels: number;
  readonly reindexedBalloons: number;
  readonly currencyConversions: number;
  readonly unitConversions: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly readinessScore: number;
  readonly aiTokensUsed: 0;
  readonly estimatedCloudCostKrw: 0;
}

export interface GlobalLocalizationReport {
  readonly episodeId: string;
  readonly sourceCulture: LocalizationCultureId;
  readonly targetCulture: LocalizationCultureId;
  readonly sourceProfile: CultureLocalizationProfile;
  readonly targetProfile: CultureLocalizationProfile;
  readonly horizontalFlipped: boolean;
  readonly writingModeChanged: boolean;
  readonly panels: readonly TransformedPanelResult[];
  readonly convertedExpressions: readonly ConvertedExpressionRecord[];
  readonly reviewFlags: readonly LocalizationReviewFlag[];
  readonly summary: LocalizationAuditSummary;
}

function mirrorRectX(rect: Rect2D, width: number): Rect2D {
  return { x: roundMetric(width - (rect.x + rect.width), 4), y: rect.y, width: rect.width, height: rect.height };
}

function mirrorPointX(point: Point2D, width: number): Point2D {
  return { x: roundMetric(width - point.x, 4), y: point.y };
}

function inferTailBase(bounds: Rect2D, tailTip: Point2D): Point2D {
  const cx = bounds.x + bounds.width * 0.5;
  const cy = bounds.y + bounds.height * 0.5;
  const dx = tailTip.x - cx;
  const dy = tailTip.y - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { x: roundMetric(cx, 4), y: roundMetric(bounds.y + bounds.height, 4) };
  }
  const scale = 1 / Math.max(Math.abs(dx) / Math.max(bounds.width * 0.5, 1e-3), Math.abs(dy) / Math.max(bounds.height * 0.5, 1e-3), 1e-3);
  return { x: roundMetric(cx + dx * scale, 4), y: roundMetric(cy + dy * scale, 4) };
}

function sortByReadingFlow<T>(
  items: readonly T[],
  getRect: (item: T) => Rect2D,
  flow: HorizontalReadingFlow,
  rowBandTolerancePx: number,
): T[] {
  const indexed = items.map((item, idx) => {
    const r = getRect(item);
    return { item, idx, topY: r.y, centerY: r.y + r.height * 0.5, centerX: r.x + r.width * 0.5 };
  });
  indexed.sort((a, b) => {
    if (Math.abs(a.topY - b.topY) > rowBandTolerancePx) {
      return a.topY - b.topY;
    }
    if (Math.abs(a.centerX - b.centerX) > 1e-4) {
      return flow === "rtl" ? b.centerX - a.centerX : a.centerX - b.centerX;
    }
    if (Math.abs(a.centerY - b.centerY) > 1e-4) {
      return a.centerY - b.centerY;
    }
    return a.idx - b.idx;
  });
  return indexed.map((entry) => entry.item);
}

function estimateTextOverflow(
  text: string,
  bounds: Rect2D,
  fontSizePx: number,
  sourceProfile: CultureLocalizationProfile,
  targetProfile: CultureLocalizationProfile,
  balloonShape: LocalizationBalloonInput["balloonShape"],
): { overflowRatio: number; recommendedFontSizePx: number; recommendedBounds: Rect2D } {
  const effectiveChars = Math.max(1, text.replace(/\s+/g, "").length);
  const relativeExpansion = targetProfile.textExpansionFactor / sourceProfile.textExpansionFactor;
  const requiredArea = effectiveChars * relativeExpansion * fontSizePx * fontSizePx * 1.18;
  const fillFactor = balloonShape === "rectangle" || balloonShape === "narration" ? 0.78 : 0.62;
  const overflowRatio = roundMetric(requiredArea / Math.max(1, bounds.width * bounds.height * fillFactor), 3);

  const recommendedFontSizePx =
    overflowRatio > 1
      ? Math.max(targetProfile.minFontSizePx, Math.floor(fontSizePx / Math.sqrt(overflowRatio)))
      : Math.max(fontSizePx, targetProfile.minFontSizePx);

  let recommendedBounds: Rect2D = bounds;
  if (overflowRatio > 1) {
    const scale = Math.min(1.6, Math.sqrt(overflowRatio));
    const nextW = roundMetric(bounds.width * scale, 2);
    const nextH = roundMetric(bounds.height * scale, 2);
    recommendedBounds = {
      x: roundMetric(bounds.x - (nextW - bounds.width) * 0.5, 2),
      y: roundMetric(bounds.y - (nextH - bounds.height) * 0.5, 2),
      width: nextW,
      height: nextH,
    };
  }
  return { overflowRatio, recommendedFontSizePx, recommendedBounds };
}

function auditBalloonGeometryAndCulture(
  panelId: string,
  panelW: number,
  panelH: number,
  balloon: LocalizationBalloonInput,
  bounds: Rect2D,
  tailTip: Point2D,
  targetWritingMode: BalloonWritingMode,
  sourceProfile: CultureLocalizationProfile,
  targetProfile: CultureLocalizationProfile,
  gutterSafetyMarginPx: number,
  overflowRatio: number,
  flagsOut: LocalizationReviewFlag[],
): void {
  if (balloon.fontSizePx < targetProfile.minFontSizePx) {
    flagsOut.push({
      code: "FONT_TOO_SMALL_FOR_CULTURE",
      severity: "warning",
      panelId,
      balloonId: balloon.balloonId,
      messageKo: `글꼴(${balloon.fontSizePx}px)이 ${targetProfile.labelKo} 최소 가독 기준(${targetProfile.minFontSizePx}px)보다 작습니다.`,
      suggestedActionKo: `최소 ${targetProfile.minFontSizePx}px 이상으로 글꼴 크기를 조정하세요.`,
    });
  }
  if (overflowRatio > 1.0) {
    flagsOut.push({
      code: "TEXT_OVERFLOW_EXPANSION",
      severity: overflowRatio > 1.35 ? "error" : "warning",
      panelId,
      balloonId: balloon.balloonId,
      messageKo: `${sourceProfile.id} → ${targetProfile.id} 텍스트 팽창 예측 결과 말풍선 수용량을 초과합니다(${overflowRatio}x).`,
      suggestedActionKo: "권장 말풍선 크기 확장 또는 대사 축약·줄바꿈 조정을 적용하세요.",
    });
  }
  const aspectRatio = bounds.width / Math.max(bounds.height, 1);
  if (targetWritingMode === "vertical-rl" && aspectRatio > 1.55) {
    flagsOut.push({
      code: "WRITING_MODE_ASPECT_MISMATCH",
      severity: "warning",
      panelId,
      balloonId: balloon.balloonId,
      messageKo: `일본 종서(vertical-rl) 대상이지만 말풍선이 가로형(종횡비 ${roundMetric(aspectRatio, 2)})입니다.`,
      suggestedActionKo: "세로로 긴 말풍선 비율로 재배치하세요.",
    });
  } else if (targetWritingMode === "horizontal-tb" && aspectRatio < 0.55) {
    flagsOut.push({
      code: "WRITING_MODE_ASPECT_MISMATCH",
      severity: "warning",
      panelId,
      balloonId: balloon.balloonId,
      messageKo: `가로쓰기(horizontal-tb) 대상이지만 세로로 좁은 말풍선(종횡비 ${roundMetric(aspectRatio, 2)})입니다.`,
      suggestedActionKo: "단어 분절 방지를 위해 말풍선 가로 폭을 확보하세요.",
    });
  }
  const outOfPanel =
    bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > panelW || bounds.y + bounds.height > panelH;
  const infringesMargin =
    !outOfPanel &&
    (bounds.x < gutterSafetyMarginPx ||
      bounds.y < gutterSafetyMarginPx ||
      bounds.x + bounds.width > panelW - gutterSafetyMarginPx ||
      bounds.y + bounds.height > panelH - gutterSafetyMarginPx);
  if (outOfPanel || infringesMargin) {
    flagsOut.push({
      code: "BALLOON_OUT_OF_SAFE_BOUNDS",
      severity: outOfPanel ? "error" : "warning",
      panelId,
      balloonId: balloon.balloonId,
      messageKo: outOfPanel
        ? "변환된 말풍선이 패널 경계를 벗어났습니다."
        : `변환된 말풍선이 안전 여백(${gutterSafetyMarginPx}px)을 침범했습니다.`,
      suggestedActionKo: "패널 안전 영역 내부로 말풍선 좌표를 보정하세요.",
    });
  }
  const tailOut = tailTip.x < 0 || tailTip.x > panelW || tailTip.y < 0 || tailTip.y > panelH;
  const tailInside =
    tailTip.x >= bounds.x &&
    tailTip.x <= bounds.x + bounds.width &&
    tailTip.y >= bounds.y &&
    tailTip.y <= bounds.y + bounds.height;
  if (tailOut || (balloon.balloonShape !== "narration" && tailInside)) {
    flagsOut.push({
      code: "TAIL_DETACHED_OR_INVALID",
      severity: tailOut ? "error" : "warning",
      panelId,
      balloonId: balloon.balloonId,
      messageKo: tailOut
        ? "말풍선 꼬리 끝점(tailTip)이 패널 바깥에 위치합니다."
        : "말풍선 꼬리 끝점이 말풍선 내부에 겹쳐 화자 지시가 불명확합니다.",
      suggestedActionKo: "화자 얼굴/입 방향으로 꼬리 앵커를 재지정하세요.",
    });
  }
  if (sourceProfile.id !== targetProfile.id) {
    for (let i = 0; i < CULTURAL_KEYWORD_RULES.length; i += 1) {
      const rule = CULTURAL_KEYWORD_RULES[i];
      if (balloon.text.indexOf(rule.token) !== -1) {
        flagsOut.push({
          code: "HONORIFIC_OR_CULTURAL_TERM_REVIEW",
          severity: "info",
          panelId,
          balloonId: balloon.balloonId,
          messageKo: `문화권 특화 표현 '${rule.token}'(${rule.categoryKo})이 감지되었습니다.`,
          suggestedActionKo: rule.adviceKo,
        });
      }
    }
  }
}

/**
 * 4대 문화권 간 웹툰/만화 레이아웃을 반전·재색인하고, 통화/도량형/문화권 QA 플래그를 ₩0 로컬로 산출한다.
 */
export function auditAndFlipGlobalLocalization(
  input: LocalizationEpisodeInput,
): GlobalLocalizationReport {
  const sourceProfile = GLOBAL_CULTURE_PROFILES[input.sourceCulture];
  const targetProfile = GLOBAL_CULTURE_PROFILES[input.targetCulture];
  const directionChanged = sourceProfile.horizontalFlow !== targetProfile.horizontalFlow;
  const mirrorLayoutOnDirectionFlip = input.options?.mirrorLayoutOnDirectionFlip ?? true;
  const horizontalFlipped = directionChanged && mirrorLayoutOnDirectionFlip;
  const writingModeChanged = sourceProfile.writingMode !== targetProfile.writingMode;

  const autoConvertUnits = input.options?.autoConvertUnits ?? true;
  const autoConvertCurrency = input.options?.autoConvertCurrency ?? true;
  const mirrorPanelsInCanvas = input.options?.mirrorPanelsInCanvas ?? true;
  const rowClusterToleranceRatio = input.options?.rowClusterToleranceRatio ?? 0.12;
  const gutterSafetyMarginPx = input.options?.gutterSafetyMarginPx ?? 16;
  const exchangeRates: Record<LocalizationCurrencyCode, number> = {
    USD: input.options?.exchangeRates?.USD ?? DEFAULT_USD_EXCHANGE_RATES.USD,
    KRW: input.options?.exchangeRates?.KRW ?? DEFAULT_USD_EXCHANGE_RATES.KRW,
    JPY: input.options?.exchangeRates?.JPY ?? DEFAULT_USD_EXCHANGE_RATES.JPY,
    CNY: input.options?.exchangeRates?.CNY ?? DEFAULT_USD_EXCHANGE_RATES.CNY,
  };

  const convertedExpressions: ConvertedExpressionRecord[] = [];
  const reviewFlags: LocalizationReviewFlag[] = [];
  let totalBalloons = 0;
  let totalSfx = 0;
  let mirroredBalloons = 0;
  let reindexedBalloons = 0;

  const stagedPanels: {
    readonly source: LocalizationPanelInput;
    readonly transformedBounds: Rect2D;
    readonly balloons: TransformedBalloonResult[];
    readonly sfxItems: TransformedSfxResult[];
  }[] = [];

  for (let p = 0; p < input.panels.length; p += 1) {
    const panel = input.panels[p];
    const transformedPanelBounds =
      horizontalFlipped && mirrorPanelsInCanvas
        ? mirrorRectX(panel.bounds, panel.canvasWidth)
        : { ...panel.bounds };

    if (horizontalFlipped && panel.hasAsymmetricTextInArt) {
      reviewFlags.push({
        code: "ASYMMETRIC_ART_FLIP_REVIEW",
        severity: "warning",
        panelId: panel.panelId,
        messageKo: "좌우 반전 패널에 비대칭 배경 요소(간판·시계·글자·손잡이)가 포함되어 있습니다.",
        suggestedActionKo: "배경 레이어를 분리 유지하고 말풍선만 반전하거나 간판을 리터칭하세요.",
      });
    }
    if (input.sourceCulture !== input.targetCulture && panel.hasCulturalGestureOrSymbol) {
      reviewFlags.push({
        code: "CULTURAL_GESTURE_REVIEW",
        severity: "warning",
        panelId: panel.panelId,
        messageKo: "대상 문화권에서 의미가 달라질 수 있는 제스처 또는 상징 요소가 포함된 패널입니다.",
        suggestedActionKo: "현지 감수 체크리스트로 손동작·기호·색채 의미를 확인하세요.",
      });
    }

    const panelW = panel.bounds.width;
    const panelH = panel.bounds.height;
    const stagedBalloons = panel.balloons.map((balloon) => {
      totalBalloons += 1;
      const origTailBase = balloon.tailBase ?? inferTailBase(balloon.bounds, balloon.tailTip);
      const tBounds = horizontalFlipped ? mirrorRectX(balloon.bounds, panelW) : { ...balloon.bounds };
      const tTailTip = horizontalFlipped ? mirrorPointX(balloon.tailTip, panelW) : { ...balloon.tailTip };
      const tTailBase = horizontalFlipped ? mirrorPointX(origTailBase, panelW) : { ...origTailBase };
      if (horizontalFlipped) {
        mirroredBalloons += 1;
      }
      const localizedText = localizeCurrenciesAndUnits(
        panel.panelId,
        balloon.balloonId,
        balloon.text,
        sourceProfile,
        targetProfile,
        exchangeRates,
        autoConvertCurrency,
        autoConvertUnits,
        balloon.preserveOriginalText ?? false,
        convertedExpressions,
        reviewFlags,
      );
      const overflow = estimateTextOverflow(
        localizedText,
        tBounds,
        balloon.fontSizePx,
        sourceProfile,
        targetProfile,
        balloon.balloonShape,
      );
      auditBalloonGeometryAndCulture(
        panel.panelId,
        panelW,
        panelH,
        balloon,
        tBounds,
        tTailTip,
        targetProfile.writingMode,
        sourceProfile,
        targetProfile,
        gutterSafetyMarginPx,
        overflow.overflowRatio,
        reviewFlags,
      );
      return { source: balloon, tBounds, tTailTip, origTailBase, tTailBase, localizedText, overflow };
    });

    const sortedBalloons = sortByReadingFlow(
      stagedBalloons,
      (item) => item.tBounds,
      targetProfile.horizontalFlow,
      Math.max(8, panelH * rowClusterToleranceRatio),
    );
    let panelReindexed = false;
    const balloons: TransformedBalloonResult[] = sortedBalloons.map((item, idx) => {
      const nextOrder = idx + 1;
      if (nextOrder !== item.source.readingOrder) {
        reindexedBalloons += 1;
        panelReindexed = true;
      }
      return {
        balloonId: item.source.balloonId,
        speakerId: item.source.speakerId,
        originalReadingOrder: item.source.readingOrder,
        reindexedReadingOrder: nextOrder,
        originalBounds: { ...item.source.bounds },
        transformedBounds: item.tBounds,
        originalTailTip: { ...item.source.tailTip },
        transformedTailTip: item.tTailTip,
        originalTailBase: item.origTailBase,
        transformedTailBase: item.tTailBase,
        sourceWritingMode: item.source.writingMode ?? sourceProfile.writingMode,
        targetWritingMode: targetProfile.writingMode,
        originalText: item.source.text,
        localizedText: item.localizedText,
        fontSizePx: item.source.fontSizePx,
        recommendedFontSizePx: item.overflow.recommendedFontSizePx,
        estimatedOverflowRatio: item.overflow.overflowRatio,
        recommendedBounds: item.overflow.recommendedBounds,
      };
    });
    if (panelReindexed) {
      reviewFlags.push({
        code: "READING_ORDER_REINDEXED",
        severity: "info",
        panelId: panel.panelId,
        messageKo: `${targetProfile.labelKo}(${targetProfile.horizontalFlow.toUpperCase()}) 기준에 따라 말풍선 읽기 순서를 재색인했습니다.`,
        suggestedActionKo: "대사 흐름이 화자 순서와 자연스럽게 일치하는지 확인하세요.",
      });
    }

    const sfxItems: TransformedSfxResult[] = (panel.sfxItems ?? []).map((sfx) => {
      totalSfx += 1;
      const baked = sfx.bakedIntoLineart ?? false;
      if (baked && input.sourceCulture !== input.targetCulture) {
        reviewFlags.push({
          code: "BAKED_SFX_REDRAW_REQUIRED",
          severity: "warning",
          panelId: panel.panelId,
          sfxId: sfx.sfxId,
          messageKo: `효과음 '${sfx.text}'가 선화에 병합되어 식자 전 배경 복원(클린플레이트)이 필요합니다.`,
          suggestedActionKo: "원본 분리 레이어를 확보하거나 로컬 인페인팅으로 배경을 복원하세요.",
        });
      }
      return {
        sfxId: sfx.sfxId,
        text: sfx.text,
        originalBounds: { ...sfx.bounds },
        transformedBounds: horizontalFlipped ? mirrorRectX(sfx.bounds, panelW) : { ...sfx.bounds },
        originalRotationDeg: sfx.rotationDeg,
        transformedRotationDeg: horizontalFlipped ? roundMetric(-sfx.rotationDeg, 3) : sfx.rotationDeg,
        bakedIntoLineart: baked,
      };
    });

    stagedPanels.push({ source: panel, transformedBounds: transformedPanelBounds, balloons, sfxItems });
  }

  const avgCanvasH =
    input.panels.length > 0
      ? input.panels.reduce((acc, p) => acc + p.canvasHeight, 0) / input.panels.length
      : 1000;
  const sortedPanels = sortByReadingFlow(
    stagedPanels,
    (entry) => entry.transformedBounds,
    targetProfile.horizontalFlow,
    Math.max(12, avgCanvasH * rowClusterToleranceRatio),
  );
  let reindexedPanels = 0;
  const panels: TransformedPanelResult[] = sortedPanels.map((entry, idx) => {
    const nextOrder = idx + 1;
    if (nextOrder !== entry.source.orderIndex) {
      reindexedPanels += 1;
    }
    return {
      panelId: entry.source.panelId,
      originalOrderIndex: entry.source.orderIndex,
      reindexedOrderIndex: nextOrder,
      originalBounds: { ...entry.source.bounds },
      transformedBounds: entry.transformedBounds,
      canvasWidth: entry.source.canvasWidth,
      canvasHeight: entry.source.canvasHeight,
      balloons: entry.balloons,
      sfxItems: entry.sfxItems,
    };
  });

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (let i = 0; i < reviewFlags.length; i += 1) {
    const sev = reviewFlags[i].severity;
    if (sev === "error") {
      errorCount += 1;
    } else if (sev === "warning") {
      warningCount += 1;
    } else {
      infoCount += 1;
    }
  }
  let currencyConversions = 0;
  let unitConversions = 0;
  for (let i = 0; i < convertedExpressions.length; i += 1) {
    if (convertedExpressions[i].kind === "currency") {
      currencyConversions += 1;
    } else {
      unitConversions += 1;
    }
  }

  return {
    episodeId: input.episodeId,
    sourceCulture: input.sourceCulture,
    targetCulture: input.targetCulture,
    sourceProfile,
    targetProfile,
    horizontalFlipped,
    writingModeChanged,
    panels,
    convertedExpressions,
    reviewFlags,
    summary: {
      totalPanels: panels.length,
      totalBalloons,
      totalSfx,
      mirroredBalloons,
      reindexedPanels,
      reindexedBalloons,
      currencyConversions,
      unitConversions,
      errorCount,
      warningCount,
      infoCount,
      readinessScore: Math.max(0, Math.min(100, 100 - errorCount * 22 - warningCount * 7)),
      aiTokensUsed: 0,
      estimatedCloudCostKrw: 0,
    },
  };
}
