import { describe, expect, it } from "vitest";

import {
  DEFAULT_REDPEN_COLOR,
  DEFAULT_REDPEN_OPACITY,
  MAX_REDPEN_OPACITY,
  MAX_REDPEN_WIDTH_PX,
  MIN_REDPEN_OPACITY,
  MIN_REDPEN_WIDTH_PX,
  acceptRedpenAndResolve,
  addRedpenStroke,
  canvasPointToCutNormalizedAnchor,
  clampUnitInterval,
  createRedpenOverlayState,
  cutNormalizedAnchorToCanvasPoint,
  getVisibleRedpenStrokes,
  mergeRedpenOverlayStates,
  moveRedpenPinAnchor,
  projectRedpenStrokeToCanvasPath,
  recordThreadResolutionTransition,
  remapCutPinAnchorForCrop,
  remapRedpenOverlayForCrop,
  removeRedpenStroke,
  toggleRedpenOverlayVisibility,
  type CutBoundingBox,
} from "./studio-redpen-comment-overlay";

const CUT_BASE: CutBoundingBox = {
  cutId: "cut-01",
  x: 100,
  y: 200,
  width: 800,
  height: 1_200,
};

const EDITOR = { id: "u-editor", name: "편집자" } as const;
const ARTIST = { id: "u-artist", name: "작가" } as const;
const ASSISTANT = { id: "u-assist", name: "어시스턴트" } as const;

describe("비파괴 빨간펜 코멘트 오버레이 (#066–#068)", () => {
  it("캔버스 레이어를 오염시키지 않고 반투명 빨간펜 스트로크를 보관·투영·토글한다", () => {
    const mockCanvasLayers = Object.freeze([{ id: "layer-ink", strokes: [] }]);
    const anchor = canvasPointToCutNormalizedAnchor({ x: 500, y: 800 }, CUT_BASE);
    let state = createRedpenOverlayState({
      threadId: "thread-1",
      anchor,
      createdAt: 1_000,
      authorId: EDITOR.id,
    });

    expect(state.canvasLayerId).toBeNull();
    expect(mockCanvasLayers).toHaveLength(1);

    state = addRedpenStroke(state, {
      id: "rp-1",
      authorId: EDITOR.id,
      authorName: EDITOR.name,
      createdAt: 1_100,
      points: [
        { u: 0.25, v: 0.25 },
        { u: 0.75, v: 0.5 },
      ],
    });

    expect(state.canvasLayerId).toBeNull();
    expect(state.strokes).toHaveLength(1);
    expect(state.strokes[0]).toMatchObject({
      id: "rp-1",
      color: DEFAULT_REDPEN_COLOR,
      opacity: DEFAULT_REDPEN_OPACITY,
    });
    expect(getVisibleRedpenStrokes(state)).toHaveLength(1);

    const projected = projectRedpenStrokeToCanvasPath(state.strokes[0], CUT_BASE);
    expect(projected.points).toEqual([
      { x: 300, y: 500 },
      { x: 700, y: 800 },
    ]);
    expect(projected.d).toBe("M 300 500 L 700 800");

    // 비파괴 토글: 숨겨도 원본 스트로크 데이터는 그대로 유지된다
    const hidden = toggleRedpenOverlayVisibility(state, ARTIST, 1_200, false);
    expect(hidden.visible).toBe(false);
    expect(getVisibleRedpenStrokes(hidden)).toEqual([]);
    expect(hidden.strokes).toHaveLength(1);

    const shownAgain = toggleRedpenOverlayVisibility(hidden, ARTIST, 1_300);
    expect(shownAgain.visible).toBe(true);
    expect(getVisibleRedpenStrokes(shownAgain)).toHaveLength(1);
  });

  it("불투명도·굵기·정규화 좌표를 안전 범위로 클램프하고 빈 스트로크를 무시한다", () => {
    const state = createRedpenOverlayState({
      threadId: "thread-bounds",
      anchor: { cutId: "cut-01", u: -0.5, v: 1.8 },
      createdAt: 1_000,
      authorId: EDITOR.id,
    });
    expect(state.anchor.u).toBe(0);
    expect(state.anchor.v).toBe(1);

    const ignored = addRedpenStroke(state, {
      id: "empty",
      authorId: EDITOR.id,
      authorName: EDITOR.name,
      createdAt: 1_050,
      points: [],
    });
    expect(ignored).toBe(state);

    const clamped = addRedpenStroke(state, {
      id: "rp-clamped",
      authorId: EDITOR.id,
      authorName: EDITOR.name,
      createdAt: 1_100,
      opacity: 0.01,
      widthPx: 99,
      points: [{ u: -2, v: 5, pressure: 2 }],
    });
    expect(clamped.strokes[0].opacity).toBe(MIN_REDPEN_OPACITY);
    expect(clamped.strokes[0].widthPx).toBe(MAX_REDPEN_WIDTH_PX);
    expect(clamped.strokes[0].points[0]).toEqual({ u: 0, v: 1, pressure: 1 });

    const upper = addRedpenStroke(clamped, {
      id: "rp-upper",
      authorId: EDITOR.id,
      authorName: EDITOR.name,
      createdAt: 1_150,
      opacity: 5,
      widthPx: 0.2,
      points: [{ u: 0.5, v: 0.5 }],
    });
    expect(upper.strokes[1].opacity).toBe(MAX_REDPEN_OPACITY);
    expect(upper.strokes[1].widthPx).toBe(MIN_REDPEN_WIDTH_PX);
  });

  it("단일 점 스트로크도 SVG 경로로 정상 투영되고 삭제 시 툼스톤을 남긴다", () => {
    const base = addRedpenStroke(
      createRedpenOverlayState({
        threadId: "thread-dot",
        anchor: { cutId: "cut-01", u: 0.5, v: 0.5 },
        createdAt: 1_000,
        authorId: EDITOR.id,
      }),
      {
        id: "dot-1",
        authorId: EDITOR.id,
        authorName: EDITOR.name,
        createdAt: 1_100,
        points: [{ u: 0.5, v: 0.5 }],
      },
    );
    expect(projectRedpenStrokeToCanvasPath(base.strokes[0], CUT_BASE).d).toBe(
      "M 500 800 L 500 800",
    );

    const removed = removeRedpenStroke(base, "dot-1", ARTIST, 1_200);
    expect(removed.strokes).toEqual([]);
    expect(removed.removedStrokeIds).toEqual(["dot-1"]);
    // 이미 삭제된 ID 재추가는 무시한다
    expect(
      addRedpenStroke(removed, {
        id: "dot-1",
        authorId: EDITOR.id,
        authorName: EDITOR.name,
        createdAt: 1_300,
        points: [{ u: 0.1, v: 0.1 }],
      }),
    ).toBe(removed);
  });
});

