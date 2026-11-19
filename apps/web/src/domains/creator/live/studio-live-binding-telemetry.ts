import type { StudioCrdtBindingStatus } from "./studio-crdt-room-binding";
import type { StudioCrdtSyncTelemetry, StudioLivePersistenceDurability } from "./studio-live-sync-safety";

type StudioCrdtBindingStatusTelemetry = StudioCrdtBindingStatus &
  Partial<Pick<
    StudioCrdtSyncTelemetry,
    | "pendingCount"
    | "persistenceDurability"
    | "transportReady"
    | "lastAckAt"
    | "lastAckServerSequence"
  >>;

function bindingTelemetryState(state: string): StudioCrdtSyncTelemetry["state"] {
  if (
    state === "idle" ||
    state === "syncing" ||
    state === "ready" ||
    state === "retrying" ||
    state === "repairing"
  ) {
    return state;
  }
  if (state === "recovery-required") return "recovery-required";
  return "error";
}

export function mergeBindingTelemetry(options: {
  previous: StudioCrdtSyncTelemetry | null;
  status: StudioCrdtBindingStatus;
  transportReady: boolean;
  outboxConfigured: boolean;
}): StudioCrdtSyncTelemetry {
  const { previous, status, transportReady, outboxConfigured } = options;
  const measured = status as StudioCrdtBindingStatusTelemetry;
  const state = bindingTelemetryState(status.state);
  const pendingCount = measured.pendingCount ?? previous?.pendingCount ?? 0;
  const persistenceDurability: StudioLivePersistenceDurability =
    measured.persistenceDurability ??
    previous?.persistenceDurability ??
    (outboxConfigured ? "checking" : "unavailable");
  const nextTransportReady = measured.transportReady ?? transportReady;
  const lastAckAt = measured.lastAckAt ?? previous?.lastAckAt ?? null;
  const lastAckServerSequence = measured.lastAckServerSequence ?? previous?.lastAckServerSequence ?? null;
  const durabilityAtRisk = status.state === "error" && status.durabilityAtRisk ? true : undefined;
  const nonAuthoritativeDeliveryPending = status.state === "retrying"
    && status.nonAuthoritativeDeliveryPending === true
    ? true
    : undefined;
  if (
    previous !== null
    && previous.state === state
    && previous.message === status.message
    && previous.pendingCount === pendingCount
    && previous.persistenceDurability === persistenceDurability
    && previous.transportReady === nextTransportReady
    && previous.lastAckAt === lastAckAt
    && previous.lastAckServerSequence === lastAckServerSequence
    && previous.durabilityAtRisk === durabilityAtRisk
    && previous.nonAuthoritativeDeliveryPending === nonAuthoritativeDeliveryPending
  ) {
    return previous;
  }
  return {
    state,
    message: status.message,
    pendingCount,
    persistenceDurability,
    transportReady: nextTransportReady,
    lastAckAt,
    lastAckServerSequence,
    ...(durabilityAtRisk ? { durabilityAtRisk: true } : {}),
    ...(nonAuthoritativeDeliveryPending ? { nonAuthoritativeDeliveryPending: true } : {}),
  };
}

