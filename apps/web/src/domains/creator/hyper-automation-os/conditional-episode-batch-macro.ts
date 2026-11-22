/**
 * 조건 분기 60컷 배치 매크로 & 실패 격리/원자적 롤백 엔진 (축 30 · #146–#150).
 *
 * 100% 온디바이스(₩0) 순수·결정론 실행기 (브라우저 스토리지 직접 호출 없음):
 * 1) 녹화형 매크로 레코더 + 조건 분기("3D 컷에만 블러 적용", "대사 없는 컷 제외" 등)
 * 2) 체크포인트 기반 중단(pause) / 이어서 재개(resume)
 * 3) 실패 격리 커밋(`isolate-failures`) vs 전체 원자적 롤백(`atomic-rollback`) (#150):
 *    60컷 중 1컷에서 손상 이미지(`corrupted-image`)나 권한 잠금(`permission-locked`) 오류가 나도
 *    나머지 59컷을 안전 커밋하거나 60컷 전체를 사전 스냅샷으로 100% 원자적 복원한다.
 */

import type { StoryboardCutPlan } from "./minimal-input-autofill-engine";

export type MacroActionKind =
  | "apply-depth-blur"
  | "apply-color-lut"
  | "normalize-line-tint"
  | "flatten-shadow-pass"
  | "add-paper-grain";

export type MacroConditionKind =
  | "only-3d-cuts"
  | "exclude-silent-cuts"
  | "only-dialogue-cuts"
  | "min-tension"
  | "lens-gte"
  | "always";

export type MacroCommitPolicy = "isolate-failures" | "atomic-rollback";

export type CutAssetIntegrity = "ok" | "corrupted-image" | "permission-locked";

export type BatchMacroFailureCode = "CORRUPTED_IMAGE" | "PERMISSION_LOCKED" | "EXECUTOR_ERROR";

export interface MacroConditionRule {
  readonly kind: MacroConditionKind;
  readonly labelKo: string;
  readonly threshold?: number;
}

export interface RecordedMacroStep {
  readonly stepId: string;
  readonly action: MacroActionKind;
  readonly labelKo: string;
  readonly params: {
    readonly blurRadiusPx?: number;
    readonly lutId?: string;
    readonly grainOpacity?: number;
  };
  readonly conditions: readonly MacroConditionRule[];
}

export interface RecordedEpisodeMacro {
  readonly macroId: string;
  readonly nameKo: string;
  readonly steps: readonly RecordedMacroStep[];
}

export interface MacroRecorderDraft {
  readonly macroId: string;
  readonly nameKo: string;
  readonly recording: boolean;
  readonly steps: readonly RecordedMacroStep[];
}

export interface EpisodeMacroCutItem {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly has3dBackground: boolean;
  readonly hasDialogue: boolean;
  readonly dialogueText: string;
  readonly shotType: string;
  readonly lensMm: number;
  readonly tension: number;
  readonly assetIntegrity: CutAssetIntegrity;
  readonly appliedEffects: readonly string[];
  readonly backgroundBlurPx: number;
  readonly toneLutId: string | null;
  readonly lineTintNormalized: boolean;
  readonly paperGrainOpacity: number;
}

export interface BatchMacroFailureDetail {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly code: BatchMacroFailureCode;
  readonly stepId: string;
  readonly messageKo: string;
  readonly remediationKo: string;
}

export interface BatchMacroCutResult {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly status: "applied" | "skipped" | "failed";
  readonly appliedStepIds: readonly string[];
  readonly skippedStepReasons: readonly string[];
  readonly failure: BatchMacroFailureDetail | null;
}

export interface BatchMacroExecutionCheckpoint {
  readonly checkpointId: string;
  readonly macro: RecordedEpisodeMacro;
  readonly commitPolicy: MacroCommitPolicy;
  readonly totalCuts: number;
  readonly nextCutPosition: number;
  readonly preRunSnapshot: readonly EpisodeMacroCutItem[];
  readonly stagedCuts: readonly EpisodeMacroCutItem[];
  readonly processedResults: readonly BatchMacroCutResult[];
  readonly failures: readonly BatchMacroFailureDetail[];
}

export type BatchMacroRunStatus =
  | "paused"
  | "completed"
  | "completed-with-isolated-failures"
  | "rolled-back";

