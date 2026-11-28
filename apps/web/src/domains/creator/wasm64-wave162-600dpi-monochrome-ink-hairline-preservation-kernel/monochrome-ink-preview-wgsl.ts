/**
 * Wave 162: WebGPU 600DPI 1비트 흑백 펜선 미리보기 및 머리카락 끊김 복구 오버레이 WGSL 셰이더.
 *
 * 16바이트 정렬 64바이트 유니폼 구조체(InkPreviewUniforms)와 정적 WGSL 계약 검증기를 제공한다.
 */

import type {
  MonochromeInkPreviewWgslBundle,
  MonochromeInkPreviewWgslOptions,
  MonochromeInkWgslValidationResult,
} from './monochrome-ink-types';

const UNIFORM_BYTE_SIZE = 64;
const UNIFORM_FLOAT_COUNT = 16;

const WGSL_PREVIEW_SOURCE = `// Wave 162: 600DPI 1-bit Monochrome Ink & Hairline Dropout Recovery Preview Shader
struct InkPreviewUniforms {
  resolution_dpi: vec4<f32>,
  thresholds: vec4<f32>,
  overlay_flags: vec4<f32>,
  ink_palette: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: InkPreviewUniforms;
@group(0) @binding(1) var<storage, read> grayscale_ink: array<u32>;
@group(0) @binding(2) var<storage, read> binary_ink: array<u32>;
@group(0) @binding(3) var<storage, read> ridge_map: array<f32>;
@group(0) @binding(4) var<storage, read_write> preview_rgba: array<u32>;

fn pack_rgba8(color: vec4<f32>) -> u32 {
  let r: u32 = u32(clamp(color.x, 0.0, 1.0) * 255.0 + 0.5);
  let g: u32 = u32(clamp(color.y, 0.0, 1.0) * 255.0 + 0.5);
  let b: u32 = u32(clamp(color.z, 0.0, 1.0) * 255.0 + 0.5);
  let a: u32 = u32(clamp(color.w, 0.0, 1.0) * 255.0 + 0.5);
  return (a << 24u) | (b << 16u) | (g << 8u) | r;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let width: u32 = u32(max(params.resolution_dpi.x, 1.0));
  let height: u32 = u32(max(params.resolution_dpi.y, 1.0));
  if (gid.x >= width || gid.y >= height) {
    return;
  }

  let idx: u32 = gid.y * width + gid.x;
  let gray_val: f32 = f32(grayscale_ink[idx] & 255u);
  let bit_val: u32 = binary_ink[idx] & 1u;
  let ridge_val: f32 = clamp(ridge_map[idx], 0.0, 1.0);

  let global_thresh: f32 = params.thresholds.x;
  let show_overlay: f32 = params.overlay_flags.x;
  let split_x: f32 = params.overlay_flags.w;
  let uv_x: f32 = (f32(gid.x) + 0.5) / f32(width);

  let ink_luma: f32 = params.ink_palette.x;
  let paper_luma: f32 = params.ink_palette.y;
  let alert_strength: f32 = params.ink_palette.z;

  let baseline_bit: u32 = select(0u, 1u, gray_val <= global_thresh);
  let use_baseline: bool = uv_x < split_x;
  let active_bit: u32 = select(bit_val, baseline_bit, use_baseline);

  var out_color: vec4<f32> = select(
    vec4<f32>(paper_luma, paper_luma, paper_luma * 0.985, 1.0),
    vec4<f32>(ink_luma, ink_luma * 1.05, ink_luma, 1.0),
    active_bit == 1u
  );

  let recovered_hairline: bool = (!use_baseline) && (bit_val == 1u) && (baseline_bit == 0u);
  let dropped_hairline: bool = use_baseline && (baseline_bit == 0u) && (ridge_val >= 0.24);

  if (show_overlay > 0.5 && recovered_hairline) {
    let blend: f32 = clamp(0.55 + ridge_val * 0.35 * alert_strength, 0.0, 1.0);
    let emerald: vec4<f32> = vec4<f32>(0.12, 0.42, 0.31, 1.0);
    out_color = mix(out_color, emerald, blend);
  } else if (show_overlay > 0.5 && dropped_hairline) {
    let blend: f32 = clamp(0.50 + ridge_val * 0.40 * alert_strength, 0.0, 1.0);
    let warning_red: vec4<f32> = vec4<f32>(0.76, 0.24, 0.18, 1.0);
    out_color = mix(out_color, warning_red, blend);
  }

  preview_rgba[idx] = pack_rgba8(out_color);
}
`;

