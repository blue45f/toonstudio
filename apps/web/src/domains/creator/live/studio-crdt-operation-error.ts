/**
 * Stable failure metadata for the durable CRDT control plane.
 *
 * Socket.IO ACK failures used to lose their server code when they crossed the transport boundary.
 * The ordered outbox could therefore not distinguish a temporary outage from a payload or
 * permission rejection and retried both forever. Keep the raw server code for diagnostics while
 * exposing a deliberately small retry decision to the document binding.
 */
import { isStudioLiveJamWorkId } from "../../../shared/lib/studio-live-jam-scope";
import { mergeStudioCrdtUpdates } from "./studio-crdt-document-helpers";
import {
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtUpdate,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";

import type { StudioLiveRoom } from "./studio-live-collaboration-room";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";

export type StudioCrdtFailureDisposition = "retryable" | "permanent";

export type StudioCrdtOperationErrorSource =
  | "server-ack"
  | "timeout"
  | "connection"
  | "client-validation"
  | "server-response";

export interface StudioCrdtFailureClassification {
  code: string;
  message: string;
  disposition: StudioCrdtFailureDisposition;
  source: StudioCrdtOperationErrorSource | "unknown";
}

const PERMANENT_SERVER_CODES = new Set([
  "invalid_payload",
  "forbidden",
  "unauthenticated",
  "access_revoked",
  "permission_denied",
  "role_revoked",
  "storage_corruption",
]);

const RETRYABLE_SERVER_CODES = new Set([
  "rate_limited",
  "internal_error",
  "not_joined",
  "temporarily_unavailable",
  "service_unavailable",
]);

function serverDisposition(code: string): StudioCrdtFailureDisposition {
  if (PERMANENT_SERVER_CODES.has(code)) return "permanent";
  if (RETRYABLE_SERVER_CODES.has(code)) return "retryable";
  // An explicit, unfamiliar negative ACK is deterministic evidence that the server declined the
  // operation. Retrying it indefinitely risks a hot loop and silent local/server divergence.
  return "permanent";
}

export class StudioCrdtOperationError extends Error {
  readonly code: string;
  readonly disposition: StudioCrdtFailureDisposition;
  readonly source: StudioCrdtOperationErrorSource;

  constructor(options: {
    code: string;
    message: string;
    disposition: StudioCrdtFailureDisposition;
    source: StudioCrdtOperationErrorSource;
  }) {
    super(options.message);
    this.name = "StudioCrdtOperationError";
    this.code = options.code;
    this.disposition = options.disposition;
    this.source = options.source;
  }
}

export function createStudioCrdtServerAckError(
  code: string,
  message: string
): StudioCrdtOperationError {
  return new StudioCrdtOperationError({
    code,
    message,
    disposition: serverDisposition(code),
    source: "server-ack",
  });
}

export function createStudioCrdtRetryableError(
  code: string,
  message: string,
  source: Exclude<StudioCrdtOperationErrorSource, "server-ack">
): StudioCrdtOperationError {
  return new StudioCrdtOperationError({
    code,
    message,
    disposition: "retryable",
    source,
  });
}

export function createStudioCrdtPermanentError(
  code: string,
  message: string,
  source: Exclude<StudioCrdtOperationErrorSource, "server-ack">
): StudioCrdtOperationError {
  return new StudioCrdtOperationError({
    code,
    message,
    disposition: "permanent",
    source,
  });
}

export function classifyStudioCrdtFailure(error: unknown): StudioCrdtFailureClassification {
  if (error instanceof StudioCrdtOperationError) {
    return {
      code: error.code,
      message: error.message,
      disposition: error.disposition,
      source: error.source,
    };
  }
  return {
    code: "transport_error",
    message:
      error instanceof Error && error.message.trim()
        ? error.message
        : "실시간 CRDT 작업을 완료하지 못했습니다.",
    // Unknown JavaScript/network failures remain retryable. Only an explicit negative ACK or a
    // locally proven contract violation is allowed to put the editor into terminal recovery.
    disposition: "retryable",
    source: "unknown",
  };
}

export interface CoalesceablePendingCrdtUpdate {
  request: StudioCrdtUpdateRequest;
  attempts: number;
  persistenceState: "pending" | "ready" | "failed";
  persisted: Promise<boolean>;
  localBroadcasted?: boolean;
  inFlight?: boolean;
  draftProtectionBoundary?: boolean;
}

const UNPROVISIONED_DRAFT_DOCUMENT_ID_PATTERN =
  /^draft_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * 저장 전 즉석 잼 방(`work-instant-*`), 미프로비저닝 로컬 초안(`draft_<uuid>`), 무스코프 로컬 방은
 * 서버 `studio_works` 정본 행이 없으므로 현재 연결된 피어/로컬 채널 전달이 끝나면 대기열과 보관함에서 즉시 해제한다.
 * 반면 서버 저장 작품의 로컬 폴백이나 P2P 메시는 추후 권위 서버 ACK 또는 초안 스냅샷 확인까지 보존한다.
 */
export function shouldRetainNonAuthoritativePendingUpdate(options: {
  readonly hasAuthoritativeServer: boolean;
  readonly workId: string;
  readonly mode: StudioLiveRoom["mode"];
  readonly outboxScope: string | null;
}): boolean {
  return (
    !options.hasAuthoritativeServer &&
    !isStudioLiveJamWorkId(options.workId) &&
    !UNPROVISIONED_DRAFT_DOCUMENT_ID_PATTERN.test(options.workId) &&
    (options.mode !== "local" || options.outboxScope !== null)
  );
}

/**
 * Goodnotes(`gnyjsFFI` `merge_updates`) 및 Figma 오프라인 저널과 동일하게,
 * 오프라인·재연결 대기 중 아직 전송된 적 없는 연속 Yjs 업데이트들을 단일 프레임 상한(`48KB`) 안에서 병합한다.
 * 이미 네트워크 전송을 시도했거나(`attempts > 0`, `inFlight`), 피어 브로드캐스트되었거나,
 * 초안 보호 경계(`draftProtectionBoundary`)에 포함된 항목은 ID 불변성을 위해 병합하지 않는다.
 */
export function tryCoalescePendingCrdtUpdate(
  tail: CoalesceablePendingCrdtUpdate | undefined,
  incomingUpdate: Uint8Array,
  canCoalesce: boolean,
  incomingWriteContext?: StudioScopedWriteContext,
): tail is CoalesceablePendingCrdtUpdate {
  if (
    !canCoalesce ||
    !tail ||
    tail.request.writeContext !== undefined || incomingWriteContext !== undefined ||
    tail.attempts > 0 ||
    tail.localBroadcasted ||
    tail.inFlight ||
    tail.draftProtectionBoundary ||
    tail.persistenceState !== "ready"
  ) {
    return false;
  }
  try {
    const previousBytes = decodeStudioCrdtUpdate(tail.request.update);
    const merged = mergeStudioCrdtUpdates([previousBytes, incomingUpdate]);
    if (merged.byteLength === 0 || merged.byteLength > STUDIO_CRDT_UPDATE_MAX_BYTES) {
      return false;
    }
    tail.request = {
      ...tail.request,
      update: encodeStudioCrdtUpdate(merged),
    };
    return true;
  } catch {
    return false;
  }
}
