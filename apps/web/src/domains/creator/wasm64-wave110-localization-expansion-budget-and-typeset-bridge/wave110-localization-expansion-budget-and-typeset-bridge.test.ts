import { describe, expect, it } from "vitest";
import {
  ALL_LOCALIZATION_LOCALES,
  LOCALIZATION_LOCALE_PROFILES,
  auditAndFitLocalizedDialogueBalloons,
  auditLocalizationGlossaryAndRegister,
  canonicalizeLocalizationJson,
  detectStrayHangulSnippets,
  estimateCrossLocaleExpansionBudget,
  renderLocalizationFitMatrixSvg,
  sha256LocalizationHex,
  summarizeLocalizationBridgeAuditKo,
  type EpisodeLocalizationPayload,
  type EpisodeLocalizedDialogueLine,
  type LocalizationTargetLocale,
  type LocalizedDialogueBalloonEntry,
  type SeriesGlossarySpec,
  type SpeakerRegisterMatrix,
} from "./index";

const BASE_GLOSSARY: SeriesGlossarySpec = {
  seriesId: "SERIES-AZURE-BLADE",
  glossaryVersion: "2026.11-v4",
  terms: [
    {
      termId: "CHAR-SEOYEON",
      category: "character",
      sourceKo: "서연",
      approvedByLocale: {
        "ko-KR": "서연", "ja-JP": "ソヨン", "en-US": ["Seoyeon", "Lady Seoyeon"],
        "fr-FR": "Seoyeon", "de-DE": "Seoyeon", "es-ES": "Seoyeon", "ar-SA": "سويون",
      },
      forbiddenVariantsByLocale: {
        "en-US": ["Seo-yun", "Suh-yeon", "Seoyun"],
        "fr-FR": ["Seo-yun", "Séo-youn"],
        "de-DE": ["Seo-yun"],
        "ja-JP": ["ソユン"],
      },
    },
    {
      termId: "SKILL-AZURE-AURA",
      category: "skill",
      sourceKo: "청룡검기",
      approvedByLocale: {
        "ko-KR": "청룡검기", "ja-JP": "青龍剣気", "en-US": "Azure Dragon Aura",
        "fr-FR": "Aura du Dragon Azur", "de-DE": "Azurdrachen-Aura",
        "es-ES": "Aura del Dragón Azul", "ar-SA": "هالة التنين اللازوردي",
      },
      forbiddenVariantsByLocale: { "en-US": ["Blue Dragon Beam", "Green Dragon Sword"] },
    },
    {
      termId: "LOC-NORTH-CITADEL",
      category: "location",
      sourceKo: "북해성채",
      approvedByLocale: {
        "ko-KR": "북해성채", "ja-JP": "北海城塞", "en-US": "Northsea Citadel",
        "fr-FR": "Citadelle de la Mer du Nord", "de-DE": "Nordmeer-Zitadelle",
        "es-ES": "Ciudadela del Mar del Norte", "ar-SA": "قلعة بحر الشمال",
      },
    },
  ],
};

const BASE_REGISTER_MATRIX: SpeakerRegisterMatrix = {
  rules: [
    { ruleId: "REG-GUARD-TO-LORD", speakerId: "guard_min", listenerId: "lord_seoyeon", requiredRegister: "formal-polite" },
    { ruleId: "REG-RIVAL-CASUAL", speakerId: "rival_jin", listenerId: "hero_han", requiredRegister: "informal-casual" },
    { ruleId: "REG-EMPEROR-ROYAL", speakerId: "emperor_cheon", listenerId: "*", requiredRegister: "archaic-royal" },
  ],
};

function makeBalloon(
  overrides: Partial<LocalizedDialogueBalloonEntry> & {
    readonly balloonId: string;
    readonly cutId: string;
    readonly locale: LocalizationTargetLocale;
    readonly translatedText: string;
  },
): LocalizedDialogueBalloonEntry {
  return { innerWidthPx: 240, innerHeightPx: 150, nominalFontSizePx: 22, minReadableFontPx: 14, canvasWidthPx: 800, ...overrides };
}

function makePayload(
  lines: readonly EpisodeLocalizedDialogueLine[],
  overrides?: Partial<EpisodeLocalizationPayload>,
): EpisodeLocalizationPayload {
  return { episodeId: "EP-110", episodeTitle: "북해성채 결전", lines, ...overrides };
}

