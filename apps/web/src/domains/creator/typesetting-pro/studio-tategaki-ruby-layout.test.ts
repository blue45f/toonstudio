import { describe, expect, it } from "vitest";

import {
  layoutTategakiWithRuby,
  parseInlineRubyAnnotations,
  shouldRotateInTategaki,
  tokenizeTategakiParagraph,
  verifyTategakiRubyNonOverlap,
} from "./studio-tategaki-ruby-layout";

describe("세로쓰기(Tategaki) 우→좌 열 순서 및 90° 회전 플래그", () => {
  it("다중 열을 오른쪽(index 0)에서 왼쪽(index N-1)으로 엄격히 단조 감소하는 x좌표로 배치한다", () => {
    const layout = layoutTategakiWithRuby({
      text: "첫번째열\n두번째열\n세번째열",
      fontSize: 20,
      lineHeight: 1.5,
    });

    expect(layout.columns).toHaveLength(3);
    expect(layout.columns[0]!.centerX).toBeGreaterThan(layout.columns[1]!.centerX);
    expect(layout.columns[1]!.centerX).toBeGreaterThan(layout.columns[2]!.centerX);
    expect(layout.columns[0]!.glyphs.map((g) => g.text).join("")).toBe("첫번째열");
    expect(layout.columns[2]!.glyphs.map((g) => g.text).join("")).toBe("세번째열");
    expect(layout.collisionFree).toBe(true);
  });

  it("괄호·장음부호(ー)·말줄임표(…)·대시에는 rotate90=true(90°), 한글/한자/가나에는 rotate90=false(0°)를 부여한다", () => {
    for (const rotatedChar of ["(", ")", "「", "」", "『", "』", "【", "】", "ー", "…", "‥", "—", "〜"]) {
      expect(shouldRotateInTategaki(rotatedChar)).toBe(true);
    }
    for (const uprightChar of ["한", "글", "漢", "字", "あ", "ア", "。", "、", "っ"]) {
      expect(shouldRotateInTategaki(uprightChar)).toBe(false);
    }

    const layout = layoutTategakiWithRuby({
      text: "「コーヒー…」",
      fontSize: 20,
    });
    const glyphs = layout.columns[0]!.glyphs;
    const byText = new Map(glyphs.map((g) => [g.text, g]));

    expect(byText.get("「")?.rotate90).toBe(true);
    expect(byText.get("「")?.rotationDeg).toBe(90);
    expect(byText.get("ー")?.rotate90).toBe(true);
    expect(byText.get("ー")?.rotationDeg).toBe(90);
    expect(byText.get("…")?.rotate90).toBe(true);
    expect(byText.get("…")?.rotationDeg).toBe(90);
    expect(byText.get("」")?.rotate90).toBe(true);
    expect(byText.get("コ")?.rotate90).toBe(false);
    expect(byText.get("コ")?.rotationDeg).toBe(0);
    expect(byText.get("ヒ")?.rotate90).toBe(false);
  });

  it("maxColumnHeightPx 초과 시 행두 금칙(」/。/ー)을 지키며 왼쪽 새 열로 자동 넘김한다", () => {
    const layout = layoutTategakiWithRuby({
      text: "가나다라」마바",
      fontSize: 20,
      maxColumnHeightPx: 80, // 4글자(80px) 기준 — '」'가 다음 열 첫머리에 오지 않도록 앞 글자를 함께 넘김
    });

    expect(layout.columns.length).toBeGreaterThanOrEqual(2);
    expect(layout.columns[0]!.centerX).toBeGreaterThan(layout.columns[1]!.centerX);
    expect(layout.columns[1]!.glyphs[0]!.text).not.toBe("」");
    expect(layout.collisionFree).toBe(true);
  });
});

