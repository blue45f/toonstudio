import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOBILE_VIEWPORT_375X812,
  GENRE_SCROLL_TEMPO_PROFILES,
  analyzeScrollTensionRhythm,
  applyGutterReflowToCuts,
  planGutterPacingReflow,
  simulatePanelEyeFlow,
  verifyNonDestructiveArtworkIntegrity,
  type CutRole,
  type PanelEyeFlowInput,
  type ScrollCutSpec,
  type SpeechBalloonSpec,
} from "./index";

function makeBalloon(
  id: string,
  readingOrder: number,
  x: number,
  y: number,
  characterCount: number,
  extra?: Partial<SpeechBalloonSpec>,
): SpeechBalloonSpec {
  return { id, readingOrder, x, y, width: 130, height: 64, characterCount, ...extra };
}

function makeCut(
  cutId: string,
  heightPx: number,
  gutterAfterPx: number,
  dialogueCharCount: number,
  balloonCount: number,
  role: CutRole,
  extra?: Partial<ScrollCutSpec>,
): ScrollCutSpec {
  return { cutId, heightPx, gutterAfterPx, dialogueCharCount, balloonCount, role, ...extra };
}

describe("wave52: eye-flow-saccade-simulator", () => {
  it("좌→우·상→하 말풍선과 자연스러운 말풍선→화자 동선은 역주행 없이 높은 점수를 받는다", () => {
    const report = simulatePanelEyeFlow({
      panelId: "cut-natural-1",
      widthPx: 375,
      heightPx: 620,
      balloons: [
        makeBalloon("b1", 1, 24, 32, 14, { width: 150, height: 70, speakerAnchorId: "char-a", tailTarget: { x: 130, y: 185 } }),
        makeBalloon("b2", 2, 185, 260, 18, { width: 160, height: 76, speakerAnchorId: "char-b", tailTarget: { x: 245, y: 420 } }),
      ],
      characterAnchors: [
        { id: "char-a", x: 130, y: 190, gazeDx: 0.6, gazeDy: 0.8 },
        { id: "char-b", x: 250, y: 430, gazeDx: -0.2, gazeDy: 0.98 },
      ],
    });

    expect(report.backtrackErrors).toHaveLength(0);
    expect(report.naturalSpeakerLinkRate).toBe(1);
    expect(report.speakerFlows.every((flow) => flow.isNaturalFlow)).toBe(true);
    expect(report.flowSmoothnessScore).toBeGreaterThanOrEqual(85);
    expect(report.segments.every((seg) => !seg.isBacktrack)).toBe(true);
  });

  it("후속 말풍선이 선행 말풍선보다 위에 배치되면 세로 역주행(vertical-upward)을 탐지한다", () => {
    const report = simulatePanelEyeFlow({
      panelId: "cut-upward-backtrack",
      widthPx: 375,
      heightPx: 540,
      balloons: [makeBalloon("b1", 1, 40, 310, 12), makeBalloon("b2", 2, 190, 120, 14)],
    });

    const verticalErr = report.backtrackErrors.find((err) => err.kind === "vertical-upward");
    expect(verticalErr?.severity).toBe("critical");
    expect(verticalErr?.dy).toBeLessThan(-100);
    expect(report.flowSmoothnessScore).toBeLessThan(85);
  });

  it("같은 행에서 LTR 읽기 방향을 거스르는 우→좌 배치를 탐지하고 RTL에서는 정상으로 판단한다", () => {
    const baseInput: PanelEyeFlowInput = {
      panelId: "cut-row-flow",
      widthPx: 375,
      heightPx: 420,
      balloons: [makeBalloon("b1", 1, 220, 80, 10), makeBalloon("b2", 2, 30, 92, 11)],
    };
    const ltrReport = simulatePanelEyeFlow({ ...baseInput, readingDirection: "ltr" });
    const rtlReport = simulatePanelEyeFlow({ ...baseInput, readingDirection: "rtl" });

    expect(ltrReport.backtrackErrors.some((e) => e.kind === "horizontal-against-reading")).toBe(true);
    expect(rtlReport.backtrackErrors.some((e) => e.kind === "horizontal-against-reading")).toBe(false);
  });

  it("화자가 말풍선보다 한참 위쪽에 있으면 화자 우회(speaker-detour) 오류를 탐지한다", () => {
    const report = simulatePanelEyeFlow({
      panelId: "cut-speaker-above",
      widthPx: 375,
      heightPx: 520,
      balloons: [makeBalloon("b1", 1, 110, 340, 16, { speakerAnchorId: "hero", tailTarget: { x: 190, y: 150 } })],
      characterAnchors: [{ id: "hero", x: 190, y: 140, gazeDx: 0, gazeDy: 1 }],
    });

    expect(report.naturalSpeakerLinkRate).toBe(0);
    expect(report.backtrackErrors.some((e) => e.kind === "speaker-detour")).toBe(true);
  });

  it("캐릭터 시선 벡터가 행동선 수렴 포컬 포인트를 향하면 해당 포컬을 즉시 시선 경로에 연결한다", () => {
    const report = simulatePanelEyeFlow({
      panelId: "cut-gaze-to-action",
      widthPx: 375,
      heightPx: 600,
      balloons: [makeBalloon("b1", 1, 30, 30, 8, { speakerAnchorId: "fighter" })],
      characterAnchors: [{ id: "fighter", x: 100, y: 180, gazeDx: 0.78, gazeDy: 0.62, gazeRangePx: 300 }],
      actionFocals: [
        { id: "impact-1", startX: 120, startY: 200, endX: 290, endY: 330, contrastScore: 0.95, kind: "action-line" },
      ],
    });

    expect(report.nodes.map((n) => n.id)).toEqual(["b1", "fighter", "impact-1"]);
    const gazeSeg = report.segments.find((s) => s.fromId === "fighter" && s.toId === "impact-1");
    expect(gazeSeg?.gazeAlignmentScore).toBeGreaterThan(0.9);
  });

  it("캐릭터 시선 벡터가 다음 필수 주목 지점과 반대 방향이면 gaze-conflict를 경고한다", () => {
    const report = simulatePanelEyeFlow({
      panelId: "cut-gaze-conflict",
      widthPx: 375,
      heightPx: 500,
      balloons: [
        makeBalloon("b1", 1, 20, 30, 10, { speakerAnchorId: "char-left" }),
        makeBalloon("b2", 2, 220, 230, 12),
      ],
      characterAnchors: [{ id: "char-left", x: 80, y: 180, gazeDx: -0.95, gazeDy: -0.3 }],
    });

    expect(report.backtrackErrors.some((e) => e.kind === "gaze-conflict")).toBe(true);
  });

  it("정체 히트맵 Float32Array는 0..1로 정규화되고 밀집 영역에서 congestionZones를 검출한다", () => {
    const report = simulatePanelEyeFlow({
      panelId: "cut-crowded-hotspot",
      widthPx: 375,
      heightPx: 600,
      heatmapCols: 12,
      heatmapRows: 18,
      balloons: [
        makeBalloon("b1", 1, 110, 180, 36),
        makeBalloon("b2", 2, 130, 205, 38),
        makeBalloon("b3", 3, 120, 225, 34),
      ],
    });

    expect(report.heatmap.values).toBeInstanceOf(Float32Array);
    expect(report.heatmap.values.length).toBe(12 * 18);
    let maxVal = 0;
    for (let i = 0; i < report.heatmap.values.length; i += 1) {
      const v = report.heatmap.values[i] ?? -1;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > maxVal) maxVal = v;
    }
    expect(maxVal).toBeCloseTo(1, 5);
    expect(report.heatmap.congestionZones.length).toBeGreaterThan(0);
  });

  it("요소가 없는 빈 컷에서도 NaN 없이 0으로 채워진 히트맵과 만점을 반환한다", () => {
    const report = simulatePanelEyeFlow({ panelId: "cut-empty", widthPx: 375, heightPx: 400, balloons: [] });

    expect(report.nodes).toHaveLength(0);
    expect(report.flowSmoothnessScore).toBe(100);
    expect(report.heatmap.rawMaxDensity).toBe(0);
    expect(Array.from(report.heatmap.values).every((v) => v === 0)).toBe(true);
  });
});

