/**
 * 섀도우 어댑터 단위 테스트 (HOST_INSERTION_SPEC 1·3의 1단계 검증).
 * 실행: vitest (로컬 검증 절차는 폴더 NOTES.md 참조).
 *
 * 검증 축: CRDT 변경 요약 → op 변환이 병합 코어 fold와 문서 투영의 해시를
 * 일치시키는가, 그리고 코어로 표현할 수 없는 변경이 숨겨지지 않고
 * unmodeled 불일치 로그로 드러나는가.
 */

import { describe, expect, it } from "vitest";

import { hashMergeState } from "./stroke-merge-core";
import {
  projectCrdtStrokesToMergeState,
  startStrokeMergeShadow,
  StrokeMergeShadowAdapter,
  type StrokeMergeShadowDocument,
  type StrokeMergeShadowMismatch,
} from "./stroke-merge-shadow-adapter";
import type {
  StudioCrdtChange,
  StudioCrdtDrawStrokePayload,
  StudioCrdtStrokeRecord,
} from "../studio-crdt-document-types";

function payload(overrides: Partial<StudioCrdtDrawStrokePayload> = {}): StudioCrdtDrawStrokePayload {
  return {
    version: 1,
    type: "draw",
    kind: "pen",
    mode: "pen",
    stroke: "#111111",
    strokeWidth: 3,
    points: [0, 0, 0.5, 0.5, 1, 1],
    pressures: [0.5, 0.6, 0.7],
    ...overrides,
  };
}

function record(
  id: string,
  overrides: Partial<StudioCrdtStrokeRecord> = {},
): StudioCrdtStrokeRecord {
  return {
    id,
    pageId: "p1",
    layerId: "l1",
    payload: payload(),
    status: "finalized",
    deleted: false,
    orderIndex: 0,
    ...overrides,
  };
}

function change(
  strokes: StudioCrdtStrokeRecord[],
  changedIds: string[],
): Pick<StudioCrdtChange, "changedStrokeIds" | "strokes"> {
  return { changedStrokeIds: new Set(changedIds), strokes };
}

function makeAdapter() {
  const logs: StrokeMergeShadowMismatch[] = [];
  const adapter = new StrokeMergeShadowAdapter({
    surface: "test-surface",
    logger: (entry) => logs.push(entry),
  });
  return { adapter, logs };
}

function expectConverged(
  adapter: StrokeMergeShadowAdapter,
  strokes: StudioCrdtStrokeRecord[],
) {
  const documentHash = hashMergeState(projectCrdtStrokesToMergeState(strokes, "shadow"));
  expect(adapter.shadowHash()).toBe(documentHash);
}

