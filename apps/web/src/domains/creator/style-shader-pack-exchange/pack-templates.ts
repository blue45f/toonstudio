/**
 * 팀 화풍 · 브러시 · WGSL 셰이더 팩 사전 구축 스튜디오 템플릿 3종 (외부 네트워크 호출 0건 · 0바이트).
 *
 * - 로맨스 판타지 수채 셀 팩 (`romance-fantasy-watercolor-cel`, 상업 팀 라이선스)
 * - 액션 누아르 잉크 팩 (`action-noir-ink`, 상업 엔터프라이즈 라이선스)
 * - 일상 파스텔 아틀리에 팩 (`slice-of-life-pastel-atelier`, 비상업 에디토리얼 라이선스)
 */

import {
  WGSL_UNIFORM_BYTE_LENGTH,
  type CreateTeamStylePackInput,
  type ExistingStudioPresetIndex,
  type TeamStylePackTemplateId,
} from "./types";

export interface TeamStylePackTemplateMeta {
  readonly id: TeamStylePackTemplateId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly genreKo: string;
  readonly genreEn: string;
  readonly teamHandle: string;
}

export const TEAM_STYLE_PACK_TEMPLATE_META: readonly TeamStylePackTemplateMeta[] = Object.freeze([
  { id: "romance-fantasy-watercolor-cel", nameKo: "로맨스 판타지 수채 셀 팩", nameEn: "Romance Fantasy Watercolor Cel Pack", genreKo: "로맨스 판타지", genreEn: "Romance Fantasy", teamHandle: "@team-lumiere-rofan" },
  { id: "action-noir-ink", nameKo: "액션 누아르 잉크 팩", nameEn: "Action Noir Ink Pack", genreKo: "액션 누아르", genreEn: "Action Noir", teamHandle: "@team-kuro-ink" },
  { id: "slice-of-life-pastel-atelier", nameKo: "일상 파스텔 아틀리에 팩", nameEn: "Slice-of-Life Pastel Atelier Pack", genreKo: "일상 · 힐링", genreEn: "Slice of Life", teamHandle: "@team-afternoon-atelier" },
]);

/** 충돌 안전 불러오기 시뮬레이션용 기본 로컬 스튜디오 프리셋 인덱스. */
export const DEFAULT_STUDIO_EXISTING_PRESETS: ExistingStudioPresetIndex = Object.freeze({
  styleDnaSeriesIds: Object.freeze(["series-rofan-chateau", "series-studio-default"]),
  brushIds: Object.freeze(["brush-rofan-gpen-silk", "brush-noir-elastic-ink", "brush-atelier-pencil-6b"]),
  shaderIds: Object.freeze(["shader-rofan-watercolor-rim", "shader-noir-halftone-compute"]),
});

const WGSL_UNIFORM_HEADER = `struct NoCodeShaderUniforms {
  style_and_light: vec4<f32>,
  key_color: vec4<f32>,
  rim_color: vec4<f32>,
  shadow_color: vec4<f32>,
  accent_color: vec4<f32>,
  params_a: vec4<f32>,
};`;

const WGSL_FRAGMENT_PREAMBLE = `${WGSL_UNIFORM_HEADER}
@group(0) @binding(0) var<uniform> params: NoCodeShaderUniforms;
@group(0) @binding(1) var src_tex: texture_2d<f32>;
@group(0) @binding(2) var src_sampler: sampler;
struct VertexOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, };
@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out_v: VertexOut;
  let p = positions[vid];
  out_v.pos = vec4<f32>(p, 0.0, 1.0);
  out_v.uv = p * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out_v;
}`;

const WGSL_COMPUTE_PREAMBLE = `${WGSL_UNIFORM_HEADER}
@group(0) @binding(0) var<uniform> params: NoCodeShaderUniforms;
@group(0) @binding(1) var src_tex: texture_2d<f32>;
@group(0) @binding(2) var dst_tex: texture_storage_2d<rgba8unorm, write>;`;

const WGSL_ROFAN_WATERCOLOR_FRAGMENT = `${WGSL_FRAGMENT_PREAMBLE}
@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let src = textureSample(src_tex, src_sampler, in.uv);
  let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let grain = fract(sin(dot(in.uv * params.params_a.x, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  let lit = mix(params.shadow_color.rgb, src.rgb * params.key_color.rgb, clamp(luma + 0.14, 0.0, 1.0));
  let rim = smoothstep(0.62, 0.96, luma) * params.rim_color.rgb * params.style_and_light.w;
  let wash = lit + rim + vec3<f32>((grain - 0.5) * 0.045 * params.params_a.z);
  return vec4<f32>(clamp(wash, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
`;

