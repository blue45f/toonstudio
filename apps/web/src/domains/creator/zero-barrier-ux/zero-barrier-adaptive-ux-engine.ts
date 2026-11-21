/**
 * 진입장벽 제로(Zero-Barrier) 적응형 워크스페이스 통합 엔진.
 *
 * 1. 숙련도 3단계(`beginner-easy` · `creator-standard` · `pro-studio`) 전환 및 작업 단계별 도구 노출 필터
 * 2. 원클릭 장르 스타터 킷 6종 즉시 스냅샷 생성(빈 캔버스 공포 0%)
 * 3. 한국어/영어 자연어 음성 명령 파서 및 `SpeechRecognition` 래퍼 re-export
 * 4. 맥락형 인라인 스마트 가이드(15초 멈춤·반복 취소 감지) & 1초 안전 복구 루프(Panic-Free Undo)
 */

import {
  CREATION_STAGE_PROFILES,
  GENRE_STARTER_KITS,
  STUDIO_ADAPTIVE_TOOL_CATALOG,
  type BeginnerCoreActionId,
  type CreationStageId,
  type GenreStarterKitId,
  type StarterCanvasSnapshot,
  type StudioAdaptiveTool,
  type WorkspaceProficiencyMode,
} from "./zero-barrier-catalog";

export {
  CREATION_STAGE_PROFILES,
  GENRE_STARTER_KITS,
  PROFICIENCY_MODE_PROFILES,
  QUICK_VOICE_COMMAND_PRESETS,
  STUDIO_ADAPTIVE_TOOL_CATALOG,
  VOICE_COMMAND_RULES,
  type BeginnerCoreActionId,
  type CreationStageId,
  type CreationStageProfile,
  type GenreStarterKitDefinition,
  type GenreStarterKitId,
  type ProficiencyModeProfile,
  type StarterCanvasSnapshot,
  type StarterPanelItem,
  type StudioAdaptiveTool,
  type VoiceCommandActionId,
  type VoiceCommandRule,
  type WorkspaceProficiencyMode,
} from "./zero-barrier-catalog";

export {
  applyVoiceCommandToSnapshot,
  createBrowserVoiceCommandSession,
  parseVoiceCanvasCommand,
  resolveBrowserSpeechRecognitionCtor,
  type BrowserVoiceSessionHandle,
  type BrowserVoiceSessionOptions,
  type SpeechRecognitionAlternativeLike,
  type SpeechRecognitionConstructorLike,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionInstanceLike,
  type SpeechRecognitionResultLike,
  type VoiceCommandApplyResult,
  type VoiceCommandCandidate,
  type VoiceCommandParseResult,
} from "./zero-barrier-voice-recovery";

export interface BeginnerCoreButtonSpec {
  readonly id: BeginnerCoreActionId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly targetStage: CreationStageId;
  readonly highlighted: boolean;
}

export interface AdaptiveWorkspaceView {
  readonly mode: WorkspaceProficiencyMode;
  readonly stage: CreationStageId;
  readonly totalCatalogToolCount: number;
  readonly modeAllowedTools: readonly StudioAdaptiveTool[];
  readonly stageVisibleTools: readonly StudioAdaptiveTool[];
  readonly hiddenByModeCount: number;
  readonly hiddenByStageCount: number;
  readonly hiddenComplexityPercent: number;
  readonly coreButtons: readonly BeginnerCoreButtonSpec[];
}

export interface UserActivityTelemetry {
  readonly idleDurationMs: number;
  readonly consecutiveUndoCount: number;
  readonly recentFailedCommandCount: number;
  readonly currentStage: CreationStageId;
  readonly mode: WorkspaceProficiencyMode;
  readonly hasStarterSnapshot: boolean;
}

export type InlineGuideTriggerReason =
  | "none"
  | "idle-hesitation"
  | "repeated-undo"
  | "command-mismatch";

