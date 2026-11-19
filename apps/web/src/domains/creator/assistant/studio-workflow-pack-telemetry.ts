import type { WorkflowPackStorageLike } from "./studio-workflow-pack-store";
import { workflowPackStorage } from "./studio-workflow-pack-store";

export const WORKFLOW_PACK_TELEMETRY_KEY = "toonstudio:workflow-pack-telemetry:v1";

export type WorkflowPackTelemetryAction =
  | "pack-applied"
  | "pack-shared-deeplink"
  | "pack-saved-custom"
  | "pack-imported-json"
  | "rights-receipt-copied"
  | "router-jumped";

export interface WorkflowPackTelemetrySummary {
  readonly totalEvents: number;
  readonly counts: Readonly<Record<WorkflowPackTelemetryAction, number>>;
  readonly lastPackId: string | null;
}

const EMPTY_COUNTS: Record<WorkflowPackTelemetryAction, number> = {
  "pack-applied": 0,
  "pack-shared-deeplink": 0,
  "pack-saved-custom": 0,
  "pack-imported-json": 0,
  "rights-receipt-copied": 0,
  "router-jumped": 0,
};

export function loadWorkflowPackTelemetrySummary(
  storage: WorkflowPackStorageLike | null = workflowPackStorage(),
): WorkflowPackTelemetrySummary {
  if (!storage) {
    return { totalEvents: 0, counts: { ...EMPTY_COUNTS }, lastPackId: null };
  }
  try {
    const raw = storage.getItem(WORKFLOW_PACK_TELEMETRY_KEY);
    if (!raw) return { totalEvents: 0, counts: { ...EMPTY_COUNTS }, lastPackId: null };
    const parsed = JSON.parse(raw) as Partial<WorkflowPackTelemetrySummary>;
    const counts: Record<WorkflowPackTelemetryAction, number> = { ...EMPTY_COUNTS };
    if (parsed.counts && typeof parsed.counts === "object") {
      for (const key of Object.keys(EMPTY_COUNTS) as WorkflowPackTelemetryAction[]) {
        const value = (parsed.counts as Record<string, unknown>)[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
          counts[key] = Math.floor(value);
        }
      }
    }
    const totalEvents = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return {
      totalEvents,
      counts,
      lastPackId: typeof parsed.lastPackId === "string" ? parsed.lastPackId : null,
    };
  } catch {
    return { totalEvents: 0, counts: { ...EMPTY_COUNTS }, lastPackId: null };
  }
}

export function recordWorkflowPackEvent(
  action: WorkflowPackTelemetryAction,
  packId?: string,
  storage: WorkflowPackStorageLike | null = workflowPackStorage(),
): WorkflowPackTelemetrySummary {
  const current = loadWorkflowPackTelemetrySummary(storage);
  const nextCounts: Record<WorkflowPackTelemetryAction, number> = {
    ...current.counts,
    [action]: current.counts[action] + 1,
  };
  const next: WorkflowPackTelemetrySummary = {
    totalEvents: current.totalEvents + 1,
    counts: nextCounts,
    lastPackId: packId ?? current.lastPackId,
  };
  if (storage) {
    try {
      storage.setItem(WORKFLOW_PACK_TELEMETRY_KEY, JSON.stringify(next));
    } catch {
      // 로컬 저장 불가 환경에서는 메모리 결과만 반환한다.
    }
  }
  return next;
}
