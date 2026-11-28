/**
 * Wave 165: 16-byte 정렬 64-byte 유니폼 WebGPU WGSL 시맨틱 깊이 마스크 합성 셰이더 및 정적 계약 검증기.
 *
 * - 반투명 안티앨리어싱 선화 아래에 깊이 우선 시맨틱 클리핑 마스크를 알파 프리멀티플라이 클램핑으로 합성한다.
 * - 정적 검증기는 괄호 균형, `@group/@binding` 유일성, 16바이트 정렬, GLSL 금지 토큰, 유한 유니폼 값을 검사한다.
 */

import type {
  DepthMaskWgslBundle,
  DepthMaskWgslUniformValues,
  DepthMaskWgslValidationResult,
} from "./semantic-mask-types";

export const DEPTH_MASK_WGSL_SHADER_ID = "wave165-depth-mask-antibleed-composite";
export const DEPTH_MASK_WGSL_ENTRY_POINT = "fs_composite_depth_antibleed";
export const DEPTH_MASK_UNIFORM_FLOAT_COUNT = 16;
export const DEPTH_MASK_UNIFORM_BYTE_LENGTH = 64;

export interface BuildDepthMaskWgslInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly antiAliasFloor?: number;
  readonly inkOpacityGain?: number;
  readonly chokeBiasPx?: number;
  readonly depthPriorityGain?: number;
  readonly premultiplyClamp?: number;
  readonly activeLayerCount?: number;
  readonly inkTintRgba?: readonly [number, number, number, number];
  readonly paperLuma?: number;
  readonly edgeSoftness?: number;
  readonly haloGuardEps?: number;
  readonly debugOverlayMode?: number;
}

/** 16-byte 정렬 64-byte(4×vec4f) 유니폼을 사용하는 깊이 마스크 안티-블리드 합성 프래그먼트 WGSL. */
export const DEPTH_MASK_ANTIBLEED_FRAGMENT_WGSL = /* wgsl */ `
struct DepthMaskAntiBleedUniforms {
  canvasAndThresholds: vec4f,
  chokeAndDepthParams: vec4f,
  inkTintRgba: vec4f,
  paperAndGuardParams: vec4f,
};

@group(0) @binding(0) var<uniform> uMask: DepthMaskAntiBleedUniforms;
@group(0) @binding(1) var lineartSampler: sampler;
@group(0) @binding(2) var lineartInkTex: texture_2d<f32>;
@group(0) @binding(3) var semanticDepthMaskTex: texture_2d<f32>;
@group(0) @binding(4) var layerPaletteTex: texture_2d<f32>;

fn clampUnit(v: f32) -> f32 {
  return clamp(v, 0.0, 1.0);
}

fn sampleDepthOrderedUnderfill(uv: vec2f, layerCount: f32) -> vec4f {
  let maskSample = textureSample(semanticDepthMaskTex, lineartSampler, uv);
  let normalizedDepth = clampUnit(maskSample.r);
  let maskCoverage = clampUnit(maskSample.a);
  let safeCount = max(1.0, layerCount);
  let paletteU = clamp((floor(normalizedDepth * safeCount + 0.5) - 0.5) / safeCount, 0.0, 1.0);
  let paletteColor = textureSample(layerPaletteTex, lineartSampler, vec2f(paletteU, 0.5));
  let clampedAlpha = clampUnit(maskCoverage * uMask.chokeAndDepthParams.z);
  return vec4f(paletteColor.rgb * clampedAlpha, clampedAlpha);
}

@fragment
fn fs_composite_depth_antibleed(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
  let dims = max(uMask.canvasAndThresholds.xy, vec2f(1.0, 1.0));
  let uv = clamp(fragPos.xy / dims, vec2f(0.0, 0.0), vec2f(1.0, 1.0));

  let inkSample = textureSample(lineartInkTex, lineartSampler, uv);
  let aaFloor = clampUnit(uMask.canvasAndThresholds.z);
  let inkGain = max(0.0, uMask.canvasAndThresholds.w);
  let rawInkAlpha = clampUnit(inkSample.a * inkGain);
  let inkAlpha = select(0.0, rawInkAlpha, rawInkAlpha >= aaFloor);

  let underPremul = sampleDepthOrderedUnderfill(uv, uMask.chokeAndDepthParams.w);
  let paperRgb = vec3f(uMask.paperAndGuardParams.x);
  let haloGuard = max(0.0001, uMask.paperAndGuardParams.z);
  let hasUnderfill = step(haloGuard, underPremul.a);
  let safeUnderRgb = mix(paperRgb, underPremul.rgb / max(underPremul.a, haloGuard), hasUnderfill);
  let safeUnderAlpha = max(underPremul.a, 1.0 - hasUnderfill);

  let inkRgb = uMask.inkTintRgba.rgb * clampUnit(uMask.inkTintRgba.a);
  let inkPremul = inkRgb * inkAlpha;
  let underBlended = safeUnderRgb * safeUnderAlpha * (1.0 - inkAlpha);
  let finalPremul = clamp(inkPremul + underBlended, vec3f(0.0), vec3f(1.0));
  let finalAlpha = clampUnit(inkAlpha + safeUnderAlpha * (1.0 - inkAlpha));

  return vec4f(finalPremul, finalAlpha);
}
`.trim();

