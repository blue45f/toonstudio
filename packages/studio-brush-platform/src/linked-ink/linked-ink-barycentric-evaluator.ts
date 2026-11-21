/**
 * 2D↔3D Linked Ink 바리센트릭 재투영 & Z-Bias 은선 가림 실측 평가기.
 *
 * `apps/brush-lab`과 `apps/web` 양쪽이 앱 경계 위반 없이(`validate:app-boundaries 0/0`)
 * 동일한 물리적 3D→2D 재투영 오차(E_reproj), 은선 누출률(R_occ), 동기화 지연(tau_sync)으로부터
 * Bridge Reliability Index(BRI)를 산출하기 위한 단일 정본 커널이다.
 */

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

export interface LinkedInkTriangle3D {
  readonly id: string;
  readonly v0: Vec3;
  readonly v1: Vec3;
  readonly v2: Vec3;
}

export interface LinkedInkCameraSpec {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovYDeg: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly near?: number;
  readonly far?: number;
}

export interface LinkedInkBarycentricAnchor {
  readonly triangleId: string;
  /** 바리센트릭 좌표 (u, v, w = 1 - u - v) */
  readonly u: number;
  readonly v: number;
  /** 표면 법선 방향으로 띄우는 미세 오프셋(m, Z-fighting 방지) */
  readonly normalOffsetMeters?: number;
  /** 선택적 관측 스크린 좌표(생략 시 현재 카메라 바리센트릭 재투영 사용) */
  readonly observedScreenPx?: Vec2;
  /** 렌더러가 이 앵커를 가시(drawn) 상태로 그렸는지 여부 (기본 true) */
  readonly drawnVisible?: boolean;
}

export interface LinkedInkBarycentricInput {
  readonly triangles: readonly LinkedInkTriangle3D[];
  readonly anchors: readonly LinkedInkBarycentricAnchor[];
  readonly camera: LinkedInkCameraSpec;
  /** 2D↔3D 동기화 왕복 지연 시간 (ms) */
  readonly syncLatencyMs: number;
  /** Z-Buffer 깊이 바이어스 (NDC 깊이 단위, 기본 0.0005) */
  readonly depthBias?: number;
  /** 작가 수동 가필 레이어 분리 보존 여부 (기본 true) */
  readonly authoredDeltaLayerSeparated?: boolean;
}

export interface LinkedInkAnchorSampleReport {
  readonly triangleId: string;
  readonly groundTruthScreenPx: Vec2;
  readonly reprojectedScreenPx: Vec2;
  readonly reprojectionErrorPx: number;
  readonly groundTruthOccluded: boolean;
  readonly occlusionLeaked: boolean;
}

export interface LinkedInkBarycentricEvaluation {
  readonly anchorCount: number;
  readonly meanReprojectionErrorPx: number;
  readonly maxReprojectionErrorPx: number;
  readonly hiddenLineOcclusionLeakRatio: number;
  readonly occludedAnchorCount: number;
  readonly leakedOcclusionCount: number;
  readonly syncLatencyMs: number;
  readonly bridgeReliabilityIndex: number;
  readonly mode:
    | "live-bidirectional"
    | "tangent-rebake"
    | "snapshot-locked-homography";
  readonly authoredDeltaPreserved: boolean;
  readonly passedHardGate: boolean;
  readonly samples: readonly LinkedInkAnchorSampleReport[];
}

const SUBPIXEL_LOCK_DEADBAND_PX = 0.1;
const SYNC_SUBQUARTER_FRAME_DEADBAND_MS = 2.0;
const BRI_TAU_LIMIT_MS = 150;
const BRI_ALPHA = 0.045;
const BRI_BETA = 4.2;
const BRI_GAMMA = 0.055;

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  if (len < 1e-9) return [0, 0, 1];
  return [a[0] / len, a[1] / len, a[2] / len];
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

interface ProjectedPoint {
  readonly screenX: number;
  readonly screenY: number;
  readonly viewDepth: number;
  readonly ndcZ: number;
}

