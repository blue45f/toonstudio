/**
 * Canonical 3-phase readiness model (`initializing` | `ready` | `error`) for Studio BG3D.
 *
 * Separates engine admission (`plan.status === "available"`) from actual renderer instantiation
 * (`hasModelRenderer`) and initial scene hydration (`!isRestoringScene`) so the modal header,
 * viewport, and Scene Assistant never hide an active-engine badge, spin indefinitely during an
 * engine block, or claim an engine is active while its renderer failed or is still starting.
 */

import {
  STUDIO_BG3D_ENGINE_PREFERENCE_LABELS,
  type StudioBg3dEngineBackend,
  type StudioBg3dEngineStatus,
} from "./studio-bg3d-engine-selection";
import type { StudioBg3dWebglRecoveryPhase } from "./studio-bg3d-webgl-context-recovery";
import type { StudioBg3dEngineRuntimePhase } from "./useStudioBg3dEngineRuntime";

export type StudioBg3dReadinessPhase = "initializing" | "ready" | "error";

export type StudioBg3dReadinessStage =
  | "probing"
  | "renderer-starting"
  | "scene-restoring"
  | "ready"
  | "engine-unavailable"
  | "engine-failed"
  | "context-lost";

export interface StudioBg3dReadinessInput {
  readonly enginePhase: StudioBg3dEngineRuntimePhase;
  readonly planStatus: StudioBg3dEngineStatus;
  readonly selectedBackend: StudioBg3dEngineBackend;
  readonly canvasFactoryPending?: boolean;
  readonly hasModelRenderer: boolean;
  readonly isRestoringScene: boolean;
  readonly deviceLostMessage?: string | null;
  readonly planNotice?: string | null;
  readonly webglRecoveryPhase?: StudioBg3dWebglRecoveryPhase | null;
}

export interface StudioBg3dReadinessSnapshot {
  readonly phase: StudioBg3dReadinessPhase;
  readonly stage: StudioBg3dReadinessStage;
  readonly selectedEngine: StudioBg3dEngineBackend;
  /** Non-null strictly when the selected backend owns a live renderer and scene restore finished. */
  readonly activeEngine: StudioBg3dEngineBackend | null;
  readonly badgeLabelKo: string;
  readonly badgeLabelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export function deriveStudioBg3dReadinessState(
  input: StudioBg3dReadinessInput,
): StudioBg3dReadinessSnapshot {
  const selectedEngine = input.selectedBackend === "webgl2" ? "webgl2" : "webgpu";
  const engineLabel = STUDIO_BG3D_ENGINE_PREFERENCE_LABELS[selectedEngine];

  if (input.enginePhase === "probing") {
    return Object.freeze({
      phase: "initializing",
      stage: "probing",
      selectedEngine,
      activeEngine: null,
      badgeLabelKo: `${engineLabel} 확인 중`,
      badgeLabelEn: `Checking ${engineLabel}`,
      detailKo: "이 기기에서 선택한 3D 엔진을 사용할 수 있는지 확인하고 있습니다.",
      detailEn: "Checking whether the selected 3D engine is supported on this device.",
    });
  }

  if (
    input.planStatus === "failed"
    || input.webglRecoveryPhase === "failed"
    || input.webglRecoveryPhase === "degraded"
  ) {
    return Object.freeze({
      phase: "error",
      stage: "engine-failed",
      selectedEngine,
      activeEngine: null,
      badgeLabelKo: `${engineLabel} 실행 실패`,
      badgeLabelEn: `${engineLabel} failed`,
      detailKo:
        input.deviceLostMessage
        || input.planNotice
        || `${engineLabel} 렌더러를 시작하지 못했습니다. 다시 시도하거나 2D 원고로 복귀해 주세요.`,
      detailEn: `${engineLabel} failed to start. Retry or return safely to your 2D manuscript.`,
    });
  }

  if (input.planStatus !== "available") {
    return Object.freeze({
      phase: "error",
      stage: "engine-unavailable",
      selectedEngine,
      activeEngine: null,
      badgeLabelKo: `${engineLabel} 사용 불가`,
      badgeLabelEn: `${engineLabel} unavailable`,
      detailKo:
        input.deviceLostMessage
        || input.planNotice
        || `${engineLabel} 엔진을 사용할 수 없습니다. 사용할 엔진을 직접 선택하거나 2D 원고로 복귀해 주세요.`,
      detailEn: `${engineLabel} is unavailable here. Choose an engine explicitly or return to 2D.`,
    });
  }

  if (input.webglRecoveryPhase === "lost") {
    return Object.freeze({
      phase: "error",
      stage: "context-lost",
      selectedEngine,
      activeEngine: null,
      badgeLabelKo: `${engineLabel} 연결 끊김`,
      badgeLabelEn: `${engineLabel} context lost`,
      detailKo: "3D 그래픽 연결이 끊어져 복구를 기다리고 있습니다. 작업 중인 장면 초안은 보존됩니다.",
      detailEn: "The 3D graphics context was lost. Your scene draft remains preserved while recovering.",
    });
  }

  if (input.canvasFactoryPending || !input.hasModelRenderer) {
    return Object.freeze({
      phase: "initializing",
      stage: "renderer-starting",
      selectedEngine,
      activeEngine: null,
      badgeLabelKo: `${engineLabel} 초기화 중`,
      badgeLabelEn: `Starting ${engineLabel}`,
      detailKo: `${engineLabel} 렌더러와 3D 뷰포트를 연결하고 있습니다.`,
      detailEn: `Starting the ${engineLabel} renderer and 3D viewport.`,
    });
  }

  if (input.isRestoringScene) {
    return Object.freeze({
      phase: "initializing",
      stage: "scene-restoring",
      selectedEngine,
      activeEngine: null,
      badgeLabelKo: `${engineLabel} 장면 준비 중`,
      badgeLabelEn: `${engineLabel} restoring scene`,
      detailKo: "장면 원본과 카메라 설정을 준비하고 있습니다.",
      detailEn: "Preparing the scene source and camera state.",
    });
  }

  return Object.freeze({
    phase: "ready",
    stage: "ready",
    selectedEngine,
    activeEngine: selectedEngine,
    badgeLabelKo: `${engineLabel} 활성`,
    badgeLabelEn: `${engineLabel} active`,
    detailKo: `${engineLabel} 엔진이 준비되어 장면 프리셋과 도구를 바로 사용할 수 있습니다.`,
    detailEn: `${engineLabel} is active and ready for scene presets and editing.`,
  });
}
