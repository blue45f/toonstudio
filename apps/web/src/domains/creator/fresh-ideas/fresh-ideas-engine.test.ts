import { describe, expect, it } from "vitest";

import {
  buildColdStartChooser,
  classifyFreshIdeasTriggerIntent,
  classifySourceDensity,
  DEFAULT_FRESH_IDEAS_USER_CONFIG,
  FRESH_IDEAS_100_CAPABILITIES,
  inferDefaultTargetPersona,
  loadFreshIdeasUserConfig,
  loadPreferredSessionLensId,
  recordSessionLensAffinity,
  resolveToolBoundaryPolicy,
  saveFreshIdeasUserConfig,
  SOURCE_KIND_OPTIONS,
  type ConfigStorageLike,
} from "./fresh-ideas-contracts";
import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
} from "./fresh-ideas-ingest-deconstruct";
import {
  applyExtendedLensSwap,
  computeHeadlineOverlapRatio,
  EXTENDED_LENS_PACK,
  generateFiveOrthogonalLenses,
  recommendExtendedLensSwap,
  scanFiveBlindSpotAxes,
} from "./fresh-ideas-lenses-engine";
import {
  expandLensToChannelDraft,
  localizeKoreanEditorialCopy,
  SUPPORTED_CHANNEL_OPTIONS,
} from "./fresh-ideas-channels-localization";
import {
  auditFreshIdeasQualityAndSafety,
  deidentifyInternalDraftText,
  evaluateSubjectSwapSpecificity,
  fuseTwoLensAngles,
  runFreshIdeasModeCWorkflow,
  verifyVerbatimQuotesAgainstSource,
} from "./fresh-ideas-quality-ecosystem";

