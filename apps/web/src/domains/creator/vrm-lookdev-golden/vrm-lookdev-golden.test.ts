// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  analyzeFrameHistogram,
  applyGoldenRegressionFault,
  buildOfficialCharacterTurnaroundSheet,
  computePerceptualSsim,
  computePoseSpaceWrinkleMap,
  createExpressionWeightsFromPreset,
  DEFAULT_CHARACTER_OKLCH_PALETTE,
  evaluateWebGlGoldenSsimGate,
  OFFICIAL_12_EXPRESSION_PRESETS,
  solveHairExpressionAvoidance,
  StudioVrmLookdevGoldenPanel,
  synthesizeVrmLookdevFrame,
  type CharacterTurnaroundSheetSpec,
  type StudioVrmLookdevGoldenPanelProps,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("① Headless WebGL 골든 SSIM 자동 회귀 오라클", () => {
  it("동일한 기준·후보 RGBA 프레임 입력 시 SSIM=1.0, 오류 0건, 최종 판정 pass를 반환한다", () => {
    const golden = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    const clone = new Uint8ClampedArray(golden.data);

    const report = evaluateWebGlGoldenSsimGate({
      width: golden.width,
      height: golden.height,
      referenceRgba: golden.data,
      candidateRgba: clone,
      shaderRecords: [
        { programName: "vrm-mtoon-body", stage: "vertex", compiled: true },
        { programName: "vrm-mtoon-body", stage: "fragment", compiled: true },
      ],
    });

    expect(report.ssim).toBeCloseTo(1.0, 6);
    expect(report.lumaSsim).toBeCloseTo(1.0, 6);
    expect(report.chromaSsim).toBeCloseTo(1.0, 6);
    expect(report.washoutDelta).toBe(0);
    expect(report.darkCollapseDelta).toBe(0);
    expect(report.silhouetteLossRatio).toBe(0);
    expect(report.shaderErrorCount).toBe(0);
    expect(report.verdict).toBe("pass");
    expect(report.diagnostics).toHaveLength(0);
    expect(report.summaryKo).toContain("통과(PASS)");
  });

  it("밀키 백화(워시아웃) 결함 프레임 입력 시 washoutRatio 상승과 fail·한글 진단을 반환한다", () => {
    const golden = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    const injected = applyGoldenRegressionFault(golden, "milky-washout");

    const report = evaluateWebGlGoldenSsimGate({
      width: golden.width,
      height: golden.height,
      referenceRgba: golden.data,
      candidateRgba: injected.candidate.data,
      shaderRecords: injected.shaderRecords,
    });

    expect(report.verdict).toBe("fail");
    expect(report.washoutRatio).toBeGreaterThan(0.25);
    expect(report.washoutDelta).toBeGreaterThan(0.2);
    expect(report.ssim).toBeLessThan(0.88);
    expect(report.diagnostics.some((d) => d.code === "MILKY_WASHOUT")).toBe(true);
    expect(report.summaryKo).toContain("밀키 백화");
  });

  it("암부 뭉개짐(크러시) 결함 프레임 입력 시 darkCollapseRatio 상승과 fail·한글 진단을 반환한다", () => {
    const golden = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    const injected = applyGoldenRegressionFault(golden, "dark-collapse");

    const report = evaluateWebGlGoldenSsimGate({
      width: golden.width,
      height: golden.height,
      referenceRgba: golden.data,
      candidateRgba: injected.candidate.data,
      shaderRecords: injected.shaderRecords,
    });

    expect(report.verdict).toBe("fail");
    expect(report.darkCollapseRatio).toBeGreaterThan(0.35);
    expect(report.darkCollapseDelta).toBeGreaterThan(0.3);
    expect(report.diagnostics.some((d) => d.code === "DARK_COLLAPSE")).toBe(true);
    expect(report.summaryKo).toContain("암부 뭉개짐");
  });

  it("헤어/상단 메시 실루엣 결손 시 silhouetteLossRatio 급증과 fail 판정을 반환한다", () => {
    const golden = synthesizeVrmLookdevFrame({ width: 48, height: 48, transparentBackdrop: true });
    const injected = applyGoldenRegressionFault(golden, "silhouette-dropout");

    const report = evaluateWebGlGoldenSsimGate({
      width: golden.width,
      height: golden.height,
      referenceRgba: golden.data,
      candidateRgba: injected.candidate.data,
      shaderRecords: injected.shaderRecords,
    });

    expect(report.verdict).toBe("fail");
    expect(report.silhouetteLossRatio).toBeGreaterThan(0.15);
    expect(report.silhouetteIoU).toBeLessThan(0.85);
    expect(report.diagnostics.some((d) => d.code === "SILHOUETTE_LOSS")).toBe(true);
    expect(report.summaryKo).toContain("실루엣 결손");
  });

  it("픽셀이 동일하더라도 WebGL 셰이더 컴파일 오류가 1건 이상이면 즉시 fail 판정한다", () => {
    const golden = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    const injected = applyGoldenRegressionFault(golden, "shader-compile-error");

    const report = evaluateWebGlGoldenSsimGate({
      width: golden.width,
      height: golden.height,
      referenceRgba: golden.data,
      candidateRgba: injected.candidate.data,
      shaderRecords: injected.shaderRecords,
    });

    expect(report.ssim).toBeCloseTo(1.0, 6);
    expect(report.shaderErrorCount).toBe(1);
    expect(report.failedShaderLogs[0]).toContain("vrm-hair-angelring:fragment");
    expect(report.verdict).toBe("fail");
    expect(report.diagnostics.some((d) => d.code === "SHADER_COMPILE_ERROR")).toBe(true);
    expect(report.summaryKo).toContain("셰이더 컴파일");
  });

  it("미세 톤 드리프트 구간에서는 warn 판정하고 원본 버퍼를 변형하지 않는다", () => {
    const golden = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    const snapshot = Array.from(golden.data);
    const injected = applyGoldenRegressionFault(golden, "subtle-tone-drift");

    expect(Array.from(golden.data)).toEqual(snapshot);
    expect(injected.candidate.data).not.toBe(golden.data);

    const report = evaluateWebGlGoldenSsimGate({
      width: golden.width,
      height: golden.height,
      referenceRgba: golden.data,
      candidateRgba: injected.candidate.data,
      shaderRecords: injected.shaderRecords,
    });

    expect(report.verdict).toBe("warn");
    expect(report.ssim).toBeGreaterThanOrEqual(0.88);
    expect(report.ssim).toBeLessThan(0.95);
    expect(report.summaryKo).toContain("주의(WARN)");
  });

  it("프레임 해상도 불일치 및 히스토그램/SSIM 단독 유틸리티 예외 경계를 안전하게 처리한다", () => {
    const golden = synthesizeVrmLookdevFrame({ width: 32, height: 32 });
    const wrongSize = new Uint8ClampedArray(16 * 16 * 4);

    const mismatch = evaluateWebGlGoldenSsimGate({
      width: 32,
      height: 32,
      candidateWidth: 16,
      candidateHeight: 16,
      referenceRgba: golden.data,
      candidateRgba: wrongSize,
    });
    expect(mismatch.verdict).toBe("fail");
    expect(mismatch.diagnostics[0]?.code).toBe("DIMENSION_MISMATCH");

    const hist = analyzeFrameHistogram(golden.width, golden.height, golden.data);
    expect(hist.luminanceBins).toHaveLength(16);
    expect(hist.saturationBins).toHaveLength(8);
    expect(hist.foregroundPixels).toBeGreaterThan(200);

    const ssim = computePerceptualSsim(golden.width, golden.height, golden.data, golden.data);
    expect(ssim.ssim).toBe(1);
    expect(ssim.windowCount).toBeGreaterThan(0);
  });
});

