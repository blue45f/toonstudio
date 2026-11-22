import { describe, expect, it } from "vitest";
import { link } from "wesl";

import {
  STUDIO_IMPASTO_RAKING_LIGHT_WGSL as REBELLE_LINKED_IMPASTO_WGSL,
  evaluateBrushTextureMaxStep as rebelleLinkedTextureMaxStep,
} from "../../brush/wet-paper/studio-rebelle-heightmap-metallic";

import {
  DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS,
  DUAL_GRANULATION_PIGMENT_PRESETS,
  MAX_BRISTLE_STRAND_COUNT,
  MAX_SAFE_FRICTION_GAIN,
  MIN_BRISTLE_STRAND_COUNT,
  PAPER_TOOTH_PRESETS,
  STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD,
  STUDIO_IMPASTO_RAKING_LIGHT_ENTRY,
  STUDIO_IMPASTO_RAKING_LIGHT_PARAM_FIELDS,
  STUDIO_IMPASTO_RAKING_LIGHT_WGSL,
  STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_X,
  STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_Y,
  applySgraffitoHeightCarving,
  computeBrushFrictionSynthParams,
  computeImpastoDispatchSize,
  computeOverpaintReliefInheritance,
  createBrushFrictionAudioController,
  createMultiChannelBristleBank,
  evaluateAnisotropicDryBrushStamp,
  evaluateBrushTextureMaxStep,
  evaluateDualPigmentGranulationKm7,
  evaluatePaperContactTransfer,
  generateMultiscalePaperTile,
  measureDryBrushSplitGapFraction,
  normalizeImpastoRakingLightParams,
  packImpastoRakingLightUniforms,
  reloadBristleBank,
  sampleMultiscalePaperMip,
  shadeImpastoRakingLightCpu,
  stepBristleBankCrossStroke,
  type BrushFrictionMediumId,
  type FrictionAudioContextLike,
  type FrictionAudioParamLike,
  type ImpastoRakingLightParams,
  type PaperToothPresetId,
} from "./index";

