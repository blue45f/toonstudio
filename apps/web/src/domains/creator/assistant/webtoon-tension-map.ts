/**
 * webtoon-tension-map.ts
 *
 * 감정·사건 곡선(텐션 맵) 순수 계산 — 에피소드 컷 목록에서 컷별 긴장도(0~1)를 결정적으로
 * 계산하고, 늘어짐·급함·절정 후보 구간을 표시한다. DOM/React/네트워크/시계/난수 의존이 없다.
 *
 * 이 모듈의 수치는 전부 휴리스틱이다 (2026-10-15)
 * -----------------------------------------------
 * 감정·샷 크기 가중치, 세 근거의 비중, 체류 시간 구간, 구간 임계값은 이 저장소가 정한 값이며
 * 공식 가이드·독자 실험·논문으로 검증된 적이 없다. "긴장도"는 작가가 곡선의 모양을 훑어보게
 * 돕는 상대 지표일 뿐 독자 반응을 예측하지 않는다. 그래서:
 *   • 모든 계수는 `TENSION_MAP_CONFIG` 한 곳에 모으고, 화면과 문서가 같은 객체에서 값을 읽는다
 *     (`TENSION_MAP_PARAMETERS`). 코드와 설명이 따로 낡을 수 없다.
 *   • 출처가 있는 값과 없는 값을 `source` 로 구분한다. 출처가 있는 것은 WEBTOON CANVAS 가이드의
 *     컷 간격 구간 하나뿐이고(`webtoon-scroll-pacing-simulator.ts` 가 인용), 체류 시간을 구하는
 *     스크롤 속도·말풍선 시간은 그 모듈의 "출처 없는 추정치"를 그대로 가져온 것이다.
 *   • 모르는 입력은 0 이나 중립값으로 지어내지 않는다. 계산에서 빼고 남은 근거의 비중을 다시
 *     맞춘다. 근거가 하나도 없는 컷은 곡선에서 제외하고 이유와 함께 알린다.
 *
 * 계산식
 * ------
 *   체류 시간(초) = (이전 컷과의 여백 + 컷 높이) / 스크롤 속도 + 말풍선 수 × 말풍선당 시간
 *   템포(0~1)     = 1 − clamp((체류 시간 − 빠름 기준) / (느림 기준 − 빠름 기준))   빠를수록 1
 *   긴장도        = Σ(비중 × 근거 점수) / Σ(비중)   — 아는 근거만 합산, 소수 셋째 자리 반올림
 */

import { isCutCameraAngle, isCutEmotion, isCutShotScale } from "./webtoon-cut-vocabulary";
import {
  CANVAS_SCENE_TRANSITION_PX,
  SCROLL_SPEEDS_PX_PER_SEC,
  type PanelVerticalSpan,
} from "./webtoon-scroll-pacing-simulator";

import type {
  CharacterEmotionalTone,
  StoryboardCameraAngle,
  StoryboardCutPlan,
  StoryboardShotScale,
} from "../ai/studio-ai-storyboard-director";

export const TENSION_MAP_VERSION = 1 as const;

/** 수치가 어디서 왔는지. 화면이 "검증된 값"처럼 보이지 않게 구분해 보여 준다. */
export type TensionParameterSource = "heuristic" | "estimate" | "canvas-guide";
/** 긴장도 계산에 실제로 쓰인 근거. */
export type TensionBasis = "emotion" | "shot" | "dwell";
export type TensionSegmentKind = "climax" | "rush" | "drag";
export type TensionSegmentReason =
  | "peak"
  | "abrupt-rise"
  | "fast-dwell-run"
  | "low-tension-run";
export type TensionExclusionReason = "no-basis" | "duplicate-id" | "invalid-id";

/** 감정 가중치(0~1) — 긴장·대립이 큰 감정일수록 높다. 출처 없음(휴리스틱). */
export const TENSION_EMOTION_WEIGHT: Readonly<Record<CharacterEmotionalTone, number>> =
  Object.freeze({
    rage: 0.9,
    shock: 0.85,
    determination: 0.7,
    sorrow: 0.5,
    joy: 0.25,
    calm: 0.1,
  });

