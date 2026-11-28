import { describe, expect, it } from "vitest";
import {
  bakeBackgroundColorBleedGi,
  buildBackgroundNprGiWgsl,
  createParametricBackgroundPreset,
  escapeNprSvgXml,
  extract3dBackgroundNprLines,
  harmonizeBackgroundFor2dCharacterDepth,
  linearRgbToOklchCss,
  projectMesh3dToCamera,
  render3dBackgroundNprSvg,
  summarizeBackgroundNprBakeKo,
  validateBackgroundNprGiWgsl,
  type BackgroundMesh3d,
  type BackgroundPresetId,
  type PinholeCamera3d,
  type RgbLinear,
  type Vec3,
} from "./index";

const FRONT_CAM: PinholeCamera3d = {
  eye: [0, 1.4, 5.0],
  target: [0, 1.0, 0],
  fovYDeg: 50,
  widthPx: 960,
  heightPx: 540,
};

function makeBoxMesh(
  id: string,
  minPt: Vec3,
  maxPt: Vec3,
  materialId: string = "box-mat",
  albedoRgb: RgbLinear = [0.8, 0.8, 0.8],
): BackgroundMesh3d {
  const [x0, y0, z0] = minPt;
  const [x1, y1, z1] = maxPt;
  return {
    id,
    labelKo: id,
    vertices: [
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    ],
    faces: [
      { vertexIndices: [0, 1, 2, 3], materialId, albedoRgb, surfaceTag: "front" },
      { vertexIndices: [5, 4, 7, 6], materialId, albedoRgb, surfaceTag: "back" },
      { vertexIndices: [4, 0, 3, 7], materialId, albedoRgb, surfaceTag: "left" },
      { vertexIndices: [1, 5, 6, 2], materialId, albedoRgb, surfaceTag: "right" },
      { vertexIndices: [3, 2, 6, 7], materialId, albedoRgb, surfaceTag: "top" },
      { vertexIndices: [4, 5, 1, 0], materialId, albedoRgb, surfaceTag: "bottom" },
    ],
  };
}

function makeFloorAndWhiteWallRoom(floorAlbedo: RgbLinear): BackgroundMesh3d {
  return {
    id: "cornell-floor-wall",
    labelKo: "바닥-벽 색번짐 검증실",
    vertices: [
      [-2.5, 0, 2.0], [2.5, 0, 2.0], [2.5, 0, -2.5], [-2.5, 0, -2.5],
      [-2.5, 0, -2.5], [2.5, 0, -2.5], [2.5, 1.4, -2.5], [-2.5, 1.4, -2.5],
      [-2.5, 1.4, -2.5], [2.5, 1.4, -2.5], [2.5, 3.0, -2.5], [-2.5, 3.0, -2.5],
    ],
    faces: [
      { vertexIndices: [0, 1, 2, 3], materialId: "wood-floor", albedoRgb: floorAlbedo, surfaceTag: "floor" },
      { vertexIndices: [4, 5, 6, 7], materialId: "lower-wall", albedoRgb: [0.92, 0.92, 0.92], surfaceTag: "lower-white-wall" },
      { vertexIndices: [8, 9, 10, 11], materialId: "upper-wall", albedoRgb: [0.92, 0.92, 0.92], surfaceTag: "upper-white-wall" },
    ],
    defaultCamera: { eye: [0, 1.45, 3.2], target: [0, 1.0, -2.5], fovYDeg: 52, widthPx: 960, heightPx: 540 },
  };
}

function mergeMeshes(id: string, labelKo: string, a: BackgroundMesh3d, b: BackgroundMesh3d): BackgroundMesh3d {
  const offset = a.vertices.length;
  return {
    id,
    labelKo,
    vertices: [...a.vertices, ...b.vertices],
    faces: [
      ...a.faces,
      ...b.faces.map((f) => ({ ...f, vertexIndices: f.vertexIndices.map((idx) => idx + offset) })),
    ],
  };
}

