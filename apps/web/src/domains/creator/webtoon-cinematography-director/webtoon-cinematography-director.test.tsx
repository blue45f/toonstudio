// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CINEMA_FOCAL_LENGTHS,
  DEMO_CINEMATOGRAPHY_SCENES,
  DEMO_VERTICAL_STRIPS,
  FULL_FRAME_SENSOR_MM,
  GOLDEN_SPIRAL_POLE_MAJOR,
  GOLDEN_SPIRAL_POLE_MINOR,
  StudioCinematographyDirectorPanel,
  analyzeVerticalEyeFlow,
  applyEyeFlowPrescriptions,
  applySafe180CameraFixes,
  audit180DegreeRule,
  buildEyeFlowSvgPath,
  computeCocDiameterMm,
  computePinholeOptics,
  evaluateCompositionHarmony,
  generateGoldenSpiralPathPoints,
  projectWorldPointToFrame,
  type CameraShotSpec,
  type VerticalStripInput,
} from "./index";

afterEach(cleanup);

describe("1. 35mm 풀프레임 핀홀 광학 · 피사계 심도 · 3D 투영 (cinematography-camera-engine)", () => {
  it("24/35/50/85/135mm 5종 시네마 렌즈의 수평·수직 화각이 해석적 핀홀 공식과 0.05° 이내로 일치하고 단조 감소한다", () => {
    let prevHFov = Number.POSITIVE_INFINITY;
    let prevVFov = Number.POSITIVE_INFINITY;

    for (const mm of CINEMA_FOCAL_LENGTHS) {
      const res = computePinholeOptics({ focalLengthMm: mm, apertureFStop: 2.8, focusDistanceM: 3.0 });
      const expectedH = 2 * Math.atan(FULL_FRAME_SENSOR_MM.widthMm / (2 * mm)) * (180 / Math.PI);
      const expectedV = 2 * Math.atan(FULL_FRAME_SENSOR_MM.heightMm / (2 * mm)) * (180 / Math.PI);

      expect(Math.abs(res.horizontalFovDeg - expectedH)).toBeLessThan(0.05);
      expect(Math.abs(res.verticalFovDeg - expectedV)).toBeLessThan(0.05);
      expect(res.horizontalFovDeg).toBeLessThan(prevHFov);
      expect(res.verticalFovDeg).toBeLessThan(prevVFov);

      prevHFov = res.horizontalFovDeg;
      prevVFov = res.verticalFovDeg;
    }
  });

  it("광각(24mm)은 원근 왜곡률과 근원 배율차가 크고 망원(135mm)은 배경 압축 계수가 높다", () => {
    const wide = computePinholeOptics({ focalLengthMm: 24, apertureFStop: 2.8, focusDistanceM: 3.0 });
    const normal = computePinholeOptics({ focalLengthMm: 50, apertureFStop: 2.8, focusDistanceM: 3.0 });
    const tele = computePinholeOptics({ focalLengthMm: 135, apertureFStop: 2.8, focusDistanceM: 3.0 });

    expect(wide.distortionClass).toBe("wide-exaggerated");
    expect(normal.distortionClass).toBe("natural-narrative");
    expect(tele.distortionClass).toBe("telephoto-compressed");

    expect(wide.perspectiveDistortionPercent).toBeGreaterThan(normal.perspectiveDistortionPercent);
    expect(normal.perspectiveDistortionPercent).toBeGreaterThan(tele.perspectiveDistortionPercent);
    expect(wide.foreshorteningRatioPercent).toBeGreaterThan(tele.foreshorteningRatioPercent);
    expect(tele.telephotoCompressionFactor).toBeCloseTo(2.7, 2);
  });

  it("개방 조리개(f/1.4)와 망원 렌즈에서 피사계 심도가 얕아지고 배경 CoC 블러 지름이 정확히 커진다", () => {
    const shallow = computePinholeOptics({
      focalLengthMm: 85,
      apertureFStop: 1.4,
      focusDistanceM: 2.5,
      backgroundDistanceM: 12.0,
    });
    const deep = computePinholeOptics({
      focalLengthMm: 85,
      apertureFStop: 11,
      focusDistanceM: 2.5,
      backgroundDistanceM: 12.0,
    });

    expect(shallow.totalDepthOfFieldM).not.toBeNull();
    expect(deep.totalDepthOfFieldM).not.toBeNull();
    expect(shallow.totalDepthOfFieldM ?? 99).toBeLessThan(deep.totalDepthOfFieldM ?? 0);
    expect(shallow.backgroundCocMm).toBeGreaterThan(deep.backgroundCocMm * 5);
    expect(shallow.estimatedBlurRadiusPx).toBeGreaterThan(deep.estimatedBlurRadiusPx * 5);
    expect(shallow.hyperfocalDistanceM).toBeGreaterThan(deep.hyperfocalDistanceM);

    // 초점면 자체(planeDistanceM === focusDistanceM)에서는 CoC가 0이다
    expect(computeCocDiameterMm(85, 1.4, 2.5, 2.5)).toBeCloseTo(0, 6);
  });

  it("projectWorldPointToFrame은 시선 정중앙을 (0.5, 0.5)에 투영하고 좌우·상하·후방 컬링을 정확히 판정한다", () => {
    const cam = { position: { x: 0, y: 1.6, z: 5 }, lookAt: { x: 0, y: 1.6, z: 0 } };
    const center = projectWorldPointToFrame({ x: 0, y: 1.6, z: 0 }, cam, 50);
    const leftPt = projectWorldPointToFrame({ x: -1, y: 1.6, z: 0 }, cam, 50);
    const rightPt = projectWorldPointToFrame({ x: 1, y: 1.6, z: 0 }, cam, 50);
    const topPt = projectWorldPointToFrame({ x: 0, y: 2.4, z: 0 }, cam, 50);
    const behindPt = projectWorldPointToFrame({ x: 0, y: 1.6, z: 8 }, cam, 50);

    expect(center.u).toBeCloseTo(0.5, 3);
    expect(center.v).toBeCloseTo(0.5, 3);
    expect(center.inFront).toBe(true);
    expect(center.insideFrame).toBe(true);
    expect(leftPt.u).toBeLessThan(0.5);
    expect(rightPt.u).toBeGreaterThan(0.5);
    expect(topPt.v).toBeLessThan(0.5);
    expect(behindPt.inFront).toBe(false);
    expect(behindPt.insideFrame).toBe(false);
  });
});

