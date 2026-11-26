/**
 * 내러티브 시선 동선(Eye-Flow)·읽기 순서·스크롤 페이싱 분석기 및
 * 스마트 폰트·에셋 라이선스 가디언 + 출판 준법(XMP/PNG/EPUB/C2PA) 메타데이터 주입기.
 *
 * - 외부 서버 호출 0회(₩0), 오프라인 완결 결정론 엔진.
 * - 세로 웹툰 컷·말풍선(`ko`/`en`/`ja`/`zh`)의 예측 시선 경로, 역행·교차, 보이스오버 TTS 순서,
 *   모바일(`390×844`) 텍스트 밀도·여백 리듬을 분석하고 정확한 재배치 힌트를 산출한다.
 * - 상업 권리 범위(`webtoon-free`·`paid-preview`·`print-book`·`merch`·`global-translation`),
 *   좌석·잔여 만료일·임베딩/서브셋 폰트 권한을 검증해 위반 에셋을 내보내기 전에 하드 차단하고,
 *   통과 시 XMP/PNG `iTXt`(CRC-32)/EPUB OPF/C2PA 프로비넌스 헤더를 자동 주입한다.
 */

export const DEFAULT_MOBILE_VIEWPORT_WIDTH_PX = 390;
export const DEFAULT_MOBILE_VIEWPORT_HEIGHT_PX = 844;
export const COMPLIANCE_SCHEMA_VERSION = "toonstudio.publishing-compliance.v1" as const;

export type NarrativeLocale = "ko" | "en" | "ja" | "zh";
export type HorizontalScanDirection = "ltr" | "rtl";
export type CutSceneTempo = "action" | "dialogue" | "reveal" | "pause";
export type IssueSeverity = "info" | "warning" | "error";

export type EyeFlowIssueKind =
  | "upward-backtrack" | "gaze-crossover" | "horizontal-zigzag" | "tts-order-mismatch"
  | "mobile-text-overdense" | "mobile-font-too-small"
  | "gutter-too-cramped" | "gutter-excessive-gap" | "reveal-gutter-too-short";

export interface NarrativeCutGeometry {
  readonly cutId: string; readonly index: number;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly sceneTempo?: CutSceneTempo; readonly focalPoint?: { readonly x: number; readonly y: number };
}

export interface SpeechBalloonNode {
  readonly balloonId: string; readonly cutId: string; readonly speakerId: string; readonly text: string;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly authoredReadingOrder: number; readonly ttsSequenceOrder?: number; readonly fontSizePx?: number;
  readonly tailTarget?: { readonly x: number; readonly y: number };
}

export interface NarrativeReadingFlowInput {
  readonly locale: NarrativeLocale; readonly canvasWidthPx: number;
  readonly cuts: readonly NarrativeCutGeometry[]; readonly balloons: readonly SpeechBalloonNode[];
  readonly horizontalDirection?: HorizontalScanDirection;
  readonly mobileViewportWidthPx?: number; readonly mobileViewportHeightPx?: number;
  readonly bandClusterThresholdPx?: number; readonly backtrackTolerancePx?: number;
}

export interface GazeWaypoint {
  readonly stepIndex: number; readonly balloonId: string; readonly cutId: string;
  readonly centerX: number; readonly centerY: number;
  readonly authoredReadingOrder: number; readonly naturalReadingOrder: number; readonly ttsSequenceOrder: number;
  readonly dx: number; readonly dy: number; readonly saccadeDistancePx: number; readonly isUpwardBacktrack: boolean;
}

export interface EyeFlowIssue {
  readonly issueId: string; readonly kind: EyeFlowIssueKind; readonly severity: IssueSeverity;
  readonly primaryBalloonId?: string; readonly secondaryBalloonId?: string; readonly cutId?: string;
  readonly metricValue: number; readonly thresholdValue: number; readonly messageKo: string;
}

export interface BalloonRepositionHint {
  readonly balloonId: string; readonly reason: EyeFlowIssueKind;
  readonly currentX: number; readonly currentY: number; readonly suggestedX: number; readonly suggestedY: number;
  readonly deltaX: number; readonly deltaY: number; readonly suggestedTtsOrder?: number; readonly rationaleKo: string;
}

export interface MobileViewportDensityWindow {
  readonly windowIndex: number; readonly startYCanvasPx: number; readonly endYCanvasPx: number;
  readonly balloonIds: readonly string[]; readonly characterCount: number;
  readonly balloonAreaCoverageRatio: number; readonly minEffectiveFontPx: number; readonly overdense: boolean;
}

export interface GutterPacingMetric {
  readonly fromCutId: string; readonly toCutId: string;
  readonly gutterPx: number; readonly normalizedViewportRatio: number;
  readonly classification: "cramped" | "balanced" | "dramatic-pause" | "excessive-dead-space";
  readonly targetTempo: CutSceneTempo;
}

export interface NarrativeReadingFlowReport {
  readonly locale: NarrativeLocale; readonly horizontalDirection: HorizontalScanDirection;
  readonly mobileViewport: { readonly widthPx: number; readonly heightPx: number; readonly scaleFactor: number };
  readonly predictedGazePath: readonly GazeWaypoint[]; readonly authoredGazePath: readonly GazeWaypoint[];
  readonly issues: readonly EyeFlowIssue[]; readonly repositionHints: readonly BalloonRepositionHint[];
  readonly mobileDensityWindows: readonly MobileViewportDensityWindow[];
  readonly gutterMetrics: readonly GutterPacingMetric[];
  readonly backtrackCount: number; readonly crossoverCount: number; readonly ttsOrderConsistent: boolean;
  readonly peakMobileBalloonCoverageRatio: number; readonly peakMobileCharsPerViewport: number;
  readonly mobileReadabilityPass: boolean; readonly flowScore0To100: number; readonly serverCostKrw: 0;
}