describe("세로중가로(tate-chu-yoko): 2자리 숫자 및 !? 조합", () => {
  it("독립 2자리 숫자(12, 25)와 !?/ ?!/ !!/ ?? 조합을 세로중가로 단일 셀로 배치한다", () => {
    const tokens = tokenizeTategakiParagraph("12월 25일 정말!? 뭐라고?! 깜짝!! 진짜！？");
    const tcyTokens = tokens.filter((t) => t.isTateChuYoko);

    expect(tcyTokens.map((t) => ({ text: t.text, kind: t.tateChuYokoKind }))).toEqual([
      { text: "12", kind: "digits" },
      { text: "25", kind: "digits" },
      { text: "!?", kind: "punctuation-pair" },
      { text: "?!", kind: "punctuation-pair" },
      { text: "!!", kind: "punctuation-pair" },
      { text: "！？", kind: "punctuation-pair" },
    ]);
    for (const token of tcyTokens) {
      expect(token.rotate90).toBe(false);
      expect(token.rotationDeg).toBe(0);
    }

    const layout = layoutTategakiWithRuby({
      text: "12월 25일!?",
      fontSize: 22,
    });
    const glyphs = layout.columns[0]!.glyphs;
    const g12 = glyphs.find((g) => g.text === "12");
    const g25 = glyphs.find((g) => g.text === "25");
    const gBangQ = glyphs.find((g) => g.text === "!?");

    expect(g12?.isTateChuYoko).toBe(true);
    expect(g12?.rotate90).toBe(false);
    expect(g12?.horizontalScale).toBeGreaterThan(0);
    expect(g12?.horizontalScale).toBeLessThanOrEqual(1);
    expect(g12?.height).toBe(22);

    expect(g25?.isTateChuYoko).toBe(true);
    expect(gBangQ?.isTateChuYoko).toBe(true);
    expect(gBangQ?.tateChuYokoKind).toBe("punctuation-pair");
    expect(gBangQ?.rotate90).toBe(false);
    expect(layout.collisionFree).toBe(true);
  });

  it("3자리 이상 숫자(2026)와 영문 결합(A12)은 기본 설정에서 90° 회전 런으로 유지한다", () => {
    const tokens = tokenizeTategakiParagraph("2026년 A12구역 제3화");
    const t2026 = tokens.find((t) => t.text === "2026");
    const tA12 = tokens.find((t) => t.text === "A12");
    const t3 = tokens.find((t) => t.text === "3");

    expect(t2026?.rotate90).toBe(true);
    expect(t2026?.isTateChuYoko).toBe(false);
    expect(tA12?.rotate90).toBe(true);
    expect(tA12?.isTateChuYoko).toBe(false);
    expect(t3?.rotate90).toBe(false);
    expect(t3?.kind).toBe("upright");
  });
});

