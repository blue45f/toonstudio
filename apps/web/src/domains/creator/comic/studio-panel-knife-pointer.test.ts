// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PANEL_KNIFE_MAX_GUTTER_PX,
  PANEL_KNIFE_MIN_GUTTER_PX,
  beginPanelKnifePointerSession,
  cancelPanelKnifePointerSession,
  clampPanelKnifeGutter,
  commitPanelKnifePointerSession,
  computeElementPolygonOverlapRatio,
  frameElToComicPanelPolygon,
  ownsPanelKnifePointer,
  planDiagonalAnglePanelSplit,
  updatePanelKnifePointerSession,
} from "./studio-panel-knife-pointer";
import { StudioComicEffectV2Drawer } from "./StudioComicEffectV2Drawer";
import { StudioPanelKnifeControlSection } from "./StudioPanelKnifeControlSection";
import { createFrameFolderGroupForNewFrame } from "../studio-frame-folder";
import { hasContiguousLayerGroups, missingLayerGroupIds, type LayerGroup } from "../studio-layers";

import type { DrawEl, El } from "../studio-element-model";

type FrameElWithMeta = Extract<El, { type: "frame" }>;
type ImageElWithMeta = Extract<El, { type: "image" }>;

afterEach(() => {
  cleanup();
});

function makeFrame(overrides: Partial<FrameElWithMeta> = {}): FrameElWithMeta {
  return {
    id: "frame-1",
    type: "frame",
    name: "주인공 컷",
    x: 40,
    y: 60,
    width: 400,
    height: 300,
    stroke: "#16100c",
    strokeWidth: 3,
    bgColor: "#ffffff",
    ...overrides,
  };
}

function makeImage(id: string, x: number, y: number, width: number, height: number, extra: Partial<ImageElWithMeta> = {}): El {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,AA==",
    x,
    y,
    width,
    height,
    rotation: 0,
    ...extra,
  } as El;
}

function makeStroke(id: string, points: number[], extra: Partial<DrawEl> = {}): El {
  return {
    id,
    type: "draw",
    points,
    stroke: "#16100c",
    strokeWidth: 2,
    ...extra,
  } as El;
}