export type PublishingRightsScope = "webtoon-free" | "paid-preview" | "print-book" | "merch" | "global-translation";
export type LicensedAssetKind = "font" | "3d-prop" | "brush" | "texture" | "audio" | "splat-scene";
export type FontEmbeddingPermission = "installable" | "editable" | "preview-and-print" | "restricted-no-embed" | "bitmap-only";
export type ExportArtifactFormat = "png" | "webp" | "epub" | "pdf" | "c2pa-bundle";
export type LicenseViolationReason =
  | "unregistered-asset" | "license-expired" | "non-commercial-restricted" | "scope-not-covered"
  | "seat-limit-exceeded" | "font-embedding-prohibited" | "font-subset-prohibited";

export interface LicensedAssetEntry {
  readonly assetId: string; readonly displayName: string; readonly assetKind: LicensedAssetKind;
  readonly vendor: string; readonly licenseName: string;
  readonly allowedScopes: readonly PublishingRightsScope[]; readonly commercialAllowed: boolean;
  /** 무기한 라이선스는 `null` 또는 생략, 기간제는 `YYYY-MM-DD` 또는 ISO-8601. */
  readonly expiresAtIso?: string | null; readonly seatLimit?: number; readonly activeSeats?: number;
  readonly fontEmbeddingPermission?: FontEmbeddingPermission; readonly subsetAllowed?: boolean;
  readonly attributionRequired?: boolean; readonly attributionText?: string; readonly sha256Hex?: string;
}

export interface LicenseAuditRequest {
  readonly targetScope: PublishingRightsScope; readonly usedAssetIds: readonly string[];
  readonly evaluationDateIso: string; readonly exportFormat: ExportArtifactFormat;
  readonly embedFonts?: boolean; readonly subsetFonts?: boolean; readonly expiringSoonThresholdDays?: number;
}

export interface AssetLicenseViolation {
  readonly assetId: string; readonly displayName: string; readonly assetKind: LicensedAssetKind | "unknown";
  readonly reason: LicenseViolationReason; readonly daysRemaining: number | null; readonly messageKo: string;
}

export interface AssetLicenseWarning {
  readonly assetId: string; readonly displayName: string;
  readonly reason: "expiring-soon" | "attribution-required";
  readonly daysRemaining: number | null; readonly messageKo: string;
}

export interface ClearedAssetSummary {
  readonly assetId: string; readonly displayName: string; readonly assetKind: LicensedAssetKind;
  readonly licenseName: string; readonly vendor: string; readonly daysRemaining: number | null;
  readonly subsetAllowed: boolean; readonly fontEmbeddingPermission?: FontEmbeddingPermission;
}

export interface LicenseAuditReport {
  readonly exportAllowed: boolean; readonly targetScope: PublishingRightsScope;
  readonly exportFormat: ExportArtifactFormat; readonly evaluationDateIso: string;
  readonly checkedAssetCount: number; readonly clearedAssets: readonly ClearedAssetSummary[];
  readonly blockingViolations: readonly AssetLicenseViolation[]; readonly warnings: readonly AssetLicenseWarning[];
  readonly requiredAttributions: readonly string[]; readonly minimumDaysRemaining: number | null;
  readonly serverCostKrw: 0;
}

export interface ComplianceInjectionInput {
  readonly workId: string; readonly episodeId: string; readonly episodeTitle: string;
  readonly creatorName: string; readonly publisherName?: string; readonly auditReport: LicenseAuditReport;
  readonly createdAtIso: string; readonly aiAssistDeclared?: boolean;
  readonly rawPngBytes?: Uint8Array; readonly strictThrowOnBlocked?: boolean;
}

export interface C2paManifestHeader {
  readonly schemaVersion: typeof COMPLIANCE_SCHEMA_VERSION; readonly claimGenerator: string;
  readonly instanceId: string; readonly targetScope: PublishingRightsScope; readonly rightsBomDigestSha256: string;
  readonly assertions: ReadonlyArray<{
    readonly label: string;
    readonly data: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  }>;
}

export interface ComplianceInjectionResult {
  readonly injected: boolean; readonly blocked: boolean; readonly blockingReasons: readonly string[];
  readonly rightsBomDigestSha256: string; readonly xmpPacketXml: string;
  readonly pngItxtChunk: Uint8Array; readonly pngItxtCrc32Hex: string; readonly injectedPngBytes?: Uint8Array;
  readonly epubOpfMetadataXml: string; readonly c2paManifestHeader: C2paManifestHeader; readonly serverCostKrw: 0;
}

const COMMERCIAL_SCOPES = new Set<PublishingRightsScope>([
  "paid-preview", "print-book", "merch", "global-translation",
]);
const LOCALE_CHAR_BUDGET_PER_VIEWPORT: Readonly<Record<NarrativeLocale, number>> = {
  ko: 115, ja: 120, zh: 110, en: 220,
};
const UTF8_ENCODER = new TextEncoder();
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function clamp(v: number, min: number, max: number): number { return v < min ? min : v > max ? max : v; }
function centerOf(b: SpeechBalloonNode): { readonly x: number; readonly y: number } {
  return { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 };
}
function orient2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** 끝점을 공유하지 않는 두 2D 선분의 내부 교차 여부를 정밀 판정한다. */
function segmentsProperlyIntersect(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number,
): boolean {
  const eps = 1e-4;
  if (
    Math.hypot(ax - cx, ay - cy) < eps || Math.hypot(ax - dx, ay - dy) < eps ||
    Math.hypot(bx - cx, by - cy) < eps || Math.hypot(bx - dx, by - dy) < eps
  ) { return false; }
  const o1 = orient2d(ax, ay, bx, by, cx, cy); const o2 = orient2d(ax, ay, bx, by, dx, dy);
  const o3 = orient2d(cx, cy, dx, dy, ax, ay); const o4 = orient2d(cx, cy, dx, dy, bx, by);
  return ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps));
}

