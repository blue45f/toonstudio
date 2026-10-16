/**
 * 번역 인물 카드의 React 투영 — 저장소(번역 프로젝트 문서)와 스토리 바이블(읽기 전용)을 한 컨트롤러로 묶는다.
 *
 * 권위는 둘이고 서로 섞이지 않는다.
 *  · 번역용 카드·화자 지정 → `studio-localization-project-store` 의 번역 프로젝트 문서(`scopeKey` 로 키).
 *    번역 단위를 다루는 현지화 패널과 같은 문서·같은 갱신 이벤트를 쓴다.
 *  · 시트(이름·말투 서술·관계) → 프로젝트 진단 소스의 스토리 바이블(`bibleProjectId` 로 키). **읽기만 한다.**
 *    프로젝트가 연결되지 않았거나 소스가 없으면 시트 층 없이 저장된 카드만 보인다(시트 값을 지어내지 않는다).
 *
 * 저장소는 동기(localStorage)라 "로딩" 상태는 없다. 대신 읽기/쓰기 실패를 `error` 로 드러내고 `retry` 를
 * 준다. 쓰기가 실패해도 화면의 편집은 메모리에 남겨(입력이 사라지지 않게) 다시 저장할 수 있게 한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT,
  parseStudioLocalizationProjectDocument,
  readStudioLocalizationCharacterCards,
  updateStudioLocalizationCharacterCards,
  studioLocalizationProjectStorageKey,
} from "../studio-localization-project-store";
import {
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  readStudioProjectDiagnosticSource,
  studioProjectDiagnosticSourceStorageKey,
} from "../studio-project-diagnostic-source-store";

import {
  EMPTY_STUDIO_TRANSLATION_CARD_SET,
  deriveStudioTranslationEffectiveCards,
} from "./studio-translation-character-card";

import type { StudioStoryBibleNarrative } from "../planning/studio-character-profile";
import type { StudioStoryBible } from "../studio-story-bible";
import type {
  StudioTranslationCharacterCardSet,
  StudioTranslationEffectiveCard,
} from "./studio-translation-character-card";

export type StudioTranslationCardsError = "load" | "save";

/** 시트 층의 상태: 연결된 프로젝트 없음 · 읽음 · 읽지 못함. */
export type StudioTranslationSheetStatus = "none" | "ready" | "error";

export interface StudioTranslationCardsController {
  readonly scopeKey: string;
  readonly set: StudioTranslationCharacterCardSet;
  readonly cards: readonly StudioTranslationEffectiveCard[];
  readonly sheetStatus: StudioTranslationSheetStatus;
  /** 카드·화자 지정이 바뀔 때만 바뀌는 지문 — QA 보고서가 낡았는지 가르는 데 쓴다. */
  readonly signature: string;
  readonly error: StudioTranslationCardsError | null;
  /** 읽고-고치고-쓰기 한 번. 갱신 함수가 같은 참조를 돌려주면 아무것도 하지 않는다. */
  readonly update: (
    updater: (current: StudioTranslationCharacterCardSet) => StudioTranslationCharacterCardSet,
  ) => void;
  /** 읽기 실패면 다시 읽고, 저장 실패면 메모리에 남은 편집을 다시 저장한다. */
  readonly retry: () => void;
}

interface SheetState {
  readonly status: StudioTranslationSheetStatus;
  readonly bible: StudioStoryBible | null;
  readonly narrative: StudioStoryBibleNarrative | null;
}

const NO_SHEET: SheetState = Object.freeze({ status: "none", bible: null, narrative: null });

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readCardsOnce(scopeKey: string): {
  readonly set: StudioTranslationCharacterCardSet;
  readonly error: StudioTranslationCardsError | null;
} {
  const storage = browserStorage();
  if (storage === null) return { set: EMPTY_STUDIO_TRANSLATION_CARD_SET, error: "load" };
  try {
    return { set: readStudioLocalizationCharacterCards(storage, scopeKey), error: null };
  } catch {
    return { set: EMPTY_STUDIO_TRANSLATION_CARD_SET, error: "load" };
  }
}

function readSheet(projectId: string | null): SheetState {
  if (projectId === null) return NO_SHEET;
  const storage = browserStorage();
  if (storage === null) return Object.freeze({ status: "error", bible: null, narrative: null });
  try {
    const source = readStudioProjectDiagnosticSource(storage, projectId);
    return source === null
      ? NO_SHEET
      : Object.freeze({
          status: "ready",
          bible: source.story.bible,
          narrative: source.story.narrative,
        });
  } catch {
    return Object.freeze({ status: "error", bible: null, narrative: null });
  }
}

