// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioFirstPublishSuggestion } from "../StudioFirstPublishSuggestion";
import {
  FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD,
  firstPublishSuggestionStorageKey,
  markFirstPublishSuggestionDismissed,
  readFirstPublishSuggestionDismissed,
  shouldSuggestFirstPublish,
  type FirstPublishSuggestionStorage,
} from "../studio-first-publish-suggestion";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function memoryStorage(): FirstPublishSuggestionStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("shouldSuggestFirstPublish (first-run F6.2 판정)", () => {
  it("stays silent before any save and before enough cuts accumulate", () => {
    expect(
      shouldSuggestFirstPublish({ firstSaveCompleted: false, cutCount: 0, dismissed: false }),
    ).toBe(false);
    expect(
      shouldSuggestFirstPublish({
        firstSaveCompleted: false,
        cutCount: FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD - 1,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it("suggests once the first save completes", () => {
    expect(
      shouldSuggestFirstPublish({ firstSaveCompleted: true, cutCount: 0, dismissed: false }),
    ).toBe(true);
  });

  it("suggests once enough cuts accumulate, even before a save", () => {
    expect(
      shouldSuggestFirstPublish({
        firstSaveCompleted: false,
        cutCount: FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it("never suggests for an already published document", () => {
    expect(
      shouldSuggestFirstPublish({
        firstSaveCompleted: true,
        cutCount: 99,
        alreadyPublished: true,
        dismissed: false,
      }),
    ).toBe(false);
  });

  it("never suggests after dismissal", () => {
    expect(
      shouldSuggestFirstPublish({ firstSaveCompleted: true, cutCount: 99, dismissed: true }),
    ).toBe(false);
  });
});

describe("first-publish suggestion dismissal storage", () => {
  it("round-trips per scope and isolates other documents", () => {
    const storage = memoryStorage();
    expect(readFirstPublishSuggestionDismissed(storage, "doc-1")).toBe(false);
    markFirstPublishSuggestionDismissed(storage, "doc-1");
    expect(readFirstPublishSuggestionDismissed(storage, "doc-1")).toBe(true);
    expect(readFirstPublishSuggestionDismissed(storage, "doc-2")).toBe(false);
    expect(storage.map.get(firstPublishSuggestionStorageKey("doc-1"))).toBe("1");
  });

  it("treats a missing or throwing storage as not dismissed instead of crashing", () => {
    expect(readFirstPublishSuggestionDismissed(null, "doc-1")).toBe(false);
    const throwing: FirstPublishSuggestionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readFirstPublishSuggestionDismissed(throwing, "doc-1")).toBe(false);
    expect(() => markFirstPublishSuggestionDismissed(throwing, "doc-1")).not.toThrow();
    expect(() => markFirstPublishSuggestionDismissed(null, "doc-1")).not.toThrow();
  });
});

describe("StudioFirstPublishSuggestion", () => {
  it("renders nothing until a trigger condition is met", () => {
    const view = render(
      <StudioFirstPublishSuggestion
        firstSaveCompleted={false}
        cutCount={1}
        scope="doc-idle"
        onCheckPublishReady={vi.fn()}
      />,
    );
    expect(view.container.querySelector('[data-studio-first-publish-suggestion="true"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "게시 준비 확인하기" })).toBeNull();
  });

  it("shows the one-time suggestion after the first save completes", () => {
    render(
      <StudioFirstPublishSuggestion
        firstSaveCompleted
        cutCount={0}
        scope="doc-saved"
        onCheckPublishReady={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "게시 준비 확인하기" })).not.toBeNull();
  });

  it("shows the suggestion when cuts accumulate before any save", () => {
    render(
      <StudioFirstPublishSuggestion
        firstSaveCompleted={false}
        cutCount={FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD}
        scope="doc-cuts"
        onCheckPublishReady={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "게시 준비 확인하기" })).not.toBeNull();
  });

  it("does not show for an already published document", () => {
    const view = render(
      <StudioFirstPublishSuggestion
        firstSaveCompleted
        cutCount={99}
        alreadyPublished
        scope="doc-published"
        onCheckPublishReady={vi.fn()}
      />,
    );
    expect(view.container.querySelector('[data-studio-first-publish-suggestion="true"]')).toBeNull();
  });

  it("dismiss hides it and it never reappears for the same document", () => {
    const props = {
      firstSaveCompleted: true,
      cutCount: 0,
      scope: "doc-dismiss",
      onCheckPublishReady: vi.fn(),
    };
    const view = render(<StudioFirstPublishSuggestion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "게시 준비 제안 닫기" }));
    expect(view.container.querySelector('[data-studio-first-publish-suggestion="true"]')).toBeNull();

    view.rerender(<StudioFirstPublishSuggestion {...props} />);
    expect(view.container.querySelector('[data-studio-first-publish-suggestion="true"]')).toBeNull();

    view.unmount();
    render(<StudioFirstPublishSuggestion {...props} />);
    expect(screen.queryByRole("button", { name: "게시 준비 확인하기" })).toBeNull();
  });

  it("keeps the suggestion for a different document scope", () => {
    markFirstPublishSuggestionDismissed(window.localStorage, "doc-other");
    render(
      <StudioFirstPublishSuggestion
        firstSaveCompleted
        cutCount={0}
        scope="doc-fresh"
        onCheckPublishReady={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "게시 준비 확인하기" })).not.toBeNull();
  });

  it("CTA fires the host callback once and also retires the suggestion", () => {
    const onCheckPublishReady = vi.fn();
    const props = {
      firstSaveCompleted: true,
      cutCount: 0,
      scope: "doc-cta",
      onCheckPublishReady,
    };
    const view = render(<StudioFirstPublishSuggestion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "게시 준비 확인하기" }));
    expect(onCheckPublishReady).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[data-studio-first-publish-suggestion="true"]')).toBeNull();

    view.unmount();
    render(<StudioFirstPublishSuggestion {...props} />);
    expect(screen.queryByRole("button", { name: "게시 준비 확인하기" })).toBeNull();
  });
});

describe("게시 준비 제안의 작은 기본 카드와 설명 펼치기", () => {
  const props = {
    firstSaveCompleted: true,
    cutCount: 0,
    scope: "doc-disclosure",
    onCheckPublishReady: vi.fn(),
  };

  beforeEach(() => props.onCheckPublishReady.mockClear());

  it("바로 게시되지 않음을 항상 알리고 설명은 접으며 작업 포커스를 가져가지 않는다", () => {
    render(<button type="button">그리기</button>);
    const drawing = screen.getByRole("button", { name: "그리기" });
    drawing.focus();
    render(<StudioFirstPublishSuggestion {...props} />);
    const toggle = screen.getByRole("button", { name: "게시 준비 설명 보기" });
    const details = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(details?.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("게시는 확인 후 따로 진행해요.").closest("[hidden]")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(drawing);
    expect(props.onCheckPublishReady).not.toHaveBeenCalled();
  });

  it("설명 반복 펼치기와 접기는 실제 행동이나 일회성 기억을 바꾸지 않는다", () => {
    render(<StudioFirstPublishSuggestion {...props} />);
    const toggle = screen.getByRole("button", { name: "게시 준비 설명 보기" });
    const details = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(details?.hidden).toBe(false);
      expect(details?.textContent).toContain("게시는 확인 뒤에 따로 진행돼요.");
      fireEvent.click(toggle);
      expect(details?.hidden).toBe(true);
    }
    expect(props.onCheckPublishReady).not.toHaveBeenCalled();
    expect(readFirstPublishSuggestionDismissed(window.localStorage, props.scope)).toBe(false);
  });

  it("펼친 안내 안의 Escape만 설명을 접고 설명 버튼에 포커스를 돌린다", () => {
    const parentKeyDown = vi.fn();
    document.addEventListener("keydown", parentKeyDown);
    try {
      render(<StudioFirstPublishSuggestion {...props} />);
      const toggle = screen.getByRole("button", { name: "게시 준비 설명 보기" });
      fireEvent.click(toggle);
      const close = screen.getByRole("button", { name: "게시 준비 제안 닫기" });
      close.focus();
      fireEvent.keyDown(close, { key: "Escape" });
      expect(document.activeElement).toBe(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(parentKeyDown).not.toHaveBeenCalled();
      fireEvent.keyDown(toggle, { key: "Escape" });
      expect(parentKeyDown).toHaveBeenCalledOnce();
      expect(props.onCheckPublishReady).not.toHaveBeenCalled();
      expect(readFirstPublishSuggestionDismissed(window.localStorage, props.scope)).toBe(false);
    } finally {
      document.removeEventListener("keydown", parentKeyDown);
    }
  });

  it("설명을 펼친 뒤 닫아도 같은 문서에서 다시 나타나지 않는다", () => {
    const view = render(<StudioFirstPublishSuggestion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "게시 준비 설명 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "게시 준비 제안 닫기" }));
    expect(props.onCheckPublishReady).not.toHaveBeenCalled();
    view.unmount();
    render(<StudioFirstPublishSuggestion {...props} />);
    expect(screen.queryByRole("region", { name: "게시 준비 제안" })).toBeNull();
  });

  it("기기 저장이 막혀도 실제 확인 행동은 한 번 실행하고 카드를 닫는다", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    try {
      render(<StudioFirstPublishSuggestion {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "게시 준비 설명 보기" }));
      fireEvent.click(screen.getByRole("button", { name: "게시 준비 확인하기" }));
      expect(props.onCheckPublishReady).toHaveBeenCalledOnce();
      expect(screen.queryByRole("region", { name: "게시 준비 제안" })).toBeNull();
    } finally {
      write.mockRestore();
    }
  });

  it("영문 기본 안내와 설명에서도 게시가 별도 단계임을 보존한다", () => {
    useI18n.getState().setLang("en");
    render(<StudioFirstPublishSuggestion {...props} />);
    expect(screen.getByRole("button", { name: "Check publish readiness" })).toBeTruthy();
    expect(screen.getByText("Publishing is a separate step after the check.").closest("[hidden]")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show publish readiness details" });
    fireEvent.click(toggle);
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.textContent)
      .toContain("Publishing itself happens separately, after the check.");
    expect(props.onCheckPublishReady).not.toHaveBeenCalled();
  });

  it("세 버튼 모두 44px 대상과 focus·reduced-motion 스타일을 갖는다", () => {
    render(<StudioFirstPublishSuggestion {...props} />);
    expect(screen.getByRole("button", { name: "게시 준비 확인하기" }).className).toContain("h-11");
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/(?:size-11|min-h-11)/);
      expect(button.className).toContain("focus-visible:outline");
      expect(button.className).toContain("motion-reduce:transition-none");
    }
  });
});
