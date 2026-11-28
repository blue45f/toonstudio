/**
 * Wave 147 — WebGPU WGSL 21-관절 손 캡슐 SDF & 외곽선 실루엣 가이드 셰이더 생성기·검증기.
 *
 * - 16바이트 정렬 64바이트 유니폼 구조체(`HandGuideUniforms`)
 * - 20개 캡슐 세그먼트 부드러운 합집합(Smooth-Min) SDF 평가 및 외곽선·가려짐 경계 검출
 * - 괄호 균형, 바인딩 일치, 16B 정렬, 엔트리포인트, GLSL 금지어 정밀 검증
 */

export type HandGuideShaderMode =
  | "silhouette-outline"
  | "penetration-heatmap"
  | "anatomy-wireframe";

export interface HandGuideWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface HandCapsuleGuideWgslArtifact {
  readonly mode: HandGuideShaderMode;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly capsuleSegmentCount: number;
  readonly jointMarkerCount: number;
  readonly bindings: readonly HandGuideWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
}

export interface HandCapsuleGuideWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

interface ModeSnippetSpec {
  readonly modeIndex: number;
  readonly shadingSnippet: string;
}

function getModeSnippet(mode: HandGuideShaderMode): ModeSnippetSpec {
  switch (mode) {
    case "silhouette-outline":
      return {
        modeIndex: 0,
        shadingSnippet: [
          "  let outline_px = max(u_hand.viewport_and_outline.z, 1.0);",
          "  let edge_alpha = 1.0 - smoothstep(outline_px * 0.45, outline_px * 1.15, abs(sdf_res.x));",
          "  let seam_hit = select(0.0, 1.0, sdf_res.z < outline_px * 1.2 && sdf_res.x < 0.0);",
          "  let body_fill = 1.0 - smoothstep(-0.75, 0.75, sdf_res.x);",
          "  let base_luma = mix(0.96, 0.16, max(edge_alpha, seam_hit * 0.75));",
          "  let tint_r = mix(base_luma, 0.24, body_fill * (1.0 - edge_alpha) * 0.22);",
          "  let tint_g = mix(base_luma, 0.38, body_fill * (1.0 - edge_alpha) * 0.28);",
          "  let tint_b = mix(base_luma, 0.34, body_fill * (1.0 - edge_alpha) * 0.25);",
          "  let alpha = clamp(max(body_fill * 0.35, max(edge_alpha, seam_hit * 0.85)), 0.0, 1.0);",
        ].join("\n"),
      };
    case "penetration-heatmap":
      return {
        modeIndex: 1,
        shadingSnippet: [
          "  let outline_px = max(u_hand.viewport_and_outline.z, 1.0);",
          "  let prop_dist = length(px_pos - u_hand.prop_center_and_radius.xy) - u_hand.prop_center_and_radius.w;",
          "  let overlap = clamp(-max(sdf_res.x, prop_dist) / max(outline_px * 3.0, 1.0), 0.0, 1.0);",
          "  let body_fill = 1.0 - smoothstep(-0.75, 0.75, sdf_res.x);",
          "  let edge_alpha = 1.0 - smoothstep(outline_px * 0.4, outline_px * 1.1, abs(sdf_res.x));",
          "  let tint_r = mix(0.22, 0.86, overlap);",
          "  let tint_g = mix(0.54, 0.22, overlap);",
          "  let tint_b = mix(0.42, 0.20, overlap);",
          "  let alpha = clamp(max(body_fill * 0.62, edge_alpha), 0.0, 1.0);",
        ].join("\n"),
      };
    case "anatomy-wireframe":
      return {
        modeIndex: 2,
        shadingSnippet: [
          "  let outline_px = max(u_hand.viewport_and_outline.z, 1.0);",
          "  let edge_alpha = 1.0 - smoothstep(outline_px * 0.35, outline_px * 0.95, abs(sdf_res.x));",
          "  let finger_ratio = clamp(sdf_res.y / 5.0, 0.0, 1.0);",
          "  let tint_r = mix(0.18, 0.56, finger_ratio);",
          "  let tint_g = mix(0.46, 0.32, finger_ratio);",
          "  let tint_b = mix(0.42, 0.62, finger_ratio);",
          "  let alpha = clamp(edge_alpha * 0.95, 0.0, 1.0);",
        ].join("\n"),
      };
  }
}

/**
 * 21-관절 손 20개 캡슐 세그먼트 SDF 및 외곽선 실루엣 검출용 WebGPU WGSL 셰이더를 생성한다.
 */
