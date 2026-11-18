import { describe, expect, it } from "vitest";

import { MAX_PNG_EXPORT_DIMENSION } from "./export-session";
import { isPng } from "./png-encoder";
import {
  WEBTOON_STRIP_ACTING_ARCS,
  WEBTOON_VERTICAL_STRIP_CUTS,
  buildActingCutPlan,
  clampWebtoonStripLayout,
  composeWebtoonVerticalStrip,
  exportWebtoonVerticalStripPng,
  renderTransparentActionLinesLayer,
  renderTransparentDialogueTextLayer,
  renderTransparentSfxStampLayer,
  renderTransparentSpeechBubbleFrameLayer,
  resolveSpeakerBubblePlacement,
} from "./webtoon-strip-composer";
import { DEFAULT_EYE_GAZE, createDefaultRecipe } from "../contracts";
import { createMockEngine } from "../testing/mock-engine";

describe("webtoon-strip-composer", () => {
  it("clampWebtoonStripLayout은 800px 원고 폭과 1024px 최대 폭 모두에서 4096px 이하 세로 스트립을 계산한다", () => {
    const std = clampWebtoonStripLayout(800, true);
    expect(std.stripWidth).toBe(800);
    expect(std.stripHeight).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);
    expect(std.cutWidth).toBeGreaterThan(700);
    expect(std.bubbleSafeTopPx).toBeGreaterThan(30);
    expect(std.borderPx).toBe(3);

    const wide = clampWebtoonStripLayout(2048, true);
    expect(wide.stripWidth).toBe(1024);
    expect(wide.stripHeight).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);

    const noBubble = clampWebtoonStripLayout(64, false);
    expect(noBubble.bubbleSafeTopPx).toBe(0);
    expect(noBubble.stripWidth).toBe(64);
  });

  it("composeWebtoonVerticalStrip은 백색 원고지·먹선 프레임·말풍선 상단 여백과 알파 캐릭터 픽셀을 정확히 합성한다", () => {
    const layout = clampWebtoonStripLayout(48, true);
    const panels = WEBTOON_VERTICAL_STRIP_CUTS.map((_, cutIdx) => {
      const rgba = new Uint8ClampedArray(layout.cutWidth * layout.cutHeight * 4);
      const cx = Math.floor(layout.cutWidth / 2);
      const cy = Math.floor(layout.cutHeight / 2);
      const p = (cy * layout.cutWidth + cx) * 4;
      rgba[p] = 40 + cutIdx * 40;
      rgba[p + 1] = 90;
      rgba[p + 2] = 200;
      rgba[p + 3] = 255;
      return { width: layout.cutWidth, height: layout.cutHeight, rgba };
    });

    const strip = composeWebtoonVerticalStrip(panels, layout);
    expect(strip.width).toBe(layout.stripWidth);
    expect(strip.height).toBe(layout.stripHeight);

    expect(Array.from(strip.rgba.slice(0, 4))).toEqual([255, 255, 255, 255]);

    const borderIdx = (layout.marginY * strip.width + layout.marginX) * 4;
    expect(Array.from(strip.rgba.slice(borderIdx, borderIdx + 4))).toEqual([24, 21, 28, 255]);

    const charX = layout.marginX + layout.borderPx + Math.floor(layout.cutWidth / 2);
    const charY = layout.marginY + layout.borderPx + layout.bubbleSafeTopPx + Math.floor(layout.cutHeight / 2);
    const charIdx = (charY * strip.width + charX) * 4;
    expect(Array.from(strip.rgba.slice(charIdx, charIdx + 4))).toEqual([40, 90, 200, 255]);
  });

  it("mangaFx 활성화 시 집중선·속도선·스파클 효과선을 캐릭터 뒤에 깔고 말풍선 프레임을 좌우 교차 베이킹한다", () => {
    const layout = clampWebtoonStripLayout(96, true);
    const panels = WEBTOON_VERTICAL_STRIP_CUTS.map(() => {
      const rgba = new Uint8ClampedArray(layout.cutWidth * layout.cutHeight * 4);
      const cx = Math.floor(layout.cutWidth / 2);
      const cy = Math.floor(layout.cutHeight / 2);
      const p = (cy * layout.cutWidth + cx) * 4;
      rgba[p] = 210;
      rgba[p + 1] = 55;
      rgba[p + 2] = 95;
      rgba[p + 3] = 255;
      return { width: layout.cutWidth, height: layout.cutHeight, rgba };
    });

    const plainStrip = composeWebtoonVerticalStrip(panels, layout);
    const fxFocus = composeWebtoonVerticalStrip(panels, layout, {
      enabled: true,
      linesKind: "focus-radial",
      includeSpeechBubbles: true,
      intensity: 0.85,
    });
    const fxSpeed = composeWebtoonVerticalStrip(panels, layout, {
      enabled: true,
      linesKind: "speed-diagonal",
      includeSpeechBubbles: true,
      intensity: 0.85,
    });
    const fxSparkle = composeWebtoonVerticalStrip(panels, layout, {
      enabled: true,
      linesKind: "romance-sparkle",
      includeSpeechBubbles: true,
      intensity: 0.85,
    });

    const charX = layout.marginX + layout.borderPx + Math.floor(layout.cutWidth / 2);
    const charY = layout.marginY + layout.borderPx + layout.bubbleSafeTopPx + Math.floor(layout.cutHeight / 2);
    const charIdx = (charY * fxFocus.width + charX) * 4;
    expect(Array.from(fxFocus.rgba.slice(charIdx, charIdx + 4))).toEqual([210, 55, 95, 255]);

    const countDiffPixels = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
      let diff = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diff += 1;
      }
      return diff;
    };
    expect(countDiffPixels(plainStrip.rgba, fxFocus.rgba)).toBeGreaterThan(200);
    expect(countDiffPixels(plainStrip.rgba, fxSpeed.rgba)).toBeGreaterThan(200);
    expect(countDiffPixels(plainStrip.rgba, fxSparkle.rgba)).toBeGreaterThan(100);

    const innerX = layout.marginX + layout.borderPx;
    const innerY = layout.marginY + layout.borderPx;
    const innerHeight = layout.bubbleSafeTopPx + layout.cutHeight;
    const bubbleCx = innerX + Math.round(layout.cutWidth * 0.28);
    const bubbleCy = innerY + Math.round(Math.max(5, Math.round(innerHeight * 0.092)) * 1.32);
    const bubbleIdx = (bubbleCy * fxFocus.width + bubbleCx) * 4;
    expect(fxFocus.rgba[bubbleIdx]).toBeGreaterThanOrEqual(250);
    expect(fxFocus.rgba[bubbleIdx + 1]).toBeGreaterThanOrEqual(250);
  });

  it("exportWebtoonVerticalStripPng는 4가지 웹툰 카메라 앵글로 순차 캡처해 PNG를 인코딩하고 mangaFx 파일 접미사를 구분한다", async () => {
    const engine = createMockEngine();
    const steps: string[] = [];
    const outcome = await exportWebtoonVerticalStripPng(
      engine,
      {
        stripWidth: 64,
        includeBubbleSafeZone: true,
        settleSteps: 3,
        onProgress: (step, total, labelKo) => steps.push(`${step}/${total}:${labelKo}`),
      },
      { now: () => 100 },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(isPng(outcome.bytes)).toBe(true);
    expect(outcome.receipt.fileName).toMatch(/-webtoon-4cut-strip\.png$/u);
    expect(steps).toHaveLength(4);

    const renderCalls = engine.calls.filter((c) => c.method === "renderPasses");
    expect(renderCalls).toHaveLength(4);
    const modes = renderCalls.map((c) => (c.args[0] as { camera?: { mode: string } }).camera?.mode);
    expect(modes).toEqual(["full-body", "bust", "face", "bust"]);
    const pitches = renderCalls.map((c) => (c.args[0] as { camera?: { pitchDeg: number } }).camera?.pitchDeg);
    expect(pitches).toEqual([-14, 0, 0, 18]);

    const fxOutcome = await exportWebtoonVerticalStripPng(
      engine,
      {
        stripWidth: 64,
        includeBubbleSafeZone: true,
        mangaFx: { enabled: true, linesKind: "speed-diagonal", includeSpeechBubbles: true },
      },
      { now: () => 200 },
    );
    expect(fxOutcome.ok).toBe(true);
    if (!fxOutcome.ok) return;
    expect(isPng(fxOutcome.bytes)).toBe(true);
    expect(fxOutcome.receipt.fileName).toMatch(/-webtoon-4cut-fx-strip\.png$/u);
  });

  it("actingArc 활성화 시 1~4컷마다 고유한 표정·시선·목/고개 ApplyPlan을 순차 적용한 뒤 basePlan을 복원하고 -acting 접미사를 붙인다", async () => {
    const engine = createMockEngine();
    const basePlan = {
      revision: 7,
      morphWeights: { "body:height": 0.35, "facs:mouthSmile": 0.1 },
      boneRotations: { rightUpperArm: [0, 0, 0.3, 0.9539] as const },
      parts: [],
      eyeGaze: DEFAULT_EYE_GAZE,
      colors: createDefaultRecipe().colors,
      physics: { provider: "builtin-pbd" as const, settleSteps: 0 },
      unsupported: [],
    };

    const arc = WEBTOON_STRIP_ACTING_ARCS[0]!;
    const cut2Plan = buildActingCutPlan(basePlan, arc.cuts[2], 2);
    expect(cut2Plan.morphWeights["body:height"]).toBe(0.35);
    expect(cut2Plan.morphWeights["facs:mouthSmile"]).toBeUndefined();
    expect(cut2Plan.morphWeights["facs:eyeWide"]).toBeCloseTo(0.72, 4);
    expect(cut2Plan.boneRotations.rightUpperArm).toEqual(basePlan.boneRotations.rightUpperArm);
    expect(cut2Plan.boneRotations.head).toBeDefined();

    const progressLabels: string[] = [];
    const outcome = await exportWebtoonVerticalStripPng(
      engine,
      {
        stripWidth: 64,
        includeBubbleSafeZone: true,
        actingArc: { arcId: "arc-awakening-climax", basePlan },
        mangaFx: { enabled: true, linesKind: "focus-radial", includeSpeechBubbles: true },
        onProgress: (_step, _total, label) => progressLabels.push(label),
      },
      { now: () => 300 },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.receipt.fileName).toMatch(/-webtoon-4cut-acting-fx-strip\.png$/u);
    expect(progressLabels[2]).toContain("각성 클로즈업");

    const applyCalls = engine.calls.filter((c) => c.method === "applyPlan");
    expect(applyCalls).toHaveLength(5);
    expect((applyCalls[4]?.args[0] as { revision: number }).revision).toBe(basePlan.revision);
  });

  it("dialogueLines·bubbleShapes·bubbleFontScales·sfxStamps에 따라 컷별 말풍선 모양(독백·외침·속삭임·숨김), 폰트 강조, 한국어 효과음 스탬프를 구분 합성한다", () => {
    const layout = clampWebtoonStripLayout(144, true);
    const panels = WEBTOON_VERTICAL_STRIP_CUTS.map(() => ({
      width: layout.cutWidth,
      height: layout.cutHeight,
      rgba: new Uint8ClampedArray(layout.cutWidth * layout.cutHeight * 4),
    }));

    const hiddenBubbles = composeWebtoonVerticalStrip(panels, layout, {
      enabled: true,
      linesKind: "none",
      includeSpeechBubbles: true,
      bubbleShapes: ["none", "none", "none", "none"],
      dialogueLines: ["숨김", "숨김", "숨김", "숨김"],
    });
    const plain = composeWebtoonVerticalStrip(panels, layout);
    expect(Array.from(hiddenBubbles.rgba)).toEqual(Array.from(plain.rgba));

    const variedShapes = composeWebtoonVerticalStrip(panels, layout, {
      enabled: true,
      linesKind: "none",
      includeSpeechBubbles: true,
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "whisper-dashed"],
      bubbleFontScales: ["md", "md", "lg", "sm"],
      dialogueLines: [
        "황실의 검과 왕관을 거둔다.",
        "감히 내 눈을 마주 봐.",
        "이제 반격의 시간이야.",
        "내 제국에 온 걸 환영해.",
      ],
    });
    const allOval = composeWebtoonVerticalStrip(panels, layout, {
      enabled: true,
      linesKind: "none",
      includeSpeechBubbles: true,
      bubbleShapes: ["oval", "oval", "oval", "oval"],
      bubbleFontScales: ["sm", "sm", "sm", "sm"],
      dialogueLines: [
        "황실의 검과 왕관을 거둔다.",
        "감히 내 눈을 마주 봐.",
        "이제 반격의 시간이야.",
        "내 제국에 온 걸 환영해.",
      ],
    });

    let shapeDiff = 0;
    for (let i = 0; i < variedShapes.rgba.length; i += 4) {
      if (
        variedShapes.rgba[i] !== allOval.rgba[i] ||
        variedShapes.rgba[i + 1] !== allOval.rgba[i + 1] ||
        variedShapes.rgba[i + 2] !== allOval.rgba[i + 2]
      ) {
        shapeDiff += 1;
      }
    }
    expect(shapeDiff).toBeGreaterThan(150);

    const withSfx = composeWebtoonVerticalStrip(panels, layout, {
      enabled: true,
      linesKind: "none",
      includeSpeechBubbles: true,
      bubbleShapes: ["monologue-box", "oval", "shout-burst", "whisper-dashed"],
      bubbleFontScales: ["md", "md", "lg", "sm"],
      sfxStamps: ["seureung", "dugeun", "kugugung", "pat"],
      dialogueLines: [
        "황실의 검과 왕관을 거둔다.",
        "감히 내 눈을 마주 봐.",
        "이제 반격의 시간이야.",
        "내 제국에 온 걸 환영해.",
      ],
    });

    let sfxDiff = 0;
    for (let i = 0; i < withSfx.rgba.length; i += 4) {
      if (
        withSfx.rgba[i] !== variedShapes.rgba[i] ||
        withSfx.rgba[i + 1] !== variedShapes.rgba[i + 1] ||
        withSfx.rgba[i + 2] !== variedShapes.rgba[i + 2]
      ) {
        sfxDiff += 1;
      }
    }
    expect(sfxDiff).toBeGreaterThan(120);
  });

  it("speakerTargets·partnerSide에 따라 주연/상대역 말풍선 위치와 꼬리 방향을 자동 추적하고 PSD용 투명 분리 레이어를 독립 생성한다", () => {
    // 우측 상대역(partnerSide=right)일 때 주연은 좌측 말풍선+중앙 우향 꼬리, 상대역은 우측 말풍선+상대역 머리 우향 꼬리
    const protagPlacement = resolveSpeakerBubblePlacement(0, "protagonist", "right");
    expect(protagPlacement.placeRight).toBe(false);
    expect(protagPlacement.tailTargetXRatio).toBeGreaterThan(protagPlacement.centerXRatio);

    const partnerPlacement = resolveSpeakerBubblePlacement(0, "partner", "right");
    expect(partnerPlacement.placeRight).toBe(true);
    expect(partnerPlacement.tailTargetXRatio).toBeGreaterThan(partnerPlacement.centerXRatio);

    // 좌측 상대역(partnerSide=left)으로 바꾸면 좌우 위치와 꼬리 조준 방향이 정확히 반전된다
    const leftPartnerPlacement = resolveSpeakerBubblePlacement(0, "partner", "left");
    expect(leftPartnerPlacement.placeRight).toBe(false);
    expect((leftPartnerPlacement.tailTargetXRatio ?? 1)).toBeLessThan(leftPartnerPlacement.centerXRatio);

    // PSD용 투명 레이어 빌더 검증: 바깥 여백은 alpha=0(완전 투명)이고 그려진 영역만 알파가 살아 있다
    const linesLayer = renderTransparentActionLinesLayer(128, 128, "focus-radial", 0.8);
    const frameLayer = renderTransparentSpeechBubbleFrameLayer(128, 128, {
      shape: "oval",
      speakerTarget: "partner",
      partnerSide: "right",
    });
    const textLayer = renderTransparentDialogueTextLayer(128, 128, {
      dialogueText: "감히 고개를 들어 내 눈을 마주 봐.",
      shape: "oval",
      fontScale: "lg",
      speakerTarget: "partner",
      partnerSide: "right",
    });
    const sfxLayer = renderTransparentSfxStampLayer(128, 128, {
      stamp: "seureung",
      speakerTarget: "partner",
      partnerSide: "right",
    });

    const countVisiblePixels = (rgba: Uint8ClampedArray): number => {
      let visible = 0;
      for (let i = 3; i < rgba.length; i += 4) if ((rgba[i] ?? 0) > 0) visible += 1;
      return visible;
    };
    expect(linesLayer.rgba[3]).toBeGreaterThanOrEqual(0);
    // 말풍선 반대쪽 하단 모서리(좌측 하단)는 프레임·식자·효과음 레이어 모두 완전 투명(alpha=0)이어야 한다
    const bottomLeftAlpha = ((120 * 128 + 8) * 4) + 3;
    expect(frameLayer.rgba[bottomLeftAlpha]).toBe(0);
    expect(textLayer.rgba[bottomLeftAlpha]).toBe(0);
    expect(sfxLayer.rgba[bottomLeftAlpha]).toBe(0);

    expect(countVisiblePixels(linesLayer.rgba)).toBeGreaterThan(80);
    expect(countVisiblePixels(frameLayer.rgba)).toBeGreaterThan(150);
    expect(countVisiblePixels(textLayer.rgba)).toBeGreaterThan(20);
    expect(countVisiblePixels(sfxLayer.rgba)).toBeGreaterThan(40);
  });
});