export interface InlineSmartGuideResult {
  readonly needsHelp: boolean;
  readonly triggerReason: InlineGuideTriggerReason;
  readonly headlineKo: string;
  readonly headlineEn: string;
  readonly recommendedActionLabelKo: string;
  readonly recommendedActionLabelEn: string;
  readonly recommendedActionKind:
    | "apply-starter-kit"
    | "instant-recover"
    | "run-voice-chip"
    | "promote-mode";
  readonly suggestOneSecondRecovery: boolean;
}

export interface RecoveryCheckpoint {
  readonly checkpointId: string;
  readonly labelKo: string;
  readonly snapshot: StarterCanvasSnapshot;
  readonly createdAtMs: number;
}

export interface RecoveryCheckpointStore {
  readonly current: StarterCanvasSnapshot;
  readonly history: readonly RecoveryCheckpoint[];
  readonly redoStack: readonly RecoveryCheckpoint[];
  readonly lastRecoveryLabelKo: string | null;
  readonly totalRecoveries: number;
}

export interface RecoveryActionOutcome {
  readonly ok: boolean;
  readonly store: RecoveryCheckpointStore;
  readonly restoredLabelKo: string | null;
  readonly recoveryTargetMs: 1000;
}

export const IDLE_HESITATION_THRESHOLD_MS = 15_000;
export const REPEATED_UNDO_THRESHOLD = 2;
const MAX_RECOVERY_HISTORY = 24;

const MODE_RANK: Record<WorkspaceProficiencyMode, number> = {
  "beginner-easy": 0,
  "creator-standard": 1,
  "pro-studio": 2,
};

export function resolveAdaptiveWorkspaceView(
  mode: WorkspaceProficiencyMode,
  stage: CreationStageId,
): AdaptiveWorkspaceView {
  const rank = MODE_RANK[mode];
  const modeAllowedTools = STUDIO_ADAPTIVE_TOOL_CATALOG.filter(
    (tool) => MODE_RANK[tool.minMode] <= rank,
  );
  const stageVisibleTools = modeAllowedTools.filter((tool) => tool.stages.includes(stage));
  const totalCatalogToolCount = STUDIO_ADAPTIVE_TOOL_CATALOG.length;
  const hiddenByModeCount = totalCatalogToolCount - modeAllowedTools.length;
  const hiddenByStageCount = modeAllowedTools.length - stageVisibleTools.length;
  const hiddenComplexityPercent = Math.round((hiddenByModeCount / totalCatalogToolCount) * 100);

  const stageProfile =
    CREATION_STAGE_PROFILES.find((item) => item.id === stage) ?? CREATION_STAGE_PROFILES[0];
  const coreTools = STUDIO_ADAPTIVE_TOOL_CATALOG.filter(
    (tool): tool is StudioAdaptiveTool & { readonly coreBeginnerActionId: BeginnerCoreActionId } =>
      tool.coreBeginnerActionId !== null,
  );

  const coreButtons: readonly BeginnerCoreButtonSpec[] = coreTools.map((tool) => ({
    id: tool.coreBeginnerActionId,
    labelKo: tool.labelKo,
    labelEn: tool.labelEn,
    hintKo: tool.plainHintKo,
    hintEn: tool.plainHintEn,
    targetStage: tool.stages[0] ?? "idea",
    highlighted: stageProfile ? tool.coreBeginnerActionId === stageProfile.primaryCoreActionId : false,
  }));

  return {
    mode,
    stage,
    totalCatalogToolCount,
    modeAllowedTools,
    stageVisibleTools,
    hiddenByModeCount,
    hiddenByStageCount,
    hiddenComplexityPercent,
    coreButtons,
  };
}

export function getNextProficiencyMode(current: WorkspaceProficiencyMode): WorkspaceProficiencyMode {
  if (current === "beginner-easy") return "creator-standard";
  if (current === "creator-standard") return "pro-studio";
  return "pro-studio";
}

