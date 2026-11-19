import type {
  StudioLiveCursorPayload,
  StudioLiveLockLease as StudioLiveLock,
  StudioLiveParticipant,
} from "./studio-live-collaboration-protocol";

export interface StudioLiveGesturePreviewInboundWindow {
  readonly startedAt: number;
  readonly packetCount: number;
  readonly byteCount: number;
}

export function boundedTiming(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value ?? fallback)));
}

export function copyParticipant(participant: StudioLiveParticipant): StudioLiveParticipant {
  return { ...participant };
}

export function canEditStudioLiveGesturePreview(participant: StudioLiveParticipant): boolean {
  return participant.role === "owner"
    || participant.role === "admin"
    || participant.role === "editor";
}

export function copyCursor(cursor: StudioLiveCursorPayload): StudioLiveCursorPayload {
  return {
    ...cursor,
    ...(cursor.points ? { points: [...cursor.points] } : {}),
  };
}

export function lockPriority(lock: Pick<StudioLiveLock, "claimId" | "owner">): string {
  return `${lock.claimId}\u0000${lock.owner.sessionId}`;
}