describe("② 표정-헤어 간섭 회피 솔버 & 포즈 공간 의상 주름맵", () => {
  it("표정 블렌드셰이프 강도 증가(neutral → 놀람 0.5 → 1.0)에 따라 앞머리 Z 회피량이 단조 증가하고 관통을 0건으로 해소한다", () => {
    const neutral = solveHairExpressionAvoidance({ weights: {} });
    const halfSurprised = solveHairExpressionAvoidance({
      weights: createExpressionWeightsFromPreset("surprised", 0.5),
    });
    const fullSurprised = solveHairExpressionAvoidance({
      weights: createExpressionWeightsFromPreset("surprised", 1.0),
    });

    expect(neutral.maxZOffsetMm).toBe(0);
    expect(neutral.dominantExpression).toBe("neutral");
    expect(halfSurprised.maxZOffsetMm).toBeGreaterThan(0);
    expect(fullSurprised.maxZOffsetMm).toBeGreaterThan(halfSurprised.maxZOffsetMm);
    expect(fullSurprised.dominantExpression).toBe("surprised");
    expect(fullSurprised.overlapPreventedCount).toBe(5);
    expect(fullSurprised.zones.every((z) => z.collisionResolved)).toBe(true);
    expect(fullSurprised.zones.every((z) => z.residualClearanceMm >= 2.0)).toBe(true);
  });

  it("화남 표정은 미간(centerGlabella) 중심 최대 Z 회피와 좌우 벌림을, 윙크 표정은 좌우 비대칭 회피를 생성한다", () => {
    const angry = solveHairExpressionAvoidance({ weights: { angry: 1.0 } });
    const glabella = angry.zones.find((z) => z.zoneId === "centerGlabella");
    const outer = angry.zones.find((z) => z.zoneId === "leftOuter");

    expect(glabella).toBeDefined();
    expect(outer).toBeDefined();
    expect(glabella?.zOffsetMm ?? 0).toBeGreaterThan(outer?.zOffsetMm ?? 0);
    expect(Math.abs(glabella?.xPartingOffsetMm ?? 0)).toBeGreaterThan(1.5);

    const winkL = solveHairExpressionAvoidance({ weights: { winkLeft: 1.0 } });
    const winkR = solveHairExpressionAvoidance({ weights: { winkRight: 1.0 } });
    const leftBrowOnL = winkL.zones.find((z) => z.zoneId === "leftBrow")?.zOffsetMm ?? 0;
    const rightBrowOnL = winkL.zones.find((z) => z.zoneId === "rightBrow")?.zOffsetMm ?? 0;
    const leftBrowOnR = winkR.zones.find((z) => z.zoneId === "leftBrow")?.zOffsetMm ?? 0;
    const rightBrowOnR = winkR.zones.find((z) => z.zoneId === "rightBrow")?.zOffsetMm ?? 0;

    expect(leftBrowOnL).toBeGreaterThan(rightBrowOnL * 4);
    expect(rightBrowOnR).toBeCloseTo(leftBrowOnL, 2);
    expect(leftBrowOnR).toBeCloseTo(rightBrowOnL, 2);
    expect(winkL.leftRightAsymmetryMm).toBeGreaterThan(3);
  });

  it("앞머리 숱 밀도(bangsDensity)와 돌출 민감도가 높을수록 Z 회피 클리어런스가 비례 보강된다", () => {
    const lightBangs = solveHairExpressionAvoidance({
      weights: { surprised: 0.8 },
      bangsDensity: 0.1,
      browProtrusionScale: 0.8,
    });
    const heavyBangs = solveHairExpressionAvoidance({
      weights: { surprised: 0.8 },
      bangsDensity: 0.95,
      browProtrusionScale: 1.4,
    });

    expect(heavyBangs.maxZOffsetMm).toBeGreaterThan(lightBangs.maxZOffsetMm * 1.5);
  });

  it("팔꿈치·무릎·어깨 굴곡 각도 증가 시 주름 노멀·선화 강도가 엄격 단조 증가하며 0도에서는 0이다", () => {
    const angles = [0, 30, 60, 90, 120, 150];
    const samples = angles.map((deg) =>
      computePoseSpaceWrinkleMap({
        fabricType: "cotton",
        angles: {
          leftElbowDeg: deg,
          rightElbowDeg: deg,
          leftKneeDeg: deg,
          rightKneeDeg: deg,
          leftShoulderDeg: deg,
          rightShoulderDeg: deg,
        },
      }),
    );

    const zeroMap = samples[0];
    expect(zeroMap?.peakNormalStrength).toBe(0);
    expect(zeroMap?.peakInkLineStrength).toBe(0);
    expect(zeroMap?.totalActiveFoldLines).toBe(0);

    for (let i = 1; i < samples.length; i += 1) {
      const prev = samples[i - 1];
      const curr = samples[i];
      expect(curr?.peakNormalStrength ?? 0).toBeGreaterThan(prev?.peakNormalStrength ?? 0);
      expect(curr?.peakInkLineStrength ?? 0).toBeGreaterThan(prev?.peakInkLineStrength ?? 0);
      expect(curr?.shaderUniforms.uWrinkleElbowL ?? 0).toBeGreaterThan(prev?.shaderUniforms.uWrinkleElbowL ?? 0);
      expect(curr?.shaderUniforms.uWrinkleKneeL ?? 0).toBeGreaterThan(prev?.shaderUniforms.uWrinkleKneeL ?? 0);
      expect(curr?.shaderUniforms.uWrinkleShoulderL ?? 0).toBeGreaterThan(prev?.shaderUniforms.uWrinkleShoulderL ?? 0);
    }
  });

  it("원단 물성(데님 vs 실크) 차이와 탄젠트 공간 노멀 벡터 단위 길이(|n|=1)를 보존한다", () => {
    const denim = computePoseSpaceWrinkleMap({
      fabricType: "denim",
      angles: { leftElbowDeg: 105, leftKneeDeg: 95, leftShoulderDeg: 80 },
    });
    const silk = computePoseSpaceWrinkleMap({
      fabricType: "silk",
      angles: { leftElbowDeg: 105, leftKneeDeg: 95, leftShoulderDeg: 80 },
    });

    // 데님은 깊은 노멀/굵은 주름, 실크는 촘촘한 다수 주름선
    expect(denim.peakNormalStrength).toBeGreaterThan(silk.peakNormalStrength);
    expect(silk.totalActiveFoldLines).toBeGreaterThan(denim.totalActiveFoldLines);

    for (const joint of [...denim.joints, ...silk.joints]) {
      const [nx, ny, nz] = joint.tangentNormal;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1.0, 4);
      expect(nz).toBeGreaterThan(0);
    }
  });
});

