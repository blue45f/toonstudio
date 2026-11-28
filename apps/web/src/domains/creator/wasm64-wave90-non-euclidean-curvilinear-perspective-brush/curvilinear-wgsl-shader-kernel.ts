/**
 * Wave 90 — 곡면 투시 실시간 굴절 브러시·가이드 오버레이 WebGPU WGSL 셰이더 생성기 및 검증기.
 */

import type { CurvilinearProjectionMode } from "./curvilinear-math-types";

export interface WgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface CurvilinearWgslShaderArtifact {
  readonly mode: CurvilinearProjectionMode;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly WgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
}

export interface WgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

function buildWgslProjectionBody(mode: CurvilinearProjectionMode): string {
  switch (mode) {
    case "4pt-cylindrical":
      return [
        "  let r_yz = length(vec2<f32>(u.y, u.z));",
        "  let alpha = atan2(u.x, r_yz);",
        "  let beta = select(0.0, atan2(u.y, u.z), r_yz > 1e-6);",
        "  let sx = u_cam.viewport_size.x * 0.5 + u_cam.focal_and_fov.x * alpha;",
        "  let sy = u_cam.viewport_size.y * 0.5 - u_cam.focal_and_fov.x * beta * cos(alpha);",
        "  let visible = select(0.0, 1.0, u.z >= 0.0 && abs(alpha) <= u_cam.focal_and_fov.y);",
        "  return vec4<f32>(sx, sy, dist, visible);",
      ].join("\n");
    case "5pt-fisheye-equidistant":
      return [
        "  let rho = length(u.xy);",
        "  let theta = atan2(rho, u.z);",
        "  let r = u_cam.focal_and_fov.x * theta;",
        "  let dir = select(vec2<f32>(0.0, 0.0), u.xy / rho, rho > 1e-6);",
        "  let sx = u_cam.viewport_size.x * 0.5 + r * dir.x;",
        "  let sy = u_cam.viewport_size.y * 0.5 - r * dir.y;",
        "  let visible = select(0.0, 1.0, theta <= u_cam.focal_and_fov.y);",
        "  return vec4<f32>(sx, sy, dist, visible);",
      ].join("\n");
    case "5pt-fisheye-equisolid":
      return [
        "  let rho = length(u.xy);",
        "  let theta = atan2(rho, u.z);",
        "  let r = 2.0 * u_cam.focal_and_fov.x * sin(theta * 0.5);",
        "  let dir = select(vec2<f32>(0.0, 0.0), u.xy / rho, rho > 1e-6);",
        "  let sx = u_cam.viewport_size.x * 0.5 + r * dir.x;",
        "  let sy = u_cam.viewport_size.y * 0.5 - r * dir.y;",
        "  let visible = select(0.0, 1.0, theta <= u_cam.focal_and_fov.y);",
        "  return vec4<f32>(sx, sy, dist, visible);",
      ].join("\n");
    case "5pt-fisheye-stereographic":
      return [
        "  let rho = length(u.xy);",
        "  let theta = min(atan2(rho, u.z), 3.12);",
        "  let r = 2.0 * u_cam.focal_and_fov.x * tan(theta * 0.5);",
        "  let dir = select(vec2<f32>(0.0, 0.0), u.xy / rho, rho > 1e-6);",
        "  let sx = u_cam.viewport_size.x * 0.5 + r * dir.x;",
        "  let sy = u_cam.viewport_size.y * 0.5 - r * dir.y;",
        "  let visible = select(0.0, 1.0, theta <= u_cam.focal_and_fov.y);",
        "  return vec4<f32>(sx, sy, dist, visible);",
      ].join("\n");
    case "5pt-panini":
      return [
        "  let d = clamp(u_cam.mode_params.x, 0.0, 1.0);",
        "  let r_xz = max(length(vec2<f32>(u.x, u.z)), 1e-6);",
        "  let sin_l = u.x / r_xz;",
        "  let cos_l = u.z / r_xz;",
        "  let denom = max(d + cos_l, 1e-5);",
        "  let scale_p = (d + 1.0) / denom;",
        "  let sx = u_cam.viewport_size.x * 0.5 + u_cam.focal_and_fov.x * scale_p * sin_l;",
        "  let sy = u_cam.viewport_size.y * 0.5 - u_cam.focal_and_fov.x * scale_p * (u.y / r_xz);",
        "  let lambda = abs(atan2(u.x, u.z));",
        "  let visible = select(0.0, 1.0, lambda <= u_cam.focal_and_fov.y && denom > 1e-4);",
        "  return vec4<f32>(sx, sy, dist, visible);",
      ].join("\n");
    case "6pt-spherical-dual":
      return [
        "  let is_front = u.z >= 0.0;",
        "  let rho = length(u.xy);",
        "  let theta_h = atan2(rho, select(-u.z, u.z, is_front));",
        "  let r = u_cam.focal_and_fov.x * theta_h;",
        "  let dir_x = select(0.0, select(-u.x, u.x, is_front) / rho, rho > 1e-6);",
        "  let dir_y = select(0.0, u.y / rho, rho > 1e-6);",
        "  let disk_cx = select(u_cam.viewport_size.x * 0.75, u_cam.viewport_size.x * 0.25, is_front);",
        "  let sx = disk_cx + r * dir_x;",
        "  let sy = u_cam.viewport_size.y * 0.5 - r * dir_y;",
        "  let visible = select(0.0, 1.0, theta_h <= 1.5707964);",
        "  return vec4<f32>(sx, sy, dist, visible);",
      ].join("\n");
  }
}