describe("studio-panel-knife-pointer 순수 포인터 세션 및 재할당 코어", () => {
  it("거터 폭을 24~96px 범위로 정규화하고 비정상 입력은 기본 24px로 보정한다", () => {
    expect(clampPanelKnifeGutter(Number.NaN)).toBe(PANEL_KNIFE_MIN_GUTTER_PX);
    expect(clampPanelKnifeGutter(0)).toBe(PANEL_KNIFE_MIN_GUTTER_PX);
    expect(clampPanelKnifeGutter(12)).toBe(PANEL_KNIFE_MIN_GUTTER_PX);
    expect(clampPanelKnifeGutter(36)).toBe(36);
    expect(clampPanelKnifeGutter(200)).toBe(PANEL_KNIFE_MAX_GUTTER_PX);
  });

  it("직선·사선 드래그로 실시간 미리보기·거터 적용·요소 겹침(>=0.5) 재할당·컷 폴더 분할을 완료한다", () => {
    const frame = makeFrame();
    const sourceFolder = createFrameFolderGroupForNewFrame({
      frameLabel: "주인공 컷",
      groupId: "folder-orig",
    })!;
    const topElement = makeImage("el-top", 80, 80, 120, 80, {
      frameClipId: frame.id,
      groupId: sourceFolder.id,
      noClip: true,
    });
    const bottomElement = makeImage("el-bottom", 240, 240, 140, 90, {
      frameClipId: frame.id,
      groupId: sourceFolder.id,
      noClip: false,
    });
    // 칼선 중앙(y=210)을 양쪽으로 걸치는 요소 -> 상/하 겹침 각 0.5 미만(거터 36px 때문) -> 미배정 처리
    const straddleElement = makeImage("el-straddle", 180, 170, 80, 80, {
      frameClipId: frame.id,
      groupId: sourceFolder.id,
    });
    const looseStrokeInBottom = makeStroke("stroke-bottom", [100, 310, 340, 310]);
    const elements: El[] = [frame, topElement, bottomElement, straddleElement, looseStrokeInBottom];
    const groups: LayerGroup[] = [sourceFolder];

    const started = beginPanelKnifePointerSession({
      targetFrame: frame,
      start: { x: 20, y: 150 },
      pointerId: 7,
      gutterPx: 36,
      elements,
      groups,
    });
    expect(started.phase).toBe("dragging");
    expect(started.preview.valid).toBe(false);
    expect(started.preview.rejectReason).toBe("drag-too-short");
    expect(ownsPanelKnifePointer(started, { pointerId: 7 })).toBe(true);
    expect(ownsPanelKnifePointer(started, { pointerId: 9 })).toBe(false);

    const moved = updatePanelKnifePointerSession(started, {
      point: { x: 460, y: 270 },
      elements,
      groups,
    });
    expect(moved.preview.valid).toBe(true);
    expect(moved.preview.gutterPx).toBe(36);
    expect(moved.preview.previewFrames).toHaveLength(2);
    expect(moved.preview.previewSvgPaths?.[0]).toMatch(/^M .* Z$/);
    expect(moved.preview.previewSvgPaths?.[1]).toMatch(/^M .* Z$/);
    expect(moved.preview.assignedCountA).toBe(1);
    expect(moved.preview.assignedCountB).toBe(2);
    expect(moved.preview.unassignedCount).toBe(1);

    const committed = commitPanelKnifePointerSession(moved, {
      elements,
      groups,
      makeFrameIds: () => ["cut-a", "cut-b"],
      makeFolderIds: () => ["folder-a", "folder-b"],
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    const { result } = committed;
    expect(result.frames.map((item) => item.id)).toEqual(["cut-a", "cut-b"]);
    expect(result.frames[0].points?.length).toBeGreaterThanOrEqual(6);
    expect(result.frames[1].points?.length).toBeGreaterThanOrEqual(6);
    expect(result.sharedGutter).not.toBeNull();
    expect(result.sharedGutter?.axis).toBe("d");
    expect(result.sharedGutter?.gap).toBeCloseTo(36, 0);

    // 원본 컷 폴더는 제거되고 두 컷 전용 폴더가 생성되며 레이어 그룹 연속성 불변식이 유지된다.
    expect(result.groups.some((g) => g.id === sourceFolder.id)).toBe(false);
    expect(result.createdFolders.map((g) => g.id)).toEqual(["folder-a", "folder-b"]);
    expect(result.createdFolders.map((g) => g.name)).toEqual([
      "컷 폴더 · 주인공 컷-1",
      "컷 폴더 · 주인공 컷-2",
    ]);
    expect(hasContiguousLayerGroups(result.elements)).toBe(true);
    expect(missingLayerGroupIds(result.elements, result.groups)).toEqual([]);

    const byId = new Map(result.elements.map((el) => [el.id, el]));
    expect(byId.get("el-top")?.frameClipId).toBe("cut-a");
    expect(byId.get("el-top")?.groupId).toBe("folder-a");
    expect(byId.get("el-top")?.noClip).toBe(false);
    expect(byId.get("el-bottom")?.frameClipId).toBe("cut-b");
    expect(byId.get("el-bottom")?.groupId).toBe("folder-b");
    expect(byId.get("stroke-bottom")?.frameClipId).toBe("cut-b");
    expect(byId.get("stroke-bottom")?.groupId).toBe("folder-b");
    // 경계에 걸친 요소는 깨진 frameClipId로 사라지지 않도록 클립과 삭제된 폴더 참조를 해제한다.
    expect(byId.get("el-straddle")?.frameClipId).toBeUndefined();
    expect(byId.get("el-straddle")?.groupId).toBeUndefined();
  });

  it("Shift 또는 15° 각도 맞춤 시 절단선을 15° 배수로 스냅한다", () => {
    const frame = makeFrame();
    const session = beginPanelKnifePointerSession({
      targetFrame: frame,
      start: { x: 40, y: 200 },
      gutterPx: 24,
    });
    const moved = updatePanelKnifePointerSession(session, {
      point: { x: 440, y: 315 }, // 약 16° -> 15°로 스냅
      shiftKey: true,
    });
    expect(moved.preview.snapped).toBe(true);
    expect(moved.preview.angleDeg).toBeCloseTo(15, 0);
    expect(moved.preview.valid).toBe(true);
  });

  it("최소 변 24px 미만, 최소 면적 900px² 미만, 교차 없음, 잠긴 컷, 취소를 정확히 거부한다", () => {
    const frame = makeFrame({ width: 200, height: 120, x: 0, y: 0 });

    // 1) 최소 변(24px) 미만: y=30에서 거터 24px로 자르면 상단 높이가 18px < 24px
    const thinSession = updatePanelKnifePointerSession(
      beginPanelKnifePointerSession({ targetFrame: frame, start: { x: -10, y: 30 }, gutterPx: 24 }),
      { point: { x: 210, y: 30 } },
    );
    expect(thinSession.preview.valid).toBe(false);
    expect(thinSession.preview.rejectReason).toBe("side-too-small");

    // 2) 최소 면적(900px²) 미만: 34x34 직각삼각형(폭·높이 34 >= 24, 면적 578 < 900)
    const smallCornerFrame = makeFrame({ x: 0, y: 0, width: 200, height: 200 });
    // 선 x + y = 50 + 12*sqrt(2) ≈ 66.97 => 좌상단 삼각형 변 길이 ≈ 50 -> 면적 1250; x + y = 52 => 변 ≈ 35, 높이 ≈ 24.75, 면적 ≈ 612 < 900
    const tinyAreaSession = updatePanelKnifePointerSession(
      beginPanelKnifePointerSession({
        targetFrame: smallCornerFrame,
        start: { x: 0, y: 52 },
        gutterPx: 24,
      }),
      { point: { x: 52, y: 0 } },
    );
    expect(tinyAreaSession.preview.valid).toBe(false);
    expect(tinyAreaSession.preview.rejectReason).toBe("area-too-small");

    // 3) 컷 외부 칼선 -> no-intersection
    const missSession = updatePanelKnifePointerSession(
      beginPanelKnifePointerSession({ targetFrame: frame, start: { x: 0, y: 300 }, gutterPx: 24 }),
      { point: { x: 200, y: 300 } },
    );
    expect(missSession.preview.valid).toBe(false);
    expect(missSession.preview.rejectReason).toBe("no-intersection");

    // 4) 잠긴 컷 거부
    const lockedSession = beginPanelKnifePointerSession({
      targetFrame: makeFrame({ locked: true }),
      start: { x: 0, y: 150 },
      gutterPx: 24,
    });
    expect(lockedSession.preview.rejectReason).toBe("frame-locked");

    // 5) 취소된 세션은 커밋 불가
    const cancelled = cancelPanelKnifePointerSession(thinSession);
    expect(cancelled.phase).toBe("cancelled");
    const outcome = commitPanelKnifePointerSession(cancelled);
    expect(outcome.ok).toBe(false);
  });

  it("splitFrameDiagonal 기반 사선 각도 분할과 다각형 컷 재분할이 모두 동작한다", () => {
    const rectFrame = makeFrame();
    const firstSplit = planDiagonalAnglePanelSplit({
      targetFrame: rectFrame,
      angleDeg: 20,
      offsetRatio: 0.5,
      gutterPx: 32,
      makeFrameIds: () => ["diag-1", "diag-2"],
    });
    expect(firstSplit.ok).toBe(true);
    if (!firstSplit.ok) return;

    expect(firstSplit.result.frames[0].id).toBe("diag-1");
    expect(firstSplit.result.frames[1].id).toBe("diag-2");
    expect(firstSplit.result.frames[0].points?.length).toBeGreaterThanOrEqual(6);
    expect(firstSplit.preview.previewSvgPaths?.[0]).toMatch(/^M .* Z$/);

    // 이미 사선으로 분할된 다각형 컷을 다시 분할한다.
    const secondSplit = planDiagonalAnglePanelSplit({
      targetFrame: firstSplit.result.frames[1],
      angleDeg: -15,
      offsetRatio: 0.5,
      gutterPx: 24,
    });
    expect(secondSplit.ok).toBe(true);
    if (!secondSplit.ok) return;
    expect(secondSplit.result.frames).toHaveLength(2);

    const polyA = frameElToComicPanelPolygon(secondSplit.result.frames[0]).points;
    const probeInside = makeImage(
      "probe",
      secondSplit.result.frames[0].x + secondSplit.result.frames[0].width * 0.45,
      secondSplit.result.frames[0].y + secondSplit.result.frames[0].height * 0.45,
      10,
      10,
    );
    expect(computeElementPolygonOverlapRatio(probeInside, polyA)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("StudioPanelKnifeControlSection 및 StudioComicEffectV2Drawer UI 배선", () => {
  it("StudioPanelKnifeControlSection에서 프리셋·드래그·여백 조절 후 분할 콜백을 호출한다", () => {
    const frame = makeFrame();
    const onReplaceSplitFrames = vi.fn();
    const onCommitKnifeSplit = vi.fn();

    render(
      createElement(StudioPanelKnifeControlSection, {
        frame,
        panelGutter: 12, // 24px 하한으로 정규화되어야 함
        panelSplitRatio: 50,
        elements: [frame, makeImage("img-a", 80, 80, 100, 80)],
        onReplaceSplitFrames,
        onCommitKnifeSplit,
      }),
    );

    expect(screen.getByText("여백 24px")).toBeTruthy();

    // 거터 프리셋 48px 선택
    fireEvent.click(screen.getByRole("button", { name: "48px" }));
    expect(screen.getByText("여백 48px")).toBeTruthy();

    // 사선 각도 -30° 선택 후 적용
    fireEvent.click(screen.getByRole("button", { name: "-30°" }));
    fireEvent.click(screen.getByRole("button", { name: "이 선으로 컷 나누기" }));

    expect(onReplaceSplitFrames).toHaveBeenCalledTimes(1);
    expect(onCommitKnifeSplit).toHaveBeenCalledTimes(1);
    const commitArg = onCommitKnifeSplit.mock.calls[0]?.[0] as { gutterPx: number; angleDeg: number };
    expect(commitArg.gutterPx).toBe(48);
    expect(commitArg.angleDeg).toBe(-30);

    // SVG 미리보기 위 직접 포인터 드래그(직선 수평 칼선) -> 커밋까지 확인
    const pad = screen.getByRole("application", { name: "사선 컷 분할 미리보기 영역" });
    vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 512,
      height: 412,
      right: 512,
      bottom: 412,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(pad, { pointerId: 3, clientX: 20, clientY: 206 });
    fireEvent.pointerMove(pad, { pointerId: 3, clientX: 492, clientY: 206 });
    fireEvent.pointerUp(pad, { pointerId: 3, clientX: 492, clientY: 206 });
    fireEvent.click(screen.getByRole("button", { name: "이 선으로 컷 나누기" }));

    expect(onCommitKnifeSplit).toHaveBeenCalledTimes(2);
    const dragCommit = onCommitKnifeSplit.mock.calls[1]?.[0] as {
      frames: readonly [FrameElWithMeta, FrameElWithMeta];
      sharedGutter: { axis: string } | null;
    };
    expect(dragCommit.frames[0].points).toBeUndefined();
    expect(dragCommit.frames[1].points).toBeUndefined();
    expect(dragCommit.sharedGutter?.axis).toBe("h");
  });

  it("StudioComicEffectV2Drawer에서 지연 로드 컷 나이프와 만화 연출 툴킷을 마운트한다", async () => {
    const frame = makeFrame();
    const onPatch = vi.fn();
    const onReplaceSplitFrames = vi.fn();

    const { container } = render(
      createElement(StudioComicEffectV2Drawer, {
        selected: frame,
        panelGutter: 24,
        panelSplitRatio: 50,
        onPatch,
        onReplaceSplitFrames,
      }),
    );

    const detailsList = container.querySelectorAll("details");
    expect(detailsList.length).toBeGreaterThanOrEqual(3);

    // 1) 사선·다각형 컷 나이프 드로어 열기 -> 지연 로드된 컨트롤 섹션 마운트 확인
    const knifeDetails = detailsList[0]!;
    knifeDetails.open = true;
    fireEvent(knifeDetails, new Event("toggle"));
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "이 선으로 컷 나누기" })).toBeTruthy();
      },
      { timeout: 5000 },
    );

    // 2) 만화 연출 툴킷 드로어 열기 -> 지연 로드된 MangaToolkitPanel 마운트 확인
    const toolkitDetails = detailsList[detailsList.length - 1]!;
    toolkitDetails.open = true;
    fireEvent(toolkitDetails, new Event("toggle"));
    await waitFor(
      () => {
        expect(screen.getByRole("tab", { name: "프레임 분할" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "말풍선" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "효과선" })).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });
});
