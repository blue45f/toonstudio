import { describe, expect, it } from "vitest";
import { link } from "wesl";

import { runRebelleShallowWaterFluidPreview } from "../brush/wet-paper/studio-rebelle-heightmap-metallic";

import {
  DEFAULT_FLUID_WATERCOLOR_PARAMS,
  STUDIO_FLUID_WATERCOLOR_WGSL,
  STUDIO_FLUID_WATERCOLOR_WGSL_PARAM_FIELDS,
  STUDIO_FLUID_WATERCOLOR_WGSL_TRANSPORT_ENTRY,
  STUDIO_FLUID_WATERCOLOR_WGSL_VELOCITY_ENTRY,
  STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_X,
  STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_Y,
  computeFluidWatercolorDispatchSize,
  createFluidWatercolorGrid,
  depositFluidWatercolorDab,
  measureFluidWatercolorDiagnostics,
  normalizeFluidWatercolorParams,
  packFluidWatercolorUniforms,
  renderFluidWatercolorRgba,
  stepFluidWatercolorCpu,
  type FluidWatercolorSimParams,
} from "./studio-fluid-watercolor-sim";

/**
 * WGSL `fluid_watercolor_velocity_step` + `fluid_watercolor_transport_step`의
 * 독립 1:1 수식 미러(셰이더 수식 변경 시 CPU 엔진과의 수치 일치를 직접 검증한다).
 */
