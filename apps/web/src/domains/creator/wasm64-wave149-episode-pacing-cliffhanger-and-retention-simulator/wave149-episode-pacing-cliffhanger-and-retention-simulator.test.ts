import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEWPORT_HEIGHT_PX,
  DEFAULT_VIEWPORT_WIDTH_PX,
  OPTIMIZED_DRAMATIC_PAUSE_GUTTER_PX,
  SIMULATION_ESTIMATE_NOTICE_KO,
  auditEpisodePacingAndCliffhanger,
  canonicalizePacingValue,
  computePacingManifestSha256Hex,
  escapePacingXml,
  optimizeEpisodeGutterPacing,
  renderEpisodePacingCurvesSvg,
  sha256PacingUtf8Hex,
  simulateEpisodeScrollRetention,
  summarizeEpisodePacingAuditKo,
  type EpisodePacingCutSpec,
  type EpisodePacingInput,
} from "./index";

function makeCut(overrides: Partial<EpisodePacingCutSpec> & { cutId: string; cutIndex: number }): EpisodePacingCutSpec {
  return {
    heightPx: 720,
    gutterAfterPx: 180,
    characterCountKo: 38,
    balloonCount: 2,
    visualComplexity: 0.45,
    narrativeBeatKind: "dialogue-exchange",
    tensionScore: 0.55,
    isSilentBreathCut: false,
    ...overrides,
  };
}

function createBalancedEpisode(): EpisodePacingInput {
  return {
    episodeId: "ep-149-balanced",
    episodeTitle: "제149화 폭풍 전야의 약속",
    cuts: [
      makeCut({ cutId: "c1", cutIndex: 0, heightPx: 760, gutterAfterPx: 180, characterCountKo: 28, narrativeBeatKind: "opening-hook", tensionScore: 0.82 }),
      makeCut({ cutId: "c2", cutIndex: 1, heightPx: 720, gutterAfterPx: 160, characterCountKo: 44, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.56 }),
      makeCut({ cutId: "c3", cutIndex: 2, heightPx: 700, gutterAfterPx: 170, characterCountKo: 42, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.58 }),
      makeCut({ cutId: "c4", cutIndex: 3, heightPx: 780, gutterAfterPx: 220, characterCountKo: 0, balloonCount: 0, narrativeBeatKind: "emotional-pause", tensionScore: 0.48, isSilentBreathCut: true }),
      makeCut({ cutId: "c5", cutIndex: 4, heightPx: 740, gutterAfterPx: 190, characterCountKo: 32, narrativeBeatKind: "action-surge", tensionScore: 0.74 }),
      makeCut({ cutId: "c6", cutIndex: 5, heightPx: 800, gutterAfterPx: 220, characterCountKo: 36, narrativeBeatKind: "mid-twist", tensionScore: 0.85 }),
      makeCut({ cutId: "c7", cutIndex: 6, heightPx: 720, gutterAfterPx: 180, characterCountKo: 40, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.62 }),
      makeCut({ cutId: "c8", cutIndex: 7, heightPx: 760, gutterAfterPx: 220, characterCountKo: 16, balloonCount: 1, narrativeBeatKind: "emotional-pause", tensionScore: 0.52 }),
      makeCut({ cutId: "c9", cutIndex: 8, heightPx: 780, gutterAfterPx: 200, characterCountKo: 34, narrativeBeatKind: "action-surge", tensionScore: 0.79 }),
      makeCut({ cutId: "c10", cutIndex: 9, heightPx: 740, gutterAfterPx: 380, characterCountKo: 18, balloonCount: 1, narrativeBeatKind: "action-surge", tensionScore: 0.84 }),
      makeCut({ cutId: "c11", cutIndex: 10, heightPx: 860, gutterAfterPx: 0, characterCountKo: 22, balloonCount: 1, narrativeBeatKind: "cliffhanger-reveal", tensionScore: 0.94 }),
    ],
  };
}

