/**
 * Wave 112 — 다중 붓털 갈필·비백(Flying-White) 합성 엔진 및 WebGPU WGSL 화선지 모세관 셰이더.
 *
 * - 8~24개 개별 붓털이 화선지 기복(paperHeight) 위를 스치며 먹 잔량을 소모하고 골짜기를 건너뛰어 비백 생성
 * - 습윤도 감소·운필 속도 증가에 따른 비백 공백률 단조 증가 보장
 * - 이방성 화선지 플럭스 교환·탄소 응집·갈필 접촉 임계치를 수행하는 WebGPU WGSL 컴퓨트 셰이더 생성 및 검증
 */

import {
  clampNumber,
  createSeededRng,
  getKoreanInkTechniqueConfig,
  type HanjiPaperSubstrate,
  type KoreanInkTechniquePreset,
} from "./hanji-capillary-ink-physics";

export interface GalpilStylusSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly speedPxPerSec: number;
  readonly tiltRad?: number;
}

export interface GalpilDryBrushOptions {
  readonly bristleCount?: number;
  readonly brushWidthPx?: number;
  readonly moisture?: number;
  readonly inkLoad?: number;
  readonly depletionRate?: number;
  readonly seed?: number;
  readonly rgbaWidth?: number;
  readonly rgbaHeight?: number;
  readonly inkToneChannels?: readonly [number, number, number];
  readonly paperToneChannels?: readonly [number, number, number];
}

export interface GalpilBristlePoint {
  readonly x: number;
  readonly y: number;
  readonly deposited: boolean;
  readonly opacity: number;
  readonly inkLoad: number;
  readonly paperHeight: number;
  readonly contactThreshold: number;
}

export interface GalpilBristleTrace {
  readonly bristleIndex: number;
  readonly lateralOffsetNorm: number;
  readonly initialInkLoad: number;
  readonly finalInkLoad: number;
  readonly depositedCount: number;
  readonly gapCount: number;
  readonly points: readonly GalpilBristlePoint[];
}

export interface GalpilDryBrushStrokeResult {
  readonly width: number;
  readonly height: number;
  readonly bristleCount: number;
  readonly brushWidthPx: number;
  readonly moisture: number;
  readonly meanSpeedPxPerSec: number;
  readonly totalArcLengthPx: number;
  readonly totalContactSamples: number;
  readonly depositedSamples: number;
  readonly flyingWhiteGapSamples: number;
  readonly flyingWhiteRatio: number;
  readonly initialMeanInkLoad: number;
  readonly finalMeanInkLoad: number;
  readonly inkDepletionMonotonic: boolean;
  readonly meanInkLoadProfile: readonly number[];
  readonly bristleTraces: readonly GalpilBristleTrace[];
  readonly rgbaBuffer: Uint8ClampedArray;
  readonly inkCoverageField: Float32Array;
  readonly nonFiniteRgbaCount: number;
}

export interface HanjiWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface HanjiSumieWgslArtifact {
  readonly preset: KoreanInkTechniquePreset;
  readonly workgroupSize: readonly [number, number];
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly HanjiWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
}

export interface HanjiWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly entryPoints: readonly string[];
  readonly bindingCount: number;
  readonly lineCount: number;
}

interface ResampledPathNode {
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
  readonly pressure: number;
  readonly speedPxPerSec: number;
  readonly stepArcLen: number;
}