function buildGazeWaypoints(
  ordered: readonly SpeechBalloonNode[],
  naturalOrderById: ReadonlyMap<string, number>,
  backtrackTolPx: number,
): GazeWaypoint[] {
  return ordered.map((b, i) => {
    const cur = centerOf(b);
    const prev = i > 0 ? centerOf(ordered[i - 1]) : cur;
    const dx = i > 0 ? cur.x - prev.x : 0;
    const dy = i > 0 ? cur.y - prev.y : 0;
    return {
      stepIndex: i, balloonId: b.balloonId, cutId: b.cutId,
      centerX: Number(cur.x.toFixed(2)), centerY: Number(cur.y.toFixed(2)),
      authoredReadingOrder: b.authoredReadingOrder,
      naturalReadingOrder: naturalOrderById.get(b.balloonId) ?? i + 1,
      ttsSequenceOrder: b.ttsSequenceOrder ?? b.authoredReadingOrder,
      dx: Number(dx.toFixed(2)), dy: Number(dy.toFixed(2)),
      saccadeDistancePx: Number(Math.hypot(dx, dy).toFixed(2)),
      isUpwardBacktrack: i > 0 && dy < -backtrackTolPx,
    };
  });
}

function sortByNaturalReadingOrder(
  balloons: readonly SpeechBalloonNode[],
  bandThresholdPx: number,
  horizontalDirection: HorizontalScanDirection,
): SpeechBalloonNode[] {
  const byY = [...balloons].sort((a, b) => {
    const cyDiff = a.y + a.height * 0.5 - (b.y + b.height * 0.5);
    return cyDiff !== 0 ? cyDiff : a.balloonId.localeCompare(b.balloonId);
  });
  const bands: SpeechBalloonNode[][] = [];
  for (let i = 0; i < byY.length; i += 1) {
    const b = byY[i];
    const cy = b.y + b.height * 0.5;
    const last = bands.length > 0 ? bands[bands.length - 1] : undefined;
    if (last && Math.abs(cy - (last[0].y + last[0].height * 0.5)) <= bandThresholdPx) {
      last.push(b);
    } else {
      bands.push([b]);
    }
  }
  const result: SpeechBalloonNode[] = [];
  for (let bi = 0; bi < bands.length; bi += 1) {
    bands[bi].sort((a, b) => {
      const cxA = a.x + a.width * 0.5;
      const cxB = b.x + b.width * 0.5;
      return horizontalDirection === "ltr" ? cxA - cxB : cxB - cxA;
    });
    result.push(...bands[bi]);
  }
  return result;
}

/**
 * 세로 스크롤 웹툰 컷·말풍선 레이아웃의 독자 시선 경로, 역행·교차, 보이스오버 TTS 일관성,
 * 모바일(`390×844`) 텍스트 밀도 및 여백 페이싱을 분석하고 좌표 재배치 힌트를 산출한다.
 */
