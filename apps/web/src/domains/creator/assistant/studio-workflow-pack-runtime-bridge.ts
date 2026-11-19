import {
  buildWorkflowPackExportReceiptAttachment,
  type WorkflowPackExportReceiptAttachment,
} from "./studio-workflow-pack-export-bundle";

import type { StudioWorkflowPack } from "./studio-workflow-pack";

export const WORKFLOW_PACK_RUNTIME_EVENT = "toonstudio:workflow-pack:runtime-apply";

export interface WorkflowPackRuntimeBindings {
  readonly packId: string;
  readonly packName: string;
  readonly platformId: StudioWorkflowPack["platformId"];
  readonly bg3dLightingPresetId: string | null;
  readonly primaryBrushSlotId: string | null;
  readonly exportReceiptAttachment: WorkflowPackExportReceiptAttachment;
  readonly teamPolicyEnforced: boolean;
}

/**
 * 워크플로우 팩을 2D 브러시 · 3D BG3D 라이팅 · 내보내기 ZIP 증명서 바인딩 객체로 해석한다.
 */
export function resolveWorkflowPackRuntimeBindings(
  pack: StudioWorkflowPack,
  generatedAtIso = new Date().toISOString(),
): WorkflowPackRuntimeBindings {
  return {
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    bg3dLightingPresetId: pack.bg3dLightingPresetId ?? null,
    primaryBrushSlotId: pack.primaryBrushSlotId ?? null,
    exportReceiptAttachment: buildWorkflowPackExportReceiptAttachment(pack, generatedAtIso),
    teamPolicyEnforced: Boolean(pack.teamPolicyLock),
  };
}

/**
 * 캔버스 브러시 스토어 · BG3D 컨트롤러 · 내보내기 패널이 구독할 수 있는
 * 브라우저 CustomEvent 로 런타임 바인딩을 전파한다.
 */
export function dispatchWorkflowPackRuntimeEvent(
  pack: StudioWorkflowPack,
  target: EventTarget | null = typeof window !== "undefined" ? window : null,
): WorkflowPackRuntimeBindings {
  const bindings = resolveWorkflowPackRuntimeBindings(pack);
  if (target && typeof CustomEvent !== "undefined") {
    target.dispatchEvent(
      new CustomEvent<WorkflowPackRuntimeBindings>(WORKFLOW_PACK_RUNTIME_EVENT, {
        detail: bindings,
      }),
    );
  }
  return bindings;
}

export function subscribeWorkflowPackRuntimeEvents(
  listener: (bindings: WorkflowPackRuntimeBindings) => void,
  target: EventTarget | null = typeof window !== "undefined" ? window : null,
): () => void {
  if (!target) return () => {};
  const handler: EventListener = (event) => {
    const detail = (event as CustomEvent<WorkflowPackRuntimeBindings>).detail;
    if (detail && typeof detail.packId === "string") {
      listener(detail);
    }
  };
  target.addEventListener(WORKFLOW_PACK_RUNTIME_EVENT, handler);
  return () => target.removeEventListener(WORKFLOW_PACK_RUNTIME_EVENT, handler);
}
