/**
 * Boords · StudioBinder · Flix 클린룸 애니매틱 대사 독서 속도 자동 타이밍,
 * 프로덕션 샷 리스트 CSV 내보내기, 비로그인 게스트 타임코드 SVG 드로우오버 리뷰 엔진.
 *
 * - 한글 음절 속도(10~14음절/초, 기본 12) + 영문 단어 속도(140~180 WPM, 기본 160) + 말풍선 호흡(+300ms) + 비트 템포 배수 기반 비파괴 권장 컷 길이 계산
 * - 샷 번호·샷 사이즈·렌즈/카메라 무빙·등장인물·3D 배경·소품·효과음·대사 수·누적 타임코드(MM:SS.mmm) 집계 및 RFC-4180 CSV 직렬화
 * - 공유 토큰 격리 게스트 타임코드 핀·SVG 드로우오버·멀티 테이크 A/B 비교 및 애니매틱 마커 원클릭 동기화
 */

export const DEFAULT_KOREAN_SYLLABLES_PER_SEC = 12;
export const MIN_KOREAN_SYLLABLES_PER_SEC = 10;
export const MAX_KOREAN_SYLLABLES_PER_SEC = 14;

export const DEFAULT_ENGLISH_WPM = 160;
export const MIN_ENGLISH_WPM = 140;
export const MAX_ENGLISH_WPM = 180;

export const BALLOON_BREATHING_PAUSE_MS = 300;
export const MIN_CUT_HOLD_MS = 600;
export const DEFAULT_SILENT_ACTION_HOLD_MS = 900;

export type AnimaticBeatPacingKind = "normal" | "action" | "reveal" | "silence";

export const BEAT_PACING_MULTIPLIERS: Readonly<Record<AnimaticBeatPacingKind, number>> = {
  normal: 1.0,
  action: 0.75,
  reveal: 1.35,
  silence: 1.5,
};

export interface AnimaticDialogueBalloon {
  readonly id: string;
  readonly speaker?: string;
  readonly text: string;
}

export interface AnimaticCutInput {
  readonly cutId: string;
  readonly shotNumber: string;
  readonly sceneLabel?: string;
  readonly shotSize: string;
  readonly lensMm?: number;
  readonly cameraMove?: string;
  readonly characters: readonly string[];
  readonly bg3dRef?: string;
  readonly props: readonly string[];
  readonly sfxTags: readonly string[];
  readonly dialogues: readonly AnimaticDialogueBalloon[];
  readonly beatPacing: AnimaticBeatPacingKind;
  readonly currentHoldMs: number;
  readonly visualActionBaseMs?: number;
}

export interface DialogueReadingRateConfig {
  readonly koreanSyllablesPerSec: number;
  readonly englishWordsPerMin: number;
  readonly balloonBreathingPauseMs: number;
  readonly minHoldMs: number;
}

export interface CutPacingDiffEntry {
  readonly cutId: string;
  readonly shotNumber: string;
  readonly koreanSyllableCount: number;
  readonly englishWordCount: number;
  readonly balloonCount: number;
  readonly beatPacing: AnimaticBeatPacingKind;
  readonly beforeMs: number;
  readonly recommendedMs: number;
  readonly deltaMs: number;
  readonly cumulativeBeforeMs: number;
  readonly cumulativeRecommendedMs: number;
}

export interface DialoguePacingPlan {
  readonly config: DialogueReadingRateConfig;
  readonly entries: readonly CutPacingDiffEntry[];
  readonly totalBeforeMs: number;
  readonly totalRecommendedMs: number;
  readonly totalDeltaMs: number;
}

export interface ProductionShotListRow {
  readonly shotNumber: string;
  readonly cutId: string;
  readonly sceneLabel: string;
  readonly shotSize: string;
  readonly lensAndMove: string;
  readonly characters: string;
  readonly bg3dRef: string;
  readonly props: string;
  readonly sfx: string;
  readonly dialogueCount: number;
  readonly durationMs: number;
  readonly cumulativeStartTimecode: string;
  readonly cumulativeEndTimecode: string;
}

export type TimecodeReviewPinStatus =
  | "revision-requested"
  | "approved-candidate"
  | "resolved";

export interface ReviewDrawoverStroke {
  readonly id: string;
  readonly colorToken: "danger" | "accent" | "warning";
  readonly strokeWidthPx: number;
  readonly pathD: string;
}

