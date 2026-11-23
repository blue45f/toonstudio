// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioNextgenDrawingFrontierPanel,
  type StudioNextgenDrawingFrontierSnapshot,
} from "./StudioNextgenDrawingFrontierPanel";
import {
  ALL_COMPLIANCE_PLATFORMS,
  DEMO_WEBTOON_GLOSSARY,
  SmartPropSymbolBank,
  applyLinterFixes,
  computeCameraCompositionOverlay,
  createDemoSmartPropBank,
  lintDialogueComplianceAndGlossary,
} from "./camera-linter-prop-bank";
import {
  HYBRID_MEDIUM_LIST,
  WetnessMapEngine,
  compositeLinearFloat16Layers,
  computeControlPointChecksum,
  createDemoCharacterSilhouette,
  createDemoHdrGradientLayers,
  createDemoHybridStroke,
  float16BitsToFloat32,
  float32ToFloat16Bits,
  generateAutoCelShadingLayers,
  linearToSrgb,
  rebindHybridStrokeMedium,
  srgbToLinear,
} from "./hybrid-stroke-wetness-hdr";

afterEach(cleanup);

describe("비파괴 하이브리드 스트로크 · 건조 습도맵 · 2D 법선 셀음영 · Linear-Float16 HDR", () => {
  it("비파괴 하이브리드 스트로크가 5종 매체 순환 교체 및 굵기 스케일 변경 후에도 제어점 이력을 무손실 보존한다", () => {
    const initial = createDemoHybridStroke("pencil");
    const initialChecksum = computeControlPointChecksum(initial.controlPoints);
    const results = new Map<string, ReturnType<typeof rebindHybridStrokeMedium>>();

    let current = initial;
    for (const medium of HYBRID_MEDIUM_LIST) {
      const res = rebindHybridStrokeMedium(current, { targetMedium: medium, widthScale: 1.0 });
      expect(res.preservedControlPointCount).toBe(initial.controlPoints.length);
      expect(res.controlPointChecksum).toBe(initialChecksum);
      expect(res.stroke.controlPoints).toEqual(initial.controlPoints);
      expect(res.activePixelCount).toBeGreaterThan(20);
      results.set(medium, res);
      current = res.stroke;
    }

    expect(current.mediumHistory).toHaveLength(1 + HYBRID_MEDIUM_LIST.length);
    const watercolor = results.get("watercolor");
    const oil = results.get("oil");
    const pencil = results.get("pencil");
    const charcoal = results.get("charcoal");
    expect(watercolor?.wetnessInjectedMean ?? 0).toBeGreaterThan(0.7);
    expect(watercolor?.meanEdgePigmentPool01 ?? 0).toBeGreaterThan(0.6);
    expect(oil?.meanImpastoHeight01 ?? 0).toBeGreaterThan(0.4);
    expect(pencil?.wetnessInjectedMean).toBe(0);
    expect(charcoal?.meanStrokeWidthPx ?? 0).toBeGreaterThan(watercolor?.meanStrokeWidthPx ?? 99);

    // 굵기 스케일 0.5x vs 2.0x 재합성 시 제어점 체크섬 불변 + 폭/픽셀 비례 변화
    const thin = rebindHybridStrokeMedium(current, { targetMedium: "pencil", widthScale: 0.5 });
    const thick = rebindHybridStrokeMedium(current, { targetMedium: "pencil", widthScale: 2.0 });
    expect(thin.controlPointChecksum).toBe(initialChecksum);
    expect(thick.controlPointChecksum).toBe(initialChecksum);
    expect(thick.meanStrokeWidthPx).toBeGreaterThan(thin.meanStrokeWidthPx * 2.5);
    expect(thick.activePixelCount).toBeGreaterThan(thin.activePixelCount);
  });

  it("실시간 습도맵이 Wet→Damp→Dry 감쇠·젖은 경계 한정 번짐·헤어드라이어 즉시 건조(0.000)를 정확히 수행한다", () => {
    const wc = new WetnessMapEngine({ width: 32, height: 24, medium: "watercolor" });
    const oil = new WetnessMapEngine({ width: 32, height: 24, medium: "oil" });

    wc.depositWetStroke(12, 12, 5, 0.95, { r: 40, g: 120, b: 220 });
    oil.depositWetStroke(12, 12, 5, 0.95, { r: 40, g: 120, b: 220 });

    // 젖은 중심부는 번짐 허용, 떨어진 마른 영역은 번짐 차단
    const wetEval = wc.evaluateBoundaryBleed(12, 12);
    const dryEval = wc.evaluateBoundaryBleed(30, 22);
    expect(wetEval.state).toBe("wet");
    expect(wetEval.canBleed).toBe(true);
    expect(wetEval.bleedCoefficient01).toBeGreaterThan(0.5);
    expect(dryEval.state).toBe("dry");
    expect(dryEval.canBleed).toBe(false);
    expect(dryEval.bleedCoefficient01).toBe(0);

    // 시간 경과 감쇠: 수채화가 유화보다 빠르게 건조되고 마른 외곽 셀은 0 유지
    const wcAfter15 = wc.stepTime(15);
    const oilAfter15 = oil.stepTime(15);
    expect(wcAfter15.diffusedCellCount).toBeGreaterThan(0);
    expect(wcAfter15.maxWetness01).toBeLessThan(0.95);
    expect(wcAfter15.maxWetness01).toBeLessThan(oilAfter15.maxWetness01);
    expect(wc.getWetnessAt(30, 22)).toBe(0);

    // 충분한 시간이 흐르면 Damp/Dry 단계로 전이
    const wcAfter120 = wc.stepTime(120);
    expect(wcAfter120.wetCellCount).toBe(0);
    expect(wcAfter120.maxWetness01).toBeLessThan(0.08);

    // 국소 스팟 드라이어: 노즐 내부만 0.000 건조, 외부 젖은 영역은 보존
    const spotEngine = new WetnessMapEngine({ width: 32, height: 24, medium: "watercolor" });
    spotEngine.depositWetStroke(8, 12, 4, 0.92);
    spotEngine.depositWetStroke(24, 12, 4, 0.92);
    const spotRes = spotEngine.applyHairDryerInstantDry({ cx: 8, cy: 12, radius: 5 });
    expect(spotRes.scope).toBe("spot");
    expect(spotRes.driedCellCount).toBeGreaterThan(10);
    expect(spotEngine.getWetnessAt(8, 12)).toBe(0);
    expect(spotEngine.getWetnessAt(24, 12)).toBeGreaterThan(0.7);

    // 전체 캔버스 헤어드라이어 즉시 건조: 잔여 최대/평균 습도 정확히 0.000
    const fullDry = spotEngine.applyHairDryerInstantDry();
    expect(fullDry.scope).toBe("canvas");
    expect(fullDry.residualMaxWetness).toBe(0);
    expect(fullDry.residualMeanWetness).toBe(0);
    const snap = spotEngine.getSnapshot();
    expect(snap.maxWetness01).toBe(0);
    expect(snap.wetCellCount).toBe(0);
    expect(snap.dampCellCount).toBe(0);
  });

  it("2D 법선 추정 자동 셀 음영이 1차 그림자·림라이트·반사광 3개 마스크를 생성하고 광원 핀 이동에 반응한다", () => {
    const w = 64;
    const h = 64;
    const silhouette = createDemoCharacterSilhouette(w, h);

    const leftLight = generateAutoCelShadingLayers({ width: w, height: h, silhouetteAlpha: silhouette, lightPin: { lx: -1, ly: -0.35, lz: 0.6 } });
    const rightLight = generateAutoCelShadingLayers({ width: w, height: h, silhouetteAlpha: silhouette, lightPin: { lx: 1, ly: -0.35, lz: 0.6 } });
    const topLight = generateAutoCelShadingLayers({ width: w, height: h, silhouetteAlpha: silhouette, lightPin: { lx: 0, ly: -1, lz: 0.5 } });
    const bottomLight = generateAutoCelShadingLayers({ width: w, height: h, silhouetteAlpha: silhouette, lightPin: { lx: 0, ly: 1, lz: 0.5 } });

    // 3개 분리 레이어 모두 유효하게 생성되며 실루엣 바깥 누수 0픽셀
    for (const res of [leftLight, rightLight]) {
      expect(res.shadowCoverageRatio01).toBeGreaterThan(0.15);
      expect(res.rimCoverageRatio01).toBeGreaterThan(0.03);
      expect(res.bounceCoverageRatio01).toBeGreaterThan(0.01);
      for (let i = 0; i < w * h; i += 1) {
        if ((silhouette[i] ?? 0) < 128) {
          expect(res.primaryShadowMask[i]).toBe(0);
          expect(res.rimLightMask[i]).toBe(0);
          expect(res.bounceLightMask[i]).toBe(0);
        }
      }
    }

    // 좌측 광원 → 그림자는 우측(>0.52), 림라이트는 좌측(<0.48), 반사광은 그림자 측(>0.52)
    expect(leftLight.shadowCentroidX01).toBeGreaterThan(0.55);
    expect(leftLight.rimCentroidX01).toBeLessThan(0.45);
    expect(leftLight.bounceCentroidX01).toBeGreaterThan(0.55);

    // 우측 광원 → 좌우 정확히 반전
    expect(rightLight.shadowCentroidX01).toBeLessThan(0.45);
    expect(rightLight.rimCentroidX01).toBeGreaterThan(0.55);
    expect(rightLight.bounceCentroidX01).toBeLessThan(0.45);

    // 상단 vs 하단 광원 → 그림자 Y 중심 상하 반전
    expect(topLight.shadowCentroidY01).toBeGreaterThan(bottomLight.shadowCentroidY01 + 0.12);
  });

  it("Linear-Float16 HDR 합성과 삼각 PDF 블루노이즈 디더링이 HDR 휘도를 보존하고 8-bit 그라데이션 밴딩을 제거한다", () => {
    for (const v of [0, 0.02, 0.18, 0.5, 0.85, 1.0]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 5);
    }
    for (const hVal of [0, 0.0005, 0.25, 1.0, 2.5, 12.0]) {
      expect(float16BitsToFloat32(float32ToFloat16Bits(hVal))).toBeCloseTo(hVal, 2);
    }

    // 미세 저기울기 선형 그라데이션 + HDR 발광 레이어 합성
    const layers = createDemoHdrGradientLayers(128, 32);
    const dithered = compositeLinearFloat16Layers({ width: 128, height: 32, layers, enableTpdfBlueNoiseDither: true });
    const undithered = compositeLinearFloat16Layers({ width: 128, height: 32, layers, enableTpdfBlueNoiseDither: false });

    expect(dithered.linearFloat16Buffer).toHaveLength(128 * 32 * 4);
    expect(dithered.metrics.peakLinearLuminance).toBeGreaterThan(1.5);
    expect(dithered.metrics.hdrSpecularPixelCount).toBeGreaterThan(20);
    expect(dithered.metrics.ditherMode).toBe("tpdf-blue-noise");
    expect(undithered.metrics.ditherMode).toBe("none");

    // 삼각 PDF 블루노이즈 디더링이 평탄 계단 밴딩 구간을 크게 분해하고 국소 평균 오차를 개선함
    expect(dithered.metrics.naiveBandingRunMax).toBeGreaterThanOrEqual(8);
    expect(dithered.metrics.ditheredBandingRunMax).toBeLessThan(dithered.metrics.naiveBandingRunMax);
    expect(dithered.metrics.bandingEliminationRatio01).toBeGreaterThanOrEqual(0.6);
    expect(dithered.metrics.ditheredRmsErrorVsLinear).toBeLessThan(dithered.metrics.unditheredRmsErrorVsLinear);
  });
});

