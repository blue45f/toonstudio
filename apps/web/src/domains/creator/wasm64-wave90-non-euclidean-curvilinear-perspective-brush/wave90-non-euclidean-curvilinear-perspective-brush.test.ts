import { describe, expect, it } from "vitest";
import {
  bend3DPropIntoCurvilinearCurves,
  buildCurvilinearCameraBasis,
  buildCurvilinearRefractionWgsl,
  cameraVectorToWorldSpace,
  computeCurvilinearJacobian,
  computeCurvilinearVanishingPoints,
  dotVec3,
  generateCurvilinearGuideGrid,
  normalizeVec3,
  projectWorld3DToCurvilinear2D,
  refractBrushStrokeInCurvilinearSpace,
  renderCurvilinearPerspectiveSvg,
  sampleWorldSegmentAsGeodesic,
  subVec3,
  summarizeCurvilinearSessionKo,
  unprojectCurvilinear2DToRay3D,
  validateCurvilinearWgsl,
  worldVectorToCameraSpace,
  type CurvilinearCameraConfig,
  type CurvilinearProjectionMode,
  type StylusSampleInput,
  type Vec3,
} from "./index";

const ALL_MODES: readonly CurvilinearProjectionMode[] = [
  "4pt-cylindrical",
  "5pt-fisheye-equidistant",
  "5pt-fisheye-equisolid",
  "5pt-fisheye-stereographic",
  "5pt-panini",
  "6pt-spherical-dual",
];

function makeCamera(
  mode: CurvilinearProjectionMode,
  overrides: Partial<CurvilinearCameraConfig> = {},
): CurvilinearCameraConfig {
  return {
    mode,
    viewportWidth: 1200,
    viewportHeight: 800,
    fovDegrees: mode === "6pt-spherical-dual" ? 360 : 180,
    yawRad: 0,
    pitchRad: 0,
    rollRad: 0,
    paniniCompression: 1,
    eyePosition: { x: 0, y: 1.6, z: 0 },
    ...overrides,
  };
}

function angularErrorRad(a: Vec3, b: Vec3): number {
  const cosTheta = Math.max(-1, Math.min(1, dotVec3(normalizeVec3(a), normalizeVec3(b))));
  return Math.acos(cosTheta);
}

function assertRoundTrip(cam: CurvilinearCameraConfig, points: readonly Vec3[]): void {
  for (const pt of points) {
    const proj = projectWorld3DToCurvilinear2D(pt, cam);
    expect(proj.visible).toBe(true);
    const ray = unprojectCurvilinear2DToRay3D({ x: proj.x, y: proj.y }, cam);
    expect(ray.valid).toBe(true);
    expect(angularErrorRad(subVec3(pt, cam.eyePosition), ray.direction)).toBeLessThan(1e-4);
  }
}

