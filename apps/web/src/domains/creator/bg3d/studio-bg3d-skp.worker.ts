/// <reference lib="webworker" />

import {
  StudioBg3dSkpConversionError,
  type StudioBg3dSkpFailureCode,
} from "./studio-bg3d-skp-contract";
import {
  STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION,
  isStudioBg3dSkpWorkerRequest,
  type StudioBg3dSkpWorkerConvertRequest,
  type StudioBg3dSkpWorkerResponse,
} from "./studio-bg3d-skp-worker-protocol";
import { runStudioBg3dSkpConversion } from "./studio-bg3d-skp-worker-runtime";

const scope = self as DedicatedWorkerGlobalScope;
/** Worker 하나는 변환 하나만 맡는다. 클라이언트는 요청마다 새 Worker 를 만들고 끝나면 종료한다. */
let busy = false;

function failureOf(error: unknown): {
  readonly code: StudioBg3dSkpFailureCode;
  readonly message: string;
  readonly reason: string | null;
  readonly detail: Readonly<Record<string, string | number | boolean>> | null;
  readonly report: unknown;
} {
  if (error instanceof StudioBg3dSkpConversionError) {
    return {
      code: error.code,
      message: error.message,
      reason: error.reason ?? null,
      detail: error.detail ?? null,
      report: error.report ?? null,
    };
  }
  return { code: "skp-parse-failed", message: ".skp 변환 중 알 수 없는 오류가 발생했습니다.", reason: "parse-error", detail: null, report: null };
}

/** 전송 목록에 넣으려면 버퍼가 GLB 바이트와 정확히 일치해야 한다. 아니면 복사한다. */
function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function execute(request: StudioBg3dSkpWorkerConvertRequest): Promise<void> {
  try {
    const output = await runStudioBg3dSkpConversion(request.bytes, {
      execution: "worker",
      maxBytes: request.maxBytes,
      hooks: {
        onStage: (progress) => {
          const response: StudioBg3dSkpWorkerResponse = {
            version: STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION,
            kind: "progress",
            requestId: request.requestId,
            stage: progress.stage,
            fraction: progress.fraction,
          };
          scope.postMessage(response);
        },
      },
    });
    const glb = exactBuffer(output.glb);
    const response: StudioBg3dSkpWorkerResponse = {
      version: STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: request.requestId,
      glb,
      report: output.report,
    };
    scope.postMessage(response, [glb]);
  } catch (error) {
    const failure = failureOf(error);
    const response: StudioBg3dSkpWorkerResponse = {
      version: STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION,
      kind: "error",
      requestId: request.requestId,
      ...failure,
    };
    scope.postMessage(response);
  } finally {
    busy = false;
  }
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isStudioBg3dSkpWorkerRequest(request) || busy) return;
  busy = true;
  void execute(request);
});

export {};