describe("카메라 화각 오버레이 · 말풍선 심의/고유명사 린터 · 스마트 심볼 뱅크", () => {
  it("24/35/50/85mm 카메라 화각·3분할·황금나선·아이레벨 소실점을 광학 공식대로 계산한다", () => {
    const cam24 = computeCameraCompositionOverlay({ canvasWidthPx: 800, canvasHeightPx: 500, focalLengthMm: 24, eyeLevelRatio01: 0.35, spiralCorner: "top-right" });
    const cam35 = computeCameraCompositionOverlay({ canvasWidthPx: 800, canvasHeightPx: 500, focalLengthMm: 35, eyeLevelRatio01: 0.35, spiralCorner: "top-right" });
    const cam50 = computeCameraCompositionOverlay({ canvasWidthPx: 800, canvasHeightPx: 500, focalLengthMm: 50, eyeLevelRatio01: 0.5, spiralCorner: "top-right" });
    const cam85 = computeCameraCompositionOverlay({ canvasWidthPx: 800, canvasHeightPx: 500, focalLengthMm: 85, eyeLevelRatio01: 0.72, spiralCorner: "bottom-left" });

    // 화각 단조 감소 및 압축률·소실점 간격 단조 증가
    expect(cam24.horizontalFovDeg).toBeGreaterThan(cam35.horizontalFovDeg);
    expect(cam35.horizontalFovDeg).toBeGreaterThan(cam50.horizontalFovDeg);
    expect(cam50.horizontalFovDeg).toBeGreaterThan(cam85.horizontalFovDeg);
    expect(cam85.compressionIndex).toBeGreaterThan(cam50.compressionIndex);
    expect(cam85.eyeLevel.vanishingSpanPx).toBeGreaterThan(cam24.eyeLevel.vanishingSpanPx * 3);

    // 3분할선 & 황금나선 구조 검증
    expect(cam24.ruleOfThirds.powerPoints).toHaveLength(4);
    expect(cam24.ruleOfThirds.verticalLines[0].x1).toBeCloseTo(800 / 3, 2);
    expect(cam24.goldenSpiral.phi).toBeCloseTo(1.61803, 4);
    expect(cam24.goldenSpiral.subdivisions).toHaveLength(7);
    expect(cam24.goldenSpiral.curvePoints.length).toBeGreaterThanOrEqual(56);
    expect(cam85.goldenSpiral.focalEye.x).not.toBeCloseTo(cam24.goldenSpiral.focalEye.x, 1);

    // 아이레벨 피치 부호 반전
    expect(cam24.eyeLevel.cameraPitchDeg).toBeGreaterThan(0);
    expect(cam50.eyeLevel.cameraPitchDeg).toBeCloseTo(0, 4);
    expect(cam85.eyeLevel.cameraPitchDeg).toBeLessThan(0);
  });

  it("말풍선 린터가 고유명사 오타·맞춤법/반복 오탈자·4대 플랫폼 심의 주의 표현을 정확한 오프셋으로 검출 및 교정한다", () => {
    const sample = "강서운은 아르카데아에서 정말 정말 몇일 기다려도 안되! 죽어버려, 불법 도박, 미성년 음주, underage drinking 대사를 점검하자.";
    const report = lintDialogueComplianceAndGlossary({
      text: sample,
      glossary: DEMO_WEBTOON_GLOSSARY,
      targetPlatforms: ALL_COMPLIANCE_PLATFORMS,
    });

    // 모든 검출 이슈의 UTF-16 오프셋이 원문 부분문자열과 100% 일치
    for (const issue of report.issues) {
      expect(sample.slice(issue.startOffset, issue.endOffset)).toBe(issue.matchedText);
      expect(issue.suggestions.length).toBeGreaterThan(0);
    }

    // 3종 카테고리 및 4대 플랫폼(네이버·카카오·일본·북미) 모두 검출 확인
    expect(report.countsByCategory["glossary-typo"]).toBeGreaterThanOrEqual(2); // 강서운(퍼지 1글자) + 아르카데아
    expect(report.countsByCategory["spelling-typo"]).toBeGreaterThanOrEqual(3); // 정말 정말 + 몇일 + 안되
    expect(report.countsByCategory["platform-compliance"]).toBeGreaterThanOrEqual(4);
    expect(report.countsByPlatform.naver).toBeGreaterThanOrEqual(1);
    expect(report.countsByPlatform.kakao).toBeGreaterThanOrEqual(1);
    expect(report.countsByPlatform.japan).toBeGreaterThanOrEqual(1);
    expect(report.countsByPlatform["north-america"]).toBeGreaterThanOrEqual(1);
    expect(report.readyForPlatforms.naver).toBe(false);
    expect(report.readyForPlatforms.kakao).toBe(false);
    expect(report.readyForPlatforms.japan).toBe(false);
    expect(report.readyForPlatforms["north-america"]).toBe(false);

    // 일괄 교정 적용 시 모든 오타·심의 위반 해소 및 점수 100 회복
    const fixedText = applyLinterFixes(sample, report.issues);
    expect(fixedText).toContain("강서윤");
    expect(fixedText).toContain("아르카디아");
    expect(fixedText).toContain("며칠");
    const fixedReport = lintDialogueComplianceAndGlossary({ text: fixedText, glossary: DEMO_WEBTOON_GLOSSARY });
    expect(fixedReport.issues).toHaveLength(0);
    expect(fixedReport.complianceScore0To100).toBe(100);
    expect(fixedReport.readyForPlatforms.naver).toBe(true);
  });

  it("스마트 심볼 뱅크가 마스터 수정 시 연결 컷만 선택적 일괄 전파하고 언링크 컷을 완벽 보호한다", () => {
    const bank = createDemoSmartPropBank();
    expect(bank.getBankSummary()).toEqual({ masterCount: 3, instanceCount: 7, linkedCount: 6, unlinkedCount: 1 });

    // 전체 전파: 연결된 c1·c2만 v2(4.0px)로 갱신, 언링크된 c3는 v1(2.5px) 유지
    const fullProp = bank.updateMasterAndPropagate("sym-relic-blade", { strokeWeightPx: 4.0, widthPx: 54 });
    expect(fullProp.newVersion).toBe(2);
    expect(fullProp.updatedInstanceIds).toEqual(["inst-blade-c1", "inst-blade-c2"]);
    expect(fullProp.skippedUnlinkedInstanceIds).toEqual(["inst-blade-c3"]);
    expect(bank.getInstance("inst-blade-c1")?.resolvedGeometry.strokeWeightPx).toBe(4.0);
    expect(bank.getInstance("inst-blade-c2")?.syncedVersion).toBe(2);
    expect(bank.getInstance("inst-blade-c3")?.syncedVersion).toBe(1);
    expect(bank.getInstance("inst-blade-c3")?.resolvedGeometry.strokeWeightPx).toBe(2.5);

    // 선택 컷 전파(targetCutIds: ["cut-01"]): c1만 v3로 갱신, 연결된 c2는 미선택 스킵, 언링크 c3는 보호
    const selective = bank.updateMasterAndPropagate("sym-relic-blade", { strokeWeightPx: 5.5 }, { targetCutIds: ["cut-01"] });
    expect(selective.updatedInstanceIds).toEqual(["inst-blade-c1"]);
    expect(selective.skippedUnselectedInstanceIds).toEqual(["inst-blade-c2"]);
    expect(selective.skippedUnlinkedInstanceIds).toEqual(["inst-blade-c3"]);
    expect(bank.getInstance("inst-blade-c1")?.syncedVersion).toBe(3);
    expect(bank.getInstance("inst-blade-c2")?.syncedVersion).toBe(2);

    // 재연결 시 최신 v3 즉시 동기화
    const relinked = bank.relinkInstance("inst-blade-c3", true);
    expect(relinked.linked).toBe(true);
    expect(relinked.syncedVersion).toBe(3);
    expect(relinked.resolvedGeometry.strokeWeightPx).toBe(5.5);

    // 미등록 마스터 예외 방어
    const emptyBank = new SmartPropSymbolBank();
    expect(() => emptyBank.updateMasterAndPropagate("missing", { strokeWeightPx: 2 })).toThrow();
  });
});

