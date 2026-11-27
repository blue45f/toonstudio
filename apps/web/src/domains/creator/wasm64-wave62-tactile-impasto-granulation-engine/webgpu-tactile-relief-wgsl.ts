/**
 * WebGPU 실물 질감 릴리프 & 수채화 그래뉼레이션 WGSL 셰이더 및 5대 매체 고감도 프리셋.
 *
 * - `TACTILE_IMPASTO_RELIEF_WGSL`: 4-필드 물리 버퍼(`rgbaLinear`, `heightField`, `wetnessField`,
 *   `paperToothField`)에서 3×3 소벨 법선, 측면 광원(Raking Light) 직사광·광선 마칭 자가 그림자·
 *   유화 바인더 스펙큘러 하이라이트를 산출하는 컴퓨트(`cs_tactile_impasto_relief`) 및
 *   풀스크린 프래그먼트(`vs_fullscreen_quad` / `fs_tactile_impasto_relief`) WGSL 셰이더.
 * - `WATERCOLOR_GRANULATION_WGSL`: 핑퐁 스토리지 버퍼 위에서 습윤 확산(Wet Diffusion),
 *   가장자리 안료 응집(Coffee-Ring / Backrun), 종이 골짜기 침착(Granulation), Kubelka-Munk 감산 혼색을
 *   수행하는 WebGPU 컴퓨트 셰이더(`cs_watercolor_granulation_step`).
 * - `PHYSICAL_MEDIA_TACTILE_PRESETS`: 연필·목탄·수채화·유화·G펜 5대 매체 실물 감각 기본 프리셋.
 */

import {
  clamp01,
  clampRange,
  type LinearRgbTuple,
  type PaperToothProfileId,
} from "./three-channel-physical-canvas-buffer";

export type TactileMediaPresetId = "pencil" | "charcoal" | "watercolor" | "oil" | "gpen";

export interface PhysicalMediaTactilePreset {
  readonly id: TactileMediaPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly paperProfile: PaperToothProfileId;
  readonly defaultRadiusPx: number;
  readonly opacity: number;
  readonly bristleCount: number;
  readonly wetnessDeposit: number;
  readonly thicknessDeposit: number;
  readonly pickupRate: number;
  readonly reliefStrength: number;
  readonly paperReliefScale: number;
  readonly specularStrength: number;
  readonly specularShininess: number;
  readonly granulationStrength: number;
  readonly backrunEdgeStrength: number;
  readonly contactToothHardness: number;
  readonly slitFlexExponent: number;
  readonly capillaryBleedStrength: number;
  readonly defaultPigmentLinearRgb: LinearRgbTuple;
}

export interface WgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage";
  readonly access: "read" | "read_write";
}

export interface WgslShaderContract {
  readonly shaderId: string;
  readonly entryPoints: readonly string[];
  readonly workgroupSize: readonly [number, number, number];
  readonly uniformFloatCount: number;
  readonly uniformByteLength: number;
  readonly bindings: readonly WgslBindingDescriptor[];
}

export interface WgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly discoveredBindings: readonly number[];
  readonly discoveredEntryPoints: readonly string[];
}

export interface ImpastoReliefUniformInput {
  readonly width: number;
  readonly height: number;
  readonly lightAzimuthDeg?: number;
  readonly lightElevationDeg?: number;
  readonly reliefStrength?: number;
  readonly paperReliefScale?: number;
  readonly ambientStrength?: number;
  readonly diffuseStrength?: number;
  readonly specularStrength?: number;
  readonly specularShininess?: number;
  readonly shadowOcclusionStrength?: number;
  readonly encodeSrgb?: boolean;
  readonly backgroundLinearRgb?: LinearRgbTuple;
}

export interface WatercolorGranulationUniformInput {
  readonly width: number;
  readonly height: number;
  readonly diffusionRate?: number;
  readonly backrunEdgeStrength?: number;
  readonly granulationRate?: number;
  readonly evaporationRate?: number;
  readonly capillaryGain?: number;
  readonly deltaTime?: number;
}

/**
 * 3채널 물리 캔버스 + 종이 결 릴리프 + 측면 광원(Raking Light) 임파스토 합성 WGSL 셰이더.
 * uniform 블록 크기: 16 × f32 = 64 bytes (16-byte 정렬 준수).
 */
