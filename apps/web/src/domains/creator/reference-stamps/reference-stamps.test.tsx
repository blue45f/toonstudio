// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildHandPoseStampSvg,
  filterHandPoseStamps,
  HAND_POSE_WIREFRAME_STAMPS,
} from "./hand-pose-stamps-catalog";
import { StudioReferenceStampsWidget } from "./StudioReferenceStampsWidget";
import {
  buildTurnaroundSheetSvg,
  computeTurnaroundGuideLines,
  TURNAROUND_HEAD_RATIOS,
} from "./turnaround-sheet-svg";
import { StudioReferenceCanvasCard } from "../StudioReferenceCanvasCard";

describe("turnaround-sheet-svg: 캐릭터 4방향 턴어라운드 비율 시트", () => {
  it("6~8등신 선택에 따라 눈·턱·어깨·허리·무릎 기준선이 위에서 아래로 단조 증가한다", () => {
    for (const ratio of TURNAROUND_HEAD_RATIOS) {
      const guides = computeTurnaroundGuideLines(ratio);
      const ids = guides.map((line) => line.id);
      expect(ids).toEqual([
        "crown",
        "eyes",
        "chin",
        "shoulders",
        "waist",
        "pelvis",
        "knees",
        "ankles",
      ]);

      for (let i = 1; i < guides.length; i += 1) {
        expect(guides[i]!.yPx).toBeGreaterThan(guides[i - 1]!.yPx);
      }

      const sheet = buildTurnaroundSheetSvg({ headRatio: ratio });
      expect(sheet.svg).toContain('data-turnaround-view="front"');
      expect(sheet.svg).toContain('data-turnaround-view="three-quarter"');
      expect(sheet.svg).toContain('data-turnaround-view="side"');
      expect(sheet.svg).toContain('data-turnaround-view="back"');
      expect(sheet.svg).toContain("눈 (0.5H)");
      expect(sheet.svg).toContain("턱 (1H)");
      expect(sheet.svg).toContain("어깨");
      expect(sheet.svg).toContain("허리");
      expect(sheet.svg).toContain("무릎");
      expect(sheet.dataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    }
  });
});

describe("hand-pose-stamps-catalog: 웹툰 빈출 손 포즈 24종 스탬프", () => {
  it("정확히 24종의 고유 ID 손 포즈를 제공하며 필수 8종을 모두 포함한다", () => {
    expect(HAND_POSE_WIREFRAME_STAMPS).toHaveLength(24);
    const uniqueIds = new Set(HAND_POSE_WIREFRAME_STAMPS.map((stamp) => stamp.id));
    expect(uniqueIds.size).toBe(24);

    const names = HAND_POSE_WIREFRAME_STAMPS.map((stamp) => stamp.nameKo);
    for (const required of ["주먹", "펼침", "가리킴", "브이", "펜잡기", "검잡기", "기도", "턱괴기"]) {
      expect(names).toContain(required);
    }
  });

  it("모든 24종 스탬프가 유효한 벡터 SVG와 좌우 반전 변환을 생성한다", () => {
    for (const stamp of HAND_POSE_WIREFRAME_STAMPS) {
      const normal = buildHandPoseStampSvg(stamp);
      expect(normal.svg).toContain(`data-hand-pose-stamp="${stamp.id}"`);
      expect(normal.svg).toContain('data-finger="thumb"');
      expect(normal.svg).toContain('data-finger="index"');
      expect(normal.svg).toContain('data-finger="little"');
      expect(normal.dataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);

      const flipped = buildHandPoseStampSvg(stamp, { flipHorizontal: true });
      expect(flipped.flipped).toBe(true);
      expect(flipped.svg).toContain("scale(-1 1)");
    }
  });

  it("카테고리 및 한글 검색어로 손 포즈 스탬프를 정확히 필터링한다", () => {
    expect(filterHandPoseStamps("all", "").length).toBe(24);
    expect(filterHandPoseStamps("all", "검잡기").map((s) => s.id)).toEqual(["sword-grip"]);
    expect(filterHandPoseStamps("portrait", "턱").map((s) => s.id)).toEqual(["chin-rest"]);
  });
});

describe("StudioReferenceStampsWidget & StudioReferenceCanvasCard 통합", () => {
  afterEach(() => cleanup());

  it("등신 전환, 손 포즈 24종 탭 전환·검색·좌우 반전 및 밑그림 삽입 콜백이 동작한다", () => {
    const onInsertStamp = vi.fn();
    render(<StudioReferenceStampsWidget onInsertStamp={onInsertStamp} />);

    // 8등신 전환 후 시트 삽입
    const ratio8Button = screen.getByRole("button", { name: "8등신" });
    expect(ratio8Button.className).toContain("min-h-11");
    fireEvent.click(ratio8Button);
    expect(ratio8Button.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /밑그림 스탬프 삽입/ }));
    expect(onInsertStamp).toHaveBeenCalledTimes(1);
    expect(onInsertStamp.mock.calls[0]?.[0]).toMatchObject({
      kind: "turnaround-sheet",
      id: "turnaround-8h-blueprint",
    });

    // 손 포즈 24종 탭 전환
    fireEvent.click(screen.getByRole("tab", { name: /손 포즈 24종/ }));
    const listbox = screen.getByRole("listbox", { name: "손 포즈 밑그림 목록" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(24);

    // 검색 후 '기도' 선택 + 좌우 반전 + 삽입
    fireEvent.change(screen.getByLabelText("손 포즈 스탬프 검색"), { target: { value: "기도" } });
    const filteredOptions = within(listbox).getAllByRole("option");
    expect(filteredOptions).toHaveLength(1);
    fireEvent.click(filteredOptions[0]!);

    fireEvent.click(screen.getByRole("button", { name: /좌우 반전/ }));
    fireEvent.click(screen.getByRole("button", { name: /손 스탬프 삽입/ }));
    expect(onInsertStamp).toHaveBeenCalledTimes(2);
    expect(onInsertStamp.mock.calls[1]?.[0]).toMatchObject({
      kind: "hand-pose-stamp",
      id: "prayer-flipped",
      nameKo: "기도 손 포즈 스탬프",
    });
  });

  it("기존 StudioReferenceCanvasCard 안에서 접이식 섹션으로 턴어라운드·손 포즈 위젯에 접근할 수 있다", () => {
    const onInsertReferenceStamp = vi.fn();
    const { container } = render(
      <StudioReferenceCanvasCard
        itemCount={2}
        onOpenCanvas={vi.fn()}
        onOpenWindow={vi.fn()}
        onInsertReferenceStamp={onInsertReferenceStamp}
      />,
    );

    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(screen.getByText("턴어라운드 · 손 포즈 24종 스탬프")).toBeDefined();
    if (details) details.open = true;

    expect(screen.getByTestId("studio-reference-stamps-widget")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /밑그림 스탬프 삽입/ }));
    expect(onInsertReferenceStamp).toHaveBeenCalledOnce();
  });
});