/** 샷 크기 가중치(0~1) — 화면이 좁을수록 강한 장면으로 본다. 출처 없음(휴리스틱). */
export const TENSION_SHOT_WEIGHT: Readonly<Record<StoryboardShotScale, number>> = Object.freeze({
  "extreme-close-up": 0.95,
  "close-up": 0.8,
  "worms-eye": 0.65,
  "full-shot": 0.5,
  "medium-shot": 0.45,
  "birds-eye": 0.35,
  "long-shot": 0.2,
});

/**
 * 모든 계수와 임계값. 값을 바꾸면 `docs/features/tension-map-pose-suggestion.md` 의 표와 화면의
 * "계산 방법" 표가 함께 바뀐다(둘 다 이 객체에서 읽는다).
 */
export const TENSION_MAP_CONFIG = Object.freeze({
  /** 세 근거의 비중. 합이 1 이다. */
  weights: Object.freeze({ emotion: 0.5, shot: 0.3, tempo: 0.2 }),
  dwell: Object.freeze({
    /** 이 시간(초) 이하로 지나가면 템포 1 — 독자가 훑고 지나가는 빠른 컷. */
    fastSec: 2,
    /** 이 시간(초) 이상 머물면 템포 0 — 느긋하게 머무는 컷. */
    slowSec: 7,
    /** 말풍선 하나를 읽는 시간(초). 페이싱 시뮬레이터의 표준 독자 값과 같다(출처 없는 추정). */
    dialogueSec: 0.8,
    /** 표준 독자 스크롤 속도(px/s). 페이싱 시뮬레이터의 값을 그대로 쓴다(출처 없는 추정). */
    speedPxPerSec: SCROLL_SPEEDS_PX_PER_SEC.casual,
  }),
  segments: Object.freeze({
    /** 긴장도가 이 값 미만인 컷이 `dragMinRun` 개 이상 이어지면 늘어짐 후보. */
    dragMaxTension: 0.4,
    dragMinRun: 3,
    /** 체류 시간이 `dwell.fastSec` 이하인 컷이 이만큼 이어지면 급함 후보. */
    rushMinRun: 3,
    /** 직전 컷보다 긴장도가 이만큼 이상 갑자기 오르면 급함 후보(급전개). */
    abruptRise: 0.4,
    /** 급상승 직전 여백이 이 값(px) 이상이면 의도한 호흡으로 보고 급함으로 세지 않는다 — CANVAS 가이드의 장면 전환 구간 시작값. */
    abruptRiseExemptGutterPx: CANVAS_SCENE_TRANSITION_PX.min,
    /** 감정·샷 근거가 있고 긴장도가 이 값 이상인 지역 최댓값이 절정 후보. */
    climaxMinTension: 0.7,
    climaxMaxCount: 3,
  }),
  /** 콘티 계획(대본)에는 실제 높이·여백이 없어 두는 가정값. */
  plan: Object.freeze({ referencePanelHeightPx: 700, assumedGutterPx: 400 }),
  limits: Object.freeze({ maxCuts: 200, maxPx: 1_000_000, maxDialogue: 50 }),
});

export interface TensionCutInput {
  /** 컷마다 고유한 id. 비었거나 겹치면 곡선에서 제외된다. */
  readonly id: string;
  /** 사용자 콘텐츠(콘티 요약 등). UI 문구가 아니라서 번역하지 않는다. */
  readonly summary?: string;
  /** 모르면 생략한다. 중립값으로 채우지 않고 계산에서 빠진다. */
  readonly emotion?: CharacterEmotionalTone;
  readonly shotScale?: StoryboardShotScale;
  /** 긴장도 계산에는 쓰지 않는다. 포즈 추천에 넘기려고 함께 싣는다. */
  readonly cameraAngle?: StoryboardCameraAngle;
  /** 컷 높이(px). 0 이하이거나 숫자가 아니면 모르는 것으로 본다. */
  readonly heightPx?: number;
  /** 이전 컷과의 여백(px). 첫 컷이거나 모르면 생략한다(0 으로 계산). */
  readonly gutterBeforePx?: number;
  /** 컷 안의 말풍선/대사 수. 생략하면 0. */
  readonly dialogueCount?: number;
}