export function buildHandCapsuleGuideWgsl(
  mode: HandGuideShaderMode = "silhouette-outline",
): HandCapsuleGuideWgslArtifact {
  const cfg = getModeSnippet(mode);
  const bindings: readonly HandGuideWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_hand", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_capsules", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_joint_markers", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_silhouette_audit", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 147 21-Joint Hand Capsule SDF & Silhouette Guide WGSL (${mode}, mode_idx=${cfg.modeIndex})
// Uniform layout: 4 x 16B = 64 bytes (16-byte aligned), 20 bone capsules + 21 joint markers
struct HandGuideUniforms {
  viewport_and_outline: vec4<f32>,
  camera_pos_and_focal: vec4<f32>,
  prop_center_and_radius: vec4<f32>,
  flags_and_counts: vec4<u32>,
};

struct HandCapsuleSegment {
  a_and_radius: vec4<f32>,
  b_and_finger: vec4<f32>,
};

struct HandJointMarker {
  xy_depth_radius: vec4<f32>,
};

struct SilhouetteAuditSample {
  sdf_finger_seam_flag: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_hand: HandGuideUniforms;
@group(0) @binding(1) var<storage, read> b_capsules: array<HandCapsuleSegment>;
@group(0) @binding(2) var<storage, read> b_joint_markers: array<HandJointMarker>;
@group(0) @binding(3) var<storage, read_write> b_silhouette_audit: array<SilhouetteAuditSample>;

fn sd_capsule_2d(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let denom = max(dot(ba, ba), 1e-5);
  let h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba * h) - r;
}

fn smin_cubic(a: f32, b: f32, k: f32) -> f32 {
  let kk = max(k, 1e-4);
  let h = max(kk - abs(a - b), 0.0) / kk;
  return min(a, b) - h * h * h * kk * (1.0 / 6.0);
}

// 20개 캡슐 세그먼트 SDF 평가: (smooth_min_sdf, closest_finger_id, inter_finger_seam_gap)
fn eval_hand_20capsule_sdf(p: vec2<f32>) -> vec3<f32> {
  let seg_limit = min(min(u_hand.flags_and_counts.x, 20u), arrayLength(&b_capsules));
  let smooth_k = max(u_hand.viewport_and_outline.w, 0.5);
  var smooth_d = 1e6;
  var best_d = 1e6;
  var second_finger_d = 1e6;
  var best_finger = 0.0;

  for (var i: u32 = 0u; i < seg_limit; i = i + 1u) {
    let seg = b_capsules[i];
    let d = sd_capsule_2d(p, seg.a_and_radius.xy, seg.b_and_finger.xy, max(seg.a_and_radius.w, 1.0));
    smooth_d = select(smin_cubic(smooth_d, d, smooth_k), d, i == 0u);
    let finger_id = seg.b_and_finger.w;
    if (d < best_d) {
      if (abs(finger_id - best_finger) > 0.5) {
        second_finger_d = best_d;
      }
      best_d = d;
      best_finger = finger_id;
    } else if (abs(finger_id - best_finger) > 0.5 && d < second_finger_d) {
      second_finger_d = d;
    }
  }

  let seam_gap = abs(second_finger_d - best_d);
  return vec3<f32>(smooth_d, best_finger, seam_gap);
}

@compute @workgroup_size(64)
fn cs_hand_capsule_sdf_audit(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&b_joint_markers) || idx >= arrayLength(&b_silhouette_audit)) {
    return;
  }
  let marker = b_joint_markers[idx].xy_depth_radius;
  let sdf_res = eval_hand_20capsule_sdf(marker.xy);
  let outline_px = max(u_hand.viewport_and_outline.z, 1.0);
  let overlap_flag = select(0.0, 1.0, sdf_res.z < outline_px * 1.5);
  b_silhouette_audit[idx].sdf_finger_seam_flag = vec4<f32>(sdf_res.x, sdf_res.y, sdf_res.z, overlap_flag);
}

