import { describe, expect, it, vi } from "vitest";

import { effectiveStrokePointWidthsPx } from "./studio-drawel-vector-correction";
import {
  applyVectorSurgeryCommitPatch,
  beginVectorSurgeryPointerSession,
  cancelVectorSurgeryPointerSession,
  commitVectorSurgeryPointerSession,
  ownsVectorSurgeryPointer,
  revertVectorSurgeryCommitPatch,
  simplifyDrawElStrokeRegion,
  STUDIO_VECTOR_SURGERY_TOOL_SPECS,
  updateVectorSurgeryPointerSession,
} from "./studio-vector-surgery-pointer-session";

import type { DrawEl } from "../studio-element-model";

function makeStroke(
  id: string,
  points: number[],
  options: {
    pressures?: number[];
    strokeWidth?: number;
    kind?: DrawEl["kind"];
    locked?: boolean;
    hidden?: boolean;
  } = {},
): DrawEl {
  return {
    id,
    type: "draw",
    kind: options.kind ?? "freehand",
    mode: "pen",
    brush: "gpen",
    points,
    pressures: options.pressures,
    stroke: "#111111",
    strokeWidth: options.strokeWidth ?? 4,
    ...(options.locked ? { locked: true } : {}),
    ...(options.hidden ? { hidden: true } : {}),
  };
}