describe("섀도우 어댑터 — op 변환과 해시 대조", () => {
  it("확정 스트로크 생성은 add로 변환되고 해시가 일치한다", () => {
    const { adapter, logs } = makeAdapter();
    const strokes = [record("s1")];
    adapter.ingest(change(strokes, ["s1"]));
    expectConverged(adapter, strokes);
    expect(adapter.stats().opsApplied).toBe(1);
    expect(logs).toHaveLength(0);
  });

  it("그리는 중 스트로크는 op로 만들지 않고, 확정 시점에 add한다", () => {
    const { adapter, logs } = makeAdapter();
    const drawing = [record("s1", { status: "drawing" })];
    adapter.ingest(change(drawing, ["s1"]));
    expect(adapter.stats().opsApplied).toBe(0);
    expectConverged(adapter, drawing);

    const finalized = [record("s1")];
    adapter.ingest(change(finalized, ["s1"]));
    expect(adapter.stats().opsApplied).toBe(1);
    expectConverged(adapter, finalized);
    expect(logs).toHaveLength(0);
  });

  it("삭제와 복원이 remove/restore로 변환되고 해시가 일치한다", () => {
    const { adapter, logs } = makeAdapter();
    adapter.ingest(change([record("s1")], ["s1"]));

    const deleted = [record("s1", { deleted: true })];
    adapter.ingest(change(deleted, ["s1"]));
    expectConverged(adapter, deleted);

    const restored = [record("s1")];
    adapter.ingest(change(restored, ["s1"]));
    expectConverged(adapter, restored);
    expect(adapter.stats().opsApplied).toBe(3);
    expect(logs).toHaveLength(0);
  });

  it("이미 삭제된 레코드가 동기화로 처음 도착하면 add+remove로 접힌다", () => {
    const { adapter, logs } = makeAdapter();
    const tombstone = [record("s1", { deleted: true })];
    adapter.ingest(change(tombstone, ["s1"]));
    expectConverged(adapter, tombstone);
    expect(adapter.stats().opsApplied).toBe(2);
    expect(logs).toHaveLength(0);
  });

  it("시각 속성만 바뀐 변형은 setProps로 변환되고 해시가 일치한다", () => {
    const { adapter, logs } = makeAdapter();
    adapter.ingest(change([record("s1")], ["s1"]));
    const recolored = [record("s1", { payload: payload({ stroke: "#ff0000", opacity: 0.5 }) })];
    adapter.ingest(change(recolored, ["s1"]));
    expectConverged(adapter, recolored);
    expect(logs).toHaveLength(0);
  });

  it("속성 제거(unset)도 setProps로 변환된다", () => {
    const { adapter, logs } = makeAdapter();
    adapter.ingest(change([record("s1", { payload: payload({ opacity: 0.5 }) })], ["s1"]));
    const cleared = [record("s1")];
    adapter.ingest(change(cleared, ["s1"]));
    expectConverged(adapter, cleared);
    expect(logs).toHaveLength(0);
  });

  it("한 변경에 여러 스트로크가 와도 z-order를 보존한다", () => {
    const { adapter, logs } = makeAdapter();
    const strokes = [
      record("s1", { orderIndex: 0 }),
      record("s2", { orderIndex: 1 }),
      record("s3", { orderIndex: 2 }),
    ];
    adapter.ingest(change(strokes, ["s3", "s1", "s2"]));
    expectConverged(adapter, strokes);
    expect(logs).toHaveLength(0);
  });

  it("기하(points) 변경은 숨기지 않고 unmodeled로 기록한다", () => {
    const { adapter, logs } = makeAdapter();
    adapter.ingest(change([record("s1")], ["s1"]));
    const redrawn = [record("s1", { payload: payload({ points: [0, 0, 0.2, 0.2] }) })];
    adapter.ingest(change(redrawn, ["s1"]));
    expect(logs.some((entry) => entry.detail === "geometry-change")).toBe(true);
    expect(adapter.stats().unmodeled).toBeGreaterThan(0);
    expect(adapter.stats().mismatches).toBeGreaterThan(0);
  });

  it("재정렬 단독 변경은 z-order 발산으로 기록한다", () => {
    const { adapter, logs } = makeAdapter();
    const initial = [record("s1", { orderIndex: 0 }), record("s2", { orderIndex: 1 })];
    adapter.ingest(change(initial, ["s1", "s2"]));
    const reordered = [record("s2", { orderIndex: 0 }), record("s1", { orderIndex: 1 })];
    adapter.ingest(change(reordered, ["s2", "s1"]));
    expect(logs.some((entry) => entry.detail === "z-order-diverged")).toBe(true);
  });
});

describe("섀도우 어댑터 — 표면 배선(startStrokeMergeShadow)", () => {
  it("시드 후 구독하고, stop하면 더 이상 대조하지 않는다", () => {
    const holder: { handler: ((change: StudioCrdtChange) => void) | null } = { handler: null };
    let current = [record("s1")];
    const fakeDocument: StrokeMergeShadowDocument = {
      getStrokes: () => current,
      subscribeChanges: (next) => {
        holder.handler = next as (change: StudioCrdtChange) => void;
        return () => {
          holder.handler = null;
        };
      },
    };
    const logs: StrokeMergeShadowMismatch[] = [];
    const handle = startStrokeMergeShadow(fakeDocument, {
      surface: "test-surface",
      logger: (entry) => logs.push(entry),
    });
    // 시드만으로 기존 문서와 수렴해 있어야 한다.
    expect(handle.stats().changes).toBe(1);
    expect(handle.stats().lastShadowHash).toBe(handle.stats().lastDocumentHash);

    current = [record("s1"), record("s2", { orderIndex: 1 })];
    holder.handler?.({
      ...change(current, ["s2"]),
      origin: null,
      local: true,
      changedSceneElementIds: new Set(),
      changedPageIds: new Set(),
      changedLayerGroupIds: new Set(),
      changedRasterSurfaceIds: new Set(),
      changedRasterOperationIds: new Set(),
      changedRasterUndoOperationIds: new Set(),
      changedRasterUndoAcknowledgementIds: new Set(),
      changedRasterCheckpointIds: new Set(),
      sceneElements: [],
      pages: [],
      layerGroups: [],
      rasterOperationLogs: [],
      rasterCheckpoints: [],
    } as StudioCrdtChange);
    expect(handle.stats().changes).toBe(2);
    expect(handle.stats().lastShadowHash).toBe(handle.stats().lastDocumentHash);
    expect(logs).toHaveLength(0);

    handle.stop();
    expect(holder.handler).toBeNull();
  });
});