describe("Wave 90: 비유클리드 5~6점 곡면 투시 투영장 및 역투영", () => {
  it("1. 카메라 직교 정규 기저가 월드↔카메라 변환을 기계 정밀도로 가역 보존한다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant", { yawRad: 0.42, pitchRad: -0.27, rollRad: 0.19 });
    const basis = buildCurvilinearCameraBasis(cam);

    expect(Math.abs(dotVec3(basis.right, basis.right) - 1)).toBeLessThan(1e-12);
    expect(Math.abs(dotVec3(basis.up, basis.up) - 1)).toBeLessThan(1e-12);
    expect(Math.abs(dotVec3(basis.forward, basis.forward) - 1)).toBeLessThan(1e-12);
    expect(Math.abs(dotVec3(basis.right, basis.up))).toBeLessThan(1e-12);
    expect(Math.abs(dotVec3(basis.right, basis.forward))).toBeLessThan(1e-12);
    expect(Math.abs(dotVec3(basis.up, basis.forward))).toBeLessThan(1e-12);

    const sampleVec: Vec3 = { x: 3.7, y: -2.1, z: 8.4 };
    const back = cameraVectorToWorldSpace(worldVectorToCameraSpace(sampleVec, basis), basis);
    expect(Math.hypot(back.x - sampleVec.x, back.y - sampleVec.y, back.z - sampleVec.z)).toBeLessThan(1e-12);
  });

  it("2. 4pt-cylindrical 순방향 투영↔역투영 왕복 각도 오차가 1e-4 rad 미만이다", () => {
    const cam = makeCamera("4pt-cylindrical", { yawRad: 0.15, pitchRad: 0.1 });
    assertRoundTrip(cam, [
      { x: 0, y: 1.6, z: 6 },
      { x: 3.5, y: 5.2, z: 4.5 },
      { x: -4.2, y: -2.1, z: 3.8 },
      { x: 1.8, y: -1.4, z: 9.0 },
    ]);
  });

  it("3. 5pt-fisheye-equidistant 회전 카메라에서도 왕복 각도 오차가 1e-4 rad 미만이다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant", {
      fovDegrees: 210,
      yawRad: -0.3,
      pitchRad: 0.22,
      rollRad: -0.11,
      eyePosition: { x: 2, y: 3, z: -1 },
    });
    assertRoundTrip(cam, [
      { x: 2, y: 3, z: 8 },
      { x: -5, y: 7, z: 5 },
      { x: 8, y: -1, z: 4 },
      { x: 0.5, y: 9.5, z: 2.5 },
    ]);
  });

  it("4. 5pt-fisheye-equisolid 순방향↔역투영 왕복 각도 오차가 1e-4 rad 미만이다", () => {
    assertRoundTrip(makeCamera("5pt-fisheye-equisolid", { fovDegrees: 200 }), [
      { x: 0, y: 1.6, z: 5 },
      { x: 6, y: 4.5, z: 3 },
      { x: -7, y: -2, z: 2.5 },
      { x: 2, y: 8.5, z: 4 },
    ]);
  });

  it("5. 5pt-fisheye-stereographic 순방향↔역투영 왕복 각도 오차가 1e-4 rad 미만이다", () => {
    assertRoundTrip(makeCamera("5pt-fisheye-stereographic", { fovDegrees: 220 }), [
      { x: 0.1, y: 1.7, z: 7 },
      { x: 5.5, y: 6.2, z: 2.2 },
      { x: -6.1, y: -3.4, z: 1.9 },
      { x: 3.3, y: 2.2, z: -0.4 },
    ]);
  });

  it("6. 5pt-panini 압축 계수(0, 0.5, 1.0) 모두에서 왕복 각도 오차가 1e-4 rad 미만이다", () => {
    const pts: readonly Vec3[] = [
      { x: 0, y: 2.2, z: 8 },
      { x: 4.5, y: 4.0, z: 6.0 },
      { x: -3.2, y: -0.5, z: 5.5 },
    ];
    for (const d of [0, 0.5, 1]) {
      assertRoundTrip(makeCamera("5pt-panini", { fovDegrees: 140, paniniCompression: d }), pts);
    }
  });

  it("7. 6pt-spherical-dual 전면·후면 양반구 360도 전 영역에서 왕복 오차가 1e-4 rad 미만이다", () => {
    const cam = makeCamera("6pt-spherical-dual", { yawRad: 0.25, pitchRad: -0.1 });
    const pts: readonly Vec3[] = [
      { x: 2, y: 3, z: 7 },
      { x: -4, y: -1, z: 5 },
      { x: 3, y: 2.5, z: -8 },
      { x: -5, y: -2, z: -6 },
      { x: 0.4, y: 7, z: -2 },
    ];
    let sawFront = false;
    let sawBack = false;
    for (const pt of pts) {
      const proj = projectWorld3DToCurvilinear2D(pt, cam);
      expect(proj.visible).toBe(true);
      if (proj.hemisphere === "front") sawFront = true;
      else sawBack = true;
      const ray = unprojectCurvilinear2DToRay3D({ x: proj.x, y: proj.y }, cam);
      expect(ray.valid).toBe(true);
      expect(ray.hemisphere).toBe(proj.hemisphere);
      expect(angularErrorRad(subVec3(pt, cam.eyePosition), ray.direction)).toBeLessThan(1e-4);
    }
    expect(sawFront && sawBack).toBe(true);
  });

  it("8. 유효 투영 원판 바깥이나 비유한 좌표 역투영은 안전하게 valid=false를 반환한다", () => {
    const dualCam = makeCamera("6pt-spherical-dual");
    expect(unprojectCurvilinear2DToRay3D({ x: 600, y: 10 }, dualCam).valid).toBe(false);
    expect(unprojectCurvilinear2DToRay3D({ x: Number.NaN, y: 400 }, dualCam).valid).toBe(false);
    expect(unprojectCurvilinear2DToRay3D({ x: 3500, y: 3500 }, makeCamera("5pt-fisheye-equisolid")).valid).toBe(false);
  });

  it("9. 5pt-panini 불변식: 수직 벽면은 완벽한 직선으로 유지되고 수평선은 자연스럽게 휜다", () => {
    const cam = makeCamera("5pt-panini", { fovDegrees: 170, paniniCompression: 1, yawRad: 0.2 });
    const verticalXs = [-4, -2, 0, 2, 4, 6, 8].map((y) => projectWorld3DToCurvilinear2D({ x: 4, y, z: 7 }, cam).x);
    expect(Math.max(...verticalXs) - Math.min(...verticalXs)).toBeLessThan(1e-6);

    const horizCurve = sampleWorldSegmentAsGeodesic({ x: -12, y: 6.5, z: 5 }, { x: 12, y: 6.5, z: 5 }, cam, 36);
    expect(horizCurve.segments.length).toBeGreaterThan(0);
    expect(horizCurve.maxBendDeviationPx).toBeGreaterThan(8);
  });
});

