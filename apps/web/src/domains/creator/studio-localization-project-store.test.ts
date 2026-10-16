import { describe, expect, it } from "vitest";

import { createStudioLocalizationUnit, transitionStudioLocalizationUnit } from "./studio-localization-workflow";
import {
  isStudioLocalizationProjectUnreadable,
  parseStudioLocalizationProjectDocument,
  projectLocalizationDiagnostics,
  readStudioLocalizationCharacterCards,
  readStudioLocalizationProject,
  studioLocalizationProjectStorageKey,
  STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT,
  StudioLocalizationProjectUnreadableError,
  updateStudioLocalizationCharacterCards,
  writeStudioLocalizationProject,
} from "./studio-localization-project-store";
import {
  patchStudioTranslationCard,
  setStudioTranslationSpeaker,
} from "./lettering/studio-translation-character-card-edit";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function baseUnit(id = "line-1") {
  return createStudioLocalizationUnit({
    id,
    sourceLocale: "ko-KR",
    targetLocale: "en-US",
    kind: "dialogue",
    sourceText: "그게 무슨 뜻이야?",
    glossary: [],
    sourceRemoved: false,
    backgroundRestored: false,
    letteringApplied: false,
    readingOrderAssigned: false,
    fontAvailable: false,
    updatedAt: "2026-09-11T03:00:00.000Z",
  });
}

describe("Studio localization project store", () => {
  it("persists validated units without accepting malformed payloads", () => {
    const storage = memoryStorage();
    const document = writeStudioLocalizationProject(storage, {
      schemaVersion: 1,
      projectId: "project-12",
      units: [baseUnit()],
      updatedAt: "2026-09-11T03:00:00.000Z",
    });

    expect(readStudioLocalizationProject(storage, "project-12")).toEqual(document);
    expect(parseStudioLocalizationProjectDocument({
      ...document,
      units: [{ id: "broken" }],
    }, "project-12")).toBeNull();
  });

  it("projects incomplete work as blocked and completed QA as ready", () => {
    const initial = baseUnit();
    expect(projectLocalizationDiagnostics([initial])).toEqual([
      expect.objectContaining({ locale: "en-US", status: "blocked" }),
    ]);

    let complete = transitionStudioLocalizationUnit(initial, {
      type: "start-ai-draft",
      at: "2026-09-11T03:01:00.000Z",
      translatedText: "What do you mean?",
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "request-review",
      at: "2026-09-11T03:02:00.000Z",
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "approve",
      at: "2026-09-11T03:03:00.000Z",
      reviewerId: "reviewer-1",
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "prepare-layout",
      at: "2026-09-11T03:04:00.000Z",
      sourceRemoved: true,
      backgroundRestored: true,
      letteringApplied: true,
      readingOrderAssigned: true,
      fontAvailable: true,
      balloonFit: {
        availableWidth: 320,
        availableHeight: 180,
        renderedWidth: 240,
        renderedHeight: 90,
        minimumFontSize: 14,
        actualFontSize: 18,
        lineCount: 2,
        maxLineCount: 4,
      },
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "complete",
      at: "2026-09-11T03:05:00.000Z",
    });

    expect(projectLocalizationDiagnostics([complete])).toEqual([
      expect.objectContaining({
        locale: "en-US",
        status: "complete",
        blockingIssueCount: 0,
        warningIssueCount: 0,
      }),
    ]);
  });
});

