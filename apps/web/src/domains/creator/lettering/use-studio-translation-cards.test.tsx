// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT,
  readStudioLocalizationCharacterCards,
  studioLocalizationProjectStorageKey,
  updateStudioLocalizationCharacterCards,
} from "../studio-localization-project-store";
import { updateStudioProjectStory } from "../studio-project-feature-adapters";

import {
  addManualStudioTranslationCard,
  patchStudioTranslationCard,
} from "./studio-translation-character-card-edit";
import { useStudioTranslationCards } from "./use-studio-translation-cards";

import type { StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";

const bible: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "yuna", name: "유나", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [],
  facts: [],
};
const narrative: StudioStoryBibleNarrative = {
  profiles: [
    {
      characterId: "yuna",
      personality: "",
      speechStyle: "존댓말",
      background: "",
      motivation: "",
      signatureLines: [],
      appearanceNotes: "",
    },
  ],
  relations: [],
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useStudioTranslationCards", () => {
  it("저장된 카드를 읽고, 스토리 바이블이 없으면 시트 층 없이 보여 준다(시트 값을 지어내지 않는다)", () => {
    updateStudioLocalizationCharacterCards(localStorage, "scope-1", (cards) =>
      addManualStudioTranslationCard(cards, { id: "manual-1", name: "Emma" }),
    );
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    expect(result.current.sheetStatus).toBe("none");
    expect(result.current.cards.map((card) => [card.characterId, card.origin])).toEqual([["manual-1", "manual"]]);
    expect(result.current.error).toBeNull();
  });

  it("프로젝트의 스토리 바이블에서 시트를 읽기 전용으로 가져온다", () => {
    updateStudioProjectStory(localStorage, "project-1", { bible, states: [], transitions: [], narrative });
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "project-1", bibleProjectId: "project-1" }),
    );
    expect(result.current.sheetStatus).toBe("ready");
    expect(result.current.cards[0]).toMatchObject({ characterId: "yuna", name: "유나", speechNote: "존댓말", origin: "story-bible" });
  });

  it("update 는 번역 프로젝트 문서에 저장하고 상태와 지문을 갱신한다", () => {
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    const before = result.current.signature;
    act(() => {
      result.current.update((cards) => patchStudioTranslationCard(cards, "yuna", { name: "유나", register: "polite" }));
    });
    expect(result.current.cards[0]?.register).toBe("polite");
    expect(result.current.signature).not.toBe(before);
    expect(readStudioLocalizationCharacterCards(localStorage, "scope-1").cards[0]?.register).toBe("polite");
    expect(result.current.error).toBeNull();
  });

  it("같은 문서를 다루는 다른 곳의 갱신 이벤트를 받아 상태를 맞춘다", () => {
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    act(() => {
      updateStudioLocalizationCharacterCards(
        localStorage,
        "scope-1",
        (cards) => addManualStudioTranslationCard(cards, { id: "manual-9", name: "Noah" }),
        window,
      );
    });
    expect(result.current.cards.map((card) => card.name)).toEqual(["Noah"]);
  });

  it("다른 범위의 갱신 이벤트는 무시한다", () => {
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    act(() => {
      updateStudioLocalizationCharacterCards(
        localStorage,
        "scope-2",
        (cards) => addManualStudioTranslationCard(cards, { id: "manual-9", name: "Noah" }),
        window,
      );
    });
    expect(result.current.cards).toEqual([]);
  });

  it("저장이 실패해도 편집은 화면에 남고 오류가 드러나며, 다시 시도하면 저장된다", () => {
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    act(() => {
      result.current.update((cards) => addManualStudioTranslationCard(cards, { id: "manual-1", name: "Emma" }));
    });
    expect(result.current.error).toBe("save");
    expect(result.current.cards.map((card) => card.name)).toEqual(["Emma"]);
    expect(readStudioLocalizationCharacterCards(localStorage, "scope-1").cards).toEqual([]);

    setItem.mockRestore();
    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    expect(readStudioLocalizationCharacterCards(localStorage, "scope-1").cards.map((card) => card.name)).toEqual(["Emma"]);
  });

  it("읽기 실패는 오류로 드러나고, 다시 시도하면 읽는다", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    expect(result.current.error).toBe("load");
    getItem.mockRestore();
    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
  });

  it("저장된 번역 문서가 손상됐으면 읽을 때부터 'unreadable' 로 알리고, 편집은 화면에만 남기며 문서는 덮어쓰지 않는다", () => {
    const key = studioLocalizationProjectStorageKey("scope-1");
    localStorage.setItem(key, "{broken");
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    expect(result.current.error).toBe("unreadable");

    act(() => {
      result.current.update((cards) => addManualStudioTranslationCard(cards, { id: "manual-1", name: "Emma" }));
    });
    expect(result.current.error).toBe("unreadable");
    expect(result.current.cards.map((card) => card.name)).toEqual(["Emma"]);
    expect(localStorage.getItem(key)).toBe("{broken");

    // 문서가 치워지면(번역 패널에서 다시 만들면) 다시 시도로 메모리의 편집이 저장된다.
    localStorage.removeItem(key);
    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    expect(readStudioLocalizationCharacterCards(localStorage, "scope-1").cards.map((card) => card.name)).toEqual(["Emma"]);
  });

  it("다른 탭에서 문서가 손상되거나 고쳐지면 오류 종류를 다시 판정한다", () => {
    const key = studioLocalizationProjectStorageKey("scope-1");
    const { result } = renderHook(() =>
      useStudioTranslationCards({ scopeKey: "scope-1", bibleProjectId: null }),
    );
    expect(result.current.error).toBeNull();

    localStorage.setItem(key, "{broken");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
    });
    expect(result.current.error).toBe("unreadable");

    localStorage.removeItem(key);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
    });
    expect(result.current.error).toBeNull();
  });

  it("범위가 바뀌면 그 범위의 문서를 다시 읽는다", () => {
    updateStudioLocalizationCharacterCards(localStorage, "scope-b", (cards) =>
      addManualStudioTranslationCard(cards, { id: "manual-b", name: "Bea" }),
    );
    const { result, rerender } = renderHook(
      ({ scopeKey }: { scopeKey: string }) => useStudioTranslationCards({ scopeKey, bibleProjectId: null }),
      { initialProps: { scopeKey: "scope-a" } },
    );
    expect(result.current.cards).toEqual([]);
    rerender({ scopeKey: "scope-b" });
    expect(result.current.cards.map((card) => card.name)).toEqual(["Bea"]);
    // 이벤트 상수는 번역 프로젝트 저장소와 공유된다.
    expect(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT).toContain("localization-project-updated");
  });
});
