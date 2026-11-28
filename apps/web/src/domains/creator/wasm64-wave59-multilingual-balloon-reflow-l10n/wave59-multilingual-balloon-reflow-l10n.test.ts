import { describe, expect, it } from "vitest";

import {
  GYOMATSU_KINSOKU_CHARS,
  GYOTO_KINSOKU_CHARS,
  MULTILINGUAL_TYPOGRAPHY_PROFILES,
  SUPPORTED_L10N_LOCALES,
  buildGlobalLocalizationBundle,
  classifyTypographyChar,
  computeBalloonRectOverlapAreaPx2,
  computeContourChordsPx,
  estimateLocalizedTextExpansion,
  hyphenateLatinWord,
  layoutMultilingualBalloonLines,
  measureGlyphAdvanceEm,
  measureTextRunEm,
  reflowLocalizedSpeechBalloon,
  resolveBalloonKeepoutCollisions,
  type BalloonGeometrySpec,
  type CutFrameBounds,
  type EpisodeCutL10nSpec,
  type KeepoutRect,
  type SupportedL10nLocale,
} from "./index";

const MOBILE_CUT: CutFrameBounds = { x: 0, y: 0, width: 800, height: 1280, safeMarginPx: 14 };
const SIX_GLOBAL_LOCALES: readonly SupportedL10nLocale[] = ["en", "ja", "zh-Hans", "zh-Hant", "es", "fr"];

function makeEllipse(overrides: Partial<BalloonGeometrySpec> = {}): BalloonGeometrySpec {
  return {
    balloonId: "balloon-1", contour: "ellipse", centerX: 400, centerY: 260,
    radiusX: 135, radiusY: 88, paddingX: 16, paddingY: 14, ...overrides,
  };
}

function makeSampleEpisodeCuts(): readonly EpisodeCutL10nSpec[] {
  return [
    {
      cutId: "cut-01", cutIndex: 0, cutBounds: MOBILE_CUT,
      keepoutRects: [{ id: "cut01-hero-face", kind: "character-face", x: 310, y: 420, width: 180, height: 200, marginPx: 10 }],
      balloons: [
        {
          balloonId: "c1-b1", readingOrder: 1, speakerId: "hero", baseFontSizePx: 19,
          geometry: makeEllipse({ balloonId: "c1-b1", centerX: 230, centerY: 220, radiusX: 138, radiusY: 82, tailTip: { x: 340, y: 410 } }),
          sourceText: "저 불빛 보여? 드디어 도착했어!",
          localizedTexts: {
            en: "Do you see that light? We finally made it!",
            ja: "あの光が見える？ついに着いたんだ！",
            "zh-Hans": "看到那道光了吗？终于到了！",
            "zh-Hant": "看到那道光了嗎？終於到了！",
            es: "¿Ves esa luz? ¡Por fin hemos llegado!",
            fr: "Tu vois cette lumière ? Nous sommes enfin arrivés !",
          },
        },
        {
          balloonId: "c1-b2", readingOrder: 2, speakerId: "partner", baseFontSizePx: 19,
          geometry: makeEllipse({ balloonId: "c1-b2", centerX: 585, centerY: 255, radiusX: 130, radiusY: 78 }),
          sourceText: "서두르자, 문이 곧 닫혀!",
          localizedTexts: {
            en: "Hurry up, the gate is closing soon!",
            ja: "急ごう、扉がもうすぐ閉まる！",
            "zh-Hans": "快点，门马上要关了！",
            "zh-Hant": "快點，門馬上要關了！",
            es: "¡Date prisa, la puerta se cerrará pronto!",
            fr: "Dépêche-toi, la porte va bientôt se fermer !",
          },
        },
      ],
    },
    {
      cutId: "cut-02", cutIndex: 1, cutBounds: MOBILE_CUT,
      keepoutRects: [{ id: "cut02-focal-sword", kind: "focal-artwork", x: 340, y: 520, width: 140, height: 280, marginPx: 8 }],
      balloons: [
        {
          balloonId: "c2-b1", readingOrder: 1, speakerId: "villain", baseFontSizePx: 20,
          geometry: makeEllipse({ balloonId: "c2-b1", contour: "shout-burst", centerX: 410, centerY: 240, radiusX: 145, radiusY: 88 }),
          sourceText: "거기까지다! <열쇠> & 지도를 넘겨!",
          localizedTexts: {
            en: "That's far enough! Hand over <Key> & Map!",
            ja: "そこまでだ！〈鍵〉＆地図を渡せ！",
            "zh-Hans": "到此为止！交出<钥匙>&地图！",
            "zh-Hant": "到此為止！交出〈鑰匙〉＆地圖！",
            es: "¡Hasta aquí llegaste! ¡Entrega <Llave> & Mapa!",
            fr: "Ça suffit ! Donne-moi <Clé> & Carte !",
          },
        },
      ],
    },
  ];
}

