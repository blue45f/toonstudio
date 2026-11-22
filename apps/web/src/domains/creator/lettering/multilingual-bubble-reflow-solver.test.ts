import { describe, expect, it, vi } from "vitest";

import {
  BUBBLE_SAFE_PADDING_RATIO,
  classifyOverflowCuts,
  createCanvasMeasureTextAdapter,
  createDeterministicMeasureTextAdapter,
  createSfxNonDestructiveLayerMetadata,
  exportDialogueToCsv,
  exportDialogueToXliff,
  hyphenateLatinWord,
  importDialogueFromCsv,
  importDialogueFromXliff,
  layoutJapaneseTategakiColumns,
  reinjectLocalizedDialogueEntries,
  solveMultilingualBubbleReflow,
  transformJapaneseTategakiGlyphs,
  updateSfxLocaleVariant,
  type DialogueInterchangeEntry,
} from "./multilingual-bubble-reflow-solver";

describe("1. measureText 어댑터 & 4개 국어(ko/en/ja/es) 14% 세이프 패딩 리플로우 솔버", () => {
  it("Canvas measureText 어댑터가 font 설정과 실측 폭을 솔버에 정확히 전달한다", () => {
    const measureText = vi.fn((text: string) => ({ width: text.length * 10 }));
    const mockCtx = { font: "", measureText };
    const adapter = createCanvasMeasureTextAdapter(mockCtx);

    const res = solveMultilingualBubbleReflow({
      cutId: "cut-001",
      bubbleId: "b-01",
      locale: "ko",
      text: "지금 바로 출발해야 합니다",
      boxWidthPx: 200,
      boxHeightPx: 140,
      baseFontSizePx: 18,
      measureAdapter: adapter,
    });

    expect(measureText).toHaveBeenCalled();
    expect(mockCtx.font).toContain("px");
    expect(res.safePaddingRatio).toBe(BUBBLE_SAFE_PADDING_RATIO);
    expect(res.safePaddingXPx).toBe(28); // 200 * 0.14
    expect(res.safePaddingYPx).toBe(19.6); // 140 * 0.14
    expect(res.innerWidthPx).toBe(144); // 200 - 56
    expect(res.innerHeightPx).toBe(100.8); // 140 - 39.2
    expect(res.fitStatus).toBe("ok");
    expect(res.badgeTone).toBe("green");
  });

  it("한국어 keep-all은 어절 중간을 임의로 쪼개지 않고 어절 경계에서 줄바꿈한다", () => {
    const adapter = createDeterministicMeasureTextAdapter();
    const res = solveMultilingualBubbleReflow({
      locale: "ko",
      text: "오늘 자정에 탑에서 만나자",
      boxWidthPx: 180,
      boxHeightPx: 180,
      baseFontSizePx: 18,
      measureAdapter: adapter,
    });

    expect(res.lines.length).toBeGreaterThanOrEqual(2);
    // 모든 단어는 온전한 어절로 유지된다(내부 폭 129.6px > 개별 3~4글자 어절 72px)
    const rejoined = res.lines.join(" ");
    expect(rejoined).toBe("오늘 자정에 탑에서 만나자");
    expect(res.lines.every((line) => !line.endsWith("-"))).toBe(true);
  });

  it("영어·스페인어 긴 단어는 결정론 하이픈으로 음절 분할해 좁은 말풍선에 맞춘다", () => {
    expect(hyphenateLatinWord("unbelievable", "en").length).toBeGreaterThan(1);
    expect(hyphenateLatinWord("extraordinario", "es").length).toBeGreaterThan(1);
    // 스페인어 이중자 ch/ll/rr은 내부 분할하지 않는다
    const esParts = hyphenateLatinWord("maravilloso", "es");
    expect(esParts.every((part) => !part.endsWith("l") || !esParts[esParts.indexOf(part) + 1]?.startsWith("l"))).toBe(true);

    const enRes = solveMultilingualBubbleReflow({
      locale: "en",
      text: "Extraordinary determination overcomes impossible obstacles.",
      boxWidthPx: 132,
      boxHeightPx: 260,
      baseFontSizePx: 16,
    });
    const esRes = solveMultilingualBubbleReflow({
      locale: "es",
      text: "Responsabilidad extraordinaria determina completamente nuestro destino.",
      boxWidthPx: 132,
      boxHeightPx: 280,
      baseFontSizePx: 16,
    });

    expect(enRes.hyphenatedLineCount).toBeGreaterThan(0);
    expect(enRes.lines.some((line) => line.endsWith("-"))).toBe(true);
    expect(esRes.hyphenatedLineCount).toBeGreaterThan(0);
    expect(esRes.lines.some((line) => line.endsWith("-"))).toBe(true);
  });

  it("최소 폰트까지 축소해도 넘치는 컷을 빨간 배지(red)로 분류한다", () => {
    const batch = classifyOverflowCuts([
      {
        cutId: "cut-ok",
        bubbleId: "b-1",
        locale: "ko",
        text: "짧은 대사",
        boxWidthPx: 220,
        boxHeightPx: 140,
        baseFontSizePx: 18,
      },
      {
        cutId: "cut-overflow-es",
        bubbleId: "b-2",
        locale: "es",
        text: "Esta es una explicación extremadamente detallada sobre el contrato antiguo del reloj de medianoche que no cabe en un globo diminuto.",
        boxWidthPx: 150,
        boxHeightPx: 90,
        baseFontSizePx: 18,
      },
    ]);

    expect(batch.totalBubbles).toBe(2);
    expect(batch.greenBadgeCount).toBe(1);
    expect(batch.redBadgeCount).toBe(1);
    expect(batch.redBadgeCutIds).toEqual(["cut-overflow-es"]);
    const overflowItem = batch.results.find((r) => r.cutId === "cut-overflow-es");
    expect(overflowItem?.fitStatus).toBe("overflow");
    expect(overflowItem?.badgeTone).toBe("red");
    expect(overflowItem?.overflowPx).toBeGreaterThan(0);
  });
});