export interface TensionCut {
  /** 곡선(제외된 컷을 뺀 목록)에서의 0 기반 위치. */
  readonly index: number;
  readonly id: string;
  readonly summary: string;
  readonly emotion: CharacterEmotionalTone | null;
  readonly shotScale: StoryboardShotScale | null;
  readonly cameraAngle: StoryboardCameraAngle | null;
  /** 0~1, 소수 셋째 자리. */
  readonly tension: number;
  /** 근거별 점수(0~1, 소수 셋째 자리). 모르는 근거는 null. */
  readonly components: Readonly<{
    emotion: number | null;
    shot: number | null;
    tempo: number | null;
  }>;
  /** 체류 시간(초, 소수 첫째 자리). 컷 높이를 모르면 null. */
  readonly dwellSec: number | null;
  readonly heightPx: number | null;
  readonly gutterBeforePx: number | null;
  readonly dialogueCount: number;
  /** 긴장도 계산에 쓰인 근거. */
  readonly basis: readonly TensionBasis[];
  /** 이 컷이 속한 후보 구간의 종류(마커 표시용). */
  readonly flags: readonly TensionSegmentKind[];
}

export interface TensionSegment {
  readonly kind: TensionSegmentKind;
  readonly reason: TensionSegmentReason;
  /** `TensionMapResult.cuts` 안의 0 기반 위치(양끝 포함). */
  readonly startIndex: number;
  readonly endIndex: number;
}

export interface TensionExcludedCut {
  readonly id: string;
  readonly reason: TensionExclusionReason;
}

export interface TensionMapResult {
  readonly version: typeof TENSION_MAP_VERSION;
  readonly cuts: readonly TensionCut[];
  readonly segments: readonly TensionSegment[];
  readonly excluded: readonly TensionExcludedCut[];
  /** 입력이 `limits.maxCuts` 를 넘어 앞부분만 분석했다. */
  readonly truncated: boolean;
  /** 긴장도가 가장 높은 컷(동률이면 앞쪽). 컷이 없으면 null. */
  readonly peakIndex: number | null;
  /** 컷 평균 긴장도(소수 셋째 자리). 컷이 없으면 0. */
  readonly averageTension: number;
}

// ── 작은 수치 도우미 ─────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 양의 유한수만 받아 상한으로 자른다. 그 밖의 값은 null(모름). */
function positiveFinite(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, max);
}

/** 0 이상 유한수만 받아 상한으로 자른다. 그 밖의 값은 null(모름). */
function nonNegativeFinite(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.min(value, max);
}

// ── 공개 계산 함수 ───────────────────────────────────────────────────────

/**
 * 체류 시간(초). 소수 첫째 자리로 반올림한다 — 화면에 보이는 숫자와 구간 판정이 같은 값을 쓰게 한다.
 * 컷 높이를 모르면(`heightPx` 가 null) 구할 수 없어 null 이다.
 */
export function computeDwellSeconds(input: {
  readonly heightPx: number | null;
  readonly gutterBeforePx?: number | null;
  readonly dialogueCount?: number;
}): number | null {
  const { limits, dwell } = TENSION_MAP_CONFIG;
  const height = positiveFinite(input.heightPx, limits.maxPx);
  if (height === null) return null;
  const gutter = nonNegativeFinite(input.gutterBeforePx, limits.maxPx) ?? 0;
  const dialogues = Math.floor(nonNegativeFinite(input.dialogueCount, limits.maxDialogue) ?? 0);
  return round1((gutter + height) / dwell.speedPxPerSec + dialogues * dwell.dialogueSec);
}

/** 체류 시간 → 템포 점수(0~1). 빠를수록 1, 느릴수록 0. */
export function tensionTempoScore(dwellSec: number): number {
  const { fastSec, slowSec } = TENSION_MAP_CONFIG.dwell;
  if (!Number.isFinite(dwellSec)) return 0;
  return clamp01(1 - (dwellSec - fastSec) / (slowSec - fastSec));
}

interface ScoredDraft {
  readonly tension: number;
  readonly components: TensionCut["components"];
  readonly dwellSec: number | null;
  readonly basis: readonly TensionBasis[];
}