export function useStudioTranslationCards(input: {
  /** 번역 프로젝트 문서의 키(프로젝트 id, 없으면 작품 범위). */
  readonly scopeKey: string;
  /** 스토리 바이블을 읽을 프로젝트 id. 프로젝트가 없으면 null. */
  readonly bibleProjectId: string | null;
}): StudioTranslationCardsController {
  const { scopeKey, bibleProjectId } = input;
  // 첫 렌더부터 저장된 값을 쓴다 — 효과로 읽으면 현지화 QA 화면이 카드 없이 한 번 검사하고 곧바로 "낡음"이 된다.
  const [initial] = useState(() => readCardsOnce(scopeKey));
  const [set, setSet] = useState<StudioTranslationCharacterCardSet>(initial.set);
  const [sheet, setSheet] = useState<SheetState>(() => readSheet(bibleProjectId));
  const [error, setError] = useState<StudioTranslationCardsError | null>(initial.error);
  const loadedScopeRef = useRef(scopeKey);
  const loadedSheetRef = useRef(bibleProjectId);
  // 저장에 실패한 마지막 편집 — retry 가 그대로 다시 저장한다.
  const unsavedRef = useRef<StudioTranslationCharacterCardSet | null>(null);
  // 화면이 마지막으로 보여 준 집합 — 저장이 실패했을 때 그 위에 편집을 얹는 기준.
  const shownRef = useRef<StudioTranslationCharacterCardSet>(initial.set);

  const loadCards = useCallback(() => {
    const storage = browserStorage();
    if (storage === null) {
      setError("load");
      return;
    }
    try {
      setSet(readStudioLocalizationCharacterCards(storage, scopeKey));
      unsavedRef.current = null;
      setError(null);
    } catch {
      setError("load");
    }
  }, [scopeKey]);

  useEffect(() => {
    shownRef.current = set;
  }, [set]);

  useEffect(() => {
    // 첫 렌더에서 이미 읽었다 — 범위가 바뀐 경우에만 다시 읽는다.
    if (loadedScopeRef.current === scopeKey) return;
    loadedScopeRef.current = scopeKey;
    loadCards();
  }, [loadCards, scopeKey]);

  useEffect(() => {
    if (loadedSheetRef.current !== bibleProjectId) {
      loadedSheetRef.current = bibleProjectId;
      setSheet(readSheet(bibleProjectId));
    }
    const reloadSheet = () => setSheet(readSheet(bibleProjectId));
    window.addEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, reloadSheet);
    return () => window.removeEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, reloadSheet);
  }, [bibleProjectId]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      const parsed = parseStudioLocalizationProjectDocument(detail, scopeKey);
      if (parsed === null) return;
      setSet(parsed.characterCards ?? EMPTY_STUDIO_TRANSLATION_CARD_SET);
    };
    // 다른 탭에서 바꾼 경우 — 같은 키가 바뀌었을 때만 다시 읽는다.
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== browserStorage()) return;
      try {
        if (event.key === studioLocalizationProjectStorageKey(scopeKey)) loadCards();
        if (bibleProjectId !== null && event.key === studioProjectDiagnosticSourceStorageKey(bibleProjectId)) {
          setSheet(readSheet(bibleProjectId));
        }
      } catch {
        // 키를 만들 수 없는 id 는 어차피 읽지 못한다 — 이벤트를 무시한다.
      }
    };
    window.addEventListener(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [bibleProjectId, loadCards, scopeKey]);

  const update = useCallback(
    (updater: (current: StudioTranslationCharacterCardSet) => StudioTranslationCharacterCardSet) => {
      const storage = browserStorage();
      try {
        if (storage === null) throw new Error("storage unavailable");
        const next = updateStudioLocalizationCharacterCards(storage, scopeKey, updater, window);
        setSet(next.characterCards ?? EMPTY_STUDIO_TRANSLATION_CARD_SET);
        unsavedRef.current = null;
        setError(null);
      } catch {
        // 저장은 실패했어도 화면의 편집은 남긴다 — 입력이 사라지면 사용자는 저장된 줄 안다.
        const next = updater(shownRef.current);
        shownRef.current = next;
        unsavedRef.current = next;
        setSet(next);
        setError("save");
      }
    },
    [scopeKey],
  );

  const retry = useCallback(() => {
    const pending = unsavedRef.current;
    if (pending === null) {
      loadCards();
      return;
    }
    update(() => pending);
  }, [loadCards, update]);

  const cards = useMemo(
    () => deriveStudioTranslationEffectiveCards({ bible: sheet.bible, narrative: sheet.narrative, set }),
    [set, sheet],
  );
  const signature = useMemo(
    () =>
      JSON.stringify([
        cards.map((card) => [
          card.characterId,
          card.name,
          card.speechNote,
          card.register,
          card.addressTerms,
          card.fixedTerms,
          card.bannedTerms,
        ]),
        set.speakers,
      ]),
    [cards, set.speakers],
  );

  return useMemo(
    () => ({ scopeKey, set, cards, sheetStatus: sheet.status, signature, error, update, retry }),
    [scopeKey, set, cards, sheet.status, signature, error, update, retry],
  );
}