describe("수락 시 1클릭 체크완료 + 해결/재열기 감사 로그 (#069)", () => {
  it("수락 1클릭 시 해결 완료·오버레이 자동 숨김·감사 로그 기록 후 재열기 시 이력과 오버레이를 복원한다", () => {
    let state = addRedpenStroke(
      createRedpenOverlayState({
        threadId: "thread-audit",
        anchor: { cutId: "cut-01", u: 0.4, v: 0.6 },
        createdAt: 2_000,
        authorId: EDITOR.id,
      }),
      {
        id: "rp-eye",
        authorId: EDITOR.id,
        authorName: EDITOR.name,
        createdAt: 2_100,
        points: [
          { u: 0.3, v: 0.5 },
          { u: 0.45, v: 0.55 },
        ],
      },
    );

    // 1클릭 수락 체크완료
    state = acceptRedpenAndResolve(state, ARTIST, 3_000, {
      note: "눈매 각도 수정 반영",
    });
    expect(state.resolved).toBe(true);
    expect(state.visible).toBe(false);
    expect(state.strokes).toHaveLength(1);
    expect(state.auditLog).toHaveLength(1);
    expect(state.auditLog[0]).toMatchObject({
      action: "accept-and-resolve",
      actorId: ARTIST.id,
      actorName: ARTIST.name,
      previousResolved: false,
      nextResolved: true,
      note: "눈매 각도 수정 반영",
    });

    // 이미 해결 상태에서 중복 수락 호출은 멱등(로그 중복 생성 금지)
    expect(acceptRedpenAndResolve(state, ARTIST, 3_100)).toBe(state);

    // 재열기: 빨간펜 스트로크가 남아 있으므로 오버레이가 다시 표시되고 재열기 로그 추가
    state = recordThreadResolutionTransition(state, "reopen", EDITOR, 4_000, "오른쪽 눈썹 재확인");
    expect(state.resolved).toBe(false);
    expect(state.visible).toBe(true);
    expect(state.auditLog).toHaveLength(2);
    expect(state.auditLog[1]).toMatchObject({
      action: "reopen",
      actorId: EDITOR.id,
      previousResolved: true,
      nextResolved: false,
      note: "오른쪽 눈썹 재확인",
    });

    // 일반 해결 완료 기록
    state = recordThreadResolutionTransition(state, "resolve", ARTIST, 5_000);
    expect(state.resolved).toBe(true);
    expect(state.auditLog.map((entry) => entry.action)).toEqual([
      "accept-and-resolve",
      "reopen",
      "resolve",
    ]);
  });
});