/** 컷 하나의 긴장도. 쓸 수 있는 근거가 하나도 없으면 null. */
function scoreCut(
  emotion: CharacterEmotionalTone | null,
  shot: StoryboardShotScale | null,
  dwellSec: number | null,
): ScoredDraft | null {
  const { weights } = TENSION_MAP_CONFIG;
  const parts: { weight: number; value: number }[] = [];
  const basis: TensionBasis[] = [];
  const emotionScore = emotion === null ? null : TENSION_EMOTION_WEIGHT[emotion];
  const shotScore = shot === null ? null : TENSION_SHOT_WEIGHT[shot];
  const tempoScore = dwellSec === null ? null : round3(tensionTempoScore(dwellSec));
  if (emotionScore !== null) {
    parts.push({ weight: weights.emotion, value: emotionScore });
    basis.push("emotion");
  }
  if (shotScore !== null) {
    parts.push({ weight: weights.shot, value: shotScore });
    basis.push("shot");
  }
  if (tempoScore !== null) {
    parts.push({ weight: weights.tempo, value: tempoScore });
    basis.push("dwell");
  }
  if (parts.length === 0) return null;
  let weighted = 0;
  let total = 0;
  for (const part of parts) {
    weighted += part.weight * part.value;
    total += part.weight;
  }
  return {
    tension: round3(clamp01(weighted / total)),
    components: Object.freeze({
      emotion: emotionScore === null ? null : round3(emotionScore),
      shot: shotScore === null ? null : round3(shotScore),
      tempo: tempoScore,
    }),
    dwellSec,
    basis: Object.freeze(basis),
  };
}

function hasContentBasis(cut: Pick<TensionCut, "basis">): boolean {
  return cut.basis.includes("emotion") || cut.basis.includes("shot");
}

/** 조건을 만족하는 연속 구간 중 길이가 `minRun` 이상인 것의 [시작, 끝]을 돌려준다. */
function findRuns(
  cuts: readonly TensionCut[],
  predicate: (cut: TensionCut) => boolean,
  minRun: number,
): readonly (readonly [number, number])[] {
  const runs: (readonly [number, number])[] = [];
  let start = -1;
  for (let index = 0; index <= cuts.length; index += 1) {
    const matched = index < cuts.length && predicate(cuts[index]);
    if (matched && start < 0) start = index;
    if (!matched && start >= 0) {
      if (index - start >= minRun) runs.push([start, index - 1]);
      start = -1;
    }
  }
  return runs;
}

const SEGMENT_KIND_ORDER: Readonly<Record<TensionSegmentKind, number>> = Object.freeze({
  climax: 0,
  rush: 1,
  drag: 2,
});

