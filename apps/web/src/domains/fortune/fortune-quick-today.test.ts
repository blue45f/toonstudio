import { describe, expect, it } from "vitest";

import { drawFortuneTodayCards } from "./fortune-today-cards";
import {
  QUICK_TODAY_COLORS,
  QUICK_TODAY_DIRECTIONS,
  QUICK_TODAY_TIME_SLOTS,
  buildQuickTodayFortune,
  quickTodayFortuneText,
  quickTodayHeadline,
} from "./fortune-quick-today";

describe("buildQuickTodayFortune", () => {
  it("입력 없이 날짜만으로 첫 결과에 도달한다 (캐릭터·생년월일 불필요)", () => {
    const quick = buildQuickTodayFortune("2026-10-14");
    expect(quick.date).toBe("2026-10-14");
    expect(quick.score).toBeGreaterThanOrEqual(60);
    // 캐릭터 기반 결과와 구분되는 공통 결과라 캐릭터 식별자를 갖지 않는다.
    expect(quick).not.toHaveProperty("characterId");
    expect(quick).not.toHaveProperty("character");
  });

  it("같은 날짜면 항상 같은 결과를 낸다", () => {
    const first = buildQuickTodayFortune("2026-10-14");
    const second = buildQuickTodayFortune("2026-10-14");
    expect(second).toEqual(first);
  });

  it("점수·행운 요소가 코어 비개인화 분기와 같은 범위·풀 안에 있다", () => {
    for (const date of ["2026-10-14", "2026-01-01", "2027-12-31", "2026-02-28"]) {
      const quick = buildQuickTodayFortune(date);
      expect(Number.isInteger(quick.score)).toBe(true);
      expect(quick.score).toBeGreaterThanOrEqual(60);
      expect(quick.score).toBeLessThanOrEqual(100);
      expect(QUICK_TODAY_COLORS).toContain(quick.color);
      expect(QUICK_TODAY_DIRECTIONS).toContain(quick.direction);
      expect(QUICK_TODAY_TIME_SLOTS).toContain(quick.time);
      expect(Number.isInteger(quick.luckyNumber)).toBe(true);
      expect(quick.luckyNumber).toBeGreaterThanOrEqual(0);
      expect(quick.luckyNumber).toBeLessThanOrEqual(9);
      expect(quick.headline).toBe(quickTodayHeadline(quick.score));
    }
  });

  it("날짜가 바뀌면 시드가 달라져 결과가 달라질 수 있다", () => {
    const days = ["2026-10-14", "2026-10-15", "2026-10-16", "2026-11-14", "2027-10-14"];
    const signatures = new Set(
      days.map((d) => {
        const q = buildQuickTodayFortune(d);
        return `${q.score}|${q.color}|${q.direction}|${q.time}|${q.luckyNumber}|${q.card?.id}`;
      })
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("오늘의 카드는 날짜 시드 드로우의 첫 장과 같다", () => {
    const quick = buildQuickTodayFortune("2026-10-14");
    const firstCard = drawFortuneTodayCards("2026-10-14", 1)[0];
    expect(quick.card?.id).toBe(firstCard.id);
    expect(quick.card?.name).toBe(firstCard.name);
  });

  it("날짜 형식이 잘못되면 던진다", () => {
    expect(() => buildQuickTodayFortune("2026/10/14")).toThrow();
    expect(() => buildQuickTodayFortune("2026-1-4")).toThrow();
    expect(() => buildQuickTodayFortune("")).toThrow();
  });
});

describe("quickTodayHeadline", () => {
  it("캐릭터 운세 오늘 결과와 같은 구간 문구를 쓴다", () => {
    expect(quickTodayHeadline(100)).toBe("★ 최고의 하루 ★");
    expect(quickTodayHeadline(90)).toBe("★ 최고의 하루 ★");
    expect(quickTodayHeadline(89)).toBe("☆ 맑음 & 평온 ☆");
    expect(quickTodayHeadline(80)).toBe("☆ 맑음 & 평온 ☆");
    expect(quickTodayHeadline(79)).toBe("무난하고 조심스러운 하루");
    expect(quickTodayHeadline(60)).toBe("무난하고 조심스러운 하루");
  });
});

describe("quickTodayFortuneText", () => {
  it("날짜·점수·행운 요소·카드를 평문으로 요약한다", () => {
    const quick = buildQuickTodayFortune("2026-10-14");
    const text = quickTodayFortuneText(quick);
    expect(text).toContain("오늘의 운세 · 2026-10-14");
    expect(text).toContain(`${quick.score}점`);
    expect(text).toContain(quick.color);
    expect(text).toContain(quick.direction);
    if (quick.card) expect(text).toContain(quick.card.name);
  });
});
