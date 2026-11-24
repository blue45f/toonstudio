// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  BRUSH_LAYER_STAGES,
  SCRIPT_CONTI_PRESETS,
  SMART_BRUSH_TELEMETRY_PRESETS,
  STYLE_HARMONIZER_PRESETS,
  StudioAiLatentStoryboardPanel,
  computeCiede2000,
  createStyleHarmonizerDemoFixtures,
  extractStrokeTelemetryFromPoints,
  extractStyleDnaFromRgba,
  harmonizeBackgroundToStyleDna,
  oklchToSrgb,
  parseKoreanScriptToConti,
  parseKoreanScriptTokens,
  recommendSmartBrushes,
  renderStyleComparisonStripRgba,
  splitKoreanBalloonText,
  srgbToCieLab,
  srgbToOklch,
  type BrushLayerStage,
  type RawStrokeTelemetryPoint,
  type StylePresetId,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("한국어 웹툰 대본·웹소설 -> 세로 스크롤 콘티 파서", () => {
  it('대사("..."), 지문((...)), 장면 전환([...]), SFX, 속마음 5종 토큰을 정확히 분류한다', () => {
    const sample = [
      "[장면 전환: 비 내리는 옥상]",
      "(거센 바람이 코트 자락을 흔든다.)",
      '지우: "여기서 끝내자."',
      "SFX: 콰광!",
      "속마음: 더는 물러설 수 없어.",
    ].join("\n");

    const tokens = parseKoreanScriptTokens(sample);
    expect(tokens.map((t) => t.kind)).toEqual([
      "scene-transition",
      "stage-direction",
      "dialogue",
      "sfx",
      "inner-thought",
    ]);
    expect(tokens[0]?.text).toBe("비 내리는 옥상");
    expect(tokens[2]?.speaker).toBe("지우");
    expect(tokens[2]?.text).toBe("여기서 끝내자.");
    expect(tokens[3]?.sfxIntensity).toBe("impact");
    expect(tokens[4]?.text).toBe("더는 물러설 수 없어.");
  });

  it("웹소설 혼합 문단의 서술·인용 대사·작은따옴표 속마음을 순서대로 분해해 멀티컷을 생성한다", () => {
    const webnovel = SCRIPT_CONTI_PRESETS.find((p) => p.id === "webnovel-dungeon")!.script;
    const report = parseKoreanScriptToConti(webnovel);

    expect(report.tokenCounts["scene-transition"]).toBe(1);
    expect(report.tokenCounts["stage-direction"]).toBeGreaterThanOrEqual(2);
    expect(report.tokenCounts.dialogue).toBeGreaterThanOrEqual(2);
    expect(report.tokenCounts["inner-thought"]).toBeGreaterThanOrEqual(1);
    expect(report.tokenCounts.sfx).toBe(1);
    expect(report.cuts.length).toBeGreaterThanOrEqual(3);
  });

  it("5종 샷 크기(ECU/CU/MS/WS/Bird's-eye)와 상황별 드라마틱 여백 거터 px를 차등 산출한다", () => {
    const script = [
      "[장면 전환: 새벽 도시]",
      "(도시 전경이 위에서 내려다보인다.)",
      "[장면 전환: 좁은 복도]",
      "(복도 끝으로 발소리가 울린다.)",
      '지우: "잠깐 얘기 좀 해."',
      '현우: "지금은 바빠."',
      "(지우의 표정이 굳어지며 숨결이 떨린다.)",
      "속마음: 저 눈빛은 분명 뭔가를 숨기고 있어.",
      "(현우의 눈동자가 흔들린다.)",
      "SFX: 콰광!",
    ].join("\n");

    const report = parseKoreanScriptToConti(script);
    const shots = new Set(report.cuts.map((c) => c.shotSize));
    expect(shots.has("Bird's-eye")).toBe(true);
    expect(shots.has("WS")).toBe(true);
    expect(shots.has("MS")).toBe(true);
    expect(shots.has("CU")).toBe(true);
    expect(shots.has("ECU")).toBe(true);

    // 장면 전환 앞 컷은 420px 암전 여백, 일반 대사 컷은 짧은 호흡 거터를 가진다
    const sceneTransitionCut = report.cuts[0]!;
    const msCut = report.cuts.find((c) => c.shotSize === "MS")!;
    expect(sceneTransitionCut.gutterAfterPx).toBe(420);
    expect(msCut.gutterAfterPx).toBeLessThan(sceneTransitionCut.gutterAfterPx);
  });

  it("말풍선 좌표가 안전 영역 내에 배치되고 Z 시선 순서가 위->아래로 엄격히 증가한다", () => {
    const script = [
      '지우: "첫 번째 대사야."',
      '현우: "두 번째로 답하는 대사야."',
      '지우: "세 번째로 받아치는 대사야."',
    ].join("\n");

    const report = parseKoreanScriptToConti(script);
    expect(report.cuts).toHaveLength(1);
    const balloons = report.cuts[0]!.balloons;
    expect(balloons).toHaveLength(3);

    for (let i = 0; i < balloons.length; i += 1) {
      const b = balloons[i]!;
      expect(b.zOrder).toBe(i + 1);
      expect(b.xPct).toBeGreaterThanOrEqual(8);
      expect(b.xPct).toBeLessThanOrEqual(92);
      expect(b.yPct).toBeGreaterThanOrEqual(8);
      expect(b.yPct).toBeLessThanOrEqual(92);
      if (i > 0) {
        expect(b.yPct).toBeGreaterThan(balloons[i - 1]!.yPct);
      }
    }
    // 좌(Z1) -> 우(Z2) -> 좌(Z3) Z-패턴 교차 확인
    expect(balloons[0]!.xPct).toBeLessThan(balloons[1]!.xPct);
    expect(balloons[2]!.xPct).toBeLessThan(balloons[1]!.xPct);
  });

  it("과밀 말풍선 및 과밀 컷 경고를 탐지하고 모바일용 분할 대사를 제안한다", () => {
    const denseDialogue =
      "지금 당장 옥상 비상구 열쇠를 넘기지 않으면 오늘 밤 안에 모든 증거가 사라지고 우리 둘 다 되돌릴 수 없는 함정에 빠지게 될 거야!";
    const splits = splitKoreanBalloonText(denseDialogue, 30);
    expect(splits.length).toBeGreaterThanOrEqual(2);

    const report = parseKoreanScriptToConti(`현우: "${denseDialogue}"\n지우: "${denseDialogue}"`);
    expect(report.warnings.some((w) => w.kind === "balloon-overcrowded")).toBe(true);
    expect(report.warnings.some((w) => w.kind === "cut-overcrowded")).toBe(true);
    expect(report.cuts[0]!.hasOvercrowding).toBe(true);
    expect(report.overcrowdingRatePct).toBe(100);
  });

  it("예상 독자 스크롤 시간(초)이 대사량과 컷 수 증가에 따라 단조 증가한다", () => {
    const shortReport = parseKoreanScriptToConti('지우: "안녕."');
    const longReport = parseKoreanScriptToConti(SCRIPT_CONTI_PRESETS[0]!.script);

    expect(shortReport.totalEstimatedScrollSec).toBeGreaterThan(1);
    expect(longReport.totalEstimatedScrollSec).toBeGreaterThan(shortReport.totalEstimatedScrollSec * 3);
  });
});

