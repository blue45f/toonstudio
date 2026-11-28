/**
 * Wave 159: 2D ARAP 캐릭터 메쉬 워프 & 와이어프레임 오버레이용 WebGPU WGSL 셰이더 빌더 및 정적 계약 검증기.
 *
 * - 16바이트 정렬 64바이트 유니폼 버퍼(4 × vec4f = 16 × f32)
 * - 바인딩 고유성, 괄호 균형, 16바이트 정렬, GLSL 금지 토큰 부재, 유한 유니폼 수치를 정적 검증한다.
 */

import type {
  ArapWgslBindingDescriptor,
  ArapWgslBundle,
  ArapWgslUniforms,
  ArapWgslValidationResult,
} from "./arap-deform-types";

export const ARAP_WGSL_UNIFORM_BYTE_LENGTH = 64;
export const ARAP_WGSL_VERTEX_ENTRY = "vs_arap_mesh_warp";
export const ARAP_WGSL_FRAGMENT_ENTRY = "fs_arap_mesh_warp";

export const DEFAULT_ARAP_WGSL_UNIFORMS: ArapWgslUniforms = {
  viewportWidth: 400,
  viewportHeight: 400,
  meshScale: 1,
  wireframeOpacity: 0.35,
  tintR: 1,
  tintG: 1,
  tintB: 1,
  tintA: 1,
  distortionHighlightStrength: 0.45,
  stretchWarnThreshold: 1.35,
  stretchFailThreshold: 1.75,
  activeHandleCount: 0,
  offsetX: 0,
  offsetY: 0,
  pixelRatio: 2,
  reservedFlags: 0,
};

const STANDARD_BINDINGS: readonly ArapWgslBindingDescriptor[] = [
  { group: 0, binding: 0, kind: "uniform", name: "u_warp" },
  { group: 0, binding: 1, kind: "sampler", name: "s_artwork" },
  { group: 0, binding: 2, kind: "texture_2d", name: "t_artwork" },
];

const GLSL_FORBIDDEN_TOKEN_REGEX =
  /\b(?:vec2|vec3|vec4|mat2|mat3|mat4|texture2D|gl_Position|gl_FragColor|sampler2D)\b/g;

function packUniformsToFloat32Array(uniforms: ArapWgslUniforms): Float32Array {
  const buf = new Float32Array(16);
  buf[0] = uniforms.viewportWidth;
  buf[1] = uniforms.viewportHeight;
  buf[2] = uniforms.meshScale;
  buf[3] = uniforms.wireframeOpacity;
  buf[4] = uniforms.tintR;
  buf[5] = uniforms.tintG;
  buf[6] = uniforms.tintB;
  buf[7] = uniforms.tintA;
  buf[8] = uniforms.distortionHighlightStrength;
  buf[9] = uniforms.stretchWarnThreshold;
  buf[10] = uniforms.stretchFailThreshold;
  buf[11] = uniforms.activeHandleCount;
  buf[12] = uniforms.offsetX;
  buf[13] = uniforms.offsetY;
  buf[14] = uniforms.pixelRatio;
  buf[15] = uniforms.reservedFlags;
  return buf;
}

/**
 * 16바이트 정렬 64바이트 유니폼 블록을 사용하는 WebGPU WGSL 텍스처 캐릭터 워프 셰이더 번들을 생성한다.
 * WGSL 표준 사전선언 별칭(`vec2f`, `vec3f`, `vec4f`)만 사용해 GLSL 호환 토큰 혼입을 원천 차단한다.
 */