const LONG_GERMAN_SINGLE_CLAUSE =
  "Unverzueglich muessen saemtliche Verteidigungseinheiten der Nordmeer-Zitadelle den ueberlasteten Energieschild stabilisieren bevor alles zerspringt";

describe("Wave 110 — 다국어 텍스트 팽창 예산 산정 (estimateCrossLocaleExpansionBudget)", () => {
  it("독일어(de-DE)와 프랑스어(fr-FR)가 일본어(ja-JP)·한국어(ko-KR)보다 높은 글자·면적 팽창 계수를 산출한다", () => {
    const budget = estimateCrossLocaleExpansionBudget(
      "지금 당장 북해성채 외곽으로 물러서지 않으면 결계가 무너질 거야!",
      ALL_LOCALIZATION_LOCALES,
    );
    const byLoc = new Map(budget.locales.map((e) => [e.locale, e]));
    const de = byLoc.get("de-DE")!;
    const fr = byLoc.get("fr-FR")!;
    const en = byLoc.get("en-US")!;
    const ja = byLoc.get("ja-JP")!;
    const ko = byLoc.get("ko-KR")!;

    expect(de.effectiveCharExpansionRatio).toBeGreaterThan(fr.effectiveCharExpansionRatio);
    expect(fr.effectiveCharExpansionRatio).toBeGreaterThan(en.effectiveCharExpansionRatio);
    expect(en.effectiveCharExpansionRatio).toBeGreaterThan(ja.effectiveCharExpansionRatio);
    expect(ja.effectiveCharExpansionRatio).toBeGreaterThan(ko.effectiveCharExpansionRatio);
    expect(de.effectiveAreaExpansionRatio).toBeGreaterThan(fr.effectiveAreaExpansionRatio);
    expect(fr.effectiveAreaExpansionRatio).toBeGreaterThan(ja.effectiveAreaExpansionRatio);
    expect(ja.effectiveAreaExpansionRatio).toBeGreaterThan(ko.effectiveAreaExpansionRatio);
    expect(budget.highestExpansionLocale).toBe("de-DE");
  });

  it("7개 로케일의 RTL·세로쓰기·자간 하한 메타데이터가 정확히 반영된다", () => {
    const budget = estimateCrossLocaleExpansionBudget("청룡검기를 개방한다!");
    expect(budget.locales).toHaveLength(7);
    const ar = budget.locales.find((e) => e.locale === "ar-SA")!;
    const ja = budget.locales.find((e) => e.locale === "ja-JP")!;
    const de = budget.locales.find((e) => e.locale === "de-DE")!;
    expect(ar.isRtl).toBe(true);
    expect(ar.direction).toBe("rtl");
    expect(ar.supportsVerticalTypeset).toBe(false);
    expect(LOCALIZATION_LOCALE_PROFILES["ar-SA"].minTrackingEm).toBe(0);
    expect(ja.isRtl).toBe(false);
    expect(ja.supportsVerticalTypeset).toBe(true);
    expect(de.supportsVerticalTypeset).toBe(false);
  });

  it("짧은 감탄사(6자 미만)는 장문보다 높은 단문 팽창 보정 계수를 적용한다", () => {
    const shortB = estimateCrossLocaleExpansionBudget("잠깐!");
    const longB = estimateCrossLocaleExpansionBudget("북해성채 남쪽 성문이 무너지기 전에 서둘러 방어 진영을 재정비해야 합니다.");
    expect(shortB.shortTextBoostApplied).toBeGreaterThan(1.1);
    expect(longB.shortTextBoostApplied).toBe(1.0);
    expect(shortB.locales.find((e) => e.locale === "de-DE")!.effectiveCharExpansionRatio).toBeGreaterThan(
      longB.locales.find((e) => e.locale === "de-DE")!.effectiveCharExpansionRatio,
    );
  });

  it("빈 문자열이나 공백만 있는 원문에서도 NaN 없이 안전한 0 예산을 반환한다", () => {
    const budget = estimateCrossLocaleExpansionBudget("   ");
    expect(budget.sourceCharCount).toBe(0);
    expect(budget.masterPixelAreaPx2).toBe(0);
    for (const loc of budget.locales) {
      expect(Number.isFinite(loc.expectedPixelAreaPx2)).toBe(true);
      expect(loc.expectedCharCountNominal).toBe(0);
    }
  });

  it("요청한 부분 로케일 배열의 순서와 중복 제거를 보존한다", () => {
    const subset: readonly LocalizationTargetLocale[] = ["en-US", "de-DE", "en-US", "ar-SA"];
    expect(estimateCrossLocaleExpansionBudget("결계가 깨졌다!", subset).locales.map((e) => e.locale)).toEqual(["en-US", "de-DE", "ar-SA"]);
  });

  it("독일어 권장 말풍선 여유율과 치수가 한국어·영어보다 크게 산정된다", () => {
    const budget = estimateCrossLocaleExpansionBudget(
      "북해성채 내부의 마력 회로가 폭주하고 있습니다!",
      ["ko-KR", "en-US", "de-DE"],
      { masterInnerWidthPx: 220, masterInnerHeightPx: 150, nominalFontSizePx: 22 },
    );
    const [ko, en, de] = budget.locales;
    expect(ko.recommendedHeadroomPercent).toBe(0);
    expect(en.recommendedHeadroomPercent).toBeGreaterThan(ko.recommendedHeadroomPercent);
    expect(de.recommendedHeadroomPercent).toBeGreaterThan(en.recommendedHeadroomPercent);
    expect(de.recommendedBalloonWidthPx).toBeGreaterThan(en.recommendedBalloonWidthPx);
  });
});