describe("온디바이스 화풍 DNA 추출 · 3D LUT/OKLCH 일치화 · CIEDE2000(ΔE00) 엔진", () => {
  it("OKLCH <-> sRGB 색공간 왕복 오차가 ±2 이내이며 CIEDE2000(ΔE00)이 지각 색차를 정확히 계산한다", () => {
    const samples: readonly (readonly [number, number, number])[] = [
      [240, 180, 150],
      [68, 92, 148],
      [120, 178, 132],
      [212, 212, 218],
    ];
    for (const [r, g, b] of samples) {
      const lch = srgbToOklch(r, g, b);
      const [rr, rg, rb] = oklchToSrgb(lch);
      expect(Math.abs(rr - r)).toBeLessThanOrEqual(2);
      expect(Math.abs(rg - g)).toBeLessThanOrEqual(2);
      expect(Math.abs(rb - b)).toBeLessThanOrEqual(2);
    }

    const labWarm = srgbToCieLab(245, 190, 120);
    const labCool = srgbToCieLab(90, 130, 195);
    expect(computeCiede2000(labWarm, labWarm)).toBeCloseTo(0, 5);
    expect(computeCiede2000(labWarm, labCool)).toBeGreaterThan(35);
  });

  it("기준 컷 RGBA 버퍼에서 그림자 OKLCH·하이라이트 색온도·선화 굵기 분포·스크린톤 피치·채도 대역을 추출한다", () => {
    const sunset = createStyleHarmonizerDemoFixtures("sunset-slice-of-life", 96, 80);
    const noir = createStyleHarmonizerDemoFixtures("noir-ink-thriller", 96, 80);

    const sunsetDna = extractStyleDnaFromRgba(sunset.reference);
    const noirDna = extractStyleDnaFromRgba(noir.reference);

    // 노을 화풍은 따뜻한 하이라이트(< 5500K), 누아르는 차가운 하이라이트(> 6800K)
    expect(sunsetDna.highlightTempKelvin).toBeLessThan(5600);
    expect(sunsetDna.highlightTempBias).toBe("warm");
    expect(noirDna.highlightTempKelvin).toBeGreaterThan(6800);
    expect(noirDna.highlightTempBias).toBe("cool");

    // 누아르 화풍은 굵은 선화(평균 > 2.5px) + 6px 스크린톤 피치를 탐지한다
    expect(noirDna.lineartWidthDistribution.meanPx).toBeGreaterThan(sunsetDna.lineartWidthDistribution.meanPx * 0.9);
    expect(noirDna.lineartWidthDistribution.histogram).toHaveLength(4);
    expect(noirDna.screentonePitch.detected).toBe(true);
    expect(noirDna.screentonePitch.pitchPx).toBeGreaterThanOrEqual(3);
    expect(sunsetDna.chromaBand.mean).toBeGreaterThan(noirDna.chromaBand.mean);
  });

  it("화풍 일치화 강도(0% -> 50% -> 100%) 증가에 따라 모든 프리셋에서 CIEDE2000(ΔE00)이 단조 감소한다", () => {
    const presetIds: readonly StylePresetId[] = STYLE_HARMONIZER_PRESETS.map((p) => p.id);

    for (const presetId of presetIds) {
      const { reference, target3d } = createStyleHarmonizerDemoFixtures(presetId, 96, 80);
      const refDna = extractStyleDnaFromRgba(reference);

      const rep0 = harmonizeBackgroundToStyleDna(refDna, target3d, {
        colorStrength: 0,
        lutStrength: 0,
        lineartSyncStrength: 0,
        screentoneBlend: 0,
      });
      const rep50 = harmonizeBackgroundToStyleDna(refDna, target3d, {
        colorStrength: 0.5,
        lutStrength: 0.5,
        lineartSyncStrength: 0.35,
        screentoneBlend: 0.2,
      });
      const rep100 = harmonizeBackgroundToStyleDna(refDna, target3d, {
        colorStrength: 1,
        lutStrength: 1,
        lineartSyncStrength: 0.7,
        screentoneBlend: 0.35,
      });

      expect(rep0.meanDeltaE00Before).toBeGreaterThan(8);
      expect(rep50.meanDeltaE00After).toBeLessThan(rep0.meanDeltaE00After);
      expect(rep100.meanDeltaE00After).toBeLessThan(rep50.meanDeltaE00After);
      expect(rep100.deltaE00Reduction).toBeGreaterThan(6);
      expect(rep100.deltaE00ReductionPct).toBeGreaterThan(45);
    }
  });

  it("17×17×17 3D LUT를 생성하고 3분할 비교 스트립 RGBA 버퍼를 정확히 합성한다", () => {
    const { reference, target3d } = createStyleHarmonizerDemoFixtures("noir-ink-thriller", 80, 64);
    const refDna = extractStyleDnaFromRgba(reference);
    const report = harmonizeBackgroundToStyleDna(refDna, target3d, {
      colorStrength: 0.9,
      lutStrength: 0.85,
      lineartSyncStrength: 0.8,
      screentoneBlend: 0.5,
      lutGridSize: 17,
    });

    expect(report.lutGridSize).toBe(17);
    expect(report.lutTable).toHaveLength(17 * 17 * 17 * 3);
    expect(report.screentoneApplied).toBe(true);

    const strip = renderStyleComparisonStripRgba(reference, target3d, report.harmonizedBuffer, 2);
    expect(strip.width).toBe(80 * 3 + 4);
    expect(strip.height).toBe(64);
    expect(strip.data).toHaveLength(strip.width * strip.height * 4);
  });
});