export interface EpisodeBatchMacroReport {
  readonly macroId: string;
  readonly macroNameKo: string;
  readonly commitPolicy: MacroCommitPolicy;
  readonly status: BatchMacroRunStatus;
  readonly totalCuts: number;
  readonly processedCount: number;
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly committedCount: number;
  readonly rolledBack: boolean;
  readonly preRunSnapshot: readonly EpisodeMacroCutItem[];
  readonly finalCuts: readonly EpisodeMacroCutItem[];
  readonly cutResults: readonly BatchMacroCutResult[];
  readonly failures: readonly BatchMacroFailureDetail[];
  readonly checkpoint: BatchMacroExecutionCheckpoint | null;
  readonly summaryKo: string;
}

export interface EpisodeBatchMacroRunOptions {
  readonly cuts: readonly EpisodeMacroCutItem[];
  readonly macro: RecordedEpisodeMacro;
  readonly commitPolicy: MacroCommitPolicy;
  /** 지정한 컷 수까지 처리한 뒤 체크포인트 상태로 안전 중단한다(1 <= N < totalCuts). */
  readonly pauseAfterCount?: number;
  /** 체크포인트 재개용 상태 */
  readonly resumeFromCheckpoint?: BatchMacroExecutionCheckpoint | null;
}

export const CONDITION_ONLY_3D_CUTS: MacroConditionRule = Object.freeze({
  kind: "only-3d-cuts",
  labelKo: "3D 컷에만 적용",
});

export const CONDITION_EXCLUDE_SILENT_CUTS: MacroConditionRule = Object.freeze({
  kind: "exclude-silent-cuts",
  labelKo: "대사 없는 컷 제외",
});

export const DEFAULT_CONDITIONAL_BATCH_MACRO: RecordedEpisodeMacro = Object.freeze({
  macroId: "macro-ep60-default-3d-dialogue",
  nameKo: "60컷 조건 분기 마감 매크로 (3D 블러 · 대사 컷 톤 보정)",
  steps: Object.freeze([
    Object.freeze({
      stepId: "step-3d-depth-blur",
      action: "apply-depth-blur",
      labelKo: "3D 컷에만 배경 가우시안 블러(4.5px) 적용",
      params: Object.freeze({ blurRadiusPx: 4.5 }),
      conditions: Object.freeze([CONDITION_ONLY_3D_CUTS]),
    }),
    Object.freeze({
      stepId: "step-dialogue-tone-lut",
      action: "apply-color-lut",
      labelKo: "대사 있는 컷 색온도 LUT(sunset-warm-17) 적용",
      params: Object.freeze({ lutId: "sunset-warm-17" }),
      conditions: Object.freeze([CONDITION_EXCLUDE_SILENT_CUTS]),
    }),
    Object.freeze({
      stepId: "step-line-tint-normalize",
      action: "normalize-line-tint",
      labelKo: "전 컷 선화 틴트 일괄 정돈",
      params: Object.freeze({}),
      conditions: Object.freeze([Object.freeze({ kind: "always", labelKo: "모든 컷에 적용" })]),
    }),
  ]),
});

function cloneCut(cut: EpisodeMacroCutItem): EpisodeMacroCutItem {
  return Object.freeze({
    ...cut,
    appliedEffects: Object.freeze([...cut.appliedEffects]),
  });
}

