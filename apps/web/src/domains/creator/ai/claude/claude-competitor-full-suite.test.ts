import { describe, expect, it, vi } from "vitest";

import { claudeParse } from "@/shared/ai/claude/claude-transport";

import {
  buildLocal3dHandHeadPoseAndLtRig,
  buildLocalSakugaMotionAndFacialMatrix,
  buildLocalScreenplayBeatAndLoraLock,
  buildLocalSketchToLineartLayerSplit,
  buildLocalStyleTransferAndRelighting,
  runClaude3dHandHeadPoseAndLtRigDirector,
  runClaudeSakugaMotionAndFacialMatrixDirector,
  runClaudeScreenplayBeatAndLoraLockBridge,
  runClaudeSketchToLineartLayerSplitter,
  runClaudeStyleTransferAndRelightingDirector,
} from "./claude-competitor-full-suite";
import type { WebtoonProductionAssistInput } from "./claude-webtoon-production-schemas";

vi.mock("@/shared/ai/claude/claude-transport", () => ({
  claudeParse: vi.fn(),
}));

const SAMPLE_INPUT: WebtoonProductionAssistInput = {
  genre: "판타지 액션",
  coreConflict: "봉인된 마검의 각성과 황궁 결전",
  protagonistName: "서진",
  partnerName: "하윤",
  artistLabel: "K-웹툰 마스터 화풍",
  triggerWord: "ts_master_webtoon",
  relationshipDynamic: "fated-rivals",
  posePresetId: "pose-dynamic-slash",
  scriptText: "서진: 지금부터 진짜 승부다!\n하윤: 물러서지 않겠다!",
};

const TEST_ROUTE = {
  apiKey: "sk-ant-test-key",
  revision: 1,
  model: "claude-opus-5-5",
};

describe("claude-competitor-full-suite (5대 신규 경쟁사 벤치마크 엔진)", () => {
  it("1. 크림 AiD & CSP 5.0 스케치→벡터 선화 & 4레이어 분리 로컬·Claude 실행을 검증한다", async () => {
    const local = buildLocalSketchToLineartLayerSplit(SAMPLE_INPUT);
    expect(local.inkingTimeReductionEstPct).toBeGreaterThanOrEqual(75);
    expect(local.cutSpecs.length).toBeGreaterThan(0);
    expect(local.cutSpecs[0]?.separatedLayers).toHaveLength(4);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 320, output_tokens: 480 },
      } as never,
      parsed: {
        inkingTimeReductionEstPct: 0.86,
        artistBrushDnaSummaryKo: "AiD & CSP 5.0 벡터 선화 86% 단축",
        cutSpecs: local.cutSpecs,
      },
    });

    const live = await runClaudeSketchToLineartLayerSplitter(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.report.inkingTimeReductionEstPct).toBe(86);
    expect(live.report.cutSpecs[0]?.separatedLayers).toHaveLength(4);
  });

  it("2. Komiko AI & LlamaGen 30+ 화풍 스타일 트랜스퍼 & 3D 리라이팅을 검증한다", async () => {
    const local = buildLocalStyleTransferAndRelighting(SAMPLE_INPUT, "noir-high-contrast-ink");
    expect(local.selectedStyleFamilyKo).toContain("noir-high-contrast-ink");
    expect(local.cutDirectives.length).toBeGreaterThan(0);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 310, output_tokens: 450 },
      } as never,
      parsed: {
        selectedStyleFamilyKo: "Komiko 느와르 고대비 잉크",
        ocUniverseConsistencyRuleKo: "서진·하윤 OC 시드 100% 고정",
        cutDirectives: local.cutDirectives,
      },
    });

    const live = await runClaudeStyleTransferAndRelightingDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
      preferredPreset: "noir-high-contrast-ink",
    });
    expect(live.source).toBe("claude-live");
    expect(live.report.selectedStyleFamilyKo).toContain("느와르");
  });

  it("3. SkyReels & Mootion 33종 표정 매트릭스 & 사쿠가 모션웹툰 디렉터를 검증한다", async () => {
    const local = buildLocalSakugaMotionAndFacialMatrix(SAMPLE_INPUT);
    expect(local.totalTrailerDurationSec).toBeGreaterThan(0);
    expect(local.keyframes[0]?.expressionMatrixCode).toMatch(/^EXP-/u);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 290, output_tokens: 420 },
      } as never,
      parsed: {
        totalTrailerDurationSec: 12.5,
        facialMatrixSummaryKo: "33종 FACS 안면 근육 및 사쿠가 패럴랙스",
        keyframes: local.keyframes,
      },
    });

    const live = await runClaudeSakugaMotionAndFacialMatrixDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.report.totalTrailerDurationSec).toBe(12.5);
  });

  it("4. 클립스튜디오 5.0 & Posemaniacs 3D 핸드·헤드 & 카툰 LT 리그 디렉터를 검증한다", async () => {
    const local = buildLocal3dHandHeadPoseAndLtRig(SAMPLE_INPUT);
    expect(local.cutRigs.length).toBeGreaterThan(0);
    expect(local.cutRigs[0]?.ltOutlineThreshold).toBe(72);

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 280, output_tokens: 410 },
      } as never,
      parsed: {
        anatomyRigSummaryKo: "CSP 5.0 3D 손 관절 및 두상 리그",
        cutRigs: local.cutRigs,
      },
    });

    const live = await runClaude3dHandHeadPoseAndLtRigDirector(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.report.anatomyRigSummaryKo).toContain("CSP 5.0");
  });

  it("5. Katalist.ai & Anifusion 시나리오 액션 비트 분해 & 캐릭터 LoRA 시드 락 브리지를 검증한다", async () => {
    const local = buildLocalScreenplayBeatAndLoraLock(SAMPLE_INPUT);
    expect(local.pipelineCompatibilityScore).toBe(98);
    expect(local.actionBeats[0]?.reaObligationId).toContain("ob_webtoon_cut_");

    vi.mocked(claudeParse).mockResolvedValueOnce({
      message: {
        model: "claude-opus-4-6",
        usage: { input_tokens: 300, output_tokens: 430 },
      } as never,
      parsed: {
        pipelineCompatibilityScore: 0.99,
        mcpBridgeSummaryKo: "Katalist 액션 비트 및 Anifusion LoRA 브리지 완료",
        actionBeats: local.actionBeats,
      },
    });

    const live = await runClaudeScreenplayBeatAndLoraLockBridge(SAMPLE_INPUT, {
      route: TEST_ROUTE,
    });
    expect(live.source).toBe("claude-live");
    expect(live.report.pipelineCompatibilityScore).toBe(99);
  });
});
