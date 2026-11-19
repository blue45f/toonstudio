import {
  parsePersistedStudioCrdtUpdateRequest,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";

import type { StudioCrdtOutboxSqlCandidate } from "../studio-local-database";

export const STUDIO_CRDT_OUTBOX_MAX_REQUEST_BYTES = 96 * 1024;
export const MAX_RETRY_ERROR_CODE_LENGTH = 160;
export const MAX_RETRY_ERROR_MESSAGE_LENGTH = 2_048;
export const TEXT_ENCODER = new TextEncoder();

export interface StoredStudioCrdtUpdate {
  kind?: "update";
  key: string;
  scope: string;
  workId: string;
  updateId: string;
  clientSequence: number;
  request: StudioCrdtUpdateRequest;
  createdAt: number;
  payloadBytes?: number;
  /** Same-page only; the durable provider is authoritative regardless of this advisory flag. */
  durable?: boolean;
}

export function outboxKey(scope: string, workId: string, updateId: string): string {
  return JSON.stringify([scope, workId, updateId]);
}

export function candidateToStoredUpdate(
  candidate: StudioCrdtOutboxSqlCandidate,
  expectedScope: string,
  expectedWorkId: string,
): StoredStudioCrdtUpdate | null {
  if (
    candidate.scope !== expectedScope ||
    candidate.workId !== expectedWorkId ||
    typeof candidate.updateId !== "string" ||
    typeof candidate.clientSequence !== "number" ||
    !Number.isSafeInteger(candidate.clientSequence) ||
    candidate.clientSequence < 0 ||
    typeof candidate.requestPayload !== "string" ||
    typeof candidate.payloadBytes !== "number" ||
    !Number.isSafeInteger(candidate.payloadBytes) ||
    candidate.payloadBytes <= 0 ||
    candidate.payloadBytes > STUDIO_CRDT_OUTBOX_MAX_REQUEST_BYTES ||
    typeof candidate.createdAt !== "number" ||
    !Number.isSafeInteger(candidate.createdAt) ||
    candidate.createdAt < 0 ||
    typeof candidate.updatedAt !== "number" ||
    !Number.isSafeInteger(candidate.updatedAt) ||
    candidate.updatedAt < 0 ||
    typeof candidate.attemptCount !== "number" ||
    !Number.isSafeInteger(candidate.attemptCount) ||
    candidate.attemptCount < 0
  ) {
    return null;
  }
  if (TEXT_ENCODER.encode(candidate.requestPayload).byteLength !== candidate.payloadBytes) {
    return null;
  }
  const noRetry = candidate.attemptCount === 0;
  if (
    noRetry !==
      (candidate.lastAttemptAt === null &&
        candidate.nextRetryAt === null &&
        candidate.lastErrorCode === null &&
        candidate.lastErrorMessage === null)
  ) {
    return null;
  }
  if (!noRetry) {
    if (
      typeof candidate.lastAttemptAt !== "number" ||
      !Number.isSafeInteger(candidate.lastAttemptAt) ||
      candidate.lastAttemptAt < 0 ||
      typeof candidate.nextRetryAt !== "number" ||
      !Number.isSafeInteger(candidate.nextRetryAt) ||
      candidate.nextRetryAt < candidate.lastAttemptAt ||
      typeof candidate.lastErrorCode !== "string" ||
      candidate.lastErrorCode.length === 0 ||
      candidate.lastErrorCode.length > MAX_RETRY_ERROR_CODE_LENGTH ||
      typeof candidate.lastErrorMessage !== "string" ||
      candidate.lastErrorMessage.length === 0 ||
      candidate.lastErrorMessage.length > MAX_RETRY_ERROR_MESSAGE_LENGTH
    ) {
      return null;
    }
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(candidate.requestPayload);
  } catch {
    return null;
  }
  const request = parsePersistedStudioCrdtUpdateRequest(decoded, {
    expectedWorkId,
  });
  if (
    request === null ||
    request.updateId !== candidate.updateId ||
    request.clientSequence !== candidate.clientSequence ||
    JSON.stringify(request) !== candidate.requestPayload
  ) {
    return null;
  }
  return {
    kind: "update",
    key: outboxKey(expectedScope, expectedWorkId, candidate.updateId),
    scope: expectedScope,
    workId: expectedWorkId,
    updateId: candidate.updateId,
    clientSequence: candidate.clientSequence,
    request,
    createdAt: candidate.createdAt,
    payloadBytes: candidate.payloadBytes,
    durable: true,
  };
}