/** 같은 종류·같은 사유에서 서로 겹치는 구간을 하나로 합친다. 입력은 시작 위치 순이어야 한다. */
function mergeOverlapping(segments: readonly TensionSegment[]): TensionSegment[] {
  const merged: TensionSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last !== undefined && segment.startIndex <= last.endIndex) {
      merged[merged.length - 1] = {
        ...last,
        endIndex: Math.max(last.endIndex, segment.endIndex),
      };
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

/**
 * 후보 구간 감지. 모든 구간은 "후보"일 뿐 판정이 아니다 — 의도한 늘어짐(일상 장면)이나
 * 의도한 급전개(반전)일 수 있어서 작가가 보고 고른다.
 */
export function detectTensionSegments(cuts: readonly TensionCut[]): readonly TensionSegment[] {
  const { segments: rules, dwell } = TENSION_MAP_CONFIG;
  const found: TensionSegment[] = [];

  for (const [startIndex, endIndex] of findRuns(
    cuts,
    (cut) => cut.tension < rules.dragMaxTension,
    rules.dragMinRun,
  )) {
    found.push({ kind: "drag", reason: "low-tension-run", startIndex, endIndex });
  }

  for (const [startIndex, endIndex] of findRuns(
    cuts,
    (cut) => cut.dwellSec !== null && cut.dwellSec <= dwell.fastSec,
    rules.rushMinRun,
  )) {
    found.push({ kind: "rush", reason: "fast-dwell-run", startIndex, endIndex });
  }

  const rises: TensionSegment[] = [];
  for (let index = 1; index < cuts.length; index += 1) {
    const rise = round3(cuts[index].tension - cuts[index - 1].tension);
    const gutter = cuts[index].gutterBeforePx;
    const intentionalBreath = gutter !== null && gutter >= rules.abruptRiseExemptGutterPx;
    if (rise >= rules.abruptRise && !intentionalBreath) {
      rises.push({ kind: "rush", reason: "abrupt-rise", startIndex: index - 1, endIndex: index });
    }
  }
  found.push(...mergeOverlapping(rises));

  const peaks: number[] = [];
  for (let index = 0; index < cuts.length; index += 1) {
    const cut = cuts[index];
    if (!hasContentBasis(cut) || cut.tension < rules.climaxMinTension) continue;
    const left = index > 0 ? cuts[index - 1].tension : -1;
    const right = index < cuts.length - 1 ? cuts[index + 1].tension : -1;
    if (cut.tension > left && cut.tension >= right) peaks.push(index);
  }
  peaks.sort((a, b) => cuts[b].tension - cuts[a].tension || a - b);
  for (const index of peaks.slice(0, rules.climaxMaxCount)) {
    found.push({ kind: "climax", reason: "peak", startIndex: index, endIndex: index });
  }

  return Object.freeze(
    found
      .sort(
        (a, b) =>
          a.startIndex - b.startIndex ||
          SEGMENT_KIND_ORDER[a.kind] - SEGMENT_KIND_ORDER[b.kind] ||
          a.endIndex - b.endIndex,
      )
      .map((segment) => Object.freeze(segment)),
  );
}

/** 컷 목록 → 긴장도 곡선과 후보 구간. 같은 입력이면 항상 같은 결과다. */
export function analyzeTensionMap(inputs: readonly TensionCutInput[]): TensionMapResult {
  const { limits } = TENSION_MAP_CONFIG;
  const truncated = inputs.length > limits.maxCuts;
  const seen = new Set<string>();
  const excluded: TensionExcludedCut[] = [];
  const drafts: Omit<TensionCut, "index" | "flags">[] = [];

  for (const input of inputs.slice(0, limits.maxCuts)) {
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (id === "") {
      excluded.push({ id: "", reason: "invalid-id" });
      continue;
    }
    if (seen.has(id)) {
      excluded.push({ id, reason: "duplicate-id" });
      continue;
    }
    seen.add(id);

    const emotion = isCutEmotion(input.emotion) ? input.emotion : null;
    const shot = isCutShotScale(input.shotScale) ? input.shotScale : null;
    const heightPx = positiveFinite(input.heightPx, limits.maxPx);
    const gutterBeforePx = nonNegativeFinite(input.gutterBeforePx, limits.maxPx);
    const dialogueCount = Math.floor(nonNegativeFinite(input.dialogueCount, limits.maxDialogue) ?? 0);
    const dwellSec = computeDwellSeconds({ heightPx, gutterBeforePx, dialogueCount });
    const scored = scoreCut(emotion, shot, dwellSec);
    if (scored === null) {
      excluded.push({ id, reason: "no-basis" });
      continue;
    }
    drafts.push({
      id,
      summary: typeof input.summary === "string" ? input.summary : "",
      emotion,
      shotScale: shot,
      cameraAngle: isCutCameraAngle(input.cameraAngle) ? input.cameraAngle : null,
      tension: scored.tension,
      components: scored.components,
      dwellSec: scored.dwellSec,
      heightPx,
      gutterBeforePx,
      dialogueCount,
      basis: scored.basis,
    });
  }

  const bare: readonly TensionCut[] = drafts.map((draft, index) => ({
    ...draft,
    index,
    flags: [],
  }));
  const segments = detectTensionSegments(bare);
  const cuts = bare.map((cut) => {
    const flags = (["climax", "rush", "drag"] as const).filter((kind) =>
      segments.some(
        (segment) =>
          segment.kind === kind && cut.index >= segment.startIndex && cut.index <= segment.endIndex,
      ),
    );
    return Object.freeze({ ...cut, flags: Object.freeze(flags) });
  });

  let peakIndex: number | null = null;
  let total = 0;
  for (const cut of cuts) {
    total += cut.tension;
    if (peakIndex === null || cut.tension > cuts[peakIndex].tension) peakIndex = cut.index;
  }

  return Object.freeze({
    version: TENSION_MAP_VERSION,
    cuts: Object.freeze(cuts),
    segments,
    excluded: Object.freeze(excluded),
    truncated,
    peakIndex,
    averageTension: cuts.length === 0 ? 0 : round3(total / cuts.length),
  });
}

// ── 입력 어댑터 ──────────────────────────────────────────────────────────

/**
 * 콘티 계획(대본 → 컷 계획) → 텐션 맵 입력.
 * 계획에는 px 값이 없어 `panelHeightRatio × 기준 높이`, 컷 사이 여백은 고정 가정값을 쓴다
 * (`TENSION_MAP_CONFIG.plan`, 휴리스틱). 대사가 있는 컷은 말풍선 1개로 센다.
 */
export function tensionCutsFromStoryboardPlan(
  plan: readonly StoryboardCutPlan[],
): TensionCutInput[] {
  const { referencePanelHeightPx, assumedGutterPx } = TENSION_MAP_CONFIG.plan;
  return plan.map((cut, index) => ({
    id: `plan-${index + 1}`,
    summary: cut.summary,
    emotion: cut.emotion,
    shotScale: cut.shotScale,
    cameraAngle: cut.cameraAngle,
    heightPx:
      Number.isFinite(cut.panelHeightRatio) && cut.panelHeightRatio > 0
        ? Math.round(cut.panelHeightRatio * referencePanelHeightPx)
        : undefined,
    gutterBeforePx: index === 0 ? 0 : assumedGutterPx,
    dialogueCount: cut.dialogue ? 1 : 0,
  }));
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 문서의 실제 컷(프레임) → 텐션 맵 입력. 위에서 아래로 정렬하고 컷 사이 빈 높이를 여백으로 쓴다.
 * 문서 컷에는 감정·샷 정보가 없어 체류 시간만 근거가 된다. 말풍선 수를 모르면 페이싱
 * 시뮬레이터와 같은 규칙으로 1개로 본다.
 */
export function tensionCutsFromPanels(panels: readonly PanelVerticalSpan[]): TensionCutInput[] {
  const sorted = [...panels].sort(
    (a, b) => a.topY - b.topY || compareText(a.id, b.id),
  );
  return sorted.map((panel, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const spanHeight = panel.heightPx > 0 ? panel.heightPx : panel.bottomY - panel.topY;
    return {
      id: panel.id,
      heightPx: spanHeight,
      gutterBeforePx: previous === null ? 0 : Math.max(0, panel.topY - previous.bottomY),
      dialogueCount: panel.dialogueCount ?? 1,
    };
  });
}

// ── 화면·문서용 계수 표 ──────────────────────────────────────────────────

export interface TensionParameterDoc {
  /** 화면의 라벨 표와 문서의 행을 잇는 안정 id. */
  readonly id: string;
  /** 단위까지 붙인 언어 중립 값 문자열. */
  readonly value: string;
  readonly source: TensionParameterSource;
}

function numberText(value: number, unit = ""): string {
  return `${value}${unit}`;
}

/** 설정 객체에서 만든 계수 표 — 설정과 설명이 따로 낡지 않는다. */
export const TENSION_MAP_PARAMETERS: readonly TensionParameterDoc[] = (() => {
  const { weights, dwell, segments, plan } = TENSION_MAP_CONFIG;
  const rows: readonly TensionParameterDoc[] = [
    { id: "weight.emotion", value: numberText(weights.emotion), source: "heuristic" },
    { id: "weight.shot", value: numberText(weights.shot), source: "heuristic" },
    { id: "weight.tempo", value: numberText(weights.tempo), source: "heuristic" },
    { id: "dwell.fast", value: numberText(dwell.fastSec, "s"), source: "heuristic" },
    { id: "dwell.slow", value: numberText(dwell.slowSec, "s"), source: "heuristic" },
    { id: "dwell.speed", value: numberText(dwell.speedPxPerSec, "px/s"), source: "estimate" },
    { id: "dwell.dialogue", value: numberText(dwell.dialogueSec, "s"), source: "estimate" },
    { id: "drag.maxTension", value: numberText(segments.dragMaxTension), source: "heuristic" },
    { id: "drag.minRun", value: numberText(segments.dragMinRun), source: "heuristic" },
    { id: "rush.minRun", value: numberText(segments.rushMinRun), source: "heuristic" },
    { id: "rush.abruptRise", value: numberText(segments.abruptRise), source: "heuristic" },
    {
      id: "rush.exemptGutter",
      value: numberText(segments.abruptRiseExemptGutterPx, "px"),
      source: "canvas-guide",
    },
    { id: "climax.minTension", value: numberText(segments.climaxMinTension), source: "heuristic" },
    { id: "climax.maxCount", value: numberText(segments.climaxMaxCount), source: "heuristic" },
    { id: "plan.panelHeight", value: numberText(plan.referencePanelHeightPx, "px"), source: "heuristic" },
    { id: "plan.gutter", value: numberText(plan.assumedGutterPx, "px"), source: "heuristic" },
  ];
  return Object.freeze(rows.map((row) => Object.freeze(row)));
})();
