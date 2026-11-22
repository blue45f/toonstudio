import { describe, expect, it } from "vitest";
import { link } from "wesl";

import {
  createLookAtViewMatrix,
  createPerspectiveProjectionMatrix,
  extract3dVectorLineArt,
} from "./studio-3d-vector-lineart-extractor";
import {
  STUDIO_PBD_CLOTH_DRAPE_WGSL,
  STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS,
  STUDIO_PBD_CLOTH_WGSL_PARAM_FIELDS,
  STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE,
  StudioPbdClothDrapeSolver,
  colorConstraintBatches,
  computeDihedralAngle,
  createClothGarmentMesh,
  packPbdClothUniforms,
  type ClothBodyCollider,
  type ClothGarmentMeshData,
} from "./studio-pbd-cloth-drape-solver";

describe("studio-pbd-cloth-drape-solver", () => {
  it("WGSL Compute 셰이더가 wesl link 구문 검증을 통과하고 균일 버퍼·독립 배치 레이아웃이 일치한다", async () => {
    const linked = await link({
      weslSrc: { "pbd_cloth.wgsl": STUDIO_PBD_CLOTH_DRAPE_WGSL },
      rootModuleName: "pbd_cloth",
    });
    const wgsl = linked.dest;

    expect(wgsl).toContain(`@workgroup_size(${STUDIO_PBD_CLOTH_WGSL_WORKGROUP_SIZE})`);
    expect(wgsl.match(/@compute/gu)).toHaveLength(4);
    for (const entryPoint of Object.values(STUDIO_PBD_CLOTH_WGSL_ENTRY_POINTS)) {
      expect(wgsl).toContain(`fn ${entryPoint}(`);
    }
    for (let b = 0; b <= 6; b += 1) {
      expect(wgsl).toContain(`@binding(${b})`);
    }
    const structBody = /struct PbdClothSimParams \{([\s\S]*?)\}/u.exec(wgsl)?.[1] ?? "";
    expect(structBody.split(",").filter((line) => line.includes(":")).length).toBe(
      STUDIO_PBD_CLOTH_WGSL_PARAM_FIELDS.length,
    );

    const uniformBuf = packPbdClothUniforms({
      particleCount: 81,
      colliderCount: 2,
      batchOffset: 12,
      batchCount: 24,
      subDt: 1 / 240,
      simTime: 0.5,
      dampingFactor: 0.99,
      maxSpeed: 20,
      gravity: [0, -9.81, 0],
      maxSubstepDisp: 0.2,
      wind: [1.5, 0, -0.5],
      windGustFreq: 1.0,
      windTurbulence: 0.25,
      collisionMargin: 0.006,
      groundY: 0,
    });
    expect(uniformBuf.byteLength).toBe(80);
    const dv = new DataView(uniformBuf);
    expect(dv.getUint32(0, true)).toBe(81);
    expect(dv.getUint32(4, true)).toBe(2);
    expect(dv.getFloat32(36, true)).toBeCloseTo(-9.81, 4);
    expect(dv.getUint32(72, true)).toBe(1);

    // 그래프 컬러링 독립 배치: 동일 배치 내부에 중복 정점이 0개여야 한다(GPU 레이스 프리 보장).
    const mesh = createClothGarmentMesh("cape", { cols: 7, rows: 7 });
    const distColored = colorConstraintBatches(mesh.distanceConstraints, (c) => [c.p1, c.p2]);
    for (const batch of distColored.batches) {
      const seen = new Set<number>();
      for (let i = batch.offset; i < batch.offset + batch.count; i += 1) {
        const c = distColored.ordered[i];
        expect(c).toBeDefined();
        if (!c) continue;
        expect(seen.has(c.p1)).toBe(false);
        expect(seen.has(c.p2)).toBe(false);
        seen.add(c.p1);
        seen.add(c.p2);
      }
    }
    const bendColored = colorConstraintBatches(mesh.bendingConstraints, (c) => [c.p1, c.p2, c.p3, c.p4]);
    for (const batch of bendColored.batches) {
      const seen = new Set<number>();
      for (let i = batch.offset; i < batch.offset + batch.count; i += 1) {
        const b = bendColored.ordered[i];
        expect(b).toBeDefined();
        if (!b) continue;
        for (const v of [b.p1, b.p2, b.p3, b.p4]) {
          expect(seen.has(v)).toBe(false);
          seen.add(v);
        }
      }
    }
  });

  it("중력 하강 시 핀 고정 정점은 정확히 유지되고 자유 정점은 자연스럽게 늘어지며 신장률이 억제된다", () => {
    const mesh = createClothGarmentMesh("grid", {
      cols: 6,
      rows: 6,
      width: 0.8,
      height: 0.8,
      origin: [0, 1.5, 0],
      plane: "xz",
      pinMode: "top-row",
      structuralCompliance: 1e-5,
    });
    const initialPositions = Float32Array.from(mesh.positions);
    const solver = new StudioPbdClothDrapeSolver(mesh, {
      gravity: [0, -9.81, 0],
      wind: [0, 0, 0],
      subSteps: 4,
      solverIterations: 6,
    });

    solver.stepMany(55);
    const pos = solver.getPositions();
    const invMasses = solver.getInvMasses();
    const diag = solver.computeDiagnostics();

    // 핀 고정된 최상단 행(row 0)은 단 1 ULP도 움직이지 않아야 한다.
    for (let i = 0; i < mesh.particleCount; i += 1) {
      if ((invMasses[i] ?? 0) === 0) {
        expect(pos[i * 3]).toBe(initialPositions[i * 3]);
        expect(pos[i * 3 + 1]).toBe(initialPositions[i * 3 + 1]);
        expect(pos[i * 3 + 2]).toBe(initialPositions[i * 3 + 2]);
      }
    }

    // 자유 하단 행(row 5)은 수평(y=1.5)에서 중력으로 충분히 하강한다.
    let avgBottomY = 0;
    for (let c = 0; c < mesh.cols; c += 1) {
      const idx = (mesh.rows - 1) * mesh.cols + c;
      avgBottomY += pos[idx * 3 + 1] ?? 0;
    }
    avgBottomY /= mesh.cols;
    expect(avgBottomY).toBeLessThan(1.0);
    expect(diag.allFinite).toBe(true);
    expect(diag.maxStretchRatio).toBeLessThan(1.12);
    expect(diag.pinnedCount).toBe(mesh.cols);
  });

  it("이면각(dihedral) 굽힘 제약이 접힌 힌지를 정지 각도(평면)로 복원시킨다", () => {
    const theta0 = (70 * Math.PI) / 180;
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, -Math.cos(theta0), Math.sin(theta0),
    ]);
    const hingeMesh: ClothGarmentMeshData = {
      preset: "grid",
      cols: 2,
      rows: 2,
      particleCount: 4,
      positions,
      invMasses: new Float32Array([0, 0, 1, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 3, 1]),
      distanceConstraints: [
        { p1: 0, p2: 1, restLength: 1, compliance: 1e-6, kind: "structural" },
        { p1: 0, p2: 2, restLength: 1, compliance: 1e-6, kind: "structural" },
        { p1: 1, p2: 2, restLength: Math.SQRT2, compliance: 1e-6, kind: "structural" },
        { p1: 0, p2: 3, restLength: 1, compliance: 1e-6, kind: "structural" },
        { p1: 1, p2: 3, restLength: Math.SQRT2, compliance: 1e-6, kind: "structural" },
      ],
      bendingConstraints: [
        { p1: 0, p2: 1, p3: 2, p4: 3, restAngle: 0, compliance: 0.002 },
      ],
    };

    const initialAngle = computeDihedralAngle(positions, 0, 1, 2, 3);
    expect(initialAngle).toBeCloseTo(theta0, 3);

    const solver = new StudioPbdClothDrapeSolver(hingeMesh, {
      gravity: [0, 0, 0],
      wind: [0, 0, 0],
      damping: 0.12,
      subSteps: 4,
      solverIterations: 4,
    });
    solver.stepMany(35);

    const relaxedAngle = computeDihedralAngle(solver.getPositions(), 0, 1, 2, 3);
    expect(relaxedAngle).toBeLessThan(initialAngle * 0.35);
    expect(solver.computeDiagnostics().allFinite).toBe(true);
  });

  it("캐릭터 구·캡슐 콜라이더 위로 천·셔츠·망토·치마가 비관통 상태로 자연스럽게 주름지며 드레이프된다", () => {
    // 1) 수평 천이 구체 위로 떨어지며 비관통 드레이프
    const sheet = createClothGarmentMesh("grid", {
      cols: 9,
      rows: 9,
      width: 0.9,
      height: 0.9,
      origin: [0, 1.35, -0.45],
      plane: "xz",
      pinMode: "none",
    });
    const sphereCol: ClothBodyCollider = {
      id: "shoulder-sphere",
      kind: "sphere",
      center: [0, 0.95, 0],
      radius: 0.28,
      friction: 0.45,
    };
    const sheetSolver = new StudioPbdClothDrapeSolver(
      sheet,
      { gravity: [0, -9.81, 0], collisionMargin: 0.008, subSteps: 4, solverIterations: 5 },
      [sphereCol],
    );
    sheetSolver.stepMany(70);
    const sheetDiag = sheetSolver.computeDiagnostics();
    expect(sheetDiag.allFinite).toBe(true);
    expect(sheetDiag.maxColliderPenetration).toBeLessThanOrEqual(1e-4);
    expect(sheetDiag.averageDihedralBendRad).toBeGreaterThan(0.03);

    // 2) 캐릭터 몸통+허벅지 캡슐 콜라이더 위에 셔츠·망토·치마 3종 시뮬레이션
    const bodyRig: readonly ClothBodyCollider[] = [
      { id: "torso", kind: "capsule", start: [0, 0.92, 0], end: [0, 1.42, 0], radius: 0.16, friction: 0.4 },
      { id: "left-thigh", kind: "capsule", start: [-0.09, 0.42, 0], end: [-0.09, 0.9, 0], radius: 0.085, friction: 0.35 },
      { id: "right-thigh", kind: "capsule", start: [0.09, 0.42, 0], end: [0.09, 0.9, 0], radius: 0.085, friction: 0.35 },
    ];

    for (const preset of ["cape", "shirt", "skirt"] as const) {
      const garment = createClothGarmentMesh(preset, { cols: preset === "cape" ? 7 : 12, rows: 7 });
      const solver = new StudioPbdClothDrapeSolver(
        garment,
        {
          gravity: [0, -9.81, 0],
          wind: [2.4, 0.1, 1.1],
          windTurbulence: 0.4,
          collisionMargin: 0.006,
          groundY: 0,
        },
        bodyRig,
      );
      solver.stepMany(40);
      const diag = solver.computeDiagnostics();
      const gpuBuffers = solver.buildWebGpuBuffers();
      const normals = solver.computeVertexNormals();

      expect(diag.allFinite).toBe(true);
      expect(diag.maxColliderPenetration).toBeLessThanOrEqual(1e-4);
      expect(diag.averageDihedralBendRad).toBeGreaterThan(0.002);
      expect(gpuBuffers.substepPlan.length).toBeGreaterThan(4);
      expect(normals.length).toBe(garment.particleCount * 3);
      for (let i = 0; i < garment.particleCount; i += 1) {
        const nLen = Math.hypot(normals[i * 3] ?? 0, normals[i * 3 + 1] ?? 0, normals[i * 3 + 2] ?? 0);
        expect(nLen).toBeCloseTo(1, 3);
      }
    }
  });

  it("NaN/Infinity 주입 및 극단 외력에서도 폭발 방지 감쇠 가드가 안전하게 복구한다", () => {
    const cape = createClothGarmentMesh("cape", { cols: 6, rows: 6 });
    const solver = new StudioPbdClothDrapeSolver(cape, {
      gravity: [0, -9999, 0],
      wind: [9999, 5000, -9999],
      maxSpeed: 15,
      maxSubstepDisplacement: 0.15,
      damping: 0.08,
    });

    // 강제 NaN / Infinity 주입
    const pos = solver.getPositions();
    const vel = solver.getVelocities();
    pos[12] = Number.NaN;
    pos[13] = Number.POSITIVE_INFINITY;
    vel[15] = Number.NEGATIVE_INFINITY;
    vel[16] = Number.NaN;

    solver.stepMany(30);
    const diag = solver.computeDiagnostics();

    expect(diag.nanGuardsTriggered).toBeGreaterThan(0);
    expect(diag.allFinite).toBe(true);
    expect(diag.maxParticleSpeed).toBeLessThanOrEqual(15 + 1e-4);
    for (let i = 0; i < pos.length; i += 1) {
      expect(Number.isFinite(pos[i])).toBe(true);
      expect(Number.isFinite(vel[i])).toBe(true);
    }
  });

  it("PBD 드레이프 망토 메쉬를 3D 벡터 강약선 추출기에 바로 연결해 주름 SVG 선화를 추출한다", () => {
    const cape = createClothGarmentMesh("cape", { cols: 7, rows: 7 });
    const solver = new StudioPbdClothDrapeSolver(
      cape,
      { wind: [3.2, 0.2, -1.6], windTurbulence: 0.5 },
      [{ id: "torso", kind: "capsule", start: [0, 0.85, 0], end: [0, 1.4, 0], radius: 0.16 }],
    );
    solver.stepMany(35);

    const drapedMesh = solver.toIndexedTriangleMesh();
    const lineArt = extract3dVectorLineArt(
      drapedMesh,
      {
        viewMatrix: createLookAtViewMatrix([0.8, 1.15, -2.4], [0, 1.0, -0.2]),
        projectionMatrix: createPerspectiveProjectionMatrix(42, 4 / 3, 0.1, 50),
        viewportWidth: 800,
        viewportHeight: 600,
      },
      { creaseAngleThresholdDeg: 10, hiddenLineRemoval: true },
    );

    expect(lineArt.stats.inputTriangleCount).toBe(cape.indices.length / 3);
    expect(lineArt.stats.boundaryEdgeCount).toBeGreaterThan(0);
    expect(lineArt.polylines.length).toBeGreaterThan(0);
    expect(lineArt.svg).toContain("<svg");
    expect(lineArt.svg).not.toContain("NaN");
  });
});