describe("Wave 110 — 말풍선 피팅 및 넘침 보정 솔버 (auditAndFitLocalizedDialogueBalloons)", () => {
  it("여유 있는 말풍선 안의 간결한 번역문은 fits-cleanly로 판정한다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({ balloonId: "B-001", cutId: "CUT-01", locale: "ko-KR", translatedText: "서연님, 조심하세요!" }),
      makeBalloon({ balloonId: "B-002", cutId: "CUT-01", locale: "en-US", translatedText: "Watch out, Seoyeon!" }),
    ]);
    expect(report.results[0].remediationTier).toBe("fits-cleanly");
    expect(report.results[1].remediationTier).toBe("fits-cleanly");
    expect(report.results[1].resolvedFontSizePx).toBe(22);
    expect(report.results[1].resolvedTrackingEm).toBe(0);
    expect(report.fitRatePercent).toBe(100);
    expect(report.severeOverflowCount).toBe(0);
    expect(report.mobileLegibilityPassRate).toBe(100);
  });

  it("기준 크기에 살짝 넘치는 영어 번역문은 가독 하한 내에서 micro-tighten-tracking으로 수납한다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({
        balloonId: "B-010", cutId: "CUT-02", locale: "en-US", innerWidthPx: 230, innerHeightPx: 136,
        translatedText: "Hold the northern barrier now before the resonance wave reaches the citadel gate!",
      }),
    ]);
    const item = report.results[0];
    expect(item.remediationTier).toBe("micro-tighten-tracking");
    expect(item.resolvedFontSizePx).toBeGreaterThanOrEqual(14);
    expect(item.resolvedTrackingEm).toBeGreaterThanOrEqual(-0.04);
    expect(item.severeOverflow).toBe(false);
    expect(item.mobileLegibilityPassed).toBe(true);
  });

  it("자간·폰트 축소로 부족하지만 25% 이내 확장으로 들어가는 대사는 expand-balloon-margin으로 판정한다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({
        balloonId: "B-020", cutId: "CUT-03", locale: "de-DE",
        innerWidthPx: 205, innerHeightPx: 120, nominalFontSizePx: 20, minReadableFontPx: 16, maxSafeExpansionPercent: 25,
        translatedText: "Wenn wir die Nordmeer-Zitadelle jetzt verlassen, bricht die gesamte Schutzbarriere zusammen!",
      }),
    ]);
    const item = report.results[0];
    expect(item.remediationTier).toBe("expand-balloon-margin");
    expect(item.requiredBalloonExpansionPercent).toBeGreaterThan(0);
    expect(item.requiredBalloonExpansionPercent).toBeLessThanOrEqual(25);
    expect(item.recommendedBalloonWidthPx).toBeGreaterThan(205);
    expect(item.severeOverflow).toBe(false);
  });

  it("장애물 간격 제약(obstacleClearancePx: 0)이 있으면 말풍선 확장을 차단하고 심각 넘침으로 격상한다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({
        balloonId: "B-021", cutId: "CUT-03", locale: "de-DE",
        innerWidthPx: 205, innerHeightPx: 120, nominalFontSizePx: 20, minReadableFontPx: 16,
        obstacleClearancePx: 0, allowLinkedSubBalloonSplit: false,
        translatedText: "Wenn wir die Nordmeer-Zitadelle jetzt verlassen, bricht die gesamte Schutzbarriere zusammen!",
      }),
    ]);
    const item = report.results[0];
    expect(item.remediationTier).toBe("shorten-translation-copy");
    expect(item.severeOverflow).toBe(true);
    expect(item.recommendedMaxChars!).toBeLessThan(item.actualChars);
  });

  it("작은 말풍선에 3배 팽창된 독일어 단문 대사가 들어가면 shorten-translation-copy와 구체적 recommendedMaxChars를 반환한다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({
        balloonId: "B-030", cutId: "CUT-04", locale: "de-DE",
        translatedText: LONG_GERMAN_SINGLE_CLAUSE,
        innerWidthPx: 130, innerHeightPx: 78, minReadableFontPx: 15, allowLinkedSubBalloonSplit: false,
      }),
    ]);
    const item = report.results[0];
    expect(item.remediationTier).toBe("shorten-translation-copy");
    expect(item.severeOverflow).toBe(true);
    expect(item.mobileLegibilityPassed).toBe(false);
    expect(item.recommendedMaxChars!).toBeGreaterThanOrEqual(1);
    expect(item.recommendedMaxChars!).toBeLessThan(item.actualChars);
    expect(report.severeOverflowCount).toBe(1);
    expect(report.mobileLegibilityPassRate).toBe(0);
  });

  it("다문장 3배 팽창 독일어 대사가 분할 허용 말풍선에서 넘치면 split-into-linked-sub-balloon을 제안한다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({
        balloonId: "B-031", cutId: "CUT-04", locale: "de-DE",
        innerWidthPx: 150, innerHeightPx: 92, minReadableFontPx: 15, allowLinkedSubBalloonSplit: true,
        translatedText:
          "Bleiben Sie sofort stehen! Wenn die Azurdrachen-Aura jetzt außer Kontrolle gerät, stürzt die gesamte Nordmeer-Zitadelle in die Tiefe. Niemand wird das überleben!",
      }),
    ]);
    const item = report.results[0];
    expect(item.remediationTier).toBe("split-into-linked-sub-balloon");
    expect(item.severeOverflow).toBe(true);
    expect(item.recommendedSplitCount).toBeGreaterThanOrEqual(2);
    expect(item.recommendedMaxChars!).toBeLessThan(item.actualChars);
  });

  it("일본어 줄바꿈 시 행두 금칙 문자(。！？」)가 다음 줄 첫머리로 떨어지지 않는다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({
        balloonId: "B-040", cutId: "CUT-05", locale: "ja-JP",
        innerWidthPx: 210, innerHeightPx: 180, nominalFontSizePx: 20, balloonShape: "rounded-rect",
        translatedText: "ソヨン様、北海城塞の結界がもう持ちません！早く退避してください。",
      }),
    ]);
    const item = report.results[0];
    expect(item.severeOverflow).toBe(false);
    expect(item.wrappedLines.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < item.wrappedLines.length; i += 1) {
      expect("。、！？）」".indexOf(item.wrappedLines[i].charAt(0))).toBe(-1);
    }
  });

  it("아랍어 RTL 말풍선은 필기체 연결 보존을 위해 음수 자간을 적용하지 않으며 로케일별 집계율이 정확하다", () => {
    const report = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({
        balloonId: "B-050", cutId: "CUT-06", locale: "ar-SA", innerWidthPx: 220, innerHeightPx: 140,
        translatedText: "تراجعي الآن يا سويون قبل انهيار الحاجز!",
      }),
      makeBalloon({
        balloonId: "B-051", cutId: "CUT-06", locale: "ar-SA",
        innerWidthPx: 120, innerHeightPx: 70, minReadableFontPx: 15, allowLinkedSubBalloonSplit: false,
        translatedText: "يجب إخلاء قلعة بحر الشمال فوراً قبل أن تنهار البوابة الرئيسية بالكامل فوق رؤوس الجميع في هذا الممر الضيق.",
      }),
    ]);
    expect(report.results[0].direction).toBe("rtl");
    expect(report.results[0].resolvedTrackingEm).toBe(0);
    expect(report.results[1].resolvedTrackingEm).toBe(0);
    expect(report.perLocaleSummaries[0].fitRatePercent).toBe(50);
    expect(report.perLocaleSummaries[0].severeOverflowCount).toBe(1);
    expect(report.perLocaleSummaries[0].mobileLegibilityPassRate).toBe(50);
  });
});

