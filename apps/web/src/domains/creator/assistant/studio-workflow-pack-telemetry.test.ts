import { describe, expect, it } from "vitest";

import type { WorkflowPackStorageLike } from "./studio-workflow-pack-store";
import {
  WORKFLOW_PACK_TELEMETRY_KEY,
  loadWorkflowPackTelemetrySummary,
  recordWorkflowPackEvent,
} from "./studio-workflow-pack-telemetry";

function createMemoryStorage(): WorkflowPackStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("studio-workflow-pack-telemetry", () => {
  it("records and aggregates workflow pack and router events", () => {
    const storage = createMemoryStorage();
    expect(loadWorkflowPackTelemetrySummary(storage).totalEvents).toBe(0);

    recordWorkflowPackEvent("pack-applied", "rofan-episode1-starter", storage);
    recordWorkflowPackEvent("pack-shared-deeplink", "rofan-episode1-starter", storage);
    const summary = recordWorkflowPackEvent("rights-receipt-copied", "rofan-episode1-starter", storage);

    expect(summary.totalEvents).toBe(3);
    expect(summary.counts["pack-applied"]).toBe(1);
    expect(summary.counts["pack-shared-deeplink"]).toBe(1);
    expect(summary.counts["rights-receipt-copied"]).toBe(1);
    expect(summary.lastPackId).toBe("rofan-episode1-starter");
  });

  it("recovers cleanly when stored telemetry JSON is corrupted", () => {
    const storage = createMemoryStorage();
    storage.setItem(WORKFLOW_PACK_TELEMETRY_KEY, "not-valid-json");
    const summary = loadWorkflowPackTelemetrySummary(storage);
    expect(summary.totalEvents).toBe(0);
    expect(summary.lastPackId).toBeNull();
  });
});