export interface TimecodeReviewPin {
  readonly id: string;
  readonly shareTokenScope: string;
  readonly takeId: string;
  readonly segmentId: string;
  readonly timeMs: number;
  readonly reviewerAlias: string;
  readonly comment: string;
  readonly status: TimecodeReviewPinStatus;
  readonly drawoverStrokes: readonly ReviewDrawoverStroke[];
  readonly createdAtIso: string;
}

export interface AnimaticTimelineMarker {
  readonly id: string;
  readonly sourcePinId: string;
  readonly segmentId: string;
  readonly timeMs: number;
  readonly label: string;
  readonly severity: "revision" | "candidate" | "resolved";
  readonly hasDrawoverOverlay: boolean;
  readonly takeId: string;
}

export interface MultiTakeReviewComparison {
  readonly takeAId: string;
  readonly takeBId: string;
  readonly takeACounts: Readonly<Record<TimecodeReviewPinStatus, number>>;
  readonly takeBCounts: Readonly<Record<TimecodeReviewPinStatus, number>>;
  readonly revisionDeltaBMinusA: number;
  readonly recommendedTakeId: string | "tie";
}

const SAFE_SVG_PATH_PATTERN = /^[MLHVCSQTAZmlhvcsqtaz0-9.,\s+-]+$/;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * 대사 문자열에서 한글 완성형 음절 수와 영문/숫자 단어 수를 계산한다.
 */
export function countDialogueMetrics(text: string): {
  readonly koreanSyllableCount: number;
  readonly englishWordCount: number;
} {
  const koMatches = text.match(/[\uAC00-\uD7A3]/g);
  const enMatches = text.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g);
  return {
    koreanSyllableCount: koMatches ? koMatches.length : 0,
    englishWordCount: enMatches ? enMatches.length : 0,
  };
}

/**
 * 밀리초를 "MM:SS.mmm" 표준 타임코드 문자열로 변환한다.
 */