/**
 * 선택한 곡면 투시 모드에 맞는 WebGPU WGSL 컴퓨트/프래그먼트 셰이더를 생성한다.
 */
export function buildCurvilinearRefractionWgsl(
  cameraMode: CurvilinearProjectionMode,
): CurvilinearWgslShaderArtifact {
  const projectionBody = buildWgslProjectionBody(cameraMode);
  const bindings: readonly WgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_cam", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_stamps_in", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_stamps_out", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 90 Non-Euclidean Curvilinear Perspective WGSL Kernel (${cameraMode})
struct CurvilinearCameraUniforms {
  viewport_size: vec2<f32>,
  focal_and_fov: vec2<f32>,
  eye_pos: vec4<f32>,
  cam_right: vec4<f32>,
  cam_up: vec4<f32>,
  cam_forward: vec4<f32>,
  mode_params: vec4<f32>,
};

struct BrushStampInput {
  world_pos: vec4<f32>,
  pressure_tilt_width: vec4<f32>,
};

struct BrushStampOutput {
  screen_xy_depth_vis: vec4<f32>,
  nib_major_minor_angle_alpha: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_cam: CurvilinearCameraUniforms;
@group(0) @binding(1) var<storage, read> b_stamps_in: array<BrushStampInput>;
@group(0) @binding(2) var<storage, read_write> b_stamps_out: array<BrushStampOutput>;

fn project_world_to_curvilinear(world_pos: vec3<f32>) -> vec4<f32> {
  let delta = world_pos - u_cam.eye_pos.xyz;
  let dist = max(length(delta), 1e-4);
  let cam_v = vec3<f32>(
    dot(delta, u_cam.cam_right.xyz),
    dot(delta, u_cam.cam_up.xyz),
    dot(delta, u_cam.cam_forward.xyz)
  );
  let u = cam_v / dist;
${projectionBody}
}

fn compute_jacobian_anisotropy(world_pos: vec3<f32>) -> vec4<f32> {
  let delta = world_pos - u_cam.eye_pos.xyz;
  let dist = max(length(delta), 1e-4);
  let ray = delta / dist;
  let ref_v = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(ray.y) > 0.92);
  let t1 = normalize(cross(ref_v, ray));
  let t2 = cross(ray, t1);
  let h = max(dist * 1e-3, 1e-3);
  let p1p = project_world_to_curvilinear(world_pos + t1 * h).xy;
  let p1m = project_world_to_curvilinear(world_pos - t1 * h).xy;
  let p2p = project_world_to_curvilinear(world_pos + t2 * h).xy;
  let p2m = project_world_to_curvilinear(world_pos - t2 * h).xy;
  let inv2h = 0.5 / h;
  let j00 = (p1p.x - p1m.x) * inv2h;
  let j10 = (p1p.y - p1m.y) * inv2h;
  let j01 = (p2p.x - p2m.x) * inv2h;
  let j11 = (p2p.y - p2m.y) * inv2h;
  let a = j00 * j00 + j01 * j01;
  let b = j00 * j10 + j01 * j11;
  let c = j10 * j10 + j11 * j11;
  let tr = a + c;
  let hd = 0.5 * length(vec2<f32>(a - c, 2.0 * b));
  let s_max = sqrt(max(1e-8, 0.5 * tr + hd));
  let s_min = sqrt(max(1e-8, 0.5 * tr - hd));
  return vec4<f32>(s_max, s_min, 0.5 * atan2(2.0 * b, a - c), s_max * s_min);
}

@compute @workgroup_size(64)
fn cs_refract_brush_stamps(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&b_stamps_in)) { return; }
  let src = b_stamps_in[idx];
  let proj = project_world_to_curvilinear(src.world_pos.xyz);
  let jac = compute_jacobian_anisotropy(src.world_pos.xyz);
  let ref_scale = max(u_cam.mode_params.y, 1e-4);
  let pressure = clamp(src.pressure_tilt_width.x, 0.05, 1.0);
  let base_w = max(src.pressure_tilt_width.w, 0.5);
  let major_w = clamp(base_w * (0.2 + 0.8 * pressure) * (jac.x / ref_scale), 0.5, base_w * 2.5);
  let minor_w = clamp(base_w * (0.2 + 0.8 * pressure) * (jac.y / ref_scale), 0.25, major_w);
  b_stamps_out[idx].screen_xy_depth_vis = proj;
  b_stamps_out[idx].nib_major_minor_angle_alpha = vec4<f32>(major_w, minor_w, jac.z, clamp(0.45 + 0.55 * pressure, 0.05, 1.0));
}

