import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOBILE_VIEWPORT_PX,
  LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
  PACING_TWIN_DISCLAIMER_KO,
  READER_PACING_ARCHETYPES,
  auditBalloonFirstGazePriority,
  buildPacingRehearsalReport,
  computePanelVisualSaliencyMap,
  renderSaliencyScanpathOverlaySvg,
  resolveKoreanQuadrantLabel,
  simulateEpisodeReaderPacingTwin,
  type EpisodePacingCutSpec,
  type PanelRectPx,
  type RgbaPanelBuffer,
  type SpeechBalloonRegionInput,
} from "./index";

type RgbTuple = readonly [number, number, number];

function createSolidPanel(width: number, height: number, fill: RgbTuple): RgbaPanelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4;
    data[off] = fill[0];
    data[off + 1] = fill[1];
    data[off + 2] = fill[2];
    data[off + 3] = 255;
  }
  return { width, height, data };
}

function setPixel(panel: RgbaPanelBuffer, x: number, y: number, c: RgbTuple): void {
  if (x < 0 || x >= panel.width || y < 0 || y >= panel.height) return;
  const off = (y * panel.width + x) * 4;
  panel.data[off] = c[0];
  panel.data[off + 1] = c[1];
  panel.data[off + 2] = c[2];
  panel.data[off + 3] = 255;
}

function drawCircle(panel: RgbaPanelBuffer, cx: number, cy: number, radius: number, c: RgbTuple): void {
  const rSq = radius * radius;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(panel.height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(panel.width - 1, Math.ceil(cx + radius)); x += 1) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rSq) setPixel(panel, x, y, c);
    }
  }
}

function drawRect(panel: RgbaPanelBuffer, r: PanelRectPx, c: RgbTuple): void {
  for (let y = Math.max(0, Math.floor(r.y)); y <= Math.min(panel.height - 1, Math.floor(r.y + r.height)); y += 1) {
    for (let x = Math.max(0, Math.floor(r.x)); x <= Math.min(panel.width - 1, Math.floor(r.x + r.width)); x += 1) {
      setPixel(panel, x, y, c);
    }
  }
}

function drawBalloon(panel: RgbaPanelBuffer, rect: PanelRectPx, fill: RgbTuple, border: RgbTuple, text: RgbTuple): void {
  drawRect(panel, rect, border);
  drawRect(panel, { x: rect.x + 2, y: rect.y + 2, width: Math.max(1, rect.width - 4), height: Math.max(1, rect.height - 4) }, fill);
  for (let row = 0; row < 2; row += 1) {
    const ty = Math.round(rect.y + rect.height * (0.35 + row * 0.28));
    for (let x = Math.round(rect.x + 5); x < Math.round(rect.x + rect.width - 5); x += 2) {
      setPixel(panel, x, ty, text);
      setPixel(panel, x, ty + 1, text);
    }
  }
}

function drawCheckerboard(panel: RgbaPanelBuffer, r: PanelRectPx, tile: number, c1: RgbTuple, c2: RgbTuple): void {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  for (let y = y0; y <= Math.min(panel.height - 1, Math.floor(r.y + r.height)); y += 1) {
    for (let x = x0; x <= Math.min(panel.width - 1, Math.floor(r.x + r.width)); x += 1) {
      const parity = (Math.floor((x - x0) / tile) + Math.floor((y - y0) / tile)) % 2;
      setPixel(panel, x, y, parity === 0 ? c1 : c2);
    }
  }
}

function buildBalancedPanel(): { readonly panel: RgbaPanelBuffer; readonly balloons: readonly SpeechBalloonRegionInput[] } {
  const panel = createSolidPanel(120, 120, [92, 98, 95]);
  const primaryRect: PanelRectPx = { x: 14, y: 12, width: 46, height: 28 };
  drawBalloon(panel, primaryRect, [248, 248, 245], [28, 30, 32], [20, 22, 24]);
  drawCircle(panel, 78, 86, 16, [104, 110, 107]);
  return { panel, balloons: [{ id: "balloon-1", readingOrder: 1, isPrimary: true, bounds: primaryRect, textCharCount: 16 }] };
}