describe("Wave 113: 3D 배경 NPR 선화 추출·은선 제거(HLR)", () => {
  it("1. 공면 사각형(2삼각형 분할) 평면 벽은 내부 대각선 잡선 0건, 외곽 경계 4개만 추출한다", () => {
    const flatWall: BackgroundMesh3d = {
      id: "flat-wall-2tri",
      labelKo: "단일 평면 벽",
      vertices: [[-2, 0, 0], [2, 0, 0], [2, 2.4, 0], [-2, 2.4, 0]],
      faces: [
        { vertexIndices: [0, 1, 2], materialId: "plaster", albedoRgb: [0.9, 0.9, 0.9] },
        { vertexIndices: [0, 2, 3], materialId: "plaster", albedoRgb: [0.9, 0.9, 0.9] },
      ],
    };

    const res = extract3dBackgroundNprLines(flatWall, FRONT_CAM);
    expect(res.counts.diagonalClutterCount).toBe(0);
    expect(res.counts.smoothInteriorSuppressed).toBe(1);
    expect(res.counts.silhouetteBoundaryEdges).toBe(4);
    expect(res.counts.hardCreaseEdges).toBe(0);
    expect(res.counts.materialSeamEdges).toBe(0);
    expect(res.segments.length).toBe(4);
  });

  it("2. 3x3 세분화 공면 그리드 벽(18삼각형)도 내부 대각선과 공면 이음매를 전부 억제한다", () => {
    const vertices: Vec3[] = [];
    for (let r = 0; r <= 3; r++) {
      for (let c = 0; c <= 3; c++) vertices.push([-1.5 + c, r * 0.8, 0]);
    }
    const faces = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const i0 = r * 4 + c;
        faces.push({
          vertexIndices: [i0, i0 + 1, i0 + 5, i0 + 4],
          materialId: "smooth-wall",
          albedoRgb: [0.88, 0.88, 0.88] as RgbLinear,
        });
      }
    }

    const res = extract3dBackgroundNprLines({ id: "grid-wall-3x3", labelKo: "세분화 평면 벽", vertices, faces }, FRONT_CAM);
    expect(res.counts.diagonalClutterCount).toBe(0);
    expect(res.counts.smoothInteriorSuppressed).toBe(21);
    expect(res.counts.silhouetteBoundaryEdges).toBe(12);
    expect(res.counts.hardCreaseEdges).toBe(0);
  });

  it("3. 정육면체 3/4 시점에서 실루엣 경계선과 90도 하드 크리즈를 정확히 구분하고 대각선을 억제한다", () => {
    const cube = makeBoxMesh("unit-cube", [-0.8, 0, -0.8], [0.8, 1.6, 0.8]);
    const cam: PinholeCamera3d = { eye: [2.8, 2.6, 3.2], target: [0, 0.8, 0], fovYDeg: 48, widthPx: 960, heightPx: 540 };
    const res = extract3dBackgroundNprLines(cube, cam);

    expect(res.projection.frontTriangleCount).toBe(6);
    expect(res.projection.backTriangleCount).toBe(6);
    expect(res.counts.silhouetteBoundaryEdges).toBe(6);
    expect(res.counts.hardCreaseEdges).toBe(3);
    expect(res.counts.smoothInteriorSuppressed).toBe(3);
    expect(res.counts.diagonalClutterCount).toBe(0);
    const creases = res.segments.filter((s) => s.edgeClass === "hard-crease");
    expect(creases.length).toBe(3);
    for (const seg of creases) expect(seg.dihedralDeg).toBeCloseTo(90, 0);
  });

  it("4. 이면각 크리즈 임계값(creaseAngleDeg)을 기준으로 완만한 꺾임과 예리한 크리즈를 구분한다", () => {
    const angleRad = (22 * Math.PI) / 180;
    const bentWall: BackgroundMesh3d = {
      id: "bent-22deg",
      labelKo: "22도 꺾인 벽",
      vertices: [
        [-2, 0, 0], [0, 0, 0], [0, 2, 0], [-2, 2, 0],
        [2 * Math.cos(angleRad), 0, 2 * Math.sin(angleRad)],
        [2 * Math.cos(angleRad), 2, 2 * Math.sin(angleRad)],
      ],
      faces: [
        { vertexIndices: [0, 1, 2, 3], materialId: "wall", albedoRgb: [0.9, 0.9, 0.9] },
        { vertexIndices: [1, 4, 5, 2], materialId: "wall", albedoRgb: [0.9, 0.9, 0.9] },
      ],
    };

    const defaultRes = extract3dBackgroundNprLines(bentWall, FRONT_CAM, { creaseAngleDeg: 35 });
    const sensitiveRes = extract3dBackgroundNprLines(bentWall, FRONT_CAM, { creaseAngleDeg: 15 });
    expect(defaultRes.counts.hardCreaseEdges).toBe(0);
    expect(sensitiveRes.counts.hardCreaseEdges).toBe(1);
    expect(defaultRes.counts.diagonalClutterCount).toBe(0);
  });

  it("5. 공면이어도 재질 ID가 다른 두 패널 사이의 경계선은 material-seam으로 정확히 검출한다", () => {
    const twoMaterialWall: BackgroundMesh3d = {
      id: "material-seam-wall",
      labelKo: "재질 경계 벽",
      vertices: [[-2, 0, 0], [0, 0, 0], [0, 2, 0], [-2, 2, 0], [2, 0, 0], [2, 2, 0]],
      faces: [
        { vertexIndices: [0, 1, 2, 3], materialId: "tile-left", albedoRgb: [0.85, 0.82, 0.78] },
        { vertexIndices: [1, 4, 5, 2], materialId: "wood-right", albedoRgb: [0.65, 0.45, 0.25] },
      ],
    };

    const res = extract3dBackgroundNprLines(twoMaterialWall, FRONT_CAM);
    expect(res.counts.materialSeamEdges).toBe(1);
    expect(res.counts.diagonalClutterCount).toBe(0);
    const seamSegs = res.segments.filter((s) => s.edgeClass === "material-seam");
    expect(seamSegs.length).toBe(1);
    expect(seamSegs[0].dihedralDeg).toBeCloseTo(0, 1);
  });

  it("6. 완전 은선 제거(HLR): 전경 대형 가림막 뒤의 작은 후경 상자 선분이 완전히 제거된다", () => {
    const fgBlocker = makeBoxMesh("fg-blocker", [-2.2, 0, 1.5], [2.2, 3.0, 2.0], "fg-wall");
    const bgSmall = makeBoxMesh("bg-small", [-0.5, 0.4, -2.5], [0.5, 1.4, -1.8], "bg-box");
    const combined = mergeMeshes("full-hlr-test", "완전 가림 검증", fgBlocker, bgSmall);
    const cam: PinholeCamera3d = { eye: [0, 1.2, 5.2], target: [0, 1.1, 0], fovYDeg: 52, widthPx: 960, heightPx: 540 };

    const hlrOn = extract3dBackgroundNprLines(combined, cam, { enableHlr: true });
    const hlrOff = extract3dBackgroundNprLines(combined, cam, { enableHlr: false });

    expect(hlrOn.counts.occludedSampleCount).toBeGreaterThan(0);
    expect(hlrOn.counts.hiddenSegmentCount).toBeGreaterThan(0);
    expect(hlrOn.segments.length).toBeLessThan(hlrOff.segments.length);
    for (const seg of hlrOn.segments) expect(seg.materialPair[0]).toBe("fg-wall");
  });

  it("7. 부분 은선 제거(HLR): 전경 좁은 기둥이 넓은 뒷벽 가로 모서리를 좌·우 두 가시 선분으로 분할한다", () => {
    const pillar = makeBoxMesh("fg-pillar", [-0.35, 0, 1.2], [0.35, 2.8, 1.8], "pillar");
    const backWall: BackgroundMesh3d = {
      id: "back-wall",
      labelKo: "뒷벽",
      vertices: [[-3.0, 0.3, -2.0], [3.0, 0.3, -2.0], [3.0, 2.2, -2.0], [-3.0, 2.2, -2.0]],
      faces: [{ vertexIndices: [0, 1, 2, 3], materialId: "back-wall", albedoRgb: [0.9, 0.9, 0.9] }],
    };
    const scene = mergeMeshes("partial-hlr-pillar", "기둥 부분 가림 검증", pillar, backWall);

    const res = extract3dBackgroundNprLines(scene, FRONT_CAM, { hlrSubdivisions: 20 });
    expect(res.counts.occludedSampleCount).toBeGreaterThan(0);
    expect(res.counts.hiddenSegmentCount).toBeGreaterThanOrEqual(2);
    const backWallSegs = res.segments.filter((s) => s.materialPair[0] === "back-wall");
    expect(backWallSegs.length).toBeGreaterThanOrEqual(6);
  });

  it("8. 깊이 가중 손그림 선 감쇠: 근경 선분이 원경 선분보다 확실히 굵고 진하다", () => {
    const nearBox = makeBoxMesh("near-box", [-1.4, 0, 2.0], [-0.4, 1.2, 2.6], "near-prop");
    const farBox = makeBoxMesh("far-box", [0.4, 0, -6.0], [2.2, 2.4, -5.0], "far-prop");
    const combined = mergeMeshes("depth-attenuation-pair", "근경·원경 깊이 감쇠 검증", nearBox, farBox);
    const cam: PinholeCamera3d = { eye: [0, 1.4, 5.2], target: [0, 1.1, -2.0], fovYDeg: 52, widthPx: 960, heightPx: 540 };

    const res = extract3dBackgroundNprLines(combined, cam);
    expect(res.depthAttenuation.meanNearLineWidthPx).toBeGreaterThan(res.depthAttenuation.meanFarLineWidthPx);
    expect(res.depthAttenuation.nearToFarWidthRatio).toBeGreaterThan(1.3);

    const nearSegs = res.segments.filter((s) => s.materialPair[0] === "near-prop");
    const farSegs = res.segments.filter((s) => s.materialPair[0] === "far-prop");
    const nearAvgL = nearSegs.reduce((a, s) => a + s.inkLightness, 0) / nearSegs.length;
    const farAvgL = farSegs.reduce((a, s) => a + s.inkLightness, 0) / farSegs.length;
    expect(nearAvgL).toBeLessThan(farAvgL);
  });

  it("9. 손그림 G펜 테이퍼: 각 선분의 중앙 필압 굵기가 양 끝점 테이퍼보다 두껍다", () => {
    const res = extract3dBackgroundNprLines(createParametricBackgroundPreset("korean-classroom"));
    expect(res.segments.length).toBeGreaterThan(20);
    for (const seg of res.segments) {
      expect(seg.widthMidPx).toBeGreaterThan(seg.widthStartPx);
      expect(seg.widthMidPx).toBeGreaterThan(seg.widthEndPx);
    }
  });

  it("10. 카메라 근평면 뒤 정점이 섞인 메쉬도 NaN/Infinity 없이 안전하게 클리핑한다", () => {
    const straddlingWall: BackgroundMesh3d = {
      id: "near-plane-clip",
      labelKo: "근평면 교차 벽",
      vertices: [[-2, 0, 8.0], [-2, 0, -4.0], [-2, 2.5, -4.0], [-2, 2.5, 8.0]],
      faces: [{ vertexIndices: [0, 1, 2, 3], materialId: "side-wall", albedoRgb: [0.9, 0.9, 0.9] }],
    };

    const res = extract3dBackgroundNprLines(straddlingWall, FRONT_CAM);
    for (const seg of res.segments) {
      expect(Number.isFinite(seg.x1) && Number.isFinite(seg.y1)).toBe(true);
      expect(Number.isFinite(seg.x2) && Number.isFinite(seg.y2)).toBe(true);
      expect(seg.depthStartMeters).toBeGreaterThan(0);
      expect(seg.depthEndMeters).toBeGreaterThan(0);
    }
  });

  const allPresets: readonly BackgroundPresetId[] = ["korean-classroom", "seoul-alley", "cafe-interior"];

  it.each(allPresets)(
    "11. 프리셋 '%s'은 대각 잡선 0건, 은선 가림 검출, 근경>원경 선굵기 감쇠를 모두 만족한다",
    (presetId) => {
      const res = extract3dBackgroundNprLines(createParametricBackgroundPreset(presetId));
      expect(res.counts.diagonalClutterCount).toBe(0);
      expect(res.counts.smoothInteriorSuppressed).toBeGreaterThan(0);
      expect(res.counts.silhouetteBoundaryEdges).toBeGreaterThan(0);
      expect(res.counts.hardCreaseEdges).toBeGreaterThan(0);
      expect(res.counts.materialSeamEdges).toBeGreaterThan(0);
      expect(res.counts.occludedSampleCount).toBeGreaterThan(0);
      expect(res.counts.hiddenSegmentCount).toBeGreaterThan(0);
      expect(res.depthAttenuation.meanNearLineWidthPx).toBeGreaterThan(res.depthAttenuation.meanFarLineWidthPx);
    },
  );
});

