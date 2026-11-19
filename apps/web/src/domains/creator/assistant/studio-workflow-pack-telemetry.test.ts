import { describe, expect, it, vi } from "vitest";

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

  it("최근 사용 집계는 허용된 카운터와 팩 ID만 정확한 키에 다시 저장한다", () => {
    const storage = createMemoryStorage();
    storage.setItem(WORKFLOW_PACK_TELEMETRY_KEY, JSON.stringify({
      counts: { "pack-applied": 2.8, "router-jumped": -1, unknown: 99 },
      lastPackId: "preset-1",
      projectGraph: { pages: ["manuscript-fixture"] },
      authToken: "fixture-only",
    }));
    const write = vi.spyOn(storage, "setItem");

    const summary = recordWorkflowPackEvent("router-jumped", undefined, storage);
    expect(summary.totalEvents).toBe(3);
    expect(summary.counts).toEqual({
      "pack-applied": 2,
      "pack-shared-deeplink": 0,
      "pack-saved-custom": 0,
      "pack-imported-json": 0,
      "rights-receipt-copied": 0,
      "router-jumped": 1,
    });
    expect(Object.keys(summary).sort()).toEqual(["counts", "lastPackId", "totalEvents"]);
    expect(write).toHaveBeenCalledExactlyOnceWith(WORKFLOW_PACK_TELEMETRY_KEY, JSON.stringify(summary));
    expect(loadWorkflowPackTelemetrySummary(storage)).toEqual(summary);
  });

  it("최근 사용 저장이 차단되어도 메모리 집계만 반환한다", () => {
    const storage: WorkflowPackStorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error("storage blocked"); },
    };
    expect(recordWorkflowPackEvent("pack-applied", "preset-1", storage).totalEvents).toBe(1);
    expect(loadWorkflowPackTelemetrySummary(storage).totalEvents).toBe(0);
  });
});