describe("2. 180도 법칙(Line-of-Action) 축 넘침 감지 및 안전 반사 보정", () => {
  it("연속 컷에서 외적 (B-A)×(C-A) 부호가 반전되면 축 넘침 위반과 화면 좌우 반전을 정확히 검출한다", () => {
    const scene = DEMO_CINEMATOGRAPHY_SCENES[0]!;
    const report = audit180DegreeRule({
      actorA: scene.actorA,
      actorB: scene.actorB,
      shots: scene.shots,
    });

    expect(report.compliant).toBe(false);
    expect(report.establishedSide).toBe("positive");
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.toShotId).toBe("cut-03-cross-error");
    expect(report.violations[0]?.prevCrossProduct).toBeGreaterThan(0);
    expect(report.violations[0]?.currCrossProduct).toBeLessThan(0);

    const badAudit = report.shotAudits.find((s) => s.shotId === "cut-03-cross-error");
    expect(badAudit?.crossedAxis).toBe(true);
    expect(badAudit?.screenOrder).toBe("B-left-A-right");
    expect(badAudit?.suggestedSafePosition).not.toBeNull();
  });

  it("거울 반사 대안 좌표(applySafe180CameraFixes)를 적용하면 모든 컷의 외적 부호가 복원되어 180도 법칙을 100% 통과한다", () => {
    const scene = DEMO_CINEMATOGRAPHY_SCENES[0]!;
    const initial = audit180DegreeRule({
      actorA: scene.actorA,
      actorB: scene.actorB,
      shots: scene.shots,
    });
    const fixedShots = applySafe180CameraFixes(scene.shots, initial);
    const reAudited = audit180DegreeRule({
      actorA: scene.actorA,
      actorB: scene.actorB,
      shots: fixedShots,
    });

    expect(reAudited.compliant).toBe(true);
    expect(reAudited.violations).toHaveLength(0);
    expect(reAudited.continuityScore).toBeGreaterThan(initial.continuityScore);

    const fixedCut3 = reAudited.shotAudits.find((s) => s.shotId === "cut-03-cross-error");
    expect(fixedCut3?.side).toBe("positive");
    expect(fixedCut3?.screenOrder).toBe("A-left-B-right");
    expect(fixedCut3?.cameraPosition.z).toBeCloseTo(2.6, 1);
  });

  it("정석 OTS 대화 씬은 위반 0건으로 통과하고 중립 브리지 컷(isNeutralBridgeCut)은 합법적 축 전환을 허용한다", () => {
    const cafe = DEMO_CINEMATOGRAPHY_SCENES[1]!;
    const cafeReport = audit180DegreeRule({
      actorA: cafe.actorA,
      actorB: cafe.actorB,
      shots: cafe.shots,
    });
    expect(cafeReport.compliant).toBe(true);
    expect(cafeReport.continuityScore).toBe(100);

    const bridgeShots: readonly CameraShotSpec[] = [
      { shotId: "b1", labelKo: "컷 1", labelEn: "C1", cameraPosition: { x: 0, z: 3.5 }, focalLengthMm: 35 },
      { shotId: "b2", labelKo: "중립 축상 컷", labelEn: "Neutral", cameraPosition: { x: 0, z: 0.05 }, focalLengthMm: 50, isNeutralBridgeCut: true },
      { shotId: "b3", labelKo: "새 반구 컷", labelEn: "New Side", cameraPosition: { x: 0, z: -3.5 }, focalLengthMm: 85 },
    ];
    const bridgeReport = audit180DegreeRule({
      actorA: { id: "a", nameKo: "A", nameEn: "A", position: { x: -2, z: 0 } },
      actorB: { id: "b", nameKo: "B", nameEn: "B", position: { x: 2, z: 0 } },
      shots: bridgeShots,
    });
    expect(bridgeReport.compliant).toBe(true);
    expect(bridgeReport.violations).toHaveLength(0);
  });

  it("같은 반구에서 30도 미만의 유사 화각 연속 컷에는 점프컷 주의(jumpCutAdvisory)를 표시한다", () => {
    const jumpShots: readonly CameraShotSpec[] = [
      { shotId: "j1", labelKo: "컷 1", labelEn: "C1", cameraPosition: { x: 0.0, z: 4.0 }, focalLengthMm: 50 },
      { shotId: "j2", labelKo: "컷 2", labelEn: "C2", cameraPosition: { x: 0.4, z: 3.9 }, focalLengthMm: 50 },
    ];
    const report = audit180DegreeRule({
      actorA: { id: "a", nameKo: "A", nameEn: "A", position: { x: -2, z: 0 } },
      actorB: { id: "b", nameKo: "B", nameEn: "B", position: { x: 2, z: 0 } },
      shots: jumpShots,
    });
    expect(report.compliant).toBe(true);
    expect(report.jumpCutCount).toBe(1);
    expect(report.shotAudits[1]?.jumpCutAdvisory).toBe(true);
  });
});