function buildDistractedPanel(corner: "bottom-right" | "top-right"): {
  readonly panel: RgbaPanelBuffer;
  readonly balloons: readonly SpeechBalloonRegionInput[];
} {
  const panel = createSolidPanel(120, 120, [118, 118, 118]);
  const dimBalloon: PanelRectPx = { x: 10, y: 12, width: 42, height: 24 };
  drawBalloon(panel, dimBalloon, [128, 128, 128], [110, 110, 110], [108, 108, 108]);
  const clutter: PanelRectPx = corner === "bottom-right" ? { x: 74, y: 74, width: 38, height: 38 } : { x: 74, y: 8, width: 38, height: 38 };
  drawCheckerboard(panel, clutter, 3, [255, 255, 255], [0, 0, 0]);
  return { panel, balloons: [{ id: "balloon-dim", readingOrder: 1, isPrimary: true, bounds: dimBalloon, textCharCount: 14 }] };
}

describe("Wave 86 — 프라이버시 제로 트래킹 및 로컬 추정치 계약", () => {
  it("시각 현저성 결과는 개인정보 미수집·외부 미전송·로컬 모델 출처를 명시한다", () => {
    const panel = createSolidPanel(64, 64, [24, 24, 28]);
    drawCircle(panel, 32, 32, 6, [250, 250, 250]);
    const result = computePanelVisualSaliencyMap(panel);
    expect(result.readerPiiCollected).toBe(false);
    expect(result.externalTelemetryUpload).toBe(false);
    expect(result.modelSource).toBe("local-itti-koch-spectral-residual");
    expect(result.isSimulationEstimate).toBe(true);
    expect(result.privacy).toEqual(LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE);
  });

  it("감사기·리듬 트윈·SVG 익스포터·스코어카드 전 구간이 비실측 추정치와 무수집 계약을 유지한다", () => {
    const { panel, balloons } = buildBalancedPanel();
    const audit = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    const overlay = renderSaliencyScanpathOverlaySvg({ saliency: audit.saliency, audit, speechBalloons: balloons });
    const pacing = simulateEpisodeReaderPacingTwin({
      episodeId: "ep-privacy-check",
      cuts: [{ cutId: "c1", panelHeightPx: 540, whitespaceBeforePx: 100, dialogueCharCount: 24, visualComplexityScore: 0.4 }],
    });
    const report = buildPacingRehearsalReport({ pacing, cutGazeAudits: [{ cutId: "c1", audit }] });

    expect(audit.readerPiiCollected).toBe(false);
    expect(audit.externalTelemetryUpload).toBe(false);
    expect(audit.isSimulationEstimate).toBe(true);
    expect(overlay.readerPiiCollected).toBe(false);
    expect(overlay.externalTelemetryUpload).toBe(false);
    expect(overlay.isSimulationEstimate).toBe(true);
    expect(pacing.readerPiiCollected).toBe(false);
    expect(pacing.externalTelemetryUpload).toBe(false);
    expect(pacing.isSimulationEstimate).toBe(true);
    expect(pacing.disclaimerKo).toBe(PACING_TWIN_DISCLAIMER_KO);
    expect(report.readerPiiCollected).toBe(false);
    expect(report.externalTelemetryUpload).toBe(false);
    expect(report.isSimulationEstimate).toBe(true);
    expect(report.summaryMarkdownKo).toContain("실측 독자 로그가 아닌");
  });

  it("유효하지 않은 컷 해상도나 짧은 RGBA 버퍼는 예외를 발생시킨다", () => {
    expect(() => computePanelVisualSaliencyMap({ width: 2, height: 2, data: new Uint8ClampedArray(16) })).toThrow(/최소 4×4/u);
    expect(() => computePanelVisualSaliencyMap({ width: 16, height: 16, data: new Uint8ClampedArray(32) })).toThrow(/RGBA 버퍼 길이가 부족/u);
  });
});

