import { describe, expect, it } from "vitest";

import {
  layoutKoreanVerticalRubyBalloon,
  typesetKoreanEllipticalBalloon,
} from "../lettering/studio-korean-bubble-boolean-typesetting";
import {
  planEllipticalBalloonTypography,
  planVerticalRubyTypography,
} from "../lettering/studio-bubble-typography";

import {
  computeEllipseChordWidth,
  computePunctuationOpticalKerning,
  createDefaultBalloonTextMeasurer,
  isKoreanBoundLineEndToken,
  isKoreanBoundLineStartToken,
  typesetKnuthPlassEllipticalBalloon,
} from "./studio-knuth-plass-balloon-typeset";

/**
 * 단순 그리디 줄바꿈 비교 기준선(상단 줄부터 무조건 최대로 채우는 방식).
 * Knuth-Plass 타원 DP가 그리디 대비 다이아몬드 균형도와 고아줄 방지에서 우월함을 검증한다.
 */
function greedyWrapAtMaxWidth(text: string, maxWidthPx: number, fontSize: number): string[] {
  const measurer = createDefaultBalloonTextMeasurer();
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measurer.measureWidth(next, fontSize, "Pretendard", "bold") > maxWidthPx) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

describe("computeEllipseChordWidth — 타원 곡률 가용 현 폭 공식", () => {
  it("중심(y=0)에서 2*rx, 임의의 y에서 2*rx*sqrt(1-(y/ry)^2), 경계 밖(|y|>=ry)에서 0을 반환한다", () => {
    expect(computeEllipseChordWidth(120, 80, 0)).toBeCloseTo(240, 6);
    expect(computeEllipseChordWidth(120, 80, 40)).toBeCloseTo(240 * Math.sqrt(1 - 0.25), 6);
    expect(computeEllipseChordWidth(120, 80, -40)).toBeCloseTo(240 * Math.sqrt(1 - 0.25), 6);
    expect(computeEllipseChordWidth(120, 80, 80)).toBe(0);
    expect(computeEllipseChordWidth(120, 80, -85)).toBe(0);
    expect(computeEllipseChordWidth(0, 80, 0)).toBe(0);
    expect(computeEllipseChordWidth(120, Number.NaN, 0)).toBe(0);
  });
});

describe("typesetKnuthPlassEllipticalBalloon — 다이아몬드 균형 & 타원 곡률 적합", () => {
  it("타원 말풍선에서 각 줄 y좌표의 실제 현 폭에 맞춰 중앙이 가장 넓은 다이아몬드형 배치를 산출한다", () => {
    const text = "정말 믿을 수가 없어 오늘 밤 옥상에서 모든 비밀을 반드시 밝혀내고 말겠어";
    const result = typesetKnuthPlassEllipticalBalloon(
      text,
      { rx: 125, ry: 72, paddingX: 10, paddingY: 8 },
      { fontSize: 18, lineHeight: 1.35, opticalCenterOffsetRatio: 0 },
    );

    expect(result.cssWordBreak).toBe("keep-all");
    expect(result.overflow).toBe(false);
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    expect(result.lines.map((l) => l.text).join(" ")).toBe(text);

    // 모든 줄의 availableWidthPx가 정확히 2*effRx*sqrt(1-(y/effRy)^2) 공식과 일치해야 한다.
    for (const line of result.lines) {
      const expectedChord = computeEllipseChordWidth(
        result.ellipse.effectiveRx,
        result.ellipse.effectiveRy,
        line.yOffsetPx,
      );
      expect(line.availableWidthPx).toBeCloseTo(expectedChord, 2);
      expect(line.overflowPx).toBe(0);
    }

    // 중앙 줄의 폭이 상단/하단 끝 줄 평균보다 넓고 다이아몬드 균형도가 높아야 한다.
    const firstW = result.lines[0]!.opticalWidthPx;
    const lastW = result.lines[result.lines.length - 1]!.opticalWidthPx;
    const midIdx = Math.floor(result.lines.length / 2);
    const midW = result.lines[midIdx]!.opticalWidthPx;
    expect(midW).toBeGreaterThanOrEqual((firstW + lastW) / 2);
    expect(result.diamondBalanceScore).toBeGreaterThanOrEqual(0.75);

    // 그리디 워드랩 대비 상하 대칭 편차가 작다.
    const greedy = greedyWrapAtMaxWidth(text, result.ellipse.effectiveRx * 2, 18);
    const measurer = createDefaultBalloonTextMeasurer();
    const greedyFirst = measurer.measureWidth(greedy[0] ?? "", 18, "Pretendard", "bold");
    const greedyLast = measurer.measureWidth(greedy[greedy.length - 1] ?? "", 18, "Pretendard", "bold");
    const greedyAsymmetry = Math.abs(greedyFirst - greedyLast);
    const kpAsymmetry = Math.abs(firstW - lastW);
    expect(kpAsymmetry).toBeLessThan(greedyAsymmetry);
  });

  it("명시적 줄바꿈(\\n) 문단 경계를 보존하면서 각 문단을 타원 현에 맞춰 조판한다", () => {
    const text = "잠깐만 기다려 줘\n지금 당장 달려갈게!";
    const result = typesetKnuthPlassEllipticalBalloon(
      text,
      { rx: 130, ry: 75 },
      { fontSize: 18, lineHeight: 1.35 },
    );

    expect(result.lines.length).toBeGreaterThanOrEqual(2);
    expect(result.lines[0]!.text).toContain("잠깐만");
    expect(result.lines[result.lines.length - 1]!.text).toContain("달려갈게!");
    expect(result.overflow).toBe(false);
  });

  it("빈 문자열이나 공백만 있으면 예외 없이 빈 결과를 반환한다", () => {
    const empty = typesetKnuthPlassEllipticalBalloon("   \n  ", { rx: 100, ry: 60 });
    expect(empty.lines).toEqual([]);
    expect(empty.overflow).toBe(false);
    expect(empty.diamondBalanceScore).toBe(1);
    expect(empty.widowOrOrphanCount).toBe(0);
  });
});