describe("컷 정규화 (u, v) ∈ [0, 1] 핀 앵커 리사이즈·크롭 보호 (#070)", () => {
  it("컷 높이가 2배 확대 또는 절반 축소되어도 핀이 허공에 뜨지 않고 컷 내부 비율 위치를 유지한다", () => {
    const anchor = canvasPointToCutNormalizedAnchor({ x: 300, y: 1_100 }, CUT_BASE);
    expect(anchor).toEqual({ cutId: "cut-01", u: 0.25, v: 0.75 });

    const tallerCut: CutBoundingBox = { ...CUT_BASE, height: 2_400 };
    const tallerRes = cutNormalizedAnchorToCanvasPoint(anchor, tallerCut);
    expect(tallerRes.wasClamped).toBe(false);
    expect(tallerRes.canvasPoint).toEqual({ x: 300, y: 2_000 });
    expect(tallerRes.canvasPoint.y).toBeGreaterThanOrEqual(tallerCut.y);
    expect(tallerRes.canvasPoint.y).toBeLessThanOrEqual(tallerCut.y + tallerCut.height);

    const shorterCut: CutBoundingBox = { ...CUT_BASE, height: 600 };
    const shorterRes = cutNormalizedAnchorToCanvasPoint(anchor, shorterCut);
    expect(shorterRes.wasClamped).toBe(false);
    expect(shorterRes.canvasPoint).toEqual({ x: 300, y: 650 });
    expect(shorterRes.canvasPoint.y).toBeGreaterThanOrEqual(shorterCut.y);
    expect(shorterRes.canvasPoint.y).toBeLessThanOrEqual(shorterCut.y + shorterCut.height);
  });

  it("컷 크롭 시 살아남은 영역의 핀은 원위치를 유지하고, 잘려나간 영역의 핀은 컷 경계로 클램프된다", () => {
    // 기존 컷: x ∈ [100, 900], y ∈ [200, 1400]
    // 크롭 컷: 상단 200px·하단 300px 제거 → y ∈ [400, 1100] (height: 700)
    const croppedCut: CutBoundingBox = {
      cutId: "cut-01",
      x: 100,
      y: 400,
      width: 800,
      height: 700,
    };

    // 1) 크롭 후에도 내부에 남아 있는 핀: (500, 750) → v' = (750-400)/700 = 0.5
    const survivingPin = canvasPointToCutNormalizedAnchor({ x: 500, y: 750 }, CUT_BASE);
    const survivingRemap = remapCutPinAnchorForCrop(survivingPin, CUT_BASE, croppedCut);
    expect(survivingRemap.wasClamped).toBe(false);
    expect(survivingRemap.canvasPoint).toEqual({ x: 500, y: 750 });
    expect(survivingRemap.anchor.v).toBeCloseTo(0.5, 6);

    // 2) 하단 잘린 영역에 있던 핀: (500, 1300) → 크롭 하단 y=1100(v=1)로 클램프
    const croppedBottomPin = canvasPointToCutNormalizedAnchor({ x: 500, y: 1_300 }, CUT_BASE);
    const bottomRemap = remapCutPinAnchorForCrop(croppedBottomPin, CUT_BASE, croppedCut);
    expect(bottomRemap.wasClamped).toBe(true);
    expect(bottomRemap.clampedEdges).toEqual(["bottom"]);
    expect(bottomRemap.anchor.v).toBe(1);
    expect(bottomRemap.canvasPoint).toEqual({ x: 500, y: 1_100 });

    // 3) 좌상단 모두 잘린 경우
    const tightCut: CutBoundingBox = { cutId: "cut-01", x: 300, y: 500, width: 400, height: 400 };
    const topLeftPin = canvasPointToCutNormalizedAnchor({ x: 150, y: 250 }, CUT_BASE);
    const topLeftRemap = remapCutPinAnchorForCrop(topLeftPin, CUT_BASE, tightCut);
    expect(topLeftRemap.wasClamped).toBe(true);
    expect(topLeftRemap.clampedEdges).toEqual(["left", "top"]);
    expect(topLeftRemap.anchor.u).toBe(0);
    expect(topLeftRemap.anchor.v).toBe(0);
    expect(topLeftRemap.canvasPoint).toEqual({ x: 300, y: 500 });
  });

  it("0·음수·NaN 크기의 퇴화 컷 박스에서도 NaN 없이 결정론적으로 방어한다", () => {
    expect(clampUnitInterval(Number.NaN)).toBe(0.5);
    expect(clampUnitInterval(-0)).toBe(0);

    const degenerate: CutBoundingBox = { cutId: "cut-zero", x: 50, y: 60, width: 0, height: -10 };
    const anchor = canvasPointToCutNormalizedAnchor({ x: 120, y: 300 }, degenerate);
    expect(anchor.u).toBe(0.5);
    expect(anchor.v).toBe(0.5);
    expect(anchor.clamped).toBe(true);

    const resolved = cutNormalizedAnchorToCanvasPoint(anchor, degenerate);
    expect(resolved.canvasPoint).toEqual({ x: 50, y: 60 });
  });

  it("오버레이 전체 크롭 재투영 시 핀과 빨간펜 스트로크가 모두 [0, 1] 안에 유지된다", () => {
    const initial = addRedpenStroke(
      createRedpenOverlayState({
        threadId: "thread-crop",
        anchor: canvasPointToCutNormalizedAnchor({ x: 500, y: 1_350 }, CUT_BASE),
        createdAt: 1_000,
        authorId: EDITOR.id,
      }),
      {
        id: "rp-crop",
        authorId: EDITOR.id,
        authorName: EDITOR.name,
        createdAt: 1_050,
        points: [
          { u: 0.5, v: 0.1 },
          { u: 0.5, v: 0.95 },
        ],
      },
    );
    const croppedCut: CutBoundingBox = { ...CUT_BASE, y: 400, height: 600 };
    const remapped = remapRedpenOverlayForCrop(initial, CUT_BASE, croppedCut, ARTIST, 1_500);
    expect(remapped.anchor.v).toBe(1);
    expect(remapped.anchor.clamped).toBe(true);
    for (const pt of remapped.strokes[0].points) {
      expect(pt.u).toBeGreaterThanOrEqual(0);
      expect(pt.u).toBeLessThanOrEqual(1);
      expect(pt.v).toBeGreaterThanOrEqual(0);
      expect(pt.v).toBeLessThanOrEqual(1);
    }
  });
});