describe("Wave 86 — 시각 현저성 및 IOR 예측 스캔패스", () => {
  it("균일한 어두운 배경 위 고대비 밝은 표적이 1순위 고정점을 6px 이내로 포착하고 히트맵이 [0, 1]에 정규화된다", () => {
    const panel = createSolidPanel(96, 96, [18, 20, 24]);
    drawCircle(panel, 68, 30, 6, [252, 252, 248]);
    const result = computePanelVisualSaliencyMap(panel, { maxFixations: 4 });
    const first = result.scanpath[0];
    expect(first).toBeDefined();
    if (first) {
      expect(Math.hypot(first.x - 68, first.y - 30)).toBeLessThan(6);
      expect(first.rank).toBe(1);
      expect(first.quadrantKo).toBe("우측 상단");
    }
    let maxVal = -Infinity;
    for (let i = 0; i < result.heatmap.length; i += 1) {
      const v = result.heatmap[i] ?? 0;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > maxVal) maxVal = v;
    }
    expect(maxVal).toBeCloseTo(1, 3);
  });

  it("동일 휘도 조건의 적-녹(R-G) 색채 대립 표적도 1순위 고정점으로 6px 이내 포착한다", () => {
    const panel = createSolidPanel(96, 96, [24, 152, 40]);
    drawCircle(panel, 28, 66, 7, [235, 58, 52]);
    const result = computePanelVisualSaliencyMap(panel);
    const first = result.scanpath[0];
    expect(first).toBeDefined();
    if (first) expect(Math.hypot(first.x - 28, first.y - 66)).toBeLessThan(6);
    expect(result.channelSummary.colorOpponencyMean).toBeGreaterThan(0);
  });

  it("동일 휘도 조건의 청-황(B-Y) 색채 대립 표적도 1순위 고정점으로 6px 이내 포착한다", () => {
    const panel = createSolidPanel(96, 96, [156, 150, 26]);
    drawCircle(panel, 70, 68, 7, [48, 96, 250]);
    const result = computePanelVisualSaliencyMap(panel);
    const first = result.scanpath[0];
    expect(first).toBeDefined();
    if (first) expect(Math.hypot(first.x - 70, first.y - 68)).toBeLessThan(6);
  });

  it("대비가 전혀 없는 단색 컷에서는 허위 고정점이나 NaN 없이 빈 스캔패스를 반환한다", () => {
    const result = computePanelVisualSaliencyMap(createSolidPanel(64, 64, [120, 120, 120]));
    expect(result.peakSaliency).toBe(0);
    expect(result.scanpath).toHaveLength(0);
    expect(result.heatmap.every((v) => v === 0)).toBe(true);
  });

  it("억제 반환(IOR)이 연속 고정점 간 최소 IOR 반경 이상 이격을 보장하며 두 표적을 순서대로 방문한다", () => {
    const panel = createSolidPanel(120, 120, [16, 18, 22]);
    drawCircle(panel, 28, 28, 7, [255, 255, 255]);
    drawCircle(panel, 92, 92, 6, [205, 205, 210]);
    const iorRadiusPx = 22;
    const result = computePanelVisualSaliencyMap(panel, { maxFixations: 4, iorRadiusPx });
    expect(result.scanpath.length).toBeGreaterThanOrEqual(2);
    const f0 = result.scanpath[0];
    const f1 = result.scanpath[1];
    expect(f0).toBeDefined();
    expect(f1).toBeDefined();
    if (f0 && f1) {
      expect(Math.hypot(f1.x - f0.x, f1.y - f0.y)).toBeGreaterThanOrEqual(iorRadiusPx);
      expect(Math.hypot(f0.x - 28, f0.y - 28)).toBeLessThan(6);
      expect(Math.hypot(f1.x - 92, f1.y - 92)).toBeLessThan(6);
    }
    for (let i = 0; i < result.scanpath.length; i += 1) {
      for (let j = i + 1; j < result.scanpath.length; j += 1) {
        const a = result.scanpath[i];
        const b = result.scanpath[j];
        if (a && b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(iorRadiusPx);
      }
    }
  });

  it("고해상도 대형 컷(320×480)을 내부 다운샘플링해도 1순위 고정점을 원본 좌표로 정확히 복원한다", () => {
    const panel = createSolidPanel(320, 480, [25, 28, 34]);
    drawCircle(panel, 240, 120, 18, [255, 250, 235]);
    const result = computePanelVisualSaliencyMap(panel, { workingMaxDim: 96 });
    expect(result.sourceWidth).toBe(320);
    expect(Math.max(result.heatmapWidth, result.heatmapHeight)).toBeLessThanOrEqual(96);
    const first = result.scanpath[0];
    expect(first).toBeDefined();
    if (first) expect(Math.hypot(first.x - 240, first.y - 120)).toBeLessThan(8);
  });

  it("인물 얼굴 앵커가 실제 대비를 가질 때 character-face로 분류하고 좌표 구역명을 매핑한다", () => {
    const panel = createSolidPanel(100, 100, [42, 46, 52]);
    drawCircle(panel, 50, 50, 13, [232, 206, 186]);
    drawCircle(panel, 45, 47, 2, [24, 24, 28]);
    drawCircle(panel, 55, 47, 2, [24, 24, 28]);
    const result = computePanelVisualSaliencyMap(panel, {
      faceAnchors: [{ id: "hero-face", bounds: { x: 35, y: 34, width: 30, height: 32 }, eyeLineYRatio: 0.42, prominence: 1 }],
    });
    expect(result.scanpath[0]?.matchedTargetKind).toBe("character-face");
    expect(result.scanpath[0]?.matchedTargetId).toBe("hero-face");
    expect(resolveKoreanQuadrantLabel(0.5, 0.5)).toBe("화면 중앙");
    expect(resolveKoreanQuadrantLabel(0.15, 0.85)).toBe("좌측 하단");
  });
});

