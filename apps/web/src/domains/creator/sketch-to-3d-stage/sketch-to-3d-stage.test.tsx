// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  clampVrmHumanoidBone,
  eulerDegToQuaternion,
  getSketchStagePreset,
  SKETCH_STAGE_PRESETS,
  SKETCH_VRM_BONE_NAMES,
  solveCameraFromSketch,
  solvePoseFromSketch,
  solveSketchTo3dStage,
  solveThreePointLightingFromSketch,
  StudioSketchTo3dStagePanel,
  VRM_BIOMECHANICAL_LIMITS_DEG,
  type SketchStageDocument,
  type SketchStroke2D,
} from "./index";

let mockCanvasStrokeCalls = 0;

function createMockCanvasContext(): Partial<CanvasRenderingContext2D> {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(() => {
      mockCanvasStrokeCalls += 1;
    }),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: "round",
    lineJoin: "round",
  };
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  mockCanvasStrokeCalls = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => createMockCanvasContext()) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

/** 정확한 직교 2점 소실점 (VP_A, VP_B)으로 수렴하는 배경 소실선 2쌍 생성 헬퍼. */
function makeOrthogonalVanishingDocument(options: {
  focalMm: number;
  horizonY: number;
  yawBias?: number;
  headRadius?: number;
  aspect?: number;
}): SketchStageDocument {
  const aspect = options.aspect ?? 16 / 9;
  const sensorH = 36 / aspect;
  const fNorm = options.focalMm / sensorH;
  const vH = 0.5 - options.horizonY;
  const prod = fNorm * fNorm + vH * vH;
  const ratio = options.yawBias ?? 1;
  const uLeft = -Math.sqrt(prod / ratio);
  const uRight = Math.sqrt(prod * ratio);

  const vpA = { x: 0.5 + uLeft / aspect, y: options.horizonY };
  const vpB = { x: 0.5 + uRight / aspect, y: options.horizonY };

  const rayTo = (startX: number, startY: number, vp: { x: number; y: number }, t = 0.55) => [
    { x: startX, y: startY },
    { x: startX + (vp.x - startX) * t, y: startY + (vp.y - startY) * t },
  ];

  const rY = options.headRadius ?? 0.08;
  const rX = rY / aspect;
  const headPts = Array.from({ length: 13 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: 0.5 + Math.cos(a) * rX, y: 0.35 + Math.sin(a) * rY };
  });

  const strokes: SketchStroke2D[] = [
    { id: "h", kind: "head", points: headPts },
    { id: "vpa-1", kind: "vanishingPairA", points: rayTo(0.85, 0.9, vpA) },
    { id: "vpa-2", kind: "vanishingPairA", points: rayTo(0.85, 0.15, vpA) },
    { id: "vpb-1", kind: "vanishingPairB", points: rayTo(0.15, 0.9, vpB) },
    { id: "vpb-2", kind: "vanishingPairB", points: rayTo(0.15, 0.15, vpB) },
  ];

  return { aspectRatio: aspect, strokes };
}