function stableMacroHash(seedText: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 녹화형 매크로 세션 시작 */
export function startMacroRecording(nameKo: string, macroId?: string): MacroRecorderDraft {
  const cleanName = nameKo.trim() || "사용자 녹화 매크로";
  return Object.freeze({
    macroId: macroId ?? `macro-rec-${stableMacroHash(cleanName)}`,
    nameKo: cleanName,
    recording: true,
    steps: Object.freeze([]),
  });
}

/** 녹화 세션에 액션 단계 1건 추가 */
export function recordMacroStep(
  draft: MacroRecorderDraft,
  step: Omit<RecordedMacroStep, "stepId"> & { readonly stepId?: string },
): MacroRecorderDraft {
  if (!draft.recording) return draft;
  const stepId = step.stepId ?? `step-${draft.steps.length + 1}-${step.action}`;
  const frozenStep: RecordedMacroStep = Object.freeze({
    stepId,
    action: step.action,
    labelKo: step.labelKo,
    params: Object.freeze({ ...step.params }),
    conditions: Object.freeze(step.conditions.map((cond) => Object.freeze({ ...cond }))),
  });
  return Object.freeze({
    ...draft,
    steps: Object.freeze([...draft.steps, frozenStep]),
  });
}

/** 녹화된 단계에 조건 분기 규칙 추가 */
export function attachMacroStepCondition(
  draft: MacroRecorderDraft,
  stepId: string,
  condition: MacroConditionRule,
): MacroRecorderDraft {
  const steps = draft.steps.map((step) => {
    if (step.stepId !== stepId) return step;
    const exists = step.conditions.some(
      (item) => item.kind === condition.kind && item.threshold === condition.threshold,
    );
    if (exists) return step;
    return Object.freeze({
      ...step,
      conditions: Object.freeze([...step.conditions, Object.freeze({ ...condition })]),
    });
  });
  return Object.freeze({
    ...draft,
    steps: Object.freeze(steps),
  });
}

/** 녹화 종료 및 실행 가능한 불변 매크로 확정 */
export function finalizeRecordedMacro(draft: MacroRecorderDraft): RecordedEpisodeMacro {
  return Object.freeze({
    macroId: draft.macroId,
    nameKo: draft.nameKo,
    steps: draft.steps,
  });
}

/**
 * 파이프라인 콘티 컷 목록에서 60컷(또는 지정 컷 수) 배치 매크로 입력 세트를 결정론적으로 구성한다.
 */
export function createBatchMacroCutsFromStoryboard(
  storyboardCuts: readonly StoryboardCutPlan[],
  targetCutCount = 60,
  faultInjections: Readonly<Record<number, CutAssetIntegrity>> = {},
): readonly EpisodeMacroCutItem[] {
  const total = Math.max(1, Math.min(200, Math.round(targetCutCount)));
  const items: EpisodeMacroCutItem[] = [];

  for (let i = 0; i < total; i += 1) {
    const cutIndex = i + 1;
    const source = storyboardCuts.length > 0 ? storyboardCuts[i % storyboardCuts.length] : null;
    // 약 60%는 3D 배경 포함 컷, 약 75%는 대사 보유 컷 (나머지는 침묵/연출 컷)
    const has3dBackground = cutIndex % 5 !== 0 && cutIndex % 3 !== 0;
    const isSilentCut = cutIndex % 4 === 0;
    const dialogueText = isSilentCut
      ? ""
      : source?.dialogueLine?.trim() || `${cutIndex}컷 대사 흐름을 이어간다.`;
    const hasDialogue = dialogueText.length > 0;
    const integrity = faultInjections[cutIndex] ?? "ok";

    items.push(
      Object.freeze({
        cutIndex,
        cutId: `ep-cut-${String(cutIndex).padStart(3, "0")}`,
        has3dBackground,
        hasDialogue,
        dialogueText,
        shotType: source?.shotType ?? (has3dBackground ? "미디엄 3D 배경 샷" : "클로즈업 2D 샷"),
        lensMm: source?.lensMm ?? (has3dBackground ? 50 : 85),
        tension: source?.tension ?? 45 + ((cutIndex * 11) % 50),
        assetIntegrity: integrity,
        appliedEffects: Object.freeze([]),
        backgroundBlurPx: 0,
        toneLutId: null,
        lineTintNormalized: false,
        paperGrainOpacity: 0,
      }),
    );
  }

  return Object.freeze(items);
}

/**
 * 컷 1개에 대해 단계 조건 분기 목록을 평가한다.
 */
export function evaluateMacroStepConditions(
  cut: EpisodeMacroCutItem,
  conditions: readonly MacroConditionRule[],
): { readonly matched: boolean; readonly skipReasonKo: string | null } {
  for (const cond of conditions) {
    switch (cond.kind) {
      case "always":
        break;
      case "only-3d-cuts":
        if (!cut.has3dBackground) {
          return { matched: false, skipReasonKo: "조건 분기 제외: 3D 배경이 없는 2D 컷" };
        }
        break;
      case "exclude-silent-cuts":
      case "only-dialogue-cuts":
        if (!cut.hasDialogue || cut.dialogueText.trim().length === 0) {
          return { matched: false, skipReasonKo: "조건 분기 제외: 대사 없는 컷" };
        }
        break;
      case "min-tension": {
        const minTension = cond.threshold ?? 60;
        if (cut.tension < minTension) {
          return {
            matched: false,
            skipReasonKo: `조건 분기 제외: 감정 텐션(${cut.tension}%) < 기준(${minTension}%)`,
          };
        }
        break;
      }
      case "lens-gte": {
        const minLens = cond.threshold ?? 50;
        if (cut.lensMm < minLens) {
          return {
            matched: false,
            skipReasonKo: `조건 분기 제외: 렌즈(${cut.lensMm}mm) < 기준(${minLens}mm)`,
          };
        }
        break;
      }
    }
  }
  return { matched: true, skipReasonKo: null };
}

function applySingleMacroStepToCut(
  cut: EpisodeMacroCutItem,
  step: RecordedMacroStep,
): EpisodeMacroCutItem {
  const effects = cut.appliedEffects.includes(step.stepId)
    ? cut.appliedEffects
    : Object.freeze([...cut.appliedEffects, step.stepId]);

  switch (step.action) {
    case "apply-depth-blur":
      return Object.freeze({
        ...cut,
        appliedEffects: effects,
        backgroundBlurPx: step.params.blurRadiusPx ?? 4.5,
      });
    case "apply-color-lut":
      return Object.freeze({
        ...cut,
        appliedEffects: effects,
        toneLutId: step.params.lutId ?? "default-lut-17",
      });
    case "normalize-line-tint":
      return Object.freeze({
        ...cut,
        appliedEffects: effects,
        lineTintNormalized: true,
      });
    case "add-paper-grain":
      return Object.freeze({
        ...cut,
        appliedEffects: effects,
        paperGrainOpacity: step.params.grainOpacity ?? 0.16,
      });
    case "flatten-shadow-pass":
    default:
      return Object.freeze({
        ...cut,
        appliedEffects: effects,
      });
  }
}

function buildCutFailureDetail(
  cut: EpisodeMacroCutItem,
  step: RecordedMacroStep,
): BatchMacroFailureDetail | null {
  if (cut.assetIntegrity === "corrupted-image") {
    return Object.freeze({
      cutIndex: cut.cutIndex,
      cutId: cut.cutId,
      code: "CORRUPTED_IMAGE",
      stepId: step.stepId,
      messageKo: `${cut.cutIndex}컷(${cut.cutId})에서 손상된 이미지 데이터를 감지해 매크로 쓰기를 차단했습니다.`,
      remediationKo: "손상된 레이어를 백업 스냅샷에서 복구한 뒤 해당 컷만 단독 재실행하세요.",
    });
  }
  if (cut.assetIntegrity === "permission-locked") {
    return Object.freeze({
      cutIndex: cut.cutIndex,
      cutId: cut.cutId,
      code: "PERMISSION_LOCKED",
      stepId: step.stepId,
      messageKo: `${cut.cutIndex}컷(${cut.cutId})이 권한 잠금 상태라 매크로 쓰기가 거부되었습니다.`,
      remediationKo: "컷 잠금을 해제하거나 읽기 전용 보호 컷으로 분리한 뒤 재시도하세요.",
    });
  }
  return null;
}

function finalizeReport(
  macro: RecordedEpisodeMacro,
  commitPolicy: MacroCommitPolicy,
  preRunSnapshot: readonly EpisodeMacroCutItem[],
  stagedCuts: readonly EpisodeMacroCutItem[],
  processedResults: readonly BatchMacroCutResult[],
  failures: readonly BatchMacroFailureDetail[],
): EpisodeBatchMacroReport {
  const totalCuts = preRunSnapshot.length;
  const appliedCount = processedResults.filter((item) => item.status === "applied").length;
  const skippedCount = processedResults.filter((item) => item.status === "skipped").length;
  const failedCount = failures.length;

  if (failedCount > 0 && commitPolicy === "atomic-rollback") {
    const restoredCuts = Object.freeze(preRunSnapshot.map(cloneCut));
    return Object.freeze({
      macroId: macro.macroId,
      macroNameKo: macro.nameKo,
      commitPolicy,
      status: "rolled-back",
      totalCuts,
      processedCount: processedResults.length,
      appliedCount,
      skippedCount,
      failedCount,
      committedCount: 0,
      rolledBack: true,
      preRunSnapshot,
      finalCuts: restoredCuts,
      cutResults: Object.freeze([...processedResults]),
      failures: Object.freeze([...failures]),
      checkpoint: null,
      summaryKo: `총 ${totalCuts}컷 중 ${failedCount}컷 오류 감지 → 전체 원자적 롤백 완료(0컷 반영 · 원본 100% 보존).`,
    });
  }

  const finalCuts = Object.freeze(stagedCuts.map(cloneCut));
  const status: BatchMacroRunStatus =
    failedCount > 0 ? "completed-with-isolated-failures" : "completed";
  const safeCommittedCuts = totalCuts - failedCount;
  const summaryKo =
    failedCount > 0
      ? `총 ${totalCuts}컷 중 오류 ${failedCount}컷 격리 · 나머지 ${safeCommittedCuts}컷 안전 커밋(적용 ${appliedCount}컷 · 조건 제외 ${skippedCount}컷).`
      : `총 ${totalCuts}컷 배치 매크로 완료 · 적용 ${appliedCount}컷 · 조건 제외 ${skippedCount}컷 · 오류 0건.`;

  return Object.freeze({
    macroId: macro.macroId,
    macroNameKo: macro.nameKo,
    commitPolicy,
    status,
    totalCuts,
    processedCount: processedResults.length,
    appliedCount,
    skippedCount,
    failedCount,
    committedCount: appliedCount,
    rolledBack: false,
    preRunSnapshot,
    finalCuts,
    cutResults: Object.freeze([...processedResults]),
    failures: Object.freeze([...failures]),
    checkpoint: null,
    summaryKo,
  });
}

/**
 * 조건 분기 60컷 배치 매크로 실행기 (체크포인트 중단/재개 + 실패 격리 커밋 vs 전체 원자적 롤백).
 */
export function executeEpisodeBatchMacro(
  options: EpisodeBatchMacroRunOptions,
): EpisodeBatchMacroReport {
  const resume = options.resumeFromCheckpoint ?? null;
  const macro = resume ? resume.macro : options.macro;
  const commitPolicy = options.commitPolicy ?? resume?.commitPolicy ?? "isolate-failures";

  const preRunSnapshot: readonly EpisodeMacroCutItem[] = resume
    ? resume.preRunSnapshot
    : Object.freeze(options.cuts.map(cloneCut));
  const stagedCuts: EpisodeMacroCutItem[] = resume
    ? resume.stagedCuts.map(cloneCut)
    : options.cuts.map(cloneCut);
  const processedResults: BatchMacroCutResult[] = resume ? [...resume.processedResults] : [];
  const failures: BatchMacroFailureDetail[] = resume ? [...resume.failures] : [];

  const totalCuts = preRunSnapshot.length;
  const startPos = resume ? resume.nextCutPosition : 0;
  const stopLimit =
    typeof options.pauseAfterCount === "number" && options.pauseAfterCount > 0
      ? Math.min(totalCuts, startPos + Math.floor(options.pauseAfterCount))
      : totalCuts;

  for (let idx = startPos; idx < stopLimit; idx += 1) {
    const originalCut = stagedCuts[idx]!;
    const matchingSteps: RecordedMacroStep[] = [];
    const skippedStepReasons: string[] = [];

    for (const step of macro.steps) {
      const verdict = evaluateMacroStepConditions(originalCut, step.conditions);
      if (verdict.matched) {
        matchingSteps.push(step);
      } else if (verdict.skipReasonKo) {
        skippedStepReasons.push(`${step.labelKo}: ${verdict.skipReasonKo}`);
      }
    }

    if (matchingSteps.length === 0) {
      processedResults.push(
        Object.freeze({
          cutIndex: originalCut.cutIndex,
          cutId: originalCut.cutId,
          status: "skipped",
          appliedStepIds: Object.freeze([]),
          skippedStepReasons: Object.freeze(skippedStepReasons),
          failure: null,
        }),
      );
      continue;
    }

    const firstFailure = buildCutFailureDetail(originalCut, matchingSteps[0]!);
    if (firstFailure) {
      // 실패한 컷은 stagedCuts 원본을 유지해 격리한다.
      failures.push(firstFailure);
      processedResults.push(
        Object.freeze({
          cutIndex: originalCut.cutIndex,
          cutId: originalCut.cutId,
          status: "failed",
          appliedStepIds: Object.freeze([]),
          skippedStepReasons: Object.freeze(skippedStepReasons),
          failure: firstFailure,
        }),
      );
      continue;
    }

    let updatedCut = originalCut;
    const appliedStepIds: string[] = [];
    for (const step of matchingSteps) {
      updatedCut = applySingleMacroStepToCut(updatedCut, step);
      appliedStepIds.push(step.stepId);
    }
    stagedCuts[idx] = updatedCut;
    processedResults.push(
      Object.freeze({
        cutIndex: updatedCut.cutIndex,
        cutId: updatedCut.cutId,
        status: "applied",
        appliedStepIds: Object.freeze(appliedStepIds),
        skippedStepReasons: Object.freeze(skippedStepReasons),
        failure: null,
      }),
    );
  }

  if (stopLimit < totalCuts) {
    const checkpoint: BatchMacroExecutionCheckpoint = Object.freeze({
      checkpointId: `ckpt-${stableMacroHash(`${macro.macroId}:${stopLimit}:${totalCuts}`)}`,
      macro,
      commitPolicy,
      totalCuts,
      nextCutPosition: stopLimit,
      preRunSnapshot,
      stagedCuts: Object.freeze(stagedCuts.map(cloneCut)),
      processedResults: Object.freeze([...processedResults]),
      failures: Object.freeze([...failures]),
    });

    const appliedCount = processedResults.filter((item) => item.status === "applied").length;
    const skippedCount = processedResults.filter((item) => item.status === "skipped").length;

    return Object.freeze({
      macroId: macro.macroId,
      macroNameKo: macro.nameKo,
      commitPolicy,
      status: "paused",
      totalCuts,
      processedCount: stopLimit,
      appliedCount,
      skippedCount,
      failedCount: failures.length,
      committedCount: 0,
      rolledBack: false,
      preRunSnapshot,
      finalCuts: preRunSnapshot,
      cutResults: Object.freeze([...processedResults]),
      failures: Object.freeze([...failures]),
      checkpoint,
      summaryKo: `체크포인트 일시 중단 (${stopLimit}/${totalCuts}컷 처리 완료 · 이어서 재개 가능).`,
    });
  }

  return finalizeReport(
    macro,
    commitPolicy,
    preRunSnapshot,
    stagedCuts,
    processedResults,
    failures,
  );
}

/** 체크포인트에서 중단된 배치 매크로를 이어서 끝까지(또는 다음 체크포인트까지) 재개한다. */
export function resumeEpisodeBatchMacro(
  checkpoint: BatchMacroExecutionCheckpoint,
  options: {
    readonly commitPolicy?: MacroCommitPolicy;
    readonly pauseAfterCount?: number;
  } = {},
): EpisodeBatchMacroReport {
  return executeEpisodeBatchMacro({
    cuts: checkpoint.preRunSnapshot,
    macro: checkpoint.macro,
    commitPolicy: options.commitPolicy ?? checkpoint.commitPolicy,
    pauseAfterCount: options.pauseAfterCount,
    resumeFromCheckpoint: checkpoint,
  });
}

/**
 * 조건 분기 옵션(3D 컷 블러 / 대사 없는 컷 제외)으로 실행 매크로를 구성하는 편의 빌더.
 */
export function buildConditionalBatchMacro(options: {
  readonly blurOnlyOn3dCuts: boolean;
  readonly excludeSilentCutsForTone: boolean;
  readonly includeLineTintAllCuts?: boolean;
}): RecordedEpisodeMacro {
  let draft = startMacroRecording("조건 분기 60컷 마감 매크로", "macro-custom-60cut");
  draft = recordMacroStep(draft, {
    stepId: "step-3d-depth-blur",
    action: "apply-depth-blur",
    labelKo: options.blurOnlyOn3dCuts
      ? "3D 컷에만 배경 가우시안 블러 적용"
      : "전 컷 배경 가우시안 블러 적용",
    params: { blurRadiusPx: 4.5 },
    conditions: options.blurOnlyOn3dCuts
      ? [CONDITION_ONLY_3D_CUTS]
      : [{ kind: "always", labelKo: "모든 컷에 적용" }],
  });
  draft = recordMacroStep(draft, {
    stepId: "step-dialogue-tone-lut",
    action: "apply-color-lut",
    labelKo: options.excludeSilentCutsForTone
      ? "대사 없는 컷 제외 색온도 LUT 적용"
      : "전 컷 색온도 LUT 적용",
    params: { lutId: "sunset-warm-17" },
    conditions: options.excludeSilentCutsForTone
      ? [CONDITION_EXCLUDE_SILENT_CUTS]
      : [{ kind: "always", labelKo: "모든 컷에 적용" }],
  });
  if (options.includeLineTintAllCuts !== false) {
    draft = recordMacroStep(draft, {
      stepId: "step-line-tint-normalize",
      action: "normalize-line-tint",
      labelKo: "선화 틴트 일괄 정돈",
      params: {},
      conditions: [{ kind: "always", labelKo: "모든 컷에 적용" }],
    });
  }
  return finalizeRecordedMacro(draft);
}
