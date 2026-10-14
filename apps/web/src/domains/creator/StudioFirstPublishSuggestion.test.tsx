// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioFirstPublishSuggestion } from "./StudioFirstPublishSuggestion";
import {
  FIRST_PUBLISH_SUGGESTION_CUT_THRESHOLD,
  firstPublishSuggestionStorageKey,
  markFirstPublishSuggestionDismissed,
  readFirstPublishSuggestionDismissed,
  shouldSuggestFirstPublish,
  type FirstPublishSuggestionStorage,
} from "./studio-first-publish-suggestion";

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