describe("Wave 86 — 말풍선 대 고대비 배경 시선 탈취 감사기", () => {
  it("희미한 말풍선과 우측 하단 고대비 흑백 체커보드가 경쟁하면 배경 시선 탈취를 탐지하고 한글 가이드를 제공한다", () => {
    const { panel, balloons } = buildDistractedPanel("bottom-right");
    const audit = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    expect(audit.backgroundHijackDetected).toBe(true);
    expect(audit.severity).toBe("hijack");
    expect(audit.balloonGazeRank).not.toBe(1);
    expect(audit.distractionRatio).toBeGreaterThan(1.15);
    expect(audit.guidanceKo).toContain("우측 하단");
    expect(audit.guidanceKo).toContain("말풍선");
  });

  it("깨끗하고 균형 잡힌 말풍선 컷에서는 배경 시선 탈취 없이 1순위 말풍선 안착으로 통과한다", () => {
    const { panel, balloons } = buildBalancedPanel();
    const audit = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    expect(audit.backgroundHijackDetected).toBe(false);
    expect(audit.severity).toBe("pass");
    expect(audit.balloonGazeRank).toBe(1);
    expect(audit.firstFixationTargetKind).toBe("speech-balloon");
    expect(audit.primaryBalloonPeakSaliency).toBeGreaterThan(0.7);
  });

  it("우측 상단 고대비 배경 잡음에 대해서는 동적으로 '우측 상단' 구역 경고를 출력한다", () => {
    const { panel, balloons } = buildDistractedPanel("top-right");
    const audit = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    expect(audit.backgroundHijackDetected).toBe(true);
    expect(audit.guidanceKo).toContain("우측 상단");
    expect(audit.backgroundPeakPoint?.quadrantKo).toBe("우측 상단");
  });

  it("사전 계산된 saliency 주입과 원본 panel 직접 주입이 동일한 감사 판정을 산출한다", () => {
    const { panel, balloons } = buildDistractedPanel("bottom-right");
    const direct = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    const precomputed = computePanelVisualSaliencyMap(panel, { speechBalloons: balloons });
    const fromPrecomputed = auditBalloonFirstGazePriority({ saliency: precomputed, speechBalloons: balloons });
    expect(fromPrecomputed.backgroundHijackDetected).toBe(direct.backgroundHijackDetected);
    expect(fromPrecomputed.balloonGazeRank).toBe(direct.balloonGazeRank);
    expect(fromPrecomputed.distractionRatio).toBe(direct.distractionRatio);
  });
});

