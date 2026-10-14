import { describe, expect, it, vi } from "vitest";

import {
  bulkExportMarkerCovers,
  parseAccountProjectInventory,
  parseBulkExportMarker,
  planBulkProjectExport,
  resolveAccountDeletionReadiness,
  serializeBulkExportMarker,
  summarizeBulkExportOutcomes,
  type AccountBulkExportMarker,
  type AccountPortabilityProject,
  type BulkExportOutcome,
} from "./account-data-portability";
import { runBulkProjectExport } from "./account-bulk-export";

const NOW = "2026-10-14T00:00:00.000Z";

function libraryRaw(projects: unknown): string {
  return JSON.stringify({ schemaVersion: 1, projects, updatedAt: NOW });
}

function project(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "p-1",
    title: "첫 작품",
    kind: "webtoon",
    status: "active",
    updatedAt: "2026-10-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseAccountProjectInventory", () => {
  it("active·archived는 내보내기 대상, trashed는 제외로 나눈다 (최신순 정렬)", () => {
    const inventory = parseAccountProjectInventory(libraryRaw([
      project({ id: "p-old", title: "오래된 작품", updatedAt: "2026-10-01T00:00:00.000Z" }),
      project({ id: "p-new", title: "새 작품", updatedAt: "2026-10-12T00:00:00.000Z" }),
      project({ id: "p-arch", title: "보관 작품", status: "archived", updatedAt: "2026-10-11T00:00:00.000Z" }),
      project({ id: "p-trash", title: "휴지통 작품", status: "trashed", updatedAt: "2026-10-13T00:00:00.000Z" }),
    ]));
    expect(inventory.exportable.map((item) => item.id)).toEqual(["p-new", "p-arch", "p-old"]);
    expect(inventory.trashed.map((item) => item.id)).toEqual(["p-trash"]);
    expect(inventory.unreadableCount).toBe(0);
    expect(inventory.totalCount).toBe(4);
  });

  it("깨진 기록은 조용히 버리지 않고 unreadable로 센다", () => {
    const inventory = parseAccountProjectInventory(libraryRaw([
      project(),
      { id: "broken" },
      project({ id: "p-x", status: "unknown-status" }),
      "not-an-object",
    ]));
    expect(inventory.exportable).toHaveLength(1);
    expect(inventory.unreadableCount).toBe(3);
    expect(inventory.totalCount).toBe(4);
  });

  it("원본이 없으면 빈 인벤토리, JSON 자체가 깨졌으면 unreadable 1건으로 정직히 센다", () => {
    expect(parseAccountProjectInventory(null).totalCount).toBe(0);
    const broken = parseAccountProjectInventory("{oops");
    expect(broken.exportable).toHaveLength(0);
    expect(broken.unreadableCount).toBe(1);
  });
});

describe("planBulkProjectExport / marker", () => {
  it("onlyIds는 실패분 재시도용으로 해당 작품만 계획에 남긴다", () => {
    const inventory = parseAccountProjectInventory(libraryRaw([
      project({ id: "p-1" }),
      project({ id: "p-2", updatedAt: "2026-10-11T00:00:00.000Z" }),
      project({ id: "p-3", status: "trashed" }),
    ]));
    const plan = planBulkProjectExport(inventory, { onlyIds: ["p-1", "p-3"] });
    expect(plan.items.map((item) => item.id)).toEqual(["p-1"]);
    expect(plan.excludedTrashedCount).toBe(1);
  });

  it("표식은 실패가 없고 받은 뒤 바뀐 작품이 없을 때만 덮는다", () => {
    const inventory = parseAccountProjectInventory(libraryRaw([
      project({ id: "p-1", updatedAt: "2026-10-10T00:00:00.000Z" }),
    ]));
    const fresh: AccountBulkExportMarker = {
      exportedAt: "2026-10-12T00:00:00.000Z", successCount: 1, failureCount: 0, successIds: ["p-1"],
    };
    expect(bulkExportMarkerCovers(inventory, fresh)).toBe(true);
    // 받은 뒤 수정된 작품 → stale
    expect(bulkExportMarkerCovers(inventory, { ...fresh, exportedAt: "2026-10-09T00:00:00.000Z" })).toBe(false);
    // 실패가 섞인 표식 → 미완성
    expect(bulkExportMarkerCovers(inventory, { ...fresh, failureCount: 1 })).toBe(false);
    // 다른 작품만 받은 표식 → 미완성
    expect(bulkExportMarkerCovers(inventory, { ...fresh, successIds: ["other"] })).toBe(false);
    expect(bulkExportMarkerCovers(inventory, null)).toBe(false);
  });

  it("표식 직렬화 왕복이 성립하고 깨진 표식은 null이다", () => {
    const marker: AccountBulkExportMarker = {
      exportedAt: NOW, successCount: 2, failureCount: 1, successIds: ["a", "b"],
    };
    expect(parseBulkExportMarker(serializeBulkExportMarker(marker))).toEqual(marker);
    expect(parseBulkExportMarker("nope")).toBeNull();
    expect(parseBulkExportMarker(null)).toBeNull();
  });
});

