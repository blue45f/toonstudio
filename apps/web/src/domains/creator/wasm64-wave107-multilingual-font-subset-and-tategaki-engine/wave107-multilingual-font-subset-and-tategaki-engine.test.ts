import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMIC_FONT_REGISTRY,
  SERIALIZATION_LOCALE_CODES,
  auditEpisodeFontFallbackAndSubset,
  auditMultiLocaleEpisodeBundle,
  canonicalizeTypographyJson,
  createDefaultComicFontChainForLocale,
  escapeTypographySvgXml,
  extractUnicodeCodePoints,
  fontSupportsCodePoint,
  formatCssUnicodeRange,
  formatUnicodeHex,
  getSerializationLocaleProfile,
  renderMultilingualTypographySheetSvg,
  sha256TypographyHex,
  summarizeMultilingualFontAuditKo,
  typesetJapaneseTategakiColumns,
  type ComicFontDescriptor,
  type EpisodeLocalizedDialogueLine,
} from "./index";

describe("Wave 107 — 다국어 폰트 서브세팅 및 무두부(Zero-Tofu) 폴백 감사", () => {
  it("ko-KR 로캘에서 기본+폴백 폰트 체인으로 무두부 100% 커버 및 85% 이상 용량 절감을 달성한다", () => {
    const lines: readonly EpisodeLocalizedDialogueLine[] = [
      { bubbleId: "b-01", text: "오늘 밤 서울역 12번 출구에서 만나자! ★" },
      { bubbleId: "b-02", text: "늦으면 안 돼… 준비 다 끝났어? ♥" },
    ];
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-ko",
      episodeTitle: "107화 서울역 야간 특급",
      locale: "ko-KR",
      dialogueLines: lines,
      fallbackChain: createDefaultComicFontChainForLocale("ko-KR"),
    });

    expect(result.writingDirection).toBe("horizontal-ltr");
    expect(result.isRtl).toBe(false);
    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(true);
    expect(result.usedFontCount).toBe(2);
    expect(result.subsetSavingsPercent).toBeGreaterThanOrEqual(90);
    expect(result.totalSubsetWoff2Bytes).toBeLessThan(result.totalFullFontBytes);
    expect(result.subsetManifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ja-JP 로캘에서 세로쓰기 방향(vertical-rl)과 한자·가나 무두부 서브셋 절감을 검증한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-ja",
      locale: "ja-JP",
      dialogueLines: [
        { bubbleId: "jp-1", text: "「東京まであと12分!? 急げー！」" },
        { bubbleId: "jp-2", text: "『新宿駅のホームで待ってるよ…』★" },
      ],
      fallbackChain: createDefaultComicFontChainForLocale("ja-JP"),
    });

    expect(result.writingDirection).toBe("vertical-rl");
    expect(result.isRtl).toBe(false);
    expect(result.localeProfile.defaultVertical).toBe(true);
    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(true);
    expect(result.subsetSavingsPercent).toBeGreaterThanOrEqual(90);
  });

  it("en-US 로캘에서 영어 대사 무두부 및 높은 WOFF2 서브셋 절감률을 검증한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-en",
      locale: "en-US",
      dialogueLines: [
        { bubbleId: "en-1", text: "WAIT! Did the 12:00 express leave already?!" },
        { bubbleId: "en-2", text: "Hold tight — we still have a chance! ★" },
      ],
      fallbackChain: createDefaultComicFontChainForLocale("en-US"),
    });

    expect(result.writingDirection).toBe("horizontal-ltr");
    expect(result.isRtl).toBe(false);
    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(true);
    expect(result.subsetSavingsPercent).toBeGreaterThanOrEqual(85);
  });

  it("fr-FR 로캘에서 프랑스어 악센트·구두점(é, è, ê, ç, œ, «, ») 무두부 커버를 검증한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-fr",
      locale: "fr-FR",
      dialogueLines: [
        { bubbleId: "fr-1", text: "« C’est déjà l’heure du départ à l’aube ! »" },
        { bubbleId: "fr-2", text: "Mon cœur bat si vite… ça va être incroyable !" },
      ],
      fallbackChain: createDefaultComicFontChainForLocale("fr-FR"),
    });

    expect(result.writingDirection).toBe("horizontal-ltr");
    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(true);
    expect(result.subsetSavingsPercent).toBeGreaterThanOrEqual(85);
  });

  it("ar-SA 로캘에서 horizontal-rtl 쓰기 방향과 isRtl=true, 아랍어 무두부 커버를 검증한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-ar",
      locale: "ar-SA",
      dialogueLines: [
        { bubbleId: "ar-1", text: "مرحباً! هل القطار السريع جاهز الآن؟" },
        { bubbleId: "ar-2", text: "نعم، سننطلق خلال 12 دقيقة!" },
      ],
      fallbackChain: createDefaultComicFontChainForLocale("ar-SA"),
    });

    expect(result.writingDirection).toBe("horizontal-rtl");
    expect(result.isRtl).toBe(true);
    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(true);
    expect(result.subsetSavingsPercent).toBeGreaterThanOrEqual(85);
  });

  it("5개 연재 로캘(ko-KR·ja-JP·en-US·fr-FR·ar-SA) 일괄 번들 감사가 모두 통과한다", () => {
    expect(SERIALIZATION_LOCALE_CODES).toEqual(["ko-KR", "ja-JP", "en-US", "fr-FR", "ar-SA"]);
    const bundle = auditMultiLocaleEpisodeBundle("ep-107-global", "글로벌 동시 연재 107화", [
      { locale: "ko-KR", dialogueLines: [{ bubbleId: "k1", text: "출발하자!" }] },
      { locale: "ja-JP", dialogueLines: [{ bubbleId: "j1", text: "出発しよう！" }] },
      { locale: "en-US", dialogueLines: [{ bubbleId: "e1", text: "Let's go!" }] },
      { locale: "fr-FR", dialogueLines: [{ bubbleId: "f1", text: "Allons-y !" }] },
      { locale: "ar-SA", dialogueLines: [{ bubbleId: "a1", text: "هيا ننطلق!" }] },
    ]);

    expect(bundle.localeReports).toHaveLength(5);
    expect(bundle.totalTofuCount).toBe(0);
    expect(bundle.allLocalesReleaseReady).toBe(true);
    expect(bundle.overallSubsetSavingsPercent).toBeGreaterThanOrEqual(90);
    expect(bundle.bundleManifestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("폴백 체인 우선순위를 지켜 1순위 폰트가 먼저 클레임하고 미사용 폰트는 0바이트로 제외한다", () => {
    const unusedExtra: ComicFontDescriptor = {
      ...DEFAULT_COMIC_FONT_REGISTRY["ar-naskh-webtoon"],
      fontId: "unused-third-font",
    };
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-priority",
      locale: "ko-KR",
      dialogueLines: [{ bubbleId: "b1", text: "안녕! ★" }],
      fallbackChain: [
        DEFAULT_COMIC_FONT_REGISTRY["ko-nanum-comic"],
        DEFAULT_COMIC_FONT_REGISTRY["fallback-comic-symbols"],
        unusedExtra,
      ],
    });

    expect(result.fontPlans[0].isUsed).toBe(true);
    expect(result.fontPlans[0].usedGlyphCount).toBe(3); // 안, 녕, !
    expect(result.fontPlans[1].isUsed).toBe(true);
    expect(result.fontPlans[1].usedGlyphCount).toBe(1); // ★
    expect(result.fontPlans[2].isUsed).toBe(false);
    expect(result.fontPlans[2].estimatedSubsetWoff2Bytes).toBe(0);
  });

  it("서로게이트 페어 확장 한자(𠀋, U+2000B)가 미지원일 때 두부 결손으로 fail-closed 차단한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-tofu-extb",
      locale: "ja-JP",
      dialogueLines: [{ bubbleId: "b-extb", text: "古文書に「𠀋」と記されていた。" }],
      fallbackChain: createDefaultComicFontChainForLocale("ja-JP"),
    });

    expect(result.tofuCount).toBe(1);
    expect(result.missingTofuChars[0].codePoint).toBe(0x2000b);
    expect(result.missingTofuChars[0].hexCode).toBe("U+2000B");
    expect(result.missingTofuChars[0].character).toBe("𠀋");
    expect(result.missingTofuChars[0].bubbleIds).toEqual(["b-extb"]);
    expect(result.releaseReady).toBe(false);
    expect(result.blockingReasons.some((r) => r.code === "MISSING_TOFU_GLYPHS")).toBe(true);
  });

  it("explicitCodePoints에 확장 평면 문자(𠀋, U+2000B)가 등록되면 1개 코드포인트로 정상 해석한다", () => {
    const customExtFont: ComicFontDescriptor = {
      ...DEFAULT_COMIC_FONT_REGISTRY["ja-antique-manga"],
      fontId: "ja-antique-extb",
      explicitCodePoints: [0x2000b],
    };
    const points = extractUnicodeCodePoints("𠀋");
    expect(points).toEqual([0x2000b]);
    expect(fontSupportsCodePoint(customExtFont, 0x2000b)).toBe(true);

    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-extb-ok",
      locale: "ja-JP",
      dialogueLines: [{ bubbleId: "b1", text: "古字「𠀋」" }],
      fallbackChain: [customExtFont],
    });

    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(true);
  });

  it("한국어 전용 폰트 체인에 아랍어 문자가 혼입되면 두부 결손을 검출하고 출고를 차단한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-ko-ar-leak",
      locale: "ko-KR",
      dialogueLines: [{ bubbleId: "b-leak", text: "한국어 대사에 아랍어 مرحبا 혼입" }],
      fallbackChain: [DEFAULT_COMIC_FONT_REGISTRY["ko-nanum-comic"]],
    });

    expect(result.tofuCount).toBeGreaterThanOrEqual(5);
    expect(result.releaseReady).toBe(false);
    expect(result.missingTofuChars.every((item) => item.bubbleIds.includes("b-leak"))).toBe(true);
  });

  it("사용 폰트의 embeddingLicenseAllowed가 false이면 fail-closed로 출고를 차단한다", () => {
    const restrictedFont: ComicFontDescriptor = {
      ...DEFAULT_COMIC_FONT_REGISTRY["ko-nanum-comic"],
      fontId: "ko-no-embed",
      familyName: "PrintOnly Gothic",
      embeddingLicenseAllowed: false,
      commercialWebtoonAllowed: true,
    };
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-license-embed",
      locale: "ko-KR",
      dialogueLines: [{ bubbleId: "b1", text: "임베딩 불가 폰트 테스트" }],
      fallbackChain: [restrictedFont],
    });

    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(false);
    expect(result.licenseViolations).toHaveLength(1);
    expect(result.licenseViolations[0].code).toBe("EMBEDDING_LICENSE_DENIED");
  });

  it("사용 폰트의 commercialWebtoonAllowed가 false이면 fail-closed로 출고를 차단한다", () => {
    const personalOnlyFont: ComicFontDescriptor = {
      ...DEFAULT_COMIC_FONT_REGISTRY["ja-antique-manga"],
      fontId: "ja-personal-only",
      familyName: "Personal Hobby Manga",
      embeddingLicenseAllowed: true,
      commercialWebtoonAllowed: false,
    };
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-license-comm",
      locale: "ja-JP",
      dialogueLines: [{ bubbleId: "b1", text: "商用不可テスト" }],
      fallbackChain: [personalOnlyFont],
    });

    expect(result.tofuCount).toBe(0);
    expect(result.releaseReady).toBe(false);
    expect(result.licenseViolations).toHaveLength(1);
    expect(result.licenseViolations[0].code).toBe("COMMERCIAL_WEBTOON_LICENSE_DENIED");
  });

  it("실제 사용되지 않은 폴백 폰트의 라이선스 제한은 출고를 오차단하지 않는다", () => {
    const unusedRestricted: ComicFontDescriptor = {
      ...DEFAULT_COMIC_FONT_REGISTRY["fallback-comic-symbols"],
      fontId: "unused-restricted-sym",
      embeddingLicenseAllowed: false,
      commercialWebtoonAllowed: false,
    };
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-unused-restricted",
      locale: "ko-KR",
      dialogueLines: [{ bubbleId: "b1", text: "한글 기본 대사만 사용" }],
      fallbackChain: [DEFAULT_COMIC_FONT_REGISTRY["ko-nanum-comic"], unusedRestricted],
    });

    expect(result.fontPlans[1].isUsed).toBe(false);
    expect(result.licenseViolations).toHaveLength(0);
    expect(result.releaseReady).toBe(true);
  });

  it("빈 폴백 체인은 EMPTY_FALLBACK_CHAIN으로 fail-closed 차단한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-empty-chain",
      locale: "en-US",
      dialogueLines: [{ bubbleId: "b1", text: "Hello" }],
      fallbackChain: [],
    });

    expect(result.releaseReady).toBe(false);
    expect(result.tofuCount).toBe(4);
    expect(result.blockingReasons.some((r) => r.code === "EMPTY_FALLBACK_CHAIN")).toBe(true);
  });

  it("공백·개행·전각 공백(　)은 두부 오탐 없이 무시하고 CSS unicode-range를 압축한다", () => {
    const result = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-whitespace",
      locale: "en-US",
      dialogueLines: [{ bubbleId: "b1", text: "A B\nC\tD　A" }],
      fallbackChain: createDefaultComicFontChainForLocale("en-US"),
    });

    expect(result.tofuCount).toBe(0);
    expect(result.totalNonWhitespaceCodePoints).toBe(5);
    expect(result.uniqueCodePointCount).toBe(4);
    expect(result.fontPlans[0].usedUnicodeRangeCss).toBe("U+0041-0044");
    expect(formatCssUnicodeRange([0x0021, 0x0041, 0x0042, 0x0043])).toBe("U+0021, U+0041-0043");
    expect(formatUnicodeHex(0x41)).toBe("U+0041");
  });

  it("순수 ES2017 FIPS 180-4 SHA-256이 공식 벡터와 일치하고 대사 순서 무관 결정론을 보장한다", () => {
    expect(sha256TypographyHex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256TypographyHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(canonicalizeTypographyJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');

    const chain = createDefaultComicFontChainForLocale("ko-KR");
    const runA = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-det",
      locale: "ko-KR",
      dialogueLines: [
        { bubbleId: "b1", text: "첫 번째 대사" },
        { bubbleId: "b2", text: "두 번째 대사" },
      ],
      fallbackChain: chain,
    });
    const runB = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-det",
      locale: "ko-KR",
      dialogueLines: [
        { bubbleId: "b2", text: "두 번째 대사" },
        { bubbleId: "b1", text: "첫 번째 대사" },
      ],
      fallbackChain: chain,
    });

    expect(runA.subsetManifestSha256).toBe(runB.subsetManifestSha256);
    expect(getSerializationLocaleProfile("ar-SA").isRtl).toBe(true);
  });
});