export function createStarterKitSnapshot(
  kitId: GenreStarterKitId,
  options?: { readonly seq?: number; readonly timestampMs?: number },
): StarterCanvasSnapshot {
  const kit = GENRE_STARTER_KITS.find((item) => item.id === kitId) ?? GENRE_STARTER_KITS[0];
  if (!kit) {
    throw new Error(`알 수 없는 스타터 킷입니다: ${kitId}`);
  }
  const seq = options?.seq ?? 1;
  const timestampMs = options?.timestampMs ?? 1_763_740_000_000;
  return {
    snapshotId: `starter-${kit.id}-${seq}`,
    kitId: kit.id,
    titleKo: kit.titleKo,
    titleEn: kit.titleEn,
    activeBackdropKo: kit.backdropKo,
    panels: kit.panels.map((panel) => ({ ...panel })),
    savedCount: 1,
    exportReady: true,
    emptyCanvasRiskPercent: 0,
    lastChangeSummaryKo: `${kit.titleKo} 스타터 킷 4컷을 바로 채웠어요.`,
    updatedAtMs: timestampMs,
  };
}

export function detectInlineSmartGuide(telemetry: UserActivityTelemetry): InlineSmartGuideResult {
  if (telemetry.consecutiveUndoCount >= REPEATED_UNDO_THRESHOLD) {
    return {
      needsHelp: true,
      triggerReason: "repeated-undo",
      headlineKo:
        "방금 작업을 여러 번 되돌리셨네요. 걱정 마세요! 1초 만에 직전 안정 상태로 안전 복구할 수 있어요.",
      headlineEn:
        "Noticed repeated undos. Restore your last clean checkpoint safely in 1 second.",
      recommendedActionLabelKo: "1초 만에 방금 전으로 안전 복구",
      recommendedActionLabelEn: "Restore last safe state in 1s",
      recommendedActionKind: "instant-recover",
      suggestOneSecondRecovery: true,
    };
  }

  if (telemetry.recentFailedCommandCount >= 2) {
    return {
      needsHelp: true,
      triggerReason: "command-mismatch",
      headlineKo:
        "명령이 두 번 어긋났어요. 직접 치지 말고 '채색해 줘' 빠른 버튼을 한 번만 눌러 보세요.",
      headlineEn: "Commands missed twice. Tap the quick 'Color it' chip for an instant result.",
      recommendedActionLabelKo: "'채색해 줘' 바로 실행",
      recommendedActionLabelEn: "Run 'Color it' now",
      recommendedActionKind: "run-voice-chip",
      suggestOneSecondRecovery: false,
    };
  }

  if (telemetry.idleDurationMs >= IDLE_HESITATION_THRESHOLD_MS) {
    if (
      !telemetry.hasStarterSnapshot ||
      telemetry.currentStage === "idea" ||
      telemetry.currentStage === "panel"
    ) {
      return {
        needsHelp: true,
        triggerReason: "idle-hesitation",
        headlineKo:
          "15초 넘게 멈춰 계시네요. 빈 화면부터 그리지 말고 장르 스타터 킷을 눌러 4컷 초안을 바로 열어 보세요.",
        headlineEn: "Paused for 15s+. Tap a genre starter kit to fill 4 panels immediately.",
        recommendedActionLabelKo: "로판 1화 스타터 킷 바로 열기",
        recommendedActionLabelEn: "Load Rofan starter kit",
        recommendedActionKind: "apply-starter-kit",
        suggestOneSecondRecovery: false,
      };
    }

    return {
      needsHelp: true,
      triggerReason: "idle-hesitation",
      headlineKo:
        "다음 손이 막히셨나요? '채색해 줘'나 '말풍선 추가' 버튼 한 번으로 다음 단계를 바로 채워 보세요.",
      headlineEn: "Feeling stuck? Tap 'Color it' or 'Add speech bubble' to move forward instantly.",
      recommendedActionLabelKo: "추천 빠른 명령 1클릭 실행",
      recommendedActionLabelEn: "Run quick helper command",
      recommendedActionKind: "run-voice-chip",
      suggestOneSecondRecovery: true,
    };
  }

  return {
    needsHelp: false,
    triggerReason: "none",
    headlineKo:
      telemetry.mode === "beginner-easy"
        ? "핵심 4버튼 순서대로 누르기만 하면 첫 웹툰 4컷이 바로 완성돼요. 익숙해지면 언제든 프로 모드로 확장하세요."
        : "현재 단계에 꼭 필요한 도구만 펼쳐 두었어요. 실수해도 1초 안전 복구로 언제든 되돌아올 수 있어요.",
    headlineEn:
      telemetry.mode === "beginner-easy"
        ? "Follow the 4 core buttons to complete your first 4 panels, then expand to Pro anytime."
        : "Only tools for this stage are shown. Use 1-second safe recovery anytime.",
    recommendedActionLabelKo:
      telemetry.mode === "beginner-easy" ? "프로 모드로 1클릭 확장" : "초보 4버튼 화면으로 정리",
    recommendedActionLabelEn:
      telemetry.mode === "beginner-easy" ? "1-click expand to Pro" : "Back to simple 4 buttons",
    recommendedActionKind: "promote-mode",
    suggestOneSecondRecovery: false,
  };
}