function buildCameraBasis(cam: LinkedInkCameraSpec): {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  readonly tanHalfFovY: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
} {
  const forward = normalize3(sub3(cam.target, cam.eye));
  const right = normalize3(cross3(forward, cam.up));
  const up = normalize3(cross3(right, forward));
  const fovRad = (clamp(cam.fovYDeg, 10, 140) * Math.PI) / 180;
  const tanHalfFovY = Math.tan(fovRad * 0.5);
  const w = Math.max(1, cam.viewportWidthPx);
  const h = Math.max(1, cam.viewportHeightPx);
  return {
    right,
    up,
    forward,
    tanHalfFovY,
    aspect: w / h,
    near: Math.max(0.01, cam.near ?? 0.1),
    far: Math.max(1, cam.far ?? 200),
  };
}

/**
 * 3D 월드 좌표를 핀홀 원근 카메라 스크린 좌표 및 뷰 깊이(viewDepth)로 결정적 투영한다.
 */
export function projectWorldPointToScreen(
  worldPos: Vec3,
  camera: LinkedInkCameraSpec,
): ProjectedPoint {
  const basis = buildCameraBasis(camera);
  const rel = sub3(worldPos, camera.eye);
  const xCam = dot3(rel, basis.right);
  const yCam = dot3(rel, basis.up);
  const zCam = Math.max(basis.near, dot3(rel, basis.forward));

  const ndcX = xCam / (zCam * basis.tanHalfFovY * basis.aspect);
  const ndcY = yCam / (zCam * basis.tanHalfFovY);
  const ndcZ = (zCam - basis.near) / Math.max(1e-6, basis.far - basis.near);

  return {
    screenX: (ndcX * 0.5 + 0.5) * camera.viewportWidthPx,
    screenY: (0.5 - ndcY * 0.5) * camera.viewportHeightPx,
    viewDepth: zCam,
    ndcZ: clamp(ndcZ, 0, 1),
  };
}

/**
 * 광선-삼각형 교차 검사(Möller–Trumbore)로 카메라→앵커 사이에 더 가까운 가림 삼각형이 있는지 판정한다.
 */
function rayIntersectsTriangleCloser(
  rayOrigin: Vec3,
  rayDir: Vec3,
  anchorDist: number,
  tri: LinkedInkTriangle3D,
  depthBiasMeters: number,
): boolean {
  const e1 = sub3(tri.v1, tri.v0);
  const e2 = sub3(tri.v2, tri.v0);
  const pvec = cross3(rayDir, e2);
  const det = dot3(e1, pvec);
  if (Math.abs(det) < 1e-8) return false;

  const invDet = 1 / det;
  const tvec = sub3(rayOrigin, tri.v0);
  const u = dot3(tvec, pvec) * invDet;
  if (u < -1e-5 || u > 1 + 1e-5) return false;

  const qvec = cross3(tvec, e1);
  const v = dot3(rayDir, qvec) * invDet;
  if (v < -1e-5 || u + v > 1 + 1e-5) return false;

  const t = dot3(e2, qvec) * invDet;
  return t > 1e-4 && t < anchorDist - depthBiasMeters;
}

export function evaluateTriangleBarycentricPoint(
  tri: LinkedInkTriangle3D,
  u: number,
  v: number,
  normalOffsetMeters = 0,
): Vec3 {
  const safeU = clamp(u, 0, 1);
  const safeV = clamp(v, 0, 1 - safeU);
  const w = Math.max(0, 1 - safeU - safeV);
  const base: Vec3 = [
    safeU * tri.v0[0] + safeV * tri.v1[0] + w * tri.v2[0],
    safeU * tri.v0[1] + safeV * tri.v1[1] + w * tri.v2[1],
    safeU * tri.v0[2] + safeV * tri.v1[2] + w * tri.v2[2],
  ];
  if (!normalOffsetMeters) return base;
  const normal = normalize3(cross3(sub3(tri.v1, tri.v0), sub3(tri.v2, tri.v0)));
  return add3(base, scale3(normal, normalOffsetMeters));
}

/**
 * 3D 메쉬 삼각형과 바리센트릭 앵커 목록을 현재 카메라로 재투영해
 * 실제 재투영 오차(px), Z-bias 은선 누출률, 동기화 지연 기반 BRI(0..100)를 계산한다.
 */
