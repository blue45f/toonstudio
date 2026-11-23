// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { Model3dHandCustomizerPanel } from "./Model3dHandCustomizerPanel";
import {
  HAND_POSE_PRESETS,
  getHandPosePreset,
  mirrorHandPose,
  solveHandSkeleton3d,
  updateFingerCurlRatio,
  type HandPosePresetId,
  type Vec3,
} from "./hand-rig-3d";
import {
  DEFAULT_3D_FOLDER_GROUP,
  DEFAULT_AUTO_LOD_SCENE_INSTANCES,
  auditAndNormalize3dMesh,
  buildAsciiStlText,
  buildBinaryStlBuffer,
  computeAutoLodPlan,
  computeMeshBounds,
  createSampleAsciiStlWithDefects,
  createSampleBinaryStlBytes,
  createUpperBodyLattice,
  createUpperBodySleeveMesh,
  createWatertightBoxMesh,
  deformMeshByLattice,
  evaluate3dGroupAndCastShadows,
  lightDirectionFromAngles,
  parseStlMesh,
  smoothVertexWeights,
  type Scene3dFolderGroup,
} from "./mesh-customizer-stl-lod";

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("hand-rig-3d: 15관절 FK · 8종 웹툰 포즈 · 좌우 미러링 · 원근/NPR/3점 광원", () => {
  it("정확히 15개 관절(엄지 CMC/MCP/IP + 4손가락 MCP/PIP/DIP)과 5개 손끝, 깊이 정렬 캡슐을 생성한다", () => {
    const solved = solveHandSkeleton3d(getHandPosePreset("open-relaxed").pose, "right");

    expect(solved.summary.jointCount).toBe(15);
    expect(solved.joints).toHaveLength(15);
    expect(solved.fingertips).toHaveLength(5);
    expect(solved.joints.map((j) => j.id)).toEqual([
      "thumb-cmc", "thumb-mcp", "thumb-ip",
      "index-mcp", "index-pip", "index-dip",
      "middle-mcp", "middle-pip", "middle-dip",
      "ring-mcp", "ring-pip", "ring-dip",
      "pinky-mcp", "pinky-pip", "pinky-dip",
    ]);

    // Painter's order: 캡슐은 카메라 공간 depth 내림차순으로 정렬되어야 한다
    expect(solved.capsules).toHaveLength(20); // 손바닥 5 + 마디 15
    for (let i = 1; i < solved.capsules.length; i += 1) {
      expect(solved.capsules[i - 1].depth).toBeGreaterThanOrEqual(solved.capsules[i].depth);
    }

    // NPR 외곽선 굵기 & 3점 광원 음영 계수 범위 검증
    for (const seg of solved.capsules) {
      expect(seg.nprOutlineWidthPx).toBeGreaterThanOrEqual(1.25);
      expect(seg.nprOutlineWidthPx).toBeLessThanOrEqual(3.8);
      expect(seg.lighting.shadeIntensity).toBeGreaterThanOrEqual(0);
      expect(seg.lighting.shadeIntensity).toBeLessThanOrEqual(1);
    }
  });

  it("8종 웹툰 실전 손 포즈 프리셋이 서로 유의미한 3D 좌표 변별성과 해부학적 특징을 가진다", () => {
    const expectedIds: readonly HandPosePresetId[] = [
      "open-relaxed",
      "fist",
      "point-index",
      "hold-pen",
      "grip-sword",
      "wave-hello",
      "finger-heart",
      "pray-clasped",
    ];
    expect(HAND_POSE_PRESETS.map((p) => p.id)).toEqual(expectedIds);

    const solvedById = new Map(
      HAND_POSE_PRESETS.map((preset) => [preset.id, solveHandSkeleton3d(preset.pose, "right")]),
    );

    // 모든 쌍(28쌍)의 15관절+5손끝 3D 평균 변위가 충분히 구별되어야 한다
    for (let i = 0; i < expectedIds.length; i += 1) {
      for (let j = i + 1; j < expectedIds.length; j += 1) {
        const a = solvedById.get(expectedIds[i]);
        const b = solvedById.get(expectedIds[j]);
        expect(a && b).toBeTruthy();
        if (!a || !b) continue;
        const tipShift = a.fingertips.reduce(
          (sum, tip, idx) => sum + dist3(tip.world, b.fingertips[idx].world),
          0,
        );
        expect(tipShift).toBeGreaterThan(0.03);
      }
    }

    // 해부학적 특징 검증: point-index는 검지 끝이 중지 끝보다 손목에서 확실히 더 멀다
    const point = solvedById.get("point-index");
    const fist = solvedById.get("fist");
    const wave = solvedById.get("wave-hello");
    const heart = solvedById.get("finger-heart");
    expect(point && fist && wave && heart).toBeTruthy();
    if (!point || !fist || !wave || !heart) return;

    const pointIndexDist = dist3(point.wrist.world, point.fingertips[1].world);
    const pointMiddleDist = dist3(point.wrist.world, point.fingertips[2].world);
    expect(pointIndexDist).toBeGreaterThan(pointMiddleDist + 0.04);

    // wave-hello는 fist보다 검지~소지 폭이 훨씬 넓다
    const waveSpan = dist3(wave.fingertips[1].world, wave.fingertips[4].world);
    const fistSpan = dist3(fist.fingertips[1].world, fist.fingertips[4].world);
    expect(waveSpan).toBeGreaterThan(fistSpan + 0.04);

    // finger-heart는 wave-hello보다 엄지-검지 끝 거리가 훨씬 가깝다
    const heartPinch = dist3(heart.fingertips[0].world, heart.fingertips[1].world);
    const waveThumbIndex = dist3(wave.fingertips[0].world, wave.fingertips[1].world);
    expect(heartPinch).toBeLessThan(waveThumbIndex * 0.55);
  });

  it("mirrorHandPose + 왼손 전환이 임의 손목 회전에서도 정확한 YZ 평면 거울 대칭과 이중 반전 항등을 만족한다", () => {
    const pose = getHandPosePreset("grip-sword").pose;
    const mirrored = mirrorHandPose(pose);
    const doubleMirrored = mirrorHandPose(mirrored);

    expect(doubleMirrored).toEqual(pose);
    expect(mirrored.wrist.pitch).toBe(pose.wrist.pitch);
    expect(mirrored.wrist.yaw).toBe(-pose.wrist.yaw);
    expect(mirrored.wrist.roll).toBe(-pose.wrist.roll);

    const rightHand = solveHandSkeleton3d(pose, "right", { azimuthDeg: 0, elevationDeg: 0 });
    const leftHand = solveHandSkeleton3d(mirrored, "left", { azimuthDeg: 0, elevationDeg: 0 });

    for (let i = 0; i < 15; i += 1) {
      expect(leftHand.joints[i].world.x).toBeCloseTo(-rightHand.joints[i].world.x, 6);
      expect(leftHand.joints[i].world.y).toBeCloseTo(rightHand.joints[i].world.y, 6);
      expect(leftHand.joints[i].world.z).toBeCloseTo(rightHand.joints[i].world.z, 6);
    }
    for (let i = 0; i < 5; i += 1) {
      expect(leftHand.fingertips[i].world.x).toBeCloseTo(-rightHand.fingertips[i].world.x, 6);
      expect(leftHand.fingertips[i].world.y).toBeCloseTo(rightHand.fingertips[i].world.y, 6);
      expect(leftHand.fingertips[i].world.z).toBeCloseTo(rightHand.fingertips[i].world.z, 6);
    }

    // 개별 손가락 굽힘 업데이트 헬퍼 검증
    const curled = updateFingerCurlRatio(pose, "index", 100);
    expect(curled.presetId).toBe("custom");
    expect(curled.fingers.index.curl1Deg).toBe(92);
  });
});