describe("③ 원클릭 웹툰 공식 3면 캐릭터 설정집 생성기", () => {
  it("정면·측면·후면 3면 뷰, 12종 표정 슬롯, OKLCH 컬러 팔레트, 미터법 신장 눈금자를 완전 생성한다", () => {
    const bundle = buildOfficialCharacterTurnaroundSheet({
      characterName: "한서연",
      seriesTitle: "아틀리에 연대기",
      characterCode: "TS-01",
      heightCm: 172,
      headRatio: 7.5,
    });

    expect(bundle.spec.schemaVersion).toBe("toonstudio.turnaround.v1");
    expect(bundle.spec.views.map((v) => v.id)).toEqual(["front", "side", "back"]);
    expect(bundle.spec.views.map((v) => v.cameraYawDeg)).toEqual([0, 90, 180]);

    expect(bundle.spec.expressions).toHaveLength(12);
    expect(OFFICIAL_12_EXPRESSION_PRESETS).toHaveLength(12);
    const surprisedSlot = bundle.spec.expressions.find((e) => e.id === "expr-04-surprised");
    const neutralSlot = bundle.spec.expressions.find((e) => e.id === "expr-01-neutral");
    expect(surprisedSlot?.hairAvoidanceZMm ?? 0).toBeGreaterThan(neutralSlot?.hairAvoidanceZMm ?? 0);

    expect(bundle.spec.palette).toHaveLength(DEFAULT_CHARACTER_OKLCH_PALETTE.length);
    for (const chip of bundle.spec.palette) {
      expect(chip.oklchCss).toMatch(/^oklch\(/);
      expect(chip.contrastVsWhite).toBeGreaterThanOrEqual(1);
    }

    expect(bundle.spec.ruler.heightCm).toBe(172);
    expect(bundle.spec.ruler.headHeightCm).toBeCloseTo(172 / 7.5, 1);
    expect(bundle.spec.ruler.ticks[0]?.cm).toBe(0);
    expect(bundle.spec.ruler.ticks[bundle.spec.ruler.ticks.length - 1]?.cm).toBe(172);
    expect(bundle.spec.ruler.landmarks.some((lm) => lm.id === "crown" && lm.cm === 172)).toBe(true);
    expect(bundle.spec.ruler.landmarks.some((lm) => lm.id === "sole" && lm.cm === 0)).toBe(true);
  });

  it("생성된 SVG 마크업과 JSON 스펙 문자열이 XML/JSON 무결성 및 OKLCH 토큰 규격을 만족한다", () => {
    const bundle = buildOfficialCharacterTurnaroundSheet({
      characterName: "민수 <주연>",
      heightCm: 180,
      headRatio: 8.0,
    });

    expect(bundle.svg.startsWith("<svg ")).toBe(true);
    expect(bundle.svg.endsWith("</svg>")).toBe(true);
    expect(bundle.svg).toContain('viewBox="0 0 1920 1080"');
    expect(bundle.svg).toContain("민수 &lt;주연&gt;");
    expect(bundle.svg).toContain("180cm");
    expect(bundle.svg).toContain('data-view="front"');
    expect(bundle.svg).toContain('data-view="side"');
    expect(bundle.svg).toContain('data-view="back"');
    expect(bundle.svg).toContain('data-expression="expr-12-determined"');
    expect(bundle.svg).toContain("oklch(");

    const parsed = JSON.parse(bundle.json) as CharacterTurnaroundSheetSpec;
    expect(parsed.characterName).toBe("민수 <주연>");
    expect(parsed.ruler.heightCm).toBe(180);
    expect(parsed.expressions).toHaveLength(12);
    expect(parsed.views).toHaveLength(3);
  });
});

describe("④ StudioVrmLookdevGoldenPanel 렌더링 · 상호작용 · Calm Atelier 위생", () => {
  it("props 없이 단독 렌더링되며 초기 PASS 판정과 3대 핵심 섹션을 표시한다", () => {
    render(createElement<StudioVrmLookdevGoldenPanelProps>(StudioVrmLookdevGoldenPanel));

    expect(screen.getByTestId("studio-vrm-lookdev-golden-panel")).toBeTruthy();
    expect(screen.getByTestId("vrm-golden-ssim-section")).toBeTruthy();
    expect(screen.getByTestId("vrm-golden-hair-wrinkle-section")).toBeTruthy();
    expect(screen.getByTestId("vrm-golden-turnaround-section")).toBeTruthy();
    expect(screen.getByTestId("vrm-golden-verdict-badge").textContent).toContain("PASS");
    expect(screen.getByTestId("vrm-golden-ssim-value").textContent).toBe("1.0000");
    expect(screen.getByTestId("vrm-golden-shader-error-value").textContent).toBe("0건");
    expect(screen.getByTestId("vrm-golden-input-source").textContent).toContain("합성 RGBA 예제");
  });

  it("외부 RGBA가 PASS여도 실제 GPU·VRM 검증으로 표시하지 않는다", () => {
    const frame = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    render(createElement<StudioVrmLookdevGoldenPanelProps>(StudioVrmLookdevGoldenPanel, { customReferenceFrame: frame, customCandidateFrame: frame }));
    expect(screen.getByTestId("vrm-golden-verdict-badge").textContent).toContain("PASS");
    expect(screen.getByTestId("vrm-golden-input-source").textContent).toContain("GPU 출처는 미검증");
  });

  it("외부 기준만 주면 그 기준에서 만든 예제 후보임을 구분한다", () => {
    const frame = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    render(createElement<StudioVrmLookdevGoldenPanelProps>(StudioVrmLookdevGoldenPanel, { customReferenceFrame: frame }));
    expect(screen.getByTestId("vrm-golden-input-source").textContent).toContain("외부 기준 RGBA");
    expect(screen.getByTestId("vrm-golden-input-source").textContent).toContain("기준에서 만든 결함 예제");
  });

  it("외부 후보만 주면 합성 기준과 비교했음을 구분한다", () => {
    const frame = synthesizeVrmLookdevFrame({ width: 48, height: 48 });
    render(createElement<StudioVrmLookdevGoldenPanelProps>(StudioVrmLookdevGoldenPanel, { customCandidateFrame: frame }));
    expect(screen.getByTestId("vrm-golden-input-source").textContent).toContain("합성 기준·외부 후보 RGBA");
  });

  it("결함 시나리오 버튼 전환 시 밀키 백화·암부 뭉개짐·셰이더 오류 FAIL 판정과 콜백이 실시간 동작한다", () => {
    const onGateEvaluate = vi.fn();
    render(createElement<StudioVrmLookdevGoldenPanelProps>(StudioVrmLookdevGoldenPanel, { onGateEvaluate }));

    fireEvent.click(screen.getByTestId("vrm-golden-fault-milky-washout"));
    expect(screen.getByTestId("vrm-golden-verdict-badge").textContent).toContain("FAIL");
    expect(screen.getByTestId("vrm-golden-diagnostics").textContent).toContain("밀키 백화");

    fireEvent.click(screen.getByTestId("vrm-golden-fault-dark-collapse"));
    expect(screen.getByTestId("vrm-golden-diagnostics").textContent).toContain("암부 뭉개짐");

    fireEvent.click(screen.getByTestId("vrm-golden-fault-shader-compile-error"));
    expect(screen.getByTestId("vrm-golden-shader-error-value").textContent).toBe("1건");
    expect(screen.getByTestId("vrm-golden-diagnostics").textContent).toContain("셰이더");

    expect(onGateEvaluate).toHaveBeenCalledTimes(3);
    expect(onGateEvaluate.mock.calls[2]?.[0]?.verdict).toBe("fail");
  });

  it("표정 프리셋·관절 슬라이더·신장 눈금자·원클릭 설정집 빌드 상호작용이 정상 반영된다", () => {
    const onSheetGenerate = vi.fn();
    render(createElement<StudioVrmLookdevGoldenPanelProps>(StudioVrmLookdevGoldenPanel, { onSheetGenerate }));

    fireEvent.click(screen.getByTestId("vrm-golden-expr-neutral"));
    expect(screen.getByTestId("vrm-golden-max-z-value").textContent).toBe("+0.00 mm");

    fireEvent.click(screen.getByTestId("vrm-golden-expr-angry"));
    expect(screen.getByTestId("vrm-golden-max-z-value").textContent).not.toBe("+0.00 mm");

    fireEvent.change(screen.getByTestId("vrm-golden-elbow-slider"), { target: { value: "135" } });
    fireEvent.click(screen.getByTestId("vrm-golden-fabric-denim"));
    expect(screen.getByTestId("vrm-golden-wrinkle-peak").textContent).toContain("노멀");

    fireEvent.change(screen.getByTestId("vrm-golden-height-slider"), { target: { value: "178" } });
    expect(screen.getByTestId("vrm-golden-height-value").textContent).toBe("178 cm");
    expect(screen.getByTestId("vrm-golden-metric-ruler").textContent).toContain("178cm");

    expect(screen.getByTestId("vrm-golden-expression-slots").children).toHaveLength(12);
    expect(screen.getByTestId("vrm-golden-oklch-palette").children).toHaveLength(8);

    fireEvent.click(screen.getByTestId("vrm-golden-build-sheet-btn"));
    expect(onSheetGenerate).toHaveBeenCalledTimes(1);
    expect(onSheetGenerate.mock.calls[0]?.[0]?.spec.ruler.heightCm).toBe(178);
    expect(screen.getByTestId("vrm-golden-sheet-meta").textContent).toContain("#2");
  });

  it("파일 크기(<=800줄)·TSX 원시 색상 0건·스토리지 금지·private Map store 금지 위생 규칙을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/vrm-lookdev-golden");
    const files = [
      "webgl-golden-ssim-gate.ts",
      "hair-expression-wrinkle-rig.ts",
      "StudioVrmLookdevGoldenPanel.tsx",
      "index.ts",
      "vrm-lookdev-golden.test.ts",
    ];

    for (const file of files) {
      const fullPath = path.join(dir, file);
      expect(existsSync(fullPath)).toBe(true);
      const src = readFileSync(fullPath, "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "vrm-lookdev-golden.test.ts") {
        expect(src).not.toMatch(/\blocalStorage\b/);
        expect(src).not.toMatch(/\bsessionStorage\b/);
        expect(src).not.toMatch(/\bprivate\s+(?:readonly\s+)?store\b/);
      }
    }

    const panelSrc = readFileSync(path.join(dir, "StudioVrmLookdevGoldenPanel.tsx"), "utf8");
    expect(panelSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelSrc).not.toMatch(/\brgba?\s*\(/i);
    expect(panelSrc).not.toMatch(/\bhsla?\s*\(/i);
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
  });
});