describe("3. 삼분할 · 황금나선 · 헤드룸 · 시선 여백(Lookroom) 구도 조화 점수", () => {
  it("삼분할 교차점·적정 헤드룸·개방 시선 여백 조합은 높은 종합 점수(85+)와 masterpiece 등급을 받는다", () => {
    const ideal = evaluateCompositionHarmony({
      subjectFocalPoint: { x: 1 / 3, y: 1 / 3 },
      headTopY: 0.13,
      gazeDirection: "right",
      shotScale: "medium",
    });

    expect(ideal.overallScore).toBeGreaterThanOrEqual(85);
    expect(ideal.grade).toBe("masterpiece");
    expect(ideal.ruleOfThirdsScore).toBeGreaterThanOrEqual(98);
    expect(ideal.headroomStatus).toBe("optimal");
    expect(ideal.lookroomStatus).toBe("optimal");
  });

  it("황금나선 수렴 초점(GOLDEN_SPIRAL_POLE)과 로그 나선 SVG 폴리라인 생성이 정확히 동작한다", () => {
    const spiralIdeal = evaluateCompositionHarmony({
      subjectFocalPoint: { x: GOLDEN_SPIRAL_POLE_MAJOR, y: GOLDEN_SPIRAL_POLE_MINOR },
      headTopY: 0.11,
      gazeDirection: "left",
      shotScale: "closeup",
      goldenSpiralCorner: "top-right",
    });

    expect(spiralIdeal.goldenSpiralScore).toBeGreaterThanOrEqual(99);
    expect(spiralIdeal.resolvedSpiralCorner).toBe("top-right");
    expect(spiralIdeal.goldenSpiralPole.x).toBeCloseTo(GOLDEN_SPIRAL_POLE_MAJOR, 3);
    expect(spiralIdeal.goldenSpiralPole.y).toBeCloseTo(GOLDEN_SPIRAL_POLE_MINOR, 3);

    const pts = generateGoldenSpiralPathPoints("top-left", 300, 200, 48);
    expect(pts).toHaveLength(49);
    for (const pt of pts) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(300);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(200);
    }
  });

  it("헤드룸 부족(too-tight)·과다(too-loose)와 단측 시선 막힘(short-sided)을 정확히 감점하고 처방을 제시한다", () => {
    const cramped = evaluateCompositionHarmony({
      subjectFocalPoint: { x: 0.84, y: 0.45 },
      headTopY: 0.02,
      gazeDirection: "right",
      shotScale: "medium",
    });
    const sunk = evaluateCompositionHarmony({
      subjectFocalPoint: { x: 0.18, y: 0.52 },
      headTopY: 0.34,
      gazeDirection: "left",
      shotScale: "medium",
    });

    expect(cramped.headroomStatus).toBe("too-tight");
    expect(cramped.lookroomStatus).toBe("short-sided");
    expect(cramped.overallScore).toBeLessThan(55);
    expect(cramped.suggestedFocalPoint.x).toBeCloseTo(1 / 3, 2);
    expect(cramped.recommendationsKo.length).toBeGreaterThanOrEqual(2);

    expect(sunk.headroomStatus).toBe("too-loose");
    expect(sunk.lookroomStatus).toBe("short-sided");
    expect(sunk.suggestedFocalPoint.x).toBeCloseTo(2 / 3, 2);
    expect(sunk.headroomScore).toBeLessThan(55);
  });
});