describe("Wave 86 — 세로 스크롤 리듬·체류 시간·반전 호흡 리허설 트윈", () => {
  it("3종 합성 독자 아키타입별 감상 시간이 단조 증가하며 scrollY 속도 곡선을 산출한다", () => {
    const cuts: EpisodePacingCutSpec[] = [
      { cutId: "c1", panelHeightPx: 520, whitespaceBeforePx: 90, dialogueCharCount: 28, visualComplexityScore: 0.4 },
      { cutId: "c2", panelHeightPx: 680, whitespaceBeforePx: 140, dialogueCharCount: 42, visualComplexityScore: 0.65 },
      { cutId: "c3", panelHeightPx: 600, whitespaceBeforePx: 300, dialogueCharCount: 12, visualComplexityScore: 0.55, isTwistReveal: true },
    ];
    const sim = simulateEpisodeReaderPacingTwin({ episodeId: "ep-01", cuts });
    expect(sim.viewport).toEqual(DEFAULT_MOBILE_VIEWPORT_PX);
    expect(sim.archetypeSimulations).toHaveLength(3);
    const skimmer = sim.archetypeSimulations.find((a) => a.archetype.id === "fast-commuter-skimmer");
    const standard = sim.archetypeSimulations.find((a) => a.archetype.id === "standard-immersed-reader");
    const savoring = sim.archetypeSimulations.find((a) => a.archetype.id === "detail-savoring-reader");
    expect(skimmer && standard && savoring).toBeTruthy();
    if (skimmer && standard && savoring) {
      expect(skimmer.totalReadTimeMs).toBeLessThan(standard.totalReadTimeMs);
      expect(standard.totalReadTimeMs).toBeLessThan(savoring.totalReadTimeMs);
      expect(standard.scrollVelocityCurve.length).toBeGreaterThan(8);
      expect(standard.scrollVelocityCurve.every((s) => Number.isFinite(s.velocityPxPerSec) && s.velocityPxPerSec > 0)).toBe(true);
    }
    expect(Object.keys(READER_PACING_ARCHETYPES)).toHaveLength(3);
  });

  it("모든 아키타입에서 대사 비중이 큰 컷이 무언 리액션 컷보다 긴 체류 시간(ms)을 예측한다", () => {
    const sim = simulateEpisodeReaderPacingTwin({
      cuts: [
        { cutId: "silent-reaction", panelHeightPx: 500, whitespaceBeforePx: 100, dialogueCharCount: 0, visualComplexityScore: 0.35 },
        { cutId: "dialogue-heavy", panelHeightPx: 500, whitespaceBeforePx: 100, dialogueCharCount: 95, balloonCount: 3, visualComplexityScore: 0.35 },
      ],
    });
    for (const archSim of sim.archetypeSimulations) {
      const silentCut = archSim.cutTimeline[0];
      const dialogueCut = archSim.cutTimeline[1];
      if (silentCut && dialogueCut) {
        expect(dialogueCut.predictedDwellMs).toBeGreaterThan(silentCut.predictedDwellMs * 2);
        expect(dialogueCut.cutMeanVelocityPxPerSec).toBeLessThan(silentCut.cutMeanVelocityPxPerSec);
      }
    }
  });

  it("반전 컷 직전 40px 급전환 여백은 부족 픽셀(180px)과 호흡 경고를 정확히 지적한다", () => {
    const sim = simulateEpisodeReaderPacingTwin({
      cuts: [
        { cutId: "setup", panelHeightPx: 560, whitespaceBeforePx: 80, dialogueCharCount: 26, visualComplexityScore: 0.4 },
        { cutId: "twist-abrupt", panelHeightPx: 720, whitespaceBeforePx: 40, dialogueCharCount: 12, visualComplexityScore: 0.7, isTwistReveal: true },
      ],
    });
    expect(sim.twistAudits[0]?.status).toBe("abrupt");
    expect(sim.twistAudits[0]?.recommendedWhitespaceDeltaPx).toBe(180);
    expect(sim.twistAudits[0]?.guidanceKo).toContain("180px");
    expect(sim.riskHotspots.some((h) => h.kind === "abrupt-twist" && h.cutId === "twist-abrupt")).toBe(true);
  });

  it("반전 컷 직전 320px 충분한 서스펜스 여백은 호흡 점검을 통과한다", () => {
    const sim = simulateEpisodeReaderPacingTwin({
      cuts: [
        { cutId: "setup", panelHeightPx: 560, whitespaceBeforePx: 100, dialogueCharCount: 22, visualComplexityScore: 0.4 },
        { cutId: "twist-spaced", panelHeightPx: 760, whitespaceBeforePx: 320, dialogueCharCount: 10, visualComplexityScore: 0.65, isTwistReveal: true },
      ],
    });
    expect(sim.twistAudits[0]?.status).toBe("well-paced");
    expect(sim.twistAudits[0]?.recommendedWhitespaceDeltaPx).toBe(0);
    expect(sim.twistAudits[0]?.breathHoldSuspenseScore).toBeGreaterThanOrEqual(0.85);
    expect(sim.riskHotspots.some((h) => h.kind === "abrupt-twist")).toBe(false);
  });

  it("반전 컷 직전 1350px의 과도한 공백은 맥 끊김(over-stretched) 주의를 표시한다", () => {
    const sim = simulateEpisodeReaderPacingTwin({
      cuts: [
        { cutId: "setup", panelHeightPx: 500, whitespaceBeforePx: 80, dialogueCharCount: 18, visualComplexityScore: 0.35 },
        { cutId: "twist-far", panelHeightPx: 680, whitespaceBeforePx: 1350, dialogueCharCount: 8, visualComplexityScore: 0.5, isTwistReveal: true },
      ],
    });
    expect(sim.twistAudits[0]?.status).toBe("over-stretched");
    expect(sim.twistAudits[0]?.recommendedWhitespaceDeltaPx).toBeLessThan(0);
    expect(sim.riskHotspots.some((h) => h.kind === "over-stretched-gap")).toBe(true);
  });

  it("짧은 컷에 장문 말풍선 4개가 과밀 배치되면 wall-of-text 가독 피로 위험을 탐지한다", () => {
    const sim = simulateEpisodeReaderPacingTwin({
      cuts: [
        { cutId: "opener", panelHeightPx: 540, whitespaceBeforePx: 100, dialogueCharCount: 20, visualComplexityScore: 0.35 },
        { cutId: "wall-cut", panelHeightPx: 380, whitespaceBeforePx: 80, dialogueCharCount: 210, balloonCount: 4, visualComplexityScore: 0.65 },
      ],
    });
    const wallHotspot = sim.riskHotspots.find((h) => h.kind === "wall-of-text" && h.cutId === "wall-cut");
    expect(wallHotspot).toBeDefined();
    expect(wallHotspot?.fatigueRiskIndex).toBeGreaterThanOrEqual(0.65);
    expect(wallHotspot?.messageKo).toContain("말풍선 4개");
  });

  it("동일 크기·동일 여백 컷이 5연속 이어지면 스크롤 리듬 단조로움(rhythm-monotony)을 지적한다", () => {
    const cuts: EpisodePacingCutSpec[] = Array.from({ length: 5 }, (_, idx) => ({
      cutId: `mono-${idx + 1}`,
      panelHeightPx: 480,
      whitespaceBeforePx: 80,
      dialogueCharCount: 24,
      visualComplexityScore: 0.4,
    }));
    const sim = simulateEpisodeReaderPacingTwin({ cuts });
    expect(sim.riskHotspots.some((h) => h.kind === "rhythm-monotony")).toBe(true);
    expect(sim.rhythmVarietyScore).toBeLessThan(65);
  });

  it("빈 컷 목록이나 음수 여백·0 이하 컷 높이는 명시적으로 검증 오류를 반환한다", () => {
    expect(() => simulateEpisodeReaderPacingTwin({ cuts: [] })).toThrow(/최소 1개 이상/u);
    expect(() =>
      simulateEpisodeReaderPacingTwin({ cuts: [{ cutId: "bad-h", panelHeightPx: 0, whitespaceBeforePx: 40, dialogueCharCount: 10, visualComplexityScore: 0.2 }] }),
    ).toThrow(/panelHeightPx/u);
    expect(() =>
      simulateEpisodeReaderPacingTwin({ cuts: [{ cutId: "bad-w", panelHeightPx: 400, whitespaceBeforePx: -10, dialogueCharCount: 10, visualComplexityScore: 0.2 }] }),
    ).toThrow(/whitespaceBeforePx/u);
  });
});

