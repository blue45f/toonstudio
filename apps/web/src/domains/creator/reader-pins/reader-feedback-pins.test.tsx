// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createReaderFeedbackPin,
  exportReaderFeedbackPinsJson,
  filterReaderFeedbackPins,
  mergeReaderFeedbackPins,
  parseReaderFeedbackPinsJson,
  resolveReaderFeedbackPinJumpTarget,
  summarizeReaderFeedbackPins,
  updateReaderFeedbackPinStatus,
} from "./reader-feedback-pins-model";
import { StudioReaderFeedbackPinsWidget } from "./StudioReaderFeedbackPinsWidget";
import {
  StudioScrollPreviewPanel,
  type ScrollPreviewPage,
  type StudioScrollPreviewPanelProps,
} from "../StudioScrollPreviewPanel";

vi.mock("../StudioPageThumbnails", () => ({
  StudioPageThumbnail: ({ page }: { page: ScrollPreviewPage }) => (
    <div data-page-thumbnail={page.id} />
  ),
}));

function makePreviewPage(id: string, name: string): ScrollPreviewPage {
  return {
    id,
    name,
    elements: [{ id: `f-${id}`, type: "frame", y: 60, height: 480 }],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1_280,
  };
}

describe("reader-feedback-pins-model: 핀 수집·필터·JSON 공유/병합·컷 점프 엔진", () => {
  it("좌표를 0~1로 클램핑하고 4종 카테고리·상태 전환·집계를 계산한다", () => {
    const p1 = createReaderFeedbackPin({
      id: "pin-1",
      pageId: "page-1",
      cutIndex: 2,
      x: 1.4,
      y: -0.2,
      category: "typo",
      authorRole: "reader",
      comment: "대사 오탈자 수정",
      nowIso: "2026-11-22T01:00:00.000Z",
    });
    expect(p1.x).toBe(1);
    expect(p1.y).toBe(0);
    expect(p1.status).toBe("open");

    const p2 = createReaderFeedbackPin({
      id: "pin-2",
      pageId: "page-2",
      cutIndex: 5,
      x: 0.42,
      y: 0.68,
      category: "art-fix",
      authorRole: "assistant",
      comment: "손가락 6개 작화 수정 필요",
      nowIso: "2026-11-22T01:05:00.000Z",
    });

    const updated = updateReaderFeedbackPinStatus(
      [p1, p2],
      "pin-1",
      "resolved",
      "2026-11-22T02:00:00.000Z",
    );
    const summary = summarizeReaderFeedbackPins(updated);
    expect(summary).toEqual({
      total: 2,
      openCount: 1,
      resolvedCount: 1,
      byCategory: { typo: 1, "art-fix": 1, balloon: 0, direction: 0 },
    });

    expect(filterReaderFeedbackPins(updated, { category: "art-fix", status: "open" })).toHaveLength(
      1,
    );
    expect(resolveReaderFeedbackPinJumpTarget(p2)).toEqual({
      pinId: "pin-2",
      pageId: "page-2",
      cutIndex: 5,
      x: 0.42,
      y: 0.68,
      xPercent: 42,
      yPercent: 68,
    });
  });

  it("JSON 공유 내보내기·파싱 및 결정적 병합(신규 추가·최신 갱신·지문 중복 제외)을 수행한다", () => {
    const existing = [
      createReaderFeedbackPin({
        id: "pin-a",
        pageId: "p1",
        cutIndex: 1,
        x: 0.25,
        y: 0.35,
        category: "typo",
        comment: "조사 수정",
        nowIso: "2026-11-22T01:00:00.000Z",
      }),
      createReaderFeedbackPin({
        id: "pin-b",
        pageId: "p1",
        cutIndex: 3,
        x: 0.5,
        y: 0.5,
        category: "balloon",
        comment: "말풍선 꼬리 방향 확인",
        nowIso: "2026-11-22T01:00:00.000Z",
      }),
    ];

    const incoming = [
      // pin-a의 최신 해결 상태 -> 갱신
      {
        ...existing[0]!,
        status: "resolved" as const,
        updatedAt: "2026-11-22T03:00:00.000Z",
      },
      // 다른 ID이지만 동일 위치·분류·내용 -> 중복 제외
      createReaderFeedbackPin({
        id: "pin-b-dup",
        pageId: "p1",
        cutIndex: 3,
        x: 0.501,
        y: 0.499,
        category: "balloon",
        comment: "말풍선 꼬리 방향 확인",
        nowIso: "2026-11-22T02:00:00.000Z",
      }),
      // 완전 신규 핀 -> 추가
      createReaderFeedbackPin({
        id: "pin-c",
        pageId: "p2",
        cutIndex: 4,
        x: 0.72,
        y: 0.22,
        category: "direction",
        comment: "컷 여백 조금 더 넓히면 임팩트 상승",
        nowIso: "2026-11-22T02:30:00.000Z",
      }),
    ];

    const json = exportReaderFeedbackPinsJson(incoming, { episodeLabel: "12화 검수" });
    const parsed = parseReaderFeedbackPinsJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.episodeLabel).toBe("12화 검수");

    const merged = mergeReaderFeedbackPins(existing, parsed.pins);
    expect(merged.addedCount).toBe(1);
    expect(merged.updatedCount).toBe(1);
    expect(merged.skippedDuplicateCount).toBe(1);
    expect(merged.merged).toHaveLength(3);
    expect(merged.merged.find((pin) => pin.id === "pin-a")?.status).toBe("resolved");
  });

  it("깨진 JSON이나 잘못된 카테고리/좌표는 한글 오류와 함께 거부한다", () => {
    expect(parseReaderFeedbackPinsJson("{invalid").ok).toBe(false);
    const badCategory = parseReaderFeedbackPinsJson(
      JSON.stringify([{ pageId: "p1", x: 0.5, y: 0.5, category: "unknown", comment: "오류" }]),
    );
    expect(badCategory.ok).toBe(false);
    if (!badCategory.ok) {
      expect(badCategory.errorKo).toContain("분류");
    }
  });
});

