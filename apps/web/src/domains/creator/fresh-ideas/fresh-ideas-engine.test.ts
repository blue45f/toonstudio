import { describe, expect, it } from "vitest";

import {
  buildColdStartChooser,
  classifyFreshIdeasTriggerIntent,
  classifySourceDensity,
  DEFAULT_FRESH_IDEAS_USER_CONFIG,
  FRESH_IDEAS_100_CAPABILITIES,
  inferDefaultTargetPersona,
  resolveToolBoundaryPolicy,
} from "./fresh-ideas-contracts";
import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
} from "./fresh-ideas-ingest-deconstruct";
import {
  computeHeadlineOverlapRatio,
  EXTENDED_LENS_PACK,
  generateFiveOrthogonalLenses,
  recommendExtendedLensSwap,
} from "./fresh-ideas-lenses-engine";
import {
  expandLensToChannelDraft,
  localizeKoreanEditorialCopy,
  SUPPORTED_CHANNEL_OPTIONS,
} from "./fresh-ideas-channels-localization";
import {
  auditFreshIdeasQualityAndSafety,
  deidentifyInternalDraftText,
  fuseTwoLensAngles,
  runFreshIdeasModeCWorkflow,
} from "./fresh-ideas-quality-ecosystem";

describe("Fresh Ideas v2.0 — 100-Capability Engine & Unslop Gate", () => {
  it("registers all 100 requirements across 10 domains and enforces routing and contracts", () => {
    expect(FRESH_IDEAS_100_CAPABILITIES).toHaveLength(100);
    expect(FRESH_IDEAS_100_CAPABILITIES[0]!.reqId).toBe("REQ-001");
    expect(FRESH_IDEAS_100_CAPABILITIES[99]!.reqId).toBe("REQ-100");
    expect(new Set(FRESH_IDEAS_100_CAPABILITIES.map((c) => c.domainIndex)).size).toBe(10);

    expect(classifyFreshIdeasTriggerIntent("이 아티클 새 각도로 리믹스해줘")).toBe("generate-fresh-ideas");
    expect(classifyFreshIdeasTriggerIntent("이 문서 TL;DR 요약만 해줘")).toBe("plain-summary");
    expect(classifyFreshIdeasTriggerIntent("내 문체로만 말투 바꿔줘")).toBe("match-my-writing-style");
    expect(classifyFreshIdeasTriggerIntent("5인 자문단 투표해줘")).toBe("get-more-perspectives");
    expect(classifyFreshIdeasTriggerIntent("내일 회의 준비 미팅 브리프")).toBe("prep-for-meetings");
    expect(classifyFreshIdeasTriggerIntent("지금 뭐부터 할까 에너지 우선순위")).toBe("focus-my-energy");

    expect(classifySourceDensity("짧은 인용구 한 줄")).toBe("low-density");
    expect(
      classifySourceDensity(
        "웹툰 배경과 인물 선화의 시각적 통일성을 유지하려면 개별 슬라이더를 늘리기보다 기준선 잠금과 사전 검수 절차를 표준화하는 편이 훨씬 안정적이다. ".repeat(3),
      ),
    ).toBe("mid-density");
    expect(classifySourceDensity("긴 문서 본문", 2)).toBe("high-density");

    expect(inferDefaultTargetPersona("블렌더 3D 배경과 웹툰 콘티 선화 작업")).toContain("웹툰");
    expect(resolveToolBoundaryPolicy("google-docs").requireExplicitConfirmToWrite).toBe(true);
    expect(resolveToolBoundaryPolicy("web-search").requireExplicitConfirmToWrite).toBe(false);
    expect(buildColdStartChooser()).toHaveLength(3);
    expect(DEFAULT_FRESH_IDEAS_USER_CONFIG.enableUnslopRedlines).toBe(true);
  });

  it("ingests multi-source inputs and deconstructs assumptions, leaps, and 2nd-order effects", () => {
    const sampleUrlA = ["https:", "", "studio.local", "webtoon-3d-benchmark"].join("/");
    const sampleUrlB = ["https:", "", "studio.local", "assistant-interview"].join("/");
    const bundle = ingestFreshIdeasSources([
      {
        id: "src-1",
        title: "웹툰 3D 배경 자동화 벤치마크",
        kind: "sheet-csv",
        content: "주간 70컷 중 45%를 3D로 처리하면 24시간 절감되지만 시너지와 민첩성 강조만으로는 검수 병목이 남는다.",
        url: sampleUrlA,
      },
      {
        id: "src-2",
        title: "어시스턴트 현장 인터뷰 녹취",
        kind: "meeting-transcript",
        content: "하지만 파라미터가 많아질수록 담당자마다 선굵기가 달라져 마감 직전 재작업이 3배 늘어난다.",
        url: sampleUrlB,
      },
    ]);

    expect(bundle.isMultiDoc).toBe(true);
    expect(bundle.isDataHeavy).toBe(true);
    expect(bundle.preservedUrls).toHaveLength(2);
    expect(bundle.topSoundbites.length).toBeGreaterThanOrEqual(2);
    expect(bundle.extractedMetrics.length).toBeGreaterThanOrEqual(3);

    const decon = deconstructFreshIdeasThesis(bundle);
    expect(decon.unspokenAssumptionsKo).toHaveLength(2);
    expect(decon.logicalLeapKo).toContain("인과관계");
    expect(decon.concreteBehaviorTerms).toContain("팀 간 핸드오프 대기시간 단축");
    expect(decon.secondOrderChainKo).toContain("6~12개월");
  });

  it("generates 5 orthogonal lenses with anti-fabrication slot, Done criteria, and 9 extended lenses", () => {
    const bundle = ingestFreshIdeasSources([
      {
        id: "s1",
        title: "원격근무 협업 프로토콜",
        kind: "changelog-pr",
        content: "화상회의를 줄이고 비동기 문서 리뷰를 도입해 배포 주기를 2배 단축했다.",
      },
    ]);
    const decon = deconstructFreshIdeasThesis(bundle);
    const lenses = generateFiveOrthogonalLenses(bundle, decon, { preferredLensId: "contrarian-take" });

    expect(lenses).toHaveLength(5);
    expect(lenses.map((l) => l.indexTag)).toEqual(["01", "02", "03", "04", "05"]);
    expect(lenses[0]!.falsifiableBoundaryKo).toBeTruthy();
    expect(lenses[1]!.experienceSlotPromptKo).toContain("[실제 경험 슬롯:");
    expect(lenses[1]!.fourBeatArcKo).toHaveLength(4);
    expect(lenses[2]!.retrievalPlaceholdersKo?.[0]).toContain("[");
    expect(lenses[3]!.playbookStepsKo).toHaveLength(3);
    expect(lenses[3]!.playbookStepsKo![0]!.doneCriteriaKo).toContain("완료 기준");
    expect(lenses[4]!.blindSpotAxis).toBe("maintenance-debt");

    expect(EXTENDED_LENS_PACK).toHaveLength(9);
    const swap = recommendExtendedLensSwap(bundle);
    expect(swap.withExtendedLensId).toBe("failure-autopsy");
    expect(computeHeadlineOverlapRatio(lenses[0]!.headlineKo, lenses[4]!.headlineKo)).toBeLessThan(0.45);
  });

  it("expands Mode B across all 10 channels and localizes Korean rhetoric without translationese", () => {
    expect(SUPPORTED_CHANNEL_OPTIONS).toHaveLength(10);
    const bundle = ingestFreshIdeasSources([
      {
        id: "s1",
        title: "비동기 개발 협업",
        kind: "article",
        content: "비동기 문서 협업으로 집중 시간을 보호한다.",
      },
    ]);
    const lenses = generateFiveOrthogonalLenses(bundle, deconstructFreshIdeasThesis(bundle));

    for (const ch of SUPPORTED_CHANNEL_OPTIONS) {
      const draft = expandLensToChannelDraft(lenses[0]!, ch.id);
      expect(draft.headlineVariants.directThesisKo.length).toBeGreaterThan(10);
      expect(draft.bodySectionsKo.length).toBeGreaterThanOrEqual(2);
      expect(draft.preemptiveObjectionKo.length).toBeGreaterThan(15);
      expect(draft.closingCtaKo.length).toBeGreaterThan(15);
      if (ch.id === "default-dual-preview") {
        expect(draft.socialThreeLineCutKo).toHaveLength(3);
      }
    }

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

  it("enforces quality/safety gates, de-identification, and Mode C ecosystem chaining", () => {
    const bundle = ingestFreshIdeasSources([
      {
        id: "s1",
        title: "스튜디오 주간 마감 자동화",
        kind: "article",
        content: "마감 자동화 체크리스트로 검수 시간을 줄인다.",
      },
    ]);
    const lenses = generateFiveOrthogonalLenses(bundle, deconstructFreshIdeasThesis(bundle));
    const draft = expandLensToChannelDraft(lenses[0]!, "linkedin-kr");

    const cleanAudit = auditFreshIdeasQualityAndSafety(lenses, draft.bodySectionsKo.join("\n"));
    expect(cleanAudit.passed).toBe(true);
    expect(cleanAudit.score100).toBe(100);
    expect(cleanAudit.violations).toHaveLength(0);

    const sloppyAudit = auditFreshIdeasQualityAndSafety(
      lenses,
      "🔥 오늘날 급변하는 환경에서 게임 체인저! [X%]",
      [["https:", "", "studio.local", "missing-report"].join("/")],
    );
    expect(sloppyAudit.passed).toBe(false);
    const codes = new Set(sloppyAudit.violations.map((v) => v.code));
    expect(codes.has("UNSLOP_EMOJI")).toBe(true);
    expect(codes.has("BANNED_CLICHE")).toBe(true);
    expect(codes.has("UNSLOP_EXCLAMATION")).toBe(true);
    expect(codes.has("VAGUE_PLACEHOLDER")).toBe(true);
    expect(codes.has("DROPPED_URL")).toBe(true);

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
  });
});