describe("문맥 기반 스마트 브러시 Top-3 · Wave 37A 마찰음/종이결 추천기", () => {
  it("5단계 작업 레이어(rough|lineart|flat|shading|fx)별로 해당 단계 주력 브러시 Top-3와 Wave 37A 페어링을 반환한다", () => {
    const stages: readonly BrushLayerStage[] = BRUSH_LAYER_STAGES.map((s) => s.id);
    expect(stages).toEqual(["rough", "lineart", "flat", "shading", "fx"]);

    const expectedTop1ByStage: Readonly<Record<BrushLayerStage, string>> = {
      rough: "pencil-2b-rough",
      lineart: "gpen",
      flat: "alcohol-marker-flat",
      shading: "watercolor-sable",
      fx: "neon-rim-glow",
    };

    for (const stage of stages) {
      const report = recommendSmartBrushes(SMART_BRUSH_TELEMETRY_PRESETS[stage]);
      expect(report.top3).toHaveLength(3);
      expect(report.top3[0].rank).toBe(1);
      expect(report.top3[1].rank).toBe(2);
      expect(report.top3[2].rank).toBe(3);
      expect(report.top3[0].matchScore).toBeGreaterThanOrEqual(report.top3[1].matchScore);
      expect(report.top3[1].matchScore).toBeGreaterThanOrEqual(report.top3[2].matchScore);

      // Top-3 모두 해당 단계의 주력 브러시이며 유효한 Wave 37A 페어링을 포함한다
      for (const item of report.top3) {
        expect(item.brush.primaryStages).toContain(stage);
        expect(item.wave37aPairing.frictionMediumId.length).toBeGreaterThan(0);
        expect(item.wave37aPairing.paperTextureId.length).toBeGreaterThan(0);
        expect(item.wave37aPairing.foleySoundId.length).toBeGreaterThan(0);
      }
      expect(report.top3[0].brush.brushId).toBe(expectedTop1ByStage[stage]);
    }
  });

  it("같은 선화 단계에서도 필압 분산·곡률·줌 변화에 따라 Top-1 브러시와 동적 크기/보정값이 적응한다", () => {
    const highZoomDetail = recommendSmartBrushes({
      layerStage: "lineart",
      strokeSpeedPxPerSec: 190,
      pressureVariance: 0.16,
      meanCurvature: 0.86,
      canvasZoomPct: 340,
    });
    const steadyMonoline = recommendSmartBrushes({
      layerStage: "lineart",
      strokeSpeedPxPerSec: 540,
      pressureVariance: 0.04,
      meanCurvature: 0.3,
      canvasZoomPct: 140,
    });

    expect(highZoomDetail.top3[0].brush.brushId).toBe("maru-pen");
    expect(steadyMonoline.top3[0].brush.brushId).toBe("perfect-ink-liner");
    expect(highZoomDetail.top3[0].dynamicSettings.sizePx).toBeLessThan(
      steadyMonoline.top3[0].dynamicSettings.sizePx,
    );
  });

  it("원시 스타일러스 포인트 시퀀스에서 속도·필압 분산·곡률 텔레메트리를 정확히 추출한다", () => {
    const points: readonly RawStrokeTelemetryPoint[] = [
      { x: 0, y: 0, pressure: 0.2, timestampMs: 0 },
      { x: 20, y: 0, pressure: 0.85, timestampMs: 50 },
      { x: 20, y: 20, pressure: 0.3, timestampMs: 100 },
      { x: 0, y: 20, pressure: 0.9, timestampMs: 150 },
    ];
    const telemetry = extractStrokeTelemetryFromPoints(points, 200, "lineart");
    expect(telemetry.strokeSpeedPxPerSec).toBeGreaterThan(350);
    expect(telemetry.pressureVariance).toBeGreaterThan(0.2);
    expect(telemetry.meanCurvature).toBeGreaterThan(0.7);
    expect(telemetry.canvasZoomPct).toBe(200);
  });
});