describe("동시 편집 충돌 결정론 병합 (CRDT Semilattice, #070)", () => {
  it("교환법칙·결합법칙·멱등성을 만족하며 동시 빨간펜·앵커 이동·해결 충돌을 결정론 수렴한다", () => {
    const base = createRedpenOverlayState({
      threadId: "thread-collab",
      anchor: { cutId: "cut-01", u: 0.5, v: 0.5 },
      createdAt: 1_000,
      authorId: EDITOR.id,
    });

    // Peer A: 빨간펜 스트로크 추가 + 핀 이동 + 해결 수락
    const peerA = acceptRedpenAndResolve(
      moveRedpenPinAnchor(
        addRedpenStroke(base, {
          id: "stroke-a",
          authorId: EDITOR.id,
          authorName: EDITOR.name,
          createdAt: 2_000,
          points: [
            { u: 0.2, v: 0.3 },
            { u: 0.4, v: 0.35 },
          ],
        }),
        { x: 420, y: 680 },
        CUT_BASE,
        EDITOR,
        2_100,
      ),
      EDITOR,
      2_200,
    );

    // Peer B: 동시에 다른 빨간펜 스트로크 추가 + 크롭 재투영
    const cropped: CutBoundingBox = { ...CUT_BASE, y: 300, height: 900 };
    const peerB = remapRedpenOverlayForCrop(
      addRedpenStroke(base, {
        id: "stroke-b",
        authorId: ARTIST.id,
        authorName: ARTIST.name,
        createdAt: 2_050,
        points: [
          { u: 0.6, v: 0.7 },
          { u: 0.8, v: 0.8 },
        ],
      }),
      CUT_BASE,
      cropped,
      ARTIST,
      2_150,
    );

    // Peer C: 동시에 스트로크 삭제 + 해결/재열기 이력 기록
    const peerC = recordThreadResolutionTransition(
      recordThreadResolutionTransition(
        removeRedpenStroke(peerA, "stroke-a", ASSISTANT, 2_300),
        "reopen",
        ASSISTANT,
        2_400,
      ),
      "resolve",
      ASSISTANT,
      2_500,
    );

    // 교환법칙: merge(A, B) === merge(B, A)
    const ab = mergeRedpenOverlayStates(peerA, peerB);
    const ba = mergeRedpenOverlayStates(peerB, peerA);
    expect(ab).toEqual(ba);
    // 두 피어의 빨간펜 스트로크가 모두 손실 없이 보존된다
    expect(ab.strokes.map((s) => s.id)).toEqual(["stroke-a", "stroke-b"]);
    expect(ab.anchor.u).toBeGreaterThanOrEqual(0);
    expect(ab.anchor.u).toBeLessThanOrEqual(1);
    expect(ab.anchor.v).toBeGreaterThanOrEqual(0);
    expect(ab.anchor.v).toBeLessThanOrEqual(1);

    // 결합법칙: merge(merge(A, B), C) === merge(A, merge(B, C))
    const abcLeft = mergeRedpenOverlayStates(ab, peerC);
    const abcRight = mergeRedpenOverlayStates(peerA, mergeRedpenOverlayStates(peerB, peerC));
    expect(abcLeft).toEqual(abcRight);
    // stroke-a는 툼스톤으로 제거되고 stroke-b는 보존되며, 감사 로그는 3건 모두 보존된다
    expect(abcLeft.strokes.map((s) => s.id)).toEqual(["stroke-b"]);
    expect(abcLeft.auditLog.map((e) => e.action)).toEqual([
      "accept-and-resolve",
      "reopen",
      "resolve",
    ]);

    // 멱등성: merge(X, X) === X
    expect(mergeRedpenOverlayStates(abcLeft, abcLeft)).toEqual(abcLeft);
  });

  it("동일 리비전·동일 시각 충돌에서도 actor ID 기준 결정론 타이브레이크로 수렴한다", () => {
    const base = createRedpenOverlayState({
      threadId: "thread-tie",
      anchor: { cutId: "cut-01", u: 0.5, v: 0.5 },
      createdAt: 1_000,
      authorId: EDITOR.id,
    });
    const moveA = moveRedpenPinAnchor(base, { x: 200, y: 400 }, CUT_BASE, { id: "actor-a", name: "A" }, 5_000);
    const moveB = moveRedpenPinAnchor(base, { x: 700, y: 1_000 }, CUT_BASE, { id: "actor-b", name: "B" }, 5_000);

    expect(moveA.revision).toBe(moveB.revision);
    expect(moveA.updatedAt).toBe(moveB.updatedAt);

    const ab = mergeRedpenOverlayStates(moveA, moveB);
    const ba = mergeRedpenOverlayStates(moveB, moveA);
    expect(ab).toEqual(ba);
    expect(ab.updatedById).toBe("actor-b");
    expect(ab.anchor).toEqual(moveB.anchor);
  });

  it("서로 다른 스레드 ID 병합 시 명시적으로 오류를 던진다", () => {
    const a = createRedpenOverlayState({
      threadId: "t-1",
      anchor: { cutId: "cut-01", u: 0.5, v: 0.5 },
      createdAt: 1_000,
      authorId: EDITOR.id,
    });
    const b = createRedpenOverlayState({
      threadId: "t-2",
      anchor: { cutId: "cut-01", u: 0.5, v: 0.5 },
      createdAt: 1_000,
      authorId: ARTIST.id,
    });
    expect(() => mergeRedpenOverlayStates(a, b)).toThrow(/서로 다른 스레드/);
  });
});