/** 16바이트 정렬 64바이트 유니폼 버퍼와 WebGPU 1비트 펜선 미리보기 WGSL 번들을 생성한다. */
export function buildMonochromeInkPreviewWgsl(
  options: MonochromeInkPreviewWgslOptions,
): MonochromeInkPreviewWgslBundle {
  const uniformBuffer = new Float32Array(UNIFORM_FLOAT_COUNT);
  // vec4 resolution_dpi (offset 0..15)
  uniformBuffer[0] = options.width;
  uniformBuffer[1] = options.height;
  uniformBuffer[2] = options.dpi;
  uniformBuffer[3] = options.minSafeStrokeWidthMm ?? 0.05;
  // vec4 thresholds (offset 16..31)
  uniformBuffer[4] = options.globalThreshold ?? 128;
  uniformBuffer[5] = options.ridgeBoostStrength ?? 520;
  uniformBuffer[6] = options.sauvolaK ?? 0.22;
  uniformBuffer[7] = options.paperWhiteCeiling ?? 232;
  // vec4 overlay_flags (offset 32..47)
  uniformBuffer[8] = options.showDropoutOverlay === false ? 0 : 1;
  uniformBuffer[9] = options.showWidthHeatmap === true ? 1 : 0;
  uniformBuffer[10] = options.zoomFactor ?? 4;
  uniformBuffer[11] = options.splitPosition ?? 0.5;
  // vec4 ink_palette (offset 48..63)
  uniformBuffer[12] = 0.08;
  uniformBuffer[13] = 0.985;
  uniformBuffer[14] = 1.0;
  uniformBuffer[15] = 0.0;

  return {
    wgsl: WGSL_PREVIEW_SOURCE,
    entryPoint: 'main',
    workgroupSize: [8, 8, 1],
    uniformStructName: 'InkPreviewUniforms',
    uniformByteSize: UNIFORM_BYTE_SIZE,
    uniformStrideBytes: 16,
    uniformBuffer,
    bindings: [
      { group: 0, binding: 0, name: 'params', kind: 'uniform' },
      { group: 0, binding: 1, name: 'grayscale_ink', kind: 'storage-read' },
      { group: 0, binding: 2, name: 'binary_ink', kind: 'storage-read' },
      { group: 0, binding: 3, name: 'ridge_map', kind: 'storage-read' },
      { group: 0, binding: 4, name: 'preview_rgba', kind: 'storage-read-write' },
    ],
  };
}

function stripWgslComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? '';
    const next = source[i + 1] ?? '';
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') {
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function checkBalancedDelimiters(source: string): string | null {
  const stack: string[] = [];
  const pairs: Readonly<Record<string, string>> = {
    ')': '(',
    ']': '[',
    '}': '{',
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] ?? '';
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else if (ch === ')' || ch === ']' || ch === '}') {
      const expected = pairs[ch];
      const top = stack.pop();
      if (top !== expected) {
        return `WGSL 괄호 짝이 맞지 않습니다 ('${ch}' 위치 불일치).`;
      }
    }
  }
  if (stack.length > 0) {
    return `WGSL 닫히지 않은 괄호가 남아 있습니다 (${String(stack.length)}개).`;
  }
  return null;
}