describe("한국어 keep-all 어절 무결성, 조사·어미 분리 방지 및 고아줄 억제", () => {
  it("한국어 어절을 중간에서 쪼개지 않고(keep-all) 마지막 줄 1음절 고아줄(widow)을 방지한다", () => {
    const text = "오늘 오후까지 최종 원고를 완성해야 해!";
    const result = typesetKnuthPlassEllipticalBalloon(
      text,
      { rx: 130, ry: 70, paddingX: 10, paddingY: 8 },
      { fontSize: 18, lineHeight: 1.35 },
    );

    expect(result.lines.length).toBeGreaterThanOrEqual(2);
    expect(result.lines.map((l) => l.text).join(" ")).toBe(text);
    // 마지막 줄에 '해!' 혼자 외롭게 남지 않아야 한다.
    const lastLine = result.lines[result.lines.length - 1]!;
    expect(lastLine.text.trim()).not.toBe("해!");
    expect(result.widowOrOrphanCount).toBe(0);
    // 어절 무결성 확인
    for (const line of result.lines) {
      expect(line.text).not.toMatch(/완성$/);
      expect(line.text).not.toMatch(/^해야/);
    }
  });

  it("공백으로 떨어진 단독 조사·어미·의존명사가 다음 줄 첫머리로 분리되지 않도록 결합을 유지한다", () => {
    expect(isKoreanBoundLineStartToken("에서")).toBe(true);
    expect(isKoreanBoundLineStartToken("가")).toBe(true);
    expect(isKoreanBoundLineStartToken("것")).toBe(true);
    expect(isKoreanBoundLineStartToken("?!")).toBe(true);
    expect(isKoreanBoundLineEndToken("그")).toBe(true);
    expect(isKoreanBoundLineEndToken("「")).toBe(true);

    const text = "우리 학교 에서 친구 가 꼭 기다릴 것 같아";
    const result = typesetKnuthPlassEllipticalBalloon(
      text,
      { rx: 118, ry: 78, paddingX: 8, paddingY: 8 },
      { fontSize: 18, lineHeight: 1.35 },
    );

    expect(result.lines.length).toBeGreaterThanOrEqual(2);
    expect(result.particleBreakCount).toBe(0);
    for (let i = 1; i < result.lines.length; i += 1) {
      const firstWord = result.lines[i]!.text.split(" ")[0] ?? "";
      expect(isKoreanBoundLineStartToken(firstWord)).toBe(false);
    }
  });

  it("단일 초대형 어절이 타원 최대 폭을 초과해도 무한 루프 없이 금칙 분할 후 hardBreakOccurred를 표시한다", () => {
    const megaWord = "으아아아아아아아아아아아아아아아아악?!";
    const result = typesetKnuthPlassEllipticalBalloon(
      megaWord,
      { rx: 65, ry: 60, paddingX: 8, paddingY: 6 },
      { fontSize: 18 },
    );

    expect(result.hardBreakOccurred).toBe(true);
    expect(result.lines.length).toBeGreaterThanOrEqual(2);
    expect(result.lines.map((l) => l.text).join("")).toBe(megaWord);
    // 마지막 줄 첫머리에 '?''!'만 떨어지지 않는다.
    expect(result.lines[result.lines.length - 1]!.text.startsWith("?")).toBe(false);
  });
});