export function analyzeNarrativeReadingFlow(input: NarrativeReadingFlowInput): NarrativeReadingFlowReport {
  const canvasWidthPx = Math.max(200, input.canvasWidthPx);
  const mobileW = Math.max(240, input.mobileViewportWidthPx ?? DEFAULT_MOBILE_VIEWPORT_WIDTH_PX);
  const mobileH = Math.max(400, input.mobileViewportHeightPx ?? DEFAULT_MOBILE_VIEWPORT_HEIGHT_PX);
  const scaleFactor = mobileW / canvasWidthPx;
  const horizontalDirection: HorizontalScanDirection = input.horizontalDirection ?? (input.locale === "ja" ? "rtl" : "ltr");
  const bandThresholdPx = Math.max(12, input.bandClusterThresholdPx ?? 64);
  const backtrackTolPx = Math.max(8, input.backtrackTolerancePx ?? 24);

  const sortedCuts = [...input.cuts].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.index - b.index));
  const authoredSorted = [...input.balloons].sort((a, b) =>
    a.authoredReadingOrder !== b.authoredReadingOrder
      ? a.authoredReadingOrder - b.authoredReadingOrder
      : a.balloonId.localeCompare(b.balloonId),
  );
  const naturalSorted = sortByNaturalReadingOrder(input.balloons, bandThresholdPx, horizontalDirection);

  const naturalOrderById = new Map<string, number>();
  naturalSorted.forEach((b, idx) => naturalOrderById.set(b.balloonId, idx + 1));
  const balloonById = new Map<string, SpeechBalloonNode>();
  input.balloons.forEach((b) => balloonById.set(b.balloonId, b));

  const predictedGazePath = buildGazeWaypoints(naturalSorted, naturalOrderById, backtrackTolPx);
  const authoredGazePath = buildGazeWaypoints(authoredSorted, naturalOrderById, backtrackTolPx);

  const issues: EyeFlowIssue[] = [];
  const repositionHints: BalloonRepositionHint[] = [];
  let issueSeq = 1;
  let backtrackCount = 0;
  let crossoverCount = 0;
  let ttsMismatchCount = 0;

  const pushIssue = (partial: Omit<EyeFlowIssue, "issueId">): void => {
    issues.push({ issueId: `ef-${issueSeq++}`, ...partial });
  };

  // 1) 상향 역행 & 수평 지그재그 탐지
  let consecutiveWideReversals = 0;
  let prevDxSign = 0;
  for (let i = 1; i < authoredGazePath.length; i += 1) {
    const prevWp = authoredGazePath[i - 1];
    const curWp = authoredGazePath[i];
    const curNode = balloonById.get(curWp.balloonId);
    const prevNode = balloonById.get(prevWp.balloonId);

    if (curWp.isUpwardBacktrack && curNode && prevNode) {
      backtrackCount += 1;
      const targetY = Math.round(prevNode.y + Math.max(prevNode.height * 0.65, backtrackTolPx + 18));
      pushIssue({
        kind: "upward-backtrack", severity: "error",
        primaryBalloonId: curNode.balloonId, secondaryBalloonId: prevNode.balloonId, cutId: curNode.cutId,
        metricValue: Number(Math.abs(curWp.dy).toFixed(1)), thresholdValue: backtrackTolPx,
        messageKo: `말풍선(${curNode.balloonId})이 직전 말풍선(${prevNode.balloonId})보다 ${Math.round(Math.abs(curWp.dy))}px 위에 있어 시선이 역행합니다.`,
      });
      repositionHints.push({
        balloonId: curNode.balloonId, reason: "upward-backtrack",
        currentX: curNode.x, currentY: curNode.y, suggestedX: curNode.x, suggestedY: targetY,
        deltaX: 0, deltaY: targetY - curNode.y, suggestedTtsOrder: curWp.naturalReadingOrder,
        rationaleKo: "직전 말풍선 하단 이후로 내려 자연스러운 상→하 스크롤 시선을 복원합니다.",
      });
    }

    const dxSign = curWp.dx > canvasWidthPx * 0.55 ? 1 : curWp.dx < -canvasWidthPx * 0.55 ? -1 : 0;
    if (dxSign !== 0 && prevDxSign !== 0 && dxSign !== prevDxSign) {
      consecutiveWideReversals += 1;
      if (consecutiveWideReversals >= 2 && curNode) {
        const centeredX = Math.round(clamp((canvasWidthPx - curNode.width) * 0.5, 16, Math.max(16, canvasWidthPx - curNode.width - 16)));
        pushIssue({
          kind: "horizontal-zigzag", severity: "warning", primaryBalloonId: curNode.balloonId, cutId: curNode.cutId,
          metricValue: Math.round(Math.abs(curWp.dx)), thresholdValue: Math.round(canvasWidthPx * 0.55),
          messageKo: `말풍선(${curNode.balloonId}) 구간에서 좌우 급반복 지그재그 시선 피로가 감지되었습니다.`,
        });
        repositionHints.push({
          balloonId: curNode.balloonId, reason: "horizontal-zigzag",
          currentX: curNode.x, currentY: curNode.y, suggestedX: centeredX, suggestedY: curNode.y,
          deltaX: centeredX - curNode.x, deltaY: 0, rationaleKo: "좌우 왕복 폭을 줄여 모바일 가독성을 높입니다.",
        });
      }
    } else if (dxSign !== 0) { consecutiveWideReversals = 0; }
    if (dxSign !== 0) { prevDxSign = dxSign; }
  }

  // 2) 시선 경로 선분 교차(Gaze Crossover)
  const segCount = Math.max(0, authoredGazePath.length - 1);
  for (let i = 0; i < segCount; i += 1) {
    const a = authoredGazePath[i]; const b = authoredGazePath[i + 1];
    for (let j = i + 2; j < segCount; j += 1) {
      const c = authoredGazePath[j]; const d = authoredGazePath[j + 1];
      if (!segmentsProperlyIntersect(a.centerX, a.centerY, b.centerX, b.centerY, c.centerX, c.centerY, d.centerX, d.centerY)) {
        continue;
      }
      crossoverCount += 1;
      const targetNode = balloonById.get(d.balloonId);
      const anchorNode = balloonById.get(c.balloonId);
      pushIssue({
        kind: "gaze-crossover", severity: "error",
        primaryBalloonId: d.balloonId, secondaryBalloonId: b.balloonId, cutId: d.cutId,
        metricValue: crossoverCount, thresholdValue: 0,
        messageKo: `시선 동선(${a.balloonId}→${b.balloonId})과 (${c.balloonId}→${d.balloonId})이 X자로 교차합니다.`,
      });
      if (targetNode && anchorNode) {
        const prefX = horizontalDirection === "ltr"
          ? Math.round(clamp(anchorNode.x + anchorNode.width * 0.35, 16, Math.max(16, canvasWidthPx - targetNode.width - 16)))
          : Math.round(clamp(anchorNode.x - targetNode.width * 0.35, 16, Math.max(16, canvasWidthPx - targetNode.width - 16)));
        const prefY = Math.round(Math.max(targetNode.y, anchorNode.y + anchorNode.height + 24));
        repositionHints.push({
          balloonId: targetNode.balloonId, reason: "gaze-crossover",
          currentX: targetNode.x, currentY: targetNode.y, suggestedX: prefX, suggestedY: prefY,
          deltaX: prefX - targetNode.x, deltaY: prefY - targetNode.y, suggestedTtsOrder: d.naturalReadingOrder,
          rationaleKo: "선행 대사 동선과 교차하지 않도록 수직 하방·진행 방향으로 말풍선을 분리합니다.",
        });
      }
    }
  }

  // 3) 보이스오버 TTS 읽기 순서 일관성
  for (let i = 0; i < authoredSorted.length; i += 1) {
    const node = authoredSorted[i];
    const expectedPos = i + 1;
    const naturalPos = naturalOrderById.get(node.balloonId) ?? expectedPos;
    const ttsOrder = node.ttsSequenceOrder ?? node.authoredReadingOrder;
    if (ttsOrder !== expectedPos || (node.ttsSequenceOrder !== undefined && node.ttsSequenceOrder !== naturalPos)) {
      ttsMismatchCount += 1;
      pushIssue({
        kind: "tts-order-mismatch", severity: "warning", primaryBalloonId: node.balloonId, cutId: node.cutId,
        metricValue: Math.abs(ttsOrder - expectedPos) + (ttsOrder !== naturalPos ? 1 : 0), thresholdValue: 0,
        messageKo: `말풍선(${node.balloonId})의 TTS 순서(${ttsOrder})가 작가/자연 시선 순서(${expectedPos}/${naturalPos})와 불일치합니다.`,
      });
      repositionHints.push({
        balloonId: node.balloonId, reason: "tts-order-mismatch",
        currentX: node.x, currentY: node.y, suggestedX: node.x, suggestedY: node.y,
        deltaX: 0, deltaY: 0, suggestedTtsOrder: naturalPos,
        rationaleKo: `AudioToon 보이스오버 순서를 자연 시선 순서(${naturalPos})로 동기화합니다.`,
      });
    }
  }

  // 4) 모바일 뷰포트(390×844) 텍스트 밀도 및 가독 폰트
  const vpCanvasH = mobileH / scaleFactor;
  const maxExtentY = Math.max(vpCanvasH, ...sortedCuts.map((c) => c.y + c.height), ...input.balloons.map((b) => b.y + b.height));
  const charBudget = LOCALE_CHAR_BUDGET_PER_VIEWPORT[input.locale];
  const stepY = Math.max(120, Math.round(vpCanvasH * 0.5));
  const mobileDensityWindows: MobileViewportDensityWindow[] = [];
  let peakCoverage = 0;
  let peakChars = 0;
  let mobileReadabilityPass = true;

  for (let startY = 0, wIdx = 0; startY < maxExtentY; startY += stepY, wIdx += 1) {
    const endY = startY + vpCanvasH;
    const inWindow = input.balloons.filter((b) => b.y + b.height > startY && b.y < endY);
    let areaSum = 0; let charCount = 0; let minEffFont = Infinity;
    for (let k = 0; k < inWindow.length; k += 1) {
      const b = inWindow[k];
      areaSum += Math.max(0, b.width * (Math.min(endY, b.y + b.height) - Math.max(startY, b.y)));
      charCount += b.text.replace(/\s+/g, "").length;
      minEffFont = Math.min(minEffFont, (b.fontSizePx ?? 24) * scaleFactor);
    }
    const coverage = Number((areaSum / (canvasWidthPx * vpCanvasH)).toFixed(4));
    const overdense = coverage > 0.34 || charCount > charBudget;
    peakCoverage = Math.max(peakCoverage, coverage);
    peakChars = Math.max(peakChars, charCount);
    if (overdense) {
      mobileReadabilityPass = false;
      const lastB = inWindow[inWindow.length - 1];
      pushIssue({
        kind: "mobile-text-overdense", severity: coverage > 0.45 ? "error" : "warning",
        primaryBalloonId: lastB?.balloonId, cutId: lastB?.cutId,
        metricValue: Number((coverage * 100).toFixed(1)), thresholdValue: 34,
        messageKo: `모바일(${mobileW}×${mobileH}) 구간 #${wIdx + 1} 말풍선 점유율 ${(coverage * 100).toFixed(1)}% · ${charCount}자로 과밀합니다.`,
      });
      if (lastB) {
        const pushDownY = Math.round(lastB.y + Math.max(120, vpCanvasH * 0.25));
        repositionHints.push({
          balloonId: lastB.balloonId, reason: "mobile-text-overdense",
          currentX: lastB.x, currentY: lastB.y, suggestedX: lastB.x, suggestedY: pushDownY,
          deltaX: 0, deltaY: pushDownY - lastB.y, rationaleKo: "말풍선을 다음 뷰포트로 분산해 텍스트 과밀을 해소합니다.",
        });
      }
    }
    if (inWindow.length > 0 && minEffFont < 11) {
      mobileReadabilityPass = false;
      const smallest = inWindow.reduce((acc, cur) => ((cur.fontSizePx ?? 24) < (acc.fontSizePx ?? 24) ? cur : acc));
      pushIssue({
        kind: "mobile-font-too-small", severity: "warning", primaryBalloonId: smallest.balloonId, cutId: smallest.cutId,
        metricValue: Number(minEffFont.toFixed(1)), thresholdValue: 11,
        messageKo: `말풍선(${smallest.balloonId}) 모바일 실효 폰트가 ${minEffFont.toFixed(1)}px로 최소 기준(11px) 미만입니다.`,
      });
    }
    mobileDensityWindows.push({
      windowIndex: wIdx, startYCanvasPx: Math.round(startY), endYCanvasPx: Math.round(endY),
      balloonIds: inWindow.map((b) => b.balloonId), characterCount: charCount,
      balloonAreaCoverageRatio: coverage, minEffectiveFontPx: inWindow.length > 0 ? Number(minEffFont.toFixed(2)) : 0,
      overdense,
    });
    if (endY >= maxExtentY) { break; }
  }

  // 5) 컷 간 여백(Gutter) 리듬 및 페이싱
  const gutterMetrics: GutterPacingMetric[] = [];
  for (let i = 1; i < sortedCuts.length; i += 1) {
    const prev = sortedCuts[i - 1]; const next = sortedCuts[i];
    const gutterPx = Math.round(next.y - (prev.y + prev.height));
    const ratio = Number((gutterPx / vpCanvasH).toFixed(3));
    const targetTempo: CutSceneTempo = next.sceneTempo ?? "dialogue";
    let classification: GutterPacingMetric["classification"] = "balanced";
    if (gutterPx < 36) {
      classification = "cramped";
      pushIssue({
        kind: "gutter-too-cramped", severity: "warning", cutId: next.cutId, metricValue: gutterPx, thresholdValue: 36,
        messageKo: `컷(${prev.cutId}→${next.cutId}) 여백(${gutterPx}px)이 지나치게 좁습니다.`,
      });
    } else if (ratio > 0.95) {
      classification = "excessive-dead-space";
      pushIssue({
        kind: "gutter-excessive-gap", severity: "info", cutId: next.cutId,
        metricValue: gutterPx, thresholdValue: Math.round(vpCanvasH * 0.95),
        messageKo: `컷(${prev.cutId}→${next.cutId}) 여백(${gutterPx}px)이 1모바일 화면을 초과합니다.`,
      });
    } else if (ratio >= 0.35) {
      classification = "dramatic-pause";
    }
    if (targetTempo === "reveal" && ratio < 0.28) {
      pushIssue({
        kind: "reveal-gutter-too-short", severity: "warning", cutId: next.cutId,
        metricValue: gutterPx, thresholdValue: Math.round(vpCanvasH * 0.28),
        messageKo: `공개(reveal) 컷(${next.cutId}) 직전 여백(${gutterPx}px)이 짧아 긴장감 축적이 부족합니다.`,
      });
    }
    gutterMetrics.push({ fromCutId: prev.cutId, toCutId: next.cutId, gutterPx, normalizedViewportRatio: ratio, classification, targetTempo });
  }

  const penalty = issues.reduce((acc, it) => acc + (it.severity === "error" ? 18 : it.severity === "warning" ? 8 : 3), 0);
  return {
    locale: input.locale, horizontalDirection,
    mobileViewport: { widthPx: mobileW, heightPx: mobileH, scaleFactor: Number(scaleFactor.toFixed(4)) },
    predictedGazePath, authoredGazePath, issues, repositionHints, mobileDensityWindows, gutterMetrics,
    backtrackCount, crossoverCount, ttsOrderConsistent: ttsMismatchCount === 0,
    peakMobileBalloonCoverageRatio: peakCoverage, peakMobileCharsPerViewport: peakChars,
    mobileReadabilityPass, flowScore0To100: clamp(100 - penalty, 0, 100), serverCostKrw: 0,
  };
}