describe("Wave 110 — 원문 한글 누출 차단 가드 (Zero Untranslated Source Leakage)", () => {
  it("영어(en-US) 대사에 한글 단어 '잠깐'이 섞이면 blocker로 적발하고 exportApproved를 false로 잠근다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-01", balloonId: "B-001", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: "잠깐! 서연님, 물러서세요!", translationsByLocale: { "en-US": "잠깐! Step back, Seoyeon!" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.untranslatedSourceLeakCount).toBe(1);
    expect(report.totalLeakedHangulChars).toBe(2);
    expect(report.exportApproved).toBe(false);
    const leak = report.findings.find((f) => f.code === "untranslated-source-leak")!;
    expect(leak.severity).toBe("blocker");
    expect(leak.leakedSnippets).toEqual(["잠깐"]);
  });

  it("독일어(de-DE)·일본어(ja-JP)에 한글 자모('ㅋㅋ')나 음절이 섞여도 즉시 누출 차단한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-02", balloonId: "B-002", speakerId: "rival_jin", listenerId: "hero_han", sourceKoText: "웃기지 마!", translationsByLocale: { "de-DE": "Mach dich nicht lächerlich ㅋㅋ", "ja-JP": "ふざけるな、잠깐！" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.untranslatedSourceLeakCount).toBe(2);
    expect(report.exportApproved).toBe(false);
    expect(detectStrayHangulSnippets("Hello 가나다 world ㅋㅋ").snippets).toEqual(["가나다", "ㅋㅋ"]);
  });

  it("한국어 마스터 로케일(ko-KR)의 한글은 누출로 오탐하지 않는다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-01", balloonId: "B-001", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: "서연님, 북해성채 외곽 결계가 안정적입니다.", translationsByLocale: { "ko-KR": "서연님, 북해성채 외곽 결계가 안정적입니다." } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.untranslatedSourceLeakCount).toBe(0);
    expect(report.exportApproved).toBe(true);
  });

  it("비한국어 6개 로케일에 한글 잔류가 없으면(독일어 소유격 Seoyeons 포함) 누출·용어집 위반 0건을 유지한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([
        {
          cutId: "CUT-01", balloonId: "B-001", speakerId: "hero_han", sourceKoText: "서연의 청룡검기다!",
          translationsByLocale: {
            "ja-JP": "ソヨンの青龍剣気だ！",
            "en-US": "It is Seoyeon's Azure Dragon Aura!",
            "fr-FR": "C'est l'Aura du Dragon Azur de Seoyeon !",
            "de-DE": "Das ist Seoyeons Azurdrachen-Aura!",
            "es-ES": "¡Es el Aura del Dragón Azul de Seoyeon!",
            "ar-SA": "إنها هالة التنين اللازوردي الخاصة بـ سويون!",
          },
        },
      ]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.untranslatedSourceLeakCount).toBe(0);
    expect(report.glossaryViolationCount).toBe(0);
    expect(report.exportApproved).toBe(true);
  });
});