export const TACTILE_IMPASTO_RELIEF_WGSL = /* wgsl */ `
struct ImpastoReliefUniforms {
  canvasSize: vec2<f32>,
  lightDirXY: vec2<f32>,
  lightDirZ: f32,
  reliefStrength: f32,
  paperReliefScale: f32,
  ambientStrength: f32,
  diffuseStrength: f32,
  specularStrength: f32,
  specularShininess: f32,
  shadowOcclusionStrength: f32,
  paperBgRgb: vec3<f32>,
  encodeSrgbFlag: f32,
};

@group(0) @binding(0) var<uniform> uParams: ImpastoReliefUniforms;
@group(0) @binding(1) var<storage, read> rgbaLinearField: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> heightField: array<f32>;
@group(0) @binding(3) var<storage, read> wetnessField: array<f32>;
@group(0) @binding(4) var<storage, read> paperToothField: array<f32>;
@group(0) @binding(5) var<storage, read_write> outputComposite: array<vec4<f32>>;

fn clampCoord(coord: vec2<i32>, dims: vec2<i32>) -> vec2<i32> {
  return vec2<i32>(
    clamp(coord.x, 0, dims.x - 1),
    clamp(coord.y, 0, dims.y - 1)
  );
}

fn flatIndex(coord: vec2<i32>, dims: vec2<i32>) -> u32 {
  let c = clampCoord(coord, dims);
  return u32(c.y * dims.x + c.x);
}

fn sampleSurfaceHeight(coord: vec2<i32>, dims: vec2<i32>) -> f32 {
  let idx = flatIndex(coord, dims);
  return heightField[idx] + paperToothField[idx] * uParams.paperReliefScale;
}

fn computeSobelNormal(coord: vec2<i32>, dims: vec2<i32>) -> vec3<f32> {
  let tl = sampleSurfaceHeight(coord + vec2<i32>(-1, -1), dims);
  let tc = sampleSurfaceHeight(coord + vec2<i32>( 0, -1), dims);
  let tr = sampleSurfaceHeight(coord + vec2<i32>( 1, -1), dims);
  let ml = sampleSurfaceHeight(coord + vec2<i32>(-1,  0), dims);
  let mr = sampleSurfaceHeight(coord + vec2<i32>( 1,  0), dims);
  let bl = sampleSurfaceHeight(coord + vec2<i32>(-1,  1), dims);
  let bc = sampleSurfaceHeight(coord + vec2<i32>( 0,  1), dims);
  let br = sampleSurfaceHeight(coord + vec2<i32>( 1,  1), dims);

  let dhdx = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) * 0.25;
  let dhdy = ((bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)) * 0.25;
  return normalize(vec3<f32>(-dhdx * uParams.reliefStrength, -dhdy * uParams.reliefStrength, 1.0));
}

fn linearToSrgb3(c: vec3<f32>) -> vec3<f32> {
  let clamped = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
  let low = clamped * 12.92;
  let high = vec3<f32>(1.055) * pow(clamped, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
  return select(high, low, clamped <= vec3<f32>(0.0031308));
}

fn shadeTactileImpastoPixel(coord: vec2<i32>, dims: vec2<i32>) -> vec4<f32> {
  let idx = flatIndex(coord, dims);
  let pigment = rgbaLinearField[idx];
  let h = heightField[idx];
  let wet = wetnessField[idx];
  let tooth = paperToothField[idx];

  let a = clamp(pigment.a, 0.0, 1.0);
  let paperTint = 0.96 + 0.04 * tooth;
  let baseColor = pigment.rgb * a + (uParams.paperBgRgb * paperTint) * (1.0 - a);

  let normal = computeSobelNormal(coord, dims);
  let lightDir = normalize(vec3<f32>(uParams.lightDirXY.x, uParams.lightDirXY.y, uParams.lightDirZ));
  let halfVec = normalize(lightDir + vec3<f32>(0.0, 0.0, 1.0));

  let centerSurface = h + tooth * uParams.paperReliefScale;
  var maxExcess: f32 = 0.0;
  for (var step: i32 = 1; step <= 4; step = step + 1) {
    let fStep = f32(step);
    let samplePos = coord + vec2<i32>(
      i32(round(lightDir.x * fStep * 1.45)),
      i32(round(lightDir.y * fStep * 1.45))
    );
    let upstreamH = sampleSurfaceHeight(samplePos, dims);
    let rayH = centerSurface + fStep * lightDir.z * 0.45;
    maxExcess = max(maxExcess, upstreamH - rayH);
  }

  let shadowFactor = 1.0 - clamp(maxExcess * 1.8, 0.0, 1.0) * uParams.shadowOcclusionStrength;
  let flatDiffuse = max(0.05, lightDir.z);
  let nDotL = max(0.0, dot(normal, lightDir));
  let normDiffuse = nDotL / flatDiffuse;
  let lightingGain = (uParams.ambientStrength + uParams.diffuseStrength * normDiffuse * shadowFactor) /
    max(0.001, uParams.ambientStrength + uParams.diffuseStrength);

  let glossMask = clamp(a * (0.28 + 0.72 * clamp(h * 1.6 + wet * 0.55, 0.0, 1.0)), 0.0, 1.0);
  let effShininess = uParams.specularShininess * (0.7 + 0.65 * wet);
  let spec = pow(max(0.0, dot(normal, halfVec)), effShininess) * uParams.specularStrength * glossMask * shadowFactor;

  let litLinear = clamp(baseColor * lightingGain + vec3<f32>(spec), vec3<f32>(0.0), vec3<f32>(1.0));
  let finalRgb = select(litLinear, linearToSrgb3(litLinear), uParams.encodeSrgbFlag > 0.5);
  return vec4<f32>(finalRgb, 1.0);
}

@compute @workgroup_size(8, 8, 1)
fn cs_tactile_impasto_relief(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uParams.canvasSize.x), i32(uParams.canvasSize.y));
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  if (coord.x >= dims.x || coord.y >= dims.y) {
    return;
  }
  let idx = flatIndex(coord, dims);
  outputComposite[idx] = shadeTactileImpastoPixel(coord, dims);
}

struct FullscreenVertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_fullscreen_quad(@builtin(vertex_index) vid: u32) -> FullscreenVertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0),
    vec2<f32>( 3.0,  1.0),
    vec2<f32>(-1.0,  1.0)
  );
  let pos = positions[vid];
  var out: FullscreenVertexOut;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = vec2<f32>(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
  return out;
}

@fragment
fn fs_tactile_impasto_relief(in: FullscreenVertexOut) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(i32(uParams.canvasSize.x), i32(uParams.canvasSize.y));
  let coord = vec2<i32>(
    i32(floor(in.uv.x * uParams.canvasSize.x)),
    i32(floor(in.uv.y * uParams.canvasSize.y))
  );
  return shadeTactileImpastoPixel(coord, dims);
}
`;