function createMemoryConfigStorage(): ConfigStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("Fresh Ideas v2.0 — 100-Capability Engine & Unslop Gate", () => {
  it("registers all 100 requirements across 10 domains and enforces bilingual routing, cold-start, and user config persistence", () => {
    expect(FRESH_IDEAS_100_CAPABILITIES).toHaveLength(100);
    expect(FRESH_IDEAS_100_CAPABILITIES[0]!.reqId).toBe("REQ-001");
    expect(FRESH_IDEAS_100_CAPABILITIES[99]!.reqId).toBe("REQ-100");
    expect(new Set(FRESH_IDEAS_100_CAPABILITIES.map((c) => c.domainIndex)).size).toBe(10);
    expect(SOURCE_KIND_OPTIONS).toHaveLength(11);

    expect(classifyFreshIdeasTriggerIntent("이 아티클 새 각도로 리믹스해줘")).toBe("generate-fresh-ideas");
    expect(classifyFreshIdeasTriggerIntent("Repurpose this transcript into new angles")).toBe(
      "generate-fresh-ideas",
    );
    expect(classifyFreshIdeasTriggerIntent("이 문서 TL;DR 요약만 해줘")).toBe("plain-summary");
    expect(classifyFreshIdeasTriggerIntent("Just summarize only")).toBe("plain-summary");
    expect(classifyFreshIdeasTriggerIntent("내 문체로만 말투 바꿔줘")).toBe("match-my-writing-style");
    expect(classifyFreshIdeasTriggerIntent("Rewrite in my voice")).toBe("match-my-writing-style");
    expect(classifyFreshIdeasTriggerIntent("5인 자문단 투표해줘")).toBe("get-more-perspectives");
    expect(classifyFreshIdeasTriggerIntent("Run a decision panel vote split")).toBe(
      "get-more-perspectives",
    );
    expect(classifyFreshIdeasTriggerIntent("내일 회의 준비 미팅 브리프")).toBe("prep-for-meetings");
    expect(classifyFreshIdeasTriggerIntent("What should I work on first")).toBe("focus-my-energy");

    expect(classifySourceDensity("짧은 인용구 한 줄")).toBe("low-density");
    expect(
      classifySourceDensity(
        "웹툰 배경과 인물 선화의 시각적 통일성을 유지하려면 개별 슬라이더를 늘리기보다 기준선 잠금과 사전 검수 절차를 표준화하는 편이 훨씬 안정적이다. ".repeat(
          3,
        ),
      ),
    ).toBe("mid-density");
    expect(classifySourceDensity("긴 문서 본문", 2)).toBe("high-density");

    expect(inferDefaultTargetPersona("블렌더 3D 배경과 웹툰 콘티 선화 작업")).toContain("웹툰");
    expect(resolveToolBoundaryPolicy("google-docs").requireExplicitConfirmToWrite).toBe(true);
    expect(resolveToolBoundaryPolicy("web-search").requireExplicitConfirmToWrite).toBe(false);

    const coldStart = buildColdStartChooser();
    expect(coldStart).toHaveLength(3);
    expect(coldStart[0]!.sampleContentKo.length).toBeGreaterThan(30);
    expect(DEFAULT_FRESH_IDEAS_USER_CONFIG.enableUnslopRedlines).toBe(true);

    const memStorage = createMemoryConfigStorage();
    saveFreshIdeasUserConfig(
      {
        schemaVersion: "2.0.0",
        preferredChannels: ["brunch-blog", "newsletter"],
        defaultKoreanRegister: "haera",
        extraBannedPhrases: ["초격차 대박"],
        enableUnslopRedlines: true,
      },
      memStorage,
    );
    const loadedCfg = loadFreshIdeasUserConfig(memStorage);
    expect(loadedCfg.defaultKoreanRegister).toBe("haera");
    expect(loadedCfg.extraBannedPhrases).toContain("초격차 대박");

    recordSessionLensAffinity("data-evidence-angle", memStorage);
    recordSessionLensAffinity("data-evidence-angle", memStorage);
    recordSessionLensAffinity("contrarian-take", memStorage);
    expect(loadPreferredSessionLensId(memStorage)).toBe("data-evidence-angle");
  });

  it("ingests multi-source inputs, detects regulated/foreign context, and deconstructs assumptions", () => {
    const sampleUrlA = ["https:", "", "studio.local", "webtoon-3d-benchmark"].join("/");
    const sampleUrlB = ["https:", "", "studio.local", "assistant-interview"].join("/");
    const bundle = ingestFreshIdeasSources([
      {
        id: "src-1",
        title: "웹툰 3D 배경 자동화 벤치마크",
        kind: "sheet-csv",
        content:
          "주간 70컷 중 45%를 3D로 처리하면 24시간 절감되지만 시너지와 민첩성 강조만으로는 검수 병목이 남는다.",
        url: sampleUrlA,
      },
      {
        id: "src-2",
        title: "어시스턴트 현장 인터뷰 녹취",
        kind: "meeting-transcript",
        content:
          "하지만 파라미터가 많아질수록 담당자마다 선굵기가 달라져 마감 직전 재작업이 3배 늘어난다.",
        url: sampleUrlB,
        authorOrSpeaker: "배경 팀장",
      },
    ]);

    expect(bundle.isMultiDoc).toBe(true);
    expect(bundle.isDataHeavy).toBe(true);
    expect(bundle.preservedUrls).toHaveLength(2);
    expect(bundle.extractedSpeakers).toContain("배경 팀장");
    expect(bundle.topSoundbites.length).toBeGreaterThanOrEqual(2);
    expect(bundle.extractedMetrics.length).toBeGreaterThanOrEqual(3);

    const decon = deconstructFreshIdeasThesis(bundle);
    expect(decon.unspokenAssumptionsKo).toHaveLength(2);
    expect(decon.logicalLeapKo).toContain("인과관계");
    expect(decon.concreteBehaviorTerms).toContain("팀 간 핸드오프 대기시간 단축");
    expect(decon.secondOrderChainKo).toContain("6~12개월");

    const regulatedBundle = ingestFreshIdeasSources([
      {
        id: "med-1",
        title: "수면 습관과 임상 처방 프로토콜",
        kind: "article",
        content: "환자 진단과 투약 일정 변경 시 임상 안전 절차를 먼저 점검해야 한다.",
      },
    ]);
    expect(regulatedBundle.regulatedDomain).toBe("medical");
    const regulatedLenses = generateFiveOrthogonalLenses(
      regulatedBundle,
      deconstructFreshIdeasThesis(regulatedBundle),
      { contrarianMode: "priority-inversion" },
    );
    expect(regulatedLenses[0]!.contrarianMode).toBe("conditional-nuance");
    expect(regulatedLenses[0]!.regulatedSafetyNoteKo).toContain("안전선");
  });

  it("generates 5 orthogonal lenses, supports 3 contrarian modes, low-density reinforcement, 5-axis blind spots, and 9 extended lens swaps", () => {
    const lowBundle = ingestFreshIdeasSources([
      {
        id: "low-1",
        title: "짧은 마감 격언",
        kind: "self-past-post",
        content: "속도보다 방향이 먼저다.",
      },
    ]);
    expect(lowBundle.densityTier).toBe("low-density");
    const lowDecon = deconstructFreshIdeasThesis(lowBundle);
    const lowLenses = generateFiveOrthogonalLenses(lowBundle, lowDecon);
    expect(lowLenses[2]!.lowDensitySkipNoteKo).toContain("짧은 인용구");
    expect(lowLenses[0]!.lowDensityReinforcementKo).toBeTruthy();

    const bundle = ingestFreshIdeasSources([
      {
        id: "s1",
        title: "원격근무 협업 프로토콜",
        kind: "changelog-pr",
        content: "화상회의를 줄이고 비동기 문서 리뷰를 도입해 배포 주기를 2배 단축했다.",
      },
    ]);
    const decon = deconstructFreshIdeasThesis(bundle);
    const lensesNuance = generateFiveOrthogonalLenses(bundle, decon, {
      contrarianMode: "conditional-nuance",
    });
    const lensesFlip = generateFiveOrthogonalLenses(bundle, decon, {
      contrarianMode: "root-cause-flip",
    });
    expect(lensesNuance[0]!.headlineKo).not.toBe(lensesFlip[0]!.headlineKo);

    const axes = scanFiveBlindSpotAxes(bundle, decon);
    expect(axes).toHaveLength(5);

    expect(EXTENDED_LENS_PACK).toHaveLength(9);
    for (const ext of EXTENDED_LENS_PACK) {
      const built = ext.buildCard(bundle, decon);
      expect(built.indexTag).toMatch(/^\d{2}$/);
      expect(built.headlineKo.length).toBeGreaterThan(14);
    }

    const swap = recommendExtendedLensSwap(bundle);
    expect(swap.withExtendedLensId).toBe("failure-autopsy");
    const swapped = applyExtendedLensSwap(lensesFlip, swap, bundle, decon);
    expect(swapped.some((l) => l.id === "failure-autopsy")).toBe(true);
    expect(computeHeadlineOverlapRatio(lensesFlip[0]!.headlineKo, lensesFlip[4]!.headlineKo)).toBeLessThan(
      0.45,
    );
  });

  it("expands Mode B across all 10 distinct channel blueprints and locks Korean speech registers", () => {
    expect(SUPPORTED_CHANNEL_OPTIONS).toHaveLength(10);
    const bundle = ingestFreshIdeasSources([
      {
        id: "s1",
        title: "비동기 개발 협업",
        kind: "article",
        content: "비동기 문서 협업으로 집중 시간을 보호한다.",
        url: "https://studio.local/async-guide",
      },
    ]);
    const lenses = generateFiveOrthogonalLenses(bundle, deconstructFreshIdeasThesis(bundle));

    const seenFirstSections = new Set<string>();
    for (const ch of SUPPORTED_CHANNEL_OPTIONS) {
      const draft = expandLensToChannelDraft(lenses[0]!, ch.id, { registerOverride: "haeyo" });
      expect(draft.headlineVariants.directThesisKo.length).toBeGreaterThan(10);
      expect(draft.bodySectionsKo.length).toBeGreaterThanOrEqual(3);
      expect(draft.preemptiveObjectionKo.length).toBeGreaterThan(15);
      expect(draft.closingCtaKo.length).toBeGreaterThan(15);
      seenFirstSections.add(`${ch.id}::${draft.bodySectionsKo[0]}`);
      if (ch.id === "default-dual-preview") {
        expect(draft.socialThreeLineCutKo).toHaveLength(3);
      }
    }
    expect(seenFirstSections.size).toBe(10);

    const localized = localizeKoreanEditorialCopy(
      "혁신적인 게임 체인저! 팀원 이(가) 하루의 끝에 watercooler chat을 합니다!",
      { register: "haera", bridgeForeignSourceToKorea: true },
    );
    expect(localized).not.toContain("!");
    expect(localized).not.toContain("게임 체인저");
    expect(localized).not.toContain("이(가)");
    expect(localized).toContain("슬랙 실시간 멘션");
    expect(localized).toContain("국내 주간 연재");
  });

  it("enforces subject-swap specificity, verbatim quote verification, de-identification, and Mode C chaining", () => {
    const sourceText =
      '마감 자동화 체크리스트로 검수 시간을 줄인다. 현장에서 "기준선 없는 자동화는 재작업만 늘린다"라는 피드백이 나왔다.';
    const bundle = ingestFreshIdeasSources([
      {
        id: "s1",
        title: "스튜디오 주간 마감 자동화",
        kind: "article",
        content: sourceText,
      },
    ]);
    const lenses = generateFiveOrthogonalLenses(bundle, deconstructFreshIdeasThesis(bundle));
    const draft = expandLensToChannelDraft(lenses[0]!, "linkedin-kr");

    const swapCheck = evaluateSubjectSwapSpecificity(lenses[0]!.headlineKo, lenses[0]!.angleKo);
    expect(swapCheck.passed).toBe(true);

    expect(
      verifyVerbatimQuotesAgainstSource('"기준선 없는 자동화는 재작업만 늘린다"라고 말했다.', sourceText),
    ).toHaveLength(0);
    expect(
      verifyVerbatimQuotesAgainstSource('"원문에 전혀 없는 날조 인용문입니다"라고 말했다.', sourceText),
    ).toHaveLength(1);

    const cleanAudit = auditFreshIdeasQualityAndSafety(lenses, draft.bodySectionsKo.join("\n"), [], {
      sourceCorpus: sourceText,
    });
    expect(cleanAudit.passed).toBe(true);
    expect(cleanAudit.score100).toBe(100);
    expect(cleanAudit.subjectSwapPassed).toBe(true);
    expect(cleanAudit.verbatimQuotesVerified).toBe(true);

    const sloppyAudit = auditFreshIdeasQualityAndSafety(
      lenses,
      '🔥 오늘날 급변하는 환경에서 게임 체인저! [X%] "원문에 전혀 없는 날조 인용문입니다"',
      [["https:", "", "studio.local", "missing-report"].join("/")],
      { sourceCorpus: sourceText },
    );
    expect(sloppyAudit.passed).toBe(false);
    const codes = new Set(sloppyAudit.violations.map((v) => v.code));
    expect(codes.has("UNSLOP_EMOJI")).toBe(true);
    expect(codes.has("BANNED_CLICHE")).toBe(true);
    expect(codes.has("UNSLOP_EXCLAMATION")).toBe(true);
    expect(codes.has("VAGUE_PLACEHOLDER")).toBe(true);
    expect(codes.has("DROPPED_URL")).toBe(true);
    expect(codes.has("UNVERIFIED_QUOTE")).toBe(true);

    const deidentified = deidentifyInternalDraftText("알파고객사와 1,500,000원 계약을 검토했다.");
    expect(deidentified).toContain("국내 중견 파트너사");
    expect(deidentified).not.toContain("1,500,000원");

    const fusion = fuseTwoLensAngles(lenses[0]!, lenses[2]!);
    expect(fusion.top40HookFrameKo).toContain("상단 40%");
    expect(fusion.bottom60ProofResolutionKo).toContain("하단 60%");

    const modeC = runFreshIdeasModeCWorkflow({
      sourceTitle: bundle.primaryTopic,
      targetPersonaKo: bundle.targetPersonaKo,
      lenses,
    });
    expect(modeC.osmuPackage.longFormNewsletter.channelId).toBe("newsletter");
    expect(modeC.osmuPackage.linkedInFeedCut.channelId).toBe("linkedin-kr");
    expect(modeC.osmuPackage.shortFormThreadsOrShorts.channelId).toBe("shorts-reels-60s");
    expect(modeC.googleDocExportPayload.appendixRemainingSeedsKo).toHaveLength(4);
    expect(modeC.ideaBankRows).toHaveLength(5);
    expect(modeC.serializedSeries).toHaveLength(5);
    expect(modeC.voiceChainingHintKo).toContain("match-my-writing-style");
    expect(modeC.stressTestAdvisorPromptKo).toContain("get-more-perspectives");
    expect(modeC.meetingAgendaBriefKo).toContain("prep-for-meetings");
    expect(modeC.energyTaggingSummaryKo).toContain("focus-my-energy");
  });
});
