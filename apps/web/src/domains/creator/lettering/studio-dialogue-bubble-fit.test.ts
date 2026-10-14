import { describe, expect, it } from "vitest";

import {
  groupBubbleFitWarnings,
  previewDialogueBubbleFit,
  type BubbleFitPageLike,
} from "./studio-dialogue-bubble-fit";
import type { BubbleTextMeasurer } from "./studio-bubble-text-fit";

// 결정적 가짜 측정기 — text-fit 테스트와 같은 관례(글자당 fontPx*charFactor px).
function fakeMeasurer(charFactor = 0.6): BubbleTextMeasurer {
  return {
    measureWidth(text, fontPx) {
      return text.length * fontPx * charFactor;
    },
  };
}

const measurer = fakeMeasurer(0.6);

// fontSize 24 기준: 좌우 패딩 max(12, 24*0.6=14.4→14)*2=28, 상하 패딩 12+15=27(반올림 합).
// 글자 폭 = 24*0.6 = 14.4px. 폭 200 상자면 텍스트 폭 172 → 한 줄 11자까지.
// 행간 폴백(테마 미지정) = 1.4 → 한 줄 높이 33.6px, 안전 여유 0.94.
function bubblePage(
  elements: BubbleFitPageLike["elements"],
  pageId = "page-1"
): BubbleFitPageLike[] {
  return [{ id: pageId, elements }];
}

describe("previewDialogueBubbleFit — 기본(높이 확장) 모드", () => {
  it("짧은 대사가 넉넉한 상자에 들어가면 경고가 없다", () => {
    const result = previewDialogueBubbleFit(
      bubblePage([
        { id: "b1", type: "bubble", text: "안녕", width: 200, height: 120, fontSize: 24 },
      ]),
      { measurer }
    );
    expect(result.warnings).toEqual([]);
    expect(result.summary).toMatchObject({
      totalBubbleCount: 1,
      checkedCount: 1,
      okCount: 1,
      warningCount: 0,
    });
  });

  it("긴 대사는 overflow로 잡히고 부족 높이가 숫자로 나온다", () => {
    const text = "이 대사는 말풍선에 다 들어가지 않을 만큼 아주 길게 이어지는 대사입니다";
    const result = previewDialogueBubbleFit(
      bubblePage([{ id: "b1", type: "bubble", text, width: 200, height: 70, fontSize: 24 }]),
      { measurer }
    );
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.kind).toBe("overflow");
    expect(warning.severity).toBe("warning");
    expect(warning.itemId).toBe("b1");
    expect(warning.pageIndex).toBe(0);
    expect(warning.requiredHeight).toBeGreaterThan(70);
    expect(warning.overflowPx).toBe(warning.requiredHeight! - 70);
    expect(warning.message).toContain(`${warning.overflowPx}px 부족`);
    expect(result.summary.overflowCount).toBe(1);
    expect(result.summary.affectedPageCount).toBe(1);
  });

  it("상자를 필요한 높이까지 키우면 같은 대사가 경고에서 사라진다 (엔진 판정과 일치)", () => {
    const text = "이 대사는 말풍선에 다 들어가지 않을 만큼 아주 길게 이어지는 대사입니다";
    const first = previewDialogueBubbleFit(
      bubblePage([{ id: "b1", type: "bubble", text, width: 200, height: 70, fontSize: 24 }]),
      { measurer }
    );
    const required = first.warnings[0]!.requiredHeight!;
    const second = previewDialogueBubbleFit(
      bubblePage([
        { id: "b1", type: "bubble", text, width: 200, height: required, fontSize: 24 },
      ]),
      { measurer }
    );
    expect(second.warnings).toEqual([]);
    expect(second.summary.okCount).toBe(1);
  });

  it("명시 줄바꿈이 많은 대사도 줄 수 기준으로 넘침을 잡는다", () => {
    const result = previewDialogueBubbleFit(
      bubblePage([
        { id: "b1", type: "bubble", text: "하나\n둘\n셋\n넷\n다섯", width: 200, height: 80, fontSize: 24 },
      ]),
      { measurer }
    );
    expect(result.warnings.map((w) => w.kind)).toEqual(["overflow"]);
  });
});

describe("previewDialogueBubbleFit — 자동 축소(크기 고정) 모드", () => {
  it("축소로 들어가는 대사는 shrink로, 줄어들 폰트 크기를 알려준다", () => {
    const text = "이 대사는 말풍선에 다 들어가지 않을 만큼 아주 길게 이어지는 대사입니다";
    const result = previewDialogueBubbleFit(
      bubblePage([
        {
          id: "b1",
          type: "bubble",
          text,
          width: 200,
          height: 70,
          fontSize: 24,
          autoShrinkText: true,
        },
      ]),
      { measurer }
    );
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.kind).toBe("shrink");
    expect(warning.severity).toBe("info");
    expect(warning.fittedFontSize).toBeLessThan(24);
    expect(warning.fittedFontSize).toBeGreaterThanOrEqual(10);
    expect(result.summary.shrinkCount).toBe(1);
  });

  it("축소 하한에서도 못 들어가면 overflow로 승격된다", () => {
    const text = "가".repeat(400);
    const result = previewDialogueBubbleFit(
      bubblePage([
        {
          id: "b1",
          type: "bubble",
          text,
          width: 120,
          height: 60,
          fontSize: 24,
          autoShrinkText: true,
          autoShrinkMinFontSize: 18,
        },
      ]),
      { measurer }
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.kind).toBe("overflow");
    expect(result.warnings[0]!.message).toContain("자동 축소 하한(18px)");
  });
});

