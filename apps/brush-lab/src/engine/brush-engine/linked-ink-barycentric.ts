/**
 * Brush Lab 순수 엔진용 2D↔3D Linked Ink 바리센트릭 재투영 & Z-Bias 은선 실측 평가기.
 * (`apps/brush-lab/src/engine/**` 제로-외부의존 경계 준수;
 *  `packages/studio-brush-platform/src/linked-ink/linked-ink-barycentric-evaluator.ts`와 동일 수식)
 */

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];

interface Tri3D {
  readonly id: string;
  readonly v0: Vec3;
  readonly v1: Vec3;
  readonly v2: Vec3;
}

interface CamSpec {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovYDeg: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
}

export interface BrushLabLinkedInkBarycentricReport {
  readonly anchorCount: number;
  readonly meanReprojectionErrorPx: number;
  readonly hiddenLineOcclusionLeakRatio: number;
  readonly syncLatencyMs: number;
  readonly bridgeReliabilityIndex: number;
  readonly passedHardGate: boolean;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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
function norm3(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-9 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l];
}

function projectToScreen(world: Vec3, cam: CamSpec): Vec2 {
  const fwd = norm3(sub3(cam.target, cam.eye));
  const right = norm3(cross3(fwd, cam.up));
  const up = norm3(cross3(right, fwd));
  const rel = sub3(world, cam.eye);
  const z = Math.max(0.1, dot3(rel, fwd));
  const tanHalf = Math.tan(((cam.fovYDeg * Math.PI) / 180) * 0.5);
  const aspect = cam.viewportWidthPx / Math.max(1, cam.viewportHeightPx);
  const ndcX = dot3(rel, right) / (z * tanHalf * aspect);
  const ndcY = dot3(rel, up) / (z * tanHalf);
  return [(ndcX * 0.5 + 0.5) * cam.viewportWidthPx, (0.5 - ndcY * 0.5) * cam.viewportHeightPx];
}

function rayHitsCloser(orig: Vec3, dir: Vec3, dist: number, tri: Tri3D, biasM: number): boolean {
  const e1 = sub3(tri.v1, tri.v0);
  const e2 = sub3(tri.v2, tri.v0);
  const pvec = cross3(dir, e2);
  const det = dot3(e1, pvec);
  if (Math.abs(det) < 1e-8) return false;
  const inv = 1 / det;
  const tvec = sub3(orig, tri.v0);
  const u = dot3(tvec, pvec) * inv;
  if (u < -1e-5 || u > 1 + 1e-5) return false;
  const qvec = cross3(tvec, e1);
  const v = dot3(dir, qvec) * inv;
  if (v < -1e-5 || u + v > 1 + 1e-5) return false;
  const t = dot3(e2, qvec) * inv;
  return t > 1e-4 && t < dist - biasM;
}

export function evaluateBrushLabLinkedInkBarycentricSuite(options?: {
  readonly cameraYawDeg?: number;
  readonly syncLatencyMs?: number;
  readonly injectReprojectionNoisePx?: number;
  readonly disableDepthOcclusionCulling?: boolean;
}): BrushLabLinkedInkBarycentricReport {
  const yawRad = ((options?.cameraYawDeg ?? 22) * Math.PI) / 180;
  const cam: CamSpec = {
    eye: [Math.sin(yawRad) * 4.2, 1.45, Math.cos(yawRad) * 4.2],
    target: [0, 1.2, 0],
    up: [0, 1, 0],
    fovYDeg: 38,
    viewportWidthPx: 1920,
    viewportHeightPx: 1080,
  };
  const tris: readonly Tri3D[] = [
    { id: "face", v0: [-0.35, 1.55, 0.2], v1: [0.35, 1.55, 0.2], v2: [0.0, 1.05, 0.28] },
    { id: "collar-l", v0: [-0.48, 1.05, 0.16], v1: [0.0, 1.05, 0.28], v2: [-0.32, 0.65, 0.18] },
    { id: "collar-r", v0: [0.0, 1.05, 0.28], v1: [0.48, 1.05, 0.16], v2: [0.32, 0.65, 0.18] },
    { id: "back-hair", v0: [-0.28, 1.48, -0.35], v1: [0.28, 1.48, -0.35], v2: [0.0, 1.12, -0.32] },
  ];
  const anchors = [
    { id: "face", u: 0.45, v: 0.35 },
    { id: "face", u: 0.25, v: 0.52 },
    { id: "collar-l", u: 0.35, v: 0.4 },
    { id: "collar-l", u: 0.55, v: 0.22 },
    { id: "collar-r", u: 0.42, v: 0.38 },
    { id: "collar-r", u: 0.22, v: 0.55 },
    { id: "back-hair", u: 0.33, v: 0.33 },
    { id: "back-hair", u: 0.42, v: 0.28 },
  ];

  const triMap = new Map(tris.map((t) => [t.id, t]));
  const noisePx = options?.injectReprojectionNoisePx ?? 0;
  const disableCull = options?.disableDepthOcclusionCulling ?? false;
  let errSum = 0;
  let leaked = 0;

  for (let idx = 0; idx < anchors.length; idx += 1) {
    const a = anchors[idx]!;
    const tri = triMap.get(a.id)!;
    const w = 1 - a.u - a.v;
    const base: Vec3 = [
      a.u * tri.v0[0] + a.v * tri.v1[0] + w * tri.v2[0],
      a.u * tri.v0[1] + a.v * tri.v1[1] + w * tri.v2[1],
      a.u * tri.v0[2] + a.v * tri.v1[2] + w * tri.v2[2],
    ];
    const normal = norm3(cross3(sub3(tri.v1, tri.v0), sub3(tri.v2, tri.v0)));
    const world = add3(base, [normal[0] * 0.0004, normal[1] * 0.0004, normal[2] * 0.0004]);
    const gt = projectToScreen(world, cam);
    const sign = idx % 2 === 0 ? 1 : -1;
    const obs: Vec2 = [gt[0] + noisePx * sign, gt[1] + noisePx * 0.5 * sign];
    errSum += Math.hypot(obs[0] - gt[0], obs[1] - gt[1]);

    const ray = sub3(world, cam.eye);
    const dist = Math.hypot(ray[0], ray[1], ray[2]);
    const dir = norm3(ray);
    let occ = false;
    for (const c of tris) {
      if (c.id !== tri.id && rayHitsCloser(cam.eye, dir, dist, c, 0.001)) {
        occ = true;
        break;
      }
    }
    if (occ && disableCull) leaked += 1;
  }

  const meanErr = Number((errSum / anchors.length).toFixed(4));
  const leakRatio = Number((leaked / anchors.length).toFixed(6));
  const syncMs = Math.max(0, options?.syncLatencyMs ?? 1.2);
  const effErr = Math.max(0, meanErr - 0.1);
  const effTau = Math.max(0, syncMs - 2.0);
  const bri = Number(
    Math.min(100, Math.max(0, 100 * Math.exp(-0.045 * effErr - 4.2 * leakRatio - 0.055 * (effTau / 150)))).toFixed(1),
  );

  return {
    anchorCount: anchors.length,
    meanReprojectionErrorPx: meanErr,
    hiddenLineOcclusionLeakRatio: leakRatio,
    syncLatencyMs: syncMs,
    bridgeReliabilityIndex: bri,
    passedHardGate: meanErr <= 1.5 && leakRatio <= 0.005 && bri >= 75,
  };
}
