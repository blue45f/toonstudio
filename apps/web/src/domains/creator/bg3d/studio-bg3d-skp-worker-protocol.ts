/**
 * .skp 변환 Worker 메시지 계약.
 *
 * 요청은 변환 하나뿐이다. openskp 의 buildScene() 은 동기 함수라 Worker 가 바쁜 동안에는 취소 메시지를
 * 처리할 수 없으므로, 취소·시간 초과는 클라이언트가 Worker 를 종료(terminate)하는 것으로 강제한다.
 * 응답의 report 는 신뢰 경계를 넘어온 값이라 여기서는 unknown 으로 두고, 클라이언트가
 * parseStudioBg3dSkpImportReport 로 검증한다.
 */

import {
  STUDIO_BG3D_SKP_STAGES,
  isStudioBg3dSkpFailureCode,
  type StudioBg3dSkpFailureCode,
  type StudioBg3dSkpStage,
} from "./studio-bg3d-skp-contract";

export const STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION = 1 as const;

export interface StudioBg3dSkpWorkerConvertRequest {
  readonly version: typeof STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION;
  readonly kind: "convert";
  readonly requestId: number;
  readonly bytes: ArrayBuffer;
  /** 호출자(프로필)가 정한 원본 상한. Worker 도 같은 값으로 다시 검사한다. */
  readonly maxBytes: number;
}

export type StudioBg3dSkpWorkerRequest = StudioBg3dSkpWorkerConvertRequest;

export interface StudioBg3dSkpWorkerProgressResponse {
  readonly version: typeof STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION;
  readonly kind: "progress";
  readonly requestId: number;
  readonly stage: StudioBg3dSkpStage;
  readonly fraction: number | null;
}

export interface StudioBg3dSkpWorkerResultResponse {
  readonly version: typeof STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION;
  readonly kind: "result";
  readonly requestId: number;
  readonly glb: ArrayBuffer;
  readonly report: unknown;
}

export interface StudioBg3dSkpWorkerErrorResponse {
  readonly version: typeof STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION;
  readonly kind: "error";
  readonly requestId: number;
  readonly code: StudioBg3dSkpFailureCode;
  readonly message: string;
  readonly reason: string | null;
  readonly detail: Readonly<Record<string, string | number | boolean>> | null;
  /** 빈 장면처럼 보고서를 만들 수 있었던 실패에서만 값이 있다. */
  readonly report: unknown;
}

export type StudioBg3dSkpWorkerResponse =
  | StudioBg3dSkpWorkerProgressResponse
  | StudioBg3dSkpWorkerResultResponse
  | StudioBg3dSkpWorkerErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isStage(value: unknown): value is StudioBg3dSkpStage {
  return typeof value === "string" && (STUDIO_BG3D_SKP_STAGES as readonly string[]).includes(value);
}

function isDetail(value: unknown): value is Readonly<Record<string, string | number | boolean>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) =>
    typeof entry === "string" || typeof entry === "boolean" || (typeof entry === "number" && Number.isFinite(entry)));
}

export function isStudioBg3dSkpWorkerRequest(value: unknown): value is StudioBg3dSkpWorkerRequest {
  return isRecord(value)
    && value.version === STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION
    && value.kind === "convert"
    && isRequestId(value.requestId)
    && value.bytes instanceof ArrayBuffer
    && typeof value.maxBytes === "number"
    && Number.isSafeInteger(value.maxBytes)
    && value.maxBytes > 0;
}

export function isStudioBg3dSkpWorkerResponse(value: unknown): value is StudioBg3dSkpWorkerResponse {
  if (!isRecord(value) || value.version !== STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION || !isRequestId(value.requestId)) {
    return false;
  }
  switch (value.kind) {
    case "progress":
      return isStage(value.stage)
        && (value.fraction === null || (typeof value.fraction === "number" && value.fraction >= 0 && value.fraction <= 1));
    case "result":
      return value.glb instanceof ArrayBuffer && value.glb.byteLength > 0;
    case "error":
      return isStudioBg3dSkpFailureCode(value.code)
        && typeof value.message === "string"
        && (value.reason === null || typeof value.reason === "string")
        && (value.detail === null || isDetail(value.detail));
    default:
      return false;
  }
}