/** 64-byte(16×f32) 유니폼 버퍼와 프래그먼트 WGSL 번들을 생성한다. */
export function buildDepthMaskAntiBleedWgsl(input: BuildDepthMaskWgslInput): DepthMaskWgslBundle {
  const antiAliasFloorNorm = (input.antiAliasFloor ?? 8) / 255;
  const inkTint = input.inkTintRgba ?? [0.11, 0.12, 0.15, 1.0];

  const uniformValues: DepthMaskWgslUniformValues = {
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    antiAliasFloorNorm,
    inkOpacityGain: input.inkOpacityGain ?? 1.0,
    chokeBiasPx: input.chokeBiasPx ?? 2.0,
    depthPriorityGain: input.depthPriorityGain ?? 1.0,
    premultiplyClamp: input.premultiplyClamp ?? 1.0,
    activeLayerCount: input.activeLayerCount ?? 6,
    inkTintR: inkTint[0],
    inkTintG: inkTint[1],
    inkTintB: inkTint[2],
    inkTintA: inkTint[3],
    paperLuma: input.paperLuma ?? 0.985,
    edgeSoftness: input.edgeSoftness ?? 0.5,
    haloGuardEps: input.haloGuardEps ?? 0.004,
    debugOverlayMode: input.debugOverlayMode ?? 0,
  };

  const uniformFloats = new Float32Array(DEPTH_MASK_UNIFORM_FLOAT_COUNT);
  uniformFloats[0] = uniformValues.canvasWidth;
  uniformFloats[1] = uniformValues.canvasHeight;
  uniformFloats[2] = uniformValues.antiAliasFloorNorm;
  uniformFloats[3] = uniformValues.inkOpacityGain;
  uniformFloats[4] = uniformValues.chokeBiasPx;
  uniformFloats[5] = uniformValues.depthPriorityGain;
  uniformFloats[6] = uniformValues.premultiplyClamp;
  uniformFloats[7] = uniformValues.activeLayerCount;
  uniformFloats[8] = uniformValues.inkTintR;
  uniformFloats[9] = uniformValues.inkTintG;
  uniformFloats[10] = uniformValues.inkTintB;
  uniformFloats[11] = uniformValues.inkTintA;
  uniformFloats[12] = uniformValues.paperLuma;
  uniformFloats[13] = uniformValues.edgeSoftness;
  uniformFloats[14] = uniformValues.haloGuardEps;
  uniformFloats[15] = uniformValues.debugOverlayMode;

  return {
    shaderId: DEPTH_MASK_WGSL_SHADER_ID,
    entryPoint: DEPTH_MASK_WGSL_ENTRY_POINT,
    wgslSource: DEPTH_MASK_ANTIBLEED_FRAGMENT_WGSL,
    uniformByteLength: uniformFloats.byteLength,
    uniformFloats,
    uniformValues,
  };
}

const FORBIDDEN_GLSL_RULES: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
}> = [
  { label: "texture2D", pattern: /\btexture2D\b/ },
  { label: "gl_FragCoord", pattern: /\bgl_FragCoord\b/ },
  { label: "gl_Position", pattern: /\bgl_Position\b/ },
  { label: "sampler2D", pattern: /\bsampler2D\b/ },
  { label: "GLSL vec2/vec3/vec4", pattern: /\bvec[234]\b(?!\s*<)/ },
];

/**
 * WGSL 번들의 정적 계약을 검증한다.
 * - 중괄호·소괄호 균형
 * - `@group(G) @binding(B)` 유일성
 * - 16-byte 정렬 및 64-byte 유니폼 크기 일치
 * - GLSL 금지 토큰 부재
 * - 모든 유니폼 `f32` 유한성 및 캔버스 양수 크기
 */
