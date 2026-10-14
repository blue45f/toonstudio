import { quickSelectionRegionFromRaster } from "./studio-quick-selection";
import {
  STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION,
  type StudioQuickSelectionWorkerFailureMessage,
  type StudioQuickSelectionWorkerResponseMessage,
  type StudioQuickSelectionWorkerRunMessage,
  type StudioQuickSelectionWorkerSuccessMessage,
} from "./studio-quick-selection-worker-protocol";

interface StudioQuickSelectionWorkerScope {
  onmessage: ((event: MessageEvent<StudioQuickSelectionWorkerRunMessage>) => void) | null;
  postMessage(message: StudioQuickSelectionWorkerResponseMessage, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as StudioQuickSelectionWorkerScope;

workerScope.postMessage({
  type: "studio-quick-selection/ready",
  version: STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION,
}, []);

function serializeWorkerError(error: unknown): StudioQuickSelectionWorkerFailureMessage["error"] {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message || "빠른 선택 Worker 실행에 실패했습니다." };
  }
  return { name: "Error", message: "빠른 선택 Worker 실행에 실패했습니다." };
}

workerScope.onmessage = (event) => {
  const message = event.data;
  if (
    message.type !== "studio-quick-selection/run" ||
    message.version !== STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION
  ) {
    return;
  }

  try {
    const { data, w, h, seeds, tolerance } = message.request;
    const { region, selectedCount, bounds } = quickSelectionRegionFromRaster(
      { width: w, height: h, data },
      seeds,
      { tolerance },
    );
    const response: StudioQuickSelectionWorkerSuccessMessage = {
      type: "studio-quick-selection/success",
      version: STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION,
      region,
      selectedCount,
      bounds,
    };
    workerScope.postMessage(response, []);
  } catch (error) {
    const response: StudioQuickSelectionWorkerFailureMessage = {
      type: "studio-quick-selection/failure",
      version: STUDIO_QUICK_SELECTION_WORKER_PROTOCOL_VERSION,
      error: serializeWorkerError(error),
    };
    workerScope.postMessage(response, []);
  }
};