function samplePaperHeightBilinear(substrate: HanjiPaperSubstrate, x: number, y: number): number {
  const cx = clampNumber(x, 0, substrate.width - 1);
  const cy = clampNumber(y, 0, substrate.height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(substrate.width - 1, x0 + 1);
  const y1 = Math.min(substrate.height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const h00 = substrate.paperHeight[y0 * substrate.width + x0];
  const h10 = substrate.paperHeight[y0 * substrate.width + x1];
  const h01 = substrate.paperHeight[y1 * substrate.width + x0];
  const h11 = substrate.paperHeight[y1 * substrate.width + x1];
  return h00 + (h10 - h00) * fx + (h01 + (h11 - h01) * fx - (h00 + (h10 - h00) * fx)) * fy;
}

function resampleTrajectory(
  trajectory: readonly GalpilStylusSample[],
  spacingPx: number,
): { readonly nodes: readonly ResampledPathNode[]; readonly totalArcLengthPx: number } {
  if (trajectory.length === 0) return { nodes: [], totalArcLengthPx: 0 };
  if (trajectory.length === 1) {
    const p = trajectory[0];
    return {
      nodes: [{
        x: clampNumber(p.x, -1024, 4096),
        y: clampNumber(p.y, -1024, 4096),
        nx: 0,
        ny: 1,
        pressure: clampNumber(p.pressure, 0.05, 1),
        speedPxPerSec: clampNumber(p.speedPxPerSec, 0, 5000),
        stepArcLen: spacingPx,
      }],
      totalArcLengthPx: 0,
    };
  }

  const nodes: ResampledPathNode[] = [];
  let totalArc = 0;
  for (let i = 0; i < trajectory.length - 1; i += 1) {
    const a = trajectory[i];
    const b = trajectory[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-5) continue;
    const nx = -dy / segLen;
    const ny = dx / segLen;
    const subdiv = Math.max(1, Math.ceil(segLen / spacingPx));
    const stepLen = segLen / subdiv;
    for (let k = 0; k < subdiv; k += 1) {
      const t = k / subdiv;
      nodes.push({
        x: a.x + dx * t,
        y: a.y + dy * t,
        nx,
        ny,
        pressure: clampNumber(a.pressure + (b.pressure - a.pressure) * t, 0.05, 1),
        speedPxPerSec: clampNumber(a.speedPxPerSec + (b.speedPxPerSec - a.speedPxPerSec) * t, 0, 5000),
        stepArcLen: stepLen,
      });
    }
    totalArc += segLen;
  }

  const last = trajectory[trajectory.length - 1];
  const prev = nodes[nodes.length - 1];
  nodes.push({
    x: last.x,
    y: last.y,
    nx: prev ? prev.nx : 0,
    ny: prev ? prev.ny : 1,
    pressure: clampNumber(last.pressure, 0.05, 1),
    speedPxPerSec: clampNumber(last.speedPxPerSec, 0, 5000),
    stepArcLen: spacingPx,
  });
  return { nodes, totalArcLengthPx: totalArc };
}

function stampBristleMarkOnBuffer(
  inkCoverage: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  opacity: number,
): void {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let oy = -1; oy <= 1; oy += 1) {
    const py = cy + oy;
    if (py < 0 || py >= height) continue;
    for (let ox = -1; ox <= 1; ox += 1) {
      const px = cx + ox;
      if (px < 0 || px >= width) continue;
      const distSq = (px + 0.5 - x) * (px + 0.5 - x) + (py + 0.5 - y) * (py + 0.5 - y);
      if (distSq > 1.35) continue;
      const alpha = clampNumber(opacity * Math.exp(-distSq * 1.45), 0, 1);
      const idx = py * width + px;
      inkCoverage[idx] = 1 - (1 - inkCoverage[idx]) * (1 - alpha);
    }
  }
}

/** 다중 붓털(8~24모) 갈필·비백(Flying-White) 스트로크를 화선지 기복 위에서 물리 합성한다. */
export function synthesizeGalpilDryBrushStroke(
  substrate: HanjiPaperSubstrate,
  trajectory: readonly GalpilStylusSample[],
  options: GalpilDryBrushOptions = {},
): GalpilDryBrushStrokeResult {
  const bristleCount = Math.round(clampNumber(options.bristleCount ?? 14, 8, 24));
  const brushWidthPx = clampNumber(options.brushWidthPx ?? 11, 2, 64);
  const moisture = clampNumber(options.moisture ?? 0.30, 0, 1);
  const initialInkBase = clampNumber(options.inkLoad ?? 0.86, 0.08, 1);
  const depletionRate = clampNumber(options.depletionRate ?? 0.012, 0.0005, 0.12);
  const outWidth = Math.max(8, Math.floor(clampNumber(options.rgbaWidth ?? substrate.width, 8, 512)));
  const outHeight = Math.max(8, Math.floor(clampNumber(options.rgbaHeight ?? substrate.height, 8, 512)));
  const inkTone = options.inkToneChannels ?? [20, 22, 26];
  const paperTone = options.paperToneChannels ?? [246, 242, 232];

  const rng = createSeededRng((options.seed ?? substrate.seed) ^ 0x47a1b9);
  const { nodes, totalArcLengthPx } = resampleTrajectory(trajectory, 0.8);

  const lateralOffsets: number[] = [];
  const bristleLoads: number[] = [];
  const initialLoads: number[] = [];
  const bristlePoints: GalpilBristlePoint[][] = [];
  const depositedCounts: number[] = [];
  const gapCounts: number[] = [];

  for (let b = 0; b < bristleCount; b += 1) {
    const baseU = bristleCount > 1 ? b / (bristleCount - 1) - 0.5 : 0;
    const u = clampNumber(baseU + (rng() - 0.5) * (0.45 / bristleCount), -0.5, 0.5);
    const load = clampNumber(initialInkBase * (0.92 + 0.08 * (1 - Math.abs(u) * 0.24)), 0.05, 1);
    lateralOffsets.push(u);
    bristleLoads.push(load);
    initialLoads.push(load);
    bristlePoints.push([]);
    depositedCounts.push(0);
    gapCounts.push(0);
  }

  const inkCoverageField = new Float32Array(outWidth * outHeight);
  const meanInkLoadProfile: number[] = [];
  let totalContactSamples = 0;
  let depositedSamples = 0;
  let flyingWhiteGapSamples = 0;
  let speedSum = 0;
  const scaleX = substrate.width / outWidth;
  const scaleY = substrate.height / outHeight;

  for (let nIdx = 0; nIdx < nodes.length; nIdx += 1) {
    const node = nodes[nIdx];
    speedSum += node.speedPxPerSec;
    const activeWidth = brushWidthPx * (0.58 + 0.62 * node.pressure);
    const normSpeed = clampNumber(node.speedPxPerSec / 1100, 0, 1.5);

    let stepLoadSum = 0;
    for (let b = 0; b < bristleCount; b += 1) {
      const u = lateralOffsets[b];
      const bx = node.x + node.nx * u * activeWidth;
      const by = node.y + node.ny * u * activeWidth;
      const h = samplePaperHeightBilinear(substrate, bx * scaleX, by * scaleY);
      const currentLoad = bristleLoads[b];
      const contactThreshold = clampNumber(
        0.16 + (1 - moisture) * 0.44 + normSpeed * 0.25 + (1 - currentLoad) * 0.22 + Math.abs(u) * 0.16 - node.pressure * 0.22,
        0.02,
        0.96,
      );

      totalContactSamples += 1;
      const isContact = h >= contactThreshold && currentLoad > 0.008;
      let opacity = 0;
      if (isContact) {
        const ridgeExcess = (h - contactThreshold) / Math.max(1 - contactThreshold, 0.08);
        opacity = clampNumber((0.28 + 0.72 * ridgeExcess) * currentLoad * (0.45 + 0.55 * node.pressure), 0.05, 1);
        stampBristleMarkOnBuffer(inkCoverageField, outWidth, outHeight, bx, by, opacity);
        bristleLoads[b] = Math.max(0, currentLoad - depletionRate * node.stepArcLen * (0.65 + 0.7 * opacity) * (1.22 - 0.45 * moisture));
        depositedSamples += 1;
        depositedCounts[b] += 1;
      } else {
        bristleLoads[b] = Math.max(0, currentLoad - depletionRate * node.stepArcLen * 0.06);
        flyingWhiteGapSamples += 1;
        gapCounts[b] += 1;
      }

      stepLoadSum += bristleLoads[b];
      bristlePoints[b].push({
        x: bx,
        y: by,
        deposited: isContact,
        opacity,
        inkLoad: bristleLoads[b],
        paperHeight: h,
        contactThreshold,
      });
    }
    meanInkLoadProfile.push(stepLoadSum / bristleCount);
  }

  let inkDepletionMonotonic = true;
  for (let i = 1; i < meanInkLoadProfile.length; i += 1) {
    if (meanInkLoadProfile[i] > meanInkLoadProfile[i - 1] + 1e-7) {
      inkDepletionMonotonic = false;
      break;
    }
  }

  const rgbaBuffer = new Uint8ClampedArray(outWidth * outHeight * 4);
  let nonFiniteRgbaCount = 0;
  for (let i = 0; i < inkCoverageField.length; i += 1) {
    const cov = clampNumber(inkCoverageField[i], 0, 1);
    const inv = 1 - cov;
    const r = paperTone[0] * inv + inkTone[0] * cov;
    const g = paperTone[1] * inv + inkTone[1] * cov;
    const bCh = paperTone[2] * inv + inkTone[2] * cov;
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(bCh)) nonFiniteRgbaCount += 1;
    const base = i * 4;
    rgbaBuffer[base] = Math.round(clampNumber(r, 0, 255));
    rgbaBuffer[base + 1] = Math.round(clampNumber(g, 0, 255));
    rgbaBuffer[base + 2] = Math.round(clampNumber(bCh, 0, 255));
    rgbaBuffer[base + 3] = 255;
  }

  const bristleTraces: GalpilBristleTrace[] = [];
  let initLoadSum = 0;
  let finalLoadSum = 0;
  for (let b = 0; b < bristleCount; b += 1) {
    initLoadSum += initialLoads[b];
    finalLoadSum += bristleLoads[b];
    bristleTraces.push({
      bristleIndex: b,
      lateralOffsetNorm: lateralOffsets[b],
      initialInkLoad: initialLoads[b],
      finalInkLoad: bristleLoads[b],
      depositedCount: depositedCounts[b],
      gapCount: gapCounts[b],
      points: bristlePoints[b],
    });
  }

  return {
    width: outWidth,
    height: outHeight,
    bristleCount,
    brushWidthPx,
    moisture,
    meanSpeedPxPerSec: nodes.length > 0 ? speedSum / nodes.length : 0,
    totalArcLengthPx,
    totalContactSamples,
    depositedSamples,
    flyingWhiteGapSamples,
    flyingWhiteRatio: totalContactSamples > 0 ? flyingWhiteGapSamples / totalContactSamples : 0,
    initialMeanInkLoad: initLoadSum / bristleCount,
    finalMeanInkLoad: finalLoadSum / bristleCount,
    inkDepletionMonotonic,
    meanInkLoadProfile,
    bristleTraces,
    rgbaBuffer,
    inkCoverageField,
    nonFiniteRgbaCount,
  };
}