/** `STUDIO_IMPASTO_RAKING_LIGHT_WGSL`의 독립 1:1 f32 수식 미러 (CPU↔WGSL 동등성 검증용). */
function mirrorImpastoWgslShade(
  width: number,
  height: number,
  baseColorIn: Float32Array,
  heightPropsIn: Float32Array,
  paperHeightIn: Float32Array,
  params: ImpastoRakingLightParams,
): { readonly litRgbaOut: Float32Array; readonly normalAoOut: Float32Array } {
  const f32 = Math.fround;
  const clampF = (v: number, lo: number, hi: number): number => {
    const x = f32(v);
    return x < f32(lo) ? f32(lo) : x > f32(hi) ? f32(hi) : x;
  };
  const n = width * height;
  const litRgbaOut = new Float32Array(n * 4);
  const normalAoOut = new Float32Array(n * 4);

  const effH = (ix: number, iy: number): number => {
    const x = ix < 0 ? 0 : ix >= width ? width - 1 : ix;
    const y = iy < 0 ? 0 : iy >= height ? height - 1 : iy;
    const idx = y * width + x;
    const pH = f32(heightPropsIn[idx * 4] ?? 0);
    const dH = f32(heightPropsIn[idx * 4 + 1] ?? 0);
    const ppH = f32(paperHeightIn[idx] ?? 0);
    const inh = f32(f32(dH * f32(params.dryReliefInheritance)) * f32(1 - f32(0.35 * clampF(pH, 0, 1))));
    return f32(f32(pH + inh) + f32(ppH * f32(params.paperToothCoupling)));
  };

  const cosEl = f32(Math.cos(f32(params.lightElevationRad)));
  const sinEl = f32(Math.sin(f32(params.lightElevationRad)));
  const lxRaw = f32(f32(Math.cos(f32(params.lightAzimuthRad))) * cosEl);
  const lyRaw = f32(f32(Math.sin(f32(params.lightAzimuthRad))) * cosEl);
  const lzRaw = sinEl;
  const lLen = Math.max(f32(1e-6), f32(Math.sqrt(f32(lxRaw * lxRaw + lyRaw * lyRaw + lzRaw * lzRaw))));
  const lx = f32(lxRaw / lLen);
  const ly = f32(lyRaw / lLen);
  const lz = f32(lzRaw / lLen);

  const hLen = Math.max(f32(1e-6), f32(Math.sqrt(f32(lx * lx + ly * ly + f32(lz + 1) * f32(lz + 1)))));
  const hx = f32(lx / hLen);
  const hy = f32(ly / hLen);
  const hz = f32(f32(lz + 1) / hLen);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const tl = effH(x - 1, y - 1);
      const t = effH(x, y - 1);
      const tr = effH(x + 1, y - 1);
      const l = effH(x - 1, y);
      const c = effH(x, y);
      const r = effH(x + 1, y);
      const bl = effH(x - 1, y + 1);
      const b = effH(x, y + 1);
      const br = effH(x + 1, y + 1);

      const gx = f32((-tl - 2 * l - bl) + (tr + 2 * r + br));
      const gy = f32((-tl - 2 * t - tr) + (bl + 2 * b + br));
      const rnx = f32(-gx * f32(params.heightScale) * 0.25);
      const rny = f32(-gy * f32(params.heightScale) * 0.25);
      const nLen = f32(Math.sqrt(f32(rnx * rnx + rny * rny + 1)));
      const nx = f32(rnx / nLen);
      const ny = f32(rny / nLen);
      const nz = f32(1 / nLen);

      const avg = f32((tl + t + tr + l + r + bl + b + br) * 0.125);
      const conc = Math.max(0, f32(avg - c));
      const ao = clampF(f32(1 - conc * f32(params.creviceAoStrength) * f32(params.heightScale) * 1.4), 0.28, 1);

      const rough = clampF(heightPropsIn[off + 2] ?? 0.5, 0.08, 0.98);
      const wet = clampF(heightPropsIn[off + 3] ?? 0, 0, 1);
      const effR = clampF(f32(rough * f32(1 - wet * f32(params.wetSheenBoost))), 0.08, 0.98);
      const a2 = f32(f32(effR * effR) * f32(effR * effR));

      const ndotl = Math.max(0, f32(nx * lx + ny * ly + nz * lz));
      const ndotv = Math.max(f32(0.001), nz);
      const ndoth = Math.max(0, f32(nx * hx + ny * hy + nz * hz));
      const vdoth = Math.max(0, hz);

      const denom = f32(ndoth * ndoth * (a2 - 1) + 1);
      const ggxD = f32(a2 / f32(3.14159265 * denom * denom + 1e-6));
      const k = f32((effR + 1) * (effR + 1) * 0.125);
      const ggxG = f32((ndotv / (ndotv * (1 - k) + k)) * (ndotl / (ndotl * (1 - k) + k)));
      const om = f32(1 - vdoth);
      const f0 = f32(params.f0Dielectric);
      const fres = f32(f0 + (1 - f0) * om * om * om * om * om);
      const spec = f32(((ggxD * ggxG * fres) / (4 * ndotv * Math.max(ndotl, 0.001) + 1e-5)) * ndotl * f32(params.specularStrength) * ao);

      const w = f32(params.lightWarmth);
      const trTint = f32(1 + w);
      const tgTint = f32(1 + w * 0.25);
      const tbTint = f32(1 - w);
      const amb = f32(f32(params.ambientStrength) * ao);
      const diff = f32(f32(params.diffuseStrength) * ndotl * ao);
      const exp = f32(params.exposure);

      litRgbaOut[off] = clampF(((baseColorIn[off] ?? 0) * (amb + diff * trTint) + spec * trTint) * exp, 0, 1);
      litRgbaOut[off + 1] = clampF(((baseColorIn[off + 1] ?? 0) * (amb + diff * tgTint) + spec * tgTint) * exp, 0, 1);
      litRgbaOut[off + 2] = clampF(((baseColorIn[off + 2] ?? 0) * (amb + diff * tbTint) + spec * tbTint) * exp, 0, 1);
      litRgbaOut[off + 3] = baseColorIn[off + 3] ?? 1;
      normalAoOut[off] = nx;
      normalAoOut[off + 1] = ny;
      normalAoOut[off + 2] = nz;
      normalAoOut[off + 3] = ao;
    }
  }
  return { litRgbaOut, normalAoOut };
}

