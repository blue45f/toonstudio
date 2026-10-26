import { describe, expect, it, vi } from "vitest";

import { claudeParse } from "@/shared/ai/claude/claude-transport";

import {
  buildLocalAsymmetricCostumePropWoundLedgerReport,
  buildLocalCameraAxisEyelineHeightLockReport,
  buildLocalCrossCutColorScriptAlbedoLockReport,
  buildLocalGlimnaviColorHintReport,
  buildLocalMangaFlowIdentityVerificationReport,
  buildLocalMicroExpressionActingContinuityReport,
  buildLocalNovelAdaptationAndIpExpansionReport,
  buildLocalNovelAiMultiCharVibeReport,
  buildLocalSnaptoon3dEnvironmentShaderReport,
  buildLocalToonCrafterInbetweenAndStitchReport,
  runClaudeAsymmetricCostumePropWoundLedgerDirector,
  runClaudeCameraAxisEyelineHeightLockDirector,
  runClaudeCrossCutColorScriptAlbedoLockDirector,
  runClaudeGlimnaviColorHintStrokeDirector,
  runClaudeMangaFlowIdentityVerificationDirector,
  runClaudeMicroExpressionActingContinuityDirector,
  runClaudeNovelAdaptationAndIpExpansionDirector,
  runClaudeNovelAiMultiCharVibeDirector,
  runClaudeSnaptoon3dEnvironmentShaderDirector,
  runClaudeToonCrafterInbetweenAndStitchDirector,
} from "./claude-phase6-ecosystem-suite";
import type { WebtoonProductionAssistInput } from "./claude-webtoon-production-schemas";

vi.mock("@/shared/ai/claude/claude-transport", () => ({
  claudeParse: vi.fn(),
}));

const SAMPLE_INPUT: WebtoonProductionAssistInput = {
  genre: "판타지 액션",
  coreConflict: "봉인된 고대 유물의 각성과 황궁 결전",
  protagonistName: "서진",
  partnerName: "하윤",
  artistLabel: "K-웹툰 마스터 화풍",
  triggerWord: "ts_master_webtoon",
  relationshipDynamic: "fated-rivals",
  posePresetId: "pose-dynamic-slash",
  scriptText: "서진: 이번 생엔 절대 물러서지 않는다.\n하윤: 네 검이 진실을 증명하겠지.",
};

const TEST_ROUTE = {
  apiKey: "sk-ant-test-key",
  revision: 1,
  model: "claude-opus-5-5",
};