describe("Wave 113: 1-바운스 GI 색번짐 & 2D 캐릭터 조화 · WGSL", () => {
  const neutralLightOpts = {
    sunDirection: [0.0, 0.92, 0.39] as Vec3,
    sunColorRgb: [1.0, 1.0, 1.0] as RgbLinear,
    sunIntensity: 1.5,
    skyZenithRgb: [0.5, 0.5, 0.5] as RgbLinear,
    skyGroundRgb: [0.5, 0.5, 0.5] as RgbLinear,
    skyIntensity: 0.2,
  };

  it("12. 햇빛 받는 따뜻한 목재 바닥([0.85,0.42,0.18])이 인접 백색 벽 하단에 측정 가능한 난색(R > B) 색번짐을 전달한다", () => {
    const gi = bakeBackgroundColorBleedGi(projectMesh3dToCamera(makeFloorAndWhiteWallRoom([0.85, 0.42, 0.18])), neutralLightOpts);
    const lowerWall = gi.patches.filter((p) => p.surfaceTag === "lower-white-wall");
    expect(lowerWall.length).toBeGreaterThan(0);
    for (const p of lowerWall) {
      expect(p.bounceRadianceRgb[0]).toBeGreaterThan(p.bounceRadianceRgb[2]);
      expect(p.chromaticWarmthShift).toBeGreaterThan(0.01);
    }
    expect(gi.energyAudit.energyConserved).toBe(true);
    expect(gi.energyAudit.totalBounceRatio).toBeLessThan(1.0);
  });

  it("13. 차가운 코발트 청색 바닥([0.18,0.38,0.85])으로 바꾸면 백색 벽 반사광이 한색(B > R)으로 반전된다", () => {
    const gi = bakeBackgroundColorBleedGi(projectMesh3dToCamera(makeFloorAndWhiteWallRoom([0.18, 0.38, 0.85])), neutralLightOpts);
    const lowerWall = gi.patches.filter((p) => p.surfaceTag === "lower-white-wall");
    expect(lowerWall.length).toBeGreaterThan(0);
    for (const p of lowerWall) {
      expect(p.bounceRadianceRgb[2]).toBeGreaterThan(p.bounceRadianceRgb[0]);
      expect(p.chromaticWarmthShift).toBeLessThan(-0.01);
    }
  });

  it("14. 고반사 백색 밀폐실과 최대 bounceStrength(0.95)에서도 총 반사 에너지가 엄격히 1.0 미만으로 보존된다", () => {
    const w: RgbLinear = [0.96, 0.96, 0.96];
    const mesh: BackgroundMesh3d = {
      id: "high-albedo-closed-box",
      labelKo: "고반사 밀폐 박스",
      vertices: [
        [-2, 0, 2], [2, 0, 2], [2, 0, -2], [-2, 0, -2],
        [-2, 2.5, 2], [2, 2.5, 2], [2, 2.5, -2], [-2, 2.5, -2],
      ],
      faces: [
        { vertexIndices: [0, 1, 2, 3], materialId: "w", albedoRgb: w },
        { vertexIndices: [7, 6, 5, 4], materialId: "w", albedoRgb: w },
        { vertexIndices: [3, 2, 6, 7], materialId: "w", albedoRgb: w },
        { vertexIndices: [0, 3, 7, 4], materialId: "w", albedoRgb: w },
        { vertexIndices: [2, 1, 5, 6], materialId: "w", albedoRgb: w },
        { vertexIndices: [1, 0, 4, 5], materialId: "w", albedoRgb: w },
      ],
    };

    const proj = projectMesh3dToCamera(mesh, { eye: [0, 1.2, 1.8], target: [0, 1.2, -2], fovYDeg: 60, widthPx: 640, heightPx: 480 });
    const gi = bakeBackgroundColorBleedGi(proj, { bounceStrength: 0.95, sunIntensity: 3.0 });

    expect(gi.energyAudit.energyConserved).toBe(true);
    expect(gi.energyAudit.totalBounceRatio).toBeGreaterThan(0);
    expect(gi.energyAudit.totalBounceRatio).toBeLessThan(1.0);
    expect(gi.energyAudit.maxReceiverFormFactorSum).toBeLessThan(1.0);
    expect(gi.energyAudit.maxSenderOutgoingFormFactorSum).toBeLessThan(1.0);
    for (const p of gi.patches) {
      expect(p.totalRadianceRgb.every((ch) => Number.isFinite(ch))).toBe(true);
    }
  });

  it("15. bounceStrength=0일 때 반사 플럭스는 정확히 0이고 총 광도는 직접광과 같다", () => {
    const gi = bakeBackgroundColorBleedGi(projectMesh3dToCamera(createParametricBackgroundPreset("korean-classroom")), { bounceStrength: 0 });
    expect(gi.energyAudit.totalBounceFlux).toBe(0);
    expect(gi.energyAudit.totalBounceRatio).toBe(0);
    for (const p of gi.patches) {
      expect(p.bounceRadianceRgb).toEqual([0, 0, 0]);
      expect(p.totalRadianceRgb).toEqual(p.directRadianceRgb);
    }
  });

  it("16. 서로 등을 돌린(동일 법선 공면) 두 패치 사이에는 형태계수 색번짐이 0이다", () => {
    const parallelMesh: BackgroundMesh3d = {
      id: "coplanar-two-panels",
      labelKo: "동일 평면 두 패널",
      vertices: [[-2, 0, 0], [0, 0, 0], [0, 2, 0], [-2, 2, 0], [0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]],
      faces: [
        { vertexIndices: [0, 1, 2, 3], materialId: "red", albedoRgb: [0.9, 0.1, 0.1] },
        { vertexIndices: [4, 5, 6, 7], materialId: "white", albedoRgb: [0.9, 0.9, 0.9] },
      ],
    };
    const gi = bakeBackgroundColorBleedGi(projectMesh3dToCamera(parallelMesh, FRONT_CAM));
    expect(gi.energyAudit.totalBounceFlux).toBe(0);
    for (const p of gi.patches) expect(p.formFactorSum).toBe(0);
  });

  it("17. 한국 교실 프리셋에서 목재 바닥의 따뜻한 반사광이 뒷벽 하단에 난색으로 전달된다", () => {
    const gi = bakeBackgroundColorBleedGi(projectMesh3dToCamera(createParametricBackgroundPreset("korean-classroom")));
    const lowerBack = gi.patches.filter((p) => p.materialId === "lower-wall-plaster");
    expect(lowerBack.length).toBeGreaterThan(0);
    for (const patch of lowerBack) expect(patch.bounceRadianceRgb[0]).toBeGreaterThan(patch.bounceRadianceRgb[2]);
  });

  it("18. 2D 캐릭터 깊이 평면 조화기는 전경을 보존하고 캐릭터 뒤 배경만 명암 완화·안개 처리한다", () => {
    const classroom = createParametricBackgroundPreset("korean-classroom");
    const gi = bakeBackgroundColorBleedGi(projectMesh3dToCamera(classroom));
    const harmonized = harmonizeBackgroundFor2dCharacterDepth(gi, { characterDepthMeters: classroom.recommendedCharacterDepthMeters });

    expect(harmonized.foregroundPreservedCount).toBeGreaterThan(0);
    expect(harmonized.behindPatchCount).toBeGreaterThan(0);
    expect(harmonized.harmonizedBehindContrast).toBeLessThan(harmonized.rawBehindContrast);
    expect(harmonized.characterSeparationScore).toBeGreaterThan(harmonized.rawSeparationScore);
    expect(harmonized.characterSeparationScore).toBeGreaterThan(0.65);
    expect(harmonized.characterSeparationScore).toBeLessThanOrEqual(1.0);

    const fgPatches = harmonized.patches.filter((p) => p.isFrontFacing && p.behindCharacterFactor === 0);
    expect(fgPatches.length).toBeGreaterThan(0);
    for (const fg of fgPatches) expect(fg.harmonizedLightness).toBeCloseTo(fg.rawLightness, 3);
  });

  it.each(["korean-classroom", "seoul-alley", "cafe-interior"] as readonly BackgroundPresetId[])(
    "19. 프리셋 '%s' 모두 2D 캐릭터 조화 적용 후 인물 분리 점수가 상승하고 0..1 범위를 유지한다",
    (presetId) => {
      const mesh = createParametricBackgroundPreset(presetId);
      const harm = harmonizeBackgroundFor2dCharacterDepth(bakeBackgroundColorBleedGi(projectMesh3dToCamera(mesh)), {
        characterDepthMeters: mesh.recommendedCharacterDepthMeters,
      });
      expect(harm.characterSeparationScore).toBeGreaterThan(harm.rawSeparationScore);
      expect(harm.characterSeparationScore).toBeGreaterThan(0.6);
      expect(harm.characterSeparationScore).toBeLessThanOrEqual(1.0);
      expect(harm.energyAudit.energyConserved).toBe(true);
    },
  );

  it("20. 캐릭터 깊이 평면을 뒤로 밀면 조화 대상 원경 패치 수가 줄고 전경 보존 패치 수가 늘어난다", () => {
    const gi = bakeBackgroundColorBleedGi(projectMesh3dToCamera(createParametricBackgroundPreset("seoul-alley")));
    const nearChar = harmonizeBackgroundFor2dCharacterDepth(gi, { characterDepthMeters: 2.2 });
    const farChar = harmonizeBackgroundFor2dCharacterDepth(gi, { characterDepthMeters: 8.5 });
    expect(farChar.foregroundPreservedCount).toBeGreaterThan(nearChar.foregroundPreservedCount);
    expect(farChar.behindPatchCount).toBeLessThan(nearChar.behindPatchCount);
  });

  it("21. WebGPU WGSL 생성기 및 검증기: 정상 셰이더가 0 오류, 2 엔트리포인트, 4 바인딩으로 통과한다", () => {
    const artifact = buildBackgroundNprGiWgsl({ creaseAngleDeg: 35, characterDepthMeters: 3.2, bounceStrength: 0.85, mistStrength: 0.35 });
    const validation = validateBackgroundNprGiWgsl(artifact);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.entryPointCount).toBe(2);
    expect(validation.bindingCount).toBe(4);
    expect(artifact.entryPoints).toEqual(["cs_radiosity_one_bounce", "fs_background_npr_gi"]);
    expect(artifact.uniformBufferByteLength).toBe(64);
  });

  it("22. WGSL 검증기는 괄호 불균형·엔트리포인트 누락·금지 GLSL 토큰을 정확히 잡아낸다", () => {
    const broken = "@group(0) @binding(0) var<uniform> u_bad: vec4<f32>;\nuniform sampler2D legacy_tex;\nfn broken( { gl_FragColor = vec4(1.0);";
    const validation = validateBackgroundNprGiWgsl(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Wave 113: 결정성 · OKLCH SVG 렌더러 · 한국어 QA 보고서 · 경계 조건", () => {
  it("23. 동일 입력과 시드에서는 선화·GI·WGSL·SVG·한국어 브리프가 비트 단위로 완전히 동일하다", () => {
    const mesh = createParametricBackgroundPreset("cafe-interior");
    const runOnce = () => {
      const npr = extract3dBackgroundNprLines(mesh, undefined, { seed: 4242 });
      const harm = harmonizeBackgroundFor2dCharacterDepth(bakeBackgroundColorBleedGi(npr.projection), {
        characterDepthMeters: mesh.recommendedCharacterDepthMeters,
      });
      return { npr, harm, svg: render3dBackgroundNprSvg(npr, harm), report: summarizeBackgroundNprBakeKo(npr, harm) };
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.npr.segments).toEqual(b.npr.segments);
    expect(a.harm.patches).toEqual(b.harm.patches);
    expect(a.svg).toBe(b.svg);
    expect(a.report).toEqual(b.report);
  });

  it("24. 시드를 변경하면 모서리 분류 개수는 유지되면서 손그림 지터만 결정적으로 달라진다", () => {
    const mesh = createParametricBackgroundPreset("korean-classroom");
    const a = extract3dBackgroundNprLines(mesh, undefined, { seed: 1001 });
    const b = extract3dBackgroundNprLines(mesh, undefined, { seed: 2002 });
    expect(a.counts).toEqual(b.counts);
    expect(a.segments.some((s, idx) => s.organicJitterPx !== b.segments[idx]?.organicJitterPx)).toBe(true);
  });

  it("25. OKLCH SVG 출력은 NaN/Infinity가 없고 원시 hex/rgb 없이 oklch() 색상만 사용한다", () => {
    const mesh = createParametricBackgroundPreset("korean-classroom");
    const npr = extract3dBackgroundNprLines(mesh);
    const harm = harmonizeBackgroundFor2dCharacterDepth(bakeBackgroundColorBleedGi(npr.projection), {
      characterDepthMeters: mesh.recommendedCharacterDepthMeters,
    });
    const svg = render3dBackgroundNprSvg(npr, harm);
    const rawHexPattern = new RegExp("#[0-9a-fA-F]{3,8}", "u");
    const rawRgbPattern = new RegExp("rgba?\\(", "i");

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain('data-layer="gi-shaded-polygons"');
    expect(svg).toContain('data-layer="npr-hlr-lineart"');
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(rawHexPattern.test(svg)).toBe(false);
    expect(rawRgbPattern.test(svg)).toBe(false);
  });

  it("26. SVG 제목 및 XML 이스케이프가 <, >, &, 따옴표를 안전하게 치환한다", () => {
    expect(escapeNprSvgXml(`교실 <1반> & "창가" '오후'`)).toBe("교실 &lt;1반&gt; &amp; &quot;창가&quot; &apos;오후&apos;");
    const mesh = createParametricBackgroundPreset("seoul-alley");
    const npr = extract3dBackgroundNprLines(mesh);
    const svg = render3dBackgroundNprSvg(npr, bakeBackgroundColorBleedGi(npr.projection), { customTitle: `골목 <A&B> "야경"` });
    expect(svg).toContain("골목 &lt;A&amp;B&gt; &quot;야경&quot;");
    expect(svg).not.toContain("<A&B>");
  });

  it("27. linearRgbToOklchCss가 흑/백/난색/한색 및 비정상 NaN 입력을 안전하게 변환한다", () => {
    expect(linearRgbToOklchCss([0, 0, 0])).toBe("oklch(0.0000 0.0000 0.0)");
    expect(linearRgbToOklchCss([1, 1, 1])).toMatch(/^oklch\(1\.0000 0\.0000 0\.0\)$/u);
    expect(linearRgbToOklchCss([0.85, 0.42, 0.18], 0.85)).toMatch(/^oklch\([0-9.]+ [0-9.]+ [0-9.]+ \/ 0\.850\)$/u);
    const nanSafe = linearRgbToOklchCss([Number.NaN, Number.POSITIVE_INFINITY, -3]);
    expect(nanSafe).not.toContain("NaN");
    expect(nanSafe).not.toContain("Infinity");
  });

  it("28. 한국어 QA 브리프는 번역투 없이 자연스러운 한국어로 실루엣·은선·GI·인물 분리 수치를 보고한다", () => {
    const mesh = createParametricBackgroundPreset("cafe-interior");
    const npr = extract3dBackgroundNprLines(mesh);
    const harm = harmonizeBackgroundFor2dCharacterDepth(bakeBackgroundColorBleedGi(npr.projection), {
      characterDepthMeters: mesh.recommendedCharacterDepthMeters,
    });
    const summary = summarizeBackgroundNprBakeKo(npr, harm);

    expect(summary.verdict).toBe("ready");
    expect(summary.diagonalClutterCount).toBe(0);
    expect(summary.energyConserved).toBe(true);
    expect(summary.bulletsKo.length).toBe(5);
    expect(summary.reportTextKo).toContain("성수동 로스터리 카페 내부");
    expect(summary.reportTextKo).toContain("은선 제거(HLR)");
    expect(summary.reportTextKo).toContain("1-바운스 GI 색번짐");
    expect(summary.reportTextKo).toContain("2D 캐릭터 조화");
    expect(summary.reportTextKo).not.toContain("하는 것을 가능하게 합니다");
    expect(summary.reportTextKo).not.toContain("직관적인 경험을 제공합니다");
    expect(summary.reportTextKo).not.toContain("원활한 워크플로우를 보장합니다");
  });

  it("29. 빈 메쉬와 퇴화(면적 0) 삼각형도 예외나 NaN 없이 우아하게 처리한다", () => {
    const emptyMesh: BackgroundMesh3d = {
      id: "empty-bg",
      labelKo: "빈 배경",
      vertices: [[0, 0, 0], [0, 0, 0], [1, 0, 0]],
      faces: [{ vertexIndices: [0, 1, 2], materialId: "degen", albedoRgb: [0.5, 0.5, 0.5] }],
    };

    const npr = extract3dBackgroundNprLines(emptyMesh, FRONT_CAM);
    const gi = bakeBackgroundColorBleedGi(npr.projection);
    const harm = harmonizeBackgroundFor2dCharacterDepth(gi);
    const svg = render3dBackgroundNprSvg(npr, harm);
    const summary = summarizeBackgroundNprBakeKo(npr, harm);

    expect(npr.segments.length).toBe(0);
    expect(npr.counts.diagonalClutterCount).toBe(0);
    expect(gi.energyAudit.energyConserved).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(summary.headlineKo.length).toBeGreaterThan(0);
  });

  it("30. 원시 GI 결과(harmonize 미적용)도 render3dBackgroundNprSvg와 summarizeBackgroundNprBakeKo에서 정상 동작한다", () => {
    const npr = extract3dBackgroundNprLines(createParametricBackgroundPreset("seoul-alley"));
    const rawGi = bakeBackgroundColorBleedGi(npr.projection);
    const svg = render3dBackgroundNprSvg(npr, rawGi, { showHudLegend: false });
    const summary = summarizeBackgroundNprBakeKo(npr, rawGi);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(summary.characterSeparationScore).toBeNull();
    expect(summary.bulletsKo.length).toBe(4);
  });
});