describe("previewDialogueBubbleFit — 정직성 규칙", () => {
  it("크기가 없는 말풍선은 '들어간다'가 아니라 unmeasurable로 따로 센다", () => {
    const result = previewDialogueBubbleFit(
      bubblePage([{ id: "b1", type: "bubble", text: "안녕" }]),
      { measurer }
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.kind).toBe("unmeasurable");
    expect(result.warnings[0]!.boxWidth).toBeNull();
    expect(result.summary).toMatchObject({
      totalBubbleCount: 1,
      checkedCount: 0,
      okCount: 0,
      warningCount: 0,
      unmeasurableCount: 1,
    });
  });

  it("너비나 높이가 0·NaN이면 unmeasurable이다", () => {
    const result = previewDialogueBubbleFit(
      bubblePage([
        { id: "b1", type: "bubble", text: "안녕", width: 0, height: 100 },
        { id: "b2", type: "bubble", text: "안녕", width: 100, height: Number.NaN },
      ]),
      { measurer }
    );
    expect(result.warnings.map((w) => w.kind)).toEqual(["unmeasurable", "unmeasurable"]);
  });

  it("텍스트 요소는 말풍선 핏 대상이 아니다", () => {
    const result = previewDialogueBubbleFit(
      bubblePage([{ id: "t1", type: "text", text: "아주 긴 텍스트 ".repeat(30) }]),
      { measurer }
    );
    expect(result.summary.totalBubbleCount).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("숨김 말풍선은 기본 제외, includeHidden이면 검사한다", () => {
    const pages = bubblePage([
      { id: "b1", type: "bubble", text: "안녕", width: 200, height: 120, hidden: true },
    ]);
    expect(previewDialogueBubbleFit(pages, { measurer }).summary.totalBubbleCount).toBe(0);
    expect(
      previewDialogueBubbleFit(pages, { measurer, includeHidden: true }).summary
        .totalBubbleCount
    ).toBe(1);
  });

  it("잠긴 말풍선도 검사한다 (읽기는 잠금과 무관)", () => {
    const result = previewDialogueBubbleFit(
      bubblePage([
        {
          id: "b1",
          type: "bubble",
          text: "이 대사는 말풍선에 다 들어가지 않을 만큼 아주 길게 이어지는 대사입니다",
          width: 200,
          height: 70,
          fontSize: 24,
          locked: true,
        },
      ]),
      { measurer }
    );
    expect(result.summary.overflowCount).toBe(1);
  });

  it("fontSize 미지정이면 기본값 24로 판정한다", () => {
    const result = previewDialogueBubbleFit(
      bubblePage([
        {
          id: "b1",
          type: "bubble",
          text: "이 대사는 말풍선에 다 들어가지 않을 만큼 아주 길게 이어지는 대사입니다",
          width: 200,
          height: 70,
        },
      ]),
      { measurer }
    );
    expect(result.warnings[0]!.fontSize).toBe(24);
    expect(result.warnings[0]!.kind).toBe("overflow");
  });

  it("입력 페이지를 변형하지 않는다", () => {
    const pages = bubblePage([
      { id: "b1", type: "bubble", text: "안녕", width: 200, height: 120 },
    ]);
    const snapshot = JSON.stringify(pages);
    previewDialogueBubbleFit(pages, { measurer });
    expect(JSON.stringify(pages)).toBe(snapshot);
  });
});

describe("groupBubbleFitWarnings", () => {
  it("페이지 순서대로 묶고 페이지가 바뀌면 새 그룹을 만든다", () => {
    const pages: BubbleFitPageLike[] = [
      {
        id: "page-1",
        elements: [
          { id: "b1", type: "bubble", text: "안녕", width: 10, height: 10 },
          { id: "b2", type: "bubble", text: "안녕" },
        ],
      },
      {
        id: "page-2",
        elements: [{ id: "b3", type: "bubble", text: "안녕", width: 10, height: 10 }],
      },
    ];
    const { warnings, summary } = previewDialogueBubbleFit(pages, { measurer });
    const groups = groupBubbleFitWarnings(warnings);
    expect(groups.map((g) => g.pageId)).toEqual(["page-1", "page-2"]);
    expect(groups[0]!.warnings.map((w) => w.itemId)).toEqual(["b1", "b2"]);
    expect(groups[1]!.warnings.map((w) => w.itemId)).toEqual(["b3"]);
    expect(summary.affectedPageCount).toBe(2);
  });
});