function parseUtcDayMs(iso: string): number {
  const parsed = Date.parse(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso);
  if (Number.isNaN(parsed)) { throw new Error(`유효하지 않은 ISO 날짜 형식입니다: ${iso}`); }
  return parsed;
}

/**
 * 상업 권리 범위·좌석·만료일·임베딩/서브셋 폰트 권한을 심사해 위반 에셋의 내보내기를 하드 차단한다.
 */
export class SmartLicenseGuardian {
  private readonly registry = new Map<string, LicensedAssetEntry>();

  public registerAsset(entry: LicensedAssetEntry): void { this.registry.set(entry.assetId, entry); }
  public registerAssets(entries: readonly LicensedAssetEntry[]): number {
    entries.forEach((e) => this.registry.set(e.assetId, e));
    return this.registry.size;
  }
  public removeAsset(assetId: string): boolean { return this.registry.delete(assetId); }
  public listAssets(): readonly LicensedAssetEntry[] {
    return Array.from(this.registry.values()).sort((a, b) => a.assetId.localeCompare(b.assetId));
  }

  public auditForExport(request: LicenseAuditRequest): LicenseAuditReport {
    const evalMs = parseUtcDayMs(request.evaluationDateIso);
    const soonDays = Math.max(1, request.expiringSoonThresholdDays ?? 30);
    const requiresCommercial = COMMERCIAL_SCOPES.has(request.targetScope);
    const needsEmbed = request.embedFonts ?? (request.exportFormat === "epub" || request.exportFormat === "pdf");
    const needsSubset = request.subsetFonts ?? request.exportFormat === "epub";

    const uniqueIds = Array.from(new Set(request.usedAssetIds)).sort();
    const clearedAssets: ClearedAssetSummary[] = [];
    const blockingViolations: AssetLicenseViolation[] = [];
    const warnings: AssetLicenseWarning[] = [];
    const requiredAttributions: string[] = [];
    let minimumDaysRemaining: number | null = null;

    for (let i = 0; i < uniqueIds.length; i += 1) {
      const assetId = uniqueIds[i];
      const entry = this.registry.get(assetId);
      if (!entry) {
        blockingViolations.push({
          assetId, displayName: assetId, assetKind: "unknown", reason: "unregistered-asset",
          daysRemaining: null, messageKo: `미등록 에셋(${assetId})은 라이선스 원장에 없어 내보내기가 차단됩니다.`,
        });
        continue;
      }
      const daysRemaining = entry.expiresAtIso
        ? Math.floor((parseUtcDayMs(entry.expiresAtIso) - evalMs) / 86_400_000)
        : null;
      if (daysRemaining !== null && (minimumDaysRemaining === null || daysRemaining < minimumDaysRemaining)) {
        minimumDaysRemaining = daysRemaining;
      }

      let blocked = false;
      const fail = (reason: LicenseViolationReason, messageKo: string): void => {
        blocked = true;
        blockingViolations.push({ assetId: entry.assetId, displayName: entry.displayName, assetKind: entry.assetKind, reason, daysRemaining, messageKo });
      };

      if (daysRemaining !== null && daysRemaining < 0) {
        fail("license-expired", `에셋(${entry.displayName})의 라이선스가 ${Math.abs(daysRemaining)}일 전에 만료되어 차단됩니다.`);
      }
      if (requiresCommercial && !entry.commercialAllowed) {
        fail("non-commercial-restricted", `비상업 에셋(${entry.displayName})은 상업 범위(${request.targetScope}) 내보내기가 금지됩니다.`);
      }
      if (!entry.allowedScopes.includes(request.targetScope)) {
        fail("scope-not-covered", `에셋(${entry.displayName})은 '${request.targetScope}' 출판 범위를 허용하지 않습니다.`);
      }
      if (entry.seatLimit !== undefined && entry.activeSeats !== undefined && entry.activeSeats > entry.seatLimit) {
        fail("seat-limit-exceeded", `에셋(${entry.displayName}) 좌석(${entry.activeSeats}/${entry.seatLimit})이 계약 한도를 초과했습니다.`);
      }
      if (entry.assetKind === "font") {
        if (needsEmbed && entry.fontEmbeddingPermission === "restricted-no-embed") {
          fail("font-embedding-prohibited", `폰트(${entry.displayName})는 임베딩 금지 정책으로 ${request.exportFormat.toUpperCase()} 내보내기가 차단됩니다.`);
        }
        if (needsSubset && entry.subsetAllowed === false) {
          fail("font-subset-prohibited", `폰트(${entry.displayName})는 서브셋 추출이 금지되어 있습니다.`);
        }
      }

      if (daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= soonDays) {
        warnings.push({
          assetId: entry.assetId, displayName: entry.displayName, reason: "expiring-soon", daysRemaining,
          messageKo: `에셋(${entry.displayName}) 라이선스 만료까지 ${daysRemaining}일 남았습니다.`,
        });
      }
      if (entry.attributionRequired) {
        const credit = entry.attributionText ?? `${entry.displayName} (${entry.vendor} · ${entry.licenseName})`;
        requiredAttributions.push(credit);
        warnings.push({
          assetId: entry.assetId, displayName: entry.displayName, reason: "attribution-required", daysRemaining,
          messageKo: `출처 표기 필수: ${credit}`,
        });
      }
      if (!blocked) {
        clearedAssets.push({
          assetId: entry.assetId, displayName: entry.displayName, assetKind: entry.assetKind,
          licenseName: entry.licenseName, vendor: entry.vendor, daysRemaining,
          subsetAllowed: entry.subsetAllowed ?? true, fontEmbeddingPermission: entry.fontEmbeddingPermission,
        });
      }
    }

    return {
      exportAllowed: blockingViolations.length === 0, targetScope: request.targetScope,
      exportFormat: request.exportFormat, evaluationDateIso: request.evaluationDateIso,
      checkedAssetCount: uniqueIds.length, clearedAssets, blockingViolations, warnings,
      requiredAttributions, minimumDaysRemaining, serverCostKrw: 0,
    };
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const CRC32_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) { c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1; }
    t[n] = c >>> 0;
  }
  return t;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) { crc = (CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0; }
  return (crc ^ 0xffffffff) >>> 0;
}

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