describe("4. 세로 스크롤 Z/S-커브 시선 흐름 검증 및 자동 처방 (vertical-eyeflow-verifier)", () => {
  it("시선 역주행(아래→위 점프)을 탐지하고 양수 dy 말풍선 이동 처방을 산출한다", () => {
    const strip: VerticalStripInput = {
      stripId: "test-reverse",
      titleKo: "역주행 테스트",
      titleEn: "Reverse Test",
      descriptionKo: "",
      descriptionEn: "",
      stripWidthPx: 800,
      panels: [
        {
          panelId: "p1",
          order: 1,
          titleKo: "1컷",
          titleEn: "P1",
          width: 800,
          height: 440,
          gutterAfterPx: 88,
          pacingIntent: "dialogue-rhythm",
          nodes: [
            { id: "a1", kind: "speech-balloon", labelKo: "대사 1", labelEn: "L1", x: 240, y: 260, readingOrder: 1 },
            { id: "a2", kind: "speech-balloon", labelKo: "대사 2", labelEn: "L2", x: 540, y: 110, readingOrder: 2 },
          ],
        },
      ],
    };

    const report = analyzeVerticalEyeFlow(strip);
    expect(report.reverseJumpCount).toBe(1);
    expect(report.curvePattern).toBe("stalled-backtrack");
    expect(report.defects.some((d) => d.kind === "reverse-backtrack" && d.severity === "critical")).toBe(true);
    const rx = report.anchorPrescriptions.find((p) => p.nodeId === "a2");
    expect(rx).toBeDefined();
    expect(rx!.dy).toBeGreaterThan(150);
  });

  it("급격한 좌우 핑퐁 왕복 피로를 탐지하고 S-커브 통로 안쪽 dx 처방을 제안한다", () => {
    const strip: VerticalStripInput = {
      stripId: "test-pingpong",
      titleKo: "핑퐁 테스트",
      titleEn: "Ping-Pong Test",
      descriptionKo: "",
      descriptionEn: "",
      stripWidthPx: 800,
      panels: [
        {
          panelId: "p1",
          order: 1,
          titleKo: "1컷",
          titleEn: "P1",
          width: 800,
          height: 460,
          gutterAfterPx: 88,
          pacingIntent: "dialogue-rhythm",
          nodes: [
            { id: "pp1", kind: "speech-balloon", labelKo: "좌측", labelEn: "Left", x: 110, y: 90, readingOrder: 1 },
            { id: "pp2", kind: "speech-balloon", labelKo: "우측 급회전", labelEn: "Far Right", x: 700, y: 140, readingOrder: 2 },
            { id: "pp3", kind: "speech-balloon", labelKo: "좌측 급반전", labelEn: "Far Left", x: 105, y: 195, readingOrder: 3 },
          ],
        },
      ],
    };

    const report = analyzeVerticalEyeFlow(strip);
    expect(report.pingPongCount).toBeGreaterThanOrEqual(2);
    expect(report.defects.some((d) => d.kind === "ping-pong-fatigue")).toBe(true);
    const rx = report.anchorPrescriptions.find((p) => p.nodeId === "pp2");
    expect(rx).toBeDefined();
    expect(rx!.dx).toBeLessThan(0);
  });

  it("시선 벽 충돌(Dead Trap)과 컷 여백(Gutter) 리듬 불일치를 정확히 탐지한다", () => {
    const crisisStrip = DEMO_VERTICAL_STRIPS[0]!;
    const report = analyzeVerticalEyeFlow(crisisStrip);

    expect(report.reverseJumpCount).toBeGreaterThanOrEqual(1);
    expect(report.pingPongCount).toBeGreaterThanOrEqual(1);
    expect(report.deadTrapCount).toBeGreaterThanOrEqual(1);
    expect(report.gutterIssueCount).toBeGreaterThanOrEqual(2);
    expect(report.flowScore).toBeLessThan(45);

    const cliffhangerGutter = report.gutterPrescriptions.find((g) => g.panelId === "p3-dead-trap");
    expect(cliffhangerGutter?.status).toBe("too-tight");
    expect(cliffhangerGutter?.recommendedGutterPx).toBe(280);
    expect(cliffhangerGutter?.deltaPx).toBe(200);
  });

  it("applyEyeFlowPrescriptions는 원본 콘티를 변형하지 않으면서 모든 결함을 자동 치유해 95점 이상으로 끌어올린다", () => {
    const crisisStrip = DEMO_VERTICAL_STRIPS[0]!;
    const before = analyzeVerticalEyeFlow(crisisStrip);
    const originalX = crisisStrip.panels[1]?.nodes[1]?.x;

    const healed = applyEyeFlowPrescriptions(crisisStrip, before);
    const after = analyzeVerticalEyeFlow(healed);

    // 원본 불변성 검증
    expect(crisisStrip.panels[1]?.nodes[1]?.x).toBe(originalX);

    // 치유 효과 검증
    expect(after.reverseJumpCount).toBe(0);
    expect(after.pingPongCount).toBe(0);
    expect(after.deadTrapCount).toBe(0);
    expect(after.gutterIssueCount).toBe(0);
    expect(after.flowScore).toBeGreaterThanOrEqual(95);
    expect(after.grade).toBe("optimal");
  });

  it("정석 로맨스 S-커브 콘티는 초기부터 90점 이상 통과하며 buildEyeFlowSvgPath가 유효한 베지어 경로를 생성한다", () => {
    const romanceStrip = DEMO_VERTICAL_STRIPS[1]!;
    const report = analyzeVerticalEyeFlow(romanceStrip);

    expect(report.flowScore).toBeGreaterThanOrEqual(95);
    expect(report.curvePattern).toBe("smooth-s-curve");
    expect(report.defects).toHaveLength(0);

    const svgPath = buildEyeFlowSvgPath(report.pathPoints);
    expect(svgPath.startsWith("M ")).toBe(true);
    expect(svgPath).toContain(" C ");
    expect(buildEyeFlowSvgPath([])).toBe("");
  });
});

