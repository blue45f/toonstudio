/**
 * Studio 편집 히스토리(`HistorySnapshot[]`, `TimelapseStepInfo[]`)를
 * 공정별 5단계 스냅샷(콘티→선화→밑색→명암→식자)과 컷 배열로 변환하는 어댑터.
 */

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";

import {
  WEBTOON_PROCESS_STAGES,
  type ManuscriptStageSnapshot,
  type ShortformAspectPreset,
  type ShortformCameraIntensity,
  type ShortformCodecId,
  type ShortformCutInput,
  type ShortformFps,
  type ShortformPlannerInput,
  type ShortformPlatformId,
  type WebtoonProcessStage,
} from "./timelapse-stage-types";

import type { HistoryElementLike, HistoryPageLike, HistorySnapshot } from "../studio-history-labels";
import type { TimelapseStepInfo } from "../studio-timelapse";

const STAGE_KEYWORD_RULES: ReadonlyArray<{
  readonly stage: WebtoonProcessStage;
  readonly pattern: RegExp;
}> = [
  { stage: "lettering", pattern: /(?:식자|말풍선|텍스트|대사|효과음|글자|bubble|text|sfx|letter)/iu },
  { stage: "shading", pattern: /(?:명암|그림자|하이라이트|보정|필터|그레이딩|효과|집중선|스피드선|shade|shadow|grade|filter|lighting)/iu },
  { stage: "flat-color", pattern: /(?:밑색|채색|채우기|배경|색상|컬러|fill|color|paint|bg)/iu },
  { stage: "lineart", pattern: /(?:선화|펜|잉크|드로잉|선|그리기|스트로크|line|ink|draw|stroke|pen)/iu },
  { stage: "conti", pattern: /(?:콘티|러프|스케치|컷|프레임|구도|초안|conti|rough|sketch|frame|layout)/iu },
];

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 히스토리 단계 라벨과 진행 비율로 5대 웹툰 공정(콘티→선화→밑색→명암→식자)을 분류한다.
 */
export function classifyHistoryStepStage(
  label: string,
  stepIndex: number,
  totalSteps: number,
): WebtoonProcessStage {
  const normalized = label.trim();
  for (const rule of STAGE_KEYWORD_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.stage;
    }
  }
  const safeTotal = Math.max(1, totalSteps);
  const ratio = safeTotal === 1 ? 1 : stepIndex / (safeTotal - 1);
  if (ratio < 0.2) return "conti";
  if (ratio < 0.45) return "lineart";
  if (ratio < 0.68) return "flat-color";
  if (ratio < 0.86) return "shading";
  return "lettering";
}

function extractDialogueHookForBounds(
  elements: readonly HistoryElementLike[],
  bx: number,
  by: number,
  bw: number,
  bh: number,
): string | undefined {
  for (const el of elements) {
    if (el.hidden === true) continue;
    if (el.type !== "bubble" && el.type !== "text") continue;
    if (typeof el.text !== "string") continue;
    const cleaned = el.text.replace(/\s+/gu, " ").trim();
    if (!cleaned) continue;
    const ex = finiteNumber(el.x, -1);
    const ey = finiteNumber(el.y, -1);
    if (ex >= bx - 24 && ex <= bx + bw + 24 && ey >= by - 24 && ey <= by + bh + 24) {
      return cleaned.length > 26 ? `${cleaned.slice(0, 25)}…` : cleaned;
    }
  }
  return undefined;
}

/**
 * 최신 페이지 스냅샷의 컷 프레임(`type === "frame"`)에서 숏폼 카메라 컷 배열을 추출한다.
 */
export function extractCutsFromHistoryPage(
  page: HistoryPageLike | undefined,
  manuscriptWidth: number,
  manuscriptHeight: number,
): readonly ShortformCutInput[] {
  if (!page) return [];
  const frames = page.elements
    .filter(
      (el) =>
        el.hidden !== true &&
        el.type === "frame" &&
        finiteNumber(el.width, 0) >= 32 &&
        finiteNumber(el.height, 0) >= 32,
    )
    .map((el) => {
      const x = Math.max(0, Math.min(manuscriptWidth - 16, finiteNumber(el.x, 0)));
      const y = Math.max(0, Math.min(manuscriptHeight - 16, finiteNumber(el.y, 0)));
      const width = Math.max(16, Math.min(manuscriptWidth - x, finiteNumber(el.width, manuscriptWidth)));
      const height = Math.max(16, Math.min(manuscriptHeight - y, finiteNumber(el.height, manuscriptHeight)));
      return {
        id: el.id,
        x,
        y,
        width,
        height,
      };
    })
    .sort((a, b) => (Math.abs(a.y - b.y) > 28 ? a.y - b.y : a.x - b.x));

  if (frames.length === 0) return [];

  return Object.freeze(
    frames.map((frame, index): ShortformCutInput => ({
      cutId: frame.id || `cut-${index + 1}`,
      index,
      bounds: {
        x: Math.round(frame.x),
        y: Math.round(frame.y),
        width: Math.round(frame.width),
        height: Math.round(frame.height),
      },
      focalPoint: {
        x: Math.round(frame.x + frame.width / 2),
        y: Math.round(frame.y + frame.height / 2),
      },
      captionText: extractDialogueHookForBounds(
        page.elements,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
      ),
      dramaticWeight: index === frames.length - 1 ? 1.25 : 1.0,
      preferredMotion: "auto",
    })),
  );
}