@fragment
fn fs_curvilinear_guide_overlay(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = (frag_coord.xy - u_cam.viewport_size * 0.5) / max(min(u_cam.viewport_size.x, u_cam.viewport_size.y) * 0.48, 1.0);
  let ring_alpha = smoothstep(0.035, 0.0, abs(fract(length(uv) * 4.0) - 0.5)) * 0.35;
  let horizon_alpha = smoothstep(0.015, 0.0, abs(uv.y)) * 0.65;
  return vec4<f32>(0.12, 0.27, 0.21, clamp(max(ring_alpha, horizon_alpha), 0.0, 0.85));
}
`;

  return {
    mode: cameraMode,
    wgsl,
    uniformBufferByteLength: 96,
    bindings,
    entryPoints: ["cs_refract_brush_stamps", "fs_curvilinear_guide_overlay"],
  };
}

/**
 * 생성된 WGSL 셰이더의 구조, 괄호 균형, 바인딩 선언, 유니폼 16바이트 정렬을 검증한다.
 */
export function validateCurvilinearWgsl(
  artifact: CurvilinearWgslShaderArtifact,
): WgslValidationReport {
  const errors: string[] = [];
  const src = artifact.wgsl;

  if (src.trim().length === 0) errors.push("WGSL 셰이더 본문이 비어 있습니다.");
  if (artifact.uniformBufferByteLength <= 0 || artifact.uniformBufferByteLength % 16 !== 0) {
    errors.push("유니폼 버퍼 크기는 16바이트 배수여야 합니다.");
  }
  if (src.includes("NaN") || src.includes("undefined") || src.includes("Infinity")) {
    errors.push("WGSL 코드에 유효하지 않은 수치 리터럴(NaN/undefined/Infinity)이 포함되었습니다.");
  }
  if (!src.includes("struct CurvilinearCameraUniforms")) {
    errors.push("CurvilinearCameraUniforms 구조체 선언이 누락되었습니다.");
  }
  if (!src.includes("@group(0) @binding(0)")) {
    errors.push("카메라 유니폼 바인딩(@group(0) @binding(0))이 누락되었습니다.");
  }
  if (!src.includes("@compute @workgroup_size(64)")) {
    errors.push("컴퓨트 셰이더 엔트리포인트가 누락되었습니다.");
  }
  if (!src.includes("@fragment")) {
    errors.push("프래그먼트 가이드 오버레이 엔트리포인트가 누락되었습니다.");
  }

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      errors.push("WGSL 중괄호 또는 소괄호 짝이 맞지 않습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push("WGSL 중괄호가 닫히지 않았습니다.");
  if (parenDepth !== 0) errors.push("WGSL 소괄호가 닫히지 않았습니다.");

  return { valid: errors.length === 0, errors, lineCount: src.split("\n").length };
}