describe("① 3D VRM 휴머노이드 전신 포즈 · 오일러/쿼터니언 · 관절 생체각도 클램프", () => {
  it("오일러 -> 단위 쿼터니언 변환이 단일/복합 축 회전 및 정규 반구(w>=0) 조건을 만족한다", () => {
    const rx90 = eulerDegToQuaternion({ x: 90, y: 0, z: 0 });
    expect(rx90.x).toBeCloseTo(Math.SQRT1_2, 4);
    expect(rx90.w).toBeCloseTo(Math.SQRT1_2, 4);
    expect(Math.hypot(rx90.x, rx90.y, rx90.z, rx90.w)).toBeCloseTo(1, 4);

    const combo = eulerDegToQuaternion({ x: 35, y: -50, z: 25 });
    expect(combo.w).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(combo.x, combo.y, combo.z, combo.w)).toBeCloseTo(1, 4);
  });

  it("팔꿈치·무릎 역꺾임(과신전)과 극단적 각도를 생체각도 한계 내로 클램프하고 이벤트를 기록한다", () => {
    const leftElbowHyper = clampVrmHumanoidBone("leftLowerArm", { x: 10, y: 40, z: 45 });
    expect(leftElbowHyper.transform.clamped).toBe(true);
    expect(leftElbowHyper.transform.eulerDeg.z).toBe(0);
    expect(leftElbowHyper.transform.eulerDeg.y).toBe(18);
    expect(leftElbowHyper.events.length).toBe(2);

    const rightElbowHyper = clampVrmHumanoidBone("rightLowerArm", { x: 0, y: 0, z: -30 });
    expect(rightElbowHyper.transform.clamped).toBe(true);
    expect(rightElbowHyper.transform.eulerDeg.z).toBe(0);

    const kneeHyper = clampVrmHumanoidBone("leftLowerLeg", { x: -28, y: 0, z: 0 });
    expect(kneeHyper.transform.clamped).toBe(true);
    expect(kneeHyper.transform.eulerDeg.x).toBe(0);

    const kneeOver = clampVrmHumanoidBone("rightLowerLeg", { x: 185, y: 0, z: 0 });
    expect(kneeOver.transform.clamped).toBe(true);
    expect(kneeOver.transform.eulerDeg.x).toBe(150);
  });

  it("일반 arm/leg 제스처 스트로크를 척추 기준 좌/우로 자동 분류하고 13관절 전부를 유효 범위로 역산한다", () => {
    const doc: SketchStageDocument = {
      aspectRatio: 16 / 9,
      strokes: [
        {
          id: "head",
          kind: "head",
          points: [
            { x: 0.46, y: 0.2 },
            { x: 0.54, y: 0.2 },
            { x: 0.54, y: 0.34 },
            { x: 0.46, y: 0.34 },
          ],
        },
        {
          id: "spine",
          kind: "spine",
          points: [
            { x: 0.5, y: 0.35 },
            { x: 0.5, y: 0.6 },
          ],
        },
        // 화면 우측(+u) -> VRM 왼팔 높이 들기
        {
          id: "arm-left-raised",
          kind: "arm",
          points: [
            { x: 0.56, y: 0.38 },
            { x: 0.68, y: 0.26 },
            { x: 0.74, y: 0.14 },
          ],
        },
        // 화면 좌측(-u) -> VRM 오른팔 아래로 내리기
        {
          id: "arm-right-low",
          kind: "arm",
          points: [
            { x: 0.44, y: 0.38 },
            { x: 0.36, y: 0.52 },
            { x: 0.33, y: 0.66 },
          ],
        },
        {
          id: "leg-l",
          kind: "leg",
          points: [
            { x: 0.54, y: 0.6 },
            { x: 0.59, y: 0.74 },
            { x: 0.61, y: 0.9 },
          ],
        },
        {
          id: "leg-r",
          kind: "leg",
          points: [
            { x: 0.46, y: 0.6 },
            { x: 0.41, y: 0.74 },
            { x: 0.39, y: 0.9 },
          ],
        },
      ],
    };

    const pose = solvePoseFromSketch(doc, 0);
    expect(Object.keys(pose.bones)).toHaveLength(13);
    for (const boneName of SKETCH_VRM_BONE_NAMES) {
      const b = pose.bones[boneName];
      const lim = VRM_BIOMECHANICAL_LIMITS_DEG[boneName];
      expect(b.eulerDeg.x).toBeGreaterThanOrEqual(lim.x.minDeg);
      expect(b.eulerDeg.x).toBeLessThanOrEqual(lim.x.maxDeg);
      expect(b.eulerDeg.y).toBeGreaterThanOrEqual(lim.y.minDeg);
      expect(b.eulerDeg.y).toBeLessThanOrEqual(lim.y.maxDeg);
      expect(b.eulerDeg.z).toBeGreaterThanOrEqual(lim.z.minDeg);
      expect(b.eulerDeg.z).toBeLessThanOrEqual(lim.z.maxDeg);
      expect(Math.hypot(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)).toBeCloseTo(1, 3);
    }
    // 높이 든 왼팔 상완/쇄골은 양의 거상각을 갖고, 내린 오른팔은 다른 방향을 갖는다
    expect(pose.bones.leftUpperArm.eulerDeg.z).toBeGreaterThan(15);
    expect(pose.bones.leftShoulder.eulerDeg.z).toBeGreaterThan(3);
  });

  it("빈 스케치와 1점짜리 퇴화 스트로크에서도 NaN 없이 안전한 기본 자세를 반환한다", () => {
    const empty = solveSketchTo3dStage({ strokes: [] });
    expect(empty.strokeCount).toBe(0);
    expect(Number.isFinite(empty.camera.distanceMeters)).toBe(true);
    expect(empty.camera.focalLengthMm).toBe(50);
    expect(empty.lighting.mood).toBe("rembrandt");

    const degenerate = solveSketchTo3dStage({
      strokes: [
        { id: "d1", kind: "head", points: [{ x: 0.5, y: 0.5 }] },
        { id: "d2", kind: "vanishingPairA", points: [{ x: 0.2, y: 0.2 }] },
      ],
    });
    expect(Number.isFinite(degenerate.pose.bones.spine.eulerDeg.x)).toBe(true);
    expect(Number.isFinite(degenerate.camera.pitchDeg)).toBe(true);
  });
});