function mirrorWgslSingleStep(
  width: number,
  height: number,
  cellIn: Float32Array,
  paperIn: Float32Array,
  params: FluidWatercolorSimParams,
): { readonly cellOut: Float32Array; readonly paperOut: Float32Array } {
  const n = width * height;
  const velMid = new Float32Array(n * 2);
  const cellOut = new Float32Array(n * 4);
  const paperOut = new Float32Array(n * 4);
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  const surfEta = (idx: number) => Math.fround(cellIn[idx * 4]! + params.paperSlopeCoupling * paperIn[idx * 4]!);

  // Pass 1: fluid_watercolor_velocity_step
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const water = cellIn[idx * 4]!;
      if (water <= params.wetEps) {
        velMid[idx * 2] = 0;
        velMid[idx * 2 + 1] = 0;
        continue;
      }
      const xL = x > 0 ? x - 1 : 0;
      const xR = x + 1 < width ? x + 1 : width - 1;
      const yU = y > 0 ? y - 1 : 0;
      const yD = y + 1 < height ? y + 1 : height - 1;
      const dEtaDx = Math.fround(0.5 * (surfEta(y * width + xR) - surfEta(y * width + xL)));
      const dEtaDy = Math.fround(0.5 * (surfEta(yD * width + x) - surfEta(yU * width + x)));
      const ax = Math.fround(params.gravityX - params.pressureStrength * dEtaDx);
      const ay = Math.fround(params.gravityY - params.pressureStrength * dEtaDy);
      const valley = Math.fround(1 - paperIn[idx * 4]!);
      const damp = Math.fround(1 / (1 + params.dt * (params.viscosity + params.fiberDrag * valley)));
      velMid[idx * 2] = Math.fround(clamp((cellIn[idx * 4 + 1]! + params.dt * ax) * damp, -params.maxSpeed, params.maxSpeed));
      velMid[idx * 2 + 1] = Math.fround(clamp((cellIn[idx * 4 + 2]! + params.dt * ay) * damp, -params.maxSpeed, params.maxSpeed));
    }
  }

  const faceFlux = (idxA: number, idxB: number, dx: number, dy: number): [number, number] => {
    const wa = cellIn[idxA * 4]!;
    const wb = cellIn[idxB * 4]!;
    const piga = cellIn[idxA * 4 + 3]!;
    const pigb = cellIn[idxB * 4 + 3]!;
    const vFace = Math.fround(
      0.5 * ((velMid[idxA * 2]! + velMid[idxB * 2]!) * dx + (velMid[idxA * 2 + 1]! + velMid[idxB * 2 + 1]!) * dy),
    );
    const fAdv = Math.fround(vFace >= 0 ? vFace * wa : vFace * wb);
    const pore = Math.fround(0.5 + 0.5 * (2 - paperIn[idxA * 4]! - paperIn[idxB * 4]!));
    const fCap = Math.fround(params.capillaryRate * (wa - wb) * pore);
    const fWaterRaw = Math.fround(params.dt * (fAdv + fCap));
    const fWater = Math.fround(fWaterRaw > 0 ? Math.min(fWaterRaw, 0.24 * wa) : Math.max(fWaterRaw, -0.24 * wb));
    const concA = wa > params.wetEps ? Math.fround(piga / wa) : 0;
    const concB = wb > params.wetEps ? Math.fround(pigb / wb) : 0;
    const fPigAdv = Math.fround(fWater >= 0 ? fWater * concA : fWater * concB);
    const wetBoth = Math.fround(clamp((wa - params.wetEps) / 0.04, 0, 1) * clamp((wb - params.wetEps) / 0.04, 0, 1));
    const pigSrc = wa >= wb ? piga : pigb;
    const fBackrun = Math.fround(params.dt * params.backrunStrength * wetBoth * (wa - wb) * pigSrc);
    const fPigRaw = Math.fround(fPigAdv + fBackrun);
    const fPig = Math.fround(fPigRaw > 0 ? Math.min(fPigRaw, 0.24 * piga) : Math.max(fPigRaw, -0.24 * pigb));
    return [fWater, fPig];
  };

  // Pass 2: fluid_watercolor_transport_step
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      let netW = 0;
      let netP = 0;
      if (x + 1 < width) {
        const [fw, fp] = faceFlux(idx, idx + 1, 1, 0);
        netW = Math.fround(netW - fw);
        netP = Math.fround(netP - fp);
      }
      if (x > 0) {
        const [fw, fp] = faceFlux(idx, idx - 1, -1, 0);
        netW = Math.fround(netW - fw);
        netP = Math.fround(netP - fp);
      }
      if (y + 1 < height) {
        const [fw, fp] = faceFlux(idx, idx + width, 0, 1);
        netW = Math.fround(netW - fw);
        netP = Math.fround(netP - fp);
      }
      if (y > 0) {
        const [fw, fp] = faceFlux(idx, idx - width, 0, -1);
        netW = Math.fround(netW - fw);
        netP = Math.fround(netP - fp);
      }
      const wAfter = Math.fround(Math.max(0, cellIn[idx * 4]! + netW));
      const pAfter = Math.fround(Math.max(0, cellIn[idx * 4 + 3]! + netP));
      const evap = Math.fround(Math.min(wAfter, params.dt * params.evaporationRate));
      const wPostEvap = Math.fround(wAfter - evap);
      const h = paperIn[idx * 4]!;
      const depPrev = paperIn[idx * 4 + 1]!;
      const absPrev = paperIn[idx * 4 + 2]!;
      const poreCap = paperIn[idx * 4 + 3]!;
      const absDelta = Math.fround(Math.min(wPostEvap, params.dt * params.absorptionRate * Math.max(0, poreCap - absPrev)));
      const wFinal = Math.fround(wPostEvap - absDelta);
      const absFinal = Math.fround(Math.max(0, absPrev + absDelta - params.dt * params.evaporationRate * 0.35));
      const valley = Math.fround(1 - h);
      const settleFrac = Math.fround(
        clamp(params.dt * params.granulationRate * (0.05 + 1.95 * valley * valley) * (1 + 0.5 * (1 - clamp(wAfter, 0, 1))), 0, 0.95),
      );
      const evapRatio = wAfter > params.wetEps ? Math.fround(evap / wAfter) : 0;
      const depDelta = Math.fround(pAfter * clamp(settleFrac + evapRatio * 0.65, 0, 1));

      cellOut[idx * 4] = wFinal;
      cellOut[idx * 4 + 1] = wFinal > params.wetEps ? velMid[idx * 2]! : 0;
      cellOut[idx * 4 + 2] = wFinal > params.wetEps ? velMid[idx * 2 + 1]! : 0;
      cellOut[idx * 4 + 3] = Math.fround(pAfter - depDelta);
      paperOut[idx * 4] = h;
      paperOut[idx * 4 + 1] = Math.fround(depPrev + depDelta);
      paperOut[idx * 4 + 2] = absFinal;
      paperOut[idx * 4 + 3] = poreCap;
    }
  }
  return { cellOut, paperOut };
}