const WGSL_ROFAN_CEL_COMPUTE = `${WGSL_COMPUTE_PREAMBLE}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(src_tex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let src = textureLoad(src_tex, coord, 0);
  let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let cel = mix(params.shadow_color.rgb, src.rgb * params.key_color.rgb, smoothstep(0.42, 0.56, luma));
  let bloom = params.accent_color.rgb * smoothstep(0.76, 0.98, luma) * params.style_and_light.z * 0.28;
  textureStore(dst_tex, coord, vec4<f32>(clamp(cel + bloom, vec3<f32>(0.0), vec3<f32>(1.0)), src.a));
}
`;

const WGSL_NOIR_HALFTONE_COMPUTE = `${WGSL_COMPUTE_PREAMBLE}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(src_tex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(f32(dims.x), f32(dims.y));
  let src = textureLoad(src_tex, coord, 0);
  let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let cell = fract(uv * max(params.params_a.y, 18.0)) - vec2<f32>(0.5);
  let dot_radius = clamp(0.45 - luma * 0.36, 0.06, 0.44);
  let dot_mask = 1.0 - smoothstep(dot_radius - 0.05, dot_radius + 0.05, length(cell));
  let ink = mix(params.shadow_color.rgb, params.key_color.rgb * src.rgb, smoothstep(0.32, 0.38, luma));
  let accented = mix(ink, params.accent_color.rgb, dot_mask * 0.32 * params.style_and_light.z);
  textureStore(dst_tex, coord, vec4<f32>(clamp(accented, vec3<f32>(0.0), vec3<f32>(1.0)), src.a));
}
`;

const WGSL_NOIR_MOONLIT_FRAGMENT = `${WGSL_FRAGMENT_PREAMBLE}
@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let src = textureSample(src_tex, src_sampler, in.uv);
  let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let hard_cel = select(params.shadow_color.rgb, src.rgb * params.key_color.rgb, luma > 0.44);
  let back_rim = params.rim_color.rgb * smoothstep(0.70, 0.94, luma) * params.style_and_light.w;
  return vec4<f32>(clamp(hard_cel + back_rim, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
`;

const WGSL_ATELIER_PENCIL_FRAGMENT = `${WGSL_FRAGMENT_PREAMBLE}
@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let src = textureSample(src_tex, src_sampler, in.uv);
  let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let hatch = 0.5 + 0.5 * sin((in.uv.x * 84.0 + in.uv.y * 52.0) * max(params.params_a.x, 1.0));
  let shade = mix(params.shadow_color.rgb, src.rgb * params.key_color.rgb, clamp(luma + 0.18, 0.0, 1.0));
  let paper_hatch = shade - vec3<f32>((1.0 - luma) * hatch * 0.09 * params.params_a.z);
  return vec4<f32>(clamp(paper_hatch, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
`;

const WGSL_ATELIER_GRAIN_COMPUTE = `${WGSL_COMPUTE_PREAMBLE}
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(src_tex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let uv = vec2<f32>(f32(gid.x), f32(gid.y)) / vec2<f32>(f32(dims.x), f32(dims.y));
  let src = textureLoad(src_tex, coord, 0);
  let noise = fract(sin(dot(uv * 192.0 + vec2<f32>(params.params_a.w), vec2<f32>(12.9898, 78.233))) * 43758.5453);
  let warm = src.rgb * params.key_color.rgb + vec3<f32>((noise - 0.5) * 0.04 * params.style_and_light.z);
  textureStore(dst_tex, coord, vec4<f32>(clamp(warm, vec3<f32>(0.0), vec3<f32>(1.0)), src.a));
}
`;