describe("studio-vector-surgery-pointer-session", () => {
  it("7종 수술 + 부분 단순화(총 8종) 도구 메타데이터를 빠짐없이 제공한다", () => {
    const ids = STUDIO_VECTOR_SURGERY_TOOL_SPECS.map((s) => s.id);
    expect(ids).toEqual([
      "pinch",
      "adjust-width",
      "redraw-width",
      "connect",
      "redraw-segment",
      "simplify",
      "split",
      "corner-toggle",
    ]);
  });

  it("pinch 세션: 양 끝 고정(both)으로 탄성 변형하고 시작점으로 되돌리면 원본이 복원되며 단일 Undo로 되돌릴 수 있다", () => {
    const original = makeStroke("s-pinch", [0, 0, 25, 0, 50, 0, 75, 0, 100, 0]);
    const untouched = makeStroke("s-other", [0, 200, 100, 200]);
    const docs = [original, untouched];

    const captureTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    };

    let session = beginVectorSurgeryPointerSession(
      docs,
      { x: 50, y: 2, pointerId: 7 },
      { tool: "pinch", radiusPx: 60, pinchLevel: 7, fixEnds: "both", captureTarget },
    );
    expect(captureTarget.setPointerCapture).toHaveBeenCalledWith(7);
    expect(ownsVectorSurgeryPointer(session, { pointerId: 7 })).toBe(true);
    expect(ownsVectorSurgeryPointer(session, { pointerId: 99 })).toBe(false);

    // 다른 포인터 ID는 무시한다.
    const ignored = updateVectorSurgeryPointerSession(session, { x: 50, y: 80, pointerId: 99 });
    expect(ignored).toBe(session);

    // 아래로 30px 드래그
    session = updateVectorSurgeryPointerSession(session, { x: 50, y: 32, pointerId: 7 });
    expect(session.changed).toBe(true);
    expect(session.overlay.pinchVector).toEqual({
      from: { x: 50, y: 2 },
      to: { x: 50, y: 32 },
    });
    const preview0 = session.previewStrokes[0]!;
    expect(preview0.points.slice(0, 2)).toEqual([0, 0]);
    expect(preview0.points.slice(-2)).toEqual([100, 0]);
    expect(preview0.points[5]!).toBeGreaterThan(20);
    // 입력 원본 배열은 절대 변이되지 않는다.
    expect(original.points[5]).toBe(0);

    // 시작점으로 되돌리면 비누적(non-cumulative) 계산이므로 원본과 동일해진다.
    const back = updateVectorSurgeryPointerSession(session, { x: 50, y: 2, pointerId: 7 });
    expect(back.changed).toBe(false);

    // 다시 당겨서 단일 Undo 패치로 커밋
    session = updateVectorSurgeryPointerSession(back, { x: 50, y: 27, pointerId: 7 });
    const patch = commitVectorSurgeryPointerSession(session, docs);
    expect(captureTarget.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(patch.changed).toBe(true);
    expect(patch.stale).toBe(false);
    expect(patch.label).toBe("벡터선 집기");
    expect(patch.replacedIds).toEqual(["s-pinch"]);
    expect(patch.removedIds).toEqual([]);
    expect(patch.addedStrokes).toEqual([]);

    const applied = applyVectorSurgeryCommitPatch(docs, patch);
    expect(applied[0]!.points[5]!).toBeGreaterThan(15);
    const reverted = revertVectorSurgeryCommitPatch(applied, patch);
    expect(reverted).toEqual(docs);
  });

  it("pinch 세션: fixEnds='none'이면 끝점도 함께 이동한다", () => {
    const stroke = makeStroke("s-free", [0, 0, 20, 0, 40, 0]);
    let session = beginVectorSurgeryPointerSession(
      [stroke],
      { x: 0, y: 0 },
      { tool: "pinch", radiusPx: 50, fixEnds: "none" },
    );
    session = updateVectorSurgeryPointerSession(session, { x: 0, y: 15 });
    expect(session.previewStrokes[0]!.points[1]).toBeCloseTo(15, 4);
  });

  it("adjust-width 세션: 부분 브러시 왕복 드래그 시 선폭이 누적 폭발하지 않고 1px 하한 및 다중 획 단일 Undo를 지킨다", () => {
    const s1 = makeStroke("w1", [0, 0, 25, 0, 50, 0, 75, 0, 100, 0], {
      pressures: [0.5, 0.5, 0.5, 0.5, 0.5],
      strokeWidth: 4,
    });
    const s2 = makeStroke("w2", [0, 10, 50, 10, 100, 10], {
      pressures: [0.5, 0.5, 0.5],
      strokeWidth: 4,
    });
    const docs = [s1, s2];

    let session = beginVectorSurgeryPointerSession(
      docs,
      { x: 40, y: 5 },
      { tool: "adjust-width", radiusPx: 25, widthMode: "add", widthAmount: 2, atLeastOnePixel: true },
    );
    // 같은 영역을 여러 번 왕복해도 최대 +2px(총 6px)을 넘지 않아야 한다.
    session = updateVectorSurgeryPointerSession(session, { x: 60, y: 5 });
    session = updateVectorSurgeryPointerSession(session, { x: 40, y: 5 });
    session = updateVectorSurgeryPointerSession(session, { x: 60, y: 5 });

    const widths1 = effectiveStrokePointWidthsPx(session.previewStrokes[0]!);
    expect(widths1[0]).toBeCloseTo(4, 3);
    expect(widths1[4]).toBeCloseTo(4, 3);
    expect(widths1[2]!).toBeGreaterThan(5.5);
    expect(widths1[2]!).toBeLessThanOrEqual(6.05);

    const patch = commitVectorSurgeryPointerSession(session, docs);
    expect(patch.changed).toBe(true);
    expect(patch.replacedIds).toEqual(["w1", "w2"]);

    // subtract + atLeastOnePixel 하한 검증
    const thinSession = beginVectorSurgeryPointerSession(
      [s1],
      { x: 50, y: 0 },
      { tool: "adjust-width", radiusPx: 30, widthMode: "subtract", widthAmount: 20, atLeastOnePixel: true, wholeLine: true },
    );
    const thinWidths = effectiveStrokePointWidthsPx(thinSession.previewStrokes[0]!);
    expect(Math.min(...thinWidths)).toBeCloseTo(1, 3);
  });

  it("connect 세션: 두 획 끝점 사이를 드래그해 하나로 연결하고 단일 Undo로 두 획을 원복한다", () => {
    const a = makeStroke("c-a", [0, 0, 40, 0, 80, 0], { pressures: [0.4, 0.5, 0.6] });
    const b = makeStroke("c-b", [160, 0, 120, 0, 86, 0], { pressures: [0.3, 0.5, 0.7] });
    const docs = [a, b];

    let session = beginVectorSurgeryPointerSession(
      docs,
      { x: 76, y: 0 },
      { tool: "connect", radiusPx: 20, maxGapPx: 16 },
    );
    session = updateVectorSurgeryPointerSession(session, { x: 90, y: 0 });
    expect(session.changed).toBe(true);
    expect(session.previewStrokes).toHaveLength(1);
    expect(session.overlay.connectSeam?.fromId).toBe("c-a");
    expect(session.overlay.connectSeam?.toId).toBe("c-b");

    const patch = commitVectorSurgeryPointerSession(session, docs);
    expect(patch.replacedIds).toEqual(["c-a"]);
    expect(patch.removedIds).toEqual(["c-b"]);

    const applied = applyVectorSurgeryCommitPatch(docs, patch);
    expect(applied).toHaveLength(1);
    const reverted = revertVectorSurgeryCommitPatch(applied, patch);
    expect(reverted).toEqual(docs);
  });

  it("redraw-segment 및 redraw-width 세션: 드래그 궤적으로 구간 형상/필압을 각각 치환한다", () => {
    const base = makeStroke(
      "r1",
      [0, 0, 20, 0, 40, 0, 60, 0, 80, 0, 100, 0],
      { pressures: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4] },
    );

    // 1. 부분 재그리기
    let segSession = beginVectorSurgeryPointerSession(
      [base],
      { x: 30, y: 1, pressure: 0.6 },
      { tool: "redraw-segment", maxSnapDistPx: 24 },
    );
    segSession = updateVectorSurgeryPointerSession(segSession, { x: 50, y: 26, pressure: 0.9 });
    segSession = updateVectorSurgeryPointerSession(segSession, { x: 70, y: 1, pressure: 0.6 });
    const segPatch = commitVectorSurgeryPointerSession(segSession, [base]);
    expect(segPatch.changed).toBe(true);
    const ys = segPatch.nextDocumentStrokes[0]!.points.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(15);

    // 2. 선폭 다시 그리기 (좌표는 불변, 투영 구간 필압만 변경)
    let widthSession = beginVectorSurgeryPointerSession(
      [base],
      { x: 25, y: 2, pressure: 0.9 },
      { tool: "redraw-width", maxSnapDistPx: 24, featherPx: 4 },
    );
    widthSession = updateVectorSurgeryPointerSession(widthSession, { x: 50, y: 2, pressure: 0.95 });
    widthSession = updateVectorSurgeryPointerSession(widthSession, { x: 75, y: 2, pressure: 0.9 });
    const widthPatch = commitVectorSurgeryPointerSession(widthSession, [base]);
    expect(widthPatch.changed).toBe(true);
    expect(widthPatch.nextDocumentStrokes[0]!.points).toEqual(base.points);
    expect(widthPatch.nextDocumentStrokes[0]!.pressures![2]!).toBeGreaterThan(0.8);
    expect(widthPatch.nextDocumentStrokes[0]!.pressures![0]).toBeCloseTo(0.4, 5);
  });

  it("simplify 세션: 브러시 반경 내부의 과밀 정점만 부분 단순화하고 영역 밖 정점·필압을 보존하며 짧은 선 삭제를 지원한다", () => {
    // 앞쪽(0..60)은 공선 잡음이 빽빽하고, 뒤쪽(120..180)은 브러시가 닿지 않는 구간
    const dense = makeStroke(
      "simp-1",
      [0, 0, 10, 0.3, 20, -0.2, 30, 0.4, 40, -0.1, 50, 0.2, 60, 0, 120, 0, 140, 0.2, 160, 0, 180, 0],
      { pressures: [0.3, 0.4, 0.5, 0.6, 0.5, 0.4, 0.7, 0.8, 0.85, 0.9, 0.95] },
    );
    const shortStray = makeStroke("simp-short", [30, 2, 34, 2]);
    const docs = [dense, shortStray];

    const direct = simplifyDrawElStrokeRegion(dense, {
      tolerancePx: 1.5,
      brushTrailPoints: [10, 0, 50, 0],
      radiusPx: 18,
    });
    expect(direct.removedVertices).toBeGreaterThanOrEqual(3);
    // 닿지 않은 뒤쪽 정점 (140, 0.2) 와 그 필압(0.85)이 그대로 유지되어야 한다.
    expect(direct.stroke.points).toContain(140);
    expect(direct.stroke.pressures!.at(-3)).toBeCloseTo(0.85, 5);

    let session = beginVectorSurgeryPointerSession(
      docs,
      { x: 10, y: 0 },
      { tool: "simplify", radiusPx: 20, simplifyTolerancePx: 1.5, deleteShorterThanPx: 10 },
    );
    session = updateVectorSurgeryPointerSession(session, { x: 50, y: 0 });
    expect(session.overlay.removedVerticesCount).toBeGreaterThan(0);

    const patch = commitVectorSurgeryPointerSession(session, docs);
    expect(patch.changed).toBe(true);
    expect(patch.replacedIds).toEqual(["simp-1"]);
    expect(patch.removedIds).toEqual(["simp-short"]);
    expect(patch.nextDocumentStrokes).toHaveLength(1);
    expect(revertVectorSurgeryCommitPatch(patch.nextDocumentStrokes, patch)).toEqual(docs);
  });

  it("split 및 corner-toggle 세션: 실시간 마커 미리보기와 단일 Undo 분할/모서리 전환을 지원한다", () => {
    const cornerStroke = makeStroke("sp-corner", [0, 0, 50, 0, 50, 50], {
      pressures: [0.3, 0.6, 0.9],
    });

    // 1. split
    let splitSession = beginVectorSurgeryPointerSession(
      [cornerStroke],
      { x: 25, y: 1 },
      {
        tool: "split",
        hitRadiusPx: 16,
        createSplitIds: (id) => [`${id}:left`, `${id}:right`],
      },
    );
    expect(splitSession.overlay.splitMarker?.strokeId).toBe("sp-corner");
    expect(splitSession.previewStrokes).toHaveLength(2);
    // 드래그로 분할 위치를 옮겨 미리보기를 미세 조정한다.
    splitSession = updateVectorSurgeryPointerSession(splitSession, { x: 50, y: 25 });
    expect(splitSession.overlay.splitMarker?.t).toBeCloseTo(0.75, 2);

    const splitPatch = commitVectorSurgeryPointerSession(splitSession, [cornerStroke]);
    expect(splitPatch.removedIds).toEqual(["sp-corner"]);
    expect(splitPatch.addedStrokes.map((s) => s.id)).toEqual(["sp-corner:left", "sp-corner:right"]);
    const splitApplied = applyVectorSurgeryCommitPatch([cornerStroke], splitPatch);
    expect(splitApplied).toHaveLength(2);
    expect(revertVectorSurgeryCommitPatch(splitApplied, splitPatch)).toEqual([cornerStroke]);

    // 2. corner-toggle (직각 모서리 → 부드러운 곡선)
    const cornerSession = beginVectorSurgeryPointerSession(
      [cornerStroke],
      { x: 52, y: 2 },
      { tool: "corner-toggle", hitRadiusPx: 16, cornerMode: "auto" },
    );
    expect(cornerSession.overlay.cornerMarker).toEqual({
      strokeId: "sp-corner",
      vertexIndex: 1,
      x: 50,
      y: 0,
    });
    const cornerPatch = commitVectorSurgeryPointerSession(cornerSession, [cornerStroke]);
    expect(cornerPatch.changed).toBe(true);
    expect(cornerPatch.nextDocumentStrokes[0]!.points.length / 2).toBe(5);
  });

  it("취소(cancel), 원격 편집 stale 충돌 방지, 잠김/숨김/도형 획 보호가 정확히 동작한다", () => {
    const editable = makeStroke("ok", [0, 0, 50, 0, 100, 0]);
    const locked = makeStroke("locked", [0, 0, 50, 0, 100, 0], { locked: true });
    const hidden = makeStroke("hidden", [0, 0, 50, 0, 100, 0], { hidden: true });
    const rectShape = makeStroke("shape", [0, 0, 50, 0, 100, 0], { kind: "rect" });
    const docs = [locked, hidden, rectShape, editable];

    let session = beginVectorSurgeryPointerSession(
      docs,
      { x: 50, y: 0 },
      { tool: "pinch", radiusPx: 50, fixEnds: "both" },
    );
    session = updateVectorSurgeryPointerSession(session, { x: 50, y: 30 });
    expect(session.targetStrokeId).toBe("ok");

    // 취소하면 원본 스냅샷이 그대로 복원된다.
    const cancelled = cancelVectorSurgeryPointerSession(session);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.restoredStrokes).toEqual(docs);

    // 드래그 중 원격 수정이 들어왔으면 stale 커밋을 차단한다.
    const remotelyChanged = docs.map((s) =>
      s.id === "ok" ? { ...s, points: [0, 0, 50, 99, 100, 0] } : s,
    );
    const stalePatch = commitVectorSurgeryPointerSession(session, remotelyChanged);
    expect(stalePatch.stale).toBe(true);
    expect(stalePatch.changed).toBe(false);
    expect(stalePatch.nextDocumentStrokes).toBe(remotelyChanged);
  });
});
