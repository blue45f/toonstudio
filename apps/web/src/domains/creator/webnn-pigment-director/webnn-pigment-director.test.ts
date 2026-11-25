// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  CUT_DIRECTOR_DEMO_SCENES,
  PIGMENT_PRESETS,
  StudioWebnnPigmentDirectorPanel,
  analyzeWebtoonCutDirection,
  applyDirectorAutoAssist,
  blendPigmentBatchSimd,
  computeCiede2000,
  createRoughLineartDemoFixture,
  getPigmentBaseSrgb,
  inspectKoreanDialogueBalloon,
  ksToReflectance,
  mixPigmentsKubelkaMunk,
  probeOnDeviceDirectorCapability,
  probeOnDeviceDirectorRuntimeAsync,
  probeWasmSimdPigmentRuntime,
  probeWebNnLineartCapability,
  probeWebNnLineartRuntimeAsync,
  reflectanceToKS,
  renderLineartComparisonRgba,
  renderPigmentMixPreviewRgba,
  splitOvercrowdedKoreanBalloon,
  stabilizeRoughLineart,
  stabilizeRoughLineartAsync,
  type CutSceneInput,
  type LineartStrokeInput,
  type RawStrokePoint,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("WASM-SIMD Kubelka-Munk 8-밴드 물리 혼색 엔진", () => {
  it("울트라마린 블루 + 카드뮴 옐로 혼색이 탁한 RGB 회색이 아니라 선명한 에메랄드 초록을 생성한다", () => {
    const result = mixPigmentsKubelkaMunk(
      [
        { pigmentId: "ultramarine-blue", ratio: 0.5 },
        { pigmentId: "cadmium-yellow", ratio: 0.5 },
      ],
      { layerThickness: 2.5, wetBackrun: 0, sedimentation: 0 },
    );

    // Kubelka-Munk 녹색 우세 검증 (G > R && G > B, 녹색 색상각 95°~165°)
    expect(result.kmSrgb.g).toBeGreaterThan(result.kmSrgb.r + 25);
    expect(result.kmSrgb.g).toBeGreaterThan(result.kmSrgb.b + 15);
    expect(result.kmHueDeg).toBeGreaterThanOrEqual(95);
    expect(result.kmHueDeg).toBeLessThanOrEqual(165);

    // 단순 RGB 혼색 대비 채도가 현저히 높고 지각 색차 ΔE00이 뚜렷하다
    expect(result.kmSaturationPct).toBeGreaterThan(result.rgbSaturationPct + 15);
    expect(result.deltaE2000).toBeGreaterThan(12);
    expect(result.deltaE76).toBeGreaterThan(15);
    expect(result.spectralReflectance).toHaveLength(8);
  });

  it("8종 전통·웹툰 안료 프리셋이 유효한 K/S 역변환 및 명도 범위를 만족한다", () => {
    expect(PIGMENT_PRESETS).toHaveLength(8);

    // K/S ↔ R∞ 수학적 자기역원 검증
    for (const sampleR of [0.05, 0.25, 0.5, 0.85, 0.96]) {
      expect(ksToReflectance(reflectanceToKS(sampleR))).toBeCloseTo(sampleR, 4);
    }

    const white = getPigmentBaseSrgb("titanium-white");
    const black = getPigmentBaseSrgb("carbon-black");
    expect(white.lab.l).toBeGreaterThan(93);
    expect(black.lab.l).toBeLessThan(18);
    expect(computeCiede2000(white.lab, black.lab)).toBeGreaterThan(75);
  });

  it("다중 레이어 투명 글레이즈 두께·습윤 백런·안료 침전이 반사율에 물리적으로 반영된다", () => {
    const thinGlaze = mixPigmentsKubelkaMunk(
      [{ pigmentId: "ultramarine-blue", ratio: 1, thickness: 0.35 }],
      { paperBrightness: 0.96, wetBackrun: 0, sedimentation: 0 },
    );
    const thickOpaque = mixPigmentsKubelkaMunk(
      [{ pigmentId: "ultramarine-blue", ratio: 1, thickness: 4.5 }],
      { paperBrightness: 0.96, wetBackrun: 0, sedimentation: 0 },
    );

    // 얇은 수채 글레이즈는 종이 밝기가 투과해 더 밝다
    expect(thinGlaze.kmSrgb.lab.l).toBeGreaterThan(thickOpaque.kmSrgb.lab.l + 10);

    // 종이 골짜기(paperToothSample=0.95) 침전 + 백런이 색 농도를 강화한다
    const peakWash = mixPigmentsKubelkaMunk(
      [
        { pigmentId: "burnt-umber", ratio: 0.6 },
        { pigmentId: "ultramarine-blue", ratio: 0.4 },
      ],
      { layerThickness: 1.1, wetBackrun: 0.7, sedimentation: 0.85, paperToothSample: 0.08 },
    );
    const valleyWash = mixPigmentsKubelkaMunk(
      [
        { pigmentId: "burnt-umber", ratio: 0.6 },
        { pigmentId: "ultramarine-blue", ratio: 0.4 },
      ],
      { layerThickness: 1.1, wetBackrun: 0.7, sedimentation: 0.85, paperToothSample: 0.95 },
    );

    expect(valleyWash.kmSrgb.lab.l).toBeLessThan(peakWash.kmSrgb.lab.l);
    expect(valleyWash.sedimentationFactor).toBeGreaterThan(0.5);
    expect(valleyWash.backrunEdgeBoost).toBeGreaterThan(0.1);
  });

  it("WASM-SIMD128 런타임을 프로브하고 512픽셀 배치 블렌딩이 단건 KM 결과와 일치한다", () => {
    const runtime = probeWasmSimdPigmentRuntime();
    expect(runtime.spectralBands).toBe(8);
    expect(["wasm-simd128", "typedarray-simd-aligned"]).toContain(runtime.backend);

    const ratios = new Float32Array(512);
    for (let i = 0; i < 512; i += 1) ratios[i] = i / 511;

    const batch = blendPigmentBatchSimd("ultramarine-blue", "cadmium-yellow", ratios, {
      layerThickness: 2.2,
    });
    expect(batch.pixelCount).toBe(512);
    expect(batch.rgba).toHaveLength(512 * 4);

    // 중앙(ratio ≈ 0.5) 픽셀이 단건 Kubelka-Munk 결과와 ±2 이내 일치
    const midIdx = 256;
    const singleMid = mixPigmentsKubelkaMunk(
      [
        { pigmentId: "ultramarine-blue", ratio: 1 - ratios[midIdx]! },
        { pigmentId: "cadmium-yellow", ratio: ratios[midIdx]! },
      ],
      { layerThickness: 2.2, wetBackrun: 0, sedimentation: 0 },
    );
    expect(Math.abs(batch.rgba[midIdx * 4]! - singleMid.kmSrgb.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(batch.rgba[midIdx * 4 + 1]! - singleMid.kmSrgb.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(batch.rgba[midIdx * 4 + 2]! - singleMid.kmSrgb.b)).toBeLessThanOrEqual(2);
  });

  it("실시간 혼색 프리뷰 RGBA 버퍼의 상단 KM 중앙이 하단 RGB 중앙보다 뚜렷한 초록 우세를 보인다", () => {
    const w = 120;
    const h = 80;
    const rgba = renderPigmentMixPreviewRgba(
      "ultramarine-blue",
      "cadmium-yellow",
      0.5,
      { wetBackrun: 0.3, sedimentation: 0.2, layerThickness: 2.4 },
      w,
      h,
    );
    expect(rgba).toHaveLength(w * h * 4);

    const kmOffset = (Math.floor(h * 0.32) * w + Math.floor(w * 0.5)) * 4;
    const rgbOffset = (Math.floor(h * 0.85) * w + Math.floor(w * 0.5)) * 4;

    const kmGreenLead = rgba[kmOffset + 1]! - Math.max(rgba[kmOffset]!, rgba[kmOffset + 2]!);
    const rgbGreenLead = rgba[rgbOffset + 1]! - Math.max(rgba[rgbOffset]!, rgba[rgbOffset + 2]!);
    expect(kmGreenLead).toBeGreaterThan(20);
    expect(kmGreenLead).toBeGreaterThan(rgbGreenLead + 15);
  });
});

describe("온디바이스 WebNN 실시간 선화 보정 파이프라인", () => {
  it("navigator.ml 부재 시 CPU SIMD-정렬 폴백을, 존재 시 NPU/GPU WebNN 백엔드를 감지한다", async () => {
    const fallbackCap = probeWebNnLineartCapability(null);
    expect(fallbackCap.hasNavigatorMl).toBe(false);
    expect(fallbackCap.preferredBackend).toBe("cpu-typedarray");
    const compute = vi.fn();

    const mockNav = {
      ml: {
        createContext: async (opts?: { readonly deviceType?: "npu" | "gpu" | "cpu" }) => {
          if (opts?.deviceType === "npu" || opts?.deviceType === "cpu") {
            return { compute, destroy: () => undefined };
          }
          throw new Error("gpu unsupported");
        },
      },
    };
    const runtimeCap = await probeWebNnLineartRuntimeAsync({
      preferredDeviceType: "npu",
      navigatorOverride: mockNav,
    });
    expect(runtimeCap.hasNavigatorMl).toBe(true);
    expect(runtimeCap.preferredBackend).toBe("webnn-npu");
    expect(runtimeCap.supportedDeviceTypes).toContain("npu");

    const asyncReport = await stabilizeRoughLineartAsync(createRoughLineartDemoFixture(), {
      navigatorOverride: mockNav,
    });
    expect(asyncReport.backend).toBe("cpu-typedarray");
    expect(asyncReport.capability.preferredBackend).toBe("webnn-npu");
    expect(compute).not.toHaveBeenCalled();
    const gpuVisible = stabilizeRoughLineart(createRoughLineartDemoFixture(), {
      navigatorOverride: { ...mockNav, gpu: { requestAdapter: async () => ({}) } },
    });
    expect(gpuVisible.backend).toBe("cpu-typedarray");
    expect(gpuVisible.capability.supportedDeviceTypes).toEqual([]);
  });

  it("자기 폐곡선 · 끝점 연결 · T-접합 3가지 열린 선 틈을 반경 내에서 정확히 닫는다", () => {
    // 1) 자기 폐곡선(시작과 끝이 10px 떨어짐)
    const loopPts: RawStrokePoint[] = [];
    for (let i = 0; i < 32; i += 1) {
      const a = (i / 31) * Math.PI * 1.92;
      loopPts.push({ x: 80 + Math.cos(a) * 42, y: 80 + Math.sin(a) * 42 });
    }
    // 2) 서로 끝점이 9px 떨어진 두 선
    const segA: RawStrokePoint[] = [
      { x: 160, y: 40 },
      { x: 185, y: 40 },
      { x: 205, y: 40 },
    ];
    const segB: RawStrokePoint[] = [
      { x: 214, y: 41 },
      { x: 235, y: 41 },
      { x: 260, y: 41 },
    ];
    // 3) 세로선 본체에서 8px 떨어진 T-접합 가로선
    const verticalWall: RawStrokePoint[] = [
      { x: 200, y: 110 },
      { x: 200, y: 150 },
      { x: 200, y: 190 },
    ];
    const branchStroke: RawStrokePoint[] = [
      { x: 150, y: 150 },
      { x: 172, y: 150 },
      { x: 192, y: 150 },
    ];

    const input: readonly LineartStrokeInput[] = [
      { id: "loop", points: loopPts },
      { id: "join-a", points: segA },
      { id: "join-b", points: segB },
      { id: "wall", points: verticalWall },
      { id: "branch", points: branchStroke },
    ];

    const closedReport = stabilizeRoughLineart(input, {
      smoothingStrength: 0.25,
      gapClosingThresholdPx: 16,
    });
    const kinds = closedReport.closedGaps.map((g) => g.kind);
    expect(kinds).toContain("self-loop");
    expect(kinds).toContain("endpoint-join");
    expect(kinds).toContain("t-junction");
    expect(closedReport.closedGapCount).toBeGreaterThanOrEqual(3);

    const openReport = stabilizeRoughLineart(input, {
      smoothingStrength: 0.25,
      gapClosingThresholdPx: 0,
    });
    expect(openReport.closedGapCount).toBe(0);
  });

  it("곡률 적응형 정선화가 직선 구간 정점을 압축하면서도 3차 베지어 곡선을 유지한다", () => {
    const demo = createRoughLineartDemoFixture();
    const report = stabilizeRoughLineart(demo, {
      smoothingStrength: 0.72,
      gapClosingThresholdPx: 18,
      simplificationTolerancePx: 1.5,
      curvatureAdaptivity: 0.75,
    });

    expect(report.inputPointCount).toBeGreaterThan(120);
    expect(report.outputKnotCount).toBeLessThan(report.inputPointCount * 0.65);
    expect(report.vertexCompressionPct).toBeGreaterThan(35);
    expect(report.bezierSegmentCount).toBeGreaterThanOrEqual(report.inputStrokeCount);
  });

  it("선화 전/후 비교 RGBA 렌더러가 유효한 분할 이미지를 생성한다", () => {
    const demo = createRoughLineartDemoFixture();
    const report = stabilizeRoughLineart(demo);
    const buf = renderLineartComparisonRgba(demo, report, 160, 100);
    expect(buf).toHaveLength(160 * 100 * 4);

    // 좌측과 우측 모두 배경 이외의 잉크 픽셀이 그려졌는지 확인
    let inkPixels = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i]! > 100 || buf[i + 1]! > 100) inkPixels += 1;
    }
    expect(inkPixels).toBeGreaterThan(80);
  });
});