describe("Wave 110 — 잠긴 시리즈 용어집 강제 감사 (Locked Series Glossary Enforcer)", () => {
  it("금지 표기 'Seo-yun'이 사용되면 glossary-forbidden-variant blocker로 출고를 차단한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-03", balloonId: "B-003", speakerId: "hero_han", sourceKoText: "서연, 지금이야!", translationsByLocale: { "en-US": "Seo-yun, now is our chance!" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.forbiddenVariantCount).toBe(1);
    expect(report.exportApproved).toBe(false);
    expect(report.findings[0].detectedVariant).toBe("Seo-yun");
    expect(report.findings[0].expectedApprovedTerms).toContain("Seoyeon");
  });

  it("원문에 '청룡검기'가 있는데 영어 번역에 정본 'Azure Dragon Aura'가 누락되면 차단한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-04", balloonId: "B-004", speakerId: "hero_han", sourceKoText: "서연의 청룡검기가 터져 나왔다!", translationsByLocale: { "en-US": "Seoyeon's mystic sword energy erupted!" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.missingApprovedTermCount).toBe(1);
    expect(report.exportApproved).toBe(false);
    expect(report.findings[0].termId).toBe("SKILL-AZURE-AURA");
  });

  it("소유격·문장부호가 붙은 정본 표기('Seoyeon's Azure Dragon Aura!')는 정상 통과한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-04", balloonId: "B-004", speakerId: "hero_han", sourceKoText: "서연의 청룡검기!", translationsByLocale: { "en-US": "Seoyeon's Azure Dragon Aura!" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.glossaryViolationCount).toBe(0);
    expect(report.exportApproved).toBe(true);
  });

  it("복수 허용 별칭('Lady Seoyeon')을 정본으로 인정하고 일본어 금지 표기('ソユン')는 적발한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([
        {
          cutId: "CUT-05", balloonId: "B-005", speakerId: "guard_min", listenerId: "lord_seoyeon",
          sourceKoText: "서연님, 북해성채로 돌아가시죠.",
          translationsByLocale: {
            "en-US": "Lady Seoyeon, please return to Northsea Citadel.",
            "ja-JP": "ソユン様、北海城塞へ戻りましょう。",
          },
        },
      ]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.perLocaleSummaries.find((s) => s.locale === "en-US")!.approved).toBe(true);
    expect(report.perLocaleSummaries.find((s) => s.locale === "ja-JP")!.approved).toBe(false);
  });

  it("원문에 등장하지 않은 용어라도 금지 표기가 직접 출현하면 적발한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-06", balloonId: "B-006", speakerId: "hero_han", sourceKoText: "그녀가 도착했다!", translationsByLocale: { "en-US": "Suh-yeon has arrived!" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.forbiddenVariantCount).toBe(1);
    expect(report.exportApproved).toBe(false);
  });
});