describe("resolveAccountDeletionReadiness", () => {
  const withWorks = parseAccountProjectInventory(libraryRaw([
    project({ id: "p-1" }),
    project({ id: "p-2", status: "trashed", title: "버린 작품" }),
  ]));
  const coveredMarker: AccountBulkExportMarker = {
    exportedAt: "2026-10-12T00:00:00.000Z", successCount: 1, failureCount: 0, successIds: ["p-1"],
  };

  it("작품이 없으면 바로 탈퇴할 수 있다", () => {
    const readiness = resolveAccountDeletionReadiness({
      inventory: parseAccountProjectInventory(null), marker: null, skipExportAcknowledged: false,
    });
    expect(readiness.canDelete).toBe(true);
    expect(readiness.items[0]).toEqual({ id: "works-export", status: "pass", count: 0 });
  });

  it("내보낼 작품이 남았으면 다운로드 완료 전까지 탈퇴가 막힌다", () => {
    const readiness = resolveAccountDeletionReadiness({
      inventory: withWorks, marker: null, skipExportAcknowledged: false,
    });
    expect(readiness.canDelete).toBe(false);
    expect(readiness.items).toContainEqual({ id: "works-export", status: "block", count: 1 });
    expect(readiness.items).toContainEqual({ id: "trashed-works", status: "info", count: 1 });
    expect(readiness.items).toContainEqual({ id: "retained-posts", status: "info", count: null });
    expect(readiness.items).toContainEqual({ id: "library-data", status: "info", count: null });
  });

  it("최신 일괄 다운로드가 끝나면 막힘이 풀리고, 명시 확인으로도 풀린다", () => {
    expect(resolveAccountDeletionReadiness({
      inventory: withWorks, marker: coveredMarker, skipExportAcknowledged: false,
    }).canDelete).toBe(true);
    expect(resolveAccountDeletionReadiness({
      inventory: withWorks, marker: null, skipExportAcknowledged: true,
    }).canDelete).toBe(true);
    // 부분 실패 표식은 확인 없이는 여전히 막힌다
    expect(resolveAccountDeletionReadiness({
      inventory: withWorks,
      marker: { ...coveredMarker, failureCount: 1 },
      skipExportAcknowledged: false,
    }).canDelete).toBe(false);
  });
});

describe("runBulkProjectExport / summarize", () => {
  it("한 작품이 실패해도 나머지를 계속 받고 성공·실패를 나눠 보고한다", async () => {
    const inventory = parseAccountProjectInventory(libraryRaw([
      project({ id: "p-1" }),
      project({ id: "p-2", updatedAt: "2026-10-11T00:00:00.000Z" }),
      project({ id: "p-3", updatedAt: "2026-10-12T00:00:00.000Z" }),
    ]));
    const plan = planBulkProjectExport(inventory);
    const progress: number[] = [];
    const outcomes = await runBulkProjectExport(plan, {
      exportOne: async (item) => {
        if (item.id === "p-2") throw new Error("disk full");
        return { fileName: `${item.id}.toonstudio` };
      },
      onProgress: (done) => progress.push(done),
    });
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, false, true]);
    expect(progress).toEqual([1, 2, 3]);
    const summary = summarizeBulkExportOutcomes(outcomes, plan.items.length);
    expect(summary).toEqual({
      planned: 3, succeeded: 2, failed: 1, failedIds: ["p-2"], complete: false,
    });
  });

  it("전부 성공했을 때만 complete다", () => {
    const outcomes: BulkExportOutcome[] = [
      { projectId: "p-1", title: "작품", ok: true, fileName: "a.toonstudio", error: null },
    ];
    expect(summarizeBulkExportOutcomes(outcomes, 1).complete).toBe(true);
    expect(summarizeBulkExportOutcomes([], 0).complete).toBe(false);
  });

  it("exportOne 인자는 계획 항목 그대로(아이콘 인자류 회귀 방지: 순서·필드 고정)", async () => {
    const inventory = parseAccountProjectInventory(libraryRaw([project()]));
    const plan = planBulkProjectExport(inventory);
    const exportOne = vi.fn(async (_project: AccountPortabilityProject) => ({ fileName: "x.toonstudio" }));
    await runBulkProjectExport(plan, { exportOne });
    expect(exportOne).toHaveBeenCalledTimes(1);
    expect(exportOne.mock.calls[0]?.[0]).toEqual({
      id: "p-1", title: "첫 작품", kind: "webtoon", status: "active",
      updatedAt: "2026-10-10T00:00:00.000Z",
    });
  });
});