@fragment
fn fs_hand_silhouette_guide(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let px_pos = frag_coord.xy;
  let sdf_res = eval_hand_20capsule_sdf(px_pos);
${cfg.shadingSnippet}
  return vec4<f32>(clamp(tint_r, 0.0, 1.0), clamp(tint_g, 0.0, 1.0), clamp(tint_b, 0.0, 1.0), alpha);
}
`;

  return {
    mode,
    wgsl,
    uniformBufferByteLength: 64,
    capsuleSegmentCount: 20,
    jointMarkerCount: 21,
    bindings,
    entryPoints: ["cs_hand_capsule_sdf_audit", "fs_hand_silhouette_guide"],
  };
}

const FORBIDDEN_GLSL_RULES: readonly { readonly label: string; readonly regex: RegExp }[] = [
  { label: "gl_FragCoord", regex: /\bgl_FragCoord\b/ },
  { label: "gl_FragColor", regex: /\bgl_FragColor\b/ },
  { label: "gl_Position", regex: /\bgl_Position\b/ },
  { label: "GLSL vec2/3/4 생성자", regex: /\bvec[234]\s*\(/ },
  { label: "GLSL sampler2D", regex: /\bsampler2D\b/ },
  { label: "GLSL texture2D", regex: /\btexture2D\s*\(/ },
  { label: "GLSL dFdx/dFdy", regex: /\bdFd[xy]\s*\(/ },
  { label: "GLSL uniform 선언", regex: /(^|\n)\s*uniform\s+\w+/ },
  { label: "GLSL varying/attribute", regex: /\b(varying|attribute)\b/ },
  { label: "GLSL #version 전처리기", regex: /(^|\n)\s*#version\b/ },
];

function stripWgslLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

function checkBalancedDelimiters(source: string): string | null {
  const stack: string[] = [];
  const pairs: Readonly<Record<string, string>> = {
    ")": "(",
    "}": "{",
    "]": "[",
  };
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === ")" || ch === "}" || ch === "]") {
      const expected = pairs[ch];
      const top = stack.pop();
      if (top !== expected) {
        return `WGSL 괄호 짝이 맞지 않습니다(예상: ${expected ?? "?"}, 발견: ${ch}).`;
      }
    }
  }
  if (stack.length > 0) {
    return `닫히지 않은 WGSL 괄호가 ${stack.length}개 남았습니다.`;
  }
  return null;
}

/**
 * 생성된 Wave 147 손 캡슐 SDF WGSL 셰이더의 괄호 균형, 바인딩, 16B 정렬, GLSL 금지어를 검증한다.
 */
export function validateHandCapsuleGuideWgsl(
  artifact: HandCapsuleGuideWgslArtifact,
): HandCapsuleGuideWgslValidationReport {
  const errors: string[] = [];
  const src = artifact.wgsl;
  const codeOnly = stripWgslLineComments(src);

  if (codeOnly.trim().length === 0) {
    errors.push("WGSL 셰이더 본문이 비어 있습니다.");
  }
  if (
    !Number.isInteger(artifact.uniformBufferByteLength) ||
    artifact.uniformBufferByteLength <= 0 ||
    artifact.uniformBufferByteLength % 16 !== 0
  ) {
    errors.push(
      `유니폼 버퍼 크기(${artifact.uniformBufferByteLength}B)는 16바이트 배수여야 합니다.`,
    );
  }
  if (artifact.capsuleSegmentCount !== 20) {
    errors.push(`21-관절 손 캡슐 세그먼트 수는 20개여야 합니다(현재: ${artifact.capsuleSegmentCount}).`);
  }
  if (artifact.jointMarkerCount !== 21) {
    errors.push(`손 관절 마커 수는 21개여야 합니다(현재: ${artifact.jointMarkerCount}).`);
  }

  const delimiterError = checkBalancedDelimiters(codeOnly);
  if (delimiterError !== null) {
    errors.push(delimiterError);
  }

  const requiredTokens = [
    "struct HandGuideUniforms",
    "struct HandCapsuleSegment",
    "fn sd_capsule_2d",
    "fn eval_hand_20capsule_sdf",
    "@compute",
    "@fragment",
  ];
  for (let i = 0; i < requiredTokens.length; i += 1) {
    const token = requiredTokens[i];
    if (token !== undefined && !codeOnly.includes(token)) {
      errors.push(`필수 WGSL 심볼이 누락되었습니다: ${token}`);
    }
  }

  for (let i = 0; i < artifact.bindings.length; i += 1) {
    const b = artifact.bindings[i];
    if (b === undefined) {
      continue;
    }
    const decl = `@group(${b.group}) @binding(${b.binding})`;
    if (!codeOnly.includes(decl) || !codeOnly.includes(b.name)) {
      errors.push(`WGSL 바인딩 선언이 누락되었습니다: ${decl} (${b.name})`);
    }
  }

  for (let i = 0; i < artifact.entryPoints.length; i += 1) {
    const ep = artifact.entryPoints[i];
    if (ep !== undefined && !codeOnly.includes(`fn ${ep}(`)) {
      errors.push(`엔트리포인트 함수가 누락되었습니다: ${ep}`);
    }
  }

  for (let i = 0; i < FORBIDDEN_GLSL_RULES.length; i += 1) {
    const rule = FORBIDDEN_GLSL_RULES[i];
    if (rule !== undefined && rule.regex.test(codeOnly)) {
      errors.push(`GLSL 금지 문법이 감지되었습니다: ${rule.label}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: src.length === 0 ? 0 : src.split("\n").length,
  };
}