export interface BuildShortformInputFromHistoryOptions {
  readonly title: string;
  readonly history: readonly HistorySnapshot[];
  readonly steps: readonly TimelapseStepInfo[];
  readonly pageId: string;
  readonly enabledStages?: ReadonlySet<WebtoonProcessStage>;
  readonly aspectPreset?: ShortformAspectPreset;
  readonly platform?: ShortformPlatformId;
  readonly fps?: ShortformFps;
  readonly targetDurationSec?: number;
  readonly cameraIntensity?: ShortformCameraIntensity;
  readonly codec?: ShortformCodecId;
  readonly reducedMotion?: boolean;
}

/**
 * `StudioTimelapsePanel`의 페이지 편집 히스토리를 `planLocalTimelapseShortform` 입력 계약으로 변환한다.
 */
export function buildShortformInputFromHistory(
  options: BuildShortformInputFromHistoryOptions,
): ShortformPlannerInput {
  const { history, steps, pageId, enabledStages } = options;
  let latestPage: HistoryPageLike | undefined;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const found = history[i]?.find((p) => p.id === pageId);
    if (found) {
      latestPage = found;
      break;
    }
  }

  const manuscriptWidth = STUDIO_CANVAS_WIDTH;
  const manuscriptHeight = Math.max(
    400,
    Math.round(finiteNumber(latestPage?.canvasH, 1600)),
  );

  const stageMap = new Map<WebtoonProcessStage, ManuscriptStageSnapshot>();
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!step) continue;
    const stage = classifyHistoryStepStage(step.label, i, steps.length);
    stageMap.set(stage, {
      id: `hist-${step.historyIndex}-${stage}`,
      stage,
      width: manuscriptWidth,
      height: manuscriptHeight,
      capturedAtMs: i * 1000,
      historyIndex: step.historyIndex,
      label: step.label,
      strokeCount: step.elementCount,
      available: true,
    });
  }

  // 히스토리에 키워드가 적거나 단계가 적더라도 5단계 공정 스냅샷을 누락 없이 구성한다.
  const orderedSnapshots: ManuscriptStageSnapshot[] = [];
  for (let i = 0; i < WEBTOON_PROCESS_STAGES.length; i += 1) {
    const spec = WEBTOON_PROCESS_STAGES[i];
    if (!spec) continue;
    if (enabledStages && !enabledStages.has(spec.id)) continue;
    const direct = stageMap.get(spec.id);
    if (direct) {
      orderedSnapshots.push(direct);
      continue;
    }
    if (steps.length > 0) {
      const fallbackIdx = Math.min(
        steps.length - 1,
        Math.round((i / Math.max(1, WEBTOON_PROCESS_STAGES.length - 1)) * (steps.length - 1)),
      );
      const fallbackStep = steps[fallbackIdx];
      orderedSnapshots.push({
        id: `mapped-${spec.id}-${fallbackStep?.historyIndex ?? 0}`,
        stage: spec.id,
        width: manuscriptWidth,
        height: manuscriptHeight,
        capturedAtMs: i * 1000,
        historyIndex: fallbackStep?.historyIndex,
        label: fallbackStep?.label ?? spec.labelKo,
        strokeCount: fallbackStep?.elementCount ?? 0,
        available: true,
      });
    } else {
      orderedSnapshots.push({
        id: `preview-${spec.id}`,
        stage: spec.id,
        width: manuscriptWidth,
        height: manuscriptHeight,
        capturedAtMs: i * 1000,
        label: spec.labelKo,
        available: true,
      });
    }
  }

  const cuts = extractCutsFromHistoryPage(latestPage, manuscriptWidth, manuscriptHeight);

  return {
    title: options.title,
    manuscriptWidth,
    manuscriptHeight,
    stageSnapshots: Object.freeze(orderedSnapshots),
    cuts,
    aspectPreset: options.aspectPreset,
    platform: options.platform,
    fps: options.fps,
    targetDurationSec: options.targetDurationSec,
    cameraIntensity: options.cameraIntensity,
    codec: options.codec,
    reducedMotion: options.reducedMotion,
  };
}