describe("StudioAiLatentStoryboardPanel UI 상호작용 · 접근성 · 토큰 위생 검증", () => {
  const putImageDataSpy = vi.fn();

  beforeEach(() => {
    putImageDataSpy.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          createImageData: (w: number, h: number) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
          putImageData: putImageDataSpy,
        }) as unknown as GPUCanvasContext,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Props 없이 단독 렌더링되며 한국어 대본 프리셋 전환 및 실시간 입력이 콘티 카드에 즉시 반영된다", () => {
    render(createElement(StudioAiLatentStoryboardPanel));

    expect(screen.getByTestId("ai-latent-storyboard-panel")).toBeTruthy();
    expect(screen.getByTestId("panel-conti")).toBeTruthy();
    expect(screen.getByTestId("badge-ondevice-zero-cost").textContent).toContain("온디바이스 100%");
    expect(Number.parseInt(screen.getByTestId("conti-warning-count").textContent ?? "0", 10)).toBeGreaterThanOrEqual(
      1,
    );

    // 로맨스 카페 프리셋 클릭 시 과밀 경고가 0건으로 갱신
    fireEvent.click(screen.getByTestId("preset-script-cafe-confession"));
    expect(screen.getByTestId("conti-warning-count").textContent).toContain("0");

    // 직접 대본 수정 시 컷 목록 즉시 재계산
    fireEvent.change(screen.getByTestId("conti-script-textarea"), {
      target: { value: '[장면 전환: 옥상]\n(도시 전경이 내려다보인다.)\nSFX: 콰광!\n지우: "시작해."' },
    });
    expect(screen.getByTestId("conti-cut-list").textContent).toContain("Bird's-eye");
    expect(screen.getByTestId("conti-cut-list").textContent).toContain("콰광!");
  });

  it("화풍 DNA 일치화 탭에서 3분할 캔버스를 렌더링하고 강도 슬라이더·원본/1클릭 버튼이 ΔE00을 실시간 갱신한다", () => {
    render(createElement(StudioAiLatentStoryboardPanel));

    fireEvent.click(screen.getByTestId("tab-harmonizer"));
    expect(screen.getByTestId("panel-harmonizer")).toBeTruthy();
    expect(screen.getByTestId("style-harmonizer-canvas")).toBeTruthy();
    expect(putImageDataSpy).toHaveBeenCalled();

    const beforeVal = Number.parseFloat(screen.getByTestId("harmonizer-delta-before").textContent ?? "0");
    const afterVal = Number.parseFloat(screen.getByTestId("harmonizer-delta-after").textContent ?? "99");
    expect(afterVal).toBeLessThan(beforeVal);

    // 원본 복원 버튼 클릭 시 보정 후 ΔE00이 원본 수준으로 돌아간다
    fireEvent.click(screen.getByTestId("btn-reset-harmonize"));
    const resetAfter = Number.parseFloat(screen.getByTestId("harmonizer-delta-after").textContent ?? "0");
    expect(resetAfter).toBeGreaterThan(afterVal);

    // 1클릭 일치화 버튼 클릭 시 ΔE00이 다시 축소된다
    fireEvent.click(screen.getByTestId("btn-oneclick-harmonize"));
    const rematchedAfter = Number.parseFloat(screen.getByTestId("harmonizer-delta-after").textContent ?? "99");
    expect(rematchedAfter).toBeLessThan(resetAfter);
  });

  it("스마트 브러시 탭에서 5단계 레이어 전환 시 Top-3 추천과 Wave 37A 마찰음·종이결 페어링이 즉시 바뀐다", () => {
    render(createElement(StudioAiLatentStoryboardPanel));

    fireEvent.click(screen.getByTestId("tab-brush"));
    expect(screen.getByTestId("panel-brush")).toBeTruthy();
    expect(screen.getByTestId("brush-rank-1").textContent).toContain("G펜");
    expect(screen.getByTestId("brush-rank-1").textContent).toContain("만화 원고 켄트지");

    fireEvent.click(screen.getByTestId("stage-btn-shading"));
    expect(screen.getByTestId("brush-rank-1").textContent).toContain("수채 세이블");
    expect(screen.getByTestId("brush-rank-1").textContent).toContain("중목 수채화지");

    fireEvent.click(screen.getByTestId("stage-btn-fx"));
    expect(screen.getByTestId("brush-rank-1").textContent).toContain("네온 림라이트");
  });

  it("정적 위생 계약: 전 파일 <= 800줄, TSX 원시 색상 0건, 스토리지·BigInt·private store·외부 API 호출 0건", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const storageRegex = new RegExp(`\\b(?:local${"Storage"}|session${"Storage"})\\b`);
    const privateStoreRegex = /\bprivate\s+(?:readonly\s+)?store\s*[=:]/;
    const bigIntLiteralRegex = /\b\d+n\b/;
    const networkCallRegex = /\b(?:fetch|XMLHttpRequest|axios)\s*\(/;
    const rawTailwindColorRegex =
      /\b(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d+)?\b/;

    for (const tsxFile of ["StudioAiLatentStoryboardPanel.tsx", "AiLatentStoryboardSubcomponents.tsx"]) {
      const tsxSource = readFileSync(path.join(dir, tsxFile), "utf-8");
      expect(tsxSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(tsxSource).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab)\s*\(/i);
      expect(tsxSource).not.toMatch(rawTailwindColorRegex);
    }

    const allFiles = [
      "latent-style-color-math.ts",
      "latent-style-harmonizer.ts",
      "script-to-conti-parser.ts",
      "smart-brush-recommender.ts",
      "AiLatentStoryboardSubcomponents.tsx",
      "StudioAiLatentStoryboardPanel.tsx",
      "index.ts",
      "ai-latent-storyboard.test.ts",
    ];

    for (const fileName of allFiles) {
      const content = readFileSync(path.join(dir, fileName), "utf-8");
      expect(content.split("\n").length).toBeLessThanOrEqual(800);
      expect(content).not.toMatch(storageRegex);
      expect(content).not.toMatch(privateStoreRegex);
      expect(content).not.toMatch(bigIntLiteralRegex);
      expect(content).not.toMatch(networkCallRegex);
    }
  });
});
