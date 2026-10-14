import type { MagicWandRegion } from "./studio-magic-wand";
import type { QuickSelectionSeed } from "./studio-quick-selection";

export const STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION = 1 as const;

export interface StudioQuickSelectionWorkerRunRequest {
  readonly data: Uint8ClampedArray;
  readonly w: number;
  readonly h: number;
  readonly seeds: readonly QuickSelectionSeed[];
  /** 정규화 색 거리 허용치(0..1). */
  readonly tolerance: number;
}

export interface StudioQuickSelectionWorkerRunMessage {
  type: "studio-quick-selection/run";
  version: typeof STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION;
  request: StudioQuickSelectionWorkerRunRequest;
}

export interface StudioQuickSelectionWorkerSuccessMessage {
  type: "studio-quick-selection/success";
  version: typeof STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION;
  region: MagicWandRegion;
  selectedCount: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export interface StudioQuickSelectionWorkerReadyMessage {
  type: "studio-quick-selection/ready";
  version: typeof STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION;
}

export interface StudioQuickSelectionWorkerFailureMessage {
  type: "studio-quick-selection/failure";
  version: typeof STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION;
  error: {
    name: string;
    message: string;
  };
}

export type StudioQuickSelectionWorkerResponseMessage =
  | StudioQuickSelectionWorkerReadyMessage
  | StudioQuickSelectionWorkerSuccessMessage
  | StudioQuickSelectionWorkerFailureMessage;

/** 픽셀 버퍼는 편도 전송(worker→메인 응답은 폴리곤뿐이라 되돌려 보낼 버퍼가 없다). */
export function studioQuickSelectionRequestTransfers(
  message: StudioQuickSelectionWorkerRunMessage,
): Transferable[] {
  const buffer = message.request.data.buffer;
  return buffer instanceof ArrayBuffer ? [buffer] : [];
}