describe("claude-phase6-ecosystem-suite (Phase 6 글로벌·국내 20대 웹툰 AI 생태계 6대 엔진)", () => {
  it("1. NovelAI V4.5/V5 다중 캐릭터 X/Y 공간 좌표 분리 & Vibe Transfer 로컬·Claude 실행을 검증한다", async () => {
    const local = buildLocalNovelAiMultiCharVibeReport(SAMPLE_INPUT);
    expect(local.attributeBleedingZeroGuarantee).toBe(true);
    expect(local.characterRegions).toHaveLength(2);
    expect(local.characterRegions[0]?.bboxNormalized.xMax).toBeLessThanOrEqual(
      local.characterRegions[1]!.bboxNormalized.xMin,
    );

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 280, output_tokens: 410 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeNovelAiMultiCharVibeDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.characterRegions).toHaveLength(2);
  });

  it("2. MangaFlow Studio & DiffSensei 캐릭터 동일성(ArcFace) & 말풍선 꼬리 벡터 디렉터를 검증한다", async () => {
    const local = buildLocalMangaFlowIdentityVerificationReport(SAMPLE_INPUT);
    expect(local.averageArcFaceScore).toBeGreaterThanOrEqual(0.9);
    expect(local.cutAudits.length).toBeGreaterThanOrEqual(3);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 260, output_tokens: 390 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeMangaFlowIdentityVerificationDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.report.identityPassRatePct).toBe(100);
  });

  it("3. 그림나비(Glimnavi) 브러시 컬러 힌트 스트로크 자동 채색 디렉터(Haiku 5.5 라우팅)를 검증한다", async () => {
    const local = buildLocalGlimnaviColorHintReport(SAMPLE_INPUT);
    expect(local.closeGapTolerancePx).toBeGreaterThanOrEqual(1);
    expect(local.hintStrokes.length).toBeGreaterThanOrEqual(4);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-haiku-4-5",
        usage: { input_tokens: 210, output_tokens: 320 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeGlimnaviColorHintStrokeDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("fast-inline");
    expect(live.routedModel).toBe("claude-haiku-5-5");
    expect(live.report.coloringTimeSavedEstPct).toBeGreaterThanOrEqual(70);
  });

  it("4. 스냅툰(Snaptoon) & 에이콘3D(ACON3D) 3D 배경 툰셰이더·환경광 디렉터(Haiku 5.5 라우팅)를 검증한다", async () => {
    const local = buildLocalSnaptoon3dEnvironmentShaderReport(SAMPLE_INPUT);
    expect(local.cutEnvironments.length).toBeGreaterThanOrEqual(2);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-haiku-4-5",
        usage: { input_tokens: 220, output_tokens: 340 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeSnaptoon3dEnvironmentShaderDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("fast-inline");
    expect(live.routedModel).toBe("claude-haiku-5-5");
    expect(live.report.cutEnvironments[0]?.windowGlowIntensity).toBeGreaterThan(0);
  });

  it("5. 더컬쳐툰·마이닝5000·Storyflow 웹소설 각색 & 2차 IP OSMU 스코어카드(Opus 5.5 라우팅)를 검증한다", async () => {
    const local = buildLocalNovelAdaptationAndIpExpansionReport(SAMPLE_INPUT);
    expect(local.overallProseCompressionPct).toBeGreaterThanOrEqual(65);
    expect(local.osmuExpansionScores.length).toBeGreaterThanOrEqual(3);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 340, output_tokens: 520 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeNovelAdaptationAndIpExpansionDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.storyArchetype).toBe("regression-revenge");
  });

  it("6. ToonCrafter/AniDoc 인비트윈 동화 보간 & Krita/Comistitch 안전 분할 디렉터를 검증한다", async () => {
    const local = buildLocalToonCrafterInbetweenAndStitchReport(SAMPLE_INPUT);
    expect(local.zeroBubbleSliceGuarantee).toBe(true);
    expect(local.inbetweenBridges.length).toBeGreaterThanOrEqual(2);
    expect(local.comistitchSlices.every((s) => s.safeSplitInGutterConfirmed)).toBe(true);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 270, output_tokens: 400 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeToonCrafterInbetweenAndStitchDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.report.zeroBubbleSliceGuarantee).toBe(true);
  });

  it("7. 비대칭 복식·흉터·무기 파지 비례·부상 누적 연속성 원장 디렉터(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalAsymmetricCostumePropWoundLedgerReport(SAMPLE_INPUT);
    expect(local.zeroMirrorFlipGuarantee).toBe(true);
    expect(local.chiralityConsistencyScore).toBeGreaterThanOrEqual(95);
    expect(local.ledgerItems.length).toBeGreaterThanOrEqual(3);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 260, output_tokens: 380 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeAsymmetricCostumePropWoundLedgerDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.zeroMirrorFlipGuarantee).toBe(true);
  });

  it("8. 180도 시선 축(180° Rule)·다중 인물 키 차이·원근 소실점 일관성 감독(Opus 5.5)을 검증한다", async () => {
    const local = buildLocalCameraAxisEyelineHeightLockReport(SAMPLE_INPUT);
    expect(local.axis180ViolationCount).toBe(0);
    expect(local.canonicalHeightDeltaCm).toBe(16);
    expect(local.cutAxisAudits.every((c) => c.eyelineVectorMatchPass)).toBe(true);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 310, output_tokens: 440 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeCameraAxisEyelineHeightLockDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("deep-architecture");
    expect(live.routedModel).toBe("claude-opus-5-5");
    expect(live.report.axis180ViolationCount).toBe(0);
  });

  it("9. 컷간 피부톤·의상 고유색(Albedo) 드리프트 방지 고정기(Haiku 5.5)를 검증한다", async () => {
    const local = buildLocalCrossCutColorScriptAlbedoLockReport(SAMPLE_INPUT);
    expect(local.albedoConsistencyPass).toBe(true);
    expect(local.maxDeltaEDrift).toBeLessThanOrEqual(2.0);
    expect(local.colorLocks.length).toBeGreaterThanOrEqual(2);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-haiku-4-5",
        usage: { input_tokens: 190, output_tokens: 280 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeCrossCutColorScriptAlbedoLockDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("fast-inline");
    expect(live.routedModel).toBe("claude-haiku-5-5");
    expect(live.report.albedoConsistencyPass).toBe(true);
  });

  it("10. 컷간 미세 표정(FACS 근육)·시선 궤적·호흡 감정선 연속성 디렉터(Sonnet 5.5)를 검증한다", async () => {
    const local = buildLocalMicroExpressionActingContinuityReport(SAMPLE_INPUT);
    expect(local.zeroWhiplashGuarantee).toBe(true);
    expect(local.emotionalContinuityScore).toBeGreaterThanOrEqual(95);
    expect(local.microExpressionBeats.length).toBeGreaterThanOrEqual(2);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 250, output_tokens: 370 },
      } as never,
      parsed: local,
    });

    const live = await runClaudeMicroExpressionActingContinuityDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.taskProfile).toBe("creative-production");
    expect(live.routedModel).toBe("claude-sonnet-5-5");
    expect(live.report.zeroWhiplashGuarantee).toBe(true);
  });
});