describe("StudioReaderFeedbackPinsWidget & StudioScrollPreviewPanel 통합", () => {
  afterEach(() => cleanup());

  it("핀 추가, 해결 토글, 컷 위치 점프, JSON 병합이 위젯에서 동작한다", () => {
    const onJumpToPin = vi.fn();
    let currentPins = [
      createReaderFeedbackPin({
        id: "pin-seed",
        pageId: "p1",
        cutIndex: 1,
        x: 0.3,
        y: 0.4,
        category: "typo",
        comment: "초기 오탈자",
        nowIso: "2026-11-22T01:00:00.000Z",
      }),
    ];
    const onChangePins = vi.fn((next) => {
      currentPins = [...next];
    });

    const { rerender } = render(
      <StudioReaderFeedbackPinsWidget
        pages={[
          { id: "p1", label: "1페이지" },
          { id: "p2", label: "2페이지" },
        ]}
        currentPageId="p1"
        pins={currentPins}
        onChangePins={onChangePins}
        onJumpToPin={onJumpToPin}
      />,
    );

    // 원클릭 컷 점프
    const jumpButton = screen.getByRole("button", { name: /컷 위치 점프/ });
    expect(jumpButton.className).toContain("min-h-11");
    fireEvent.click(jumpButton);
    expect(onJumpToPin).toHaveBeenCalledWith({
      pinId: "pin-seed",
      pageId: "p1",
      cutIndex: 1,
      x: 0.3,
      y: 0.4,
      xPercent: 30,
      yPercent: 40,
    });

    // 새 작화수정 핀 추가
    fireEvent.change(screen.getByLabelText("피드백 카테고리"), { target: { value: "art-fix" } });
    fireEvent.change(screen.getByPlaceholderText(/말풍선 대사/), {
      target: { value: "어깨 선 보정 필요" },
    });
    fireEvent.click(screen.getByRole("button", { name: /피드백 핀 추가/ }));
    expect(onChangePins).toHaveBeenCalledTimes(1);
    expect(currentPins).toHaveLength(2);

    rerender(
      <StudioReaderFeedbackPinsWidget
        pages={[
          { id: "p1", label: "1페이지" },
          { id: "p2", label: "2페이지" },
        ]}
        currentPageId="p1"
        pins={currentPins}
        onChangePins={onChangePins}
        onJumpToPin={onJumpToPin}
      />,
    );

    // JSON 공유·병합 서랍 열어 외부 핀 병합
    fireEvent.click(screen.getByRole("button", { name: /JSON 공유·병합/ }));
    const externalJson = exportReaderFeedbackPinsJson([
      createReaderFeedbackPin({
        id: "pin-ext-1",
        pageId: "p2",
        cutIndex: 4,
        x: 0.65,
        y: 0.75,
        category: "direction",
        authorRole: "reader",
        comment: "컷 전환 속도 아주 좋아요",
        nowIso: "2026-11-22T02:00:00.000Z",
      }),
    ]);
    fireEvent.change(screen.getByLabelText("병합할 피드백 핀 JSON 입력"), {
      target: { value: externalJson },
    });
    fireEvent.click(screen.getByRole("button", { name: /JSON 병합 적용/ }));
    expect(currentPins).toHaveLength(3);
  });

  it("StudioScrollPreviewPanel에서 피드백 핀 패널 토글·오버레이 클릭·컷 점프 콜백이 동작한다", () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const onJumpToFeedbackPin = vi.fn();
    const onSelectPage = vi.fn();
    const onOpenFeedbackPin = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const onClose = vi.fn();

    render(
      <StudioScrollPreviewPanel
        open
        onClose={onClose}
        pages={[makePreviewPage("p1", "1페이지"), makePreviewPage("p2", "2페이지")]}
        currentPageId="p1"
        onSelectPage={onSelectPage}
        onJumpToFeedbackPin={onJumpToFeedbackPin}
        onOpenFeedbackPin={onOpenFeedbackPin}
        initialFeedbackPins={[
          createReaderFeedbackPin({
            id: "pin-preview-1",
            pageId: "p2",
            cutIndex: 3,
            x: 0.45,
            y: 0.55,
            category: "balloon",
            comment: "말풍선 여백 조정",
            nowIso: "2026-11-22T01:00:00.000Z",
          }),
        ]}
      />,
    );

    // 프리뷰 상의 핀 마커 클릭 시 피드백 패널이 열리고 점프 콜백이 호출된다.
    const marker = screen.getByRole("button", { name: /2페이지 3컷 말풍선 핀/ });
    fireEvent.click(marker);
    expect(screen.getByTestId("studio-reader-feedback-pins-widget")).toBeDefined();
    expect(onJumpToFeedbackPin).toHaveBeenCalledWith(
      expect.objectContaining({ pinId: "pin-preview-1", pageId: "p2", cutIndex: 3 }),
    );
    expect(scrollIntoViewMock).toHaveBeenCalled();

    // 편집 컷 열기 버튼으로 에디터 페이지로 바로 점프한다.
    fireEvent.click(screen.getByRole("button", { name: "편집 컷 열기" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSelectPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "편집 컷 열기" }));
    expect(onOpenFeedbackPin).toHaveBeenLastCalledWith(expect.objectContaining({ pageId: "p2", x: 0.45, y: 0.55 }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("편집한 두 핀을 차례로 다시 열면 해당 마커가 포커스를 받고 자동 스크롤은 멈춰 있다", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const pages = [makePreviewPage("p1", "앞쪽"), makePreviewPage("p2", "뒤쪽")];
    const pins = pages.map((page, index) => createReaderFeedbackPin({
      id: `pin-${page.id}`,
      pageId: page.id,
      x: 0.5,
      y: index === 0 ? 0.13 : 0.86,
      category: "typo",
      comment: `${page.name} 대사`,
    }));
    const onClose = vi.fn<StudioScrollPreviewPanelProps["onClose"]>();
    const onSelectPage = vi.fn();
    const props = { open: true, pages, onClose, onSelectPage };
    let panel = render(
      <StudioScrollPreviewPanel
        {...props}
        currentPageId="p1"
        initialFeedbackPins={pins}
        defaultFeedbackPinsOpen
      />,
    );

    for (const pin of pins) {
      // 목록에서 바로 편집해도 이전에 선택했던 마커보다 이 핀이 우선한다.
      const row = screen.getByText(pin.comment).closest("li");
      if (!row) throw new Error("검수 핀 목록 항목이 없습니다.");
      fireEvent.click(screen.getByRole("button", { name: "자동 스크롤 재생" }));
      const playing = screen.getByRole("button", { name: "자동 스크롤 일시정지" });
      expect(playing.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(within(row).getByRole("button", { name: "편집 컷 열기" }));
      expect(onSelectPage).toHaveBeenLastCalledWith(pin.pageId);
      const snapshot = onClose.mock.lastCall?.[0];
      panel.unmount();
      panel = render(
        <StudioScrollPreviewPanel {...props} currentPageId={pin.pageId} initialPinReturn={snapshot} />,
      );
      const marker = screen.queryByRole("button", { name: new RegExp(`핀: ${pin.comment}$`) });
      expect(marker, `편집기에서 돌아온 뒤 ${pin.pageId}에 ${pin.id} 마커가 보여야 합니다.`).not.toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(marker));
      expect(marker?.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getAllByRole("button", { name: /오탈자 핀:/ })).toHaveLength(2);
      const paused = screen.getByRole("button", { name: "자동 스크롤 재생" });
      expect(paused.getAttribute("aria-pressed")).toBe("false");
    }

    const snapshot = onClose.mock.lastCall?.[0];
    panel.unmount();
    render(
      <StudioScrollPreviewPanel {...props} pages={pages.slice(0, 1)} currentPageId="p1" initialPinReturn={snapshot} />,
    );
    expect(screen.queryByRole("button", { name: /핀: 뒤쪽 대사/ })).toBeNull();
    const list = screen.getByRole("list", { name: "피드백 핀 목록" });
    expect(within(list).queryByText("뒤쪽 대사")).toBeNull();
    expect(within(list).getAllByRole("button", { name: "편집 컷 열기" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /핀: 앞쪽 대사/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenLastCalledWith();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenLastCalledWith();
  });
});
