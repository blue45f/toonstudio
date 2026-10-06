import { describe, expect, it } from "vitest";
import { fortuneMajorArcanaCatalog } from "@toonstudio/core/fortune";
import { drawFortuneTodayCards, fortuneTodayCardsText } from "./fortune-today-cards";

describe("drawFortuneTodayCards", () => {
  it("같은 날짜면 항상 같은 4장을 같은 순서로 뽑는다", () => {
    const first = drawFortuneTodayCards("2026-10-06");
    const second = drawFortuneTodayCards("2026-10-06");
    expect(first.map((card) => card.id)).toEqual(second.map((card) => card.id));
    expect(first).toHaveLength(4);
  });

  it("중복 없이 메이저 아르카나 카탈로그 안에서만 뽑는다", () => {
    const catalogIds = new Set(fortuneMajorArcanaCatalog().map((card) => card.id));
    const cards = drawFortuneTodayCards("2026-10-06");
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    cards.forEach((card) => {
      expect(catalogIds.has(card.id)).toBe(true);
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.nameEn.length).toBeGreaterThan(0);
      expect(card.keywords.length).toBeGreaterThan(0);
      expect(card.line.length).toBeGreaterThan(0);
    });
  });

  it("날짜가 바뀌면 드로우 시드가 달라진다", () => {
    const a = drawFortuneTodayCards("2026-10-06").map((card) => card.id);
    const b = drawFortuneTodayCards("2026-10-07").map((card) => card.id);
    const c = drawFortuneTodayCards("2026-11-06").map((card) => card.id);
    expect(new Set([a.join(","), b.join(","), c.join(",")]).size).toBeGreaterThan(1);
  });

  it("장 수를 지정할 수 있고 카탈로그 크기를 넘지 않는다", () => {
    expect(drawFortuneTodayCards("2026-10-06", 2)).toHaveLength(2);
    expect(drawFortuneTodayCards("2026-10-06", 99)).toHaveLength(22);
    expect(drawFortuneTodayCards("2026-10-06", 0)).toHaveLength(0);
  });

  it("날짜 형식이 잘못되면 던진다", () => {
    expect(() => drawFortuneTodayCards("2026/10/06")).toThrow();
    expect(() => drawFortuneTodayCards("")).toThrow();
  });
});

describe("fortuneTodayCardsText", () => {
  it("날짜와 카드 이름·키워드를 평문으로 요약한다", () => {
    const cards = drawFortuneTodayCards("2026-10-06");
    const text = fortuneTodayCardsText("2026-10-06", cards);
    expect(text.split("\n")).toHaveLength(5);
    expect(text).toContain("2026-10-06");
    cards.forEach((card) => {
      expect(text).toContain(card.name);
      expect(text).toContain(card.keywords[0]);
    });
  });
});
