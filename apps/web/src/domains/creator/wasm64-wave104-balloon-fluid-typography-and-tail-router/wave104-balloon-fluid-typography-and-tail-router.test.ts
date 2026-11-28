/**
 * Wave 104 단위 및 시나리오 테스트 (30개 결정적 테스트):
 * 한국어 말풍선 균형 조판 · 얼굴 회피 자동 배치 · 장애물 우회 곡선 베지어 꼬리 라우터 · OKLCH SVG · 한국어 리포트
 */

import { describe, expect, it } from "vitest";
import {
  escapeXmlText,
  isReadingOrderStepMonotonic,
  layoutPanelBalloonsAndRouteTails,
  measureKoreanComicCharWidthPx,
  measureKoreanComicTextWidthPx,
  rectsOverlap,
  renderPanelBalloonLayoutSvg,
  routeCurvedSpeechBalloonTail,
  solveKoreanBalloonTypography,
  summarizeBalloonLayoutAuditKo,
  type BalloonShapeKind,
  type PanelBalloonLayoutSpec,
  type Rect2D,
} from "./index";

const TWO_CHAR_PANEL_BASE = {
  panelId: "P-104-A",
  widthPx: 800,
  heightPx: 680,
  safeMarginPx: 24,
  faceKeepOutBoxes: [
    { id: "face-hero", characterId: "hero", label: "주인공 얼굴", rect: { x: 150, y: 240, width: 130, height: 150 }, paddingPx: 10 },
    { id: "face-rival", characterId: "rival", label: "상대역 얼굴", rect: { x: 520, y: 250, width: 130, height: 150 }, paddingPx: 10 },
  ],
} as const;