describe("StudioNextgenDrawingFrontierPanel 3탭 UI · KO/EN · Calm Atelier 위생 계약", () => {
  it("무-props 마운트 및 3개 탭 핵심 인터랙션과 EN 모드 한글 0자 계약을 충족한다", () => {
    const snapshots: StudioNextgenDrawingFrontierSnapshot[] = [];
    const onSnapshotChange = vi.fn((snap: StudioNextgenDrawingFrontierSnapshot) => { snapshots.push(snap); });

    render(<StudioNextgenDrawingFrontierPanel locale="ko" onSnapshotChange={onSnapshotChange} />);

    // 탭 1: 하이브리드 스트로크 매체 전환 시 제어점 체크섬 불변 + 헤어드라이어 0.000 + 자동 셀음영 광원 반전
    const checksumBefore = screen.getByTestId("hybrid-checksum").textContent;
    fireEvent.click(screen.getByRole("button", { name: "목탄 차콜" }));
    expect(screen.getByTestId("hybrid-checksum").textContent).toBe(checksumBefore);
    expect(screen.getByTestId("hybrid-wetness-deposit").textContent).toBe("0%");

    fireEvent.click(screen.getByRole("button", { name: /즉시 건조\(드라이어\)/i }));
    expect(screen.getByTestId("wetness-max-value").textContent).toBe("0.000");
    expect(screen.getByTestId("wet-cell-count").textContent).toBe("0");
    expect(screen.getByTestId("dryer-banner").textContent).toContain("0.000");

    const leftShadowCx = Number.parseFloat(screen.getByTestId("cel-shadow-cx").textContent ?? "0");
    fireEvent.click(screen.getByRole("button", { name: "우상단 광원" }));
    const rightShadowCx = Number.parseFloat(screen.getByTestId("cel-shadow-cx").textContent ?? "0");
    expect(leftShadowCx).toBeGreaterThan(0.5);
    expect(rightShadowCx).toBeLessThan(0.5);

    // 탭 2: Linear-Float16 HDR 디더링 토글 + 85mm 화각 전환
    fireEvent.click(screen.getByRole("tab", { name: /16-bit HDR/i }));
    expect(Number.parseFloat(screen.getByTestId("hdr-peak-lum").textContent ?? "0")).toBeGreaterThan(1.5);
    const ditheredRun = Number.parseInt(screen.getByTestId("hdr-max-run").textContent ?? "99", 10);
    fireEvent.click(screen.getByRole("button", { name: /TPDF 블루노이즈 ON/i }));
    const unditheredRun = Number.parseInt(screen.getByTestId("hdr-max-run").textContent ?? "0", 10);
    expect(unditheredRun).toBeGreaterThan(ditheredRun);

    const fov35 = Number.parseFloat(screen.getByTestId("camera-fov-badge").textContent ?? "0");
    fireEvent.click(screen.getByRole("button", { name: "85mm" }));
    const fov85 = Number.parseFloat(screen.getByTestId("camera-fov-badge").textContent ?? "0");
    expect(fov85).toBeLessThan(fov35);

    // 탭 3: 말풍선 린터 일괄 순화 + 스마트 심볼 일괄 전파(언링크 보호)
    fireEvent.click(screen.getByRole("tab", { name: /심의\/고유명사 린터/i }));
    expect(screen.getByTestId("linter-issue-count").textContent).not.toContain("0건");
    fireEvent.click(screen.getByRole("button", { name: /심의 포함 일괄 순화/i }));
    expect(screen.getByTestId("linter-issue-count").textContent).toContain("0건");

    fireEvent.click(screen.getByRole("button", { name: /마스터 선두께 \+1\.0px/i }));
    expect(screen.getByTestId("symbol-master-version").textContent).toBe("v2");
    expect(screen.getByTestId("symbol-propagation-summary").textContent).toContain("갱신 2컷 · 언링크 보호 1컷");
    expect(screen.getByTestId("symbol-inst-inst-blade-c1").textContent).toContain("v2 · 3.5px");
    expect(screen.getByTestId("symbol-inst-inst-blade-c3").textContent).toContain("v1 · 2.5px");
    expect(snapshots.at(-1)?.lastPropagation?.skippedUnlinkedInstanceIds).toEqual(["inst-blade-c3"]);

    // 영문 모드(locale="en") 전 탭 한글 0자 검증
    cleanup();
    const { container } = render(<StudioNextgenDrawingFrontierPanel locale="en" />);
    expect(container.textContent ?? "").not.toMatch(/[가-힣]/u);
    fireEvent.click(screen.getByRole("tab", { name: /16-bit HDR/i }));
    expect(container.textContent ?? "").not.toMatch(/[가-힣]/u);
    fireEvent.click(screen.getByRole("tab", { name: /Dialogue Linter/i }));
    expect(container.textContent ?? "").not.toMatch(/[가-힣]/u);

    // 무-props 기본 마운트 검증
    cleanup();
    render(<StudioNextgenDrawingFrontierPanel />);
    expect(screen.getByTestId("studio-nextgen-drawing-frontier-panel")).toBeTruthy();
  });

  it("소유 폴더의 배럴 금지·줄 수 상한·Calm Atelier 시맨틱 토큰·원시색상/영속저장소 금지 계약을 충족한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/nextgen-drawing-frontier");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);

    const eng1 = readFileSync(resolve(dir, "hybrid-stroke-wetness-hdr.ts"), "utf8");
    const eng2 = readFileSync(resolve(dir, "camera-linter-prop-bank.ts"), "utf8");
    const panel = readFileSync(resolve(dir, "StudioNextgenDrawingFrontierPanel.tsx"), "utf8");
    const testSrc = readFileSync(resolve(dir, "nextgen-drawing-frontier.test.tsx"), "utf8");

    expect(eng1.split("\n").length).toBeLessThanOrEqual(700);
    expect(eng2.split("\n").length).toBeLessThanOrEqual(680);
    expect(panel.split("\n").length).toBeLessThanOrEqual(460);
    expect(testSrc.split("\n").length).toBeLessThanOrEqual(750);

    const forbiddenStorageRegex = new RegExp(`\\b${"local"}${"Storage"}\\b`);
    const hexRegex = new RegExp(`#[0-9a-fA-F]{3,8}\\b`);
    const rgbRegex = new RegExp(`\\b${"rgb"}a?\\s*\\(`, "i");
    const hslRegex = new RegExp(`\\b${"hsl"}a?\\s*\\(`, "i");

    for (const src of [eng1, eng2, panel]) {
      expect(src).not.toMatch(forbiddenStorageRegex);
      expect(src).not.toMatch(hexRegex);
      expect(src).not.toMatch(rgbRegex);
      expect(src).not.toMatch(hslRegex);
    }

    expect(panel).not.toMatch(
      /\b(?:bg|text|border|stroke|fill)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/,
    );
    expect(panel).not.toContain("transition-all");
    expect(panel).toContain("[word-break:keep-all]");
    expect(panel).toContain("tabular-nums");
  });
});