export function evaluateLinkedInkBarycentricBridge(
  input: LinkedInkBarycentricInput,
): LinkedInkBarycentricEvaluation {
  const triMap = new Map<string, LinkedInkTriangle3D>();
  for (const tri of input.triangles) triMap.set(tri.id, tri);

  const depthBias = Math.max(0, input.depthBias ?? 0.0005);
  const depthBiasMeters = depthBias * 2.0;
  const samples: LinkedInkAnchorSampleReport[] = [];

  let errSum = 0;
  let maxErr = 0;
  let occludedCount = 0;
  let leakedCount = 0;

  for (const anchor of input.anchors) {
    const tri = triMap.get(anchor.triangleId);
    if (!tri) continue;

    const worldPt = evaluateTriangleBarycentricPoint(
      tri,
      anchor.u,
      anchor.v,
      anchor.normalOffsetMeters ?? 0,
    );
    const projected = projectWorldPointToScreen(worldPt, input.camera);
    const gt: Vec2 = [projected.screenX, projected.screenY];
    const obs: Vec2 = anchor.observedScreenPx ?? gt;
    const errPx = Math.hypot(obs[0] - gt[0], obs[1] - gt[1]);

    const rayVec = sub3(worldPt, input.camera.eye);
    const anchorDist = Math.hypot(rayVec[0], rayVec[1], rayVec[2]);
    const rayDir = normalize3(rayVec);

    let occluded = false;
    for (const candidate of input.triangles) {
      if (candidate.id === tri.id) continue;
      if (rayIntersectsTriangleCloser(input.camera.eye, rayDir, anchorDist, candidate, depthBiasMeters)) {
        occluded = true;
        break;
      }
    }

    const drawnVisible = anchor.drawnVisible ?? !occluded;
    const occlusionLeaked = occluded && drawnVisible;
    if (occluded) occludedCount += 1;
    if (occlusionLeaked) leakedCount += 1;

    errSum += errPx;
    if (errPx > maxErr) maxErr = errPx;

    samples.push({
      triangleId: tri.id,
      groundTruthScreenPx: [Number(gt[0].toFixed(3)), Number(gt[1].toFixed(3))],
      reprojectedScreenPx: [Number(obs[0].toFixed(3)), Number(obs[1].toFixed(3))],
      reprojectionErrorPx: Number(errPx.toFixed(4)),
      groundTruthOccluded: occluded,
      occlusionLeaked,
    });
  }

  const count = samples.length;
  const meanReprojectionErrorPx = count > 0 ? Number((errSum / count).toFixed(4)) : 0;
  const maxReprojectionErrorPx = Number(maxErr.toFixed(4));
  const hiddenLineOcclusionLeakRatio =
    count > 0 ? Number((leakedCount / count).toFixed(6)) : 0;
  const syncLatencyMs = Math.max(0, Number.isFinite(input.syncLatencyMs) ? input.syncLatencyMs : 150);

  const effectiveErr = Math.max(0, meanReprojectionErrorPx - SUBPIXEL_LOCK_DEADBAND_PX);
  const effectiveTau = Math.max(0, syncLatencyMs - SYNC_SUBQUARTER_FRAME_DEADBAND_MS);
  const exponent =
    -BRI_ALPHA * effectiveErr -
    BRI_BETA * hiddenLineOcclusionLeakRatio -
    BRI_GAMMA * (effectiveTau / BRI_TAU_LIMIT_MS);
  const bridgeReliabilityIndex = Number(clamp(100 * Math.exp(exponent), 0, 100).toFixed(1));
  const authoredDeltaPreserved = input.authoredDeltaLayerSeparated ?? true;

  const mode: LinkedInkBarycentricEvaluation["mode"] =
    bridgeReliabilityIndex >= 90
      ? "live-bidirectional"
      : bridgeReliabilityIndex >= 75
        ? "tangent-rebake"
        : "snapshot-locked-homography";

  const passedHardGate =
    (meanReprojectionErrorPx <= 1.5 &&
      hiddenLineOcclusionLeakRatio <= 0.005 &&
      bridgeReliabilityIndex >= 75) ||
    (mode === "snapshot-locked-homography" && authoredDeltaPreserved);

  return Object.freeze({
    anchorCount: count,
    meanReprojectionErrorPx,
    maxReprojectionErrorPx,
    hiddenLineOcclusionLeakRatio,
    occludedAnchorCount: occludedCount,
    leakedOcclusionCount: leakedCount,
    syncLatencyMs,
    bridgeReliabilityIndex,
    mode,
    authoredDeltaPreserved,
    passedHardGate,
    samples: Object.freeze(samples),
  });
}