describe("Studio localization project store — 번역 인물 카드", () => {
  const unitsDocument = (units = [baseUnit()]) => ({
    schemaVersion: 1 as const,
    projectId: "project-12",
    units,
    updatedAt: "2026-09-11T03:00:00.000Z",
  });

  it("카드 필드가 없던 기존 문서(v1)도 그대로 유효하고, 카드는 빈 집합으로 읽힌다(역호환)", () => {
    const storage = memoryStorage();
    storage.setItem(
      studioLocalizationProjectStorageKey("project-12"),
      JSON.stringify(unitsDocument()),
    );
    const document = readStudioLocalizationProject(storage, "project-12");
    expect(document.units).toHaveLength(1);
    expect(document.characterCards).toBeUndefined();
    expect(readStudioLocalizationCharacterCards(storage, "project-12")).toEqual({
      schemaVersion: 1,
      cards: [],
      speakers: {},
    });
  });

  it("카드를 저장해도 번역 단위는 그대로이고, 같은 키·같은 갱신 이벤트를 쓴다", () => {
    const storage = memoryStorage();
    writeStudioLocalizationProject(storage, unitsDocument());
    const events: Event[] = [];
    const target = { dispatchEvent: (event: Event) => (events.push(event), true) };

    const next = updateStudioLocalizationCharacterCards(
      storage,
      "project-12",
      (cards) => patchStudioTranslationCard(cards, "yuna", { name: "유나", register: "polite" }),
      target,
    );

    expect(next.units).toHaveLength(1);
    expect(next.characterCards?.cards[0]).toMatchObject({ characterId: "yuna", register: "polite" });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(STUDIO_LOCALIZATION_PROJECT_UPDATED_EVENT);
    expect(readStudioLocalizationProject(storage, "project-12")).toEqual(next);
  });

  it("카드를 모르는 호출부(번역 단위만 저장)가 문서를 저장해도 저장된 카드를 지우지 않는다", () => {
    const storage = memoryStorage();
    writeStudioLocalizationProject(storage, unitsDocument());
    updateStudioLocalizationCharacterCards(storage, "project-12", (cards) =>
      setStudioTranslationSpeaker(cards, "b1", { speakerId: "yuna", listenerId: null }),
    );

    // 현지화 패널의 저장 경로: characterCards 없이 units 만 넘긴다.
    const saved = writeStudioLocalizationProject(storage, unitsDocument([baseUnit("line-1"), baseUnit("line-2")]));

    expect(saved.units).toHaveLength(2);
    expect(saved.characterCards?.speakers.b1).toEqual({ speakerId: "yuna", listenerId: null });
    expect(readStudioLocalizationCharacterCards(storage, "project-12").speakers.b1).toBeDefined();
  });

  it("빈 카드 집합을 명시하면 카드를 비울 수 있다", () => {
    const storage = memoryStorage();
    updateStudioLocalizationCharacterCards(storage, "project-12", (cards) =>
      patchStudioTranslationCard(cards, "yuna", { name: "유나", register: "casual" }),
    );
    writeStudioLocalizationProject(storage, {
      ...unitsDocument(),
      characterCards: { schemaVersion: 1, cards: [], speakers: {} },
    });
    expect(readStudioLocalizationCharacterCards(storage, "project-12").cards).toEqual([]);
  });

  it("변경이 없으면 저장도 이벤트도 없다", () => {
    const storage = memoryStorage();
    const events: Event[] = [];
    const target = { dispatchEvent: (event: Event) => (events.push(event), true) };
    updateStudioLocalizationCharacterCards(storage, "project-12", (cards) => cards, target);
    expect(events).toHaveLength(0);
    expect(storage.getItem(studioLocalizationProjectStorageKey("project-12"))).toBeNull();
  });

  it("읽을 수 없는 카드(알 수 없는 버전)만 버리고 번역 작업은 지킨다", () => {
    const parsed = parseStudioLocalizationProjectDocument(
      { ...unitsDocument(), characterCards: { schemaVersion: 9, cards: [{ characterId: "x" }] } },
      "project-12",
    );
    expect(parsed?.units).toHaveLength(1);
    expect(parsed?.characterCards).toBeUndefined();
  });

  it("저장된 문서가 있는데 읽을 수 없으면 카드 갱신은 쓰지 않고 오류를 던진다 — 번역 단위를 빈 문서로 덮어쓰지 않는다", () => {
    const storage = memoryStorage();
    const key = studioLocalizationProjectStorageKey("project-12");
    // 단위 둘 중 하나가 검증에 실패하는 문서(원문이 공백) — 문서 전체가 읽히지 않는다.
    const raw = JSON.stringify(unitsDocument([baseUnit("line-1"), { ...baseUnit("line-2"), sourceText: "   " }]));
    storage.setItem(key, raw);
    expect(readStudioLocalizationProject(storage, "project-12").units).toEqual([]);
    expect(isStudioLocalizationProjectUnreadable(storage, "project-12")).toBe(true);

    const update = () =>
      updateStudioLocalizationCharacterCards(storage, "project-12", (cards) =>
        patchStudioTranslationCard(cards, "yuna", { name: "유나", register: "polite" }),
      );
    // 일반 저장 실패(용량·권한)와 가를 수 있게 전용 오류로 던진다.
    expect(update).toThrow(StudioLocalizationProjectUnreadableError);
    expect(update).toThrow(/unreadable/u);
    expect(storage.getItem(key)).toBe(raw);

    // 깨진 JSON 도 마찬가지다.
    storage.setItem(key, "{broken");
    expect(isStudioLocalizationProjectUnreadable(storage, "project-12")).toBe(true);
    expect(update).toThrow(StudioLocalizationProjectUnreadableError);
    expect(storage.getItem(key)).toBe("{broken");
  });

  it("문서가 없거나 멀쩡하면 '읽을 수 없음'이 아니고, 저장소가 예외를 던져도 판정 함수는 던지지 않는다", () => {
    const storage = memoryStorage();
    expect(isStudioLocalizationProjectUnreadable(storage, "project-12")).toBe(false);
    writeStudioLocalizationProject(storage, unitsDocument());
    expect(isStudioLocalizationProjectUnreadable(storage, "project-12")).toBe(false);
    // 유효하지 않은 프로젝트 id(키를 만들 수 없음)나 읽기 예외는 false 로 접는다 — 호출부는 읽기 실패를 따로 센다.
    expect(isStudioLocalizationProjectUnreadable(storage, "")).toBe(false);
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => undefined };
    expect(isStudioLocalizationProjectUnreadable(throwing, "project-12")).toBe(false);
  });

  it("저장된 문서가 아예 없으면(처음 쓰는 범위) 카드를 정상적으로 저장한다", () => {
    const storage = memoryStorage();
    const saved = updateStudioLocalizationCharacterCards(storage, "project-12", (cards) =>
      patchStudioTranslationCard(cards, "yuna", { name: "유나", register: "polite" }),
    );
    expect(saved.units).toEqual([]);
    expect(saved.characterCards?.cards[0]).toMatchObject({ characterId: "yuna", register: "polite" });
  });

  it("상한을 넘는 갱신은 파서를 거쳐 저장 경로에서도 잘린다", () => {
    const storage = memoryStorage();
    const saved = updateStudioLocalizationCharacterCards(storage, "project-12", (cards) =>
      patchStudioTranslationCard(cards, "yuna", {
        name: "유나",
        bannedTerms: Array.from({ length: 80 }, (_, index) => ({ term: `금지${index}`, locale: "" })),
      }),
    );
    expect(saved.characterCards?.cards[0]?.bannedTerms.length).toBe(32);
  });
});