describe("Wave 110 — 화자→청자 말투·경어 일관성 검증 (Speaker-Listener Register Checker)", () => {
  it("프랑스어 formal-polite(vous) 구간에 반말 tu가 섞이면 register-honorific-mismatch를 적발한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-07", balloonId: "B-007", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: "지금 당장 물러서셔야 합니다!", translationsByLocale: { "fr-FR": "Tu dois reculer maintenant !" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.registerViolationCount).toBe(1);
    expect(report.findings[0].expectedRegister).toBe("formal-polite");
    expect(report.findings[0].detectedRegister).toBe("informal-casual");
    expect(report.findings[0].matchedMarkers).toContain("tu");
  });

  it("한국어 존댓말 구간에 반말('왜 그래? 지금 물러서!')이 섞이면 적발하고 정식 존댓말('물러서 주세요.')은 통과시킨다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([
        { cutId: "CUT-08", balloonId: "B-008", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: "왜 그래? 지금 물러서!", translationsByLocale: { "ko-KR": "왜 그래? 지금 물러서!" } },
        { cutId: "CUT-09", balloonId: "B-009", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: "지금 당장 물러서 주세요.", translationsByLocale: { "ko-KR": "지금 당장 물러서 주세요." } },
      ]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.registerViolationCount).toBe(1);
    expect(report.findings[0].balloonId).toBe("B-008");
  });

  it("일본어 정중체 구간의 タメ口('お前、やめろ')와 독일어 Sie 구간의 du를 각각 검출한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-10", balloonId: "B-010", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: "위험합니다!", translationsByLocale: { "ja-JP": "お前、やめろよ！", "de-DE": "Du musst sofort zurückweichen!" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(report.registerViolationCount).toBe(2);
    expect(report.findings.find((f) => f.locale === "ja-JP")!.detectedRegister).toBe("informal-casual");
    expect(report.findings.find((f) => f.locale === "de-DE")!.matchedMarkers).toContain("du");
  });

  it("archaic-royal 규칙 위반과 blocker 승격 옵션(treatRegisterMismatchAsBlocker)이 fail-closed로 동작한다", () => {
    const report = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-11", balloonId: "B-011", speakerId: "emperor_cheon", listenerId: "guard_min", sourceKoText: "물러서라.", translationsByLocale: { "ko-KR": "알았어, 가자!" } }]),
      BASE_GLOSSARY,
      { rules: BASE_REGISTER_MATRIX.rules, treatRegisterMismatchAsBlocker: true },
    );
    expect(report.registerViolationCount).toBe(1);
    expect(report.blockerCount).toBe(1);
    expect(report.exportApproved).toBe(false);
  });
});

