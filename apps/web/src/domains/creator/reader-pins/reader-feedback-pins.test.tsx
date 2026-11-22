// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { StudioScrollPreviewPanel, type ScrollPreviewPage } from "../StudioScrollPreviewPanel";

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
    const onClose = vi.fn();

    render(
      <StudioScrollPreviewPanel
        open
        onClose={onClose}
        pages={[makePreviewPage("p1", "1페이지"), makePreviewPage("p2", "2페이지")]}
        currentPageId="p1"
        onSelectPage={onSelectPage}
        onJumpToFeedbackPin={onJumpToFeedbackPin}
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
    expect(onSelectPage).toHaveBeenCalledWith("p2");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