function createFlawedEpisode(): EpisodePacingInput {
  return {
    episodeId: "ep-149-flawed",
    episodeTitle: "제149화 과밀 설명 초안",
    cuts: [
      makeCut({ cutId: "f1", cutIndex: 0, heightPx: 620, gutterAfterPx: 30, characterCountKo: 118, balloonCount: 5, visualComplexity: 0.78, narrativeBeatKind: "exposition", tensionScore: 0.32 }),
      makeCut({ cutId: "f2", cutIndex: 1, heightPx: 600, gutterAfterPx: 35, characterCountKo: 126, balloonCount: 5, visualComplexity: 0.82, narrativeBeatKind: "exposition", tensionScore: 0.34 }),
      makeCut({ cutId: "f3", cutIndex: 2, heightPx: 610, gutterAfterPx: 30, characterCountKo: 132, balloonCount: 6, visualComplexity: 0.8, narrativeBeatKind: "exposition", tensionScore: 0.36 }),
      makeCut({ cutId: "f4", cutIndex: 3, heightPx: 620, gutterAfterPx: 40, characterCountKo: 115, balloonCount: 4, visualComplexity: 0.75, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.38 }),
      makeCut({ cutId: "f5", cutIndex: 4, heightPx: 680, gutterAfterPx: 45, characterCountKo: 64, balloonCount: 3, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.42 }),
      makeCut({ cutId: "f6", cutIndex: 5, heightPx: 680, gutterAfterPx: 40, characterCountKo: 58, balloonCount: 3, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.44 }),
      makeCut({ cutId: "f7", cutIndex: 6, heightPx: 700, gutterAfterPx: 50, characterCountKo: 52, balloonCount: 3, narrativeBeatKind: "action-surge", tensionScore: 0.65 }),
      makeCut({ cutId: "f8", cutIndex: 7, heightPx: 680, gutterAfterPx: 40, characterCountKo: 48, balloonCount: 2, narrativeBeatKind: "emotional-pause", tensionScore: 0.4 }),
      makeCut({ cutId: "f9", cutIndex: 8, heightPx: 680, gutterAfterPx: 30, characterCountKo: 40, balloonCount: 2, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.38 }),
      makeCut({ cutId: "f10", cutIndex: 9, heightPx: 700, gutterAfterPx: 0, characterCountKo: 35, balloonCount: 2, narrativeBeatKind: "epilogue-fade", tensionScore: 0.28 }),
    ],
  };
}