describe("온디바이스 웹툰 컷 연출 · 대사 어시스트 엔진", () => {
  it("window.ai 및 WebGPU 부재 시 외부 전송 0건 오프라인 문법 엔진으로, 존재 시 로컬 런타임으로 감지한다", async () => {
    const offline = probeOnDeviceDirectorCapability({});
    expect(offline.backend).toBe("offline-webtoon-grammar");
    expect(offline.privacyMode).toBe("100%-ondevice-zero-upload");
    expect(offline.localExecutionReady).toBe(true);

    const withWindowAi = await probeOnDeviceDirectorRuntimeAsync({
      ai: {
        languageModel: {
          availability: async () => "readily",
        },
      },
    });
    expect(withWindowAi.backend).toBe("window-ai-nano");
    expect(withWindowAi.hasWindowAi).toBe(true);
    const create = vi.fn();
    const report = analyzeWebtoonCutDirection(CUT_DIRECTOR_DEMO_SCENES, { ai: { languageModel: { create } } });
    expect(report.executionBackend).toBe("offline-webtoon-grammar");
    expect(report.inferencePerformed).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("동일 샷(MS) 3연속 단조로움 · WS 부재 · 클라이맥스 샷 불일치를 정확히 진단한다", () => {
    const report = analyzeWebtoonCutDirection(CUT_DIRECTOR_DEMO_SCENES);
    const rhythmKinds = report.rhythmIssues.map((i) => i.kind);

    expect(report.shotDistribution.counts.MS).toBe(4);
    expect(report.shotDistribution.monotonyRunMax).toBe(4);
    expect(rhythmKinds).toContain("monotony-run");
    expect(rhythmKinds).toContain("ms-overuse");
    expect(rhythmKinds).toContain("missing-establishing-ws");
    expect(rhythmKinds).toContain("beat-shot-mismatch");
    expect(report.rhythmScore).toBeLessThan(70);
  });

  it("한국어 번역투·이중 피동을 탐지하고 자연스러운 웹툰 구어체 교정안을 제시한다", () => {
    const sample =
      "당신은 이 열쇠를 통해 문을 여는 것을 가능하게 합니다. 그것은 이미 봉인되어지고 있어서 지금 확인해야 할 필요가 있습니다.";
    const res = inspectKoreanDialogueBalloon(sample);

    expect(res.matchedRules.length).toBeGreaterThanOrEqual(4);
    expect(res.suggestedRewrite).not.toContain("하는 것을 가능하게");
    expect(res.suggestedRewrite).not.toContain("당신은");
    expect(res.suggestedRewrite).not.toContain("되어지고");
    expect(res.suggestedRewrite).not.toContain("할 필요가 있습니다");
    expect(res.suggestedRewrite).toContain("넌 ");
    expect(res.suggestedRewrite).toContain("해야 해");
  });

  it("과밀 말풍선을 탐지해 모바일 읽기 호흡에 맞게 2개 이상의 말풍선으로 분할한다", () => {
    const denseText =
      "지금 지하 통로로 내려가지 않으면 문이 영영 닫혀 버려. 그러니까 망설이지 말고 바로 따라와, 뒤에서 발소리가 들리잖아!";
    const check = inspectKoreanDialogueBalloon(denseText);
    const splits = splitOvercrowdedKoreanBalloon(denseText, 24);

    expect(check.isOvercrowded).toBe(true);
    expect(check.estimatedMobileLines).toBeGreaterThanOrEqual(4);
    expect(splits.length).toBeGreaterThanOrEqual(2);
    expect(check.suggestedSplitBalloons.length).toBeGreaterThanOrEqual(2);
  });

  it("시선 역행(위로 점프)·같은 높이 우→좌 역주행을 탐지하고 자동 어시스트로 종합 점수를 끌어올린다", () => {
    const before = analyzeWebtoonCutDirection(CUT_DIRECTOR_DEMO_SCENES);
    const eyeKinds = before.eyeFlowIssues.map((i) => i.kind);
    expect(eyeKinds).toContain("right-to-left-reversal");
    expect(eyeKinds).toContain("reverse-vertical-jump");

    const improvedScenes: readonly CutSceneInput[] = applyDirectorAutoAssist(
      CUT_DIRECTOR_DEMO_SCENES,
    );
    const after = analyzeWebtoonCutDirection(improvedScenes);

    expect(after.eyeFlowIssues).toHaveLength(0);
    expect(after.overallScore).toBeGreaterThan(before.overallScore + 20);
    expect(after.dialogueNaturalnessScore).toBeGreaterThan(before.dialogueNaturalnessScore);
  });
});

describe("StudioWebnnPigmentDirectorPanel UI · 접근성 · 토큰 위생 검증", () => {
  const putImageDataSpy = vi.fn();

  beforeEach(() => {
    putImageDataSpy.mockReset();
    const mockCtx = {
      createImageData: (widthOrImage: number | ImageData, height = 0): ImageData => {
        const width = typeof widthOrImage === "number" ? widthOrImage : widthOrImage.width;
        const imageHeight = typeof widthOrImage === "number" ? height : widthOrImage.height;
        return {
          width,
          height: imageHeight,
          data: new Uint8ClampedArray(width * imageHeight * 4),
          colorSpace: "srgb",
        };
      },
      putImageData: putImageDataSpy,
    };
    const canvas2d: {
      getContext(
        contextId: "2d",
        options?: CanvasRenderingContext2DSettings,
      ): Pick<CanvasRenderingContext2D, keyof typeof mockCtx> | null;
    } = HTMLCanvasElement.prototype;
    vi.spyOn(canvas2d, "getContext").mockImplementation((id) => (id === "2d" ? mockCtx : null));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("기본 물리 혼색 탭을 렌더링하고 TSX 소스에 원시 색상·브라우저 스토리지 접근이 0건이다", () => {
    render(createElement(StudioWebnnPigmentDirectorPanel));

    expect(screen.getByTestId("webnn-pigment-director-panel")).toBeTruthy();
    expect(screen.getByTestId("km-pigment-canvas")).toBeTruthy();
    expect(document.createElement("canvas").getContext("webgpu")).toBeNull();
    expect(putImageDataSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("km-delta-e").textContent).toMatch(/\d+\.\d+\s*\/\s*\d+\.\d+/);
    expect(screen.getByTestId("badge-ondevice-privacy").textContent).toContain("로컬 100%");

    // 정적 위생 검증: TSX 내 raw hex/rgb/hsl 0건, localStorage/sessionStorage 0건, 모든 모듈 <= 800줄
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const tsxSource = readFileSync(path.join(dir, "StudioWebnnPigmentDirectorPanel.tsx"), "utf-8");
    expect(tsxSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(tsxSource).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/i);
    expect(tsxSource).not.toMatch(/\b(?:localStorage|sessionStorage)\b/);

    for (const fileName of [
      "webnn-lineart-types-and-preview.ts",
      "webnn-lineart-stabilizer.ts",
      "kubelka-munk-optics.ts",
      "wasm-simd-kubelka-munk.ts",
      "ondevice-cut-director-rules.ts",
      "ondevice-cut-director.ts",
      "StudioWebnnPigmentDirectorPanel.tsx",
      "index.ts",
      "webnn-pigment-director.test.ts",
    ]) {
      const content = readFileSync(path.join(dir, fileName), "utf-8");
      expect(content.split("\n").length).toBeLessThanOrEqual(800);
      if (fileName !== "webnn-pigment-director.test.ts") {
        expect(content).not.toMatch(/\b(?:localStorage|sessionStorage)\b/);
      }
    }
  });

  it("WebNN 선화 보정 탭으로 전환해 열린 틈 닫기 반경 슬라이더 변경이 실측 지표에 즉시 반영된다", () => {
    render(createElement(StudioWebnnPigmentDirectorPanel));

    fireEvent.click(screen.getByTestId("tab-lineart"));
    expect(screen.getByTestId("panel-lineart")).toBeTruthy();
    expect(screen.getByTestId("webnn-lineart-canvas")).toBeTruthy();

    const closedBefore = screen.getByTestId("lineart-closed-gaps").textContent ?? "";
    expect(parseInt(closedBefore, 10)).toBeGreaterThanOrEqual(1);

    // 반경을 0px로 내리면 닫힌 틈 수가 0으로 바뀐다
    fireEvent.change(screen.getByTestId("slider-gap-threshold"), { target: { value: "0" } });
    expect(screen.getByTestId("lineart-closed-gaps").textContent).toContain("0");
  });

  it("컷·대사 어시스트 탭에서 번역투 편집 및 원클릭 자동 적용이 점수를 높인다", () => {
    render(createElement(StudioWebnnPigmentDirectorPanel));

    fireEvent.click(screen.getByTestId("tab-director"));
    expect(screen.getByTestId("panel-director")).toBeTruthy();

    const scoreBeforeText = screen.getByTestId("director-overall-score").textContent ?? "";
    const scoreBefore = parseInt(scoreBeforeText.replace(/[^0-9]/g, ""), 10);

    fireEvent.click(screen.getByTestId("director-auto-assist-btn"));
    const scoreAfterText = screen.getByTestId("director-overall-score").textContent ?? "";
    const scoreAfter = parseInt(scoreAfterText.replace(/[^0-9]/g, ""), 10);

    expect(scoreAfter).toBeGreaterThan(scoreBefore);

    // 새 번역투 대사를 직접 입력하면 진단 항목이 다시 나타난다
    fireEvent.change(screen.getByTestId("director-dialogue-input"), {
      target: { value: "당신은 이것을 통해 승리하는 것을 가능하게 합니다." },
    });
    expect(screen.getByTestId("director-findings-list").textContent).toContain("번역투");
  });
});