describe("studio-fluid-watercolor-sim (Rebelle 식 2D 유체 수채화 WGSL + CPU)", () => {
  it("WGSL 컴퓨트 셰이더가 wesl link() 구문 검증을 통과하고 2개 엔트리포인트·64B 균일 버퍼 레이아웃을 지킨다", async () => {
    const linked = await link({
      weslSrc: { main: STUDIO_FLUID_WATERCOLOR_WGSL },
      rootModuleName: "main",
    });
    const wgsl = linked.dest;
    expect(wgsl).toContain(
      `@compute @workgroup_size(${STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_X}, ${STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_Y}, 1)`,
    );
    expect(wgsl).toContain(`fn ${STUDIO_FLUID_WATERCOLOR_WGSL_VELOCITY_ENTRY}(`);
    expect(wgsl).toContain(`fn ${STUDIO_FLUID_WATERCOLOR_WGSL_TRANSPORT_ENTRY}(`);
    expect(wgsl.match(/@compute/gu)).toHaveLength(2);
    for (let binding = 0; binding <= 5; binding += 1) {
      expect(wgsl, `binding ${binding}`).toContain(`@binding(${binding})`);
    }
    const structBody = /struct FluidWatercolorParams \{([\s\S]*?)\}/u.exec(wgsl)?.[1] ?? "";
    expect(structBody.split(",").filter((line) => line.includes(":")).length).toBe(
      STUDIO_FLUID_WATERCOLOR_WGSL_PARAM_FIELDS.length,
    );

    const uniformBuf = packFluidWatercolorUniforms(64, 48, { gravityY: 1.5, backrunStrength: 0.75 });
    expect(uniformBuf.byteLength).toBe(64);
    const u32 = new Uint32Array(uniformBuf);
    const f32 = new Float32Array(uniformBuf);
    expect(u32[0]).toBe(64);
    expect(u32[1]).toBe(48);
    expect(f32[4]).toBeCloseTo(1.5, 5);
    expect(f32[11]).toBeCloseTo(0.75, 5);
    expect(computeFluidWatercolorDispatchSize(65, 33)).toEqual({ workgroupsX: 9, workgroupsY: 5, workgroupsZ: 1 });
  });

  it("증발 0 조건에서 유체·안료 총질량을 정확히 보존하며 음수·NaN을 만들지 않는다", () => {
    const grid = createFluidWatercolorGrid(32, 32, { paperPreset: "cold-press", seed: 101 });
    depositFluidWatercolorDab(grid, {
      centerX: 16,
      centerY: 12,
      radius: 7,
      waterAmount: 0.9,
      pigmentAmount: 0.75,
    });
    const before = measureFluidWatercolorDiagnostics(grid);
    expect(before.totalSurfaceWater).toBeGreaterThan(20);
    expect(before.totalPigment).toBeGreaterThan(20);

    stepFluidWatercolorCpu(
      grid,
      {
        gravityX: 0.8,
        gravityY: 1.4,
        evaporationRate: 0,
        absorptionRate: 0,
        capillaryRate: 0.35,
        granulationRate: 0.4,
        backrunStrength: 0.65,
      },
      24,
    );

    const after = measureFluidWatercolorDiagnostics(grid);
    expect(Math.abs(after.totalSurfaceWater - before.totalSurfaceWater) / before.totalSurfaceWater).toBeLessThan(1e-4);
    expect(Math.abs(after.totalPigment - before.totalPigment) / before.totalPigment).toBeLessThan(1e-4);
    expect(after.totalDepositedPigment).toBeGreaterThan(0);

    for (let i = 0; i < grid.cellCount; i += 1) {
      const off = i * 4;
      expect(Number.isFinite(grid.cells[off])).toBe(true);
      expect(grid.cells[off]!).toBeGreaterThanOrEqual(0);
      expect(grid.cells[off + 3]!).toBeGreaterThanOrEqual(0);
      expect(grid.paper[off + 1]!).toBeGreaterThanOrEqual(0);
      expect(grid.paper[off + 2]!).toBeGreaterThanOrEqual(0);
    }

    // 기공 모세관 흡수를 켜고 증발을 끄면 (표면수 + 기공흡수수) 총수분이 보존된다.
    const gridAbsorb = createFluidWatercolorGrid(24, 24, { paperPreset: "cold-press", seed: 7 });
    depositFluidWatercolorDab(gridAbsorb, { centerX: 12, centerY: 12, radius: 6, waterAmount: 0.85, pigmentAmount: 0.6 });
    const beforeAbs = measureFluidWatercolorDiagnostics(gridAbsorb);
    stepFluidWatercolorCpu(gridAbsorb, { evaporationRate: 0, absorptionRate: 0.15 }, 16);
    const afterAbs = measureFluidWatercolorDiagnostics(gridAbsorb);
    expect(afterAbs.totalAbsorbedWater).toBeGreaterThan(0.1);
    expect(Math.abs(afterAbs.totalWater - beforeAbs.totalWater) / beforeAbs.totalWater).toBeLessThan(1e-4);
  });

  it("중력 기울기 벡터 방향으로 수분·안료 질량중심이 뚜렷하게 이동한다", () => {
    const gridDown = createFluidWatercolorGrid(36, 36, { paperPreset: "hot-press", seed: 22 });
    depositFluidWatercolorDab(gridDown, { centerX: 18, centerY: 12, radius: 6, waterAmount: 0.95, pigmentAmount: 0.85 });
    const initCom = measureFluidWatercolorDiagnostics(gridDown).pigmentCenterOfMass;

    stepFluidWatercolorCpu(
      gridDown,
      { gravityX: 0, gravityY: 2.2, granulationRate: 0.08, evaporationRate: 0, absorptionRate: 0 },
      28,
    );
    const downCom = measureFluidWatercolorDiagnostics(gridDown).pigmentCenterOfMass;
    expect(downCom.y).toBeGreaterThan(initCom.y + 2.5);
    expect(Math.abs(downCom.x - initCom.x)).toBeLessThan(1.0);

    const gridRight = createFluidWatercolorGrid(36, 36, { paperPreset: "hot-press", seed: 22 });
    depositFluidWatercolorDab(gridRight, { centerX: 12, centerY: 18, radius: 6, waterAmount: 0.95, pigmentAmount: 0.85 });
    const initRight = measureFluidWatercolorDiagnostics(gridRight).pigmentCenterOfMass;
    stepFluidWatercolorCpu(
      gridRight,
      { gravityX: 2.2, gravityY: 0, granulationRate: 0.08, evaporationRate: 0, absorptionRate: 0 },
      28,
    );
    const rightCom = measureFluidWatercolorDiagnostics(gridRight).pigmentCenterOfMass;
    expect(rightCom.x).toBeGreaterThan(initRight.x + 2.5);
  });

  it("종이 골짜기 과립화(granulation)와 젖음 가장자리 백런(backrun)이 정량적으로 형성된다", () => {
    const roughGrid = createFluidWatercolorGrid(40, 40, { paperPreset: "rough", seed: 303 });
    depositFluidWatercolorDab(roughGrid, { centerX: 20, centerY: 20, radius: 13, waterAmount: 0.92, pigmentAmount: 0.8 });
    stepFluidWatercolorCpu(roughGrid, { granulationRate: 0.85, backrunStrength: 0.25, capillaryRate: 0.2 }, 18);
    const roughDiag = measureFluidWatercolorDiagnostics(roughGrid);
    expect(roughDiag.valleyToPeakGranulationRatio).toBeGreaterThan(1.5);

    // 백런 비교: backrunStrength 0 vs 1.4
    const noBackrun = createFluidWatercolorGrid(40, 40, { paperPreset: "hot-press", seed: 44 });
    const withBackrun = createFluidWatercolorGrid(40, 40, { paperPreset: "hot-press", seed: 44 });
    const dab = { centerX: 20, centerY: 20, radius: 11, waterAmount: 0.95, pigmentAmount: 0.7, edgeHardness: 0.72 };
    depositFluidWatercolorDab(noBackrun, dab);
    depositFluidWatercolorDab(withBackrun, dab);

    stepFluidWatercolorCpu(noBackrun, { backrunStrength: 0, granulationRate: 0.05, capillaryRate: 0.12, evaporationRate: 0 }, 16);
    stepFluidWatercolorCpu(withBackrun, { backrunStrength: 1.4, granulationRate: 0.05, capillaryRate: 0.12, evaporationRate: 0 }, 16);

    const dNo = measureFluidWatercolorDiagnostics(noBackrun);
    const dYes = measureFluidWatercolorDiagnostics(withBackrun);
    expect(dYes.edgeBackrunRatio).toBeGreaterThan(dNo.edgeBackrunRatio * 1.15);
  });

  it("CPU 스텝 엔진이 WGSL 2패스 수식 미러와 1e-5 이내로 일치하며 RGBA 렌더·Rebelle 진입점과 정상 연동된다", () => {
    const params = normalizeFluidWatercolorParams({
      ...DEFAULT_FLUID_WATERCOLOR_PARAMS,
      gravityX: 0.35,
      gravityY: 0.65,
      backrunStrength: 0.7,
      granulationRate: 0.45,
    });
    const grid = createFluidWatercolorGrid(24, 20, { paperPreset: "cold-press", seed: 91 });
    depositFluidWatercolorDab(grid, { centerX: 11, centerY: 9, radius: 6, waterAmount: 0.88, pigmentAmount: 0.72 });

    let mirrorCells: Float32Array<ArrayBufferLike> = Float32Array.from(grid.cells);
    let mirrorPaper: Float32Array<ArrayBufferLike> = Float32Array.from(grid.paper);
    for (let s = 0; s < 6; s += 1) {
      const next = mirrorWgslSingleStep(grid.width, grid.height, mirrorCells, mirrorPaper, params);
      stepFluidWatercolorCpu(grid, params, 1);
      mirrorCells = next.cellOut;
      mirrorPaper = next.paperOut;
      for (let i = 0; i < mirrorCells.length; i += 1) {
        expect(Math.abs(mirrorCells[i]! - grid.cells[i]!)).toBeLessThan(1e-5);
        expect(Math.abs(mirrorPaper[i]! - grid.paper[i]!)).toBeLessThan(1e-5);
      }
    }

    const frame = renderFluidWatercolorRgba(grid);
    expect(frame.width).toBe(24);
    expect(frame.height).toBe(20);
    // 파란 안료가 칠해진 중앙 픽셀이 마른 외곽 종이보다 R 채널이 뚜렷하게 어둡다.
    const centerR = frame.data[(9 * 24 + 11) * 4]!;
    const cornerR = frame.data[0]!;
    expect(centerR).toBeLessThan(cornerR - 25);

    // 기존 Rebelle 진입점 연동 확인
    const preview = runRebelleShallowWaterFluidPreview({
      presetId: "cold-press",
      width: 32,
      height: 32,
      steps: 8,
      tiltY: 0.4,
    });
    expect(preview.rgba.length).toBe(32 * 32 * 4);
    expect(preview.diagnostics.stepCount).toBe(8);
    expect(preview.wgslShader).toBe(STUDIO_FLUID_WATERCOLOR_WGSL);
  });
});
