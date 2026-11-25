// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createRef, type Ref } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { createStudioLiveTransformDraftStore } from "../studio-live-transform-draft-store";
import {
  renderStudioCanvasSelectionDecorations,
  type StudioCanvasSelectionDecorationsContext,
} from "./StudioCanvasSelectionDecorations";

import type Konva from "konva";

vi.mock("react-konva/lib/ReactKonvaCore", () => ({
  Group: () => null,
  Rect: () => null,
  Text: () => null,
  Transformer: ({ ref, keepRatio }: { ref: Ref<HTMLDivElement>; keepRatio: boolean }) => (
    <div ref={ref} data-testid="transformer" data-keep-ratio={keepRatio} />
  ),
}));
vi.mock("../studio-page-lazy-ui", () => ({ StudioDrawSelectionOverlay: () => null }));

afterEach(cleanup);

it("그리기와 손 도구에서는 단일 객체 핸들을 떼고 선택으로 돌아오면 글자 핸들을 다시 붙인다", () => {
  const trRef = createRef<Konva.Transformer>();
  const selected = {
    id: "text", type: "text" as const, text: "대사",
    x: 12, y: 24, width: 80, fontSize: 20, fill: "#000", rotation: 0,
  };
  const context: StudioCanvasSelectionDecorationsContext = {
    activeGroupId: null,
    activeSurfaceReviewLocked: false,
    beginCanvasSelectionResize: () => false,
    cancelCanvasSelectionResize: vi.fn(),
    canvasSelectionResizeCancelSignal: 0,
    canvasH: 400,
    canvasSelectionEls: [selected],
    commitCanvasSelectionResize: () => false,
    completeSelectionGroup: null,
    effScale: 1,
    elements: [selected],
    groupResizeEnabled: false,
    groups: [],
    hasCoarsePointer: false,
    isExporting: false,
    isMobile: false,
    marqueeIds: [],
    multiSelectionBounds: null,
    selected,
    selectionLockState: "unlocked",
    selectionRotatable: true,
    singleDrawFreeScale: false,
    singleObjectDragLayerRef: createRef<Konva.Layer>(),
    liveTransformDraftStore: createStudioLiveTransformDraftStore(),
    liveTransformDraftScope: "page",
    tool: "select",
    trRef,
  };
  const view = render(renderStudioCanvasSelectionDecorations(context));
  expect(trRef.current).toBe(view.getByTestId("transformer"));
  for (const tool of ["draw", "hand"] as const) {
    view.rerender(renderStudioCanvasSelectionDecorations({ ...context, tool }));
    expect(view.queryByTestId("transformer")).toBeNull();
    expect(trRef.current).toBeNull();
  }
  view.rerender(renderStudioCanvasSelectionDecorations(context));
  expect(trRef.current).toBe(view.getByTestId("transformer"));
  expect(view.getByTestId("transformer").getAttribute("data-keep-ratio")).toBe("true");
});
