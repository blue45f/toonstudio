import { describe, expect, it } from "vitest";

import { DEFAULT_EYE_GAZE, createDefaultRecipe } from "../contracts";
import { createMockEngine } from "../testing/mock-engine";

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
  resolveLocalizedBubbleAspect,
  resolveSfxGlyphByLocale,
  resolveSpeakerBubblePlacement,
  resolveWebtoonCutCameraSpec,
  rotateRasterBilinear,
  splitJapaneseTategakiColumns,
  splitLocalizedBubbleDialogue,
} from "./webtoon-strip-composer";

describe("webtoon-strip-composer", () => {
  it("clampWebtoonStripLayout은 800px 원고 폭·1024px 최대 폭·클리프행어 장여백에서도 4096px 이하 세로 스트립을 계산한다", () => {
    const std = clampWebtoonStripLayout(800, true);
    expect(std.stripWidth).toBe(800);
    expect(std.stripHeight).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);
    expect(std.cutWidth).toBeGreaterThan(700);
    expect(std.bubbleSafeTopPx).toBeGreaterThan(30);
    expect(std.borderPx).toBe(3);

    const cliffhanger = clampWebtoonStripLayout(1024, true, ["compact", "dramatic-pause", "cliffhanger"]);
    expect(cliffhanger.stripWidth).toBe(1024);
    expect(cliffhanger.stripHeight).toBeLessThanOrEqual(MAX_PNG_EXPORT_DIMENSION);
    expect(cliffhanger.gutterHeights?.[2] ?? 0).toBeGreaterThan(cliffhanger.gutterHeights?.[0] ?? 0);

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
  });

  it("exportWebtoonVerticalStripPng는 4가지 웹툰 카메라 앵글로 순차 캡처해 PNG를 인코딩하고 다국어·세로쓰기 파일 접미사를 구분한다", async () => {
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

    const tategakiOutcome = await exportWebtoonVerticalStripPng(
      engine,
      {
        stripWidth: 64,
        includeBubbleSafeZone: true,
        gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
        manuscriptMood: "midnight-noir",
        cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "high-bust"],
        mangaFx: {
          enabled: true,
          locale: "ja",
          jaWritingMode: "vertical-tategaki",
          manuscriptMood: "midnight-noir",
          linesKind: "focus-radial",
          includeSpeechBubbles: true,
          dialogueLines: [
            "午前零時ちょうど、予告通り蒼玉を頂きに参上した。",
            "レーザー網を抜けたのか？そこから動くな。",
            "本物はすでに、この薔薇と入れ替わっているよ。",
            "次の満月の夜にまた会おう、刑事さん。",
          ],
          sfxStamps: ["ssaa", "pat", "beonjjeok", "dugeun"],
        },
      },
      { now: () => 200 },
    );
    expect(tategakiOutcome.ok).toBe(true);
    if (!tategakiOutcome.ok) return;
    expect(isPng(tategakiOutcome.bytes)).toBe(true);
    expect(tategakiOutcome.receipt.fileName).toMatch(/-webtoon-4cut-fx-ja-tategaki-strip\.png$/u);
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

    const outcome = await exportWebtoonVerticalStripPng(
      engine,
      {
        stripWidth: 64,
        includeBubbleSafeZone: true,
        actingArc: { arcId: "arc-awakening-climax", basePlan },
        mangaFx: { enabled: true, linesKind: "focus-radial", includeSpeechBubbles: true },
      },
      { now: () => 300 },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.receipt.fileName).toMatch(/-webtoon-4cut-acting-fx-strip\.png$/u);
  });

  it("speakerTargets·partnerSide에 따라 주연/상대역 말풍선 위치와 꼬리 방향을 자동 추적하고 PSD용 투명 분리 레이어를 독립 생성한다", () => {
    const protagPlacement = resolveSpeakerBubblePlacement(0, "protagonist", "right");
    expect(protagPlacement.placeRight).toBe(false);
    expect(protagPlacement.tailTargetXRatio).toBeGreaterThan(protagPlacement.centerXRatio);

    const leftPartnerPlacement = resolveSpeakerBubblePlacement(0, "partner", "left");
    expect(leftPartnerPlacement.placeRight).toBe(false);
    expect((leftPartnerPlacement.tailTargetXRatio ?? 1)).toBeLessThan(leftPartnerPlacement.centerXRatio);

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

    const bottomLeftAlpha = ((120 * 128 + 8) * 4) + 3;
    expect(frameLayer.rgba[bottomLeftAlpha]).toBe(0);
    expect(textLayer.rgba[bottomLeftAlpha]).toBe(0);
    expect(sfxLayer.rgba[bottomLeftAlpha]).toBe(0);
    expect(linesLayer.rgba.some((v) => v > 0)).toBe(true);
  });

  it("다국어(KO/EN/JA)·일본어 세로쓰기(Tategaki)·시간대 원고 무드(황혼·심야) 및 더치 틸트 회전을 정확히 수행한다", () => {
    const koAspect = resolveLocalizedBubbleAspect("ko", "방과 후 옥상 난간, 발신자 미상의 음성 파일.");
    const enAspect = resolveLocalizedBubbleAspect("en", "Sunset on the roof, an unsigned audio file.");
    const jaHorizAspect = resolveLocalizedBubbleAspect("ja", "放課後の屋上フェンス、差出人不明の音声。", "horizontal");
    const jaTategakiAspect = resolveLocalizedBubbleAspect("ja", "放課後の屋上フェンス、差出人不明の音声。", "vertical-tategaki");

    expect(enAspect.scaleX).toBeGreaterThan(koAspect.scaleX);
    expect(jaTategakiAspect.scaleX).toBeLessThan(jaHorizAspect.scaleX);
    expect(jaTategakiAspect.scaleY).toBeGreaterThan(jaHorizAspect.scaleY);

    const tategakiCols = splitJapaneseTategakiColumns("レーザー網を抜けたのか…そこから動くな。");
    expect(tategakiCols.length).toBeGreaterThanOrEqual(2);
    expect(tategakiCols[0]).toContain("｜");
    expect(tategakiCols.join("")).toContain("⋮");
    expect(tategakiCols.every((col) => !col.startsWith("。") && !col.startsWith("、"))).toBe(true);

    const [, enLine2] = splitLocalizedBubbleDialogue("Sunset on the roof, an unsigned audio file.", "en");
    expect(enLine2).not.toBeNull();
    expect(resolveSfxGlyphByLocale("ssaa", "en")).toBe("SHHH");
    expect(resolveSfxGlyphByLocale("beonjjeok", "ja")).toBe("ビカッ");

    const tategakiTextLayer = renderTransparentDialogueTextLayer(160, 160, {
      dialogueText: "午前零時ちょうど、予告通り蒼玉を頂きに参上した。",
      shape: "oval",
      locale: "ja",
      jaWritingMode: "vertical-tategaki",
    });
    let visibleTategakiPx = 0;
    for (let i = 3; i < tategakiTextLayer.rgba.length; i += 4) {
      if ((tategakiTextLayer.rgba[i] ?? 0) > 10) visibleTategakiPx += 1;
    }
    expect(visibleTategakiPx).toBeGreaterThan(20);

    // 시간대 원고 무드(twilight-amber vs midnight-noir)에 따라 배경 그라디언트와 캐릭터 색온도가 달라진다
    const layout = clampWebtoonStripLayout(64, true, ["compact", "standard", "cliffhanger"]);
    const panels = WEBTOON_VERTICAL_STRIP_CUTS.map(() => {
      const rgba = new Uint8ClampedArray(layout.cutWidth * layout.cutHeight * 4);
      const p = (Math.floor(layout.cutHeight / 2) * layout.cutWidth + Math.floor(layout.cutWidth / 2)) * 4;
      rgba[p] = 200;
      rgba[p + 1] = 200;
      rgba[p + 2] = 200;
      rgba[p + 3] = 255;
      return { width: layout.cutWidth, height: layout.cutHeight, rgba };
    });
    const twilightStrip = composeWebtoonVerticalStrip(panels, layout, undefined, "twilight-amber");
    const midnightStrip = composeWebtoonVerticalStrip(panels, layout, undefined, "midnight-noir");
    const charX = layout.marginX + layout.borderPx + Math.floor(layout.cutWidth / 2);
    const charY = layout.marginY + layout.borderPx + layout.bubbleSafeTopPx + Math.floor(layout.cutHeight / 2);
    const cIdx = (charY * layout.stripWidth + charX) * 4;
    expect(twilightStrip.rgba[cIdx]).toBeGreaterThan(midnightStrip.rgba[cIdx] ?? 0);
    expect(midnightStrip.rgba[cIdx + 2]).toBeGreaterThan(twilightStrip.rgba[cIdx + 2] ?? 0);

    const dutchSpec = resolveWebtoonCutCameraSpec(2, "dutch-left-bust");
    expect(dutchSpec.dutchTiltDeg).toBe(-9);
    const bar = new Uint8ClampedArray(32 * 32 * 4);
    for (let x = 6; x < 26; x += 1) {
      const idx = (16 * 32 + x) * 4;
      bar[idx] = 240;
      bar[idx + 3] = 255;
    }
    const tilted = rotateRasterBilinear({ width: 32, height: 32, rgba: bar }, -9);
    expect(tilted.rgba.some((v, idx) => idx % 4 === 3 && Math.floor(idx / 4 / 32) !== 16 && v > 32)).toBe(true);
  });
});