describe("② 카메라 렌즈(24/35/50/85mm) · 앙각/부감 Pitch · Yaw · 프레이밍 거리 역산", () => {
  it("직교 2점 소실선 쌍에서 24mm · 35mm · 50mm · 85mm 4종 단렌즈 화각을 정확히 역산한다", () => {
    for (const targetMm of [24, 35, 50, 85] as const) {
      const doc = makeOrthogonalVanishingDocument({ focalMm: targetMm, horizonY: 0.5 });
      const cam = solveCameraFromSketch(doc);
      expect(cam.focalLengthMm).toBe(targetMm);
      expect(cam.estimatedFocalLengthMm).toBeCloseTo(targetMm, 0);
      expect(cam.angleCategory).toBe("eye-level");
      expect(Math.abs(cam.pitchDeg)).toBeLessThan(1.5);
    }
  });

  it("높은 지평선은 부감(음수 Pitch), 낮은 지평선은 앙각(양수 Pitch), 비대칭 소실점은 Yaw를 역산한다", () => {
    const highCam = solveCameraFromSketch(
      makeOrthogonalVanishingDocument({ focalMm: 24, horizonY: 0.08 }),
    );
    expect(highCam.angleCategory).toBe("high-angle");
    expect(highCam.pitchDeg).toBeLessThan(-14);

    const lowCam = solveCameraFromSketch(
      makeOrthogonalVanishingDocument({ focalMm: 24, horizonY: 0.92 }),
    );
    expect(lowCam.angleCategory).toBe("low-angle");
    expect(lowCam.pitchDeg).toBeGreaterThan(14);

    const yawRightCam = solveCameraFromSketch(
      makeOrthogonalVanishingDocument({ focalMm: 50, horizonY: 0.5, yawBias: 4 }),
    );
    expect(yawRightCam.yawDeg).toBeGreaterThan(12);
  });

  it("핀홀 투영 거리 법칙: 머리 투영 크기가 2배면 거리가 절반, 85mm는 24mm 대비 약 3.54배 원거리다", () => {
    const smallHead24 = solveCameraFromSketch(
      makeOrthogonalVanishingDocument({ focalMm: 24, horizonY: 0.5, headRadius: 0.08 }),
    );
    const bigHead24 = solveCameraFromSketch(
      makeOrthogonalVanishingDocument({ focalMm: 24, horizonY: 0.5, headRadius: 0.16 }),
    );
    const smallHead85 = solveCameraFromSketch(
      makeOrthogonalVanishingDocument({ focalMm: 85, horizonY: 0.5, headRadius: 0.08 }),
    );

    expect(smallHead24.distanceMeters / bigHead24.distanceMeters).toBeCloseTo(2, 1);
    expect(smallHead85.distanceMeters / smallHead24.distanceMeters).toBeCloseTo(85 / 24, 1);
  });
});