describe("루비(후리가나) 배치 및 가로·세로 충돌 회피(비겹침 보장)", () => {
  it("같은 열에서 베이스보다 긴 연속 루비 스팬이 겹치지 않도록 PAVA로 밀어내고 avoidanceBox까지 비겹침을 유지한다", () => {
    // 1글자 베이스 3개에 각각 4~5글자 긴 루비를 연속 부착 → 단순 중심 배치 시 필연적으로 세로 겹침 발생
    const layout = layoutTategakiWithRuby({
      text: "漢字語",
      rubySpans: [
        { start: 0, end: 1, ruby: "かんじよみ" },
        { start: 1, end: 2, ruby: "じのよみ" },
        { start: 2, end: 3, ruby: "ごのよみ" },
      ],
      fontSize: 20,
      rubySizeRatio: 0.5,
      rubyVerticalGapPx: 2,
      avoidancePaddingPx: 1,
    });

    expect(layout.rubyPlacements).toHaveLength(3);
    expect(layout.rubyPlacements.some((r) => r.collisionAdjusted)).toBe(true);

    // 세로 순서 및 최소 간격 엄격 보장
    const [r0, r1, r2] = layout.rubyPlacements;
    expect(r0!.rect.y + r0!.rect.height + 2).toBeLessThanOrEqual(r1!.rect.y + 1e-3);
    expect(r1!.rect.y + r1!.rect.height + 2).toBeLessThanOrEqual(r2!.rect.y + 1e-3);

    // 모든 좌표가 음수 없이 레이아웃 박스 안에 수납
    for (const r of layout.rubyPlacements) {
      expect(r.avoidanceBox.x).toBeGreaterThanOrEqual(0);
      expect(r.avoidanceBox.y).toBeGreaterThanOrEqual(0);
      expect(r.avoidanceBox.x + r.avoidanceBox.width).toBeLessThanOrEqual(layout.width + 1e-2);
      expect(r.avoidanceBox.y + r.avoidanceBox.height).toBeLessThanOrEqual(layout.height + 1e-2);
      // 우측 루비는 베이스 오른쪽 바깥에 위치
      expect(r.rect.x).toBeGreaterThan(r.baseRect.x + r.baseRect.width);
    }

    expect(layout.collisionFree).toBe(true);
    expect(verifyTategakiRubyNonOverlap(layout, { useAvoidanceBoxes: false }).ok).toBe(true);
    expect(verifyTategakiRubyNonOverlap(layout, { useAvoidanceBoxes: true }).ok).toBe(true);
  });

  it("다중 열에서 왼쪽 열의 우측 루비가 오른쪽 인접 열의 베이스 글리프와 충돌하지 않도록 열 피치를 자동 확장한다", () => {
    const text = "東京駅\n新宿駅";
    const layout = layoutTategakiWithRuby({
      text,
      rubySpans: [
        { start: 0, end: 2, ruby: "とうきょう" },
        { start: 4, end: 6, ruby: "しんじゅく" },
      ],
      fontSize: 24,
      lineHeight: 1.1, // 매우 좁은 기본 행간을 주더라도 루비 충돌 회피로 열 간격이 자동 확장되어야 함
      rubySizeRatio: 0.5,
      rubyGapPx: 4,
      rubyColumnClearancePx: 4,
    });

    expect(layout.columns).toHaveLength(2);
    expect(layout.rubyPlacements).toHaveLength(2);

    const col0 = layout.columns[0]!; // 오른쪽 열 ("東京駅")
    const col1 = layout.columns[1]!; // 왼쪽 열 ("新宿駅")
    const col1Ruby = layout.rubyPlacements.find((r) => r.columnIndex === 1)!;
    const col0LeftEdge = col0.centerX - 12;

    // 왼쪽 열 루비의 우측 외곽 + 안전 여백이 오른쪽 열 베이스 좌측 경계를 절대 침범하지 않는다.
    expect(col1Ruby.avoidanceBox.x + col1Ruby.avoidanceBox.width).toBeLessThan(col0LeftEdge);
    expect(col0.centerX - col1.centerX).toBeGreaterThanOrEqual(24 + 4 + 12 + 4);
    expect(layout.collisionFree).toBe(true);
    expect(verifyTategakiRubyNonOverlap(layout, { useAvoidanceBoxes: true }).ok).toBe(true);
  });

  it("rubySide='left' 좌측 루비와 열 경계를 넘는 분할 루비에서도 비겹침을 유지한다", () => {
    const layout = layoutTategakiWithRuby({
      text: "天地玄黄",
      rubySpans: [{ start: 0, end: 4, ruby: "てんちげんこう" }],
      fontSize: 20,
      maxColumnHeightPx: 40, // 2글자씩 2열로 분할 → 루비도 2조각으로 자동 분할
      rubySide: "left",
      lineHeight: 1.1,
    });

    expect(layout.columns).toHaveLength(2);
    expect(layout.rubyPlacements).toHaveLength(2);
    expect(layout.rubyPlacements.map((r) => r.rubyText).join("")).toBe("てんちげんこう");
    for (const r of layout.rubyPlacements) {
      expect(r.side).toBe("left");
      expect(r.rect.x + r.rect.width).toBeLessThan(r.baseRect.x);
    }
    expect(layout.collisionFree).toBe(true);
    expect(verifyTategakiRubyNonOverlap(layout, { useAvoidanceBoxes: true }).ok).toBe(true);
  });

  it("인라인 루비 마크업 파서와 잘못된/겹치는/서로게이트 분할 스팬 방어를 정확히 처리한다", () => {
    const parsed = parseInlineRubyAnnotations("｜魔法剣《まほうけん》와 東京《とうきょう》");
    expect(parsed.text).toBe("魔法剣와 東京");
    expect(parsed.rubySpans).toEqual([
      { start: 0, end: 3, ruby: "まほうけん" },
      { start: 5, end: 7, ruby: "とうきょう" },
    ]);

    // 서로게이트 페어("𠮷" length 2) + 겹치는 스팬 + 빈 루비 + 범위 초과 스팬
    const layout = layoutTategakiWithRuby({
      text: "𠮷野家",
      rubySpans: [
        { start: 0, end: 2, ruby: "よし" },
        { start: 1, end: 3, ruby: "split" }, // surrogate mid-split
        { start: 0, end: 3, ruby: "overlap" }, // overlapping prior span
        { start: 2, end: 3, ruby: "   " }, // empty ruby
        { start: 10, end: 12, ruby: "oob" }, // out of range
      ],
      fontSize: 20,
    });

    expect(layout.rubyPlacements).toHaveLength(1);
    expect(layout.rubyPlacements[0]!.baseText).toBe("𠮷");
    expect(layout.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["split-surrogate-pair", "overlapping-input-span", "empty-ruby", "invalid-range"]),
    );
    expect(layout.collisionFree).toBe(true);
  });
});