function rotr32(x: number, n: number): number { return ((x >>> n) | (x << (32 - n))) >>> 0; }

/** FIPS 180-4 동기 SHA-256 (순수 uint32, BigInt 미사용). */
function sha256HexSync(text: string): string {
  const msg = UTF8_ENCODER.encode(text);
  const paddedLen = Math.ceil((msg.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(msg, 0);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, Math.floor((msg.length * 8) / 0x100000000) >>> 0, false);
  dv.setUint32(paddedLen - 4, (msg.length * 8) >>> 0, false);

  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) { w[i] = dv.getUint32(off + i * 4, false); }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (h + ((rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0) + (((e & f) ^ (~e & g)) >>> 0) + SHA256_K[i] + w[i]) >>> 0;
      const t2 = (((rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0) + (((a & b) ^ (a & c) ^ (b & c)) >>> 0)) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((v) => v.toString(16).padStart(8, "0")).join("");
}

function buildPngItxtChunk(keyword: string, xmpText: string): { readonly chunk: Uint8Array; readonly crcHex: string } {
  const kw = UTF8_ENCODER.encode(keyword);
  const txt = UTF8_ENCODER.encode(xmpText);
  const dataLen = kw.length + 5 + txt.length;
  const chunk = new Uint8Array(12 + dataLen);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, dataLen, false);
  chunk[4] = 0x69; chunk[5] = 0x54; chunk[6] = 0x58; chunk[7] = 0x74; // iTXt
  chunk.set(kw, 8);
  chunk.set(txt, 13 + kw.length);
  const crc = computeCrc32(chunk.subarray(4, 8 + dataLen));
  view.setUint32(8 + dataLen, crc, false);
  return { chunk, crcHex: crc.toString(16).padStart(8, "0") };
}

function injectChunkIntoPngBeforeIend(rawPng: Uint8Array, chunk: Uint8Array): Uint8Array | undefined {
  if (rawPng.length < 20) { return undefined; }
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) { if (rawPng[i] !== PNG_SIGNATURE[i]) { return undefined; } }
  const view = new DataView(rawPng.buffer, rawPng.byteOffset, rawPng.byteLength);
  let cursor = 8;
  while (cursor + 12 <= rawPng.length) {
    const len = view.getUint32(cursor, false);
    const type = String.fromCharCode(rawPng[cursor + 4], rawPng[cursor + 5], rawPng[cursor + 6], rawPng[cursor + 7]);
    if (type === "IEND") {
      const merged = new Uint8Array(rawPng.length + chunk.length);
      merged.set(rawPng.subarray(0, cursor), 0);
      merged.set(chunk, cursor);
      merged.set(rawPng.subarray(cursor), cursor + chunk.length);
      return merged;
    }
    cursor += 12 + len;
  }
  return undefined;
}