describe("wasm64-wave59-multilingual-balloon-reflow-l10n", () => {
  describe("multilingual-typography-metrics", () => {
    it("7개 글로벌 지원 로캘 프로파일이 가독성 하한과 팽창 대역을 일관되게 정의한다", () => {
      expect(SUPPORTED_L10N_LOCALES).toEqual(["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "fr"]);
      for (const locale of SUPPORTED_L10N_LOCALES) {
        const p = MULTILINGUAL_TYPOGRAPHY_PROFILES[locale];
        expect(p.minReadableFontSizePxAt800w).toBeGreaterThanOrEqual(12);
        expect(p.minLineHeightRatio).toBeLessThan(p.defaultLineHeightRatio);
        expect(p.defaultLineHeightRatio).toBeLessThan(p.maxLineHeightRatio);
        expect(p.recommendedFontStack.length).toBeGreaterThanOrEqual(3);
      }
      expect(MULTILINGUAL_TYPOGRAPHY_PROFILES["zh-Hant"].minReadableFontSizePxAt800w).toBeGreaterThan(
        MULTILINGUAL_TYPOGRAPHY_PROFILES.en.minReadableFontSizePxAt800w
      );
      expect(MULTILINGUAL_TYPOGRAPHY_PROFILES.ja.supportsVerticalRl).toBe(true);
    });

    it("문자 클래스 분류·비례 라틴 글리프 폭·굵기 배수 및 광학 커닝 쌍을 정확히 계산한다", () => {
      expect(classifyTypographyChar("가")).toBe("hangul");
      expect(classifyTypographyChar("あ")).toBe("hiragana");
      expect(classifyTypographyChar("カ")).toBe("katakana");
      expect(classifyTypographyChar("漢")).toBe("cjk-ideograph");
      expect(classifyTypographyChar("。")).toBe("gyoto-kinsoku");
      expect(classifyTypographyChar("「")).toBe("gyomatsu-kinsoku");
      expect(classifyTypographyChar("¡")).toBe("gyomatsu-kinsoku");

      const narrowI = measureGlyphAdvanceEm("i", "en", "horizontal-tb", 500);
      const midE = measureGlyphAdvanceEm("e", "en", "horizontal-tb", 500);
      const wideW = measureGlyphAdvanceEm("W", "en", "horizontal-tb", 500);
      expect(narrowI).toBeLessThan(midE);
      expect(midE).toBeLessThan(wideW);
      expect(measureGlyphAdvanceEm("한", "ko", "horizontal-tb", 500)).toBeGreaterThan(wideW);
      expect(measureGlyphAdvanceEm("W", "en", "horizontal-tb", 700)).toBeGreaterThan(wideW);

      const kernedAv = measureTextRunEm("AV", "en", { letterSpacingEm: 0 }).advanceEm;
      const sumAv = measureGlyphAdvanceEm("A", "en", "horizontal-tb", 600) + measureGlyphAdvanceEm("V", "en", "horizontal-tb", 600);
      expect(kernedAv).toBeLessThan(sumAv);
    });

    it("한국어 원문 대비 영어·스페인어 팽창 및 중국어 간체 축소 비율을 정밀 추정한다", () => {
      const esExp = estimateLocalizedTextExpansion({
        sourceLocale: "ko", sourceText: "지금 당장 멈춰!", targetLocale: "es",
        targetText: "¡Detente inmediatamente ahora mismo!",
      });
      const zhContract = estimateLocalizedTextExpansion({
        sourceLocale: "ko", sourceText: "그 문을 절대 열지 마세요!", targetLocale: "zh-Hans",
        targetText: "绝对别开那扇门！",
      });
      const predictedFr = estimateLocalizedTextExpansion({
        sourceLocale: "ko", sourceText: "지금 당장 멈춰!", targetLocale: "fr",
      });

      expect(esExp.isMeasuredFromTargetText).toBe(true);
      expect(esExp.expansionRatio).toBeGreaterThan(1.45);
      expect(["shrink-and-reflow", "expand-balloon"]).toContain(esExp.recommendedStrategy);
      expect(zhContract.expansionRatio).toBeLessThan(0.95);
      expect(predictedFr.isMeasuredFromTargetText).toBe(false);
      expect(predictedFr.expansionRatio).toBeGreaterThan(1.3);
      expect(predictedFr.isWithinNominalBand).toBe(true);
    });

    it("일본어 세로쓰기(vertical-rl)는 우→좌 열 오프셋과 縦中横(tate-chu-yoko)을 정확히 적용한다", () => {
      const layout = layoutMultilingualBalloonLines({
        text: "待って99秒以内に脱出しないと大変なことになる！？", locale: "ja", writingMode: "vertical-rl",
        contour: "ellipse", innerWidthPx: 140, innerHeightPx: 185, fontSizePx: 18,
      });
      expect(layout.writingMode).toBe("vertical-rl");
      expect(layout.lineCount).toBeGreaterThanOrEqual(2);
      expect(layout.fitsInsideBalloon).toBe(true);
      expect(layout.kinsokuViolationCount).toBe(0);
      for (let i = 1; i < layout.lines.length; i += 1) {
        expect(layout.lines[i - 1]?.centerOffsetXPx ?? 0).toBeGreaterThan(layout.lines[i]?.centerOffsetXPx ?? 0);
      }
      expect(layout.lines.some((line) => line.hasTateChuYoko)).toBe(true);
    });

    it("일본어 행두 금칙 문자(。、っー」)와 행말 금칙 문자(「（)가 줄 경계를 위반하지 않는다", () => {
      const layout = layoutMultilingualBalloonLines({
        text: "「本当に、そっかー。」と言った瞬間、小さな光が（すっと）消えた！",
        locale: "ja", writingMode: "vertical-rl", contour: "rounded-rect",
        innerWidthPx: 180, innerHeightPx: 112, fontSizePx: 18,
      });
      expect(layout.lineCount).toBeGreaterThanOrEqual(3);
      expect(layout.kinsokuBoundCount).toBeGreaterThan(0);
      expect(layout.kinsokuViolationCount).toBe(0);
      for (const line of layout.lines) {
        const chars = Array.from(line.text);
        expect(GYOTO_KINSOKU_CHARS.has(chars[0] ?? "")).toBe(false);
        expect(GYOMATSU_KINSOKU_CHARS.has(chars[chars.length - 1] ?? "")).toBe(false);
      }
    });

    it("중국어 간체·번체 문단에서도 행두·행말 금칙 문자 위반 없이 가로·세로 조판이 가능하다", () => {
      const hans = layoutMultilingualBalloonLines({
        text: "「别回头，快往前跑！」她大声喊道，可是门已经关上了。", locale: "zh-Hans",
        writingMode: "horizontal-tb", contour: "ellipse", innerWidthPx: 190, innerHeightPx: 130, fontSizePx: 17,
      });
      const hant = layoutMultilingualBalloonLines({
        text: "「別回頭，快往前跑！」她大聲喊道，可是門已經關上了。", locale: "zh-Hant",
        writingMode: "vertical-rl", contour: "ellipse", innerWidthPx: 150, innerHeightPx: 195, fontSizePx: 17,
      });
      expect(hans.kinsokuViolationCount).toBe(0);
      expect(hant.kinsokuViolationCount).toBe(0);
      expect(hans.fitsInsideBalloon).toBe(true);
      expect(hant.fitsInsideBalloon).toBe(true);
    });

    it("스페인어 역문장부호(¡¿) 행말 고립과 프랑스어 기유메·물음표 분리를 방지한다", () => {
      const esLayout = layoutMultilingualBalloonLines({
        text: "Oye amigo, ¡cuidado con esa trampa! ¿No la ves?", locale: "es",
        contour: "ellipse", innerWidthPx: 185, innerHeightPx: 135, fontSizePx: 16,
      });
      const frLayout = layoutMultilingualBalloonLines({
        text: "Il a dit : « Ne bouge plus ! » Tu comprends ?", locale: "fr",
        contour: "ellipse", innerWidthPx: 185, innerHeightPx: 135, fontSizePx: 16,
      });
      expect(esLayout.kinsokuViolationCount).toBe(0);
      for (const line of esLayout.lines) {
        expect(line.text.endsWith("¡")).toBe(false);
        expect(line.text.endsWith("¿")).toBe(false);
      }
      expect(frLayout.kinsokuViolationCount).toBe(0);
      for (const line of frLayout.lines) {
        expect(line.text.startsWith("?")).toBe(false);
        expect(line.text.startsWith("!")).toBe(false);
        expect(line.text.startsWith("»")).toBe(false);
        expect(line.text.endsWith("«")).toBe(false);
      }
    });

    it("라틴 장문 어휘는 음절 단위로 하이픈 분할되어 좁은 말풍선에서도 자연스럽게 줄바꿈된다", () => {
      const enSyllables = hyphenateLatinWord("characterization", "en");
      const esSyllables = hyphenateLatinWord("extraordinariamente", "es");
      expect(enSyllables.length).toBeGreaterThanOrEqual(2);
      expect(enSyllables.join("")).toBe("characterization");
      expect(esSyllables.length).toBeGreaterThanOrEqual(3);
      expect(hyphenateLatinWord("대한민국만세입니다", "ko")).toEqual(["대한민국만세입니다"]);

      const narrowLayout = layoutMultilingualBalloonLines({
        text: "This extraordinarily incomprehensible transformation!", locale: "en",
        contour: "ellipse", innerWidthPx: 118, innerHeightPx: 170, fontSizePx: 15, allowHyphenation: true,
      });
      expect(narrowLayout.hyphenationCount).toBeGreaterThanOrEqual(1);
      expect(narrowLayout.lines.some((line) => line.hyphenatedAtEnd && line.text.endsWith("-"))).toBe(true);
      expect(narrowLayout.fitsInsideBalloon).toBe(true);
    });

    it("타원형 말풍선은 중앙 행이 가장 넓고 상·하 행이 좁아지는 다이아몬드 균형 조판을 생성한다", () => {
      const chords = computeContourChordsPx({
        contour: "ellipse", writingMode: "horizontal-tb",
        innerWidthPx: 240, innerHeightPx: 140, lineCount: 3, fontSizePx: 18, lineHeightPx: 24,
      });
      expect(chords.chordsPx[1] ?? 0).toBeGreaterThan(chords.chordsPx[0] ?? 0);
      expect(chords.chordsPx[1] ?? 0).toBeGreaterThan(chords.chordsPx[2] ?? 0);
      expect(Math.abs((chords.chordsPx[0] ?? 0) - (chords.chordsPx[2] ?? 0))).toBeLessThan(0.5);

      const layout = layoutMultilingualBalloonLines({
        text: "We have to reach the northern tower before the storm seals every single bridge tonight!",
        locale: "en", contour: "ellipse", innerWidthPx: 240, innerHeightPx: 150, fontSizePx: 16,
      });
      expect(layout.lineCount).toBeGreaterThanOrEqual(3);
      expect(layout.fitsInsideBalloon).toBe(true);
      expect(layout.diamondSymmetryScore).toBeGreaterThanOrEqual(0.75);
      const midIdx = Math.floor(layout.lineCount / 2);
      expect(layout.lines[midIdx]?.availableChordPx ?? 0).toBeGreaterThan(layout.lines[0]?.availableChordPx ?? 0);
      expect(layout.lines[midIdx]?.availableChordPx ?? 0).toBeGreaterThan(layout.lines[layout.lineCount - 1]?.availableChordPx ?? 0);
    });

    it("사각·둥근사각·외침 말풍선 윤곽별 현 폭 특성과 명시적 개행·빈 문자열을 안전 처리한다", () => {
      const rectChords = computeContourChordsPx({ contour: "rectangle", writingMode: "horizontal-tb", innerWidthPx: 220, innerHeightPx: 130, lineCount: 3, fontSizePx: 18, lineHeightPx: 24 });
      const shoutChords = computeContourChordsPx({ contour: "shout-burst", writingMode: "horizontal-tb", innerWidthPx: 220, innerHeightPx: 130, lineCount: 3, fontSizePx: 18, lineHeightPx: 24 });
      expect(rectChords.chordsPx[0]).toBe(rectChords.chordsPx[1]);
      expect(shoutChords.chordsPx[0] ?? 0).toBeLessThan(rectChords.chordsPx[0] ?? 0);

      const multiPara = layoutMultilingualBalloonLines({ text: "첫 번째 대사!\n두 번째 대사!", locale: "ko", contour: "rounded-rect", innerWidthPx: 220, innerHeightPx: 130, fontSizePx: 18 });
      expect(multiPara.lineCount).toBe(2);

      const empty = layoutMultilingualBalloonLines({ text: "   \n  ", locale: "ko", innerWidthPx: 200, innerHeightPx: 100, fontSizePx: 18 });
      expect(empty.lineCount).toBe(0);
      expect(empty.fitsInsideBalloon).toBe(true);
    });
  });

  describe("adaptive-balloon-reflow-solver", () => {
    it("한국어→스페인어 1.5배 이상 팽창 대사를 가독성 하한 내 이진 탐색으로 원본 말풍선에 자동 피팅한다", () => {
      // 한국어 원문 2줄(20px)에 딱 맞게 설계된 말풍선(radiusX=92, radiusY=52)
      const tightBalloon = makeEllipse({ radiusX: 92, radiusY: 52, paddingX: 12, paddingY: 10 });
      const koBaseline = reflowLocalizedSpeechBalloon(tightBalloon, {
        sourceLocale: "ko", sourceText: "잠깐! 지금 당장 멈춰!", targetLocale: "ko",
        targetText: "잠깐! 지금 당장 멈춰!", baseFontSizePx: 20, cutBounds: MOBILE_CUT,
      });
      expect(koBaseline.status).toBe("fitted");

      const esReflow = reflowLocalizedSpeechBalloon(tightBalloon, {
        sourceLocale: "ko", sourceText: "잠깐! 지금 당장 멈춰!", targetLocale: "es",
        targetText: "¡Espera un segundo! ¡Detente justo ahora mismo!",
        baseFontSizePx: 20, cutBounds: MOBILE_CUT,
      });
      expect(esReflow.expansion.expansionRatio).toBeGreaterThan(1.5);
      expect(esReflow.status).toBe("fitted");
      expect(esReflow.geometryDelta.expanded).toBe(false);
      expect(esReflow.resolvedTypography.fontSizePx).toBeLessThan(20);
      expect(esReflow.resolvedTypography.fontSizePx).toBeGreaterThanOrEqual(esReflow.mobileMinReadableFontSizePx);
      expect(esReflow.layout.fitsInsideBalloon).toBe(true);
      expect(esReflow.convergedIterations).toBeGreaterThanOrEqual(8);
    });

    it("한국어→영어 1.5배 팽창에서도 자간·행간을 가독성 범위 내로 자동 조율해 수납한다", () => {
      const balloon = makeEllipse({ radiusX: 90, radiusY: 52, paddingX: 12, paddingY: 10 });
      const enReflow = reflowLocalizedSpeechBalloon(balloon, {
        sourceLocale: "ko", sourceText: "지금 바로 뛰어!", targetLocale: "en",
        targetText: "Start running forward right this very second!",
        baseFontSizePx: 20, cutBounds: MOBILE_CUT,
      });
      expect(enReflow.expansion.expansionRatio).toBeGreaterThan(1.5);
      expect(enReflow.status).toBe("fitted");
      expect(enReflow.resolvedTypography.fontSizePx).toBeLessThan(20);
      expect(enReflow.resolvedTypography.fontSizePx).toBeGreaterThanOrEqual(enReflow.mobileMinReadableFontSizePx);
      expect(enReflow.resolvedTypography.letterSpacingEm).toBeLessThanOrEqual(0);
    });

    it("한국어→중국어 간체 축소 대사(0.65×~0.85×)에서는 폰트를 과도 축소하지 않고 시각 균형을 유지한다", () => {
      const balloon = makeEllipse({ radiusX: 120, radiusY: 74 });
      const result = reflowLocalizedSpeechBalloon(balloon, {
        sourceLocale: "ko", sourceText: "오늘 밤 약속 잊지 말고 꼭 와야 해!",
        targetLocale: "zh-Hans", targetText: "今晚别忘了一定要来！",
        baseFontSizePx: 19, cutBounds: MOBILE_CUT,
      });
      expect(result.expansion.expansionRatio).toBeLessThan(0.85);
      expect(result.status).toBe("fitted");
      expect(result.resolvedTypography.fontSizePx).toBeGreaterThanOrEqual(19);
      expect(result.geometryDelta.expanded).toBe(false);
      expect(result.readabilityScore).toBeGreaterThanOrEqual(85);
    });

    it("모바일 800px 최소 가독성 하한에 걸리는 장문 번역은 하한을 사수하고 말풍선을 비파괴 확장한다", () => {
      const balloon = makeEllipse({ radiusX: 82, radiusY: 46, paddingX: 12, paddingY: 10, maxRadiusExpansionRatio: 1.55 });
      const result = reflowLocalizedSpeechBalloon(balloon, {
        sourceLocale: "ko", sourceText: "이 작전은 절대 실패해선 안 돼.", targetLocale: "fr",
        targetText: "Cette opération décisive ne doit absolument jamais échouer quoi qu'il arrive devant tout le monde ce soir !",
        baseFontSizePx: 19, cutBounds: MOBILE_CUT,
      });
      expect(result.status).toBe("fitted-expanded");
      expect(result.geometryDelta.expanded).toBe(true);
      expect(result.geometryDelta.originalGeometry.radiusX).toBe(82);
      expect(result.geometryDelta.resolvedGeometry.radiusX).toBeGreaterThan(82);
      expect(result.resolvedTypography.fontSizePx).toBeGreaterThanOrEqual(result.mobileMinReadableFontSizePx);
      expect(result.warnings.some((w) => w.code === "MOBILE_READABILITY_FLOOR_HIT")).toBe(true);
      expect(result.warnings.some((w) => w.code === "BALLOON_EXPANDED_NON_DESTRUCTIVELY")).toBe(true);
    });

    it("최대 비파괴 확장 한도를 초과하거나 확장 금지 시 오버플로 상태와 경고를 정확히 보고한다", () => {
      const tinyBalloon = makeEllipse({ radiusX: 72, radiusY: 42, allowNonDestructiveExpansion: false });
      const result = reflowLocalizedSpeechBalloon(tinyBalloon, {
        sourceLocale: "ko", sourceText: "조심해!", targetLocale: "en",
        targetText: "Watch out right now because the entire underground corridor is collapsing behind us without warning!",
        baseFontSizePx: 18, cutBounds: MOBILE_CUT,
      });
      expect(result.status).toBe("overflow");
      expect(result.layout.fitsInsideBalloon).toBe(false);
      expect(result.warnings.some((w) => w.code === "TEXT_OVERFLOW_UNRESOLVED")).toBe(true);
      expect(result.warnings.some((w) => w.code === "MOBILE_READABILITY_FLOOR_HIT")).toBe(true);
    });

    it("모바일 기준 폭(800px) 대비 2배 해상도 컷(1600px)에서는 최소 가독 픽셀 하한이 비례 확장된다", () => {
      const balloon = makeEllipse({ centerX: 800, centerY: 400, radiusX: 260, radiusY: 140 });
      const res800 = reflowLocalizedSpeechBalloon(balloon, {
        sourceLocale: "ko", sourceText: "안녕!", targetLocale: "en", targetText: "Hello there!",
        baseFontSizePx: 32, cutBounds: MOBILE_CUT,
      });
      const res1600 = reflowLocalizedSpeechBalloon(balloon, {
        sourceLocale: "ko", sourceText: "안녕!", targetLocale: "en", targetText: "Hello there!",
        baseFontSizePx: 32, cutBounds: { x: 0, y: 0, width: 1600, height: 2560, safeMarginPx: 24 },
      });
      expect(res1600.mobileMinReadableFontSizePx).toBeCloseTo(res800.mobileMinReadableFontSizePx * 2, 1);
    });

    it("해석적 타원-AABB 교차 면적은 모서리 바깥 오탐 없이 정확한 교차 여부를 판별한다", () => {
      const ellipse = { contour: "ellipse" as const, centerX: 200, centerY: 200, radiusX: 100, radiusY: 100 };
      expect(computeBalloonRectOverlapAreaPx2(ellipse, { x: 280, y: 280, width: 18, height: 18 })).toBe(0);
      expect(computeBalloonRectOverlapAreaPx2(ellipse, { x: 400, y: 400, width: 50, height: 50 })).toBe(0);
      expect(computeBalloonRectOverlapAreaPx2(ellipse, { x: 180, y: 180, width: 40, height: 40 })).toBeCloseTo(1600, 0);
    });

    it("캐릭터 얼굴 Keepout 영역과 충돌하는 말풍선을 컷 안전 영역 내 무충돌 좌표로 자동 회피한다", () => {
      const faceKeepout: KeepoutRect = { id: "hero-face", kind: "character-face", x: 330, y: 200, width: 150, height: 170, marginPx: 10 };
      const balloon = makeEllipse({ centerX: 390, centerY: 255, radiusX: 115, radiusY: 68, tailTip: { x: 405, y: 345 } });
      const resolved = resolveBalloonKeepoutCollisions({ balloon, cutBounds: MOBILE_CUT, keepoutRects: [faceKeepout] });

      expect(resolved.initialOverlapAreaPx2).toBeGreaterThan(0);
      expect(resolved.moved).toBe(true);
      expect(resolved.residualOverlapAreaPx2).toBe(0);
      expect(resolved.outOfCutBoundsAreaPx2).toBe(0);
      expect(resolved.remainingCollisions).toHaveLength(0);
      expect(resolved.resolvedCenter.x - balloon.radiusX).toBeGreaterThanOrEqual(MOBILE_CUT.x + (MOBILE_CUT.safeMarginPx ?? 0) - 0.5);
    });

    it("확장된 스페인어 말풍선이 인접 캐릭터 눈에 닿으면 확장 직후 자동으로 Keepout을 회피한다", () => {
      // 원본(centerX=380, radiusX=82 -> 우단 462)은 눈(x=474, margin=10 -> 좌단 464)과 미충돌, 확장 후 충돌 발생
      const eyesKeepout: KeepoutRect = { id: "lead-eyes", kind: "character-eyes", x: 474, y: 210, width: 120, height: 95, marginPx: 10 };
      const balloon = makeEllipse({ centerX: 380, centerY: 255, radiusX: 82, radiusY: 46, paddingX: 12, paddingY: 10, maxRadiusExpansionRatio: 1.55 });
      expect(
        computeBalloonRectOverlapAreaPx2(balloon, { x: eyesKeepout.x - 10, y: eyesKeepout.y - 10, width: eyesKeepout.width + 20, height: eyesKeepout.height + 20 })
      ).toBe(0);
      const reflow = reflowLocalizedSpeechBalloon(balloon, {
        sourceLocale: "ko", sourceText: "절대 놓치지 마!", targetLocale: "es",
        targetText: "¡No permitas jamás que se escape por ningún motivo en este mismo instante frente a nosotros!",
        baseFontSizePx: 19, cutBounds: MOBILE_CUT, keepoutRects: [eyesKeepout],
      });
      expect(reflow.geometryDelta.expanded).toBe(true);
      expect(reflow.geometryDelta.repositioned).toBe(true);
      expect(reflow.collisionResolution.residualOverlapAreaPx2).toBe(0);
      expect(reflow.warnings.some((w) => w.code === "BALLOON_REPOSITIONED_FOR_KEEPOUT")).toBe(true);
    });

    it("컷 전체가 금지 영역으로 포화된 극한 상황에서는 잔여 충돌 경고를 누락 없이 보고한다", () => {
      const saturated: KeepoutRect = { id: "full-block", kind: "focal-artwork", x: 0, y: 0, width: 800, height: 1280, marginPx: 0 };
      const reflow = reflowLocalizedSpeechBalloon(makeEllipse({ centerX: 400, centerY: 400, radiusX: 120, radiusY: 70 }), {
        sourceLocale: "ko", sourceText: "대사", targetLocale: "en", targetText: "Dialogue",
        baseFontSizePx: 18, cutBounds: MOBILE_CUT, keepoutRects: [saturated],
      });
      expect(reflow.collisionResolution.residualOverlapAreaPx2).toBeGreaterThan(0);
      expect(reflow.warnings.some((w) => w.code === "KEEPOUT_COLLISION_RESIDUAL")).toBe(true);
    });
  });

  describe("global-episode-l10n-packager", () => {
    it("6개 글로벌 언어 일괄 출고 번들이 언어별 폰트 매니페스트·품질 리포트·SVG/Canvas 지시서를 완비한다", () => {
      const manifest = buildGlobalLocalizationBundle({
        episodeId: "ep-042", episodeTitle: "제42화 빛의 성문", sourceLocale: "ko",
        targetLocales: SIX_GLOBAL_LOCALES, cuts: makeSampleEpisodeCuts(),
      });
      expect(manifest.schemaVersion).toBe("wave59.global-l10n-manifest.v1");
      expect(manifest.packages).toHaveLength(6);
      expect(manifest.summary.totalCuts).toBe(2);
      expect(manifest.summary.totalSourceBalloons).toBe(3);
      expect(manifest.summary.totalLocalizedInstances).toBe(18);
      expect(manifest.summary.totalOverflows).toBe(0);
      expect(manifest.summary.overallReleaseGate).not.toBe("fail-overflow");

      const jaPkg = manifest.packagesByLocale.ja;
      expect(jaPkg?.fontManifest.writingModesUsed).toContain("vertical-rl");
      expect(jaPkg?.fontManifest.uniqueGlyphCount).toBeGreaterThan(15);
      expect(jaPkg?.fontManifest.unicodeRangeHints).toContain("U+3040-309F");
      expect(jaPkg?.cuts[0]?.svgOverlayDocument).toContain('writing-mode="vertical-rl"');

      const enCut2Svg = manifest.packagesByLocale.en?.cuts[1]?.svgOverlayDocument ?? "";
      expect(enCut2Svg).toContain("&lt;Key&gt;");
      expect(enCut2Svg).toContain("&amp;");

      const ops = manifest.packagesByLocale.es?.cuts[0]?.balloons[0]?.canvas2dOps ?? [];
      expect(ops[0]?.op).toBe("save");
      expect(ops[ops.length - 1]?.op).toBe("restore");
      expect(ops.some((op) => op.op === "draw-balloon-contour")).toBe(true);
      expect(ops.some((op) => op.op === "draw-balloon-tail")).toBe(true);
      expect(ops.some((op) => op.op === "draw-text-line")).toBe(true);
    });

    it("같은 컷 내 인접한 두 말풍선은 선행 말풍선이 동적 Keepout으로 등록되어 상호 겹침을 자동 회피한다", () => {
      const cut: EpisodeCutL10nSpec = {
        cutId: "cut-pair", cutIndex: 0, cutBounds: MOBILE_CUT, keepoutRects: [],
        balloons: [
          {
            balloonId: "left-b", readingOrder: 1, baseFontSizePx: 19,
            geometry: makeEllipse({ balloonId: "left-b", centerX: 300, centerY: 260, radiusX: 115, radiusY: 70 }),
            sourceText: "먼저 말할게!", localizedTexts: { es: "¡Déjame hablar primero antes de que sea demasiado tarde!" },
          },
          {
            balloonId: "right-b", readingOrder: 2, baseFontSizePx: 19,
            geometry: makeEllipse({ balloonId: "right-b", centerX: 430, centerY: 260, radiusX: 115, radiusY: 70 }),
            sourceText: "잠깐 내 말도 들어!", localizedTexts: { es: "¡Espera y escucha también lo que tengo que decir ahora!" },
          },
        ],
      };
      const manifest = buildGlobalLocalizationBundle({ episodeId: "ep-overlap-guard", episodeTitle: "동적 충돌 방지", targetLocales: ["es"], cuts: [cut] });
      const esBalloons = manifest.packagesByLocale.es?.cuts[0]?.balloons ?? [];
      const firstGeom = esBalloons[0]?.reflow.geometryDelta.resolvedGeometry;
      const secondGeom = esBalloons[1]?.reflow.geometryDelta.resolvedGeometry;
      expect(esBalloons[1]?.reflow.geometryDelta.repositioned).toBe(true);
      const overlap = computeBalloonRectOverlapAreaPx2(
        secondGeom ?? makeEllipse(),
        { x: (firstGeom?.centerX ?? 0) - (firstGeom?.radiusX ?? 0), y: (firstGeom?.centerY ?? 0) - (firstGeom?.radiusY ?? 0), width: (firstGeom?.radiusX ?? 0) * 2, height: (firstGeom?.radiusY ?? 0) * 2 }
      );
      expect(overlap).toBe(0);
    });

    it("번역 누락 로캘은 원문 폴백 경고(MISSING_LOCALIZED_TEXT_FALLBACK)를 기록하고 출고 게이트에 반영한다", () => {
      const manifest = buildGlobalLocalizationBundle({
        episodeId: "ep-fallback", episodeTitle: "누락 폴백 테스트", sourceLocale: "ko", targetLocales: ["en", "fr"],
        cuts: [{
          cutId: "cut-missing", cutIndex: 0, cutBounds: MOBILE_CUT, keepoutRects: [],
          balloons: [{ balloonId: "b-miss", readingOrder: 1, baseFontSizePx: 18, geometry: makeEllipse({ balloonId: "b-miss" }), sourceText: "아직 번역 전 대사입니다.", localizedTexts: { en: "Translated English dialogue." } }],
        }],
      });
      const frPkg = manifest.packagesByLocale.fr;
      expect(frPkg?.qualityReport.missingTranslationFallbackCount).toBe(1);
      expect(frPkg?.qualityReport.status).toBe("needs-review");
      expect(frPkg?.qualityReport.warnings.some((w) => w.code === "MISSING_LOCALIZED_TEXT_FALLBACK")).toBe(true);
      expect(manifest.summary.overallReleaseGate).toBe("pass-with-warnings");
    });

    it("다국어 6개 언어 일괄 출고 번들은 컷·말풍선 입력 순서가 바뀌어도 완전히 결정론적인 체크섬을 산출한다", () => {
      const cutsA = makeSampleEpisodeCuts();
      const cutsB = [...cutsA].reverse().map((cut) => ({ ...cut, balloons: [...cut.balloons].reverse() }));
      const manifestA = buildGlobalLocalizationBundle({ episodeId: "ep-det", episodeTitle: "결정론 검증", sourceLocale: "ko", targetLocales: SIX_GLOBAL_LOCALES, cuts: cutsA });
      const manifestB = buildGlobalLocalizationBundle({ episodeId: "ep-det", episodeTitle: "결정론 검증", sourceLocale: "ko", targetLocales: SIX_GLOBAL_LOCALES, cuts: cutsB });

      expect(manifestA.manifestChecksum).toMatch(/^[0-9a-f]{16}$/);
      expect(manifestA.manifestChecksum).toBe(manifestB.manifestChecksum);
      expect(JSON.stringify(manifestA)).toBe(JSON.stringify(manifestB));
    });
  });
});