export function formatTimecodeMs(ms: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const totalSec = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const millis = safe % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/**
 * 컷별 대사 독서 속도·말풍선 호흡·비트 템포를 반영한 비파괴 권장 컷 타이밍 Diff 계획을 계산한다.
 */
export function computeDialoguePacingPlan(
  cuts: readonly AnimaticCutInput[],
  overrides?: Partial<DialogueReadingRateConfig>,
): DialoguePacingPlan {
  const config: DialogueReadingRateConfig = {
    koreanSyllablesPerSec: clamp(
      overrides?.koreanSyllablesPerSec ?? DEFAULT_KOREAN_SYLLABLES_PER_SEC,
      MIN_KOREAN_SYLLABLES_PER_SEC,
      MAX_KOREAN_SYLLABLES_PER_SEC,
    ),
    englishWordsPerMin: clamp(
      overrides?.englishWordsPerMin ?? DEFAULT_ENGLISH_WPM,
      MIN_ENGLISH_WPM,
      MAX_ENGLISH_WPM,
    ),
    balloonBreathingPauseMs: clamp(
      overrides?.balloonBreathingPauseMs ?? BALLOON_BREATHING_PAUSE_MS,
      0,
      1500,
    ),
    minHoldMs: clamp(overrides?.minHoldMs ?? MIN_CUT_HOLD_MS, 250, 4000),
  };

  let cumulativeBeforeMs = 0;
  let cumulativeRecommendedMs = 0;
  const entries: CutPacingDiffEntry[] = [];

  for (const cut of cuts) {
    let koCount = 0;
    let enCount = 0;
    for (const balloon of cut.dialogues) {
      const m = countDialogueMetrics(balloon.text);
      koCount += m.koreanSyllableCount;
      enCount += m.englishWordCount;
    }

    const balloonCount = cut.dialogues.length;
    const beforeMs = Math.max(200, Math.round(cut.currentHoldMs));
    const pacingMultiplier = BEAT_PACING_MULTIPLIERS[cut.beatPacing];

    let rawMs: number;
    if (balloonCount === 0 || (koCount === 0 && enCount === 0)) {
      const silentBase = clamp(
        cut.visualActionBaseMs ?? DEFAULT_SILENT_ACTION_HOLD_MS,
        300,
        10_000,
      );
      rawMs = silentBase * pacingMultiplier;
    } else {
      const koMs = (koCount / config.koreanSyllablesPerSec) * 1000;
      const enMs = (enCount / (config.englishWordsPerMin / 60)) * 1000;
      const breathingMs = balloonCount * config.balloonBreathingPauseMs;
      rawMs = (koMs + enMs + breathingMs) * pacingMultiplier;
    }

    const recommendedMs = Math.max(config.minHoldMs, roundToStep(rawMs, 50));
    const deltaMs = recommendedMs - beforeMs;
    cumulativeBeforeMs += beforeMs;
    cumulativeRecommendedMs += recommendedMs;

    entries.push({
      cutId: cut.cutId,
      shotNumber: cut.shotNumber,
      koreanSyllableCount: koCount,
      englishWordCount: enCount,
      balloonCount,
      beatPacing: cut.beatPacing,
      beforeMs,
      recommendedMs,
      deltaMs,
      cumulativeBeforeMs,
      cumulativeRecommendedMs,
    });
  }

  return {
    config,
    entries,
    totalBeforeMs: cumulativeBeforeMs,
    totalRecommendedMs: cumulativeRecommendedMs,
    totalDeltaMs: cumulativeRecommendedMs - cumulativeBeforeMs,
  };
}

/**
 * 비파괴 Diff 계획의 권장 컷 길이를 전체 또는 지정 컷 집합에 적용한 새 컷 배열을 반환한다.
 */
export function applyDialoguePacingPlan(
  cuts: readonly AnimaticCutInput[],
  plan: DialoguePacingPlan,
  selectedCutIds?: ReadonlySet<string>,
): readonly AnimaticCutInput[] {
  const recommendedByCutId = new Map(
    plan.entries.map((entry) => [entry.cutId, entry.recommendedMs]),
  );

  return cuts.map((cut) => {
    if (selectedCutIds && !selectedCutIds.has(cut.cutId)) return cut;
    const nextMs = recommendedByCutId.get(cut.cutId);
    if (nextMs === undefined) return cut;
    return {
      ...cut,
      currentHoldMs: nextMs,
    };
  });
}

/**
 * 애니매틱 컷 목록을 프로덕션 샷 리스트·브레이크다운 매트릭스 행으로 컴파일한다.
 */
export function compileProductionShotList(
  cuts: readonly AnimaticCutInput[],
  optionalPacingPlan?: DialoguePacingPlan,
): readonly ProductionShotListRow[] {
  const recommendedMap = optionalPacingPlan
    ? new Map(optionalPacingPlan.entries.map((e) => [e.cutId, e.recommendedMs]))
    : null;

  let cursorMs = 0;
  return cuts.map((cut) => {
    const durationMs = Math.max(
      200,
      Math.round(recommendedMap?.get(cut.cutId) ?? cut.currentHoldMs),
    );
    const startTc = formatTimecodeMs(cursorMs);
    cursorMs += durationMs;
    const endTc = formatTimecodeMs(cursorMs);

    const lensPart = cut.lensMm ? `${cut.lensMm}mm` : "";
    const movePart = cut.cameraMove?.trim() ?? "";
    const lensAndMove = [lensPart, movePart].filter(Boolean).join(" / ") || "표준 고정";

    return {
      shotNumber: cut.shotNumber,
      cutId: cut.cutId,
      sceneLabel: cut.sceneLabel?.trim() || "씬 미지정",
      shotSize: cut.shotSize,
      lensAndMove,
      characters: cut.characters.join(", "),
      bg3dRef: cut.bg3dRef?.trim() || "-",
      props: cut.props.join(", "),
      sfx: cut.sfxTags.join(", "),
      dialogueCount: cut.dialogues.length,
      durationMs,
      cumulativeStartTimecode: startTc,
      cumulativeEndTimecode: endTc,
    };
  });
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * 프로덕션 샷 리스트를 RFC-4180 준수 CSV 문자열로 직렬화한다.
 */
export function exportShotListToCsv(rows: readonly ProductionShotListRow[]): string {
  const headers = [
    "샷 번호",
    "컷 ID",
    "씬",
    "샷 사이즈",
    "렌즈/카메라 무빙",
    "등장인물",
    "3D 배경 참조",
    "소품",
    "효과음(SFX)",
    "대사 수",
    "길이(ms)",
    "시작 타임코드",
    "종료 타임코드",
  ];

  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.shotNumber,
        row.cutId,
        row.sceneLabel,
        row.shotSize,
        row.lensAndMove,
        row.characters,
        row.bg3dRef,
        row.props,
        row.sfx,
        row.dialogueCount,
        row.durationMs,
        row.cumulativeStartTimecode,
        row.cumulativeEndTimecode,
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

/**
 * 비로그인 게스트 공유 토큰 범위의 타임코드 고정 SVG 드로우오버 리뷰 핀을 생성한다.
 */
export function createTimecodeReviewPin(input: {
  readonly id: string;
  readonly shareTokenScope: string;
  readonly takeId: string;
  readonly segmentId: string;
  readonly timeMs: number;
  readonly reviewerAlias: string;
  readonly comment: string;
  readonly status?: TimecodeReviewPinStatus;
  readonly drawoverStrokes?: readonly ReviewDrawoverStroke[];
  readonly createdAtIso: string;
}): TimecodeReviewPin {
  const shareTokenScope = input.shareTokenScope.trim();
  const segmentId = input.segmentId.trim();
  const reviewerAlias = input.reviewerAlias.trim();
  if (!shareTokenScope) {
    throw new Error("게스트 리뷰 핀은 공유 토큰 범위(shareTokenScope)가 필수입니다.");
  }
  if (!segmentId) {
    throw new Error("리뷰 핀 대상 세그먼트 ID가 비어 있습니다.");
  }
  if (!reviewerAlias) {
    throw new Error("리뷰어 별칭을 입력해야 합니다.");
  }

  const validatedStrokes: ReviewDrawoverStroke[] = [];
  for (const stroke of input.drawoverStrokes ?? []) {
    const trimmedPath = stroke.pathD.trim();
    if (!SAFE_SVG_PATH_PATTERN.test(trimmedPath)) {
      throw new Error(`허용되지 않는 SVG 경로 구문이 포함되어 있습니다: ${stroke.id}`);
    }
    validatedStrokes.push({
      ...stroke,
      strokeWidthPx: clamp(stroke.strokeWidthPx, 1, 24),
      pathD: trimmedPath,
    });
  }

  return {
    id: input.id.trim(),
    shareTokenScope,
    takeId: input.takeId.trim() || "take-a",
    segmentId,
    timeMs: Math.max(0, Math.round(input.timeMs)),
    reviewerAlias,
    comment: input.comment.trim(),
    status: input.status ?? "revision-requested",
    drawoverStrokes: validatedStrokes,
    createdAtIso: input.createdAtIso,
  };
}

/**
 * 멀티 테이크(A/B) 리뷰 핀 집계 결과를 비교한다.
 */
export function compareMultiTakeReviewPins(
  pins: readonly TimecodeReviewPin[],
  shareTokenScope: string,
  takeAId: string,
  takeBId: string,
): MultiTakeReviewComparison {
  const scoped = pins.filter((pin) => pin.shareTokenScope === shareTokenScope);
  const countFor = (takeId: string): Record<TimecodeReviewPinStatus, number> => {
    const tally: Record<TimecodeReviewPinStatus, number> = {
      "revision-requested": 0,
      "approved-candidate": 0,
      resolved: 0,
    };
    for (const pin of scoped) {
      if (pin.takeId === takeId) {
        tally[pin.status] += 1;
      }
    }
    return tally;
  };

  const takeACounts = countFor(takeAId);
  const takeBCounts = countFor(takeBId);
  const revisionDeltaBMinusA =
    takeBCounts["revision-requested"] - takeACounts["revision-requested"];

  let recommendedTakeId: string | "tie" = "tie";
  if (takeACounts["approved-candidate"] !== takeBCounts["approved-candidate"]) {
    recommendedTakeId =
      takeBCounts["approved-candidate"] > takeACounts["approved-candidate"]
        ? takeBId
        : takeAId;
  } else if (revisionDeltaBMinusA !== 0) {
    recommendedTakeId = revisionDeltaBMinusA < 0 ? takeBId : takeAId;
  }

  return {
    takeAId,
    takeBId,
    takeACounts,
    takeBCounts,
    revisionDeltaBMinusA,
    recommendedTakeId,
  };
}

/**
 * 공유 토큰 범위가 일치하는 게스트 리뷰 핀만 애니매틱 타임라인 마커로 원클릭 변환·정렬한다.
 */
export function syncReviewPinsToAnimaticMarkers(
  pins: readonly TimecodeReviewPin[],
  shareTokenScope: string,
): readonly AnimaticTimelineMarker[] {
  const severityMap: Record<
    TimecodeReviewPinStatus,
    AnimaticTimelineMarker["severity"]
  > = {
    "revision-requested": "revision",
    "approved-candidate": "candidate",
    resolved: "resolved",
  };

  return pins
    .filter((pin) => pin.shareTokenScope === shareTokenScope)
    .slice()
    .sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id))
    .map((pin) => ({
      id: `marker-${pin.id}`,
      sourcePinId: pin.id,
      segmentId: pin.segmentId,
      timeMs: pin.timeMs,
      label: `[${pin.reviewerAlias}] ${pin.comment || "타임코드 코멘트"}`,
      severity: severityMap[pin.status],
      hasDrawoverOverlay: pin.drawoverStrokes.length > 0,
      takeId: pin.takeId,
    }));
}