describe("Wave 90: 소실점 수렴, 야코비안 단축·이방성, 측지선 그리드", () => {
  it("10. 5점 어안(180°)에서 ±X, ±Y, +Z 원거리 직선이 5개 소실점으로 수렴하고 후면 VP는 숨겨진다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant", { fovDegrees: 180 });
    const vpById = new Map(computeCurvilinearVanishingPoints(cam).map((vp) => [vp.id, vp]));

    expect(vpById.get("back")?.visible).toBe(false);
    const axes: ReadonlyArray<{ readonly id: "front" | "left" | "right" | "zenith" | "nadir"; readonly dir: Vec3 }> = [
      { id: "front", dir: { x: 0, y: 0, z: 1 } },
      { id: "left", dir: { x: -1, y: 0, z: 0 } },
      { id: "right", dir: { x: 1, y: 0, z: 0 } },
      { id: "zenith", dir: { x: 0, y: 1, z: 0 } },
      { id: "nadir", dir: { x: 0, y: -1, z: 0 } },
    ];
    for (const axis of axes) {
      const vp = vpById.get(axis.id);
      expect(vp?.visible).toBe(true);
      const proj = projectWorld3DToCurvilinear2D(
        { x: 2 + axis.dir.x * 50000, y: 3 + axis.dir.y * 50000, z: 4 + axis.dir.z * 50000 },
        cam,
      );
      expect(vp && Math.hypot(proj.x - vp.x, proj.y - vp.y)).toBeLessThan(0.5);
    }
  });

  it("11. 4pt-cylindrical에서 수직 건물선(±Y)과 수평선(±X)이 천정·천저·좌·우 소실점으로 수렴한다", () => {
    const cam = makeCamera("4pt-cylindrical", { fovDegrees: 180 });
    const vpById = new Map(computeCurvilinearVanishingPoints(cam).map((vp) => [vp.id, vp]));
    for (const id of ["left", "right", "zenith", "nadir"] as const) {
      expect(vpById.get(id)?.visible).toBe(true);
    }

    const skyPt = projectWorld3DToCurvilinear2D({ x: 3, y: 50000, z: 8 }, cam);
    const abyssPt = projectWorld3DToCurvilinear2D({ x: 3, y: -50000, z: 8 }, cam);
    const rightPt = projectWorld3DToCurvilinear2D({ x: 50000, y: 4, z: 8 }, cam);
    const zenithVp = vpById.get("zenith");
    const nadirVp = vpById.get("nadir");
    const rightVp = vpById.get("right");
    expect(zenithVp && Math.hypot(skyPt.x - zenithVp.x, skyPt.y - zenithVp.y)).toBeLessThan(0.5);
    expect(nadirVp && Math.hypot(abyssPt.x - nadirVp.x, abyssPt.y - nadirVp.y)).toBeLessThan(0.5);
    expect(rightVp && Math.hypot(rightPt.x - rightVp.x, rightPt.y - rightVp.y)).toBeLessThan(0.5);
  });

  it("12. 6pt-spherical-dual에서는 전·후·좌·우·천정·천저 6개 소실점이 모두 가시적이며 수렴한다", () => {
    const cam = makeCamera("6pt-spherical-dual");
    const vps = computeCurvilinearVanishingPoints(cam);
    expect(vps.every((vp) => vp.visible)).toBe(true);

    const vpById = new Map(vps.map((vp) => [vp.id, vp]));
    const frontVp = vpById.get("front");
    const backVp = vpById.get("back");
    expect(frontVp?.hemisphere).toBe("front");
    expect(backVp?.hemisphere).toBe("back");
    expect(frontVp && backVp && Math.abs(backVp.x - frontVp.x)).toBeGreaterThan(400);

    const farBack = projectWorld3DToCurvilinear2D({ x: 2, y: 3, z: -50000 }, cam);
    expect(farBack.hemisphere).toBe("back");
    expect(backVp && Math.hypot(farBack.x - backVp.x, farBack.y - backVp.y)).toBeLessThan(0.5);
  });

  it("13. 야코비안 단축률은 카메라 거리가 2배씩 늘 때 정확히 1/d·1/d²로 단조 감소한다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant");
    const j2 = computeCurvilinearJacobian({ x: 0.5, y: 2.1, z: 2 }, cam);
    const j4 = computeCurvilinearJacobian({ x: 1.0, y: 2.6, z: 4 }, cam);
    const j8 = computeCurvilinearJacobian({ x: 2.0, y: 3.6, z: 8 }, cam);

    expect(j2.sigmaMax).toBeGreaterThanOrEqual(j2.sigmaMin);
    expect(j2.sigmaMin).toBeGreaterThan(0);
    expect(j2.sigmaMax).toBeGreaterThan(j4.sigmaMax);
    expect(j4.sigmaMax).toBeGreaterThan(j8.sigmaMax);
    expect(j2.areaScale).toBeGreaterThan(j4.areaScale);
    expect(j4.areaScale).toBeGreaterThan(j8.areaScale);

    const jNear = computeCurvilinearJacobian({ x: 0, y: 1.6, z: 3 }, cam);
    const jFar = computeCurvilinearJacobian({ x: 0, y: 1.6, z: 6 }, cam);
    expect(Math.abs(jNear.sigmaMax / jFar.sigmaMax - 2)).toBeLessThan(1e-3);
    expect(Math.abs(jNear.areaScale / jFar.areaScale - 4)).toBeLessThan(1e-2);
  });

  it("14. 5pt-fisheye-stereographic은 등각 투영이므로 모든 시야각에서 이방성 비율이 1.0이다", () => {
    const cam = makeCamera("5pt-fisheye-stereographic", { fovDegrees: 200 });
    for (const deg of [10, 35, 65]) {
      const rad = (deg * Math.PI) / 180;
      const jac = computeCurvilinearJacobian({ x: Math.sin(rad) * 5, y: cam.eyePosition.y, z: Math.cos(rad) * 5 }, cam);
      expect(Math.abs(jac.anisotropyRatio - 1)).toBeLessThan(1e-3);
    }
  });

  it("15. 5pt-fisheye-equisolid은 등면적 투영이므로 동일 거리에서 areaScale이 각도와 무관하게 일정하다", () => {
    const cam = makeCamera("5pt-fisheye-equisolid", { fovDegrees: 200 });
    const jCenter = computeCurvilinearJacobian({ x: 0, y: cam.eyePosition.y, z: 5 }, cam);
    const rad60 = Math.PI / 3;
    const j60 = computeCurvilinearJacobian({ x: Math.sin(rad60) * 5, y: cam.eyePosition.y, z: Math.cos(rad60) * 5 }, cam);
    expect(Math.abs(j60.areaScale / jCenter.areaScale - 1)).toBeLessThan(1e-3);
    expect(j60.anisotropyRatio).toBeGreaterThan(1.3);
  });

  it("16. 5pt-fisheye-equidistant 60도 외곽 이방성 비율이 해석치 θ/sin(θ)와 일치한다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant");
    const theta = Math.PI / 3;
    const jac = computeCurvilinearJacobian({ x: Math.sin(theta) * 4, y: cam.eyePosition.y, z: Math.cos(theta) * 4 }, cam);
    expect(Math.abs(jac.anisotropyRatio - theta / Math.sin(theta))).toBeLessThan(2e-3);
  });

  it("17. 6점 이중 반구에서 적도(z=0)를 가로지르는 비방사선 직선은 이음새 분할과 곡면 굴절을 모두 보인다", () => {
    const cam = makeCamera("6pt-spherical-dual");
    const poly = sampleWorldSegmentAsGeodesic({ x: -3.5, y: 3.8, z: 5.5 }, { x: 4.5, y: 3.8, z: -5.5 }, cam, 32);
    expect(poly.seamSplitCount).toBeGreaterThanOrEqual(1);
    expect(poly.segments.length).toBeGreaterThanOrEqual(2);
    const hemis = new Set(poly.segments.map((s) => s.hemisphere));
    expect(hemis.has("front") && hemis.has("back")).toBe(true);
    expect(poly.maxBendDeviationPx).toBeGreaterThan(4);
  });

  it("18. 가이드 그리드 생성기가 모드별 지평선·자오선·위선·반구 림을 정확히 구축한다", () => {
    const grid5 = generateCurvilinearGuideGrid(makeCamera("5pt-fisheye-equidistant"), 6);
    expect(grid5.horizonSegments.length).toBeGreaterThan(0);
    expect(grid5.guideArcs.some((a) => a.kind === "meridian")).toBe(true);
    expect(grid5.guideArcs.some((a) => a.kind === "parallel")).toBe(true);
    expect(grid5.hemisphereBounds.length).toBe(1);
    expect(generateCurvilinearGuideGrid(makeCamera("6pt-spherical-dual"), 4).hemisphereBounds.length).toBe(2);
    expect(generateCurvilinearGuideGrid(makeCamera("5pt-panini"), 4).hemisphereBounds.length).toBe(0);
  });
});