describe("Wave 107 — 일본어 세로쓰기(Tategaki) 조판 엔진", () => {
  it("열은 우→좌(col[0].x > col[1].x > col[2].x), 글리프는 위→아래(glyph[i].y < glyph[i+1].y)로 단조 배치한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "あいうえおかきくけこさしすせそたちつてと",
      maxGlyphsPerColumn: 6,
      fontSizePx: 24,
    });

    expect(layout.writingMode).toBe("vertical-rl");
    expect(layout.columns.length).toBeGreaterThanOrEqual(3);
    expect(layout.isRightToLeftMonotonic).toBe(true);
    expect(layout.isTopToBottomMonotonic).toBe(true);
    expect(layout.columns[0].x).toBeGreaterThan(layout.columns[1].x);
    expect(layout.columns[1].x).toBeGreaterThan(layout.columns[2].x);

    for (let c = 0; c < layout.columns.length; c += 1) {
      const glyphs = layout.columns[c].glyphs;
      for (let i = 1; i < glyphs.length; i += 1) {
        expect(glyphs[i - 1].y).toBeLessThan(glyphs[i].y);
      }
    }
  });

  it("명시적 줄바꿈(\\n)이 새 세로 열을 우→좌 순서로 분할한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "一行目\n二行目\n三行目",
      maxGlyphsPerColumn: 10,
    });

    expect(layout.columns).toHaveLength(3);
    expect(layout.columns[0].glyphs.map((g) => g.text).join("")).toBe("一行目");
    expect(layout.columns[1].glyphs.map((g) => g.text).join("")).toBe("二行目");
    expect(layout.columns[2].glyphs.map((g) => g.text).join("")).toBe("三行目");
    expect(layout.columns[0].x).toBeGreaterThan(layout.columns[1].x);
    expect(layout.columns[1].x).toBeGreaterThan(layout.columns[2].x);
  });

  it("세로 문장부호(ー, 「, 」, 『, 』, （, ）, …, —, 〜)에 verticalRotated=true와 rotationDeg=90을 부여한다", () => {
    const targetChars = ["ー", "「", "」", "『", "』", "（", "）", "…", "—", "〜"];
    const layout = typesetJapaneseTategakiColumns({
      text: `あ${targetChars.join("い")}う`,
      maxGlyphsPerColumn: 30,
    });

    const allGlyphs = layout.columns.flatMap((c) => c.glyphs);
    for (let i = 0; i < targetChars.length; i += 1) {
      const glyph = allGlyphs.find((g) => g.text === targetChars[i]);
      expect(glyph).toBeDefined();
      expect(glyph?.verticalRotated).toBe(true);
      expect(glyph?.rotationDeg).toBe(90);
      expect(Number.isFinite(glyph?.opticalOffsetX ?? Number.NaN)).toBe(true);
      expect(Number.isFinite(glyph?.opticalOffsetY ?? Number.NaN)).toBe(true);
    }
    expect(layout.verticalRotatedCount).toBe(targetChars.length);
  });

  it("일본어 구두점(、, 。)은 회전 없이 우상단 광학 오프셋(+X, -Y)을 적용한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "雨、降る。",
      maxGlyphsPerColumn: 10,
    });
    const glyphs = layout.columns[0].glyphs;
    const comma = glyphs.find((g) => g.text === "、");
    const period = glyphs.find((g) => g.text === "。");

    expect(comma?.verticalRotated).toBe(false);
    expect(comma?.rotationDeg).toBe(0);
    expect(comma?.punctuationOpticalShifted).toBe(true);
    expect(comma?.opticalOffsetX).toBeGreaterThan(0);
    expect(comma?.opticalOffsetY).toBeLessThan(0);

    expect(period?.verticalRotated).toBe(false);
    expect(period?.rotationDeg).toBe(0);
    expect(period?.punctuationOpticalShifted).toBe(true);
    expect(period?.opticalOffsetX).toBeGreaterThan(0);
    expect(period?.opticalOffsetY).toBeLessThan(0);
  });

  it("종중횡(縦中横)으로 2자리 숫자(12, 99)와 감탄 부호 쌍(!?, !!, ?!)을 단일 정립 셀로 묶는다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "残り12分で第99話!?本当!!え?!",
      maxGlyphsPerColumn: 20,
    });
    const allGlyphs = layout.columns.flatMap((c) => c.glyphs);
    const tcyTexts = allGlyphs.filter((g) => g.isTateChuYoko).map((g) => g.text);

    expect(tcyTexts).toEqual(["12", "99", "!?", "!!", "?!"]);
    expect(layout.tateChuYokoCount).toBe(5);
    for (const glyph of allGlyphs.filter((g) => g.isTateChuYoko)) {
      expect(glyph.rotationDeg).toBe(0);
      expect(glyph.verticalRotated).toBe(false);
    }
  });

  it("3자리 이상 숫자(2026, 100)는 2자리 종중횡으로 잘못 분할하지 않는다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "西暦2026年100回",
      maxGlyphsPerColumn: 20,
    });
    const allGlyphs = layout.columns.flatMap((c) => c.glyphs);
    expect(layout.tateChuYokoCount).toBe(0);
    expect(allGlyphs.filter((g) => g.isTateChuYoko)).toHaveLength(0);
  });

  it("금칙 처리(禁則処理)가 。、」』）！？ー의 행두 출현을 모든 열 경계에서 원천 차단한다", () => {
    const sample = "あいうえ。かきくけ、さしすせ」たちつて』なにぬね）はひふへ！まみむめ？やゆよわーおわり。";
    for (let cap = 4; cap <= 8; cap += 1) {
      const layout = typesetJapaneseTategakiColumns({
        text: sample,
        maxGlyphsPerColumn: cap,
        allowKinsokuHanging: true,
      });
      expect(layout.kinsokuViolationCount).toBe(0);
      for (let c = 1; c < layout.columns.length; c += 1) {
        const first = layout.columns[c].glyphs[0]?.text ?? "";
        expect(["、", "。", "」", "』", "）", "！", "？", "ー"]).not.toContain(first);
      }
    }
  });

  it("촉음·요음(っ, ッ, ゃ, ゅ, ょ)과 매달기 비활성(追い出し) 모드에서도 금칙 위반이 0건이다", () => {
    const sample = "あいうえっかきくけッさしすせゃたちつてゅなにぬねょまみむめ。";
    const layout = typesetJapaneseTategakiColumns({
      text: sample,
      maxGlyphsPerColumn: 4,
      allowKinsokuHanging: false,
    });

    expect(layout.kinsokuViolationCount).toBe(0);
    expect(layout.kinsokuAdjustments.length).toBeGreaterThan(0);
    expect(
      layout.kinsokuAdjustments.some((adj) => adj.action === "pushed-to-next-column"),
    ).toBe(true);
    for (let c = 1; c < layout.columns.length; c += 1) {
      const first = layout.columns[c].glyphs[0]?.text ?? "";
      expect(["っ", "ッ", "ゃ", "ゅ", "ょ", "。"]).not.toContain(first);
    }
  });

  it("열 끝에 단독 잔류하는 여는 괄호(「, 『)를 행말 금칙 처리로 다음 열 첫머리로 이동한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "あいう「えおかき『くけこ",
      maxGlyphsPerColumn: 4,
    });

    expect(layout.kinsokuViolationCount).toBe(0);
    expect(layout.columns[0].glyphs[layout.columns[0].glyphs.length - 1].text).not.toBe("「");
    expect(layout.columns[1].glyphs[0].text).toBe("「");
    expect(
      layout.kinsokuAdjustments.some((adj) => adj.action === "pushed-opening-bracket"),
    ).toBe(true);
  });

  it("인라인 {東京|とうきょう} 루비 후리가나를 0.45em으로 부모 한자 우측에 겹침 0건으로 배치한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "「{東京|とうきょう}から{新宿|しんじゅく}まで12分!?急いで{乗車|じょうしゃ}しよう。」",
      maxGlyphsPerColumn: 7,
      fontSizePx: 24,
      rubyScale: 0.45,
    });

    expect(layout.rubyAnnotationCount).toBe(3);
    expect(layout.rubyFontSizePx).toBe(10.8);
    expect(layout.rubyColumnOverlapCount).toBe(0);
    expect(layout.kinsokuViolationCount).toBe(0);

    const tokyoRuby = layout.rubyAnnotations.find((r) => r.baseText === "東京");
    expect(tokyoRuby).toBeDefined();
    expect(tokyoRuby?.reading).toBe("とうきょう");
    expect(tokyoRuby?.characters).toHaveLength(5);
    const parentCol = layout.columns[tokyoRuby?.columnIndex ?? 0];
    expect(tokyoRuby?.bounds.minX ?? 0).toBeGreaterThan(parentCol.x + layout.fontSizePx / 2);
  });

  it("같은 열에 연속 배치된 루비 한자 복합어({東京|とうきょう}{駅|えき})도 상호 겹침 0건을 유지한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "{東京|とうきょう}{駅|えき}の{改札|かいさつ}",
      maxGlyphsPerColumn: 8,
      fontSizePx: 24,
      rubyScale: 0.45,
    });

    expect(layout.rubyAnnotationCount).toBe(3);
    expect(layout.rubyColumnOverlapCount).toBe(0);
    expect(layout.rubyAnnotations[0].bounds.maxY).toBeLessThan(layout.rubyAnnotations[1].bounds.minY);
  });

  it("explicitRubySpans로 인라인 마크업 없이 루비를 부착해도 겹침 0건으로 배치한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "京都の夜明けは早い。",
      explicitRubySpans: [
        { startIndex: 0, endIndex: 2, reading: "きょうと" },
        { startIndex: 3, endIndex: 6, reading: "よあけ" },
      ],
      maxGlyphsPerColumn: 5,
    });

    expect(layout.plainText).toBe("京都の夜明けは早い。");
    expect(layout.rubyAnnotationCount).toBe(2);
    expect(layout.rubyColumnOverlapCount).toBe(0);
    expect(layout.kinsokuViolationCount).toBe(0);
  });

  it("좁은 columnGapRatio가 입력되어도 루비 여백을 자동 확보해 인접 열 겹침 0건을 유지한다", () => {
    const layout = typesetJapaneseTategakiColumns({
      text: "{東京|とうきょう}の{渋谷|しぶや}と{池袋|いけぶくろ}と{横浜|よこはま}を巡る。",
      maxGlyphsPerColumn: 5,
      fontSizePx: 24,
      columnGapRatio: 0.25,
    });

    expect(layout.columns.length).toBeGreaterThanOrEqual(3);
    expect(layout.rubyAnnotationCount).toBe(4);
    expect(layout.rubyColumnOverlapCount).toBe(0);
    expect(layout.columnPitchPx).toBeGreaterThan(layout.fontSizePx + layout.rubyFontSizePx);
  });
});