export function buildArapMeshWarpWgsl(
  uniformOverrides?: Partial<ArapWgslUniforms>,
  shaderLabel = "wave159-arap-2d-mesh-warp-shader",
): ArapWgslBundle {
  const merged: ArapWgslUniforms = {
    ...DEFAULT_ARAP_WGSL_UNIFORMS,
    ...uniformOverrides,
  };
  const uniformData = packUniformsToFloat32Array(merged);

  const wgslSource = [
    "// Wave 159: 2D ARAP Character Mesh Warp & Wireframe Overlay Shader (64B aligned uniforms)",
    "struct ArapWarpUniforms {",
    "  viewport_scale_wire: vec4f,",
    "  tint_rgba: vec4f,",
    "  distortion_params: vec4f,",
    "  pan_dpr_flags: vec4f,",
    "};",
    "",
    "@group(0) @binding(0) var<uniform> u_warp: ArapWarpUniforms;",
    "@group(0) @binding(1) var s_artwork: sampler;",
    "@group(0) @binding(2) var t_artwork: texture_2d<f32>;",
    "",
    "struct VertexInput {",
    "  @location(0) deformed_pos: vec2f,",
    "  @location(1) rest_uv: vec2f,",
    "  @location(2) barycentric: vec3f,",
    "  @location(3) distortion_score: f32,",
    "};",
    "",
    "struct VertexOutput {",
    "  @builtin(position) clip_position: vec4f,",
    "  @location(0) uv: vec2f,",
    "  @location(1) barycentric: vec3f,",
    "  @location(2) distortion_score: f32,",
    "};",
    "",
    `@vertex`,
    `fn ${ARAP_WGSL_VERTEX_ENTRY}(input: VertexInput) -> VertexOutput {`,
    "  var out: VertexOutput;",
    "  let vp_w = max(u_warp.viewport_scale_wire.x, 1.0);",
    "  let vp_h = max(u_warp.viewport_scale_wire.y, 1.0);",
    "  let scale = u_warp.viewport_scale_wire.z;",
    "  let sx = input.deformed_pos.x * scale + u_warp.pan_dpr_flags.x;",
    "  let sy = input.deformed_pos.y * scale + u_warp.pan_dpr_flags.y;",
    "  let ndc_x = (sx / vp_w) * 2.0 - 1.0;",
    "  let ndc_y = 1.0 - (sy / vp_h) * 2.0;",
    "  out.clip_position = vec4f(ndc_x, ndc_y, 0.0, 1.0);",
    "  out.uv = input.rest_uv;",
    "  out.barycentric = input.barycentric;",
    "  out.distortion_score = clamp(input.distortion_score, 0.0, 1.0);",
    "  return out;",
    "}",
    "",
    `@fragment`,
    `fn ${ARAP_WGSL_FRAGMENT_ENTRY}(in: VertexOutput) -> @location(0) vec4f {`,
    "  let sampled = textureSample(t_artwork, s_artwork, in.uv);",
    "  var color = sampled * u_warp.tint_rgba;",
    "  let highlight = clamp(u_warp.distortion_params.x, 0.0, 1.0) * in.distortion_score;",
    "  let warn_tint = vec3f(0.92, 0.36, 0.24);",
    "  let shaded_rgb = mix(color.rgb, warn_tint, highlight * 0.55);",
    "  let d_bary = max(fwidth(in.barycentric), vec3f(0.0005));",
    "  let edge_factors = smoothstep(vec3f(0.0), d_bary * 1.35, in.barycentric);",
    "  let min_edge = min(edge_factors.x, min(edge_factors.y, edge_factors.z));",
    "  let wire_alpha = (1.0 - min_edge) * clamp(u_warp.viewport_scale_wire.w, 0.0, 1.0);",
    "  let wire_ink = vec3f(0.14, 0.28, 0.22);",
    "  let final_rgb = mix(shaded_rgb, wire_ink, wire_alpha);",
    "  return vec4f(final_rgb, color.a);",
    "}",
  ].join("\n");

  return {
    shaderLabel,
    wgslSource,
    vertexEntryPoint: ARAP_WGSL_VERTEX_ENTRY,
    fragmentEntryPoint: ARAP_WGSL_FRAGMENT_ENTRY,
    uniformByteLength: ARAP_WGSL_UNIFORM_BYTE_LENGTH,
    uniformData,
    bindings: STANDARD_BINDINGS,
  };
}

function stripWgslLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const commentIdx = line.indexOf("//");
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .join("\n");
}

/**
 * WGSL 셰이더 번들의 정적 계약을 검증한다.
 * - 중괄호/소괄호/대괄호 균형
 * - `@group(g) @binding(b)` 선언 고유성
 * - 16바이트 정렬 유니폼 크기 및 `Float32Array` 바이트 길이 일치
 * - 모든 유니폼 수치의 유한성(`Number.isFinite`)
 * - GLSL 금지 토큰 부재 및 vertex/fragment 엔트리포인트 존재 여부
 */