describe("Wave 90: 실시간 굴절 브러시, 3D 프롭 곡면 보정, WGSL & SVG 감사", () => {
  it("19. 바닥 평면 굴절 브러시 획은 소실점으로 멀어질수록 닙 두께가 물리적으로 가늘어진다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant", { eyePosition: { x: 0, y: 1.8, z: 0 } });
    const samples: StylusSampleInput[] = [2, 5, 10, 16, 24].map((z, idx) => {
      const p = projectWorld3DToCurvilinear2D({ x: 1.2, y: 0, z }, cam);
      return { x: p.x, y: p.y, pressure: 0.85, timestampMs: idx * 16 };
    });

    const result = refractBrushStrokeInCurvilinearSpace(
      samples,
      cam,
      { kind: "floor", offsetDistance: 1.8 },
      { baseBrushWidthPx: 14, snapAxis: "free", resampleSpacingPx: 8, referenceDistanceM: 4 },
    );

    expect(result.stamps.length).toBeGreaterThan(8);
    expect(result.planeHitRate).toBe(1);
    const first = result.stamps[0];
    const last = result.stamps[result.stamps.length - 1];
    expect(first && last && first.nib.widthPx > last.nib.widthPx * 2).toBe(true);
    for (const st of result.stamps) {
      expect(st.nib.widthPx).toBeGreaterThanOrEqual(st.nib.minorWidthPx);
      expect(st.nib.minorWidthPx).toBeGreaterThan(0);
    }
  });

  it("20. floor 평면 auto-dominant 스냅이 흔들린 손그림을 Z축 소실점 측지선에 정확히 정렬한다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant", { eyePosition: { x: 0, y: 1.8, z: 0 } });
    const noisy: StylusSampleInput[] = [2.5, 5, 8, 12, 18].map((z, idx) => {
      const jitterX = idx === 0 ? 0 : idx % 2 === 0 ? 0.55 : -0.45;
      const p = projectWorld3DToCurvilinear2D({ x: 1.5 + jitterX, y: 0, z }, cam);
      return { x: p.x, y: p.y, pressure: 0.8, timestampMs: idx * 20 };
    });

    const result = refractBrushStrokeInCurvilinearSpace(
      noisy,
      cam,
      { kind: "floor", offsetDistance: 1.8 },
      { baseBrushWidthPx: 10, snapAxis: "auto-dominant", snapStrength: 1, smoothingPasses: 0 },
    );
    expect(result.resolvedSnapAxis).toBe("z");
    expect(result.maxSnapResidualPx).toBeGreaterThan(2);
    const anchorX = result.stamps[0]?.worldPoint.x ?? 0;
    for (const st of result.stamps) {
      expect(Math.abs(st.worldPoint.x - anchorX)).toBeLessThan(1e-3);
      expect(Math.abs(st.worldPoint.y)).toBeLessThan(1e-3);
    }
  });

  it("21. left-wall 평면 auto-dominant 스냅은 평면 법선(X)을 배제하고 수직(Y) 또는 깊이(Z)를 자동 판별한다", () => {
    const cam = makeCamera("4pt-cylindrical", { eyePosition: { x: 0, y: 1.6, z: 0 } });
    const vSamples: StylusSampleInput[] = [-1, 0.5, 2.5, 5.0].map((y, idx) => {
      const p = projectWorld3DToCurvilinear2D({ x: -3.0, y, z: 5 + idx * 0.08 }, cam);
      return { x: p.x, y: p.y, pressure: 0.75, timestampMs: idx * 18 };
    });
    expect(
      refractBrushStrokeInCurvilinearSpace(vSamples, cam, { kind: "left-wall", offsetDistance: 3.0 }, { baseBrushWidthPx: 8, snapAxis: "auto-dominant" }).resolvedSnapAxis,
    ).toBe("y");

    const zSamples: StylusSampleInput[] = [2, 5, 9, 14].map((z, idx) => {
      const p = projectWorld3DToCurvilinear2D({ x: -3.0, y: 2.2 + idx * 0.05, z }, cam);
      return { x: p.x, y: p.y, pressure: 0.75, timestampMs: idx * 18 };
    });
    expect(
      refractBrushStrokeInCurvilinearSpace(zSamples, cam, { kind: "left-wall", offsetDistance: 3.0 }, { baseBrushWidthPx: 8, snapAxis: "auto-dominant" }).resolvedSnapAxis,
    ).toBe("z");
  });

  it("22. 부분 snapStrength(0.5)는 완전 스냅(1.0)보다 잔차가 작고 반복 실행 시 완전히 결정적이다", () => {
    const cam = makeCamera("5pt-panini", { fovDegrees: 165 });
    const samples: StylusSampleInput[] = [-4, -1.5, 1.5, 4.5].map((x, idx) => {
      const p = projectWorld3DToCurvilinear2D({ x, y: 0, z: 6 + (idx % 2 === 0 ? 0 : 1.1) }, cam);
      return { x: p.x, y: p.y, pressure: 0.9, tiltX: 0.2, timestampMs: idx * 15 };
    });

    const half = refractBrushStrokeInCurvilinearSpace(samples, cam, { kind: "floor", offsetDistance: 1.6 }, { baseBrushWidthPx: 12, snapAxis: "x", snapStrength: 0.5, smoothingPasses: 0 });
    const fullA = refractBrushStrokeInCurvilinearSpace(samples, cam, { kind: "floor", offsetDistance: 1.6 }, { baseBrushWidthPx: 12, snapAxis: "x", snapStrength: 1.0, smoothingPasses: 0 });
    const fullB = refractBrushStrokeInCurvilinearSpace(samples, cam, { kind: "floor", offsetDistance: 1.6 }, { baseBrushWidthPx: 12, snapAxis: "x", snapStrength: 1.0, smoothingPasses: 0 });

    expect(half.meanSnapResidualPx).toBeLessThan(fullA.meanSnapResidualPx);
    expect(fullA.stamps).toEqual(fullB.stamps);
  });

  it("23. 평면 미교차(하늘 쪽 획)와 빈 샘플 입력에서도 NaN 없이 안전하게 폴백한다", () => {
    const cam = makeCamera("5pt-fisheye-equidistant");
    const empty = refractBrushStrokeInCurvilinearSpace([], cam, { kind: "floor", offsetDistance: 1.6 }, { baseBrushWidthPx: 10 });
    expect(empty.stamps.length).toBe(0);

    const sky = refractBrushStrokeInCurvilinearSpace(
      [
        { x: 520, y: 180, pressure: 0.7, timestampMs: 0 },
        { x: 640, y: 160, pressure: 0.8, timestampMs: 16 },
      ],
      cam,
      { kind: "floor", offsetDistance: 1.6 },
      { baseBrushWidthPx: 10, snapAxis: "free" },
    );
    expect(sky.planeHitRate).toBe(0);
    expect(sky.stamps.length).toBeGreaterThan(1);
    for (const st of sky.stamps) {
      expect(Number.isFinite(st.x) && Number.isFinite(st.y) && Number.isFinite(st.nib.widthPx)).toBe(true);
    }
  });

  it("24. 3D box-building 프롭은 곡면 굴절, 후면 컬링, 원거리→근거리 깊이 정렬을 수행한다", () => {
    const bent = bend3DPropIntoCurvilinearCurves(
      { kind: "box-building", id: "tower-a", center: { x: 4.5, y: 4.0, z: 7.5 }, width: 4, height: 10, depth: 4, floorDivisions: 4 },
      makeCamera("5pt-fisheye-equidistant"),
    );
    expect(bent.curves.length).toBeGreaterThan(12);
    expect(bent.culledBackFaceCount).toBeGreaterThan(0);
    expect(bent.visibleFaceCount).toBeGreaterThan(0);
    expect(bent.maxBendDeviationPx).toBeGreaterThan(3);
    for (let i = 1; i < bent.curves.length; i += 1) {
      const prev = bent.curves[i - 1];
      const curr = bent.curves[i];
      expect(prev && curr && prev.avgDepth >= curr.avgDepth).toBe(true);
    }
  });

  it("25. 3D arch-doorway와 pillar-row 프롭이 아치 곡선과 원근 열주를 정확히 생성한다", () => {
    const cam = makeCamera("5pt-panini", { fovDegrees: 170 });
    const arch = bend3DPropIntoCurvilinearCurves(
      { kind: "arch-doorway", id: "gate-1", center: { x: 0, y: 2.0, z: 6.0 }, width: 3.6, height: 4.8, depth: 1.2, archSegments: 10 },
      cam,
    );
    expect(arch.curves.some((c) => c.role === "arch")).toBe(true);
    expect(arch.visibleEdgeCount).toBeGreaterThan(20);

    const pillars = bend3DPropIntoCurvilinearCurves(
      { kind: "pillar-row", id: "colonnade", start: { x: -3.5, y: 2.0, z: 3.0 }, spacing: 3.5, count: 4, pillarWidth: 0.7, pillarHeight: 4.5, rowAxis: "z" },
      cam,
    );
    expect(pillars.depthRange.maxDepth).toBeGreaterThan(pillars.depthRange.minDepth + 6);
    expect(pillars.curves.length).toBeGreaterThan(30);
  });

  it("26. 3D action-speedline-tunnel 프롭이 집중선과 충격파 링을 소실점 방향으로 굴절 생성한다", () => {
    const tunnel = bend3DPropIntoCurvilinearCurves(
      { kind: "action-speedline-tunnel", id: "impact-tunnel", center: { x: 0, y: 1.6, z: 0 }, radius: 3.2, nearDepth: 1.5, farDepth: 28, rayCount: 16, ringCount: 3, twistRad: 0.35 },
      makeCamera("5pt-fisheye-equisolid", { fovDegrees: 190 }),
    );
    expect(tunnel.curves.filter((c) => c.role === "speedline").length).toBe(16);
    expect(tunnel.curves.filter((c) => c.role === "ring").length).toBeGreaterThan(40);
    expect(tunnel.maxBendDeviationPx).toBeGreaterThan(1);
  });

  it("27. 6개 모든 투영 모드의 WGSL 셰이더가 16바이트 정렬과 구문·바인딩 검증을 통과한다", () => {
    for (const mode of ALL_MODES) {
      const artifact = buildCurvilinearRefractionWgsl(mode);
      const report = validateCurvilinearWgsl(artifact);
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(artifact.uniformBufferByteLength % 16).toBe(0);
      expect(artifact.entryPoints).toContain("cs_refract_brush_stamps");
      expect(artifact.entryPoints).toContain("fs_curvilinear_guide_overlay");
      expect(artifact.bindings.length).toBe(3);
    }
  });

  it("28. WGSL 검증기가 중괄호 불균형·비정렬 유니폼·NaN 리터럴 결함을 정확히 검출한다", () => {
    const validArt = buildCurvilinearRefractionWgsl("5pt-panini");
    const broken = validateCurvilinearWgsl({
      ...validArt,
      uniformBufferByteLength: 70,
      wgsl: `${validArt.wgsl}\nlet bad = NaN;\nfn oops() {`,
    });
    expect(broken.valid).toBe(false);
    expect(broken.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("29. 고대비 SVG 렌더러가 0 NaN, 태그 균형, XML 이스케이프, 라이트·다크 테마를 보장한다", () => {
    const cam = makeCamera("6pt-spherical-dual");
    const grid = generateCurvilinearGuideGrid(cam, 4);
    const prop = bend3DPropIntoCurvilinearCurves(
      { kind: "box-building", id: "bldg<&>1", label: "옥상 \"전망대\" <A>", center: { x: 2.5, y: 2.2, z: 5.5 }, width: 3, height: 5, depth: 3 },
      cam,
    );
    const p0 = projectWorld3DToCurvilinear2D({ x: -1.5, y: 0, z: 3 }, cam);
    const p1 = projectWorld3DToCurvilinear2D({ x: -1.5, y: 0, z: 12 }, cam);
    const stroke = refractBrushStrokeInCurvilinearSpace(
      [{ x: p0.x, y: p0.y, pressure: 0.9, timestampMs: 0 }, { x: p1.x, y: p1.y, pressure: 0.6, timestampMs: 32 }],
      cam,
      { kind: "floor", offsetDistance: 1.6 },
      { baseBrushWidthPx: 12, snapAxis: "z" },
    );

    const svgLight = renderCurvilinearPerspectiveSvg({
      title: "6점 구면 투시 <테스트> & \"검증\"",
      camera: cam,
      guideGrid: grid,
      props: [prop],
      strokes: [stroke],
      theme: "light",
    });
    const svgDark = renderCurvilinearPerspectiveSvg({ title: "다크 테마 테스트", camera: cam, guideGrid: grid, theme: "dark" });

    expect(svgLight.startsWith("<svg ") && svgLight.endsWith("</svg>")).toBe(true);
    expect(svgLight.includes("NaN") || svgLight.includes("Infinity")).toBe(false);
    expect(svgLight.includes("&lt;테스트&gt; &amp; &quot;검증&quot;")).toBe(true);
    expect(svgLight.includes("후면 VP") && svgLight.includes("<ellipse ")).toBe(true);
    expect((svgLight.match(/<g[\s>]/g) ?? []).length).toBe((svgLight.match(/<\/g>/g) ?? []).length);
    expect(svgDark.includes("#131715")).toBe(true);
  });

  it("30. 한국어 세션 요약 리포트가 핵심 지표를 정확히 집계하고 번역투 표현을 배제한다", () => {
    const cam = makeCamera("5pt-panini", { fovDegrees: 175 });
    const prop = bend3DPropIntoCurvilinearCurves(
      { kind: "box-building", id: "hero-bldg", center: { x: 4, y: 3, z: 7 }, width: 4, height: 8, depth: 4 },
      cam,
    );
    const p0 = projectWorld3DToCurvilinear2D({ x: 1, y: 0, z: 3 }, cam);
    const p1 = projectWorld3DToCurvilinear2D({ x: 1, y: 0, z: 14 }, cam);
    const stroke = refractBrushStrokeInCurvilinearSpace(
      [{ x: p0.x, y: p0.y, pressure: 0.9, timestampMs: 0 }, { x: p1.x, y: p1.y, pressure: 0.7, timestampMs: 24 }],
      cam,
      { kind: "floor", offsetDistance: 1.6 },
      { baseBrushWidthPx: 10, snapAxis: "auto-dominant" },
    );

    const summary = summarizeCurvilinearSessionKo({
      camera: cam,
      props: [prop],
      strokes: [stroke],
      wgslArtifact: buildCurvilinearRefractionWgsl("5pt-panini"),
    });

    expect(summary.modeLabelKo).toContain("파니니");
    expect(summary.fovDegrees).toBe(175);
    expect(summary.activeVanishingPointIds).toContain("front");
    expect(summary.propCount).toBe(1);
    expect(summary.strokeCount).toBe(1);
    expect(summary.stampCount).toBeGreaterThan(2);
    expect(summary.maxGeodesicBendPx).toBeGreaterThan(0);
    expect(summary.bulletLinesKo.length).toBe(4);
    expect(summary.summaryParagraphKo).toContain("수직 건축선");
    expect(summary.summaryParagraphKo).toContain("WebGPU 셰이더");
    for (const phrase of ["가능하게 합니다", "직관적인 경험을 제공", "원활한 워크플로우를 보장"]) {
      expect(summary.summaryParagraphKo.includes(phrase)).toBe(false);
    }
  });
});
