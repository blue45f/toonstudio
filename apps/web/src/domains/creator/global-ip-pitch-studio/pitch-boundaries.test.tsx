// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { auditPitchBibleReadiness, buildPitchBibleDeck, computeSeasonArcTotals, createPitchBibleStarter, createPitchEstimateRange, exportPitchBibleJson, exportPitchBibleMarkdown } from "./global-ip-pitch-engine";
import { StudioGlobalIpPitchPanel } from "./StudioGlobalIpPitchPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("피치 입력·원문·내보내기 경계", () => {
  it.each([NaN, Infinity, 1e308])("원본 금액 %s를 직접 감사해도 build 경로와 같은 정규화 결과를 사용한다", amount => {
    for (const field of ["target", "rights", "production"] as const) {
      const input = createPitchBibleStarter();
      const range = field === "target" ? input.targetPositioning.addressableRangeEstimate
        : field === "rights" ? input.secondaryRights.tracks[0]?.budgetRangeEstimate
          : input.productionSchedule.totalBudgetEstimate;
      if (!range) throw new Error("기본 예산 예제가 필요합니다.");
      Object.assign(range, { minAmount: amount, maxAmount: amount });
      const before = structuredClone(input);
      expect(auditPitchBibleReadiness(input)).toEqual(auditPitchBibleReadiness(buildPitchBibleDeck(input)));
      expect(input).toEqual(before);
    }
  });
  it.each([NaN, Infinity, 1e308])("외부 deck의 잘못된 금액 %s는 감사 중 정상화하지 않고 거부한다", amount => {
    const deck = structuredClone(buildPitchBibleDeck(createPitchBibleStarter()));
    Object.assign(deck.input.productionSchedule.totalBudgetEstimate, { minAmount: amount });
    expect(() => auditPitchBibleReadiness(deck)).toThrow();
  });
  it.each([NaN, Infinity, 1e308])("금액 %s를 Infinity/JSON null로 만들지 않는다", (minAmount) => {
    const range = createPitchEstimateRange({ minAmount, maxAmount: minAmount, unitKo: "가정", unitEn: "Assumed", assumptionKo: "원문", assumptionEn: "Source" });
    expect(range.minAmount).toBe(Number.isFinite(minAmount) ? 1_000_000_000_000 : 0);
    expect(range.maxAmount).toBe(range.minAmount);
    expect(JSON.parse(JSON.stringify(range)).minAmount).toBe(range.minAmount);
  });
  it("중복 캐릭터 ID와 과도한 목록을 입구에서 거부한다", () => {
    const input = createPitchBibleStarter(); const first = input.coreCharacters[0]; if (!first) throw new Error("필수 예시 없음");
    expect(() => buildPitchBibleDeck({ ...input, coreCharacters: [first, first] })).toThrow(/ID/);
    expect(() => buildPitchBibleDeck({ ...input, coreCharacters: Array.from({ length: 65 }, (_, i) => ({ ...first, id: `c${i}` })) })).toThrow(/64|상한/);
  });
  it("서로 겹치는 화수 범위를 12부작·60화 정합성 통과로 표시하지 않는다", () => {
    const blocks = createPitchBibleStarter().seasonArc.blocks.map((block) => ({ ...block, episodeCount: 3, chapterStart: 1, chapterEnd: 15 }));
    expect(computeSeasonArcTotals(blocks).matchesStandard12x60).toBe(false);
  });
  it("원문 로그라인의 공백·개행·Unicode를 Markdown과 JSON에 보존한다", () => {
    const original = createPitchBibleStarter(); const text = "  원문 🧑🏽‍🎨\n\t문장  ";
    const input = { ...original, logline: { ...original.logline, loglineKo: text } };
    const before = structuredClone(input); const deck = buildPitchBibleDeck(input);
    expect(JSON.parse(exportPitchBibleJson(deck)).deck.input.logline.loglineKo).toBe(text);
    expect(exportPitchBibleMarkdown(deck)).toContain(text);
    expect(input).toEqual(before);
  });
  it("외부 deck의 비정상 결과와 오래된 요약을 내보내기 전에 거부한다", () => {
    const deck = structuredClone(buildPitchBibleDeck(createPitchBibleStarter()));
    Object.assign(deck.seasonTotals, { totalChapters: NaN });
    expect(() => exportPitchBibleJson(deck)).toThrow(/유한|finite|일치/);
    expect(() => exportPitchBibleMarkdown(deck)).toThrow(/유한|finite|일치/);
    const stale = structuredClone(buildPitchBibleDeck(createPitchBibleStarter()));
    Object.assign(stale.input.cover, { titleKo: "수정된 최신 원문" });
    expect(() => exportPitchBibleJson(stale)).toThrow(/일치|최신/);
  });
});

describe("피치 결과 알림과 복사", () => {
  it("수신자 identity만 바뀌어도 같은 덱을 반복 전달하지 않는다", () => {
    const first = vi.fn(); const latest = vi.fn();
    const { rerender } = render(<StudioGlobalIpPitchPanel onDeckChange={first} />);
    expect(first).toHaveBeenCalledTimes(1);
    rerender(<StudioGlobalIpPitchPanel onDeckChange={latest} />);
    expect(latest).not.toHaveBeenCalled();
  });
  it("지원되지 않는 clipboard를 복사 성공으로 표시하지 않는다", () => {
    vi.stubGlobal("navigator", {});
    render(<StudioGlobalIpPitchPanel />);
    fireEvent.click(screen.getByTestId("pitch-copy-json-btn"));
    expect(screen.getByTestId("pitch-copy-status").getAttribute("role")).toBe("alert");
  });
});