describe("문장부호 광학 커닝 및 행단 광학 돌출(Optical Margin)", () => {
  it("연속 약물(」「, 」。, !?, AV)에 음수 광학 커닝을 적용해 시각 폭을 보정한다", () => {
    const kerned = computePunctuationOpticalKerning("「잠깐」「뭐라고?!」。", 20);
    expect(kerned.totalDeltaPx).toBeLessThan(0);
    expect(kerned.adjustments.some((adj) => adj.left === "」" && adj.right === "「")).toBe(true);
    expect(kerned.adjustments.some((adj) => adj.left === "?" && adj.right === "!")).toBe(true);
    expect(kerned.adjustments.some((adj) => adj.left === "」" && adj.right === "。")).toBe(true);

    const withKerning = typesetKnuthPlassEllipticalBalloon(
      "「정말?!」「말도 안 돼!!」",
      { rx: 140, ry: 60 },
      { fontSize: 20, opticalKerning: true },
    );
    const withoutKerning = typesetKnuthPlassEllipticalBalloon(
      "「정말?!」「말도 안 돼!!」",
      { rx: 140, ry: 60 },
      { fontSize: 20, opticalKerning: false },
    );
    expect(withKerning.lines[0]!.kerningDeltaPx).toBeLessThan(0);
    expect(withKerning.lines[0]!.opticalWidthPx).toBeLessThan(withoutKerning.lines[0]!.opticalWidthPx);
    expect(withKerning.lines[0]!.opticalLeftHangPx).toBeGreaterThan(0);
    expect(withKerning.lines[0]!.opticalRightHangPx).toBeGreaterThan(0);
  });
});

describe("기존 식자 진입점 연결 검증", () => {
  it("studio-korean-bubble-boolean-typesetting 및 studio-bubble-typography 진입점이 프로 엔진에 정상 연결된다", () => {
    const koreanResult = typesetKoreanEllipticalBalloon(
      "지금 당장 옥상으로 올라와야 해!",
      { rx: 115, ry: 68 },
      { fontSize: 18 },
    );
    expect(koreanResult.lines.length).toBeGreaterThanOrEqual(2);
    expect(koreanResult.widowOrOrphanCount).toBe(0);

    const typoResult = planEllipticalBalloonTypography(
      "오늘 날씨가 정말 좋네요!",
      220,
      132,
      16,
    );
    expect(typoResult.lines.length).toBeGreaterThanOrEqual(1);
    expect(typoResult.overflow).toBe(false);

    const inlineRuby = layoutKoreanVerticalRubyBalloon({
      text: "東京《とうきょう》12시!?",
      fontSize: 20,
    });
    expect(inlineRuby.collisionFree).toBe(true);
    expect(inlineRuby.rubyPlacements).toHaveLength(1);
    expect(inlineRuby.rubyPlacements[0]!.rubyText).toBe("とうきょう");

    const directVertical = planVerticalRubyTypography({
      text: "첫째줄\n둘째줄",
      fontSize: 20,
    });
    expect(directVertical.columns).toHaveLength(2);
    expect(directVertical.columns[0]!.centerX).toBeGreaterThan(directVertical.columns[1]!.centerX);
  });
});