describe("2. 일본어 세로쓰기(Tategaki) 글리프 회전·치환 및 열 경계 처리 (#090)", () => {
  it("말줄임표(…)·장음부호(ー)·괄호(「」/『』/（）)·대시(—)의 90° 회전과 세로 치환을 정확히 처리한다", () => {
    const transformed = transformJapaneseTategakiGlyphs("「待って…本当に（コーヒー）——『行く』のー？」");

    expect(transformed.ellipsisCount).toBe(1);
    expect(transformed.prolongedSoundCount).toBe(3); // コーヒー의 ー×2 + のー의 ー×1
    expect(transformed.bracketCount).toBe(6); // 「」 （） 『』
    expect(transformed.dashCount).toBe(2); // ——

    expect(transformed.verticalSubstitutedText).toContain("﹁");
    expect(transformed.verticalSubstitutedText).toContain("﹂");
    expect(transformed.verticalSubstitutedText).toContain("﹃");
    expect(transformed.verticalSubstitutedText).toContain("﹄");
    expect(transformed.verticalSubstitutedText).toContain("︵");
    expect(transformed.verticalSubstitutedText).toContain("︶");
    expect(transformed.verticalSubstitutedText).toContain("︙");
    expect(transformed.verticalSubstitutedText).toContain("｜");
    expect(transformed.verticalSubstitutedText).toContain("︱");

    const ellipsisGlyph = transformed.glyphs.find((g) => g.sourceChar === "…");
    const prolongedGlyph = transformed.glyphs.find((g) => g.sourceChar === "ー");
    const openBracket = transformed.glyphs.find((g) => g.sourceChar === "「");
    const closeBracket = transformed.glyphs.find((g) => g.sourceChar === "」");
    const firstDash = transformed.glyphs.find((g) => g.sourceChar === "—");
    const kanjiGlyph = transformed.glyphs.find((g) => g.sourceChar === "待");

    expect(ellipsisGlyph?.rotationDeg).toBe(90);
    expect(prolongedGlyph?.rotationDeg).toBe(90);
    expect(prolongedGlyph?.boundaryRole).toBe("no-column-start");
    expect(openBracket?.boundaryRole).toBe("no-column-end");
    expect(closeBracket?.boundaryRole).toBe("no-column-start");
    expect(firstDash?.rotationDeg).toBe(90);
    expect(firstDash?.boundaryRole).toBe("keep-with-next");
    expect(kanjiGlyph?.rotationDeg).toBe(0);
    expect(kanjiGlyph?.category).toBe("upright");
  });

  it("ASCII 말줄임(...)과 이중 하이픈(--)을 정규화하고 열 경계에서 여는 괄호 고립·쌍말줄임 분단을 막는다", () => {
    const layout = layoutJapaneseTategakiColumns("あいう「えおか……きくけー」", {
      innerHeightPx: 80, // 20px 폰트 기준 열당 최대 4자
      fontSizePx: 20,
      lineHeight: 1.4,
    });

    expect(layout.columnCount).toBeGreaterThanOrEqual(3);
    expect(layout.boundaryAdjustments).toBeGreaterThan(0);
    // 여는 괄호 「가 열 끝에 혼자 남지 않는다
    expect(layout.columns.every((col) => !col.text.endsWith("「"))).toBe(true);
    // 장음부호 ー와 닫는 괄호 」가 새 열의 첫 글자로 떨어지지 않는다
    for (let i = 1; i < layout.columns.length; i += 1) {
      const colText = layout.columns[i]!.text;
      expect(colText.startsWith("ー")).toBe(false);
      expect(colText.startsWith("」")).toBe(false);
    }
    // 쌍말줄임표 ……가 두 열로 쪼개지지 않고 한 열 안에 묶여 있다
    expect(layout.columns.some((col) => col.text.includes("……"))).toBe(true);

    const verticalReflow = solveMultilingualBubbleReflow({
      locale: "ja",
      writingMode: "vertical-rl",
      text: "「待って...本当に——行くのー？」",
      boxWidthPx: 220,
      boxHeightPx: 220,
      baseFontSizePx: 18,
    });
    expect(verticalReflow.writingMode).toBe("vertical-rl");
    expect(verticalReflow.tategaki).not.toBeNull();
    expect(verticalReflow.tategaki?.transform.normalizedText).toContain("…");
    expect(verticalReflow.tategaki?.transform.normalizedText).toContain("—");
  });
});