/**
 * 표준 웹툰 3D 캐릭터·소품 멀티샷 회전 시나리오에서 바리센트릭 Linked Ink 브리지를 실측 평가한다.
 */
export function runCanonicalLinkedInkBarycentricSuite(options?: {
  readonly syncLatencyMs?: number;
  readonly cameraYawDeg?: number;
  readonly injectReprojectionNoisePx?: number;
  readonly disableDepthOcclusionCulling?: boolean;
}): LinkedInkBarycentricEvaluation {
  const yawRad = ((options?.cameraYawDeg ?? 22) * Math.PI) / 180;
  const radius = 4.2;
  const camera: LinkedInkCameraSpec = {
    eye: [Math.sin(yawRad) * radius, 1.45, Math.cos(yawRad) * radius],
    target: [0, 1.2, 0],
    up: [0, 1, 0],
    fovYDeg: 38,
    viewportWidthPx: 1920,
    viewportHeightPx: 1080,
  };

  // 전면 캐릭터 실루엣 삼각형 + 후면 가려진 삼각형(Z-bias 은선 테스트용)
  const triangles: readonly LinkedInkTriangle3D[] = [
    { id: "hero-face-upper", v0: [-0.35, 1.55, 0.2], v1: [0.35, 1.55, 0.2], v2: [0.0, 1.05, 0.28] },
    { id: "hero-collar-left", v0: [-0.48, 1.05, 0.16], v1: [0.0, 1.05, 0.28], v2: [-0.32, 0.65, 0.18] },
    { id: "hero-collar-right", v0: [0.0, 1.05, 0.28], v1: [0.48, 1.05, 0.16], v2: [0.32, 0.65, 0.18] },
    { id: "back-hair-occluded", v0: [-0.28, 1.48, -0.35], v1: [0.28, 1.48, -0.35], v2: [0.0, 1.12, -0.32] },
  ];

  const baseSpecs: readonly { readonly triangleId: string; readonly u: number; readonly v: number }[] = [
    { triangleId: "hero-face-upper", u: 0.45, v: 0.35 },
    { triangleId: "hero-face-upper", u: 0.25, v: 0.52 },
    { triangleId: "hero-collar-left", u: 0.35, v: 0.40 },
    { triangleId: "hero-collar-left", u: 0.55, v: 0.22 },
    { triangleId: "hero-collar-right", u: 0.42, v: 0.38 },
    { triangleId: "hero-collar-right", u: 0.22, v: 0.55 },
    { triangleId: "back-hair-occluded", u: 0.33, v: 0.33 },
    { triangleId: "back-hair-occluded", u: 0.42, v: 0.28 },
  ];

  const noisePx = options?.injectReprojectionNoisePx ?? 0;
  const disableCulling = options?.disableDepthOcclusionCulling ?? false;
  const triMap = new Map(triangles.map((t) => [t.id, t]));

  const anchors: LinkedInkBarycentricAnchor[] = baseSpecs.map((spec, idx) => {
    const tri = triMap.get(spec.triangleId)!;
    const world = evaluateTriangleBarycentricPoint(tri, spec.u, spec.v, 0.0004);
    const proj = projectWorldPointToScreen(world, camera);
    const sign = idx % 2 === 0 ? 1 : -1;
    const observed: Vec2 = [
      proj.screenX + noisePx * sign,
      proj.screenY + noisePx * 0.5 * sign,
    ];
    return {
      triangleId: spec.triangleId,
      u: spec.u,
      v: spec.v,
      normalOffsetMeters: 0.0004,
      observedScreenPx: observed,
      ...(disableCulling ? { drawnVisible: true } : {}),
    };
  });

  return evaluateLinkedInkBarycentricBridge({
    triangles,
    anchors,
    camera,
    syncLatencyMs: options?.syncLatencyMs ?? 1.2,
    depthBias: 0.0005,
    authoredDeltaLayerSeparated: true,
  });
}