describe("Wave 104: 한국어 말풍선 폭 추정 및 균형 조판 솔버", () => {
  it("한글 전각 1.0em, 영문/숫자 0.58em, 공백/문장부호 0.35em 비율을 정확히 계산한다", () => {
    expect(measureKoreanComicCharWidthPx("가", 20)).toBeCloseTo(20, 4);
    expect(measureKoreanComicCharWidthPx("漢", 20)).toBeCloseTo(20, 4);
    expect(measureKoreanComicCharWidthPx("A", 20)).toBeCloseTo(11.6, 4);
    expect(measureKoreanComicCharWidthPx("9", 20)).toBeCloseTo(11.6, 4);
    expect(measureKoreanComicCharWidthPx(" ", 20)).toBeCloseTo(7, 4);
    expect(measureKoreanComicCharWidthPx("!", 20)).toBeCloseTo(7, 4);
  });

  it("한글·영문·숫자·문장부호 혼용 문자열의 총 폭을 결정적으로 합산한다", () => {
    expect(measureKoreanComicTextWidthPx("안녕 A1!", 20)).toBeCloseTo(77.2, 2);
    expect(measureKoreanComicTextWidthPx("", 20)).toBe(0);
  });

  it("한국어 어절(keep-all) 경계를 절대 임의로 자르지 않는다", () => {
    const text = "지금 당장 옥상으로 올라가서 마지막 단서를 확인해야 해!";
    const result = solveKoreanBalloonTypography({ text, shape: "oval-dialogue", fontSizePx: 26, maxLineWidthPx: 210 });
    expect(result.lines.flatMap((l) => l.tokens)).toEqual(text.split(/\s+/));
    expect(result.wordIntegrityPreserved).toBe(true);
    expect(result.forcedHardBreakCount).toBe(0);
  });

  it("마지막 줄 외톨이 글자(1자 이하 어절)를 동적 계획법으로 제거한다", () => {
    const cases = [
      "오늘 저녁에는 반드시 약속 장소에 나와 줘",
      "지금 여기서 포기하면 전부 끝장나는 거야 요",
      "혹시 어젯밤 복도에서 이상한 소리 못 들었어 네?",
    ];
    for (const text of cases) {
      const result = solveKoreanBalloonTypography({ text, shape: "oval-dialogue", fontSizePx: 26, maxLineWidthPx: 230 });
      expect(result.orphanLineCount).toBe(0);
      expect(result.lines.every((l) => !l.isOrphan)).toBe(true);
    }
  });

  it("타원 대사(oval-dialogue) 3줄 이상 조판에서 가운데 줄이 위·아래 줄 이상인 다이아몬드 실루엣을 만든다", () => {
    const result = solveKoreanBalloonTypography({
      text: "지금 여기서 멈추면 그동안 버텨온 우리의 시간이 전부 물거품이 되어버려",
      shape: "oval-dialogue",
      fontSizePx: 26,
      maxLineWidthPx: 320,
    });
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
    const centerW = result.lines[Math.floor(result.lines.length / 2)].widthPx;
    expect(centerW).toBeGreaterThanOrEqual(result.lines[0].widthPx);
    expect(centerW).toBeGreaterThanOrEqual(result.lines[result.lines.length - 1].widthPx);
    expect(result.silhouetteProfile).toBe("diamond-ellipse");
    expect(result.diamondBalanceScore).toBeGreaterThanOrEqual(0.75);
  });

  it("생각 구름(thought-cloud)과 외침(scream-burst)도 다이아몬드 실루엣과 확장 외곽 크기를 산출한다", () => {
    const text = "설마 그 사람이 범인의 진짜 공범이었다는 사실은 아무도 모르겠지";
    const oval = solveKoreanBalloonTypography({ text, shape: "oval-dialogue", fontSizePx: 26, maxLineWidthPx: 300 });
    const cloud = solveKoreanBalloonTypography({ text, shape: "thought-cloud", fontSizePx: 26, maxLineWidthPx: 300 });
    const burst = solveKoreanBalloonTypography({ text, shape: "scream-burst", fontSizePx: 26, maxLineWidthPx: 300 });

    expect(cloud.silhouetteProfile).toBe("diamond-ellipse");
    expect(burst.silhouetteProfile).toBe("diamond-ellipse");
    expect(cloud.balloonWidthPx).toBeGreaterThan(oval.balloonWidthPx);
    expect(burst.balloonWidthPx).toBeGreaterThan(oval.balloonWidthPx);
    expect(burst.balloonHeightPx).toBeGreaterThan(oval.balloonHeightPx);
  });

  it("내레이션 박스(rounded-narration)는 균일한 사각 래그(balanced-rect)로 조판한다", () => {
    const result = solveKoreanBalloonTypography({
      text: "그날 밤 서울역 광장에는 차가운 겨울비가 쉼 없이 내리고 있었다.",
      shape: "rounded-narration",
      fontSizePx: 24,
      maxLineWidthPx: 260,
    });
    expect(result.silhouetteProfile).toBe("balanced-rect");
    expect(result.lines.length).toBeGreaterThanOrEqual(2);
    expect(result.orphanLineCount).toBe(0);
    expect(result.ragVarianceRatio).toBeLessThan(0.32);
  });

  it("속삭임 점선 말풍선(whisper-dashed)을 유한한 크기와 0 외톨이로 조판한다", () => {
    const result = solveKoreanBalloonTypography({
      text: "아무도 못 듣게 조용히 문 뒤로 숨어 있어",
      shape: "whisper-dashed",
      fontSizePx: 22,
      maxLineWidthPx: 220,
    });
    expect(result.shape).toBe("whisper-dashed");
    expect(result.balloonWidthPx).toBeGreaterThan(result.textBlockWidthPx);
    expect(result.balloonHeightPx).toBeGreaterThan(result.textBlockHeightPx);
    expect(result.orphanLineCount).toBe(0);
  });

  it("360px 모바일 가독성 검수에서 작은 폰트를 실패 판정하고 적정 폰트를 승인한다", () => {
    const tiny = solveKoreanBalloonTypography({
      text: "너무 작아서 안 보이는 대사",
      shape: "oval-dialogue",
      fontSizePx: 18,
      referenceCanvasWidthPx: 800,
    });
    expect(tiny.mobileLegibility.effectiveMobileFontPx).toBeCloseTo(8.1, 2);
    expect(tiny.mobileLegibility.meetsMobileLegibility).toBe(false);
    expect(tiny.mobileLegibility.recommendedMinFontSizePx).toBeGreaterThanOrEqual(25.5);

    const readable = solveKoreanBalloonTypography({
      text: "모바일에서도 또렷하게 읽히는 대사",
      shape: "oval-dialogue",
      fontSizePx: 28,
      referenceCanvasWidthPx: 800,
    });
    expect(readable.mobileLegibility.effectiveMobileFontPx).toBeCloseTo(12.6, 2);
    expect(readable.mobileLegibility.meetsMobileLegibility).toBe(true);
  });

  it("빈 문자열·공백·단일 어절 입력을 안전하게 처리한다", () => {
    const empty = solveKoreanBalloonTypography({ text: "   ", shape: "oval-dialogue", fontSizePx: 26 });
    expect(empty.lines).toHaveLength(0);
    expect(empty.balloonWidthPx).toBeGreaterThan(0);
    expect(empty.orphanLineCount).toBe(0);

    const single = solveKoreanBalloonTypography({ text: "잠깐!", shape: "scream-burst", fontSizePx: 28 });
    expect(single.lines).toHaveLength(1);
    expect(single.lines[0].text).toBe("잠깐!");
    expect(single.wordIntegrityPreserved).toBe(true);
  });

  it("최대 박스 폭을 넘는 단일 장문 어절은 무한 루프 없이 안전하게 분할한다", () => {
    const longWord = "초전도체입자가속기중앙제어실비상경보발령";
    const result = solveKoreanBalloonTypography({
      text: longWord,
      shape: "rounded-narration",
      fontSizePx: 24,
      maxLineWidthPx: 150,
    });
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.forcedHardBreakCount).toBeGreaterThan(0);
    expect(result.wordIntegrityPreserved).toBe(false);
    expect(result.lines.map((l) => l.text).join("")).toBe(longWord);
    for (const line of result.lines) expect(line.widthPx).toBeLessThanOrEqual(150.5);
  });
});