describe("Wave 110 — FIPS 180-4 SHA-256, OKLCH SVG 매트릭스 및 한국어 QA 보고서", () => {
  it("순수 ES2017 SHA-256이 표준 FIPS 180-4 테스트 벡터와 정확히 일치하고 정규 JSON이 결정론적이다", () => {
    expect(sha256LocalizationHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256LocalizationHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const a = canonicalizeLocalizationJson({ z: 1, a: { c: true, b: "한글" } });
    const b = canonicalizeLocalizationJson({ a: { b: "한글", c: true }, z: 1 });
    expect(a).toBe(b);
    expect(sha256LocalizationHex(a)).toBe(sha256LocalizationHex(b));
  });

  it("동일 입력은 동일한 releaseManifestSha256을 산출하고 대사 1글자 변경 시 해시가 바뀐다", () => {
    const base = makePayload([{ cutId: "CUT-01", balloonId: "B-001", speakerId: "hero_han", sourceKoText: "서연!", translationsByLocale: { "en-US": "Seoyeon!" } }]);
    const mutated = makePayload([{ cutId: "CUT-01", balloonId: "B-001", speakerId: "hero_han", sourceKoText: "서연!", translationsByLocale: { "en-US": "Seoyeon!!" } }]);
    const r1 = auditLocalizationGlossaryAndRegister(base, BASE_GLOSSARY, BASE_REGISTER_MATRIX);
    const r2 = auditLocalizationGlossaryAndRegister(base, BASE_GLOSSARY, BASE_REGISTER_MATRIX);
    const r3 = auditLocalizationGlossaryAndRegister(mutated, BASE_GLOSSARY, BASE_REGISTER_MATRIX);
    expect(r1.releaseManifestSha256).toHaveLength(64);
    expect(r1.releaseManifestSha256).toBe(r2.releaseManifestSha256);
    expect(r1.releaseManifestSha256).not.toBe(r3.releaseManifestSha256);
  });

  it("OKLCH SVG 매트릭스는 7개 언어 열과 색각안전 코드(FIT/TIGHT/OVER/LEAK)를 포함하고 raw hex·rgb·NaN이 0건이다", () => {
    const fitReport = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({ balloonId: "B-1", cutId: "CUT-01", locale: "ko-KR", translatedText: "서연님, 조심하세요!" }),
      makeBalloon({ balloonId: "B-2", cutId: "CUT-01", locale: "en-US", innerWidthPx: 230, innerHeightPx: 136, translatedText: "Hold the northern barrier now before the resonance wave reaches the citadel gate!" }),
      makeBalloon({ balloonId: "B-3", cutId: "CUT-01", locale: "de-DE", innerWidthPx: 130, innerHeightPx: 78, minReadableFontPx: 15, allowLinkedSubBalloonSplit: false, translatedText: LONG_GERMAN_SINGLE_CLAUSE }),
    ]);
    const glossaryReport = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-01", balloonId: "B-4", speakerId: "hero_han", sourceKoText: "잠깐!", translationsByLocale: { "fr-FR": "Attends 잠깐 !" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    const svg = renderLocalizationFitMatrixSvg(fitReport, glossaryReport);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    for (const code of ["KO", "JA", "EN", "FR", "DE", "ES", "AR"]) expect(svg).toContain(code);
    for (const status of ["FIT", "TIGHT", "OVER", "LEAK"]) expect(svg).toContain(status);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("SVG 렌더링은 제목·컷 ID의 XML 특수문자(<script>&\"')를 안전하게 이스케이프한다", () => {
    const fitReport = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({ balloonId: "B-XSS", cutId: 'CUT-<01>&"A\'', locale: "en-US", translatedText: "Clear!" }),
    ]);
    const glossaryReport = auditLocalizationGlossaryAndRegister(
      makePayload([], { episodeId: "EP-<XSS>", episodeTitle: '<script>alert("x")</script> & \'quote\'' }),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    const svg = renderLocalizationFitMatrixSvg(fitReport, glossaryReport);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("한국어 디렉터 QA 보고서가 번역투 없이 누출·용어집·축약 권고 글자 수를 요약한다", () => {
    const fitReport = auditAndFitLocalizedDialogueBalloons([
      makeBalloon({ balloonId: "B-OVER", cutId: "CUT-04", locale: "de-DE", innerWidthPx: 130, innerHeightPx: 78, minReadableFontPx: 15, allowLinkedSubBalloonSplit: false, translatedText: LONG_GERMAN_SINGLE_CLAUSE }),
    ]);
    const glossaryReport = auditLocalizationGlossaryAndRegister(
      makePayload([{ cutId: "CUT-04", balloonId: "B-OVER", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: "서연님, 잠깐 멈추세요!", translationsByLocale: { "en-US": "Seo-yun, 잠깐 stop!" } }]),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    const summary = summarizeLocalizationBridgeAuditKo(fitReport, glossaryReport, { auditDateIso: "2026-11-28" });
    expect(summary).toContain("출고 보류");
    expect(summary).toContain("2026-11-28");
    expect(summary).toContain("B-OVER");
    expect(summary).toContain("자 이하");
    expect(summary).toContain("잠깐");
    expect(summary).toContain("Seo-yun");
    expect(summary).toContain(glossaryReport.releaseManifestSha256.slice(0, 16));
    expect(summary).not.toContain("가능하게 합니다");
    expect(summary).not.toContain("제공합니다");
    expect(summary).not.toContain("보장합니다");
  });

  it("7개 언어 전체를 아우르는 정상 출고 파이프라인이 출고 승인(exportApproved: true)과 100% 가독 통과를 달성한다", () => {
    const sourceLine = "서연님, 북해성채 외곽으로 물러서 주세요!";
    const budget = estimateCrossLocaleExpansionBudget(sourceLine, ALL_LOCALIZATION_LOCALES, {
      masterInnerWidthPx: 250, masterInnerHeightPx: 165, nominalFontSizePx: 20,
    });
    const budgetByLoc = new Map(budget.locales.map((b) => [b.locale, b]));
    const localizedByLocale: Readonly<Record<LocalizationTargetLocale, string>> = {
      "ko-KR": "서연님, 북해성채 외곽으로 물러서 주세요!",
      "ja-JP": "ソヨン様、北海城塞の外側へ退避してください！",
      "en-US": "Lady Seoyeon, please fall back to Northsea Citadel!",
      "fr-FR": "Seoyeon, veuillez reculer vers la Citadelle de la Mer du Nord !",
      "es-ES": "Seoyeon, retroceda hacia la Ciudadela del Mar del Norte.",
      "de-DE": "Seoyeon, bitte ziehen Sie sich zur Nordmeer-Zitadelle zurück!",
      "ar-SA": "سويون، تراجعي إلى قلعة بحر الشمال!",
    };
    const balloons = ALL_LOCALIZATION_LOCALES.map((loc, idx) => {
      const b = budgetByLoc.get(loc)!;
      return makeBalloon({
        balloonId: `B-ALL-${idx + 1}`, cutId: "CUT-100", speakerId: "guard_min", locale: loc,
        sourceKoText: sourceLine, translatedText: localizedByLocale[loc],
        innerWidthPx: Math.max(250, b.recommendedBalloonWidthPx),
        innerHeightPx: Math.max(165, b.recommendedBalloonHeightPx),
        nominalFontSizePx: 20,
      });
    });

    const fitReport = auditAndFitLocalizedDialogueBalloons(balloons, { episodeId: "EP-110-FULL", episodeTitle: "북해성채 7개국 동시 연재본" });
    const glossaryReport = auditLocalizationGlossaryAndRegister(
      makePayload(
        [{ cutId: "CUT-100", balloonId: "B-ALL-1", speakerId: "guard_min", listenerId: "lord_seoyeon", sourceKoText: sourceLine, translationsByLocale: localizedByLocale }],
        { episodeId: "EP-110-FULL", episodeTitle: "북해성채 7개국 동시 연재본", masterRevision: 3 },
      ),
      BASE_GLOSSARY,
      BASE_REGISTER_MATRIX,
    );
    expect(fitReport.totalBalloons).toBe(7);
    expect(fitReport.severeOverflowCount).toBe(0);
    expect(fitReport.mobileLegibilityPassRate).toBe(100);
    expect(glossaryReport.exportApproved).toBe(true);
    expect(glossaryReport.untranslatedSourceLeakCount).toBe(0);
    expect(glossaryReport.glossaryViolationCount).toBe(0);
    expect(glossaryReport.registerViolationCount).toBe(0);
    expect(renderLocalizationFitMatrixSvg(fitReport, glossaryReport)).toContain("출고 승인");
    expect(summarizeLocalizationBridgeAuditKo(fitReport, glossaryReport)).toContain("출고 승인");
  });
});