describe("③ 3점 조명(Key/Fill/Rim) 자동 배치 — 그림자 빗금 무게중심 반대편 역산", () => {
  const baseBody: readonly SketchStroke2D[] = [
    {
      id: "h",
      kind: "head",
      points: [
        { x: 0.46, y: 0.24 },
        { x: 0.54, y: 0.24 },
        { x: 0.54, y: 0.38 },
        { x: 0.46, y: 0.38 },
      ],
    },
    {
      id: "s",
      kind: "spine",
      points: [
        { x: 0.5, y: 0.39 },
        { x: 0.5, y: 0.65 },
      ],
    },
  ];

  it("우하단 그림자 -> 좌상단 Key, 좌하단 그림자 -> 우상단 Key, 상단 그림자 -> 하방 역조명으로 역산한다", () => {
    const brLight = solveThreePointLightingFromSketch({
      strokes: [
        ...baseBody,
        { id: "sh1", kind: "shadowHatch", points: [{ x: 0.68, y: 0.72 }, { x: 0.78, y: 0.88 }] },
        { id: "sh2", kind: "shadowHatch", points: [{ x: 0.72, y: 0.7 }, { x: 0.82, y: 0.86 }] },
      ],
    });
    expect(brLight.key.azimuthDeg).toBeLessThan(-18);
    expect(brLight.key.elevationDeg).toBeGreaterThan(15);
    expect(brLight.key.direction.x).toBeLessThan(0);
    expect(brLight.key.direction.y).toBeGreaterThan(0);
    // Fill은 Key와 수평 반대편
    expect(brLight.fill.azimuthDeg).toBeGreaterThan(10);

    const blLight = solveThreePointLightingFromSketch({
      strokes: [
        ...baseBody,
        { id: "sh1", kind: "shadowHatch", points: [{ x: 0.22, y: 0.72 }, { x: 0.32, y: 0.88 }] },
        { id: "sh2", kind: "shadowHatch", points: [{ x: 0.18, y: 0.7 }, { x: 0.28, y: 0.86 }] },
      ],
    });
    expect(blLight.key.azimuthDeg).toBeGreaterThan(18);
    expect(blLight.key.elevationDeg).toBeGreaterThan(15);
    expect(blLight.key.direction.x).toBeGreaterThan(0);

    const topShadowLight = solveThreePointLightingFromSketch({
      strokes: [
        ...baseBody,
        { id: "sh1", kind: "shadowHatch", points: [{ x: 0.45, y: 0.04 }, { x: 0.55, y: 0.14 }] },
        { id: "sh2", kind: "shadowHatch", points: [{ x: 0.47, y: 0.03 }, { x: 0.57, y: 0.12 }] },
      ],
    });
    expect(topShadowLight.key.elevationDeg).toBeLessThan(-5);
    expect(topShadowLight.mood).toBe("under-lit");
  });

  it("얼굴·상체 정면 전체에 빗금이 겹치면 배면 역광(|Az| >= 120°)과 강한 Rim 조명을 배치한다", () => {
    const backlit = solveThreePointLightingFromSketch({
      strokes: [
        ...baseBody,
        { id: "b1", kind: "shadowHatch", points: [{ x: 0.46, y: 0.26 }, { x: 0.52, y: 0.62 }] },
        { id: "b2", kind: "shadowHatch", points: [{ x: 0.49, y: 0.26 }, { x: 0.54, y: 0.62 }] },
        { id: "b3", kind: "shadowHatch", points: [{ x: 0.47, y: 0.3 }, { x: 0.53, y: 0.58 }] },
      ],
    });
    expect(backlit.frontFaceShadowRatio).toBeGreaterThan(0.5);
    expect(Math.abs(backlit.key.azimuthDeg)).toBeGreaterThanOrEqual(120);
    expect(backlit.key.direction.z).toBeLessThan(0);
    expect(backlit.mood).toBe("backlight-rim");
    expect(backlit.rim.intensity).toBeGreaterThan(1.1);
  });
});

describe("④ 4종 즉시 테스트용 2D 러프 프리셋 동시 역산 검증", () => {
  it("4종 프리셋이 각각 고유한 화각·앵글·포즈·3점 조명으로 일관되게 역산된다", () => {
    expect(SKETCH_STAGE_PRESETS).toHaveLength(4);

    const punch = solveSketchTo3dStage(getSketchStagePreset("high-angle-action-punch").sketch);
    expect(punch.camera.focalLengthMm).toBe(24);
    expect(punch.camera.angleCategory).toBe("high-angle");
    expect(punch.camera.pitchDeg).toBeLessThan(-14);
    expect(punch.lighting.key.azimuthDeg).toBeLessThan(-15);
    expect(punch.lighting.key.elevationDeg).toBeGreaterThan(15);

    const landing = solveSketchTo3dStage(getSketchStagePreset("low-angle-hero-landing").sketch);
    expect(landing.camera.focalLengthMm).toBe(24);
    expect(landing.camera.angleCategory).toBe("low-angle");
    expect(landing.camera.pitchDeg).toBeGreaterThan(14);
    expect(landing.lighting.key.azimuthDeg).toBeGreaterThan(15);
    expect(landing.pose.bones.rightLowerLeg.eulerDeg.x).toBeGreaterThan(25);

    const cafe = solveSketchTo3dStage(getSketchStagePreset("cafe-diagonal-two-shot").sketch);
    expect(cafe.camera.focalLengthMm).toBe(50);
    expect(cafe.camera.angleCategory).toBe("eye-level");
    expect(Math.abs(cafe.camera.yawDeg)).toBeGreaterThan(12);
    expect(cafe.lighting.key.azimuthDeg).toBeLessThan(-15);

    const closeup = solveSketchTo3dStage(getSketchStagePreset("closeup-backlight-drama").sketch);
    expect(closeup.camera.focalLengthMm).toBe(85);
    expect(closeup.camera.shotCategory).toBe("close-up");
    expect(closeup.lighting.mood).toBe("backlight-rim");
    expect(Math.abs(closeup.lighting.key.azimuthDeg)).toBeGreaterThanOrEqual(120);
  });
});