describe("5. StudioCinematographyDirectorPanel 2탭 인터랙티브 UI 및 엄격 규칙 검증", () => {
  it("<StudioCinematographyDirectorPanel />가 props 없이 단독 렌더링되고 2탭 접근성 속성이 정상 동작한다", () => {
    render(<StudioCinematographyDirectorPanel />);

    expect(screen.getByTestId("cinematography-director-panel")).toBeTruthy();
    const tabCamera = screen.getByTestId("tab-camera-180");
    const tabEyeFlow = screen.getByTestId("tab-vertical-eyeflow");

    expect(tabCamera.getAttribute("aria-selected")).toBe("true");
    expect(tabEyeFlow.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("line-of-action-svg")).toBeTruthy();
    expect(screen.getByTestId("composition-overlay-svg")).toBeTruthy();
  });

  it("Tab 1에서 24mm↔135mm 렌즈 전환 및 조리개 슬라이더 조작 시 FOV·왜곡률·CoC 블러가 실시간 갱신된다", () => {
    render(<StudioCinematographyDirectorPanel />);

    fireEvent.click(screen.getByTestId("focal-btn-24"));
    const wideFov = screen.getByTestId("optics-fov-readout").textContent ?? "";
    expect(wideFov).toContain("73.7°");

    fireEvent.click(screen.getByTestId("focal-btn-135"));
    const teleFov = screen.getByTestId("optics-fov-readout").textContent ?? "";
    expect(teleFov).toContain("15.2°");

    fireEvent.change(screen.getByTestId("slider-aperture"), { target: { value: "1.4" } });
    expect(screen.getByTestId("readout-aperture").textContent).toBe("f/1.4");
    const cocShallow = screen.getByTestId("optics-coc-readout").textContent ?? "";

    fireEvent.change(screen.getByTestId("slider-aperture"), { target: { value: "11" } });
    const cocDeep = screen.getByTestId("optics-coc-readout").textContent ?? "";
    expect(cocShallow).not.toBe(cocDeep);
  });

  it("Tab 1에서 180도 축 넘침 자동 보정 버튼 클릭 시 위반이 해소되고 onCameraAuditChange 콜백이 호출된다", () => {
    const onCameraAuditChange = vi.fn();
    render(<StudioCinematographyDirectorPanel onCameraAuditChange={onCameraAuditChange} />);

    expect(screen.getByTestId("header-180-status-badge").textContent).toContain("축 넘침 1건");
    fireEvent.click(screen.getByTestId("btn-fix-180-crossing"));

    expect(screen.getByTestId("header-180-status-badge").textContent).toContain("180° 축 준수");
    expect(onCameraAuditChange).toHaveBeenCalled();
    const lastReport = onCameraAuditChange.mock.calls.at(-1)?.[0];
    expect(lastReport?.compliant).toBe(true);
  });

  it("Tab 1에서 삼분할/황금나선 오버레이 토글과 구도 자동 정렬 버튼이 정상 반영된다", () => {
    render(<StudioCinematographyDirectorPanel />);

    const scoreBefore = Number(
      (screen.getByTestId("composition-overall-score").textContent ?? "0").split("/")[0]?.trim(),
    );
    expect(scoreBefore).toBeLessThan(70);

    fireEvent.click(screen.getByTestId("toggle-thirds-overlay"));
    expect(screen.queryByTestId("svg-thirds-group")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-thirds-overlay"));
    expect(screen.getByTestId("svg-thirds-group")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-auto-reframe"));
    const scoreAfter = Number(
      (screen.getByTestId("composition-overall-score").textContent ?? "0").split("/")[0]?.trim(),
    );
    expect(scoreAfter).toBeGreaterThanOrEqual(85);
  });

  it("Tab 2(세로 시선 흐름 검증기)에서 자동 처방 적용 시 결함이 0건으로 해소되고 원본 복원·여백 슬라이더가 동작한다", () => {
    const onEyeFlowAuditChange = vi.fn();
    render(
      <StudioCinematographyDirectorPanel
        initialTab="vertical-eyeflow"
        onEyeFlowAuditChange={onEyeFlowAuditChange}
      />,
    );

    expect(screen.getByTestId("vertical-eyeflow-svg")).toBeTruthy();
    expect(screen.getByTestId("eyeflow-reverse-count").textContent).toContain("1");

    fireEvent.click(screen.getByTestId("btn-apply-eyeflow-fix"));
    expect(screen.getByTestId("eyeflow-reverse-count").textContent).toContain("0");
    expect(screen.getByTestId("eyeflow-clean-banner")).toBeTruthy();
    expect(onEyeFlowAuditChange).toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("slider-panel-gutter"), { target: { value: "24" } });
    expect(screen.getByTestId("readout-panel-gutter").textContent).toBe("24px");

    fireEvent.click(screen.getByTestId("btn-reset-eyeflow"));
    expect(screen.getByTestId("eyeflow-reverse-count").textContent).toContain("1");
  });

  it("엄격 규칙(800줄 이하 · Storage/BigInt/private Map store/원시 색상/props={} 0건 · Calm Atelier 시맨틱 토큰)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "cinematography-camera-engine.ts",
      "vertical-eyeflow-verifier.ts",
      "StudioCinematographyDirectorPanel.tsx",
      "index.ts",
      "webtoon-cinematography-director.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "webtoon-cinematography-director.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      }
      if (file.endsWith(".tsx") && file !== "webtoon-cinematography-director.test.tsx") {
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
