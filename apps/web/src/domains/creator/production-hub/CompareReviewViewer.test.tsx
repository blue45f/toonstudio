// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyStudioCommentsDocument } from "../studio-comments";
import { CompareReviewViewer } from "./CompareReviewViewer";
import {
  createEmptyCompareSession,
  poolItemFromExternal,
  type CompareSession,
} from "./compare-review-model";

const IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const STAGE_RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 200,
  bottom: 100,
  width: 200,
  height: 100,
  toJSON: () => ({}),
} as DOMRect;

function externalItem(assetId: string, label: string) {
  return poolItemFromExternal({
    assetId,
    label,
    imageUrl: IMAGE,
    addedBy: "tester",
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

const itemA = externalItem("a", "원본 시안");
const itemB = externalItem("b", "수정 시안");

function twoPaneSession(overrides: Partial<CompareSession> = {}): CompareSession {
  return {
    ...createEmptyCompareSession("episode-1"),
    pool: [itemA, itemB],
    panes: [itemA.source, itemB.source],
    ...overrides,
  };
}

function renderViewer(
  session: CompareSession,
  props: Partial<ComponentProps<typeof CompareReviewViewer>> = {},
) {
  return render(
    <CompareReviewViewer
      session={session}
      onSessionChange={vi.fn()}
      comments={createEmptyStudioCommentsDocument()}
      onCommentsChange={vi.fn()}
      currentActor={{ id: "actor-1", displayName: "검수자" }}
      pinMode={false}
      onPinModeChange={vi.fn()}
      {...props}
    />,
  );
}

describe("CompareReviewViewer 접근성·상호작용 계약", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("핀 모드에서 이미지를 누르면 작성 폼이 열리고 내용 입력란으로 포커스가 이동한다", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(STAGE_RECT);
    renderViewer(twoPaneSession(), { pinMode: true });
    expect(screen.queryByTestId("crv-pin-composer")).toBeNull();

    fireEvent.click(screen.getByAltText("원본 시안"));

    expect(screen.getByTestId("crv-pin-composer")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: /핀 내용|Pin note/u }));
  });

  it("핀 모드가 아니면 이미지를 눌러도 작성 폼이 열리지 않는다", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(STAGE_RECT);
    renderViewer(twoPaneSession(), { pinMode: false });

    fireEvent.click(screen.getByAltText("원본 시안"));

    expect(screen.queryByTestId("crv-pin-composer")).toBeNull();
  });

  it("페인 안의 컨트롤에 키보드 포커스가 들어가면 그 페인이 확대·축소 대상이 된다", () => {
    renderViewer(twoPaneSession({ syncView: false }));
    const zoomValue = screen.getByTestId("crv-zoomval");
    const [selectA, selectB] = screen.getAllByRole("combobox", {
      name: /이 페인에 표시할 소스|Source for this pane/u,
    });
    expect(zoomValue.textContent).toBe("100%");

    // 기본 대상은 첫 페인이다.
    fireEvent.click(screen.getByRole("button", { name: /^(확대|Zoom in)$/u }));
    expect(zoomValue.textContent).toBe("125%");

    // 두 번째 페인의 소스 선택기로 포커스가 옮겨 가면 대상도 옮겨 간다(마우스 없이도 같은 결과).
    fireEvent.focusIn(selectB);
    expect(zoomValue.textContent).toBe("100%");
    fireEvent.focusIn(selectA);
    expect(zoomValue.textContent).toBe("125%");
  });

  it("페인을 포인터로 누르면 그 페인이 확대·축소 대상이 된다", () => {
    renderViewer(twoPaneSession({ syncView: false }));
    const zoomValue = screen.getByTestId("crv-zoomval");
    fireEvent.click(screen.getByRole("button", { name: /^(확대|Zoom in)$/u }));
    expect(zoomValue.textContent).toBe("125%");

    fireEvent.pointerDown(screen.getByLabelText(/비교 페인 2|Compare pane 2/u));

    expect(zoomValue.textContent).toBe("100%");
  });

  it("슬라이더 모드에서 무대를 누르면 누른 위치로 슬라이더가 이동한다", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(STAGE_RECT);
    renderViewer(twoPaneSession({ mode: "slider" }));
    const handle = screen.getByRole("slider", { name: /이전·이후 비교 슬라이더|Before-after compare slider/u });
    expect(handle.getAttribute("aria-valuenow")).toBe("50");

    // 무대 요소가 슬라이더 훅에 연결돼 있어야 누른 좌표(50/200)가 25%로 환산된다.
    fireEvent.pointerDown(screen.getByTestId("crv-stage-slider"), { clientX: 50, pointerId: 1 });

    expect(handle.getAttribute("aria-valuenow")).toBe("25");
  });
});