describe("wave52: scroll-tension-rhythm-analyzer", () => {
  const sampleCuts: readonly ScrollCutSpec[] = [
    makeCut("c1", 500, 120, 28, 2, "setup"),
    makeCut("c2", 520, 140, 34, 2, "dialogue"),
  ];

  it("375×812 기본 뷰포트에서 로맨스 장르가 액션 장르보다 동일 컷 체류 시간이 길다", () => {
    const action = analyzeScrollTensionRhythm({ episodeId: "ep-action", genre: "action", cuts: sampleCuts });
    const romance = analyzeScrollTensionRhythm({ episodeId: "ep-romance", genre: "romance", cuts: sampleCuts });

    expect(action.viewport).toEqual(DEFAULT_MOBILE_VIEWPORT_375X812);
    expect(GENRE_SCROLL_TEMPO_PROFILES.action.baseThumbScrollPxPerSec).toBeGreaterThan(
      GENRE_SCROLL_TEMPO_PROFILES.romance.baseThumbScrollPxPerSec,
    );
    expect(romance.totalEstimatedReadTimeSec).toBeGreaterThan(action.totalEstimatedReadTimeSec);
  });

  it("대사 글자 수와 말풍선 수가 늘어날수록 컷 체류 시간이 증가하고 긴장감 곡선은 0..1에 유지된다", () => {
    const report = analyzeScrollTensionRhythm({
      episodeId: "ep-dwell-scale",
      genre: "slice-of-life",
      cuts: [makeCut("light", 480, 120, 8, 1, "setup"), makeCut("heavy", 480, 140, 68, 3, "dialogue")],
    });

    expect(report.cutMetrics[1]?.dwellTimeSec ?? 0).toBeGreaterThan(report.cutMetrics[0]?.dwellTimeSec ?? 0);
    expect(report.tensionCurve.every((score) => score >= 0 && score <= 1)).toBe(true);
  });

  it("스릴러 반전 컷 직전 여백이 부족하면 pre-twist-deflation-tight critical 오류를 진단한다", () => {
    const report = analyzeScrollTensionRhythm({
      episodeId: "ep-thriller-tight",
      genre: "thriller",
      cuts: [makeCut("buildup", 520, 70, 18, 1, "pre-twist-buildup"), makeCut("twist", 680, 180, 10, 1, "twist-reveal")],
    });

    const issue = report.issues.find((i) => i.kind === "pre-twist-deflation-tight");
    expect(issue?.cutId).toBe("buildup");
    expect(issue?.severity).toBe("critical");
    expect(issue?.recommendedGutterPx).toBeGreaterThanOrEqual(380);
  });

  it("반전 컷 직전 여백이 과도하게 길면 pre-twist-deflation-excessive 김빠짐을 진단한다", () => {
    const report = analyzeScrollTensionRhythm({
      episodeId: "ep-thriller-overlong",
      genre: "thriller",
      cuts: [makeCut("buildup", 460, 980, 16, 1, "pre-twist-buildup"), makeCut("cliff", 640, 160, 8, 1, "cliffhanger")],
    });

    const issue = report.issues.find((i) => i.kind === "pre-twist-deflation-excessive");
    expect(issue?.severity).toBe("critical");
    expect(issue?.recommendedGutterPx).toBeLessThan(980);
  });

  it("한 화면에 과다한 대사와 좁은 여백이 몰리면 suffocating-crowding을 진단한다", () => {
    const report = analyzeScrollTensionRhythm({
      episodeId: "ep-crowded",
      genre: "romance",
      cuts: [
        makeCut("c1", 320, 30, 75, 3, "dialogue"),
        makeCut("c2", 320, 36, 72, 3, "dialogue"),
        makeCut("c3", 380, 160, 20, 1, "emotional-beat"),
      ],
    });

    const crowding = report.issues.filter((i) => i.kind === "suffocating-crowding");
    expect(crowding.length).toBeGreaterThanOrEqual(1);
    expect(crowding[0]?.recommendedGutterPx).toBeGreaterThan(160);
  });

  it("액션 연타 구간 사이에 여백이 과다하면 action-momentum-drag를 진단한다", () => {
    const report = analyzeScrollTensionRhythm({
      episodeId: "ep-action-drag",
      genre: "action",
      cuts: [makeCut("punch-1", 420, 210, 6, 1, "action-combo"), makeCut("punch-2", 440, 40, 4, 1, "action-combo")],
    });

    const drag = report.issues.find((i) => i.kind === "action-momentum-drag");
    expect(drag?.cutId).toBe("punch-1");
    expect(drag?.recommendedGutterPx).toBeLessThanOrEqual(60);
  });

  it("시선 역주행 마찰 계수가 높을수록 체류 시간이 증가하고 일반 구간 과다 공백(dead-air-gutter)을 진단한다", () => {
    const clean = analyzeScrollTensionRhythm({
      episodeId: "ep-clean",
      genre: "slice-of-life",
      cuts: [makeCut("c1", 460, 460, 20, 1, "setup", { eyeFlowFrictionRatio: 0 }), makeCut("c2", 460, 120, 20, 1, "dialogue")],
    });
    const rough = analyzeScrollTensionRhythm({
      episodeId: "ep-rough",
      genre: "slice-of-life",
      cuts: [makeCut("c1", 460, 460, 20, 1, "setup", { eyeFlowFrictionRatio: 0.7 }), makeCut("c2", 460, 120, 20, 1, "dialogue")],
    });

    expect(rough.cutMetrics[0]?.dwellTimeSec ?? 0).toBeGreaterThan(clean.cutMetrics[0]?.dwellTimeSec ?? 0);
    expect(clean.issues.some((i) => i.kind === "dead-air-gutter")).toBe(true);
  });
});