/** 이방성 화선지 모세관 확산·탄소 응집·갈필 접촉 임계치 WebGPU WGSL 컴퓨트 셰이더를 생성한다. */
export function buildHanjiSumieWgsl(
  preset: KoreanInkTechniquePreset = "balmuk-wet-bloom",
  workgroupSize: readonly [number, number] = [8, 8],
): HanjiSumieWgslArtifact {
  const cfg = getKoreanInkTechniqueConfig(preset);
  const wx = Math.round(clampNumber(workgroupSize[0], 1, 16));
  const wy = Math.round(clampNumber(workgroupSize[1], 1, 16));
  const bindings: readonly HanjiWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_sim", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_paper", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_state_in", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_flux_x", addressSpace: "storage-read-write" },
    { group: 0, binding: 4, name: "b_flux_y", addressSpace: "storage-read-write" },
    { group: 0, binding: 5, name: "b_state_out", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 112 Hanji Anisotropic Capillary Ink & Galpil WGSL Compute Shader (${preset})
// Preset defaults: Dw=${cfg.waterCapillaryDiffusivity.toFixed(3)}, alpha=${cfg.carbonAdvectionCoupling.toFixed(3)}, floc=${cfg.flocculationRate.toFixed(3)}
struct HanjiSimUniforms {
  grid_size: vec2<u32>,
  dt_and_cfl: vec2<f32>,
  diffusivity_params: vec4<f32>,
  adsorption_params: vec4<f32>,
  bristle_params: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_sim: HanjiSimUniforms;
@group(0) @binding(1) var<storage, read> b_paper: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> b_state_in: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> b_flux_x: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> b_flux_y: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> b_state_out: array<vec4<f32>>;

fn cell_index(x: u32, y: u32) -> u32 { return y * u_sim.grid_size.x + x; }

fn eval_galpil_contact_threshold(moisture: f32, speed_norm: f32, ink_load: f32, lateral_abs: f32, pressure: f32) -> f32 {
  let raw = 0.16 + (1.0 - clamp(moisture, 0.0, 1.0)) * 0.44 + clamp(speed_norm, 0.0, 1.5) * 0.25
    + (1.0 - clamp(ink_load, 0.0, 1.0)) * 0.22 + clamp(lateral_abs, 0.0, 0.5) * 0.16 - clamp(pressure, 0.05, 1.0) * 0.22;
  return clamp(raw, 0.02, 0.96);
}

fn compute_face_flux(s_a: vec4<f32>, s_b: vec4<f32>, p_a: vec4<f32>, p_b: vec4<f32>, k_face: f32) -> vec2<f32> {
  let dt = u_sim.dt_and_cfl.x;
  let d_w = u_sim.diffusivity_params.x;
  let alpha = u_sim.diffusivity_params.y;
  let d_c = u_sim.diffusivity_params.z;
  let wet_boost = u_sim.diffusivity_params.w;
  let cap_thr = u_sim.adsorption_params.w;
  let dw = s_a.x - s_b.x;
  var fw: f32 = 0.0;
  if (dw > 0.0 && s_a.x > cap_thr) {
    fw = d_w * k_face * dt * dw * (0.65 + 0.35 * p_b.w) * (0.85 + 0.30 * (1.0 - p_b.x));
  } else if (dw < 0.0 && s_b.x > cap_thr) {
    fw = d_w * k_face * dt * dw * (0.65 + 0.35 * p_a.w) * (0.85 + 0.30 * (1.0 - p_a.x));
  }
  fw = clamp(fw, -s_b.x * 0.22, s_a.x * 0.22);
  var fc: f32 = 0.0;
  if (fw > 0.0 && s_a.y > 0.0) {
    fc = fc + min(0.95, alpha * (1.0 + wet_boost * min(1.0, s_b.x / 0.32))) * fw * (s_a.y / max(s_a.x, 1e-6));
  } else if (fw < 0.0 && s_b.y > 0.0) {
    fc = fc + min(0.95, alpha * (1.0 + wet_boost * min(1.0, s_a.x / 0.32))) * fw * (s_b.y / max(s_b.x, 1e-6));
  }
  let w_bridge = min(s_a.x, s_b.x);
  if (w_bridge > 0.015) {
    fc = fc + d_c * k_face * dt * (1.0 + wet_boost * min(1.8, w_bridge / 0.32)) * (s_a.y - s_b.y);
  }
  return vec2<f32>(fw, clamp(fc, -s_b.y * 0.22, s_a.y * 0.22));
}

@compute @workgroup_size(${wx}, ${wy})
fn compute_anisotropic_hanji_flux(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u_sim.grid_size.x || gid.y >= u_sim.grid_size.y) { return; }
  let idx = cell_index(gid.x, gid.y);
  let s_i = b_state_in[idx];
  let p_i = b_paper[idx];
  if (gid.x + 1u < u_sim.grid_size.x) {
    let j = cell_index(gid.x + 1u, gid.y);
    let p_j = b_paper[j];
    b_flux_x[idx] = compute_face_flux(s_i, b_state_in[j], p_i, p_j, (2.0 * p_i.y * p_j.y) / (p_i.y + p_j.y + 1e-6));
  } else {
    b_flux_x[idx] = vec2<f32>(0.0, 0.0);
  }
  if (gid.y + 1u < u_sim.grid_size.y) {
    let j = cell_index(gid.x, gid.y + 1u);
    let p_j = b_paper[j];
    b_flux_y[idx] = compute_face_flux(s_i, b_state_in[j], p_i, p_j, (2.0 * p_i.z * p_j.z) / (p_i.z + p_j.z + 1e-6));
  } else {
    b_flux_y[idx] = vec2<f32>(0.0, 0.0);
  }
}

@compute @workgroup_size(${wx}, ${wy})
fn integrate_hanji_carbon_flocculation(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u_sim.grid_size.x || gid.y >= u_sim.grid_size.y) { return; }
  let idx = cell_index(gid.x, gid.y);
  let s_i = b_state_in[idx];
  let p_i = b_paper[idx];
  var flux_net = vec2<f32>(0.0, 0.0);
  if (gid.x > 0u) { flux_net = flux_net + b_flux_x[cell_index(gid.x - 1u, gid.y)]; }
  if (gid.x + 1u < u_sim.grid_size.x) { flux_net = flux_net - b_flux_x[idx]; }
  if (gid.y > 0u) { flux_net = flux_net + b_flux_y[cell_index(gid.x, gid.y - 1u)]; }
  if (gid.y + 1u < u_sim.grid_size.y) { flux_net = flux_net - b_flux_y[idx]; }
  let w_next = max(0.0, s_i.x + flux_net.x);
  let c_pre = max(0.0, s_i.y + flux_net.y);
  let dt = u_sim.dt_and_cfl.x;
  let shield = 1.0 / (1.0 + u_sim.adsorption_params.y * w_next);
  let capture = clamp(u_sim.adsorption_params.x * (0.55 + 0.90 * p_i.w) * (0.75 + 0.50 * p_i.x) * shield * dt, 0.0, 1.0);
  let delta_dep = c_pre * capture;
  let c_mob = max(0.0, c_pre - delta_dep);
  let c_dep = max(0.0, s_i.z + delta_dep);
  let w_final = max(0.0, w_next - u_sim.adsorption_params.z * dt * (0.72 + 0.28 * (1.0 - p_i.w)));
  let thr = eval_galpil_contact_threshold(u_sim.bristle_params.x, u_sim.bristle_params.y, c_mob, 0.0, u_sim.bristle_params.z);
  b_state_out[idx] = vec4<f32>(w_final, c_mob, c_dep, select(0.0, 1.0, p_i.x >= thr));
}
`;

  return {
    preset,
    workgroupSize: [wx, wy],
    wgsl,
    uniformBufferByteLength: 64,
    bindings,
    entryPoints: ["compute_anisotropic_hanji_flux", "integrate_hanji_carbon_flocculation"],
  };
}

/** 생성된 화선지 WGSL 셰이더의 구조·바인딩·괄호 균형·엔트리포인트를 정적 검증한다. */
export function validateHanjiSumieWgsl(input: HanjiSumieWgslArtifact | string): HanjiWgslValidationReport {
  const wgsl = typeof input === "string" ? input : input.wgsl;
  const errors: string[] = [];
  if (!wgsl || wgsl.trim().length < 64) errors.push("WGSL source is empty or truncated");

  let curly = 0;
  let paren = 0;
  let square = 0;
  for (let i = 0; i < wgsl.length; i += 1) {
    const ch = wgsl[i];
    if (ch === "{") curly += 1;
    else if (ch === "}") curly -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    else if (ch === "[") square += 1;
    else if (ch === "]") square -= 1;
    if (curly < 0 || paren < 0 || square < 0) {
      errors.push("Unbalanced delimiter order in WGSL");
      break;
    }
  }
  if (curly !== 0) errors.push(`Unbalanced curly braces (${curly})`);
  if (paren !== 0) errors.push(`Unbalanced parentheses (${paren})`);
  if (square !== 0) errors.push(`Unbalanced square brackets (${square})`);
  if (/\b(NaN|Infinity|undefined)\b/.test(wgsl)) errors.push("Non-finite literal detected in WGSL");
  if (!wgsl.includes("struct HanjiSimUniforms")) errors.push("Missing HanjiSimUniforms struct");

  const entryRegex = /@compute\s+@workgroup_size\((\d+),\s*(\d+)\)\s+fn\s+([a-zA-Z0-9_]+)/g;
  const foundEntries: string[] = [];
  let match = entryRegex.exec(wgsl);
  while (match !== null) {
    const wx = Number(match[1]);
    const wy = Number(match[2]);
    if (wx < 1 || wy < 1 || wx * wy > 256) errors.push(`Invalid workgroup size (${wx}, ${wy}) for ${match[3]}`);
    foundEntries.push(match[3]);
    match = entryRegex.exec(wgsl);
  }
  if (!foundEntries.includes("compute_anisotropic_hanji_flux")) errors.push("Missing compute_anisotropic_hanji_flux entry point");
  if (!foundEntries.includes("integrate_hanji_carbon_flocculation")) errors.push("Missing integrate_hanji_carbon_flocculation entry point");

  const bindingMatches = wgsl.match(/@group\(\d+\)\s+@binding\(\d+\)/g) ?? [];
  if (bindingMatches.length < 6) errors.push(`Expected at least 6 WGSL bindings, found ${bindingMatches.length}`);

  return {
    valid: errors.length === 0,
    errors,
    entryPoints: foundEntries,
    bindingCount: bindingMatches.length,
    lineCount: wgsl.split("\n").length,
  };
}