/**
 * 수채화 종이 골짜기 침착(Granulation) + 가장자리 안료 응집(Coffee-Ring / Backrun) +
 * 습윤 확산(Wet Diffusion) WebGPU 핑퐁 컴퓨트 WGSL 셰이더.
 * uniform 블록 크기: 8 × f32 = 32 bytes (16-byte 정렬 준수).
 */
export const WATERCOLOR_GRANULATION_WGSL = /* wgsl */ `
struct WatercolorSimUniforms {
  canvasSize: vec2<f32>,
  diffusionRate: f32,
  backrunEdgeStrength: f32,
  granulationRate: f32,
  evaporationRate: f32,
  capillaryGain: f32,
  deltaTime: f32,
};

@group(0) @binding(0) var<uniform> uSim: WatercolorSimUniforms;
@group(0) @binding(1) var<storage, read> rgbaIn: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> wetnessIn: array<f32>;
@group(0) @binding(3) var<storage, read> paperToothField: array<f32>;
@group(0) @binding(4) var<storage, read_write> rgbaOut: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> wetnessOut: array<f32>;

fn wcIndex(x: i32, y: i32, dims: vec2<i32>) -> u32 {
  let cx = clamp(x, 0, dims.x - 1);
  let cy = clamp(y, 0, dims.y - 1);
  return u32(cy * dims.x + cx);
}

fn kmReflectanceToKS(r: vec3<f32>) -> vec3<f32> {
  let safeR = clamp(r, vec3<f32>(0.002), vec3<f32>(0.999));
  let inv = vec3<f32>(1.0) - safeR;
  return (inv * inv) / (2.0 * safeR);
}

fn kmKSToReflectance(ks: vec3<f32>) -> vec3<f32> {
  let safeKs = max(ks, vec3<f32>(0.0));
  return clamp(vec3<f32>(1.0) + safeKs - sqrt(safeKs * safeKs + 2.0 * safeKs), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn kmMixRgb(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
  let ks = mix(kmReflectanceToKS(a), kmReflectanceToKS(b), clamp(t, 0.0, 1.0));
  return kmKSToReflectance(ks);
}

@compute @workgroup_size(8, 8, 1)
fn cs_watercolor_granulation_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(i32(uSim.canvasSize.x), i32(uSim.canvasSize.y));
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= dims.x || y >= dims.y) {
    return;
  }

  let idx = wcIndex(x, y, dims);
  let centerRgba = rgbaIn[idx];
  let centerWet = wetnessIn[idx];
  let centerTooth = paperToothField[idx];

  if (centerWet <= 0.01) {
    rgbaOut[idx] = centerRgba;
    wetnessOut[idx] = centerWet;
    return;
  }

  let idxL = wcIndex(x - 1, y, dims);
  let idxR = wcIndex(x + 1, y, dims);
  let idxU = wcIndex(x, y - 1, dims);
  let idxD = wcIndex(x, y + 1, dims);

  let wL = wetnessIn[idxL];
  let wR = wetnessIn[idxR];
  let wU = wetnessIn[idxU];
  let wD = wetnessIn[idxD];

  let cL = rgbaIn[idxL];
  let cR = rgbaIn[idxR];
  let cU = rgbaIn[idxU];
  let cD = rgbaIn[idxD];

  let tL = paperToothField[idxL];
  let tR = paperToothField[idxR];
  let tU = paperToothField[idxU];
  let tD = paperToothField[idxD];

  // [1] 습윤 확산(Wet Diffusion) 및 Kubelka-Munk 감산 색 전이
  var mixedRgb = centerRgba.rgb;
  let sharedL = min(centerWet, wL) * step(0.005, cL.a);
  let sharedR = min(centerWet, wR) * step(0.005, cR.a);
  let sharedU = min(centerWet, wU) * step(0.005, cU.a);
  let sharedD = min(centerWet, wD) * step(0.005, cD.a);

  let diffScale = uSim.diffusionRate * uSim.deltaTime * 0.25;
  mixedRgb = kmMixRgb(mixedRgb, cL.rgb, sharedL * diffScale);
  mixedRgb = kmMixRgb(mixedRgb, cR.rgb, sharedR * diffScale);
  mixedRgb = kmMixRgb(mixedRgb, cU.rgb, sharedU * diffScale);
  mixedRgb = kmMixRgb(mixedRgb, cD.rgb, sharedD * diffScale);

  // [2] 가장자리 안료 응집(Coffee-Ring / Backrun Edge Darkening): 습도 기울기가 높은 경계에 농축
  let minNeighborWet = min(min(wL, wR), min(wU, wD));
  let maxNeighborWet = max(max(wL, wR), max(wU, wD));
  let wetLaplacian = (wL + wR + wU + wD) * 0.25 - centerWet;
  let edgeProximity = clamp((centerWet - minNeighborWet) * uSim.capillaryGain, 0.0, 1.0);
  let inflowFromInterior = clamp((maxNeighborWet - centerWet) * uSim.capillaryGain, 0.0, 1.0);

  let avgNeighborAlpha = (cL.a + cR.a + cU.a + cD.a) * 0.25;
  let backrunDelta =
    (edgeProximity * 0.65 + inflowFromInterior * 0.35) * uSim.backrunEdgeStrength * centerWet * avgNeighborAlpha * uSim.deltaTime
    - (1.0 - edgeProximity) * uSim.backrunEdgeStrength * 0.14 * centerWet * centerRgba.a * uSim.deltaTime;

  // [3] 종이 골짜기 침착(Granulation): 주변 평균보다 낮은 골짜기에 안료가 침강
  let avgNeighborTooth = (tL + tR + tU + tD) * 0.25;
  let valleyDepth = avgNeighborTooth - centerTooth;
  let granulationDelta = valleyDepth * uSim.granulationRate * centerWet * centerRgba.a * uSim.deltaTime;

  let nextAlpha = clamp(centerRgba.a + backrunDelta + granulationDelta, 0.0, 1.0);
  let edgeEvap = uSim.evaporationRate * (1.0 + edgeProximity * 0.85) * uSim.deltaTime;
  let nextWet = clamp(centerWet + wetLaplacian * uSim.diffusionRate * 0.5 * uSim.deltaTime - edgeEvap, 0.0, 1.0);

  rgbaOut[idx] = vec4<f32>(mixedRgb, nextAlpha);
  wetnessOut[idx] = nextWet;
}
`;