function createMockAudioContext() {
  const stats = {
    started: false,
    stopped: false,
    closed: false,
    connections: 0,
    gainTargets: [] as number[],
    bandpassFreqTargets: [] as number[],
  };
  let filterIdx = 0;
  const makeParam = (onTarget?: (val: number) => void): FrictionAudioParamLike => ({
    value: 0,
    setTargetAtTime(target: number): void {
      this.value = target;
      onTarget?.(target);
    },
  });
  const noop = (): void => {
    // mock teardown
  };
  const ctx: FrictionAudioContextLike = {
    currentTime: 1.25,
    sampleRate: 44100,
    state: "running",
    destination: { tag: "dest" },
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    },
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect: () => { stats.connections += 1; },
        start: () => { stats.started = true; },
        stop: () => { stats.stopped = true; },
        disconnect: noop,
      };
    },
    createBiquadFilter() {
      const myIdx = filterIdx;
      filterIdx += 1;
      return {
        type: "bandpass",
        frequency: makeParam((v) => { if (myIdx === 1) stats.bandpassFreqTargets.push(v); }),
        Q: makeParam(),
        connect: () => { stats.connections += 1; },
        disconnect: noop,
      };
    },
    createGain() {
      return {
        gain: makeParam((v) => { stats.gainTargets.push(v); }),
        connect: () => { stats.connections += 1; },
        disconnect: noop,
      };
    },
    async resume() { return undefined; },
    async close() { stats.closed = true; },
  };
  return { ctx, stats };
}

