import { describe, expect, it } from "vitest";

import type { PinPatternPlaybookCard } from "./pin-pattern-report-model";
import {
  createManualPlaybookCard,
  derivePlaybookDigest,
  ensureStudioPlaybook,
  parseStudioPlaybook,
  playbookCardFromPinPattern,
  playbookCardsForProcess,
  promotePinPatternCard,
  readStudioPlaybook,
  setPlaybookCardArchived,
  upsertPlaybookCard,
  writeStudioPlaybook,
  type PlaybookRuleCard,
} from "./team-playbook-model";

const NOW = "2026-10-14T00:00:00.000Z";
const LATER = "2026-10-15T00:00:00.000Z";

function manual(partial: Partial<Parameters<typeof createManualPlaybookCard>[0]> = {}): PlaybookRuleCard {
  return createManualPlaybookCard({
    id: "card-1",
    projectId: "project-1",
    title: "배경 톤 2종까지만",
    body: "배경에는 톤 2종까지만 쓴다.",
    now: NOW,
    ...partial,
  });
}

function draft(partial: Partial<PinPatternPlaybookCard> = {}): PinPatternPlaybookCard {
  return {
    categoryId: "background",
    title: { ko: "반복 지적 규칙 — 배경·원근", en: "Recurring note rule — Backgrounds & perspective" },
    body: { ko: "배경 원근 지적이 4번 반복됐어요.", en: "Background perspective notes repeated 4 times." },
    evidenceThreadIds: ["t1", "t2"],
    occurrences: 4,
    ...partial,
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

describe("createManualPlaybookCard", () => {
  it("제목·내용·공정을 정규화한다 (레거시 키 story → story-lock, 중복 제거)", () => {
    const card = manual({ processKeys: ["story", "story-lock", "color"] });
    expect(card.processKeys).toEqual(["story-lock", "color"]);
    expect(card.source).toBe("manual");
    expect(card.categoryId).toBeNull();
    expect(card.archived).toBe(false);
  });

  it("제목·내용이 비면 throw한다", () => {
    expect(() => manual({ title: "  " })).toThrow();
    expect(() => manual({ body: "" })).toThrow();
  });
});

describe("playbookCardFromPinPattern / promotePinPatternCard (R-2 유입)", () => {
  it("유형 매핑으로 관련 공정을 정한다 (background → 배경 공정)", () => {
    const card = playbookCardFromPinPattern(draft(), { id: "p1", projectId: "project-1", now: NOW });
    expect(card.processKeys).toEqual(["background"]);
    expect(card.source).toBe("pin-pattern");
    expect(card.evidenceThreadIds).toEqual(["t1", "t2"]);
    expect(card.occurrences).toBe(4);
  });

  it("other 유형은 전 공정 공통(빈 공정 목록)이다", () => {
    const card = playbookCardFromPinPattern(draft({ categoryId: "other" }), { id: "p1", projectId: "project-1", now: NOW });
    expect(card.processKeys).toEqual([]);
  });

  it("같은 유형 재승격은 새 카드를 만들지 않고 근거를 합친다", () => {
    const first = promotePinPatternCard([], draft(), { id: "p1", projectId: "project-1", now: NOW });
    expect(first.created).toBe(true);
    const second = promotePinPatternCard(
      first.cards,
      draft({ evidenceThreadIds: ["t2", "t3"], occurrences: 6 }),
      { id: "p2", projectId: "project-1", now: LATER },
    );
    expect(second.created).toBe(false);
    expect(second.cards).toHaveLength(1);
    expect(second.card.id).toBe("p1");
    expect(second.card.evidenceThreadIds).toEqual(["t1", "t2", "t3"]);
    expect(second.card.occurrences).toBe(6);
  });

  it("보관된 승격 카드는 재승격으로 되살아나지 않는다", () => {
    const first = promotePinPatternCard([], draft(), { id: "p1", projectId: "project-1", now: NOW });
    const archived = setPlaybookCardArchived(first.cards, "p1", true, LATER);
    const second = promotePinPatternCard(archived, draft(), { id: "p2", projectId: "project-1", now: LATER });
    expect(second.card.archived).toBe(true);
    expect(playbookCardsForProcess(second.cards, "background")).toEqual([]);
  });
});

describe("playbookCardsForProcess (공정 참조)", () => {
  it("해당 공정 카드 + 전 공정 공통 카드를 돌려주고, 다른 공정 카드는 제외한다", () => {
    const bg = manual({ id: "a", processKeys: ["background"] });
    const common = manual({ id: "b", processKeys: [] });
    const color = manual({ id: "c", processKeys: ["color"] });
    const result = playbookCardsForProcess([bg, common, color], "background");
    expect(result.map((card) => card.id)).toEqual(expect.arrayContaining(["a", "b"]));
    expect(result).toHaveLength(2);
  });

  it("레거시 공정 키로 열어도 canonical로 매칭한다 (story → story-lock)", () => {
    const story = manual({ id: "a", processKeys: ["story-lock"] });
    expect(playbookCardsForProcess([story], "story").map((c) => c.id)).toEqual(["a"]);
  });

  it("보관 카드는 참조에서 빠지고, 승격 카드가 수동 카드보다 앞에 온다", () => {
    const manualCard = manual({ id: "m", processKeys: ["background"], now: LATER });
    const promoted = playbookCardFromPinPattern(draft(), { id: "p", projectId: "project-1", now: NOW });
    const archived = setPlaybookCardArchived([manual({ id: "x", processKeys: ["background"] })], "x", true, NOW)[0]!;
    const result = playbookCardsForProcess([manualCard, promoted, archived], "background");
    expect(result.map((card) => card.id)).toEqual(["p", "m"]);
  });

  it("관련 규칙이 없으면 빈 배열이다 (호출부는 아무것도 렌더하지 않는다)", () => {
    expect(playbookCardsForProcess([], "color")).toEqual([]);
    expect(playbookCardsForProcess([manual({ processKeys: ["color"] })], "background")).toEqual([]);
  });
});

describe("derivePlaybookDigest / upsert", () => {
  it("활성·보관·승격 수와 공정별 참조 수를 센다", () => {
    const promoted = playbookCardFromPinPattern(draft(), { id: "p", projectId: "project-1", now: NOW });
    const cards = upsertPlaybookCard([promoted], manual({ id: "m", processKeys: ["background"] }));
    const digest = derivePlaybookDigest(cards, ["background", "color"]);
    expect(digest.activeCount).toBe(2);
    expect(digest.promotedCount).toBe(1);
    expect(digest.countsByProcess).toEqual({ background: 2, color: 0 });
  });
});

describe("저장소", () => {
  it("ensure → write → read 왕복이 카드를 유지한다", () => {
    const storage = memoryStorage();
    const initial = ensureStudioPlaybook(storage, "project-1");
    expect(initial.cards).toEqual([]);
    const withCard = { ...initial, cards: [manual()] };
    writeStudioPlaybook(storage, withCard);
    expect(readStudioPlaybook(storage, "project-1")?.cards).toHaveLength(1);
    // ensure는 기존 저장본을 덮지 않는다
    expect(ensureStudioPlaybook(storage, "project-1").cards).toHaveLength(1);
  });

  it("깨진 스냅샷·다른 프로젝트 저장본은 거부한다", () => {
    expect(parseStudioPlaybook({ schemaVersion: 1, projectId: "p", cards: [{ id: "x" }] })).toBeNull();
    expect(parseStudioPlaybook({ schemaVersion: 2, projectId: "p", cards: [] })).toBeNull();
    const storage = memoryStorage();
    writeStudioPlaybook(storage, { schemaVersion: 1, projectId: "project-1", cards: [] });
    expect(readStudioPlaybook(storage, "project-2")).toBeNull();
  });
});