/**
 * 라이선스 감사 통과 시 XMP 패킷, PNG `iTXt`(CRC-32), EPUB OPF, C2PA 프로비넌스 헤더를 주입하며,
 * 위반 에셋이 있으면 내보내기 전에 하드 차단한다.
 */
export function injectPublishingComplianceMetadata(input: ComplianceInjectionInput): ComplianceInjectionResult {
  const { auditReport } = input;
  if (!auditReport.exportAllowed) {
    const blockingReasons = auditReport.blockingViolations.map((v) => `${v.assetId}:${v.reason}`);
    if (input.strictThrowOnBlocked) {
      throw new Error(`라이선스 위반으로 출판 내보내기가 차단되었습니다: ${blockingReasons.join(", ")}`);
    }
    return {
      injected: false, blocked: true, blockingReasons, rightsBomDigestSha256: "",
      xmpPacketXml: "", pngItxtChunk: new Uint8Array(0), pngItxtCrc32Hex: "00000000", epubOpfMetadataXml: "",
      c2paManifestHeader: {
        schemaVersion: COMPLIANCE_SCHEMA_VERSION, claimGenerator: "ToonStudio-Compliance-Guardian/1.0",
        instanceId: `blocked:${input.workId}:${input.episodeId}`, targetScope: auditReport.targetScope,
        rightsBomDigestSha256: "", assertions: [],
      },
      serverCostKrw: 0,
    };
  }

  const rightsBomDigestSha256 = sha256HexSync(JSON.stringify({
    workId: input.workId, episodeId: input.episodeId, targetScope: auditReport.targetScope,
    exportFormat: auditReport.exportFormat, evaluationDateIso: auditReport.evaluationDateIso,
    clearedAssetIds: auditReport.clearedAssets.map((a) => `${a.assetId}@${a.licenseName}`),
    attributions: auditReport.requiredAttributions,
  }));
  const publisher = input.publisherName ?? "Independent Creator";
  const fontIds = auditReport.clearedAssets.filter((a) => a.assetKind === "font").map((a) => a.assetId);
  const usageTerms = `ToonStudio Verified Commercial Rights (${auditReport.targetScope}) · BOM SHA-256 ${rightsBomDigestSha256.slice(0, 16)}`;

  const xmpPacketXml = [
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>`,
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:toonstudio="https://toonstudio.cloud/ns/rights/1.0/">`,
    `<rdf:Description rdf:about=""><dc:title>${escapeXml(input.episodeTitle)}</dc:title><dc:creator>${escapeXml(input.creatorName)}</dc:creator><dc:publisher>${escapeXml(publisher)}</dc:publisher><xmpRights:Marked>True</xmpRights:Marked><xmpRights:UsageTerms>${escapeXml(usageTerms)}</xmpRights:UsageTerms><toonstudio:PublishingScope>${escapeXml(auditReport.targetScope)}</toonstudio:PublishingScope><toonstudio:RightsBomSha256>${rightsBomDigestSha256}</toonstudio:RightsBomSha256><toonstudio:EmbeddedFonts>${escapeXml(fontIds.join(","))}</toonstudio:EmbeddedFonts></rdf:Description>`,
    `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`,
  ].join("\n");

  const { chunk: pngItxtChunk, crcHex: pngItxtCrc32Hex } = buildPngItxtChunk("XML:com.adobe.xmp", xmpPacketXml);
  const injectedPngBytes = input.rawPngBytes ? injectChunkIntoPngBeforeIend(input.rawPngBytes, pngItxtChunk) : undefined;

  const epubOpfMetadataXml = [
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">`,
    `  <dc:title>${escapeXml(input.episodeTitle)}</dc:title><dc:creator>${escapeXml(input.creatorName)}</dc:creator>`,
    `  <dc:rights>${escapeXml(usageTerms)}</dc:rights><meta property="dcterms:modified">${escapeXml(input.createdAtIso)}</meta>`,
    `  <meta property="toonstudio:rightsScope">${escapeXml(auditReport.targetScope)}</meta>`,
    `  <meta property="toonstudio:rightsBomSha256">${rightsBomDigestSha256}</meta><meta property="toonstudio:fontSubsetCount">${fontIds.length}</meta>`,
    `</metadata>`,
  ].join("\n");

  const c2paManifestHeader: C2paManifestHeader = {
    schemaVersion: COMPLIANCE_SCHEMA_VERSION, claimGenerator: "ToonStudio-Compliance-Guardian/1.0",
    instanceId: `urn:uuid:toonstudio-${rightsBomDigestSha256.slice(0, 24)}`,
    targetScope: auditReport.targetScope, rightsBomDigestSha256,
    assertions: [
      { label: "stds.schema-org.CreativeWork", data: { name: input.episodeTitle, author: input.creatorName, publisher, dateCreated: input.createdAtIso, aiAssistDeclared: Boolean(input.aiAssistDeclared) } },
      { label: "c2pa.actions", data: { action: "c2pa.created", softwareAgent: "ToonStudio Wasm64 Creator Engine", when: input.createdAtIso, digitalSourceType: input.aiAssistDeclared ? "compositeWithTrainedAlgorithmicMedia" : "digitalArt" } },
      { label: "toonstudio.rights.bom", data: { scope: auditReport.targetScope, exportFormat: auditReport.exportFormat, digestSha256: rightsBomDigestSha256, clearedAssetCount: auditReport.clearedAssets.length, embeddedFonts: fontIds, requiredAttributions: auditReport.requiredAttributions } },
    ],
  };

  return {
    injected: true, blocked: false, blockingReasons: [], rightsBomDigestSha256,
    xmpPacketXml, pngItxtChunk, pngItxtCrc32Hex, injectedPngBytes, epubOpfMetadataXml,
    c2paManifestHeader, serverCostKrw: 0,
  };
}