describe("Wave 107 — OKLCH SVG 검수 시트 및 자연스러운 한국어 QA 보고서", () => {
  it("OKLCH 전용 SVG를 생성하며 NaN/Infinity·raw hex/rgb가 0건이고 XML 이스케이프가 안전하다", () => {
    const audit = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-svg",
      episodeTitle: "107화 <특급> & '세로' \"검수\"",
      locale: "ja-JP",
      dialogueLines: [{ bubbleId: "j1", text: "「{東京|とうきょう}まで12分!?」" }],
      fallbackChain: createDefaultComicFontChainForLocale("ja-JP"),
    });
    const tategaki = typesetJapaneseTategakiColumns({
      text: "「{東京|とうきょう}まで12分!?」",
      maxGlyphsPerColumn: 6,
    });

    const svg = renderMultilingualTypographySheetSvg(tategaki, audit);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\(/i);
    expect(svg).toContain("&lt;특급&gt; &amp; &apos;세로&apos; &quot;검수&quot;");
    expect(svg).toContain('data-tate-chu-yoko="true"');
    expect(svg).toContain('data-ruby-reading="とうきょう"');
    expect(svg).toContain('data-subset-savings-bar="true"');
    expect(svg).toContain("rotate(90,");
    expect(escapeTypographySvgXml("<a&b>\"'")).toBe("&lt;a&amp;b&gt;&quot;&apos;");
  });

  it("한국어 QA 요약 보고서가 번역투 없이 통과·차단 상태와 조판 지표를 정확히 보고한다", () => {
    const passAudit = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-pass",
      episodeTitle: "107화 일본어 연재본",
      locale: "ja-JP",
      dialogueLines: [{ bubbleId: "j1", text: "「東京まで12分!?」" }],
      fallbackChain: createDefaultComicFontChainForLocale("ja-JP"),
    });
    const tategaki = typesetJapaneseTategakiColumns({
      text: "「{東京|とうきょう}まで12分!?」",
      maxGlyphsPerColumn: 6,
    });
    const passReport = summarizeMultilingualFontAuditKo(passAudit, tategaki);

    expect(passReport).toContain("출고 가능");
    expect(passReport).toContain("두부 결손 0건");
    expect(passReport).toContain("행두 금칙 위반 0건");
    expect(passReport).toContain("인접 열 겹침 0건");
    expect(passReport).toContain("종중횡(縦中横)");
    expect(passReport).not.toContain("하는 것을 가능하게 합니다");
    expect(passReport).not.toContain("직관적인 경험을 제공합니다");
    expect(passReport).not.toContain("원활한 워크플로우를 보장합니다");

    const blockedAudit = auditEpisodeFontFallbackAndSubset({
      episodeId: "ep-107-blocked",
      locale: "ko-KR",
      dialogueLines: [{ bubbleId: "k1", text: "결손 문자 𠀋" }],
      fallbackChain: [
        {
          ...DEFAULT_COMIC_FONT_REGISTRY["ko-nanum-comic"],
          embeddingLicenseAllowed: false,
        },
      ],
    });
    const blockedReport = summarizeMultilingualFontAuditKo(blockedAudit);
    expect(blockedReport).toContain("출고 차단");
    expect(blockedReport).toContain("U+2000B");
    expect(blockedReport).toContain("출고 차단 사유:");
  });
});