describe("Wave 86 — 비파괴 OKLCH SVG 스캔패스 오버레이 및 출고 전 스코어카드", () => {
  it("SVG 오버레이가 OKLCH 열지도 등고선·번호 노드(1, 2)·사카드 화살표를 NaN 없이 생성한다", () => {
    const panel = createSolidPanel(120, 120, [20, 22, 26]);
    drawCircle(panel, 30, 32, 8, [252, 250, 245]);
    drawCircle(panel, 88, 86, 7, [215, 215, 220]);
    const saliency = computePanelVisualSaliencyMap(panel, { maxFixations: 3, iorRadiusPx: 20 });
    const rendered = renderSaliencyScanpathOverlaySvg({ saliency, palette: "amber-forest", showSaccadeArrows: true });

    expect(rendered.containsNaN).toBe(false);
    expect(rendered.svg.startsWith("<svg ")).toBe(true);
    expect(rendered.svg.endsWith("</svg>")).toBe(true);
    expect(rendered.svg).toContain("oklch(");
    expect(rendered.svg).not.toMatch(/NaN|Infinity/u);
    expect(rendered.contourRingCount).toBeGreaterThanOrEqual(2);
    expect(rendered.fixationNodeCount).toBeGreaterThanOrEqual(2);
    expect(rendered.saccadeEdgeCount).toBe(rendered.fixationNodeCount - 1);
    expect(rendered.svg).toContain('data-fixation-rank="1"');
    expect(rendered.svg).toContain('data-fixation-rank="2"');
    expect(rendered.svg).toContain('data-saccade="1-to-2"');
  });

  it("viridis-oklch 팔레트와 배경 시선 탈취 경고 링이 NaN 없이 정상 렌더링된다", () => {
    const { panel, balloons } = buildDistractedPanel("bottom-right");
    const audit = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    const rendered = renderSaliencyScanpathOverlaySvg({ saliency: audit.saliency, audit, speechBalloons: balloons, palette: "viridis-oklch" });
    expect(rendered.palette).toBe("viridis-oklch");
    expect(rendered.containsNaN).toBe(false);
    expect(rendered.svg).toContain('data-layer="background-hijack-warning"');
    expect(rendered.svg).toContain('data-layer="speech-balloon-guides"');
  });

  it("균형 잡힌 회차 리허설은 '출고 권장' 등급과 높은 종합 점수를 부여한다", () => {
    const { panel, balloons } = buildBalancedPanel();
    const audit = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    const pacing = simulateEpisodeReaderPacingTwin({
      episodeId: "ep-ready",
      cuts: [
        { cutId: "c1", panelHeightPx: 460, whitespaceBeforePx: 90, dialogueCharCount: 20, visualComplexityScore: 0.35 },
        { cutId: "c2", panelHeightPx: 720, whitespaceBeforePx: 180, dialogueCharCount: 34, visualComplexityScore: 0.5 },
        { cutId: "c3", panelHeightPx: 540, whitespaceBeforePx: 320, dialogueCharCount: 12, visualComplexityScore: 0.55, isTwistReveal: true, isCliffhangerEnd: true },
      ],
    });
    const scorecard = buildPacingRehearsalReport({ pacing, cutGazeAudits: [{ cutId: "c1", audit }], episodeTitleKo: "제12화 출고 전 리허설" });
    expect(scorecard.overallScore).toBeGreaterThanOrEqual(82);
    expect(scorecard.readinessGrade).toBe("출고 권장");
    expect(scorecard.metrics.hijackedCutCount).toBe(0);
    expect(scorecard.metrics.abruptTwistCount).toBe(0);
    expect(scorecard.metrics.wallOfTextCutCount).toBe(0);
    expect(scorecard.prioritizedActions).toHaveLength(0);
    expect(scorecard.summaryMarkdownKo).toContain("출고 권장");
  });

  it("배경 시선 탈취·급반전·장문 과밀이 겹친 회차는 '출고 전 연출 점검 필요'와 우선 보정 액션을 생성한다", () => {
    const { panel, balloons } = buildDistractedPanel("bottom-right");
    const hijackAudit = auditBalloonFirstGazePriority({ panel, speechBalloons: balloons });
    const pacing = simulateEpisodeReaderPacingTwin({
      episodeId: "ep-needs-work",
      cuts: [
        { cutId: "c1", panelHeightPx: 380, whitespaceBeforePx: 60, dialogueCharCount: 220, balloonCount: 4, visualComplexityScore: 0.85 },
        { cutId: "c2", panelHeightPx: 640, whitespaceBeforePx: 35, dialogueCharCount: 16, visualComplexityScore: 0.75, isTwistReveal: true },
      ],
    });
    const scorecard = buildPacingRehearsalReport({ pacing, cutGazeAudits: [{ cutId: "c1", audit: hijackAudit }] });
    expect(scorecard.readinessGrade).toBe("출고 전 연출 점검 필요");
    expect(scorecard.metrics.hijackedCutCount).toBe(1);
    expect(scorecard.metrics.abruptTwistCount).toBe(1);
    expect(scorecard.metrics.wallOfTextCutCount).toBe(1);
    expect(scorecard.prioritizedActions.length).toBeGreaterThanOrEqual(3);
    expect(scorecard.prioritizedActions[0]?.priority).toBe("high");
    expect(scorecard.summaryMarkdownKo).toContain("출고 전 우선 보정 권장 항목");
  });
});