describe("brush-texture-max: WebGPU 7밴드 분광 브러시 질감 극대화 7대 파이프라인", () => {
  describe("1. 3-주파수 멀티스케일 종이 높이장 + 틸트·필압 접촉 + MIP 샘플러", () => {
    const allPresets: readonly PaperToothPresetId[] = [
      "cold-press",
      "hot-press",
      "rough-watercolor",
      "hanji",
      "charcoal-laid",
    ];

    it("5종 종이 프리셋을 결정적으로 생성하며 타일 경계가 이음매 없이 이어진다", () => {
      for (const presetId of allPresets) {
        expect(PAPER_TOOTH_PRESETS[presetId].id).toBe(presetId);
        const tileA = generateMultiscalePaperTile({ presetId, tileSize: 32, seed: 4242 });
        const tileB = generateMultiscalePaperTile({ presetId, tileSize: 32, seed: 4242 });
        expect(tileA.height.length).toBe(1024);
        expect(tileA.macro.length).toBe(1024);
        expect(tileA.meso.length).toBe(1024);
        expect(tileA.micro.length).toBe(1024);
        expect(tileA.mipPyramid.length).toBe(6);
        expect(Array.from(tileA.height)).toEqual(Array.from(tileB.height));
        const s0 = sampleMultiscalePaperMip(tileA, 0, 0.37, 1);
        const s1 = sampleMultiscalePaperMip(tileA, 1, 0.37, 1);
        expect(Math.abs(s0.height - s1.height)).toBeLessThan(1e-6);
      }
      const rough = generateMultiscalePaperTile({ presetId: "rough-watercolor", tileSize: 64, seed: 77 });
      const hot = generateMultiscalePaperTile({ presetId: "hot-press", tileSize: 64, seed: 77 });
      expect(rough.stdHeight).toBeGreaterThan(hot.stdHeight * 1.4);
    });

    it("틸트가 낮을수록 산봉우리만 걸리고 필압이 강할수록 골짜기까지 단조롭게 채워진다", () => {
      let prevTransfer = -1;
      let prevThreshold = 2;
      for (const p of [0, 0.2, 0.45, 0.7, 0.95]) {
        const res = evaluatePaperContactTransfer({ paperHeight: 0.25, tiltRad: Math.PI * 0.42, pressure: p });
        expect(res.pigmentTransfer).toBeGreaterThanOrEqual(prevTransfer - 1e-9);
        expect(res.contactThreshold).toBeLessThanOrEqual(prevThreshold + 1e-9);
        prevTransfer = res.pigmentTransfer;
        prevThreshold = res.contactThreshold;
      }

      // 종이 높이 단조성: 산봉우리가 골짜기보다 항상 높거나 같은 안료 전이
      let prevHTransfer = -1;
      for (const h of [0.1, 0.35, 0.6, 0.85]) {
        const res = evaluatePaperContactTransfer({ paperHeight: h, tiltRad: 0.35, pressure: 0.5 });
        expect(res.pigmentTransfer).toBeGreaterThanOrEqual(prevHTransfer - 1e-9);
        prevHTransfer = res.pigmentTransfer;
      }

      const grazingValley = evaluatePaperContactTransfer({ paperHeight: 0.2, tiltRad: 0.2, pressure: 0.45 });
      const grazingRidge = evaluatePaperContactTransfer({ paperHeight: 0.88, tiltRad: 0.2, pressure: 0.45 });
      const uprightValley = evaluatePaperContactTransfer({ paperHeight: 0.2, tiltRad: Math.PI * 0.48, pressure: 0.85 });
      expect(grazingRidge.pigmentTransfer).toBeGreaterThan(grazingValley.pigmentTransfer + 0.35);
      expect(grazingValley.pigmentTransfer).toBeLessThan(0.08);
      expect(uprightValley.pigmentTransfer).toBeGreaterThan(0.5);
    });

    it("줌 아웃할수록 MIP 레벨이 상승하고 고주파 분산이 감쇠해 모아레를 억제한다", () => {
      const tile = generateMultiscalePaperTile({ presetId: "charcoal-laid", tileSize: 64, seed: 901 });
      let prevLod = -1;
      let prevAtten = 2;
      const variances: number[] = [];
      for (const z of [2.0, 1.0, 0.5, 0.25, 0.125]) {
        const samples: number[] = [];
        let lod = 0;
        let atten = 0;
        for (let i = 0; i < 32; i += 1) {
          const s = sampleMultiscalePaperMip(tile, i / 32, (i * 0.618) % 1, z);
          samples.push(s.height);
          lod = s.mipLevel;
          atten = s.highFreqAttenuation;
        }
        expect(lod).toBeGreaterThanOrEqual(prevLod);
        expect(atten).toBeLessThanOrEqual(prevAtten + 1e-9);
        prevLod = lod;
        prevAtten = atten;
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        variances.push(samples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / samples.length);
      }
      expect(variances[4] ?? 1).toBeLessThan((variances[1] ?? 0) * 0.5);
    });
  });

  describe("2. 실시간 임파스토 높이장 30° 측면광 WGSL + CPU 동등성 + 건·습 하이브리드", () => {
    it("WGSL 컴퓨트 셰이더가 wesl link() 문법·바인딩·64B 균일 버퍼 검증을 통과한다", async () => {
      const linked = await link({
        weslSrc: { main: STUDIO_IMPASTO_RAKING_LIGHT_WGSL },
        rootModuleName: "main",
      });
      const wgsl = linked.dest;
      expect(wgsl).toContain(
        `@compute @workgroup_size(${STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_X}, ${STUDIO_IMPASTO_RAKING_LIGHT_WORKGROUP_Y}, 1)`,
      );
      expect(wgsl).toContain(`fn ${STUDIO_IMPASTO_RAKING_LIGHT_ENTRY}(`);
      for (let b = 0; b <= 5; b += 1) expect(wgsl, `binding ${b}`).toContain(`@binding(${b})`);
      const structBody = /struct ImpastoRakingLightParams \{([\s\S]*?)\}/u.exec(wgsl)?.[1] ?? "";
      expect(structBody.split(",").filter((line) => line.includes(":")).length).toBe(
        STUDIO_IMPASTO_RAKING_LIGHT_PARAM_FIELDS.length,
      );

      const uBuf = packImpastoRakingLightUniforms(128, 96, {
        lightElevationRad: STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD,
        heightScale: 4.5,
      });
      expect(uBuf.byteLength).toBe(64);
      const u32 = new Uint32Array(uBuf);
      const f32 = new Float32Array(uBuf);
      expect(u32[0]).toBe(128);
      expect(u32[1]).toBe(96);
      expect(f32[3]).toBeCloseTo(Math.PI / 6, 5);
      expect(f32[4]).toBeCloseTo(4.5, 5);
      expect(computeImpastoDispatchSize(129, 65)).toEqual({ workgroupsX: 17, workgroupsY: 9, workgroupsZ: 1 });
    });

    it("CPU f32 엔진이 WGSL 독립 미러와 1e-5 이내로 일치하고 30° 측면광·미세 골 음영을 정확히 표현한다", () => {
      const width = 20;
      const height = 20;
      const count = width * height;
      const baseColorIn = new Float32Array(count * 4);
      const heightPropsIn = new Float32Array(count * 4);
      const paperHeightIn = new Float32Array(count);

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          const off = idx * 4;
          baseColorIn[off] = 0.68;
          baseColorIn[off + 1] = 0.34;
          baseColorIn[off + 2] = 0.18;
          baseColorIn[off + 3] = 1.0;
          const dome = Math.max(0, 1 - Math.hypot(x - 7, y - 7) / 5);
          const pit = x === 14 && y === 14 ? -0.45 : 0;
          heightPropsIn[off] = Math.max(0, dome * 0.9 + 0.5 + pit);
          heightPropsIn[off + 1] = 0.2;
          heightPropsIn[off + 2] = 0.25;
          heightPropsIn[off + 3] = 0.6;
          paperHeightIn[idx] = 0.5;
        }
      }

      const params = normalizeImpastoRakingLightParams({
        ...DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS,
        lightAzimuthRad: -Math.PI * 0.75, // 좌상단(-x, -y) 30도 측면 자연광
        lightElevationRad: Math.PI / 6,
      });
      const cpu = shadeImpastoRakingLightCpu({ width, height, baseColorIn, heightPropsIn, paperHeightIn, params });
      const mirror = mirrorImpastoWgslShade(width, height, baseColorIn, heightPropsIn, paperHeightIn, params);

      for (let i = 0; i < cpu.litRgbaOut.length; i += 1) {
        expect(Math.abs((cpu.litRgbaOut[i] ?? 0) - (mirror.litRgbaOut[i] ?? 0))).toBeLessThan(1e-5);
        expect(Math.abs((cpu.normalAoOut[i] ?? 0) - (mirror.normalAoOut[i] ?? 0))).toBeLessThan(1e-5);
      }

      // 좌상단 광원 방향 사면(5,5)이 우하단 그림자 사면(9,9)보다 뚜렷하게 밝다
      const litSlopeLum = cpu.litRgbaOut[(5 * width + 5) * 4] ?? 0;
      const shadowSlopeLum = cpu.litRgbaOut[(9 * width + 9) * 4] ?? 0;
      expect(litSlopeLum).toBeGreaterThan(shadowSlopeLum + 0.15);

      // 움푹 패인 미세 골(14,14)의 creviceAo가 평탄 영역(18,18)보다 뚜렷하게 낮다
      const pitAo = cpu.normalAoOut[(14 * width + 14) * 4 + 3] ?? 1;
      const flatAo = cpu.normalAoOut[(18 * width + 18) * 4 + 3] ?? 0;
      expect(pitAo).toBeLessThan(flatAo - 0.15);
    });

    it("건·습 하이브리드: 습윤층 Sgraffito 긁힘이 중심을 파내고 좌우 둑을 밀어 올리며, 덧칠 Relief 계승이 점도에 반비례한다", () => {
      const width = 24;
      const height = 24;
      const wetField = new Float32Array(width * height * 4);
      const dryField = new Float32Array(width * height * 4);
      for (let i = 0; i < width * height; i += 1) {
        wetField[i * 4] = 0.8; wetField[i * 4 + 1] = 0.25; wetField[i * 4 + 2] = 0.3; wetField[i * 4 + 3] = 0.95;
        dryField[i * 4] = 0.8; dryField[i * 4 + 1] = 0.25; dryField[i * 4 + 2] = 0.3; dryField[i * 4 + 3] = 0.0;
      }
      const stroke = { width, height, startX: 4, startY: 12.5, endX: 20, endY: 12.5, radius: 2.2, carveStrength: 0.95, ridgePush: 0.45 };
      const wetDiag = applySgraffitoHeightCarving({ ...stroke, heightProps: wetField });
      const dryDiag = applySgraffitoHeightCarving({ ...stroke, heightProps: dryField });

      expect(wetDiag.carvedVolume).toBeGreaterThan(dryDiag.carvedVolume * 4);
      expect(wetDiag.pushedRidgeVolume).toBeGreaterThan(0.5);
      expect(wetDiag.exposedUnderlayerPixels).toBeGreaterThan(0);
      expect(wetField[(12 * width + 12) * 4] ?? 1).toBeLessThan(0.1);
      expect(wetField[(9 * width + 12) * 4] ?? 0).toBeGreaterThan(0.82);

      const glaze = computeOverpaintReliefInheritance({
        dryUnderHeight: 0.85, newPaintThickness: 0.6, paintViscosity: 0.12, brushStrokeRelief: 0.1,
      });
      const impasto = computeOverpaintReliefInheritance({
        dryUnderHeight: 0.85, newPaintThickness: 0.6, paintViscosity: 0.92, brushStrokeRelief: 0.4,
      });
      expect(glaze.preservedDryRatio).toBeGreaterThan(impasto.preservedDryRatio + 0.15);
      expect(glaze.inheritedUnderRelief).toBeGreaterThan(impasto.inheritedUnderRelief);
    });
  });

  describe("3. 이방성 갈필 + 7밴드 이원 과립화 + 8~16채널 다채널 붓모 픽업", () => {
    it("고속·고갈에서 갈필 간극이 급증하고 저속·강필압에서 종이 결 방향 이방성 산란이 형성된다", () => {
      const base = { strokeAngleRad: 0, bristleCount: 12, paperHeight: 0.45, paperGrainDirX: 1, paperGrainDirY: 0 };
      const slowWet = measureDryBrushSplitGapFraction({ ...base, strokeSpeed: 0.2, pressure: 0.85, paintReserve: 0.92 });
      const fastDry = measureDryBrushSplitGapFraction({ ...base, strokeSpeed: 3.4, pressure: 0.35, paintReserve: 0.22 });
      expect(fastDry.splitSeverity).toBeGreaterThan(slowWet.splitSeverity + 0.45);
      expect(fastDry.gapFraction).toBeGreaterThan(slowWet.gapFraction + 0.25);

      let varX = 0;
      let varY = 0;
      let anisotropy = 0;
      for (let i = 0; i < 40; i += 1) {
        const res = evaluateAnisotropicDryBrushStamp({
          ...base,
          strokeSpeed: 0.15,
          pressure: 0.92,
          paintReserve: 0.75,
          strokeAngleRad: 0.05,
          paperHeight: 0.4,
          stampCoordU: -0.8 + (1.6 * i) / 39,
          stampCoordV: ((i % 7) - 3) / 4,
          seed: 313 + i,
        });
        varX += res.scatterOffsetX * res.scatterOffsetX;
        varY += res.scatterOffsetY * res.scatterOffsetY;
        anisotropy = res.anisotropyRatio;
      }
      expect(anisotropy).toBeGreaterThan(2.5);
      expect(varX).toBeGreaterThan(varY * 3.0);
    });

    it("7밴드 KM 이원 과립화가 무거운 안료를 골짜기에, 가벼운 안료를 가장자리에 분리한다", () => {
      const pair = DUAL_GRANULATION_PIGMENT_PRESETS["mineral-dusk"];
      const valley = evaluateDualPigmentGranulationKm7({
        heavyPigment: pair.heavyPigment, lightPigment: pair.lightPigment,
        paperHeight: 0.06, radialEdge01: 0.08, wetness: 0.95, granulationStrength: 0.95,
      });
      const edge = evaluateDualPigmentGranulationKm7({
        heavyPigment: pair.heavyPigment, lightPigment: pair.lightPigment,
        paperHeight: 0.88, radialEdge01: 0.94, wetness: 0.95, granulationStrength: 0.95,
      });
      expect(valley.heavyShare).toBeGreaterThan(0.7);
      expect(edge.lightShare).toBeGreaterThan(0.7);
      expect(valley.srgb.b).toBeGreaterThan(valley.srgb.r);
      expect(edge.srgb.r).toBeGreaterThan(edge.srgb.b);
      expect(valley.separationIndex).toBeGreaterThan(0.35);
      expect(edge.separationIndex).toBeGreaterThan(0.35);
    });

    it("8~16채널 가상 붓모가 캔버스 젖은 색을 개별 픽업해 다음 획으로 다색 스트리크를 방출한다", () => {
      const blue = { r: 0.1, g: 0.22, b: 0.85 };
      expect(createMultiChannelBristleBank({ strandCount: 3, initialPaintSrgb: blue }).strandCount).toBe(MIN_BRISTLE_STRAND_COUNT);
      expect(createMultiChannelBristleBank({ strandCount: 32, initialPaintSrgb: blue }).strandCount).toBe(MAX_BRISTLE_STRAND_COUNT);

      const bank = createMultiChannelBristleBank({ strandCount: 12, initialPaintSrgb: blue, initialLoad: 0.9 });
      const yellow = { r: 0.96, g: 0.86, b: 0.1 };
      const cleanWhite = { r: 0.98, g: 0.98, b: 0.98 };
      const pickupStep = stepBristleBankCrossStroke(bank, {
        canvasSrgbPerStrand: Array.from({ length: 12 }, (_, i) => (i < 6 ? yellow : cleanWhite)),
        canvasWetnessPerStrand: Array.from({ length: 12 }, (_, i) => (i < 6 ? 0.95 : 0)),
        pressure: 0.8, speed: 0.6, pickupRate: 0.65,
      });
      expect(pickupStep.strandColorVariance).toBeGreaterThan(0.01);
      expect(pickupStep.deposits[2]?.depositSrgb.g ?? 0).toBeGreaterThan((pickupStep.deposits[9]?.depositSrgb.g ?? 1) + 0.12);
      expect(pickupStep.deposits[2]?.dirtyLevel ?? 0).toBeGreaterThan(0.15);
      expect(pickupStep.deposits[9]?.dirtyLevel ?? 1).toBe(0);

      const nextStep = stepBristleBankCrossStroke(bank, {
        canvasSrgbPerStrand: Array.from({ length: 12 }, () => cleanWhite),
        canvasWetnessPerStrand: Array.from({ length: 12 }, () => 0),
        pressure: 0.75, speed: 1.0,
      });
      expect(nextStep.meanPaintLoad).toBeLessThan(pickupStep.meanPaintLoad);
      expect(nextStep.meanDirtyLevel).toBeLessThan(pickupStep.meanDirtyLevel);

      reloadBristleBank(bank, blue, 0.95);
      expect(bank.strands.every((s) => s.dirtyLevel === 0 && s.paintLoad === 0.95)).toBe(true);
    });
  });

  describe("4. 필압·속도·매체 연동 ₩0 WebAudio 절차적 마찰음 합성기", () => {
    it("4종 매체별 주파수·Q·그릿 특성을 구별하고 극단/NaN 입력에서도 볼륨 상한 안전 가드를 강제한다", () => {
      const mediums: readonly BrushFrictionMediumId[] = [
        "graphite-pencil", "charcoal-pastel", "watercolor-brush", "oil-palette-knife",
      ];
      const byMedium = Object.fromEntries(
        mediums.map((medium) => [
          medium,
          computeBrushFrictionSynthParams({
            medium, pressure: 0.7, speed: 1.6, paperRoughness: 0.75, tiltRad: 0.6,
            wetness: medium === "watercolor-brush" ? 0.85 : 0.15, masterVolume: 0.8,
          }),
        ]),
      ) as Record<BrushFrictionMediumId, ReturnType<typeof computeBrushFrictionSynthParams>>;

      expect(byMedium["graphite-pencil"].centerFreqHz).toBeGreaterThan(byMedium["watercolor-brush"].centerFreqHz + 1200);
      expect(byMedium["charcoal-pastel"].grainModDepth).toBeGreaterThan(byMedium["watercolor-brush"].grainModDepth + 0.3);
      expect(byMedium["oil-palette-knife"].qFactor).toBeGreaterThan(byMedium["charcoal-pastel"].qFactor + 1.5);

      const idle = computeBrushFrictionSynthParams({ medium: "graphite-pencil", pressure: 0.5, speed: 0 });
      expect(idle.active).toBe(false);
      expect(idle.targetGain).toBe(0);

      for (const medium of mediums) {
        const extreme = computeBrushFrictionSynthParams({
          medium, pressure: 9999, speed: Number.POSITIVE_INFINITY, paperRoughness: 50, masterVolume: 100,
        });
        expect(Number.isFinite(extreme.targetGain)).toBe(true);
        expect(extreme.targetGain).toBeGreaterThanOrEqual(0);
        expect(extreme.targetGain).toBeLessThanOrEqual(MAX_SAFE_FRICTION_GAIN);

        const nanOut = computeBrushFrictionSynthParams({
          medium, pressure: Number.NaN, speed: Number.NaN, masterVolume: Number.NaN,
        });
        expect(Number.isFinite(nanOut.centerFreqHz)).toBe(true);
        expect(nanOut.targetGain).toBe(0);
      }
    });

    it("기본 OFF, AudioContext 미지원/SSR 무오류, Mock AudioContext 연결·스케줄링·정리를 검증한다", () => {
      let factoryCalled = 0;
      const ssr = createBrushFrictionAudioController({
        createContext: () => { factoryCalled += 1; return null; },
      });
      expect(ssr.isEnabled()).toBe(false);
      expect(ssr.getStatus()).toBe("disabled");
      expect(ssr.updateStroke({ medium: "graphite-pencil", pressure: 0.8, speed: 2.0 }).targetGain).toBe(0);
      expect(factoryCalled).toBe(0);
      expect(ssr.setEnabled(true)).toBe("unsupported");
      expect(factoryCalled).toBe(1);
      expect(ssr.updateStroke({ medium: "charcoal-pastel", pressure: 0.8, speed: 2.0 }).targetGain).toBe(0);
      ssr.stopStroke();
      ssr.dispose();
      expect(ssr.getStatus()).toBe("disposed");

      const { ctx, stats } = createMockAudioContext();
      const live = createBrushFrictionAudioController({ createContext: () => ctx, masterVolume: 1 });
      expect(live.setEnabled(true)).toBe("running");
      expect(stats.started).toBe(true);
      expect(stats.connections).toBe(6);

      const active = live.updateStroke({
        medium: "oil-palette-knife", pressure: 0.9, speed: 2.4, paperRoughness: 0.7, masterVolume: 5,
      });
      expect(active.targetGain).toBeGreaterThan(0);
      expect(active.targetGain).toBeLessThanOrEqual(MAX_SAFE_FRICTION_GAIN);
      expect(stats.gainTargets.every((g) => g <= MAX_SAFE_FRICTION_GAIN)).toBe(true);
      expect(stats.bandpassFreqTargets.length).toBeGreaterThan(0);

      live.stopStroke();
      expect(stats.gainTargets[stats.gainTargets.length - 1]).toBe(0);
      live.dispose();
      expect(stats.stopped).toBe(true);
      expect(stats.closed).toBe(true);
    });
  });

  describe("5. 통합 오케스트레이터 & studio-rebelle-heightmap-metallic 진입점 연동", () => {
    it("7대 파이프라인 통합 스텝 및 Rebelle 모듈 재수출 연결이 정상 작동한다", () => {
      expect(REBELLE_LINKED_IMPASTO_WGSL).toBe(STUDIO_IMPASTO_RAKING_LIGHT_WGSL);
      expect(rebelleLinkedTextureMaxStep).toBe(evaluateBrushTextureMaxStep);

      const paperTile = generateMultiscalePaperTile({ presetId: "hanji", tileSize: 32, seed: 555 });
      const bristleBank = createMultiChannelBristleBank({
        strandCount: 10, initialPaintSrgb: { r: 0.15, g: 0.3, b: 0.72 },
      });
      const step = evaluateBrushTextureMaxStep({
        paperTile, u: 0.42, v: 0.63, zoomScale: 0.75, tiltRad: 0.65, pressure: 0.72,
        strokeSpeed: 1.4, strokeAngleRad: 0.25, paintReserve: 0.68, wetness: 0.75,
        dryUnderHeight: 0.55, paintViscosity: 0.4, radialEdge01: 0.35,
        stampCoordU: 0.1, stampCoordV: -0.2, medium: "watercolor-brush", bristleBank,
        canvasSrgbPerStrand: [{ r: 0.9, g: 0.7, b: 0.2 }], canvasWetnessPerStrand: [0.6],
      });
      expect(step.paperSample.height).toBeGreaterThanOrEqual(0);
      expect(step.contactTransfer.pigmentTransfer).toBeGreaterThan(0);
      expect(step.dryBrushStamp.strandMask).toBeGreaterThanOrEqual(0);
      expect(step.dualGranulation.heavyShare + step.dualGranulation.lightShare).toBeCloseTo(1, 5);
      expect(step.bristleStep.deposits).toHaveLength(10);
      expect(step.overpaintRelief.effectiveTotalHeight).toBeGreaterThan(0);
      expect(step.frictionAudio.targetGain).toBeLessThanOrEqual(MAX_SAFE_FRICTION_GAIN);
    });
  });
});