export function createRecoveryStore(initialSnapshot: StarterCanvasSnapshot): RecoveryCheckpointStore {
  return {
    current: initialSnapshot,
    history: [],
    redoStack: [],
    lastRecoveryLabelKo: null,
    totalRecoveries: 0,
  };
}

export function pushRecoveryCheckpoint(
  store: RecoveryCheckpointStore,
  nextSnapshot: StarterCanvasSnapshot,
  labelKo: string,
  timestampMs: number,
): RecoveryCheckpointStore {
  const checkpoint: RecoveryCheckpoint = {
    checkpointId: `chk-${store.history.length + 1}-${timestampMs}`,
    labelKo,
    snapshot: store.current,
    createdAtMs: timestampMs,
  };
  return {
    ...store,
    current: nextSnapshot,
    history: [...store.history, checkpoint].slice(-MAX_RECOVERY_HISTORY),
    redoStack: [],
  };
}

export function recoverPreviousCheckpoint(
  store: RecoveryCheckpointStore,
  timestampMs: number,
): RecoveryActionOutcome {
  const previous = store.history[store.history.length - 1];
  if (!previous) {
    return {
      ok: false,
      store,
      restoredLabelKo: null,
      recoveryTargetMs: 1000,
    };
  }

  const redoEntry: RecoveryCheckpoint = {
    checkpointId: `redo-${store.redoStack.length + 1}-${timestampMs}`,
    labelKo: store.current.lastChangeSummaryKo,
    snapshot: store.current,
    createdAtMs: timestampMs,
  };

  return {
    ok: true,
    store: {
      current: previous.snapshot,
      history: store.history.slice(0, -1),
      redoStack: [...store.redoStack, redoEntry].slice(-MAX_RECOVERY_HISTORY),
      lastRecoveryLabelKo: previous.labelKo,
      totalRecoveries: store.totalRecoveries + 1,
    },
    restoredLabelKo: previous.labelKo,
    recoveryTargetMs: 1000,
  };
}

export function redoRecoveredCheckpoint(
  store: RecoveryCheckpointStore,
  timestampMs: number,
): RecoveryActionOutcome {
  const nextEntry = store.redoStack[store.redoStack.length - 1];
  if (!nextEntry) {
    return {
      ok: false,
      store,
      restoredLabelKo: null,
      recoveryTargetMs: 1000,
    };
  }

  const historyEntry: RecoveryCheckpoint = {
    checkpointId: `chk-redo-${store.history.length + 1}-${timestampMs}`,
    labelKo: store.current.lastChangeSummaryKo,
    snapshot: store.current,
    createdAtMs: timestampMs,
  };

  return {
    ok: true,
    store: {
      current: nextEntry.snapshot,
      history: [...store.history, historyEntry].slice(-MAX_RECOVERY_HISTORY),
      redoStack: store.redoStack.slice(0, -1),
      lastRecoveryLabelKo: nextEntry.labelKo,
      totalRecoveries: store.totalRecoveries,
    },
    restoredLabelKo: nextEntry.labelKo,
    recoveryTargetMs: 1000,
  };
}