describe("Wave 104: 얼굴 회피 다중 말풍선 배치 및 시선 흐름 단조성", () => {
  it("2인 밀집 패널에서 3개 대사 말풍선을 얼굴·상호 겹침 0건 및 안전 여백 내로 배치한다", () => {
    const result = layoutPanelBalloonsAndRouteTails({
      ...TWO_CHAR_PANEL_BASE,
      readingOrder: "korean-webtoon-tb-lr",
      items: [
        { balloonId: "b1", speakerId: "hero", text: "여기까지 따라온 걸 보니 진심이구나.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 225, y: 345 } },
        { balloonId: "b2", speakerId: "rival", text: "당연하지, 약속을 지키러 왔어!", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 575, y: 355 } },
        { balloonId: "b3", speakerId: "hero", text: "좋아, 그럼 지금 결판을 내자.", shape: "scream-burst", fontSizePx: 26, speakerMouthPoint: { x: 225, y: 345 } },
      ],
    });
    expect(result.audit.balloonCount).toBe(3);
    expect(result.audit.faceOverlapCount).toBe(0);
    expect(result.audit.balloonOverlapCount).toBe(0);
    expect(result.audit.outOfSafeMarginCount).toBe(0);
    expect(result.audit.readingOrderMonotonic).toBe(true);
    expect(result.audit.allMobileLegible).toBe(true);
  });

  it("2인 밀집 패널에서 4개 말풍선도 얼굴·말풍선 겹침 0건 및 안전 여백 내로 수용한다", () => {
    const spec: PanelBalloonLayoutSpec = {
      ...TWO_CHAR_PANEL_BASE,
      panelId: "P-104-CROWDED-4",
      heightPx: 760,
      readingOrder: "korean-webtoon-tb-lr",
      items: [
        { balloonId: "c1", speakerId: "hero", text: "문 열쇠는 네가 챙겼지?", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 225, y: 345 } },
        { balloonId: "c2", speakerId: "rival", text: "아까 책상 위에 올려뒀는데.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 575, y: 355 } },
        { balloonId: "c3", speakerId: "hero", text: "설마 경비원이 먼저 가져갔나…", shape: "thought-cloud", fontSizePx: 26, speakerMouthPoint: { x: 225, y: 345 } },
        { balloonId: "c4", speakerId: "rival", text: "지금 바로 되돌아가자!", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 575, y: 355 } },
      ],
    };
    const result = layoutPanelBalloonsAndRouteTails(spec);
    expect(result.audit.balloonCount).toBe(4);
    expect(result.audit.faceOverlapCount).toBe(0);
    expect(result.audit.balloonOverlapCount).toBe(0);
    expect(result.audit.outOfSafeMarginCount).toBe(0);
    expect(result.audit.readingOrderMonotonic).toBe(true);
    for (const placed of result.placedBalloons) {
      expect(placed.containedInSafeBounds).toBe(true);
      for (const face of spec.faceKeepOutBoxes) expect(rectsOverlap(placed.rect, face.rect)).toBe(false);
    }
  });

  it("한국 웹툰형(korean-webtoon-tb-lr)은 위→아래·왼→오 시선 흐름 단조성을 지킨다", () => {
    const result = layoutPanelBalloonsAndRouteTails({
      ...TWO_CHAR_PANEL_BASE,
      readingOrder: "korean-webtoon-tb-lr",
      items: [
        { balloonId: "tb1", speakerId: "hero", text: "첫 번째 대사는 위쪽 왼쪽에서 시작한다.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 220, y: 345 } },
        { balloonId: "tb2", speakerId: "rival", text: "두 번째 대사는 오른쪽이나 아래로 이어진다.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 575, y: 355 } },
      ],
    });
    expect(result.audit.readingOrderMonotonic).toBe(true);
    expect(result.audit.readingOrderViolations).toBe(0);
    expect(result.placedBalloons[0].center.x).toBeLessThan(result.placedBalloons[1].center.x);
  });

  it("출판 만화형(manga-rtl-tb)은 오른→왼·위→아래 시선 흐름 단조성을 지킨다", () => {
    const result = layoutPanelBalloonsAndRouteTails({
      ...TWO_CHAR_PANEL_BASE,
      readingOrder: "manga-rtl-tb",
      items: [
        { balloonId: "rtl1", speakerId: "rival", text: "오른쪽에서 먼저 시작하는 첫 대사다.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 575, y: 355 } },
        { balloonId: "rtl2", speakerId: "hero", text: "왼쪽으로 자연스럽게 이어지는 응답 대사다.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 220, y: 345 } },
        { balloonId: "rtl3", speakerId: "rival", text: "아래쪽에서 마무리하는 세 번째 대사다.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 575, y: 355 } },
      ],
    });
    expect(result.audit.readingOrderMonotonic).toBe(true);
    expect(result.audit.readingOrderViolations).toBe(0);
    expect(result.placedBalloons[0].center.x).toBeGreaterThan(result.placedBalloons[1].center.x);
  });

  it("시선 흐름 단조성 판정 함수가 정상 진행과 역행을 정확히 구분한다", () => {
    const topLeft: Rect2D = { x: 60, y: 50, width: 160, height: 80 };
    const topRight: Rect2D = { x: 520, y: 60, width: 160, height: 80 };
    const lowerLeft: Rect2D = { x: 80, y: 240, width: 160, height: 80 };

    expect(isReadingOrderStepMonotonic(topLeft, topRight, "korean-webtoon-tb-lr")).toBe(true);
    expect(isReadingOrderStepMonotonic(topRight, topLeft, "korean-webtoon-tb-lr")).toBe(false);
    expect(isReadingOrderStepMonotonic(topRight, lowerLeft, "korean-webtoon-tb-lr")).toBe(true);
    expect(isReadingOrderStepMonotonic(lowerLeft, topLeft, "korean-webtoon-tb-lr")).toBe(false);

    expect(isReadingOrderStepMonotonic(topRight, topLeft, "manga-rtl-tb")).toBe(true);
    expect(isReadingOrderStepMonotonic(topLeft, topRight, "manga-rtl-tb")).toBe(false);
    expect(isReadingOrderStepMonotonic(topLeft, lowerLeft, "manga-rtl-tb")).toBe(true);
  });

  it("preferredAnchor 지정 시 장애물이 없으면 해당 구역 근처에 우선 배치한다", () => {
    const result = layoutPanelBalloonsAndRouteTails({
      panelId: "P-ANCHOR",
      widthPx: 800,
      heightPx: 600,
      safeMarginPx: 24,
      readingOrder: "korean-webtoon-tb-lr",
      faceKeepOutBoxes: [],
      items: [{ balloonId: "nar-bottom", speakerId: "narrator", text: "그로부터 사흘 뒤", shape: "rounded-narration", fontSizePx: 26, preferredAnchor: "bottom-right" }],
    });
    expect(result.placedBalloons[0].center.x).toBeGreaterThan(450);
    expect(result.placedBalloons[0].center.y).toBeGreaterThan(360);
    expect(result.placedBalloons[0].containedInSafeBounds).toBe(true);
  });

  it("빈 대사 목록 패널도 오류 없이 유한한 결과를 반환한다", () => {
    const result = layoutPanelBalloonsAndRouteTails({ ...TWO_CHAR_PANEL_BASE, readingOrder: "korean-webtoon-tb-lr", items: [] });
    expect(result.placedBalloons).toHaveLength(0);
    expect(result.audit.balloonCount).toBe(0);
    expect(result.audit.readingOrderMonotonic).toBe(true);
    expect(result.audit.whitespaceCoverageRatio).toBe(1);
  });
});

describe("Wave 104: 장애물 우회 곡선 베지어 꼬리 라우터", () => {
  it("말풍선 꼬리 끝점이 화자 입 좌표에서 mouthClearancePx 거리 앞에서 정확히 멈춘다", () => {
    const mouth = { x: 400, y: 420 };
    const tailDefault = routeCurvedSpeechBalloonTail({
      balloonId: "t1",
      balloonRect: { x: 300, y: 120, width: 200, height: 100 },
      shape: "oval-dialogue",
      speakerId: "hero",
      speakerMouthPoint: mouth,
      mouthClearancePx: 14,
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [],
    });
    expect(tailDefault.tailKind).toBe("pointed-bezier");
    expect(tailDefault.actualMouthDistancePx).toBeCloseTo(14, 1);
    expect(tailDefault.obstacleCrossings).toBe(0);

    const tailCustom = routeCurvedSpeechBalloonTail({
      balloonId: "t2",
      balloonRect: { x: 300, y: 120, width: 200, height: 100 },
      shape: "scream-burst",
      speakerId: "hero",
      speakerMouthPoint: mouth,
      mouthClearancePx: 22,
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [],
    });
    expect(tailCustom.actualMouthDistancePx).toBeCloseTo(22, 1);
  });

  it("직선 경로를 가로막는 타 캐릭터 얼굴 장애물을 곡선 베지어 오프셋으로 우회한다", () => {
    const tail = routeCurvedSpeechBalloonTail({
      balloonId: "t-bend-face",
      balloonRect: { x: 310, y: 60, width: 180, height: 90 },
      shape: "oval-dialogue",
      speakerId: "hero",
      speakerMouthPoint: { x: 400, y: 460 },
      mouthClearancePx: 14,
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [{ id: "face-blocker", kind: "face", rect: { x: 350, y: 230, width: 100, height: 110 } }],
    });
    expect(tail.tailKind).toBe("pointed-bezier");
    expect(tail.obstacleCrossings).toBe(0);
    expect(Math.abs(tail.bendOffsetPx)).toBeGreaterThan(20);
  });

  it("직선 경로를 가로막는 다른 말풍선 장애물도 곡선 꼬리로 깔끔하게 우회한다", () => {
    const tail = routeCurvedSpeechBalloonTail({
      balloonId: "t-bend-balloon",
      balloonRect: { x: 80, y: 70, width: 180, height: 90 },
      shape: "whisper-dashed",
      speakerId: "hero",
      speakerMouthPoint: { x: 560, y: 390 },
      mouthClearancePx: 16,
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [{ id: "other-balloon", kind: "balloon", rect: { x: 290, y: 210, width: 150, height: 85 } }],
    });
    expect(tail.obstacleCrossings).toBe(0);
    expect(Math.abs(tail.bendOffsetPx)).toBeGreaterThan(10);
  });

  it("내레이션은 꼬리를 생략(none)하고 생각 구름은 점진적 방울 꼬리(thought-bubbles)를 생성한다", () => {
    const narration = routeCurvedSpeechBalloonTail({
      balloonId: "nar-1",
      balloonRect: { x: 40, y: 40, width: 220, height: 80 },
      shape: "rounded-narration",
      speakerId: "narrator",
      speakerMouthPoint: { x: 200, y: 300 },
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [],
    });
    expect(narration.tailKind).toBe("none");
    expect(narration.tipPoint).toBeNull();

    const thought = routeCurvedSpeechBalloonTail({
      balloonId: "cloud-1",
      balloonRect: { x: 40, y: 40, width: 220, height: 110 },
      shape: "thought-cloud",
      speakerId: "hero",
      speakerMouthPoint: { x: 220, y: 340 },
      mouthClearancePx: 14,
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [],
    });
    expect(thought.tailKind).toBe("thought-bubbles");
    expect(thought.thoughtBubbles).toHaveLength(3);
    expect(thought.thoughtBubbles[0].radiusPx).toBeGreaterThan(thought.thoughtBubbles[1].radiusPx);
    expect(thought.thoughtBubbles[1].radiusPx).toBeGreaterThan(thought.thoughtBubbles[2].radiusPx);
    expect(thought.actualMouthDistancePx).toBeCloseTo(14, 1);
  });

  it("화자 입 좌표가 생략된 대사 말풍선은 꼬리 없이(none) 처리한다", () => {
    const offscreen = routeCurvedSpeechBalloonTail({
      balloonId: "offscreen",
      balloonRect: { x: 100, y: 80, width: 180, height: 80 },
      shape: "oval-dialogue",
      speakerId: "offscreen-voice",
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [],
    });
    expect(offscreen.tailKind).toBe("none");
    expect(offscreen.obstacleCrossings).toBe(0);
  });

  it("복수 화자 패널에서 꼬리 장애물 통과 0건과 꼬리 상호 교차 0건을 달성한다", () => {
    const result = layoutPanelBalloonsAndRouteTails({
      ...TWO_CHAR_PANEL_BASE,
      readingOrder: "korean-webtoon-tb-lr",
      items: [
        { balloonId: "x1", speakerId: "hero", text: "내가 먼저 왼쪽에서 상황을 정리할게.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 220, y: 345 } },
        { balloonId: "x2", speakerId: "rival", text: "그럼 나는 오른쪽 출구를 막고 있을게.", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 580, y: 355 } },
        { balloonId: "x3", speakerId: "hero", text: "신호 주면 동시에 움직이자!", shape: "oval-dialogue", fontSizePx: 26, speakerMouthPoint: { x: 220, y: 345 } },
      ],
    });
    expect(result.audit.tailObstacleCrossings).toBe(0);
    expect(result.audit.tailPairCrossingCount).toBe(0);
    expect(result.audit.crossingTailPairs).toHaveLength(0);
  });

  it("교차 위험이 있는 반대편 화자 꼬리도 기존 꼬리 경로를 피해 곡선으로 우회한다", () => {
    const tailA = routeCurvedSpeechBalloonTail({
      balloonId: "cross-a",
      balloonRect: { x: 520, y: 40, width: 180, height: 80 },
      shape: "oval-dialogue",
      speakerId: "hero",
      speakerMouthPoint: { x: 180, y: 420 },
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [],
    });
    const tailB = routeCurvedSpeechBalloonTail({
      balloonId: "cross-b",
      balloonRect: { x: 100, y: 40, width: 180, height: 80 },
      shape: "oval-dialogue",
      speakerId: "rival",
      speakerMouthPoint: { x: 620, y: 420 },
      panelBounds: { x: 0, y: 0, width: 800, height: 600 },
      obstacles: [],
      existingTailCenterlines: [tailA.centerlineSamples],
    });
    expect(tailA.obstacleCrossings).toBe(0);
    expect(tailB.obstacleCrossings).toBe(0);
    expect(Math.abs(tailB.bendOffsetPx)).toBeGreaterThan(0);
  });
});

describe("Wave 104: 결정성, OKLCH SVG 렌더링 및 한국어 식자 리포트", () => {
  const allShapesSpec: PanelBalloonLayoutSpec = {
    panelId: "P-ALL-5",
    widthPx: 920,
    heightPx: 860,
    safeMarginPx: 24,
    readingOrder: "korean-webtoon-tb-lr",
    faceKeepOutBoxes: [
      { id: "face-1", characterId: "minji", label: "민지 <주인공>", rect: { x: 180, y: 320, width: 120, height: 140 } },
      { id: "face-2", characterId: "junho", label: "준호 & 조력자", rect: { x: 610, y: 340, width: 120, height: 140 } },
    ],
    items: [
      { balloonId: "s-nar", speakerId: "narrator", text: "그날 밤 <옥상> & 비상구 앞", shape: "rounded-narration", fontSizePx: 28, preferredAnchor: "top-left" },
      { balloonId: "s-oval", speakerId: "minji", text: "지금 바로 출발해야 막차를 탈 수 있어!", shape: "oval-dialogue", fontSizePx: 28, speakerMouthPoint: { x: 245, y: 420 } },
      { balloonId: "s-whisper", speakerId: "junho", text: "조용히 해, 저기 발소리가 들려…", shape: "whisper-dashed", fontSizePx: 28, speakerMouthPoint: { x: 660, y: 440 } },
      { balloonId: "s-cloud", speakerId: "minji", text: "열쇠를 가방에 넣었던가?", shape: "thought-cloud", fontSizePx: 28, speakerMouthPoint: { x: 245, y: 420 } },
      { balloonId: "s-burst", speakerId: "junho", text: "뒤쪽 문이 열렸다!", shape: "scream-burst", fontSizePx: 30, speakerMouthPoint: { x: 660, y: 440 } },
    ],
  };

  it("동일 입력에 대해 배치 결과와 SVG 문자열이 100% 결정적으로 일치한다", () => {
    const run1 = layoutPanelBalloonsAndRouteTails(allShapesSpec);
    const run2 = layoutPanelBalloonsAndRouteTails(allShapesSpec);
    expect(run1).toEqual(run2);
    expect(renderPanelBalloonLayoutSvg(run1)).toBe(renderPanelBalloonLayoutSvg(run2));
  });

  it("5종 말풍선, 빗금 얼굴 영역, 번호 시선 흐름(1→5), 곡선 꼬리 및 생각 방울을 SVG로 렌더링한다", () => {
    const layout = layoutPanelBalloonsAndRouteTails(allShapesSpec);
    const svg = renderPanelBalloonLayoutSvg(layout);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    const expectedShapes: readonly BalloonShapeKind[] = [
      "rounded-narration", "oval-dialogue", "whisper-dashed", "thought-cloud", "scream-burst",
    ];
    for (const shape of expectedShapes) expect(svg).toContain(`data-balloon-shape="${shape}"`);
    expect(svg).toContain("wave104-face-hatch");
    expect(svg).toContain('data-reading-step="1"');
    expect(svg).toContain('data-reading-step="5"');
    expect(svg).toContain("<polyline");
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it("SVG 출력에 NaN/Infinity와 원시 HEX/RGB 색상이 없고 OKLCH와 XML 이스케이프만 사용한다", () => {
    const layout = layoutPanelBalloonsAndRouteTails(allShapesSpec);
    const lightSvg = renderPanelBalloonLayoutSvg(layout, { theme: "light", title: `패널 <검수> & "인쇄" '확인'` });
    const darkSvg = renderPanelBalloonLayoutSvg(layout, { theme: "dark" });

    const hexColorPattern = new RegExp("#[0-9a-fA-F]{3,8}\\b");
    const rgbColorPattern = new RegExp("\\brgba?\\(", "i");
    for (const svg of [lightSvg, darkSvg]) {
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
      expect(svg).toContain("oklch(");
      expect(hexColorPattern.test(svg)).toBe(false);
      expect(rgbColorPattern.test(svg)).toBe(false);
    }

    expect(lightSvg).toContain("&lt;옥상&gt;");
    expect(lightSvg).toContain("&amp; 비상구 앞");
    expect(lightSvg).toContain("&lt;검수&gt; &amp; &quot;인쇄&quot; &apos;확인&apos;");
    expect(escapeXmlText(`<a&"b'>`)).toBe("&lt;a&amp;&quot;b&apos;&gt;");
  });

  it("자연스러운 한국어 식자 검수 리포트가 핵심 지표를 모두 보고하고 번역투를 쓰지 않는다", () => {
    const layout = layoutPanelBalloonsAndRouteTails({
      ...TWO_CHAR_PANEL_BASE,
      readingOrder: "korean-webtoon-tb-lr",
      items: [
        { balloonId: "r1", speakerId: "hero", text: "이번 컷은 모바일에서도 선명하게 읽혀야 해.", shape: "oval-dialogue", fontSizePx: 28, speakerMouthPoint: { x: 220, y: 345 } },
        { balloonId: "r2", speakerId: "rival", text: "알았어, 얼굴도 안 가리고 깔끔하게 정리하자.", shape: "oval-dialogue", fontSizePx: 28, speakerMouthPoint: { x: 580, y: 355 } },
      ],
    });
    const summary = summarizeBalloonLayoutAuditKo(layout);
    expect(summary.verdict).toBe("pass");
    expect(summary.verdictLabelKo).toBe("식자 검수 통과");
    expect(summary.bulletLinesKo).toHaveLength(6);

    const joined = [summary.headlineKo, summary.summaryParagraphKo, ...summary.bulletLinesKo].join(" ");
    expect(joined).toContain("얼굴 겹침 0건");
    expect(joined).toContain("말풍선 겹침 0건");
    expect(joined).toContain("외톨이 줄 0건");
    expect(joined).toContain("모바일 360px");
    expect(joined).not.toContain("하는 것을 가능하게");
    expect(joined).not.toContain("직관적인 경험을 제공");
    expect(joined).not.toContain("원활한 워크플로우를 보장");
  });

  it("모바일 360px 가독성 미달 말풍선이 있으면 리포트가 경고(warn)와 미달 ID를 보고한다", () => {
    const layout = layoutPanelBalloonsAndRouteTails({
      ...TWO_CHAR_PANEL_BASE,
      readingOrder: "korean-webtoon-tb-lr",
      items: [
        { balloonId: "tiny-b1", speakerId: "hero", text: "글자가 너무 작아서 스마트폰에서 뭉개지는 대사", shape: "oval-dialogue", fontSizePx: 18, speakerMouthPoint: { x: 220, y: 345 } },
      ],
    });
    expect(layout.audit.allMobileLegible).toBe(false);
    expect(layout.audit.mobileLegibilityFailureIds).toContain("tiny-b1");
    const summary = summarizeBalloonLayoutAuditKo(layout);
    expect(summary.verdict).toBe("warn");
    expect(summary.summaryParagraphKo).toContain("tiny-b1");
  });
});