describe("3. SFX 비손상 레이어 분리 메타데이터 & CSV/XLIFF 1.2 무손실 왕복 (#089)", () => {
  it("SFX 외곽선·아치 변형·배경 비손상 잠금 메타데이터와 언어별 변형을 불변으로 관리한다", () => {
    const base = createSfxNonDestructiveLayerMetadata({
      sfxId: "sfx-014",
      cutId: "cut-014",
      sourceText: "우르르릉!",
      backgroundLayerId: "layer-bg-014",
      outlineWidthPx: 8,
      archShape: "wave",
      bendPercent: 45,
    });
    const withEn = updateSfxLocaleVariant(base, "en", { text: "RUMBLEEE!", scaleFactor: 0.88 });

    expect(withEn.layerRole).toBe("sfx-overlay");
    expect(withEn.backgroundPreservation.nonDestructive).toBe(true);
    expect(withEn.backgroundPreservation.originalArtworkLocked).toBe(true);
    expect(withEn.backgroundPreservation.inpaintMaskLayerId).toBe("layer-bg-014__sfx-mask-sfx-014");
    expect(withEn.outline.widthPx).toBe(8);
    expect(withEn.archWarp.shape).toBe("wave");
    expect(withEn.localeVariants.ko?.text).toBe("우르르릉!");
    expect(withEn.localeVariants.en?.text).toBe("RUMBLEEE!");
    expect(base.localeVariants.en).toBeUndefined();
  });

  it("CSV 추출 → 번역 수정 → 역주입이 쉼표·따옴표·줄바꿈·SFX 메타데이터를 100% 보존한다", () => {
    const original: readonly DialogueInterchangeEntry[] = [
      {
        cutId: "cut-001",
        bubbleId: "b-01",
        speaker: "수연",
        kind: "dialogue",
        writingMode: "horizontal-tb",
        sourceLocale: "ko",
        texts: {
          ko: '그 편지, "자정 전"에 도착했어.\n정말이야.',
          en: 'The letter arrived "before midnight",\nreally.',
        },
        notes: "긴장감 유지",
      },
      {
        cutId: "cut-002",
        bubbleId: "sfx-01",
        speaker: "SFX",
        kind: "sfx",
        writingMode: "vertical-rl",
        sourceLocale: "ko",
        texts: { ko: "콰앙!", ja: "ドゴーン！" },
        sfxOutlineWidthPx: 7,
        sfxArchShape: "arcUp",
      },
    ];

    const csv = exportDialogueToCsv(original, { includeUtf8Bom: true });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const parsed = importDialogueFromCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.texts.ko).toBe('그 편지, "자정 전"에 도착했어.\n정말이야.');
    expect(parsed[1]!.sfxOutlineWidthPx).toBe(7);
    expect(parsed[1]!.sfxArchShape).toBe("arcUp");

    const editedCsv = csv.replace("ドゴーン！", "ズドーン！");
    const reinjected = reinjectLocalizedDialogueEntries(original, importDialogueFromCsv(editedCsv));
    expect(reinjected.updatedCount).toBe(1);
    expect(reinjected.unchangedCount).toBe(1);
    expect(reinjected.unmatchedIds).toEqual([]);
    expect(reinjected.entries[1]!.texts.ja).toBe("ズドーン！");
  });

  it("XLIFF 1.2 추출 → XML 특수문자·역순 속성 파싱 → 역주입 왕복을 무손실로 처리한다", () => {
    const original: readonly DialogueInterchangeEntry[] = [
      {
        cutId: "cut-010",
        bubbleId: "b-10",
        speaker: "도윤",
        kind: "dialogue",
        writingMode: "vertical-rl",
        sourceLocale: "ko",
        texts: {
          ko: "A & B <약속> \"지켜줘\"",
          ja: "「待って…本当に——？」",
        },
        notes: "세로쓰기 유지",
      },
    ];

    const xliff = exportDialogueToXliff(original, {
      originalName: "ep12.json",
      sourceLocale: "ko",
      targetLocale: "ja",
    });
    expect(xliff).toContain('<xliff version="1.2"');
    expect(xliff).toContain("&amp;");
    expect(xliff).toContain("&lt;약속&gt;");

    // 번역가가 타깃을 수정하고 속성 순서를 바꾼 외부 CAT 출력도 정상 복원
    const translatedXliff = xliff
      .replace('source-language="ko" target-language="ja"', 'target-language="ja" source-language="ko"')
      .replace("「待って…本当に——？」", "「待って…絶対に——行くの？」");

    const imported = importDialogueFromXliff(translatedXliff);
    expect(imported.sourceLocale).toBe("ko");
    expect(imported.targetLocale).toBe("ja");
    expect(imported.entries[0]!.texts.ko).toBe('A & B <약속> "지켜줘"');
    expect(imported.entries[0]!.writingMode).toBe("vertical-rl");

    const reinjected = reinjectLocalizedDialogueEntries(original, imported.entries, "ja");
    expect(reinjected.updatedCount).toBe(1);
    expect(reinjected.entries[0]!.texts.ja).toBe("「待って…絶対に——行くの？」");
  });
});
