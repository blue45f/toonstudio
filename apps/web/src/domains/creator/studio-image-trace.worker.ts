import { computeStudioImageTraceGridJob } from "./studio-image-trace-grid";
import {
  STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
  studioImageTraceResponseTransfers,
  type StudioImageTraceWorkerFailureMessage,
  type StudioImageTraceWorkerResponseMessage,
  type StudioImageTraceWorkerRunMessage,
  type StudioImageTraceWorkerSuccessMessage,
} from "./studio-image-trace-worker-protocol";

interface StudioImageTraceWorkerScope {
  onmessage: ((event: MessageEvent<StudioImageTraceWorkerRunMessage>) => void) | null;
  postMessage(message: StudioImageTraceWorkerResponseMessage, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as StudioImageTraceWorkerScope;

workerScope.postMessage({
  type: "studio-image-trace/ready",
  version: STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
}, []);

function serializeWorkerError(error: unknown): StudioImageTraceWorkerFailureMessage["error"] {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message || "이미지 트레이스 Worker 실행에 실패했습니다." };
  }
  return { name: "Error", message: "이미지 트레이스 Worker 실행에 실패했습니다." };
}

workerScope.onmessage = (event) => {
  const message = event.data;
  if (
    message.type !== "studio-image-trace/run" ||
    message.version !== STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION
  ) {
    return;
  }

  try {
    const { data, width, height, preset } = message.request;
    const job = computeStudioImageTraceGridJob(data, width, height, preset);
    if (!job) throw new Error("트레이싱할 픽셀 격자를 만들지 못했습니다.");
    const response: StudioImageTraceWorkerSuccessMessage = {
      type: "studio-image-trace/success",
      version: STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
      grid: job.grid,
      layers: job.layers,
    };
    workerScope.postMessage(response, studioImageTraceResponseTransfers(response));
  } catch (error) {
    const response: StudioImageTraceWorkerFailureMessage = {
      type: "studio-image-trace/failure",
      version: STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
      error: serializeWorkerError(error),
    };
    workerScope.postMessage(response, []);
  }
};