describe("⑤ StudioSketchTo3dStagePanel: 단독 렌더 · 캔버스 드로잉 · 프리셋 전환 · KO/EN · Calm Atelier 위생", () => {
  it("props 없이 단독 렌더링되며 프리셋 전환, 쿼터니언 토글, 캔버스 포인터 드로잉/실행취소/비우기/적용이 동작한다", () => {
    const onStageSolved = vi.fn();
    const onApplyTo3dStage = vi.fn();

    const { rerender } = render(<StudioSketchTo3dStagePanel />);

    expect(screen.getByTestId("sketch-to-3d-stage-panel")).toBeTruthy();
    expect(mockCanvasStrokeCalls).toBeGreaterThan(5);
    expect(screen.getByTestId("sketch-stage-focal-badge").textContent).toBe("24mm");
    expect(screen.getByTestId("sketch-stage-bone-hips")).toBeTruthy();
    expect(screen.getByTestId("sketch-stage-bone-rightLowerLeg")).toBeTruthy();

    // 프리셋 전환: 클로즈업 역광 드라마 -> 85mm & 역광 림
    fireEvent.click(screen.getByTestId("sketch-stage-preset-closeup-backlight-drama"));
    expect(screen.getByTestId("sketch-stage-focal-badge").textContent).toBe("85mm");
    expect(screen.getByTestId("sketch-stage-lighting-mood").textContent).toContain("역광");

    // 프리셋 전환: 카페 대각선 투샷 -> 50mm
    fireEvent.click(screen.getByTestId("sketch-stage-preset-cafe-diagonal-two-shot"));
    expect(screen.getByTestId("sketch-stage-focal-badge").textContent).toBe("50mm");

    // 오일러 <-> 쿼터니언 표시 전환
    fireEvent.click(screen.getByTestId("sketch-stage-mode-quaternion"));
    expect(screen.getByTestId("sketch-stage-bone-head").textContent).toMatch(/\([^)]+,\s*[^)]+,\s*[^)]+,\s*[^)]+\)/);

    // 콜백 연결 후 캔버스 포인터 드로잉 · Undo · Apply 검증
    rerender(
      <StudioSketchTo3dStagePanel
        onStageSolved={onStageSolved}
        onApplyTo3dStage={onApplyTo3dStage}
      />,
    );

    const canvas = screen.getByTestId("sketch-stage-canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 640,
      height: 360,
      right: 640,
      bottom: 360,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(screen.getByTestId("sketch-stage-tool-shadowHatch"));
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 460, clientY: 260 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 520, clientY: 310 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 540, clientY: 330 });
    expect(onStageSolved).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("sketch-stage-undo-btn"));
    expect(onStageSolved).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId("sketch-stage-apply-btn"));
    expect(onApplyTo3dStage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("sketch-stage-status").textContent).toContain("50mm");

    fireEvent.click(screen.getByTestId("sketch-stage-clear-btn"));
    expect(screen.getByTestId("sketch-stage-confidence-badge").textContent).toContain("0획");
  });

  it("영어 로케일(en)에서는 한글 문자 없이 영어 UI와 역산 리드아웃만 출력된다", () => {
    const { container } = render(
      <StudioSketchTo3dStagePanel locale="en" initialPresetId="low-angle-hero-landing" />,
    );
    expect(screen.getByTestId("sketch-stage-focal-badge").textContent).toBe("24mm");
    expect(screen.getByTestId("sketch-stage-pitch-value").textContent).toContain("Low-Angle");
    fireEvent.click(screen.getByTestId("sketch-stage-apply-btn"));
    expect(screen.getByTestId("sketch-stage-status").textContent).toContain("Applied 3D stage");
    expect(container.textContent).not.toMatch(/[가-힣]/);
  });

  it("Calm Atelier 위생(원시 hex/rgb/hsl 금지 · localStorage/sessionStorage 금지 · 모든 파일 800줄 이하)을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/sketch-to-3d-stage");
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const src = readFileSync(fullPath, "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "sketch-to-3d-stage.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/);
        expect(src).not.toMatch(/\bsessionStorage\b/);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(src).not.toMatch(/\brgba?\s*\(/i);
        expect(src).not.toMatch(/\bhsla?\s*\(/i);
        expect(src).not.toContain("transition-all");
      }
    }

    const panelSrc = readFileSync(path.join(dir, "StudioSketchTo3dStagePanel.tsx"), "utf8");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
  });
});