/**
 * WGSL 미리보기 셰이더 정적 계약 검증기.
 *
 * 검사 항목:
 * - 중괄호·소괄호·대괄호 균형
 * - @group/@binding 중복 없음
 * - 16바이트 유니폼 정렬 및 버퍼 크기(byteLength) 일치
 * - GLSL 금지 토큰(vec2/vec3/vec4 비제네릭, texture2D, gl_FragCoord 등) 미포함
 * - 유니폼 배열 전체 유한수(Number.isFinite) 검증
 */
export function validateMonochromeInkPreviewWgsl(
  bundle: Pick<
    MonochromeInkPreviewWgslBundle,
    'wgsl' | 'uniformByteSize' | 'uniformBuffer'
  >,
): MonochromeInkWgslValidationResult {
  const errors: string[] = [];
  const trimmed = bundle.wgsl.trim();
  if (trimmed.length === 0) {
    errors.push('WGSL 소스가 비어 있습니다.');
  }

  const stripped = stripWgslComments(bundle.wgsl);

  const delimError = checkBalancedDelimiters(stripped);
  if (delimError !== null) {
    errors.push(delimError);
  }

  if (
    !Number.isInteger(bundle.uniformByteSize) ||
    bundle.uniformByteSize <= 0 ||
    bundle.uniformByteSize % 16 !== 0
  ) {
    errors.push(
      `유니폼 버퍼 크기(${String(bundle.uniformByteSize)}B)가 16바이트 정렬 규칙에 맞지 않습니다.`,
    );
  }

  if (bundle.uniformBuffer.byteLength !== bundle.uniformByteSize) {
    errors.push(
      `Float32Array 유니폼 바이트 길이(${String(bundle.uniformBuffer.byteLength)}B)가 선언 크기(${String(bundle.uniformByteSize)}B)와 다릅니다.`,
    );
  }

  for (let i = 0; i < bundle.uniformBuffer.length; i += 1) {
    const val = bundle.uniformBuffer[i];
    if (val === undefined || !Number.isFinite(val)) {
      errors.push(`유니폼 인덱스 ${String(i)}에 비유한수(${String(val)})가 포함되었습니다.`);
    }
  }

  const bindingRegex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)/g;
  const seenBindings = new Set<string>();
  let match = bindingRegex.exec(stripped);
  while (match !== null) {
    const key = `${match[1] ?? ''}:${match[2] ?? ''}`;
    if (seenBindings.has(key)) {
      errors.push(`중복된 WGSL 바인딩(@group(${match[1] ?? ''}) @binding(${match[2] ?? ''}))이 감지되었습니다.`);
    }
    seenBindings.add(key);
    match = bindingRegex.exec(stripped);
  }

  if (seenBindings.size === 0) {
    errors.push('WGSL @group/@binding 선언이 하나도 없습니다.');
  }

  if (!/@(compute|fragment)\b/.test(stripped)) {
    errors.push('WGSL 엔트리 포인트(@compute 또는 @fragment)가 누락되었습니다.');
  }

  const glslTypeRegex = /\b(vec2|vec3|vec4)\b(?!\s*<)/g;
  const glslTypeMatch = glslTypeRegex.exec(stripped);
  if (glslTypeMatch !== null) {
    errors.push(`GLSL 금지 벡터 토큰('${glslTypeMatch[1] ?? ''}')이 감지되었습니다.`);
  }

  const glslKeywordRegex = /\b(texture2D|gl_FragCoord|gl_Position|sampler2D|varying|attribute)\b/g;
  const glslKeywordMatch = glslKeywordRegex.exec(stripped);
  if (glslKeywordMatch !== null) {
    errors.push(`GLSL 금지 키워드('${glslKeywordMatch[1] ?? ''}')이 감지되었습니다.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    bindingCount: seenBindings.size,
    uniformByteSize: bundle.uniformByteSize,
  };
}