describe("mesh-customizer-stl-lod: STL 파서 · 위상/Z=0 정규화 · 가중치 · FFD · Auto-LOD · 3D 그룹/그림자", () => {
  it("바이너리 STL('solid' 헤더 포함)과 ASCII STL을 정확히 파싱하고 비매니폴드·퇴화·미터/Z=0 정규화를 수행한다", () => {
    // 1. 바이너리 STL (헤더가 'solid '로 시작해도 바이너리 길이 계약으로 정확히 파싱)
    const binaryBytes = createSampleBinaryStlBytes();
    const parsedBin = parseStlMesh(binaryBytes);
    expect(parsedBin.format).toBe("binary-stl");
    expect(parsedBin.vertices).toHaveLength(8);
    expect(parsedBin.triangles).toHaveLength(12);

    const normBin = auditAndNormalize3dMesh(parsedBin);
    expect(normBin.rawAudit.isManifold).toBe(true);
    expect(normBin.rawAudit.nonManifoldEdgeCount).toBe(0);
    expect(normBin.rawAudit.degenerateTriangleCount).toBe(0);
    expect(normBin.detectedMillimeterInput).toBe(true);
    expect(normBin.appliedScaleFactor).toBeCloseTo(0.001, 6);
    expect(normBin.groundedToZeroZ).toBe(true);
    expect(normBin.normalizedAudit.bounds.min.z).toBe(0);
    expect(normBin.normalizedAudit.extents.z).toBeCloseTo(0.32, 4);

    // 2. ASCII STL (비매니폴드 핀 + 퇴화 삼각형 검출 및 퇴화 면 제거)
    const asciiText = createSampleAsciiStlWithDefects();
    const parsedAscii = parseStlMesh(asciiText);
    expect(parsedAscii.format).toBe("ascii-stl");
    expect(parsedAscii.triangles).toHaveLength(14);

    const normAscii = auditAndNormalize3dMesh(parsedAscii);
    expect(normAscii.rawAudit.isManifold).toBe(false);
    expect(normAscii.rawAudit.overSharedEdgeCount).toBeGreaterThanOrEqual(1);
    expect(normAscii.rawAudit.openBoundaryEdgeCount).toBeGreaterThanOrEqual(2);
    expect(normAscii.rawAudit.degenerateTriangleCount).toBe(1);
    expect(normAscii.removedDegenerateCount).toBe(1);
    expect(normAscii.groundedToZeroZ).toBe(true);
    expect(normAscii.normalizedAudit.bounds.min.z).toBe(0);

    // 라운드트립: ArrayBuffer 입력 및 ASCII→Buffer(Uint8Array) 입력도 정상 파싱
    const box = createWatertightBoxMesh("roundtrip", 1, 1, 1);
    const reparsedBin = parseStlMesh(buildBinaryStlBuffer(box).buffer);
    const reparsedAscii = parseStlMesh(new TextEncoder().encode(buildAsciiStlText(box)));
    expect(reparsedBin.format).toBe("binary-stl");
    expect(reparsedAscii.format).toBe("ascii-stl");
    expect(reparsedBin.vertices).toHaveLength(8);
    expect(reparsedAscii.vertices).toHaveLength(8);
  });

  it("정점 가중치 라플라시안 스무딩은 가중치 합 1.0을 보존하며 반복 횟수 증가에 따라 공간 분산을 단조 감소시킨다", () => {
    const { mesh, pinchedWeights } = createUpperBodySleeveMesh();
    const iter1 = smoothVertexWeights(mesh, pinchedWeights, { iterations: 1, lambda: 0.5 });
    const iter3 = smoothVertexWeights(mesh, pinchedWeights, { iterations: 3, lambda: 0.5 });
    const iter6 = smoothVertexWeights(mesh, pinchedWeights, { iterations: 6, lambda: 0.5 });

    expect(iter1.afterVariance).toBeLessThan(iter1.beforeVariance);
    expect(iter3.afterVariance).toBeLessThan(iter1.afterVariance);
    expect(iter6.afterVariance).toBeLessThan(iter3.afterVariance);
    expect(iter6.varianceReductionRatio).toBeGreaterThan(0.5);
    expect(iter6.maxEdgeJumpAfter).toBeLessThan(iter6.maxEdgeJumpBefore);
    expect(iter6.maxWeightSumError).toBeLessThan(1e-5);
  });

  it("2×2×2 삼선형 FFD 래티스 변형기는 항등 격자에서 변위 0, 어깨 확장 시 상단 폭이 정확히 확대된다", () => {
    const { mesh } = createUpperBodySleeveMesh();
    const bounds = computeMeshBounds(mesh.vertices);

    const identityLattice = createUpperBodyLattice(bounds, {
      shoulderWidthScale: 1,
      waistTaperScale: 1,
      torsoHeightScale: 1,
      chestDepthScale: 1,
    });
    const identityRes = deformMeshByLattice(mesh, identityLattice);
    expect(identityRes.maxDisplacementMeters).toBe(0);

    const heroLattice = createUpperBodyLattice(bounds, {
      shoulderWidthScale: 1.35,
      waistTaperScale: 0.85,
      torsoHeightScale: 1.15,
      chestDepthScale: 1.0,
    });
    const heroRes = deformMeshByLattice(mesh, heroLattice);
    const origWidth = bounds.max.x - bounds.min.x;
    const deformedWidth = heroRes.deformedBounds.max.x - heroRes.deformedBounds.min.x;
    const origHeight = bounds.max.z - bounds.min.z;
    const deformedHeight = heroRes.deformedBounds.max.z - heroRes.deformedBounds.min.z;

    expect(heroRes.maxDisplacementMeters).toBeGreaterThan(0.05);
    expect(deformedWidth).toBeCloseTo(origWidth * 1.35, 3);
    expect(deformedHeight).toBeCloseTo(origHeight * 1.15, 3);
  });

  it("3단계 Auto-LOD는 LOD0(100%) > LOD1(45%) > LOD2(18%) 단조 감소와 GPU Instancing 드로우콜 절감을 보장한다", () => {
    const plan = computeAutoLodPlan(DEFAULT_AUTO_LOD_SCENE_INSTANCES);

    expect(plan.tierSummary.LOD0.instanceCount).toBe(1);
    expect(plan.tierSummary.LOD1.instanceCount).toBe(2);
    expect(plan.tierSummary.LOD2.instanceCount).toBe(5);

    for (const item of plan.instances) {
      expect(item.lod0Triangles).toBeGreaterThan(item.lod1Triangles);
      expect(item.lod1Triangles).toBeGreaterThan(item.lod2Triangles);
      expect(item.lod1Triangles / item.lod0Triangles).toBeCloseTo(0.45, 2);
      expect(item.lod2Triangles / item.lod0Triangles).toBeCloseTo(0.18, 2);
    }

    expect(plan.totalRenderedTriangles).toBeLessThan(plan.totalNaiveTriangles * 0.5);
    expect(plan.instancedDrawCalls).toBeLessThan(plan.naiveDrawCalls);
    expect(plan.drawCallSavingsPercent).toBeGreaterThan(30);
    expect(plan.within60FpsBudget).toBe(true);
    expect(plan.estimatedFps).toBeGreaterThanOrEqual(60);
  });

  it("3D 폴더 그룹 일괄 TRS 변환과 광원 방향에 따른 오브젝트 간 상호 그림자 교차를 정확히 판정한다", () => {
    // +X 방향 하향 광원: 왼쪽의 hero-stand(높이 1.7m)가 오른쪽 cafe-table(높이 0.76m) 위로 그림자를 드리운다
    const rightCastLight = lightDirectionFromAngles(0, 42);
    const evalHit = evaluate3dGroupAndCastShadows(DEFAULT_3D_FOLDER_GROUP, rightCastLight);

    const heroToTable = evalHit.castShadowPairs.find(
      (hit) => hit.casterId === "hero-stand" && hit.receiverId === "cafe-table",
    );
    expect(heroToTable).toBeDefined();
    expect(heroToTable?.overlapAreaM2).toBeGreaterThan(0);
    expect(heroToTable?.coverageRatio).toBeGreaterThan(0);
    expect(heroToTable?.coverageRatio).toBeLessThanOrEqual(1);

    // 광원을 반대 방향(180°, -X 방향)으로 돌리면 hero-stand 그림자가 테이블 반대쪽으로 빠져나가 교차가 사라진다
    const reverseLight = lightDirectionFromAngles(180, 42);
    const evalMiss = evaluate3dGroupAndCastShadows(DEFAULT_3D_FOLDER_GROUP, reverseLight);
    expect(
      evalMiss.castShadowPairs.some(
        (hit) => hit.casterId === "hero-stand" && hit.receiverId === "cafe-table",
      ),
    ).toBe(false);

    // 폴더 그룹 전체 이동(+2.5m X) 및 90° Z회전 시 모든 자식 오브젝트 월드 좌표가 일괄 변환된다
    const movedGroup: Scene3dFolderGroup = {
      ...DEFAULT_3D_FOLDER_GROUP,
      transform: {
        translate: { x: 2.5, y: 1.0, z: 0 },
        rotateDeg: { x: 0, y: 0, z: 90 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };
    const evalMoved = evaluate3dGroupAndCastShadows(movedGroup, rightCastLight);
    const movedHero = evalMoved.objects.find((obj) => obj.id === "hero-stand");
    // local (-0.55, 0) -> rotZ(90°) => (0, -0.55) -> translate(+2.5, +1.0) => (2.5, 0.45)
    expect(movedHero?.worldCenter.x).toBeCloseTo(2.5, 3);
    expect(movedHero?.worldCenter.y).toBeCloseTo(0.45, 3);
  });
});

describe("Model3dHandCustomizerPanel: 3탭 UI 상호작용 · KO/EN · 토큰/크기 위생 게이트", () => {
  it("props 없이 기본 마운트되어 탭 1에서 15관절 SVG 프리뷰·8종 포즈·좌우 미러링·손가락 슬라이더가 동작한다", () => {
    const onPoseChange = vi.fn();
    render(<Model3dHandCustomizerPanel onPoseChange={onPoseChange} />);

    expect(screen.getByTestId("model3d-hand-customizer-panel")).toBeTruthy();
    expect(screen.getByTestId("panel-hand-rig")).toBeTruthy();

    const svg = screen.getByTestId("hand-svg-preview");
    expect(svg.querySelectorAll("circle[data-joint-id]")).toHaveLength(15);
    expect(svg.querySelectorAll("g[data-capsule-id]")).toHaveLength(20);

    // 8종 포즈 중 손가락 하트 선택
    fireEvent.click(screen.getByTestId("preset-finger-heart"));
    expect(screen.getByTestId("preset-finger-heart").getAttribute("aria-pressed")).toBe("true");
    expect(onPoseChange).toHaveBeenCalled();

    // 좌우 대칭 미러링 클릭 → 왼손 전환
    fireEvent.click(screen.getByTestId("hand-mirror-btn"));
    expect(screen.getByTestId("hand-side-left").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("hand-joint-count").textContent).toContain("15관절");

    // 검지 굽힘 슬라이더 조절
    fireEvent.change(screen.getByTestId("slider-finger-index"), { target: { value: "90" } });
    expect(screen.getByTestId("value-finger-index").textContent).toBe("90%");
  });

  it("탭 2(정점 가중치·FFD·Auto-LOD)와 탭 3(STL·3D 그룹·상호 그림자) 전환 및 실시간 계산이 동작한다", () => {
    render(<Model3dHandCustomizerPanel />);

    // 탭 2 전환
    fireEvent.click(screen.getByTestId("tab-weight-ffd-lod"));
    expect(screen.getByTestId("panel-weight-ffd-lod")).toBeTruthy();
    const varBefore = Number(screen.getByTestId("weight-after-variance").textContent);
    fireEvent.change(screen.getByTestId("slider-smooth-iterations"), { target: { value: "9" } });
    const varAfter = Number(screen.getByTestId("weight-after-variance").textContent);
    expect(varAfter).toBeLessThan(varBefore);

    fireEvent.change(screen.getByTestId("slider-ffd-shoulder"), { target: { value: "140" } });
    expect(screen.getByTestId("ffd-span-readout").textContent).toContain("→");

    fireEvent.change(screen.getByTestId("slider-lod-crowd"), { target: { value: "16" } });
    expect(screen.getByTestId("lod-draw-calls").textContent).toContain("→");
    expect(screen.getByTestId("lod-fps-badge").textContent).toContain("fps");

    // 탭 3 전환
    fireEvent.click(screen.getByTestId("tab-stl-group-shadow"));
    expect(screen.getByTestId("panel-stl-group-shadow")).toBeTruthy();
    expect(screen.getByTestId("stl-format-summary").textContent).toContain("binary-stl");
    expect(screen.getByTestId("stl-min-z").textContent).toBe("0.000m");

    // ASCII 결함 STL 전환
    fireEvent.click(screen.getByTestId("stl-sample-ascii"));
    expect(screen.getByTestId("stl-format-summary").textContent).toContain("ascii-stl");
    expect(screen.getByTestId("stl-manifold-badge").textContent).toContain("결함");

    // 광원 방위각 조절 시 상호 그림자 판정이 갱신된다
    expect(screen.getByTestId("shadow-hit-count").textContent).toContain("상호 그림자");
    fireEvent.change(screen.getByTestId("slider-light-azimuth"), { target: { value: "180" } });
    expect(screen.getByTestId("shadow-map-svg")).toBeTruthy();
  });

  it("영어 로케일(en) 전환 시 영문 탭·라벨이 정상 출력된다", () => {
    useI18n.setState({ lang: "en" });
    render(<Model3dHandCustomizerPanel />);

    expect(screen.getByTestId("tab-hand-rig").textContent).toContain("15-Joint 3D Hand");
    expect(screen.getByTestId("tab-weight-ffd-lod").textContent).toContain("Weights");
    expect(screen.getByTestId("tab-stl-group-shadow").textContent).toContain("STL");
    expect(screen.getByTestId("preset-finger-heart").textContent).toContain("Finger Heart");
  });

  it("패널 소스가 500줄 이하·원시 hex/rgb/hsl 0건·transition-all 0건·배럴 index.ts 부재를 만족한다", () => {
    const dir = path.resolve(
      process.cwd(),
      "apps/web/src/domains/creator/model3d-hand-customizer",
    );
    const panelPath = path.join(dir, "Model3dHandCustomizerPanel.tsx");
    const source = readFileSync(panelPath, "utf8");
    const lineCount = source.split(/\r?\n/).length;

    expect(lineCount).toBeLessThanOrEqual(500);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/\bhsla?\s*\(/i);
    expect(source).not.toContain("transition-all");
    expect(source).toContain("[word-break:keep-all]");
    expect(source).toContain("tabular-nums");
    expect(existsSync(path.join(dir, "index.ts"))).toBe(false);
    expect(existsSync(path.join(dir, "index.tsx"))).toBe(false);
  });
});