/** 3종의 현실적인 스튜디오 팀 팩 입력 정의를 결정론적으로 생성한다. */
export function buildTeamStylePackTemplateInputs(
  hashHex: (input: string) => string,
): Readonly<Record<TeamStylePackTemplateId, CreateTeamStylePackInput>> {
  const rofan: CreateTeamStylePackInput = {
    metadata: {
      packId: "pack-romance-fantasy-watercolor-cel",
      slug: "romance-fantasy-watercolor-cel",
      nameKo: "로맨스 판타지 수채 셀 팩",
      nameEn: "Romance Fantasy Watercolor Cel Pack",
      version: "2.4.0",
      summaryKo: "따뜻한 샴페인 광원과 섬세한 실크 선화, 16파장 수채 글레이즈를 하나로 묶은 팀 화풍 팩",
      summaryEn: "Team style pack pairing warm champagne rim light, silk G-pen linework, and 16-band watercolor glazing",
      genreTag: "romance-fantasy",
      createdAtIso: "2026-10-18T09:00:00.000Z",
      updatedAtIso: "2026-11-20T11:30:00.000Z",
      tags: ["로판", "수채셀", "따뜻한림광", "팀표준"],
    },
    styleDna: {
      seriesId: "series-rofan-chateau",
      seriesTitle: "장미 정원의 계약 공작가",
      artistName: "뤼미에르 작화팀",
      version: 6,
      sampleCount: 48,
      updatedAtIso: "2026-11-20T11:30:00.000Z",
      dnaFingerprint: hashHex("style-dna:series-rofan-chateau:v6").slice(0, 16),
      linework: {
        meanPx: 1.65, medianPx: 1.5, p10Px: 0.9, p90Px: 2.45, stdDevPx: 0.48,
        inkCoverageRatio: 0.084, taperVarianceRatio: 0.74, sampledLinePixels: 18420,
        histogram: { hairlineCount: 6820, mediumCount: 8340, boldCount: 2710, heavyCount: 550 },
      },
      dominantPalette: [
        { L: 0.942, C: 0.024, H: 48.5, share: 0.34, role: "base", cssOklch: "oklch(0.942 0.024 48.5)" },
        { L: 0.798, C: 0.072, H: 22.4, share: 0.26, role: "midtone", cssOklch: "oklch(0.798 0.072 22.4)" },
        { L: 0.448, C: 0.068, H: 318.2, share: 0.19, role: "shadow", cssOklch: "oklch(0.448 0.068 318.2)" },
        { L: 0.968, C: 0.036, H: 84.0, share: 0.12, role: "highlight", cssOklch: "oklch(0.968 0.036 84.0)" },
        { L: 0.672, C: 0.158, H: 14.8, share: 0.09, role: "accent", cssOklch: "oklch(0.672 0.158 14.8)" },
      ],
      shadowTemperature: {
        meanLightness: 0.448, meanChroma: 0.068, meanHueDeg: 318.2, meanA: 0.051, meanB: -0.045,
        coolWarmIndex: 0.28, estimatedKelvin: 4350, highlightMeanLightness: 0.955, highlightMeanHueDeg: 78.4,
        shadowPixelRatio: 0.215, cssOklch: "oklch(0.448 0.068 318.2)",
      },
      contrast: {
        p05L: 0.26, p25L: 0.54, p50L: 0.78, p75L: 0.89, p95L: 0.97,
        dynamicRange: 0.71, midtoneContrast: 0.35, rmsContrast: 0.184, detectedToneSteps: 4,
      },
      screentone: {
        coverageRatio: 0.14, meanDotDensity: 0.19, alternatingRateX: 0.08, alternatingRateY: 0.07,
        estimatedLpiFrequency: 42, patternKind: "soft-grain",
      },
    },
    brushes: [
      {
        id: "brush-rofan-gpen-silk", nameKo: "실크 라인 G펜", nameEn: "Silk Line G-Pen",
        baseCatalogUid: "csp-atelier:gpen-silk", tipId: "gpen-nib-elastic", paperTextureId: "manga-kent",
        mediaCategory: "gpen-ink", radiusPx: 7.5, spacingRatio: 0.09, flow01: 0.95, opacity01: 0.98,
        paperGrainStrength01: 0.12, dryOutRate01: 0.14, initialPaintLoad01: 0.96, initialMoisture01: 0.22,
        kmMixStrength01: 0.14, wetEdgeBloom01: 0.05, taper01: 0.86,
        primaryColor: { r: 62, g: 38, b: 54 }, underlayerColor: { r: 248, g: 236, b: 226 }, seed: 202611,
      },
      {
        id: "brush-rofan-sable-wash", nameKo: "세이블 수채 글레이즈", nameEn: "Sable Watercolor Glaze",
        baseCatalogUid: "global-master:sable-wash", tipId: "sable-watercolor", paperTextureId: "cold-press-watercolor",
        mediaCategory: "watercolor", radiusPx: 18, spacingRatio: 0.14, flow01: 0.74, opacity01: 0.82,
        paperGrainStrength01: 0.62, dryOutRate01: 0.56, initialPaintLoad01: 0.84, initialMoisture01: 0.9,
        kmMixStrength01: 0.94, wetEdgeBloom01: 0.72, taper01: 0.42,
        primaryColor: { r: 214, g: 112, b: 128 }, underlayerColor: { r: 248, g: 222, b: 168 }, seed: 202612,
      },
    ],
    shaders: [
      {
        id: "shader-rofan-watercolor-rim", nameKo: "수채 종이 웜 림라이트", nameEn: "Watercolor Paper Warm Rim Light",
        promptKo: "따뜻한 샴페인 수채화 종이 림라이트 글레이즈", promptEn: "warm champagne watercolor paper rim light glaze",
        stage: "fragment", style: "watercolor-paper", lighting: "warm-rim",
        uniforms: {
          styleId: 1, lightingId: 1, keyColor: { r: 0.96, g: 0.88, b: 0.82 }, rimColor: { r: 1, g: 0.89, b: 0.64 },
          shadowColor: { r: 0.37, g: 0.27, b: 0.39 }, accentColor: { r: 0.92, g: 0.46, b: 0.52 },
          intensity: 0.78, rimStrength: 0.72, shadowFloor: 0.24, saturationBoost: 0.14,
          grainScale: 160, patternParam: 14, reliefStrength: 0.42, seedNorm: 0.24, uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
        },
        wgslSource: WGSL_ROFAN_WATERCOLOR_FRAGMENT,
      },
      {
        id: "shader-rofan-cel-bloom", nameKo: "로판 2단 셀 광채 패스", nameEn: "Rofan 2-Step Cel Bloom Pass",
        promptKo: "부드러운 2단 셀 음영과 샴페인 하이라이트 글로우", promptEn: "soft 2-step cel shadow with champagne highlight bloom",
        stage: "compute", style: "cel-2step", lighting: "warm-rim",
        uniforms: {
          styleId: 4, lightingId: 1, keyColor: { r: 0.98, g: 0.93, b: 0.88 }, rimColor: { r: 0.99, g: 0.9, b: 0.68 },
          shadowColor: { r: 0.41, g: 0.3, b: 0.42 }, accentColor: { r: 0.96, g: 0.62, b: 0.68 },
          intensity: 0.66, rimStrength: 0.58, shadowFloor: 0.28, saturationBoost: 0.1,
          grainScale: 96, patternParam: 8, reliefStrength: 0.22, seedNorm: 0.41, uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
        },
        wgslSource: WGSL_ROFAN_CEL_COMPUTE,
      },
    ],
    rightsBom: {
      ownerTeamHandle: "@team-lumiere-rofan", ownerTeamName: "뤼미에르 로판 스튜디오",
      licenseTier: "commercial-team", commercialUseAllowed: true, redistributionAllowed: true,
      attributionRequired: true, territoryScope: "global",
      royaltySplits: [
        { handle: "@sol-artdir", displayName: "서솔 (아트 디렉터)", role: "lead-artist", shareBps: 5500 },
        { handle: "@yuna-color", displayName: "최유나 (컬러 스크립트)", role: "color-director", shareBps: 2500 },
        { handle: "@minho-wgsl", displayName: "강민호 (셰이더 TD)", role: "shader-td", shareBps: 2000 },
      ],
      provenance: [
        { assetId: "prov-rofan-coldpress-paper", title: "콜드프레스 코튼 수채지 128px 높이맵", sourceKind: "original-inhouse", licenseSpdx: "Proprietary-Studio", attributionText: "뤼미에르 로판 스튜디오 자체 스캔 원본", commercialCleared: true, originHashSha256: hashHex("prov-rofan-coldpress-paper:v2") },
        { assetId: "prov-km16-kubelka-kernel", title: "16파장 Kubelka-Munk 안료 혼색 계수 테이블", sourceKind: "mit-oss-kernel", licenseSpdx: "MIT", attributionText: "ToonStudio Open Pigment Kernel (MIT)", commercialCleared: true, originHashSha256: hashHex("prov-km16-kubelka-kernel:v1") },
      ],
      auditNote: "상업 연재 및 팀 어시스턴트 배포 권한 검증 완료 (전 항목 상업 권리 확보).",
    },
    signedByHandle: "@sol-artdir",
    signedAtIso: "2026-11-20T11:35:00.000Z",
  };

  const noir: CreateTeamStylePackInput = {
    metadata: {
      packId: "pack-action-noir-ink",
      slug: "action-noir-ink",
      nameKo: "액션 누아르 잉크 팩",
      nameEn: "Action Noir Ink Pack",
      version: "3.1.0",
      summaryKo: "강한 흑백 대비, 7850K 한색 그림자, 65LPI 하프톤 컴퓨트 셰이더를 결합한 액션 누아르 팩",
      summaryEn: "High-contrast noir pack combining bold ink weight, 7850K cool shadows, and 65 LPI halftone WGSL compute",
      genreTag: "action-noir",
      createdAtIso: "2026-09-12T08:00:00.000Z",
      updatedAtIso: "2026-11-22T15:10:00.000Z",
      tags: ["액션", "누아르", "하프톤", "고대비잉크"],
    },
    styleDna: {
      seriesId: "series-noir-rooftop",
      seriesTitle: "심야 옥상의 잔향",
      artistName: "쿠로 액션 작화팀",
      version: 9,
      sampleCount: 72,
      updatedAtIso: "2026-11-22T15:10:00.000Z",
      dnaFingerprint: hashHex("style-dna:series-noir-rooftop:v9").slice(0, 16),
      linework: {
        meanPx: 3.15, medianPx: 2.9, p10Px: 1.4, p90Px: 5.2, stdDevPx: 1.18,
        inkCoverageRatio: 0.246, taperVarianceRatio: 0.62, sampledLinePixels: 34910,
        histogram: { hairlineCount: 3920, mediumCount: 11240, boldCount: 13850, heavyCount: 5900 },
      },
      dominantPalette: [
        { L: 0.205, C: 0.022, H: 256.0, share: 0.38, role: "base", cssOklch: "oklch(0.205 0.022 256.0)" },
        { L: 0.472, C: 0.044, H: 248.4, share: 0.24, role: "midtone", cssOklch: "oklch(0.472 0.044 248.4)" },
        { L: 0.148, C: 0.032, H: 264.5, share: 0.21, role: "shadow", cssOklch: "oklch(0.148 0.032 264.5)" },
        { L: 0.896, C: 0.026, H: 224.0, share: 0.1, role: "highlight", cssOklch: "oklch(0.896 0.026 224.0)" },
        { L: 0.594, C: 0.218, H: 24.6, share: 0.07, role: "accent", cssOklch: "oklch(0.594 0.218 24.6)" },
      ],
      shadowTemperature: {
        meanLightness: 0.148, meanChroma: 0.032, meanHueDeg: 264.5, meanA: -0.003, meanB: -0.031,
        coolWarmIndex: -0.76, estimatedKelvin: 7850, highlightMeanLightness: 0.885, highlightMeanHueDeg: 220.4,
        shadowPixelRatio: 0.442, cssOklch: "oklch(0.148 0.032 264.5)",
      },
      contrast: {
        p05L: 0.08, p25L: 0.18, p50L: 0.39, p75L: 0.68, p95L: 0.94,
        dynamicRange: 0.86, midtoneContrast: 0.5, rmsContrast: 0.312, detectedToneSteps: 2,
      },
      screentone: {
        coverageRatio: 0.38, meanDotDensity: 0.54, alternatingRateX: 0.44, alternatingRateY: 0.41,
        estimatedLpiFrequency: 65, patternKind: "halftone-dot",
      },
    },
    brushes: [
      {
        id: "brush-noir-elastic-ink", nameKo: "강약 타격 G펜", nameEn: "High-Impact Elastic G-Pen",
        baseCatalogUid: "csp-executable:gpen-impact", tipId: "gpen-nib-elastic", paperTextureId: "manga-kent",
        mediaCategory: "gpen-ink", radiusPx: 11.5, spacingRatio: 0.07, flow01: 1, opacity01: 1,
        paperGrainStrength01: 0.24, dryOutRate01: 0.28, initialPaintLoad01: 0.92, initialMoisture01: 0.15,
        kmMixStrength01: 0.12, wetEdgeBloom01: 0, taper01: 0.92,
        primaryColor: { r: 18, g: 22, b: 32 }, underlayerColor: { r: 224, g: 228, b: 236 }, seed: 310001,
      },
      {
        id: "brush-noir-charcoal-impact", nameKo: "거친 각목탄 임팩트", nameEn: "Rough Charcoal Impact",
        baseCatalogUid: "global-master:square-charcoal", tipId: "square-charcoal", paperTextureId: "rough-cotton",
        mediaCategory: "charcoal", radiusPx: 22, spacingRatio: 0.18, flow01: 0.86, opacity01: 0.94,
        paperGrainStrength01: 0.88, dryOutRate01: 0.78, initialPaintLoad01: 0.76, initialMoisture01: 0.08,
        kmMixStrength01: 0.38, wetEdgeBloom01: 0.02, taper01: 0.34,
        primaryColor: { r: 24, g: 26, b: 36 }, underlayerColor: { r: 205, g: 38, b: 54 }, seed: 310002,
      },
    ],
    shaders: [
      {
        id: "shader-noir-halftone-compute", nameKo: "누아르 하프톤 컴퓨트", nameEn: "Noir Halftone Compute",
        promptKo: "65LPI 고대비 누아르 하프톤 스크린톤과 크림슨 포인트", promptEn: "65 LPI high-contrast noir halftone screentone with crimson accent",
        stage: "compute", style: "neon-halftone", lighting: "cel-hard-shadow",
        uniforms: {
          styleId: 2, lightingId: 4, keyColor: { r: 0.84, g: 0.88, b: 0.96 }, rimColor: { r: 0.74, g: 0.89, b: 1 },
          shadowColor: { r: 0.09, g: 0.11, b: 0.19 }, accentColor: { r: 0.91, g: 0.18, b: 0.26 },
          intensity: 0.92, rimStrength: 0.64, shadowFloor: 0.09, saturationBoost: 0.18,
          grainScale: 120, patternParam: 65, reliefStrength: 0.32, seedNorm: 0.65, uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
        },
        wgslSource: WGSL_NOIR_HALFTONE_COMPUTE,
      },
      {
        id: "shader-noir-moonlit-rim", nameKo: "옥상 달빛 백림 셰이더", nameEn: "Rooftop Moonlit Back-Rim Shader",
        promptKo: "차가운 달빛 백림라이트와 2단 하드 섀도", promptEn: "cold moonlight back-rim with hard 2-step cel shadow",
        stage: "fragment", style: "cel-2step", lighting: "moonlight-backrim",
        uniforms: {
          styleId: 4, lightingId: 5, keyColor: { r: 0.78, g: 0.84, b: 0.94 }, rimColor: { r: 0.72, g: 0.91, b: 1 },
          shadowColor: { r: 0.11, g: 0.13, b: 0.24 }, accentColor: { r: 0.86, g: 0.22, b: 0.3 },
          intensity: 0.88, rimStrength: 0.84, shadowFloor: 0.12, saturationBoost: 0.08,
          grainScale: 80, patternParam: 24, reliefStrength: 0.18, seedNorm: 0.82, uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
        },
        wgslSource: WGSL_NOIR_MOONLIT_FRAGMENT,
      },
    ],
    rightsBom: {
      ownerTeamHandle: "@team-kuro-ink", ownerTeamName: "쿠로 액션 작화팀",
      licenseTier: "commercial-enterprise", commercialUseAllowed: true, redistributionAllowed: false,
      attributionRequired: true, territoryScope: "global",
      royaltySplits: [
        { handle: "@kuro-main", displayName: "한도현 (메인 작화)", role: "lead-artist", shareBps: 5000 },
        { handle: "@jin-brush", displayName: "박진우 (브러시 제작)", role: "brush-smith", shareBps: 3000 },
        { handle: "@kuro-corp", displayName: "쿠로 스튜디오 법인", role: "studio-org", shareBps: 2000 },
      ],
      provenance: [
        { assetId: "prov-noir-kent-scan", title: "135kg 만화 원고지 켄트지 마찰 텍스처", sourceKind: "original-inhouse", licenseSpdx: "Proprietary-Enterprise", attributionText: "쿠로 액션 작화팀 전속 권리", commercialCleared: true, originHashSha256: hashHex("prov-noir-kent-scan:v3") },
        { assetId: "prov-noir-halftone-wgsl", title: "65LPI 스크린톤 WGSL 컴퓨트 커널", sourceKind: "licensed-commercial", licenseSpdx: "Commercial-Seat", attributionText: "Kuro Shader Foundry Seat No. 4401", commercialCleared: true, originHashSha256: hashHex("prov-noir-halftone-wgsl:v3") },
      ],
      auditNote: "엔터프라이즈 상업 연재 전용(외부 재배포 금지, 팀 시트 내 무제한 사용).",
    },
    signedByHandle: "@kuro-main",
    signedAtIso: "2026-11-22T15:15:00.000Z",
  };

  const atelier: CreateTeamStylePackInput = {
    metadata: {
      packId: "pack-slice-of-life-pastel-atelier",
      slug: "slice-of-life-pastel-atelier",
      nameKo: "일상 파스텔 아틀리에 팩",
      nameEn: "Slice-of-Life Pastel Atelier Pack",
      version: "1.8.0",
      summaryKo: "포근한 6B 연필 선화, 크림-살구 파스텔 팔레트, 연필 해칭 셰이더의 에디토리얼 팩",
      summaryEn: "Cozy editorial pack with 6B pencil linework, cream-apricot pastel palette, and pencil-hatch WGSL shader",
      genreTag: "slice-of-life",
      createdAtIso: "2026-10-02T10:20:00.000Z",
      updatedAtIso: "2026-11-23T09:05:00.000Z",
      tags: ["일상", "파스텔", "연필선화", "에디토리얼"],
    },
    styleDna: {
      seriesId: "series-daily-cafe",
      seriesTitle: "골목 끝 오후의 다방",
      artistName: "오후 아틀리에 동인팀",
      version: 3,
      sampleCount: 24,
      updatedAtIso: "2026-11-23T09:05:00.000Z",
      dnaFingerprint: hashHex("style-dna:series-daily-cafe:v3").slice(0, 16),
      linework: {
        meanPx: 2.05, medianPx: 2, p10Px: 1.25, p90Px: 2.85, stdDevPx: 0.44,
        inkCoverageRatio: 0.112, taperVarianceRatio: 0.46, sampledLinePixels: 14680,
        histogram: { hairlineCount: 3120, mediumCount: 8420, boldCount: 2810, heavyCount: 330 },
      },
      dominantPalette: [
        { L: 0.954, C: 0.018, H: 82.0, share: 0.36, role: "base", cssOklch: "oklch(0.954 0.018 82.0)" },
        { L: 0.836, C: 0.064, H: 62.5, share: 0.25, role: "midtone", cssOklch: "oklch(0.836 0.064 62.5)" },
        { L: 0.562, C: 0.048, H: 46.2, share: 0.18, role: "shadow", cssOklch: "oklch(0.562 0.048 46.2)" },
        { L: 0.976, C: 0.016, H: 92.4, share: 0.12, role: "highlight", cssOklch: "oklch(0.976 0.016 92.4)" },
        { L: 0.742, C: 0.088, H: 146.0, share: 0.09, role: "accent", cssOklch: "oklch(0.742 0.088 146.0)" },
      ],
      shadowTemperature: {
        meanLightness: 0.562, meanChroma: 0.048, meanHueDeg: 46.2, meanA: 0.033, meanB: 0.035,
        coolWarmIndex: 0.42, estimatedKelvin: 5100, highlightMeanLightness: 0.968, highlightMeanHueDeg: 88.6,
        shadowPixelRatio: 0.185, cssOklch: "oklch(0.562 0.048 46.2)",
      },
      contrast: {
        p05L: 0.38, p25L: 0.64, p50L: 0.82, p75L: 0.91, p95L: 0.97,
        dynamicRange: 0.59, midtoneContrast: 0.27, rmsContrast: 0.142, detectedToneSteps: 3,
      },
      screentone: {
        coverageRatio: 0.21, meanDotDensity: 0.24, alternatingRateX: 0.14, alternatingRateY: 0.12,
        estimatedLpiFrequency: 36, patternKind: "soft-grain",
      },
    },
    brushes: [
      {
        id: "brush-atelier-pencil-6b", nameKo: "부드러운 6B 연필 선화", nameEn: "Soft 6B Pencil Line",
        baseCatalogUid: "global-master:graphite-6b", tipId: "graphite-pencil-6b", paperTextureId: "cold-press-watercolor",
        mediaCategory: "pencil", radiusPx: 9, spacingRatio: 0.12, flow01: 0.82, opacity01: 0.88,
        paperGrainStrength01: 0.72, dryOutRate01: 0.36, initialPaintLoad01: 0.86, initialMoisture01: 0.1,
        kmMixStrength01: 0.28, wetEdgeBloom01: 0.04, taper01: 0.58,
        primaryColor: { r: 78, g: 64, b: 56 }, underlayerColor: { r: 248, g: 242, b: 230 }, seed: 180001,
      },
      {
        id: "brush-atelier-chalk-pastel", nameKo: "포근한 파스텔 텍스처", nameEn: "Cozy Chalk Pastel",
        baseCatalogUid: "global-master:soft-pastel", tipId: "soft-pastel-chalk", paperTextureId: "rough-cotton",
        mediaCategory: "pastel", radiusPx: 20, spacingRatio: 0.16, flow01: 0.78, opacity01: 0.84,
        paperGrainStrength01: 0.78, dryOutRate01: 0.62, initialPaintLoad01: 0.82, initialMoisture01: 0.12,
        kmMixStrength01: 0.68, wetEdgeBloom01: 0.12, taper01: 0.3,
        primaryColor: { r: 232, g: 174, b: 142 }, underlayerColor: { r: 176, g: 208, b: 184 }, seed: 180002,
      },
    ],
    shaders: [
      {
        id: "shader-atelier-pencil-hatch", nameKo: "연필 해칭 소프트 앰비언트", nameEn: "Pencil Hatch Soft Ambient",
        promptKo: "부드러운 크림 파스텔 연필 해칭 셰이더", promptEn: "soft cream pastel pencil hatch ambient shader",
        stage: "fragment", style: "pencil-hatch", lighting: "soft-ambient",
        uniforms: {
          styleId: 5, lightingId: 0, keyColor: { r: 0.96, g: 0.93, b: 0.87 }, rimColor: { r: 0.98, g: 0.95, b: 0.84 },
          shadowColor: { r: 0.52, g: 0.45, b: 0.41 }, accentColor: { r: 0.68, g: 0.82, b: 0.72 },
          intensity: 0.64, rimStrength: 0.32, shadowFloor: 0.34, saturationBoost: 0.06,
          grainScale: 140, patternParam: 12, reliefStrength: 0.48, seedNorm: 0.18, uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
        },
        wgslSource: WGSL_ATELIER_PENCIL_FRAGMENT,
      },
      {
        id: "shader-atelier-warm-grain", nameKo: "필름 그레인 아틀리에", nameEn: "Film Grain Atelier Pass",
        promptKo: "따뜻한 오후 햇살 아날로그 필름 그레인", promptEn: "warm afternoon analog film grain pass",
        stage: "compute", style: "film-grain", lighting: "warm-rim",
        uniforms: {
          styleId: 6, lightingId: 1, keyColor: { r: 0.97, g: 0.94, b: 0.89 }, rimColor: { r: 0.99, g: 0.92, b: 0.76 },
          shadowColor: { r: 0.48, g: 0.42, b: 0.39 }, accentColor: { r: 0.88, g: 0.72, b: 0.58 },
          intensity: 0.54, rimStrength: 0.38, shadowFloor: 0.32, saturationBoost: 0.04,
          grainScale: 192, patternParam: 16, reliefStrength: 0.28, seedNorm: 0.52, uniformByteLength: WGSL_UNIFORM_BYTE_LENGTH,
        },
        wgslSource: WGSL_ATELIER_GRAIN_COMPUTE,
      },
    ],
    rightsBom: {
      ownerTeamHandle: "@team-afternoon-atelier", ownerTeamName: "오후 아틀리에 동인팀",
      licenseTier: "editorial-noncommercial", commercialUseAllowed: false, redistributionAllowed: true,
      attributionRequired: true, territoryScope: "kr-jp-na",
      royaltySplits: [
        { handle: "@haru-sketch", displayName: "이하루 (원화 · 팔레트)", role: "lead-artist", shareBps: 6500 },
        { handle: "@bomi-pastel", displayName: "김보미 (브러시 · 텍스처)", role: "brush-smith", shareBps: 3500 },
      ],
      provenance: [
        { assetId: "prov-atelier-sketchbook-cc0", title: "아틀리에 스케치북 텍스처 CC0", sourceKind: "cc0-public-domain", licenseSpdx: "CC0-1.0", attributionText: "Public Domain Scan Archive", commercialCleared: true, originHashSha256: hashHex("prov-atelier-sketchbook-cc0:v1") },
        { assetId: "prov-atelier-editorial-grain", title: "비상업 에디토리얼 필름 그레인 샘플", sourceKind: "cc-by-4.0", licenseSpdx: "CC-BY-NC-4.0", attributionText: "Afternoon Analog Club (Non-Commercial Editorial)", commercialCleared: false, originHashSha256: hashHex("prov-atelier-editorial-grain:v1") },
      ],
      auditNote: "비상업 팬아트·에디토리얼 연재 전용. 상업 출판 전 필름 그레인 권리 교체 필요.",
    },
    signedByHandle: "@haru-sketch",
    signedAtIso: "2026-11-23T09:10:00.000Z",
  };

  return Object.freeze({
    "romance-fantasy-watercolor-cel": rofan,
    "action-noir-ink": noir,
    "slice-of-life-pastel-atelier": atelier,
  });
}