describe("wave52: gutter-pacing-auto-reflow-planner & pipeline", () => {
  it("스릴러 반전 컷 직전 부족 여백을 자동 확대하고 암전 호흡 그라데이션을 부여해 건강도를 회복한다", () => {
    const plan = planGutterPacingReflow({
      episodeId: "ep-thriller-reflow",
      genre: "thriller",
      cuts: [
        makeCut("buildup", 540, 65, 20, 1, "pre-twist-buildup", { widthPx: 375 }),
        makeCut("twist", 720, 180, 12, 1, "twist-reveal", { widthPx: 375 }),
      ],
    });

    const op = plan.operations.find((o) => o.cutId === "buildup");
    expect(op?.action).toBe("expand-pre-twist");
    expect(op?.afterGutterPx).toBeGreaterThanOrEqual(450);
    expect(op?.gradientGutter?.enabled).toBe(true);
    expect(op?.gradientGutter?.toColorHex).toBe("#14161D");
    expect(plan.artworkIntegrity.preserved).toBe(true);
    expect(plan.afterReport.issues).toHaveLength(0);
    expect(plan.afterReport.rhythmHealthScore).toBeGreaterThan(plan.beforeReport.rhythmHealthScore);
    expect(plan.afterReport.tensionCurve[0] ?? 0).toBeGreaterThan(plan.beforeReport.tensionCurve[0] ?? 0);
  });

  it("반전 컷 직전 과다 여백을 적정 긴장 범위로 자동 트리밍한다", () => {
    const plan = planGutterPacingReflow({
      episodeId: "ep-twist-trim",
      genre: "thriller",
      cuts: [makeCut("buildup", 480, 960, 14, 1, "pre-twist-buildup"), makeCut("twist", 660, 160, 8, 1, "twist-reveal")],
    });

    const op = plan.operations.find((o) => o.cutId === "buildup");
    expect(op?.action).toBe("trim-pre-twist");
    expect(op?.deltaGutterPx).toBeLessThan(0);
    expect(plan.afterReport.issues).toHaveLength(0);
  });

  it("액션 연타 구간의 과다 여백을 압축해 타격 속도감과 총 높이를 개선한다", () => {
    const plan = planGutterPacingReflow({
      episodeId: "ep-action-compress",
      genre: "action",
      cuts: [
        makeCut("combo-1", 410, 230, 5, 1, "action-combo"),
        makeCut("combo-2", 430, 220, 4, 1, "action-combo"),
        makeCut("combo-3", 480, 110, 8, 1, "action-combo"),
      ],
    });

    expect(plan.operations).toHaveLength(2);
    expect(plan.operations.every((op) => op.action === "compress-action-combo")).toBe(true);
    expect(plan.netHeightDeltaPx).toBeLessThan(-250);
    expect(plan.afterReport.issues).toHaveLength(0);
    expect(plan.artworkIntegrity.preserved).toBe(true);
  });

  it("숨 막히는 과밀 구간의 여백을 넓히고 완만한 호흡 그라데이션을 추가한다", () => {
    const plan = planGutterPacingReflow({
      episodeId: "ep-crowd-relief",
      genre: "romance",
      cuts: [makeCut("dense-1", 340, 28, 84, 3, "dialogue"), makeCut("dense-2", 360, 180, 68, 3, "dialogue")],
    });

    const op = plan.operations.find((o) => o.cutId === "dense-1");
    expect(op?.action).toBe("expand-breathing");
    expect(op?.afterGutterPx).toBeGreaterThan(op?.beforeGutterPx ?? 0);
    expect(op?.gradientGutter?.easing).toBe("ease-out-calm");
    expect(plan.artworkIntegrity.preserved).toBe(true);
  });

  it("컷 내부 아트워크 비훼손을 보장하며 치수 변조가 생기면 검증기가 즉시 적발한다", () => {
    const originalCuts: readonly ScrollCutSpec[] = [
      makeCut("art-1", 613, 50, 18, 1, "pre-twist-buildup", { widthPx: 375 }),
      makeCut("art-2", 777, 180, 10, 1, "twist-reveal", { widthPx: 375 }),
    ];
    const plan = planGutterPacingReflow({ episodeId: "ep-integrity", genre: "thriller", cuts: originalCuts });

    expect(plan.artworkIntegrity.preserved).toBe(true);
    expect(plan.reflowedLayout[0]?.artworkHeightPx).toBe(613);
    expect(plan.reflowedLayout[1]?.artworkHeightPx).toBe(777);

    const patchedCuts = applyGutterReflowToCuts(originalCuts, plan.operations);
    expect(patchedCuts[0]?.heightPx).toBe(613);
    expect(patchedCuts[1]?.heightPx).toBe(777);

    const tampered = plan.reflowedLayout.map((item, idx) =>
      idx === 0 ? { ...item, artworkHeightPx: item.artworkHeightPx - 12 } : item,
    );
    const check = verifyNonDestructiveArtworkIntegrity(originalCuts, tampered);
    expect(check.preserved).toBe(false);
    expect(check.violations.length).toBeGreaterThan(0);
  });

  it("시선 시뮬레이터→긴장감 분석→자동 재배치 파이프라인이 연동되며 균형 잡힌 컷은 불필요 패치를 만들지 않는다", () => {
    const eyeReport = simulatePanelEyeFlow({
      panelId: "combo-cut",
      widthPx: 375,
      heightPx: 500,
      balloons: [makeBalloon("b1", 1, 30, 280, 15), makeBalloon("b2", 2, 180, 90, 15)],
    });
    expect(eyeReport.frictionRatio).toBeGreaterThan(0);

    const balancedPlan = planGutterPacingReflow({
      episodeId: "ep-already-balanced",
      genre: "action",
      cuts: [
        makeCut("combo-cut", 500, 42, 30, 2, "action-combo", { eyeFlowFrictionRatio: eyeReport.frictionRatio }),
        makeCut("combo-next", 460, 380, 12, 1, "pre-twist-buildup"),
        makeCut("reveal", 640, 120, 8, 1, "twist-reveal"),
      ],
    });

    expect(balancedPlan.operations).toHaveLength(0);
    expect(balancedPlan.afterReport.issues).toHaveLength(0);
    expect(balancedPlan.artworkIntegrity.preserved).toBe(true);
  });
});
