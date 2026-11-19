import { getLatestWorkflowPackRuntimeBindings } from "../assistant/use-workflow-pack-runtime-consumer";

import type { WorkflowPackRuntimeBindings } from "../assistant/studio-workflow-pack-runtime-bridge";

export interface BrushWorkflowSlotConfig {
  readonly slotId: string;
  readonly displayName: string;
  readonly baseSizePx: number;
  readonly stabilizerStrength: number;
  readonly pressureSensitivity: number;
  readonly taperRatio: number;
  readonly antiAlias: boolean;
  readonly lockedByTeamPolicy: boolean;
  readonly sourcePackId: string | null;
}

interface BrushSlotPresetSpec {
  readonly displayName: string;
  readonly baseSizePx: number;
  readonly stabilizerStrength: number;
  readonly pressureSensitivity: number;
  readonly taperRatio: number;
  readonly antiAlias: boolean;
}

const BRUSH_SLOT_PRESETS: Readonly<Record<string, BrushSlotPresetSpec>> = {
  "g-pen-crisp": {
    displayName: "크리스프 G펜 (선화)",
    baseSizePx: 6,
    stabilizerStrength: 0.62,
    pressureSensitivity: 0.85,
    taperRatio: 0.72,
    antiAlias: true,
  },
  "soft-pencil-rough": {
    displayName: "소프트 러프 연필",
    baseSizePx: 10,
    stabilizerStrength: 0.35,
    pressureSensitivity: 0.7,
    taperRatio: 0.45,
    antiAlias: true,
  },
  "ink-brush-dynamic": {
    displayName: "다이내믹 먹붓 (액션)",
    baseSizePx: 14,
    stabilizerStrength: 0.48,
    pressureSensitivity: 0.95,
    taperRatio: 0.88,
    antiAlias: true,
  },
  "clean-mono-liner": {
    displayName: "클린 모노 라이너",
    baseSizePx: 4,
    stabilizerStrength: 0.7,
    pressureSensitivity: 0.3,
    taperRatio: 0.15,
    antiAlias: false,
  },
};

const DEFAULT_BRUSH_SLOT_ID = "g-pen-crisp";

export function isBrushSlotPresetKnown(slotId: string): boolean {
  return Object.prototype.hasOwnProperty.call(BRUSH_SLOT_PRESETS, slotId);
}

/**
 * 활성 Workflow Pack v2 런타임 바인딩을 2D 브러시 랙 대표 슬롯·필압 보정 설정으로 변환한다.
 */
export function resolveBrushSlotConfigFromBindings(
  explicitBindings?: WorkflowPackRuntimeBindings | null,
): BrushWorkflowSlotConfig {
  const bindings = explicitBindings ?? getLatestWorkflowPackRuntimeBindings();
  const requestedId = bindings?.primaryBrushSlotId ?? DEFAULT_BRUSH_SLOT_ID;
  const resolvedId = isBrushSlotPresetKnown(requestedId) ? requestedId : DEFAULT_BRUSH_SLOT_ID;
  const spec = BRUSH_SLOT_PRESETS[resolvedId];

  return {
    slotId: resolvedId,
    displayName: spec.displayName,
    baseSizePx: spec.baseSizePx,
    stabilizerStrength: spec.stabilizerStrength,
    pressureSensitivity: spec.pressureSensitivity,
    taperRatio: spec.taperRatio,
    antiAlias: spec.antiAlias,
    lockedByTeamPolicy: bindings?.teamPolicyEnforced ?? false,
    sourcePackId: bindings?.packId ?? null,
  };
}
