import { describe, expect, it } from "vitest";

import {
  analyzeDialogueProsody,
  applyAffineMatrix2D,
  balanceHangulDialogueLines,
  buildDropShadowMatrix,
  computeOutwardStrokeOffsetPolygon,
  distancePointToRect,
  generateProceduralBalloonContour,
  hasPolygonSelfIntersection,
  measureOpticalTextUnits,
  suggestHangulSfxWarpPreset,
  warpHangulSfxPath,
  type BalloonContourVariant,
  type HangulSfxWarpMode,
  type Point2D,
  type Rect2D,
  type SfxGlyphInput,
} from "./index";

describe("wasm64-wave47-acoustic-balloon-sfx-shaper", () => {
  it("1. 차분한 한국어·영어 대사를 calm 감정과 낮은 강도로 분류한다", () => {
    const ko = analyzeDialogueProsody({ text: "오늘 오후 회의실에서 천천히 이야기해요~" });
    const en = analyzeDialogueProsody({ text: "Let's review the storyboard draft together." });
    expect(ko.emotion).toBe("calm");
    expect(ko.emotionLabelKo).toBe("차분한 대사");
    expect(ko.intensity).toBeGreaterThanOrEqual(0.1);
    expect(ko.intensity).toBeLessThanOrEqual(0.45);
    expect(ko.recommendedBalloonStyle).toBe("ellipse");
    expect(en.emotion).toBe("calm");
  });

  it("2. 괄호 속삭임과 낮은 음성 에너지·기식음 프로파일을 whisper로 분류한다", () => {
    const bracketed = analyzeDialogueProsody({ text: "(조용히 해... 아무도 들으면 안 돼)" });
    const acoustic = analyzeDialogueProsody({
      text: "쉿, 저 문 뒤를 봐...",
      prosody: { rmsDb: -40, peakEnergy: 0.14, breathinessRatio: 0.78 },
    });
    expect(bracketed.emotion).toBe("whisper");
    expect(bracketed.signals.hasWhisperBrackets).toBe(true);
    expect(bracketed.recommendedBalloonStyle).toBe("dashed_whisper");
    expect(acoustic.emotion).toBe("whisper");
    expect(acoustic.signals.acousticBreathiness).toBe(0.78);
  });

  it("3. 느낌표·늘인 음절·영문 대문자·고에너지 음성을 shout로 분류한다", () => {
    const koShout = analyzeDialogueProsody({ text: "도망쳐어어!! 당장 피해!!" });
    const enShout = analyzeDialogueProsody({ text: "WATCH OUT! MOVE NOW!" });
    const voiceShout = analyzeDialogueProsody({ text: "지금 바로 출발해", prosody: { peakEnergy: 0.94, rmsDb: -3 } });
    expect(koShout.emotion).toBe("shout");
    expect(koShout.intensity).toBeGreaterThanOrEqual(0.65);
    expect(koShout.recommendedBalloonStyle).toBe("burst_spike");
    expect(enShout.emotion).toBe("shout");
    expect(enShout.signals.allCapsRatio).toBeGreaterThan(0.8);
    expect(voiceShout.emotion).toBe("shout");
  });

  it("4. 감탄의문부호(!?)·충격 감탄사·급격한 피치 상승을 shock으로 분류한다", () => {
    const koShock = analyzeDialogueProsody({ text: "뭐라고?! 말도 안 돼!!" });
    const enShock = analyzeDialogueProsody({ text: "WHAT?! NO WAY!" });
    const pitchShock = analyzeDialogueProsody({ text: "설마 진짜야?", prosody: { peakEnergy: 0.9, pitchRangeSemitones: 13 } });
    expect(koShock.emotion).toBe("shock");
    expect(koShock.signals.interrobangCount).toBeGreaterThanOrEqual(1);
    expect(koShock.intensity).toBeGreaterThanOrEqual(0.75);
    expect(enShock.emotion).toBe("shock");
    expect(pitchShock.emotion).toBe("shock");
  });

  it("5. 말더듬·반복 자모(ㄷㄷ)·성대 지터 프로파일을 tremor로 분류한다", () => {
    const ko = analyzeDialogueProsody({ text: "그, 그건... ㄷㄷ 너무 무서워..." });
    const en = analyzeDialogueProsody({ text: "W-what... happened here?" });
    const voice = analyzeDialogueProsody({ text: "손이 안 멈춰...", prosody: { pitchJitterRatio: 0.78, peakEnergy: 0.42 } });
    expect(ko.emotion).toBe("tremor");
    expect(ko.signals.stutterSegmentCount).toBeGreaterThanOrEqual(2);
    expect(ko.recommendedBalloonStyle).toBe("tremor_wave");
    expect(en.emotion).toBe("tremor");
    expect(voice.emotion).toBe("tremor");
  });

  it("6. 내면 독백(inner_thought)과 내레이션 박스(narration)를 구분해 분류한다", () => {
    const thought = analyzeDialogueProsody({ text: "'설마 그때 그 사람이 돌아온 걸까...'" });
    const expThought = analyzeDialogueProsody({ text: "이대로 가면 들킬지도 몰라", isInnerThought: true });
    const narration = analyzeDialogueProsody({ text: "[그날 밤, 도시는 깊은 침묵에 잠겼다.]" });
    const expNarration = analyzeDialogueProsody({ text: "사흘 뒤, 새벽 열차가 역에 멈춰 섰다.", isNarrationBox: true });
    expect(thought.emotion).toBe("inner_thought");
    expect(thought.recommendedBalloonStyle).toBe("cloud");
    expect(expThought.emotion).toBe("inner_thought");
    expect(narration.emotion).toBe("narration");
    expect(narration.recommendedBalloonStyle).toBe("double_border");
    expect(expNarration.emotion).toBe("narration");
  });

  it("7. 빈 문자열·비정상 음향 수치에서도 결정론적이고 유한한 분석 결과를 반환한다", () => {
    const a = analyzeDialogueProsody({
      text: "   ",
      prosody: { peakEnergy: Number.NaN, rmsDb: Number.POSITIVE_INFINITY, pitchJitterRatio: -3 },
    });
    const b = analyzeDialogueProsody({ text: "   " });
    expect(a.emotion).toBe("calm");
    expect(Number.isFinite(a.intensity)).toBe(true);
    expect(Number.isFinite(a.confidence)).toBe(true);
    expect(a.balancedText.lines).toHaveLength(0);
    expect(a.intensity).toBe(b.intensity);
  });

  it("8. 한글 어절 균형 줄바꿈이 외톨이 마지막 줄(Orphan)을 방지하고 어절을 보존한다", () => {
    const text = "지금 당장 여기서 빠져나가야 해";
    const balanced = balanceHangulDialogueLines(text, { maxLineUnits: 14, minOrphanUnits: 2.2, fontSizePx: 18 });
    expect(balanced.lines.length).toBe(2);
    expect(balanced.orphanPrevented).toBe(true);
    expect(balanced.lines[1]?.opticalUnits ?? 0).toBeGreaterThanOrEqual(2.2);
    expect(balanced.lines.map((line) => line.text).join(" ")).toBe(text);
    expect(balanced.balanceVariance).toBeLessThan(2);
  });

  it("9. 줄 한계를 초과하는 긴 단일 어절도 넘치지 않도록 안전하게 분할하고 시각 폭을 계산한다", () => {
    expect(measureOpticalTextUnits("한글")).toBe(2);
    expect(measureOpticalTextUnits("AB")).toBeCloseTo(1.36, 2);
    const balanced = balanceHangulDialogueLines("초초초초긴한글어절테스트입니다", { maxLineUnits: 6, minOrphanUnits: 2 });
    expect(balanced.lines.length).toBeGreaterThanOrEqual(3);
    for (const line of balanced.lines) expect(line.opticalUnits).toBeLessThanOrEqual(6.001);
  });

  it("10. 5종 말풍선 윤곽선(타원·구름·떨림·폭발·이중 테두리) 모두 자기 교차 없이 안전 여백을 보장한다", () => {
    const variants: readonly BalloonContourVariant[] = ["ellipse", "cloud", "tremor_wave", "burst_spike", "double_border"];
    const textBounds: Rect2D = { x: 140, y: 200, width: 190, height: 76 };

    for (const variant of variants) {
      const result = generateProceduralBalloonContour({
        emotion: variant === "burst_spike" ? "shout" : variant === "double_border" ? "shock" : "calm",
        intensity: 0.82,
        textBounds,
        speakerAnchor: { x: 260, y: 410 },
        variantOverride: variant,
      });
      expect(result.variant).toBe(variant);
      expect(result.clearanceVerified).toBe(true);
      expect(result.minTextClearancePx).toBeGreaterThanOrEqual(10);
      expect(hasPolygonSelfIntersection(result.contourPolygon)).toBe(false);
      expect(result.contourSvgPath.startsWith("M ")).toBe(true);
      expect(result.contourSvgPath.endsWith("Z")).toBe(true);
      for (const pt of result.contourPolygon) expect(distancePointToRect(pt, textBounds)).toBeGreaterThanOrEqual(10);
      expect(result.secondaryContourPolygon !== null).toBe(variant === "double_border");
    }
  });

  it("11. 속삭임 점선·속마음 구름 방울(Thought Dots)·내레이션 꼬리 없음을 정확히 반영한다", () => {
    const textBounds: Rect2D = { x: 100, y: 120, width: 160, height: 60 };
    const speaker: Point2D = { x: 210, y: 310 };
    const whisper = generateProceduralBalloonContour({ emotion: "whisper", intensity: 0.55, textBounds, speakerAnchor: speaker });
    const thought = generateProceduralBalloonContour({ emotion: "inner_thought", intensity: 0.6, textBounds, speakerAnchor: speaker });
    const narration = generateProceduralBalloonContour({ emotion: "narration", intensity: 0.4, textBounds, speakerAnchor: speaker });

    expect(whisper.strokeDashArray).toEqual([6, 5]);
    expect(whisper.tail?.mode).toBe("quadratic");
    expect(thought.variant).toBe("cloud");
    expect(thought.tail).toBeNull();
    expect(thought.thoughtDots).toHaveLength(3);
    expect(thought.thoughtDots[0]?.radius ?? 0).toBeGreaterThan(thought.thoughtDots[1]?.radius ?? 99);
    expect(thought.thoughtDots[1]?.radius ?? 0).toBeGreaterThan(thought.thoughtDots[2]?.radius ?? 99);
    expect(narration.variant).toBe("double_border");
    expect(narration.tail).toBeNull();
    expect(narration.thoughtDots).toHaveLength(0);
  });

  it("12. 화자 위치 8방위에서 2차/3차 베지어 꼬리가 자기 교차 없이 화자를 향한다", () => {
    const textBounds: Rect2D = { x: 300, y: 300, width: 180, height: 70 };
    const center = { x: 390, y: 335 };
    const anchors: readonly Point2D[] = [
      { x: 210, y: 500 }, { x: 570, y: 510 }, { x: 220, y: 140 }, { x: 580, y: 150 },
      { x: 390, y: 110 }, { x: 390, y: 560 }, { x: 110, y: 335 }, { x: 670, y: 335 },
    ];

    for (const mode of ["quadratic", "cubic"] as const) {
      for (const anchor of anchors) {
        const res = generateProceduralBalloonContour({
          emotion: mode === "cubic" ? "shout" : "calm",
          intensity: 0.75,
          textBounds,
          speakerAnchor: anchor,
          tailModeOverride: mode,
        });
        const tail = res.tail;
        expect(tail).not.toBeNull();
        if (tail === null) continue;
        expect(tail.mode).toBe(mode);
        expect(tail.selfIntersects).toBe(false);
        expect(hasPolygonSelfIntersection(tail.sampledPolygon)).toBe(false);

        const expectedAngle = Math.atan2(anchor.y - center.y, anchor.x - center.x);
        const angleDiff = Math.abs(Math.atan2(Math.sin(tail.attachmentAngleRad - expectedAngle), Math.cos(tail.attachmentAngleRad - expectedAngle)));
        expect(angleDiff).toBeLessThan(0.02);

        const midX = (tail.baseLeft.x + tail.baseRight.x) / 2;
        const midY = (tail.baseLeft.y + tail.baseRight.y) / 2;
        expect((tail.tip.x - midX) * (anchor.x - center.x) + (tail.tip.y - midY) * (anchor.y - center.y)).toBeGreaterThan(0);
      }
    }
  });

  it("13. 화자 앵커가 말풍선 내부에 겹치더라도 꼬리가 바깥쪽으로 안전하게 돌출되며 교차하지 않는다", () => {
    const textBounds: Rect2D = { x: 200, y: 200, width: 160, height: 64 };
    const insideAnchor: Point2D = { x: 282, y: 235 };
    const res = generateProceduralBalloonContour({ emotion: "calm", intensity: 0.4, textBounds, speakerAnchor: insideAnchor });
    expect(res.tail).not.toBeNull();
    expect(res.tail?.selfIntersects).toBe(false);
    expect(distancePointToRect(res.tail?.tip ?? insideAnchor, textBounds)).toBeGreaterThan(20);
  });

  it("14. 대사 분석 결과에서 바로 말풍선 벡터 윤곽까지 종단 간 파이프라인이 안전하게 연결된다", () => {
    const analysis = analyzeDialogueProsody({ text: "지금 여기서 물러서면 다 끝장이야!!", lineBalance: { maxLineUnits: 11, fontSizePx: 20 } });
    const balloon = generateProceduralBalloonContour({
      emotion: analysis.emotion,
      intensity: analysis.intensity,
      textBounds: { x: 120, y: 160, width: analysis.balancedText.estimatedTextBoxWidthPx, height: analysis.balancedText.estimatedTextBoxHeightPx },
      speakerAnchor: { x: 220, y: 420 },
    });
    expect(analysis.emotion).toBe("shout");
    expect(balloon.variant).toBe("burst_spike");
    expect(balloon.clearanceVerified).toBe(true);
    expect(balloon.tail?.mode).toBe("cubic");
    expect(balloon.tail?.selfIntersects).toBe(false);
  });

  it("15. 4종 한글 의성어 워프(아치·원근·충격파·진동)가 모두 유한한 좌표와 유효한 SVG 경로를 생성한다", () => {
    const samples: readonly { readonly text: string; readonly mode: HangulSfxWarpMode }[] = [
      { text: "짜잔!", mode: "arch" },
      { text: "스윽", mode: "perspective_taper" },
      { text: "쾅!", mode: "shockwave_burst" },
      { text: "두근두근", mode: "tremor_wave" },
    ];
    for (const sample of samples) {
      const res = warpHangulSfxPath({ text: sample.text, mode: sample.mode, strength: 0.8, strokeOffsetPx: 6 });
      expect(res.isFiniteGeometry).toBe(true);
      expect(res.glyphs).toHaveLength(Array.from(sample.text).length);
      expect(res.overallBounds.width).toBeGreaterThan(0);
      expect(res.overallBounds.height).toBeGreaterThan(0);
      for (const glyph of res.glyphs) {
        expect(glyph.strokeOffsetSvgPath.startsWith("M ")).toBe(true);
        expect(glyph.strokeOffsetSvgPath.endsWith("Z")).toBe(true);
        expect(glyph.warpedStrokes.length).toBeGreaterThan(0);
        for (const v of glyph.dropShadowMatrix) expect(Number.isFinite(v)).toBe(true);
        for (const v of glyph.glyphTransformMatrix) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("16. 원근 소실(perspective_taper) 워프는 좌→우 및 우→좌 방향에서 배율과 높이가 단조 변화한다", () => {
    const ltr = warpHangulSfxPath({
      text: "우르르르", mode: "perspective_taper", strength: 0.9, perspectiveStartScale: 1.4, perspectiveEndScale: 0.45, perspectiveDirection: "left_to_right",
    });
    const rtl = warpHangulSfxPath({
      text: "우르르르", mode: "perspective_taper", strength: 0.9, perspectiveStartScale: 1.4, perspectiveEndScale: 0.45, perspectiveDirection: "right_to_left",
    });
    for (let i = 1; i < ltr.glyphs.length; i += 1) {
      const p = ltr.glyphs[i - 1];
      const c = ltr.glyphs[i];
      expect(p && c && p.effectiveScale > c.effectiveScale && p.warpedBounds.height > c.warpedBounds.height).toBe(true);
    }
    for (let i = 1; i < rtl.glyphs.length; i += 1) {
      const p = rtl.glyphs[i - 1];
      const c = rtl.glyphs[i];
      expect(p && c && p.effectiveScale < c.effectiveScale && p.warpedBounds.height < c.warpedBounds.height).toBe(true);
    }
  });

  it("17. 아치(arch) 워프는 양수 각도에서 중앙 글리프를 위로 들어올리고 좌우 접선 각도를 대칭 배치한다", () => {
    const res = warpHangulSfxPath({ text: "두근두근", mode: "arch", archSpanDeg: 75, strength: 0.85 });
    const first = res.glyphs[0];
    const middle = res.glyphs[1];
    const last = res.glyphs[res.glyphs.length - 1];
    expect(first && middle && last).toBeTruthy();
    if (!first || !middle || !last) return;
    expect(middle.warpedBounds.y + middle.warpedBounds.height / 2).toBeLessThan(first.warpedBounds.y + first.warpedBounds.height / 2);
    expect(middle.warpedBounds.y + middle.warpedBounds.height / 2).toBeLessThan(last.warpedBounds.y + last.warpedBounds.height / 2);
    expect(first.tangentAngleRad).toBeLessThan(0);
    expect(last.tangentAngleRad).toBeGreaterThan(0);
  });

  it("18. 충격파 방사(shockwave_burst) 워프는 강도가 높을수록 외곽 확산 폭이 커진다", () => {
    const gentle = warpHangulSfxPath({ text: "쾅!", mode: "shockwave_burst", strength: 0.25 });
    const strong = warpHangulSfxPath({ text: "쾅!", mode: "shockwave_burst", strength: 0.95 });
    expect(strong.overallBounds.width).toBeGreaterThan(gentle.overallBounds.width);
    expect(strong.overallBounds.height).toBeGreaterThan(gentle.overallBounds.height);
    expect(strong.glyphs[0]?.effectiveScale ?? 0).toBeGreaterThan(gentle.glyphs[0]?.effectiveScale ?? 99);
  });

  it("19. 지그재그 진동(tremor_wave) 워프는 진폭에 비례해 세로 변동과 전단을 생성한다", () => {
    const res = warpHangulSfxPath({ text: "우르르르", mode: "tremor_wave", strength: 0.9, tremorAmplitudePx: 20, tremorFrequency: 2.5 });
    const ys = res.glyphs.map((g) => g.warpedBounds.y + g.warpedBounds.height / 2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(6);
    expect(res.isFiniteGeometry).toBe(true);
  });

  it("20. 외곽선 오프셋(computeOutwardStrokeOffsetPolygon)은 CW/CCW 방향과 무관하게 바깥으로 확장한다", () => {
    const cw: readonly Point2D[] = [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 }];
    for (const poly of [cw, [...cw].reverse()]) {
      const exp = computeOutwardStrokeOffsetPolygon(poly, 8);
      expect(Math.min(...exp.map((p) => p.x))).toBeCloseTo(2, 2);
      expect(Math.max(...exp.map((p) => p.x))).toBeCloseTo(68, 2);
      expect(Math.min(...exp.map((p) => p.y))).toBeCloseTo(2, 2);
      expect(Math.max(...exp.map((p) => p.y))).toBeCloseTo(68, 2);
    }
  });

  it("21. 드롭섀도 어파인 변환 행렬은 중심 이동·확대·기울기를 비파괴로 정확히 계산하며 입력 글리프를 변조하지 않는다", () => {
    const customGlyphs: readonly SfxGlyphInput[] = [
      { glyph: "스", bounds: { x: 0, y: 0, width: 60, height: 64 }, strokes: [{ points: [{ x: 10, y: 12 }, { x: 50, y: 12 }, { x: 30, y: 54 }], closed: false }] },
      { glyph: "윽", bounds: { x: 64, y: 0, width: 60, height: 64 } },
    ];
    const snapshot = JSON.stringify(customGlyphs);
    const res = warpHangulSfxPath({
      text: "스윽", mode: "perspective_taper", glyphs: customGlyphs, dropShadowOffset: { x: 9, y: 11 }, dropShadowScale: 1.08, dropShadowSkewXDeg: -8,
    });
    expect(JSON.stringify(customGlyphs)).toBe(snapshot);

    const center: Point2D = { x: 100, y: 80 };
    const mapped = applyAffineMatrix2D(buildDropShadowMatrix(center, { x: 9, y: 11 }, 1.08, -8), center);
    expect(mapped.x).toBeCloseTo(109, 2);
    expect(mapped.y).toBeCloseTo(91, 2);
    expect(res.glyphs[0]?.warpedStrokes[0]?.points).toHaveLength(3);
  });

  it("22. 한글 의성어 프리셋 추천기가 대표 의성어를 알맞은 곡선 워프 모드로 매핑한다", () => {
    expect(suggestHangulSfxWarpPreset("쾅!").mode).toBe("shockwave_burst");
    expect(suggestHangulSfxWarpPreset("우르르").mode).toBe("tremor_wave");
    expect(suggestHangulSfxWarpPreset("두근두근").mode).toBe("tremor_wave");
    expect(suggestHangulSfxWarpPreset("스윽").mode).toBe("perspective_taper");
    expect(suggestHangulSfxWarpPreset("짜잔!").mode).toBe("arch");
  });
});