export const WGSL_TACTILE_BINDING_CONTRACTS: Readonly<{
  readonly impastoRelief: WgslShaderContract;
  readonly watercolorGranulation: WgslShaderContract;
}> = {
  impastoRelief: {
    shaderId: "tactile-impasto-relief",
    entryPoints: ["cs_tactile_impasto_relief", "vs_fullscreen_quad", "fs_tactile_impasto_relief"],
    workgroupSize: [8, 8, 1],
    uniformFloatCount: 16,
    uniformByteLength: 64,
    bindings: [
      { group: 0, binding: 0, name: "uParams", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "rgbaLinearField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "heightField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "wetnessField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 4, name: "paperToothField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 5, name: "outputComposite", addressSpace: "storage", access: "read_write" },
    ],
  },
  watercolorGranulation: {
    shaderId: "watercolor-granulation",
    entryPoints: ["cs_watercolor_granulation_step"],
    workgroupSize: [8, 8, 1],
    uniformFloatCount: 8,
    uniformByteLength: 32,
    bindings: [
      { group: 0, binding: 0, name: "uSim", addressSpace: "uniform", access: "read" },
      { group: 0, binding: 1, name: "rgbaIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 2, name: "wetnessIn", addressSpace: "storage", access: "read" },
      { group: 0, binding: 3, name: "paperToothField", addressSpace: "storage", access: "read" },
      { group: 0, binding: 4, name: "rgbaOut", addressSpace: "storage", access: "read_write" },
      { group: 0, binding: 5, name: "wetnessOut", addressSpace: "storage", access: "read_write" },
    ],
  },
};

/**
 * 5대 실물 매체 고감도 기본 프리셋.
 * 스튜디오 브러시 드로어와 WebGPU 릴리프 패스가 동일한 물리 파라미터를 참조한다.
 */
export const PHYSICAL_MEDIA_TACTILE_PRESETS: Readonly<
  Record<TactileMediaPresetId, PhysicalMediaTactilePreset>
> = {
  pencil: {
    id: "pencil",
    labelKo: "흑연 연필 (2B~4B)",
    summaryKo: "약한 필압엔 종이 봉우리만 긁히고, 틸트 시 넓은 음영과 흑연 광택이 살아납니다.",
    paperProfile: "hot-press-smooth",
    defaultRadiusPx: 4.5,
    opacity: 0.84,
    bristleCount: 32,
    wetnessDeposit: 0,
    thicknessDeposit: 0.04,
    pickupRate: 0.08,
    reliefStrength: 1.4,
    paperReliefScale: 0.24,
    specularStrength: 0.22,
    specularShininess: 24,
    granulationStrength: 0,
    backrunEdgeStrength: 0,
    contactToothHardness: 0.46,
    slitFlexExponent: 1.4,
    capillaryBleedStrength: 0,
    defaultPigmentLinearRgb: [0.055, 0.058, 0.064],
  },
  charcoal: {
    id: "charcoal",
    labelKo: "목탄 스틱 (버드나무)",
    summaryKo: "거친 레드지 골 결이 강하게 드러나며 무광 벨벳 질감으로 깊게 쌓입니다.",
    paperProfile: "laid-charcoal",
    defaultRadiusPx: 9.0,
    opacity: 0.92,
    bristleCount: 36,
    wetnessDeposit: 0,
    thicknessDeposit: 0.07,
    pickupRate: 0.22,
    reliefStrength: 1.9,
    paperReliefScale: 0.32,
    specularStrength: 0.03,
    specularShininess: 10,
    granulationStrength: 0.15,
    backrunEdgeStrength: 0,
    contactToothHardness: 0.16,
    slitFlexExponent: 1.3,
    capillaryBleedStrength: 0,
    defaultPigmentLinearRgb: [0.022, 0.021, 0.02],
  },
  watercolor: {
    id: "watercolor",
    labelKo: "투명 수채화 (코튼 중목)",
    summaryKo: "안료가 종이 골짜기에 침착하고 습윤 경계에 진한 백런 테두리가 맺힙니다.",
    paperProfile: "cold-press-watercolor",
    defaultRadiusPx: 14.0,
    opacity: 0.46,
    bristleCount: 44,
    wetnessDeposit: 0.9,
    thicknessDeposit: 0.02,
    pickupRate: 0.48,
    reliefStrength: 1.15,
    paperReliefScale: 0.28,
    specularStrength: 0.14,
    specularShininess: 48,
    granulationStrength: 0.72,
    backrunEdgeStrength: 0.48,
    contactToothHardness: 0.2,
    slitFlexExponent: 1.2,
    capillaryBleedStrength: 0.3,
    defaultPigmentLinearRgb: [0.025, 0.14, 0.62],
  },
  oil: {
    id: "oil",
    labelKo: "임파스토 유화 (돈모 평붓)",
    summaryKo: "52가닥 붓모가 젖은 물감을 끌고 가며 측면 광원에 반응하는 두꺼운 붓결 이랑을 세웁니다.",
    paperProfile: "linen-canvas",
    defaultRadiusPx: 12.0,
    opacity: 0.9,
    bristleCount: 52,
    wetnessDeposit: 0.84,
    thicknessDeposit: 0.62,
    pickupRate: 0.56,
    reliefStrength: 3.8,
    paperReliefScale: 0.14,
    specularStrength: 0.54,
    specularShininess: 42,
    granulationStrength: 0.12,
    backrunEdgeStrength: 0,
    contactToothHardness: 0.3,
    slitFlexExponent: 1.3,
    capillaryBleedStrength: 0,
    defaultPigmentLinearRgb: [0.78, 0.46, 0.035],
  },
  gpen: {
    id: "gpen",
    labelKo: "만화 G펜 (강철 슬릿 닙)",
    summaryKo: "필압 임계점에서 닙이 탄성 있게 벌어지며 날카로운 진입·이탈과 미세 모세관 번짐을 만듭니다.",
    paperProfile: "comic-bristol",
    defaultRadiusPx: 3.2,
    opacity: 0.98,
    bristleCount: 32,
    wetnessDeposit: 0.2,
    thicknessDeposit: 0.04,
    pickupRate: 0.04,
    reliefStrength: 0.85,
    paperReliefScale: 0.08,
    specularStrength: 0.16,
    specularShininess: 64,
    granulationStrength: 0,
    backrunEdgeStrength: 0.08,
    contactToothHardness: 0.88,
    slitFlexExponent: 1.78,
    capillaryBleedStrength: 0.4,
    defaultPigmentLinearRgb: [0.012, 0.013, 0.016],
  },
};

/**
 * `ImpastoReliefUniforms` 구조체와 1:1 매핑되는 16-byte 정렬 `Float32Array(16)`(64 bytes)를 패킹한다.
 */
export function packImpastoReliefUniforms(input: ImpastoReliefUniformInput): Float32Array {
  const azimuthRad = ((input.lightAzimuthDeg ?? 315) * Math.PI) / 180;
  const elevationRad = (clampRange(input.lightElevationDeg ?? 24, 5, 85) * Math.PI) / 180;
  const cosElev = Math.cos(elevationRad);
  const bg = input.backgroundLinearRgb ?? [0.94, 0.915, 0.855];

  const data = new Float32Array(16);
  data[0] = Math.max(1, Math.floor(input.width));
  data[1] = Math.max(1, Math.floor(input.height));
  data[2] = Math.cos(azimuthRad) * cosElev;
  data[3] = Math.sin(azimuthRad) * cosElev;
  data[4] = Math.sin(elevationRad);
  data[5] = Math.max(0.05, input.reliefStrength ?? 3.4);
  data[6] = Math.max(0, input.paperReliefScale ?? 0.14);
  data[7] = clampRange(input.ambientStrength ?? 0.42, 0.05, 0.95);
  data[8] = clampRange(input.diffuseStrength ?? 0.78, 0.05, 1.5);
  data[9] = clampRange(input.specularStrength ?? 0.48, 0, 2);
  data[10] = clampRange(input.specularShininess ?? 36, 4, 160);
  data[11] = clampRange(input.shadowOcclusionStrength ?? 0.45, 0, 0.95);
  data[12] = clamp01(bg[0]);
  data[13] = clamp01(bg[1]);
  data[14] = clamp01(bg[2]);
  data[15] = input.encodeSrgb === false ? 0 : 1;
  return data;
}

/**
 * `WatercolorSimUniforms` 구조체와 1:1 매핑되는 16-byte 정렬 `Float32Array(8)`(32 bytes)를 패킹한다.
 */
export function packWatercolorGranulationUniforms(
  input: WatercolorGranulationUniformInput,
): Float32Array {
  const data = new Float32Array(8);
  data[0] = Math.max(1, Math.floor(input.width));
  data[1] = Math.max(1, Math.floor(input.height));
  data[2] = clampRange(input.diffusionRate ?? 0.24, 0, 0.45);
  data[3] = clampRange(input.backrunEdgeStrength ?? 0.46, 0, 0.95);
  data[4] = clampRange(input.granulationRate ?? 0.38, 0, 0.9);
  data[5] = clampRange(input.evaporationRate ?? 0.035, 0, 0.35);
  data[6] = clampRange(input.capillaryGain ?? 2.2, 0.2, 6);
  data[7] = clampRange(input.deltaTime ?? 1.0, 0.05, 2);
  return data;
}

/**
 * WGSL 셰이더 소스의 괄호 균형, 바인딩 선언, 워크그룹 크기 및 진입점 계약을 정적으로 검증한다.
 */
export function validateWgslShaderContract(
  source: string,
  contract: WgslShaderContract,
): WgslValidationResult {
  const errors: string[] = [];

  // 주석 제거 후 괄호 균형 검증 (ES2017 호환: /s 플래그 대신 [\s\S] 사용)
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      errors.push("WGSL 괄호 깊이가 음수로 떨어졌습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 불균형: depth=${braceDepth}`);
  if (parenDepth !== 0) errors.push(`소괄호 불균형: depth=${parenDepth}`);

  if (contract.uniformByteLength % 16 !== 0) {
    errors.push(`Uniform 블록 바이트(${contract.uniformByteLength})는 16의 배수여야 합니다.`);
  }

  // 바인딩 추출
  const bindingRegex = /@group\((\d+)\)\s+@binding\((\d+)\)\s+var<(uniform|storage)(?:,\s*(read|read_write))?>\s+(\w+)/g;
  const discoveredBindings: number[] = [];
  const bindingMap = new Map<string, { space: string; access: string; name: string }>();
  let match: RegExpExecArray | null = bindingRegex.exec(source);
  while (match !== null) {
    const grp = Number(match[1]);
    const bnd = Number(match[2]);
    const space = match[3];
    const access = match[4] ?? "read";
    const name = match[5];
    discoveredBindings.push(bnd);
    bindingMap.set(`${grp}:${bnd}`, { space, access, name });
    match = bindingRegex.exec(source);
  }

  for (let i = 0; i < contract.bindings.length; i += 1) {
    const expected = contract.bindings[i];
    const actual = bindingMap.get(`${expected.group}:${expected.binding}`);
    if (!actual) {
      errors.push(`필수 바인딩 누락: @group(${expected.group}) @binding(${expected.binding}) ${expected.name}`);
      continue;
    }
    if (actual.name !== expected.name) {
      errors.push(`바인딩 이름 불일치(@binding(${expected.binding})): ${actual.name} !== ${expected.name}`);
    }
    if (actual.space !== expected.addressSpace || actual.access !== expected.access) {
      errors.push(
        `바인딩 접근 속성 불일치(${expected.name}): ${actual.space}/${actual.access} !== ${expected.addressSpace}/${expected.access}`,
      );
    }
  }

  // 진입점 및 워크그룹 크기 검증
  const discoveredEntryPoints: string[] = [];
  const fnRegex = /@(?:compute|vertex|fragment)[\s\S]*?fn\s+(\w+)\s*\(/g;
  let fnMatch: RegExpExecArray | null = fnRegex.exec(source);
  while (fnMatch !== null) {
    discoveredEntryPoints.push(fnMatch[1]);
    fnMatch = fnRegex.exec(source);
  }

  for (let i = 0; i < contract.entryPoints.length; i += 1) {
    const entry = contract.entryPoints[i];
    if (!source.includes(`fn ${entry}(`)) {
      errors.push(`필수 진입점 함수 누락: ${entry}`);
    }
  }

  const [wx, wy, wz] = contract.workgroupSize;
  const expectedWorkgroup = `@workgroup_size(${wx}, ${wy}, ${wz})`;
  if (!source.includes(expectedWorkgroup)) {
    errors.push(`워크그룹 크기 선언 누락: ${expectedWorkgroup}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    discoveredBindings,
    discoveredEntryPoints,
  };
}