export function validateDepthMaskAntiBleedWgsl(
  bundle: DepthMaskWgslBundle,
): DepthMaskWgslValidationResult {
  const errors: string[] = [];
  const source = bundle.wgslSource;

  if (source.trim().length === 0) {
    errors.push("WGSL 소스가 비어 있습니다.");
  }

  // 1) 중괄호 및 소괄호 균형 검사
  let braceDepth = 0;
  let parenDepth = 0;
  let negativeBraceDetected = false;
  let negativeParenDetected = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i);
    if (ch === "{") {
      braceDepth += 1;
    } else if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        negativeBraceDetected = true;
      }
    } else if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth < 0) {
        negativeParenDetected = true;
      }
    }
  }
  if (negativeBraceDetected || braceDepth !== 0) {
    errors.push(`중괄호 균형이 맞지 않습니다(최종 깊이: ${String(braceDepth)}).`);
  }
  if (negativeParenDetected || parenDepth !== 0) {
    errors.push(`소괄호 균형이 맞지 않습니다(최종 깊이: ${String(parenDepth)}).`);
  }

  // 2) 프래그먼트 진입점 확인
  if (!/@fragment\b/.test(source)) {
    errors.push("@fragment 스테이지 선언이 누락되었습니다.");
  }
  const entryRegex = new RegExp(`\\bfn\\s+${bundle.entryPoint}\\s*\\(`);
  if (!entryRegex.test(source)) {
    errors.push(`진입점 함수 '${bundle.entryPoint}'가 WGSL 소스에 없습니다.`);
  }

  // 3) @group/@binding 유일성 검사
  const bindingRegex = /@group\s*\(\s*(\d+)\s*\)\s*@binding\s*\(\s*(\d+)\s*\)/g;
  const seenBindings = new Set<string>();
  const bindingKeys: string[] = [];
  let match: RegExpExecArray | null = bindingRegex.exec(source);
  while (match !== null) {
    const key = `g${match[1]}:b${match[2]}`;
    bindingKeys.push(key);
    if (seenBindings.has(key)) {
      errors.push(`중복된 바인딩이 발견되었습니다: @group(${match[1]}) @binding(${match[2]}).`);
    } else {
      seenBindings.add(key);
    }
    match = bindingRegex.exec(source);
  }
  if (bindingKeys.length === 0) {
    errors.push("@group/@binding 선언이 하나도 없습니다.");
  }

  // 4) 16-byte 정렬 및 유니폼 바이트 크기 일치 검사
  if (
    !Number.isInteger(bundle.uniformByteLength) ||
    bundle.uniformByteLength <= 0 ||
    bundle.uniformByteLength % 16 !== 0
  ) {
    errors.push(
      `유니폼 바이트 크기(${String(bundle.uniformByteLength)})가 16바이트 배수가 아닙니다.`,
    );
  }
  if (bundle.uniformFloats.byteLength !== bundle.uniformByteLength) {
    errors.push(
      `uniformFloats 바이트 길이(${String(bundle.uniformFloats.byteLength)})가 uniformByteLength(${String(bundle.uniformByteLength)})와 일치하지 않습니다.`,
    );
  }
  if (!/\bstruct\s+DepthMaskAntiBleedUniforms\b/.test(source)) {
    errors.push("DepthMaskAntiBleedUniforms 구조체 정의가 없습니다.");
  }

  // 5) GLSL 금지 토큰 검사
  for (let i = 0; i < FORBIDDEN_GLSL_RULES.length; i += 1) {
    const rule = FORBIDDEN_GLSL_RULES[i];
    if (rule.pattern.test(source)) {
      errors.push(`금지된 GLSL 토큰(${rule.label})이 포함되어 있습니다.`);
    }
  }

  // 6) 유니폼 유한성 및 치수 유효성 검사
  for (let i = 0; i < bundle.uniformFloats.length; i += 1) {
    if (!Number.isFinite(bundle.uniformFloats[i])) {
      errors.push(`uniformFloats[${String(i)}] 값이 유한하지 않습니다.`);
    }
  }
  if (
    bundle.uniformFloats.length >= 2 &&
    (bundle.uniformFloats[0] <= 0 || bundle.uniformFloats[1] <= 0)
  ) {
    errors.push("유니폼 캔버스 크기(width, height)는 양수여야 합니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
    braceDepthBalance: braceDepth,
    bindingKeys,
    uniformByteLength: bundle.uniformByteLength,
  };
}