export function validateArapMeshWarpWgsl(bundle: ArapWgslBundle): ArapWgslValidationResult {
  const issues: string[] = [];
  const code = stripWgslLineComments(bundle.wgslSource);

  // 1. 괄호 균형 검사
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceUnderflow = false;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code.charAt(i);
    if (ch === "{") {
      braceDepth += 1;
    } else if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        braceUnderflow = true;
      }
    } else if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")") {
      parenDepth -= 1;
    } else if (ch === "[") {
      bracketDepth += 1;
    } else if (ch === "]") {
      bracketDepth -= 1;
    }
  }
  if (braceDepth !== 0 || braceUnderflow) {
    issues.push(`WGSL 중괄호 균형이 맞지 않습니다 (잔여 delta=${braceDepth}).`);
  }
  if (parenDepth !== 0) {
    issues.push(`WGSL 소괄호 균형이 맞지 않습니다 (잔여 delta=${parenDepth}).`);
  }
  if (bracketDepth !== 0) {
    issues.push(`WGSL 대괄호 균형이 맞지 않습니다 (잔여 delta=${bracketDepth}).`);
  }

  // 2. 16바이트 유니폼 정렬 및 버퍼 길이 검사
  if (
    !Number.isInteger(bundle.uniformByteLength) ||
    bundle.uniformByteLength <= 0 ||
    bundle.uniformByteLength % 16 !== 0
  ) {
    issues.push(
      `유니폼 버퍼 크기(${bundle.uniformByteLength}B)는 16바이트의 양의 배수여야 합니다.`,
    );
  }
  if (bundle.uniformData.byteLength !== bundle.uniformByteLength) {
    issues.push(
      `유니폼 데이터 실제 크기(${bundle.uniformData.byteLength}B)가 선언 크기(${bundle.uniformByteLength}B)와 다릅니다.`,
    );
  }

  // 3. 유니폼 수치 유한성 검사
  for (let i = 0; i < bundle.uniformData.length; i += 1) {
    const val = bundle.uniformData[i];
    if (!Number.isFinite(val)) {
      issues.push(`유니폼 슬롯 [${i}]에 비유한 숫자(${String(val)})가 포함돼 있습니다.`);
    }
  }

  // 4. @group/@binding 고유성 검사
  const bindingRegex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)/g;
  const seenBindings = new Set<string>();
  let bindingCount = 0;
  let match = bindingRegex.exec(code);
  while (match !== null) {
    const key = `${match[1]}:${match[2]}`;
    bindingCount += 1;
    if (seenBindings.has(key)) {
      issues.push(`중복된 바인딩 슬롯이 감지됐습니다: @group(${match[1]}) @binding(${match[2]}).`);
    } else {
      seenBindings.add(key);
    }
    match = bindingRegex.exec(code);
  }
  if (bindingCount === 0) {
    issues.push("WGSL 소스에 @group/@binding 선언이 없습니다.");
  }

  // 5. 엔트리포인트 존재 검사
  if (!code.includes("@vertex") || !code.includes(`fn ${bundle.vertexEntryPoint}`)) {
    issues.push(`버텍스 엔트리포인트 '${bundle.vertexEntryPoint}'를 찾을 수 없습니다.`);
  }
  if (!code.includes("@fragment") || !code.includes(`fn ${bundle.fragmentEntryPoint}`)) {
    issues.push(`프래그먼트 엔트리포인트 '${bundle.fragmentEntryPoint}'를 찾을 수 없습니다.`);
  }

  // 6. GLSL 금지 토큰 검사
  GLSL_FORBIDDEN_TOKEN_REGEX.lastIndex = 0;
  const forbiddenFound = new Set<string>();
  let glslMatch = GLSL_FORBIDDEN_TOKEN_REGEX.exec(code);
  while (glslMatch !== null) {
    forbiddenFound.add(glslMatch[0]);
    glslMatch = GLSL_FORBIDDEN_TOKEN_REGEX.exec(code);
  }
  if (forbiddenFound.size > 0) {
    issues.push(
      `WGSL 소스에 금지된 GLSL 토큰이 포함돼 있습니다: ${Array.from(forbiddenFound).join(", ")}.`,
    );
  }

  return {
    valid: issues.length === 0,
    issues,
    uniformByteLength: bundle.uniformByteLength,
    braceDelta: braceDepth,
    bindingCount,
  };
}