describe("Wave 149 — 에피소드 스크롤 체류·피로 시뮬레이터 및 클리프행어 페이싱 옵티마이저", () => {
  describe("1. 시뮬레이션 불변량 및 인지 피로 물리 모델", () => {
    it("모든 산출물과 체류 곡선 샘플에 isSimulationEstimate === true 및 고지문을 강제한다", () => {
      const episode = createBalancedEpisode();
      const sim = simulateEpisodeScrollRetention(episode);
      const audit = auditEpisodePacingAndCliffhanger(episode);
      const opt = optimizeEpisodeGutterPacing(episode);

      expect(sim.isSimulationEstimate).toBe(true);
      expect(audit.isSimulationEstimate).toBe(true);
      expect(opt.isSimulationEstimate).toBe(true);
      expect(sim.simulationNoticeKo).toBe(SIMULATION_ESTIMATE_NOTICE_KO);
      expect(sim.estimatedRetentionCurve.length).toBe(episode.cuts.length);
      for (const sample of sim.estimatedRetentionCurve) {
        expect(sample.isSimulationEstimate).toBe(true);
      }
    });

    it("추정 체류 곡선이 [0, 1] 범위에서 단조 비증가 불변량을 보장한다", () => {
      const sim = simulateEpisodeScrollRetention(createFlawedEpisode());
      let prevRetention = 1;
      let prevProgress = 0;

      for (const point of sim.cutPoints) {
        expect(point.retentionBeforeCut).toBeLessThanOrEqual(prevRetention + 1e-9);
        expect(point.retentionAfterCut).toBeLessThanOrEqual(point.retentionBeforeCut);
        expect(point.retentionAfterCut).toBeGreaterThanOrEqual(0);
        expect(point.retentionAfterCut).toBeLessThanOrEqual(1);
        expect(point.estimatedDropOffDelta).toBeGreaterThanOrEqual(0);
        expect(point.scrollProgressEnd).toBeGreaterThanOrEqual(prevProgress);
        expect(point.scrollProgressEnd).toBeLessThanOrEqual(1);
        prevRetention = point.retentionAfterCut;
        prevProgress = point.scrollProgressEnd;
      }

      for (let i = 1; i < sim.estimatedRetentionCurve.length; i += 1) {
        const prev = sim.estimatedRetentionCurve[i - 1];
        const curr = sim.estimatedRetentionCurve[i];
        expect(curr?.estimatedRetention ?? 1).toBeLessThanOrEqual(prev?.estimatedRetention ?? 1);
      }
    });

    it("기본 모바일 뷰포트(390×844px) 기준으로 유한 체류 시간·화면 수·대사 밀도를 산출한다", () => {
      const sim = simulateEpisodeScrollRetention(createBalancedEpisode());
      expect(sim.viewport.viewportWidthPx).toBe(DEFAULT_VIEWPORT_WIDTH_PX);
      expect(sim.viewport.viewportHeightPx).toBe(DEFAULT_VIEWPORT_HEIGHT_PX);
      expect(sim.totalViewportScreens).toBeGreaterThan(8);
      expect(sim.totalEstimatedDwellSeconds).toBeGreaterThan(20);
      expect(sim.averageCharsPerViewportScreen).toBeGreaterThan(0);
      expect(Number.isFinite(sim.estimatedCompletionRetention)).toBe(true);
    });

    it("읽기 속도(charsPerSec)와 뷰포트 높이 설정 변화에 결정론적으로 반응한다", () => {
      const base = createBalancedEpisode();
      const slowReader = simulateEpisodeScrollRetention({
        ...base,
        viewport: { viewportWidthPx: 390, viewportHeightPx: 844, charsPerSec: 7 },
      });
      const fastReader = simulateEpisodeScrollRetention({
        ...base,
        viewport: { viewportWidthPx: 390, viewportHeightPx: 844, charsPerSec: 18 },
      });
      const tallViewport = simulateEpisodeScrollRetention({
        ...base,
        viewport: { viewportWidthPx: 430, viewportHeightPx: 1100, charsPerSec: 11.5 },
      });

      expect(slowReader.totalEstimatedDwellSeconds).toBeGreaterThan(
        fastReader.totalEstimatedDwellSeconds,
      );
      expect(tallViewport.totalViewportScreens).toBeLessThan(slowReader.totalViewportScreens);
      expect(tallViewport.averageCharsPerViewportScreen).toBeGreaterThan(
        slowReader.averageCharsPerViewportScreen,
      );
    });

    it("침묵 호흡 컷과 충분한 거터가 누적 인지 피로를 실제로 회복시킨다", () => {
      const denseBase: EpisodePacingCutSpec[] = [
        makeCut({ cutId: "d1", cutIndex: 0, heightPx: 620, gutterAfterPx: 40, characterCountKo: 110, balloonCount: 4, narrativeBeatKind: "exposition", tensionScore: 0.45 }),
        makeCut({ cutId: "d2", cutIndex: 1, heightPx: 620, gutterAfterPx: 40, characterCountKo: 110, balloonCount: 4, narrativeBeatKind: "exposition", tensionScore: 0.45 }),
      ];
      const withBreath = simulateEpisodeScrollRetention({
        episodeId: "breath-yes",
        cuts: [
          ...denseBase,
          makeCut({ cutId: "d3", cutIndex: 2, heightPx: 760, gutterAfterPx: 280, characterCountKo: 0, balloonCount: 0, narrativeBeatKind: "emotional-pause", tensionScore: 0.52, isSilentBreathCut: true }),
          makeCut({ cutId: "d4", cutIndex: 3, heightPx: 680, gutterAfterPx: 0, characterCountKo: 55, balloonCount: 2, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.65 }),
        ],
      });
      const withoutBreath = simulateEpisodeScrollRetention({
        episodeId: "breath-no",
        cuts: [
          ...denseBase,
          makeCut({ cutId: "d3", cutIndex: 2, heightPx: 620, gutterAfterPx: 40, characterCountKo: 110, balloonCount: 4, narrativeBeatKind: "exposition", tensionScore: 0.45 }),
          makeCut({ cutId: "d4", cutIndex: 3, heightPx: 680, gutterAfterPx: 0, characterCountKo: 55, balloonCount: 2, narrativeBeatKind: "dialogue-exchange", tensionScore: 0.65 }),
        ],
      });

      const fatigueAfterWith = withBreath.cutPoints[3]?.cognitiveFatigue ?? 1;
      const fatigueAfterWithout = withoutBreath.cutPoints[3]?.cognitiveFatigue ?? 0;
      expect(fatigueAfterWith).toBeLessThan(fatigueAfterWithout);
      expect(withBreath.estimatedCompletionRetention).toBeGreaterThan(
        withoutBreath.estimatedCompletionRetention,
      );
    });

    it("클리프행어 직전 정적 거터가 최종 컷 주의력 흥미도(engagementIndex)를 끌어올린다", () => {
      const crampedCliff = simulateEpisodeScrollRetention({
        episodeId: "cliff-tight",
        cuts: [
          makeCut({ cutId: "a1", cutIndex: 0, gutterAfterPx: 140, narrativeBeatKind: "opening-hook", tensionScore: 0.72 }),
          makeCut({ cutId: "a2", cutIndex: 1, gutterAfterPx: 50, narrativeBeatKind: "action-surge", tensionScore: 0.78 }),
          makeCut({ cutId: "a3", cutIndex: 2, gutterAfterPx: 0, narrativeBeatKind: "cliffhanger-reveal", tensionScore: 0.9 }),
        ],
      });
      const pausedCliff = simulateEpisodeScrollRetention({
        episodeId: "cliff-pause",
        cuts: [
          makeCut({ cutId: "a1", cutIndex: 0, gutterAfterPx: 140, narrativeBeatKind: "opening-hook", tensionScore: 0.72 }),
          makeCut({ cutId: "a2", cutIndex: 1, gutterAfterPx: 340, narrativeBeatKind: "action-surge", tensionScore: 0.78 }),
          makeCut({ cutId: "a3", cutIndex: 2, gutterAfterPx: 0, narrativeBeatKind: "cliffhanger-reveal", tensionScore: 0.9 }),
        ],
      });

      expect(pausedCliff.cutPoints[2]?.engagementIndex ?? 0).toBeGreaterThan(
        crampedCliff.cutPoints[2]?.engagementIndex ?? 1,
      );
    });

    it("균형 잡힌 액션·감정·중반 반전·클리프행어 회차는 결함 0건과 고득점(S등급)을 통과한다", () => {
      const audit = auditEpisodePacingAndCliffhanger(createBalancedEpisode());
      expect(audit.findings).toHaveLength(0);
      expect(audit.pacingHealthScore).toBeGreaterThanOrEqual(88);
      expect(audit.pacingGrade).toBe("S");
      expect(audit.hasMidTwistOrPeak).toBe(true);
      expect(audit.hasStrongCliffhanger).toBe(true);
      expect(audit.simulation.estimatedCompletionRetention).toBeGreaterThan(0.88);
      expect(audit.simulation.estimatedNextEpisodeClickPropensity).toBeGreaterThan(0.8);
    });
  });

  describe("2. 5대 페이싱 결함 개별 및 복합 탐지", () => {
    it("연속 3컷 이상 고대사 밀도(>= 95자/뷰포트) 구간을 text-density-fatigue-wall로 탐지한다", () => {
      const ep = createBalancedEpisode();
      const denseCuts = ep.cuts.map((c, idx) =>
        idx >= 1 && idx <= 3
          ? { ...c, heightPx: 600, gutterAfterPx: 120, characterCountKo: 105, isSilentBreathCut: false, narrativeBeatKind: "dialogue-exchange" as const }
          : c,
      );
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: denseCuts });
      expect(audit.findingCountsByCode["text-density-fatigue-wall"]).toBe(1);
      const wall = audit.findings.find((f) => f.code === "text-density-fatigue-wall");
      expect(wall?.affectedCutIds).toEqual(["c2", "c3", "c4"]);
    });

    it("연속 3컷 이상 exposition 비트가 여백 없이 이어지면 text-density-fatigue-wall로 탐지한다", () => {
      const ep = createBalancedEpisode();
      const expoCuts = ep.cuts.map((c, idx) =>
        idx >= 1 && idx <= 3
          ? { ...c, gutterAfterPx: 140, characterCountKo: 60, isSilentBreathCut: false, narrativeBeatKind: "exposition" as const }
          : c,
      );
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: expoCuts });
      expect(audit.findingCountsByCode["text-density-fatigue-wall"]).toBe(1);
    });

    it("중간에 침묵 호흡 컷(isSilentBreathCut)이 들어가면 피로벽 연속성을 끊어 미탐지한다", () => {
      const ep = createBalancedEpisode();
      const broken = ep.cuts.map((c, idx) => {
        if (idx === 1 || idx === 3) {
          return { ...c, heightPx: 600, gutterAfterPx: 130, characterCountKo: 110, narrativeBeatKind: "exposition" as const, isSilentBreathCut: false };
        }
        if (idx === 2) {
          return { ...c, heightPx: 760, gutterAfterPx: 180, characterCountKo: 0, balloonCount: 0, isSilentBreathCut: true, narrativeBeatKind: "emotional-pause" as const };
        }
        return c;
      });
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: broken });
      expect(audit.findingCountsByCode["text-density-fatigue-wall"]).toBe(0);
    });

    it("고밀도 2컷 뒤 220px 이상 호흡 거터가 있으면 피로벽 결함이 발생하지 않는다", () => {
      const ep = createBalancedEpisode();
      const spaced = ep.cuts.map((c, idx) => {
        if (idx === 1) {
          return { ...c, heightPx: 600, gutterAfterPx: 130, characterCountKo: 105, narrativeBeatKind: "exposition" as const };
        }
        if (idx === 2) {
          return { ...c, heightPx: 600, gutterAfterPx: 250, characterCountKo: 105, narrativeBeatKind: "exposition" as const };
        }
        if (idx === 3) {
          return { ...c, heightPx: 600, gutterAfterPx: 160, characterCountKo: 105, narrativeBeatKind: "exposition" as const, isSilentBreathCut: false };
        }
        return c;
      });
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: spaced });
      expect(audit.findingCountsByCode["text-density-fatigue-wall"]).toBe(0);
    });

    it("초반 15% 구간에 훅과 긴장도가 낮으면 missing-opening-hook을 탐지한다", () => {
      const ep = createBalancedEpisode();
      const flatOpen = ep.cuts.map((c, idx) =>
        idx <= 1 ? { ...c, narrativeBeatKind: "exposition" as const, tensionScore: 0.34 } : c,
      );
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: flatOpen });
      expect(audit.findingCountsByCode["missing-opening-hook"]).toBe(1);
    });

    it("초반 15% 구간에 고긴장 액션 컷이 있으면 opening-hook 라벨이 없어도 통과한다", () => {
      const ep = createBalancedEpisode();
      const actionOpen = ep.cuts.map((c, idx) =>
        idx === 0 ? { ...c, narrativeBeatKind: "action-surge" as const, tensionScore: 0.78 } : c,
      );
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: actionOpen });
      expect(audit.findingCountsByCode["missing-opening-hook"]).toBe(0);
    });

    it("중반부(35~65%) 구간에 반전 비트와 긴장 피크가 없으면 mid-episode-sag을 탐지한다", () => {
      const ep = createBalancedEpisode();
      const saggyMid = ep.cuts.map((c, idx) =>
        idx >= 3 && idx <= 7
          ? { ...c, narrativeBeatKind: "dialogue-exchange" as const, tensionScore: 0.42 }
          : c,
      );
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: saggyMid });
      expect(audit.findingCountsByCode["mid-episode-sag"]).toBe(1);
      expect(audit.hasMidTwistOrPeak).toBe(false);
    });

    it("중반부(35~65%)에 mid-twist 비트가 있으면 mid-episode-sag이 발생하지 않는다", () => {
      const audit = auditEpisodePacingAndCliffhanger(createBalancedEpisode());
      expect(audit.findingCountsByCode["mid-episode-sag"]).toBe(0);
      expect(audit.hasMidTwistOrPeak).toBe(true);
    });

    it("마지막 2컷 긴장도가 회차 평균보다 낮으면 weak-cliffhanger-ending을 탐지한다", () => {
      const ep = createBalancedEpisode();
      const weakEnd = ep.cuts.map((c, idx) =>
        idx >= ep.cuts.length - 2
          ? { ...c, narrativeBeatKind: "cliffhanger-reveal" as const, tensionScore: 0.42 }
          : c,
      );
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: weakEnd });
      expect(audit.findingCountsByCode["weak-cliffhanger-ending"]).toBe(1);
      expect(audit.hasStrongCliffhanger).toBe(false);
    });

    it("클리프행어 비트 없이 epilogue-fade로 종료하면 weak-cliffhanger-ending을 탐지한다", () => {
      const ep = createBalancedEpisode();
      const fadeEnd = ep.cuts.map((c, idx) =>
        idx === ep.cuts.length - 1
          ? { ...c, narrativeBeatKind: "epilogue-fade" as const, tensionScore: 0.6 }
          : c,
      );
      const audit = auditEpisodePacingAndCliffhanger({ ...ep, cuts: fadeEnd });
      expect(audit.findingCountsByCode["weak-cliffhanger-ending"]).toBe(1);
    });

    it("좁은 전환 거터 및 5대 결함이 모두 섞인 초안에서 5개 결함 코드를 전부 검출한다", () => {
      const audit = auditEpisodePacingAndCliffhanger(createFlawedEpisode());
      expect(audit.findingCountsByCode["text-density-fatigue-wall"]).toBeGreaterThanOrEqual(1);
      expect(audit.findingCountsByCode["missing-opening-hook"]).toBe(1);
      expect(audit.findingCountsByCode["mid-episode-sag"]).toBe(1);
      expect(audit.findingCountsByCode["weak-cliffhanger-ending"]).toBe(1);
      expect(audit.findingCountsByCode["cramped-gutter-rhythm"]).toBeGreaterThanOrEqual(3);
      expect(audit.pacingHealthScore).toBeLessThan(45);
      expect(audit.pacingGrade).toBe("D");
    });
  });

  describe("3. 비파괴 여백·호흡 페이싱 옵티마이저", () => {
    it("원본 입력 컷 배열과 개별 컷 객체를 전혀 변이시키지 않는다(비파괴 보장)", () => {
      const flawed = createFlawedEpisode();
      const snapshot = JSON.stringify(flawed);
      const result = optimizeEpisodeGutterPacing(flawed);

      expect(JSON.stringify(flawed)).toBe(snapshot);
      expect(result.optimizedCuts).toHaveLength(flawed.cuts.length);
      for (let i = 0; i < flawed.cuts.length; i += 1) {
        expect(result.optimizedCuts[i]?.cutId).toBe(flawed.cuts[i]?.cutId);
        expect(result.optimizedCuts[i]?.characterCountKo).toBe(flawed.cuts[i]?.characterCountKo);
        expect(result.optimizedCuts[i]?.narrativeBeatKind).toBe(flawed.cuts[i]?.narrativeBeatKind);
      }
    });

    it("최적화 후 최대 인지 피로가 감소하고 추정 완독률이 상승한다", () => {
      const result = optimizeEpisodeGutterPacing(createFlawedEpisode());
      expect(result.totalAddedGutterPx).toBeGreaterThan(0);
      expect(result.peakFatigueReduction).toBeGreaterThan(0);
      expect(result.peakFatigueDelta).toBeLessThan(0);
      expect(result.completionRetentionDelta).toBeGreaterThan(0);
      expect(result.afterAudit.simulation.peakCognitiveFatigue).toBeLessThan(
        result.beforeAudit.simulation.peakCognitiveFatigue,
      );
      expect(result.afterAudit.simulation.estimatedCompletionRetention).toBeGreaterThan(
        result.beforeAudit.simulation.estimatedCompletionRetention,
      );
      expect(result.pacingHealthScoreDelta).toBeGreaterThan(0);
    });

    it("여백 최적화 재시뮬레이션에서 cramped-gutter-rhythm 0건을 달성한다", () => {
      const result = optimizeEpisodeGutterPacing(createFlawedEpisode());
      expect(result.crampedGutterFindingsBefore).toBeGreaterThan(0);
      expect(result.crampedGutterFindingsAfter).toBe(0);
      expect(result.afterAudit.findingCountsByCode["cramped-gutter-rhythm"]).toBe(0);
    });

    it("클리프행어 컷 직전에 정적 긴장 거터(Dramatic Pause Gutter)를 자동 배치한다", () => {
      const base = createBalancedEpisode();
      const tightCliff = base.cuts.map((c, idx) =>
        idx === base.cuts.length - 2 ? { ...c, gutterAfterPx: 80 } : c,
      );
      const result = optimizeEpisodeGutterPacing({ ...base, cuts: tightCliff });
      const penultimate = result.optimizedCuts[result.optimizedCuts.length - 2];

      expect(penultimate?.gutterAfterPx).toBeGreaterThanOrEqual(OPTIMIZED_DRAMATIC_PAUSE_GUTTER_PX);
      expect(
        result.adjustments.some((adj) => adj.reason === "cliffhanger-dramatic-pause-gutter"),
      ).toBe(true);
    });

    it("연속 고대사 피로벽 구간에 호흡 거터를 배치해 피로벽 결함을 해소한다", () => {
      const result = optimizeEpisodeGutterPacing(createFlawedEpisode());
      expect(result.beforeAudit.findingCountsByCode["text-density-fatigue-wall"]).toBeGreaterThan(0);
      expect(result.afterAudit.findingCountsByCode["text-density-fatigue-wall"]).toBe(0);
      expect(
        result.adjustments.some((adj) => adj.reason === "fatigue-wall-breath-gutter"),
      ).toBe(true);
    });

    it("maxGutterPx 상한을 준수하고 작가가 의도한 기존 넓은 거터를 축소하지 않는다", () => {
      const base = createBalancedEpisode();
      const wideIntentional = base.cuts.map((c, idx) =>
        idx === 4 ? { ...c, gutterAfterPx: 480 } : idx === 9 ? { ...c, gutterAfterPx: 90 } : c,
      );
      const result = optimizeEpisodeGutterPacing(
        { ...base, cuts: wideIntentional },
        { maxGutterPx: 300, dramaticPauseGutterPx: 300 },
      );

      expect(result.optimizedCuts[4]?.gutterAfterPx).toBe(480);
      expect(result.optimizedCuts[9]?.gutterAfterPx).toBe(300);
    });

    it("이미 균형 잡힌 회차에는 불필요한 여백 확장을 가하지 않는다", () => {
      const result = optimizeEpisodeGutterPacing(createBalancedEpisode());
      expect(result.adjustments).toHaveLength(0);
      expect(result.totalAddedGutterPx).toBe(0);
      expect(result.crampedGutterFindingsAfter).toBe(0);
    });
  });

  describe("4. 경계 조건 및 비정상 입력 방어", () => {
    it("빈 컷 배열을 예외 없이 안전 마감(fail-closed) 처리한다", () => {
      const empty: EpisodePacingInput = { episodeId: "ep-empty", cuts: [] };
      const sim = simulateEpisodeScrollRetention(empty);
      const audit = auditEpisodePacingAndCliffhanger(empty);
      const opt = optimizeEpisodeGutterPacing(empty);
      const svg = renderEpisodePacingCurvesSvg(audit);
      const report = summarizeEpisodePacingAuditKo(audit, opt);

      expect(sim.totalCutCount).toBe(0);
      expect(sim.estimatedRetentionCurve).toEqual([]);
      expect(sim.warnings.length).toBeGreaterThan(0);
      expect(audit.pacingGrade).toBe("D");
      expect(opt.adjustments).toEqual([]);
      expect(svg).toContain("<svg");
      expect(report).toContain("시뮬레이션 추정치");
    });

    it("단일 컷 에피소드도 유효한 [0, 1] 체류 수치와 SHA-256을 반환한다", () => {
      const single = auditEpisodePacingAndCliffhanger({
        episodeId: "ep-single",
        cuts: [
          makeCut({ cutId: "only", cutIndex: 0, gutterAfterPx: 0, narrativeBeatKind: "cliffhanger-reveal", tensionScore: 0.9 }),
        ],
      });
      expect(single.simulation.totalCutCount).toBe(1);
      expect(single.simulation.estimatedCompletionRetention).toBeGreaterThan(0);
      expect(single.simulation.estimatedCompletionRetention).toBeLessThanOrEqual(1);
      expect(single.pacingAuditSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    });

    it("NaN·Infinity·음수 및 잘못된 beat 입력을 경고와 함께 유한 범위로 보정한다", () => {
      const badBeat = "unknown-beat" as unknown as EpisodePacingCutSpec["narrativeBeatKind"];
      const sim = simulateEpisodeScrollRetention({
        episodeId: "ep-nan",
        viewport: { viewportWidthPx: Number.NaN, viewportHeightPx: -500, charsPerSec: Number.POSITIVE_INFINITY },
        cuts: [
          makeCut({
            cutId: "bad-1",
            cutIndex: 0,
            heightPx: Number.NaN,
            gutterAfterPx: -120,
            characterCountKo: Number.POSITIVE_INFINITY,
            balloonCount: -5,
            visualComplexity: 9,
            tensionScore: Number.NaN,
            narrativeBeatKind: badBeat,
          }),
        ],
      });

      expect(sim.warnings.length).toBeGreaterThan(0);
      const pt = sim.cutPoints[0];
      expect(pt).toBeDefined();
      expect(Number.isFinite(pt?.dwellSeconds ?? Number.NaN)).toBe(true);
      expect(Number.isFinite(pt?.cognitiveFatigue ?? Number.NaN)).toBe(true);
      expect(Number.isFinite(pt?.retentionAfterCut ?? Number.NaN)).toBe(true);
      expect(pt?.narrativeBeatKind).toBe("dialogue-exchange");
    });

    it("입력 배열 순서가 뒤섞여도 cutIndex 기준으로 동일한 결정론적 결과를 산출한다", () => {
      const ordered = createBalancedEpisode();
      const reversed: EpisodePacingInput = {
        ...ordered,
        cuts: [...ordered.cuts].reverse(),
      };
      const auditA = auditEpisodePacingAndCliffhanger(ordered);
      const auditB = auditEpisodePacingAndCliffhanger(reversed);

      expect(auditA.pacingAuditSha256Hex).toBe(auditB.pacingAuditSha256Hex);
      expect(auditA.simulation.estimatedCompletionRetention).toBe(
        auditB.simulation.estimatedCompletionRetention,
      );
    });

    it("극단적으로 큰 거터(3000px)가 입력돼도 체류율·피로도 경계([0, 1])가 무너지지 않는다", () => {
      const extreme = simulateEpisodeScrollRetention({
        episodeId: "ep-huge-gutter",
        cuts: [
          makeCut({ cutId: "h1", cutIndex: 0, gutterAfterPx: 3000, tensionScore: 0.7 }),
          makeCut({ cutId: "h2", cutIndex: 1, gutterAfterPx: 2500, tensionScore: 0.85, narrativeBeatKind: "cliffhanger-reveal" }),
        ],
      });
      for (const pt of extreme.cutPoints) {
        expect(pt.cognitiveFatigue).toBeGreaterThanOrEqual(0);
        expect(pt.cognitiveFatigue).toBeLessThanOrEqual(1);
        expect(pt.retentionAfterCut).toBeGreaterThanOrEqual(0);
        expect(pt.retentionAfterCut).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("5. 순수 OKLCH SVG, XSS 이스케이프 및 한국어 PD 브리프", () => {
    it("SVG가 순수 oklch(...) 색상만 사용하고 원시 hex·rgb·hsl을 전혀 포함하지 않는다", () => {
      const opt = optimizeEpisodeGutterPacing(createFlawedEpisode());
      const svg = renderEpisodePacingCurvesSvg(opt.beforeAudit, { optimizedComparison: opt });

      expect(svg).toMatch(/^<svg[\s>]/);
      expect(svg.trim().endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).toContain("시뮬레이션 추정치");
      expect(svg).toContain("피로벽 경고");
    });

    it("제목·에피소드 ID의 XML/XSS 특수문자 주입을 완전히 이스케이프한다", () => {
      const payload = `에피소드 <script>alert("xss")</script> & 'quote'`;
      const audit = auditEpisodePacingAndCliffhanger({
        ...createBalancedEpisode(),
        episodeId: `id" onload="evil()`,
        episodeTitle: payload,
      });
      const svg = renderEpisodePacingCurvesSvg(audit, { titleOverride: payload });

      expect(svg).not.toContain("<script>");
      expect(svg).not.toContain(`onload="evil()`);
      expect(svg).toContain("&lt;script&gt;");
      expect(escapePacingXml(`<a>&"'`)).toBe("&lt;a&gt;&amp;&quot;&apos;");
    });

    it("최적화 비교 옵션(optimizedComparison) 전달 시 개선 체류 오버레이와 상승폭 범례를 포함한다", () => {
      const opt = optimizeEpisodeGutterPacing(createFlawedEpisode());
      const svgBase = renderEpisodePacingCurvesSvg(opt.beforeAudit);
      const svgCompared = renderEpisodePacingCurvesSvg(opt.beforeAudit, { optimizedComparison: opt });

      expect(svgCompared).toContain("여백 최적화 후 체류");
      expect(svgBase).not.toContain("여백 최적화 후 체류");
    });

    it("빈 에피소드용 SVG도 순수 OKLCH 규격과 시뮬레이션 고지문을 준수한다", () => {
      const audit = auditEpisodePacingAndCliffhanger({ episodeId: "empty-svg", cuts: [] });
      const svg = renderEpisodePacingCurvesSvg(audit);
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).toContain("시뮬레이션 추정치");
    });

    it("한국어 PD 페이싱 브리프가 시뮬레이션 추정치 고지와 개선 비교를 자연스러운 한국어로 제공한다", () => {
      const opt = optimizeEpisodeGutterPacing(createFlawedEpisode());
      const brief = summarizeEpisodePacingAuditKo(opt.beforeAudit, opt);

      expect(brief).toContain("시뮬레이션 추정치(Simulation Estimate)");
      expect(brief).toContain("대사 과밀 피로벽");
      expect(brief).toContain("클리프행어 결말 약화");
      expect(brief).toContain("비파괴 여백·호흡 리플로우 개선 결과");
      expect(brief).toContain(opt.beforeAudit.pacingAuditSha256Hex);
      expect(brief).not.toContain("하는 것을 가능하게 합니다");
      expect(brief).not.toContain("직관적인 경험을 제공합니다");
      expect(brief).not.toContain("원활한 워크플로우를 보장합니다");
    });
  });

  describe("6. FIPS 180-4 SHA-256 및 결정론적 지문 검증", () => {
    it("NIST FIPS 180-4 표준 테스트 벡터(빈 문자열·'abc')와 한글 UTF-8 해시가 정확하다", () => {
      expect(sha256PacingUtf8Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256PacingUtf8Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(sha256PacingUtf8Hex("웹툰 클리프행어 페이싱")).toMatch(/^[0-9a-f]{64}$/);
    });

    it("정규 직렬화와 매니페스트 SHA-256이 객체 키 삽입 순서에 무관하다", () => {
      const objA = { b: 2, a: { y: true, x: -0 }, c: [1, 2] };
      const objB = { c: [1, 2], a: { x: 0, y: true }, b: 2 };
      expect(canonicalizePacingValue(objA)).toBe(canonicalizePacingValue(objB));
      expect(computePacingManifestSha256Hex(objA)).toBe(computePacingManifestSha256Hex(objB));
    });

    it("동일 입력 재실행 시 SHA-256 지문이 일치하고 컷 거터 1px 변경 시 즉시 달라진다", () => {
      const ep = createBalancedEpisode();
      const first = auditEpisodePacingAndCliffhanger(ep);
      const second = auditEpisodePacingAndCliffhanger(ep);
      const tweaked = auditEpisodePacingAndCliffhanger({
        ...ep,
        cuts: ep.cuts.map((c, idx) => (idx === 0 ? { ...c, gutterAfterPx: c.gutterAfterPx + 1 } : c)),
      });

      expect(first.pacingAuditSha256Hex).toBe(second.pacingAuditSha256Hex);
      expect(first.pacingAuditSha256Hex).not.toBe(tweaked.pacingAuditSha256Hex);
    });
  });
});
