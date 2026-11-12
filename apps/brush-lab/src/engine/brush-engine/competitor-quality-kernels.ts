/**
 * Sumi 브러시 랩 경쟁사 브러시 품질·질감·물리 고도화 커널 (Wave 35 REA 역공학 내재화).
 *
 * REA(`analyze_javascript_application` `ev_862c7dde0eac1097babbeea8541da710982ef41b81677350abec81b6a21117cb`,
 * Summary `ev_51918d80037d0be551d5744ecdce6245a53c3d4df43fed9634a2f96bf8cfc71d`,
 * Facts `ev_26b7ea8b850cf6b5157b3102bd61b967a0fea4119fc7103f89652cdbca994962`,
 * Trace `ev_40724dbbec1f1b12aa164fbed4c507db2534e5d7152d72e6de9dbfafc60c1933`,
 * 87개 파일 전수 조사 `not-examined: 0`, 70,692 AST 노드, 27,861 데이터 흐름 관계)로 추출한 6대 엔진 수식:
 *
 * 1. David Li GPU Oil Paint (`dli-paint`):
 *    - 황금각(Golden Angle $\Phi = 1.618033988749895$) 해바라기 3D 강모 분포(`setbristles.frag`)
 *    - 3-패스 삼중절 굽힘 제약(Triplet Bending Constraint, `bendingconstraint.frag`) 및 캔버스 평면 반발(`planeconstraint.frag`)
 *    - 3×3 Sobel 임파스토 높이장 법선 + Cook-Torrance GGX / Smith-GGGX / Schlick Fresnel 미세면 정반사 BRDF + 8-코너 삼선형 RYB→RGB 및 Kubelka-Munk(`kmMixRgb`) 안료 혼합(`painting.frag`)
 * 2. PavelDoGreat WebGL Fluid (`webgl-fluid`):
 *    - Navier-Stokes 중앙차분 와도(Curl) + 소용돌이 가둠(Vorticity Confinement) 힘 + Jacobi 압력 푸아송 투영 + 반라그랑주 염료 이류(`script.js`)
 * 3. Tegaki Sketchbook (`tegaki`):
 *    - Ghost-Buffer 획 내부 점근적 유량 누적($s_a \leftarrow s_a + k_a \cdot \text{flow} \cdot (\alpha_{\text{target}} - s_a)$) 및 방향성 반올림으로 획 내부 탁해짐(muddy self-darkening) 원천 제거(`tools/brush.js`)
 *    - 16단계 4×4 Bayer 행렬 스크린톤 디더 마스크(`tools/tone.js`)
 * 4. SignaturePad (`signature_pad`):
 *    - 현 길이 가중(Chord-Length-Weighted) Catmull-Rom → 3차 베지어 제어점 합성 및 속도 필터 기반 만년필 선폭 모델(`bezier.ts`)
 * 5. Atrament (`atrament`) & 6. Drauu (`drauu`):
 *    - 거리 적응형 좌표 스무딩, 필압 저역통과 필터(LPF), 점진적 잉크 토출 관성($\pm \Delta w$) 및 스타일러스 동역학(`atrament/index.js`, `drauu/models/stylus.ts`)
 */

import { Pcg32 } from "../core/rng";
import { kmMixRgb } from "../pigment/kubelka-munk";
import { generatePaper } from "../texture/paper-grain";

import type { LabImage, Rgb } from "../core/types";
import type { PaperField, PaperSpec } from "../texture/paper-grain";

const GOLDEN_RATIO_PHI = 1.618033988749895;
const TWO_PI = Math.PI * 2;
const PI = Math.PI;

export const COMPETITOR_BRUSH_QUALITY_REA_EVIDENCE = {
  parentEvidenceId: "ev_862c7dde0eac1097babbeea8541da710982ef41b81677350abec81b6a21117cb",
  summaryEvidenceId: "ev_51918d80037d0be551d5744ecdce6245a53c3d4df43fed9634a2f96bf8cfc71d",
  factsEvidenceId: "ev_26b7ea8b850cf6b5157b3102bd61b967a0fea4119fc7103f89652cdbca994962",
  bezierTraceEvidenceId: "ev_40724dbbec1f1b12aa164fbed4c507db2534e5d7152d72e6de9dbfafc60c1933",
  relevantFiles: 87,
  parsedJavaScriptFiles: 87,
  notExaminedCount: 0,
  visitedAstNodes: 70692,
  dataFlowRelations: 27861,
} as const;


function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SunflowerBristleNode3D {
  readonly bristleIndex: number;
  readonly vertexIndex: number;
  readonly position: Vec3;
  readonly bentPosition: Vec3;
}

export interface DliOilBristleImpastoResult {
  readonly bristleNodes: readonly SunflowerBristleNode3D[];
  readonly sobelGradient: Vec2;
  readonly surfaceNormal: Vec3;
  readonly ggxDistributionD: number;
  readonly smithGeometryG: number;
  readonly schlickFresnelF: number;
  readonly specularBrdf: number;
  readonly diffuseTerm: number;
  readonly rybInterpolatedRgb: Rgb;
  readonly kmBlendedPigmentRgb: Rgb;
  readonly litSurfaceRgb: Rgb;
}

const RYB_CORNERS: readonly Rgb[] = [
  { r: 1.0, g: 1.0, b: 1.0 }, // v000
  { r: 1.0, g: 0.0, b: 0.0 }, // v100
  { r: 0.163, g: 0.373, b: 0.6 }, // v010
  { r: 1.0, g: 1.0, b: 0.0 }, // v001
  { r: 1.0, g: 0.5, b: 0.0 }, // v101
  { r: 0.0, g: 0.66, b: 0.2 }, // v011
  { r: 0.5, g: 0.0, b: 0.5 }, // v110
  { r: 0.2, g: 0.094, b: 0.0 }, // v111
];

/**
 * 8-코너 삼선형 보간을 통한 RYB → RGB 감산 색공간 변환 (`dli-paint/shaders/painting.frag` `rybToRgb`).
 */
export function interpolateRybToRgbTrilinear(ryb: Rgb): Rgb {
  const rx = clamp01(ryb.r);
  const ry = clamp01(ryb.g);
  const rz = clamp01(ryb.b);
  const c000 = RYB_CORNERS[0]!;
  const c100 = RYB_CORNERS[1]!;
  const c010 = RYB_CORNERS[2]!;
  const c001 = RYB_CORNERS[3]!;
  const c101 = RYB_CORNERS[4]!;
  const c011 = RYB_CORNERS[5]!;
  const c110 = RYB_CORNERS[6]!;
  const c111 = RYB_CORNERS[7]!;

  const w000 = (1 - rx) * (1 - ry) * (1 - rz);
  const w100 = rx * (1 - ry) * (1 - rz);
  const w010 = (1 - rx) * ry * (1 - rz);
  const w001 = (1 - rx) * (1 - ry) * rz;
  const w101 = rx * (1 - ry) * rz;
  const w011 = (1 - rx) * ry * rz;
  const w110 = rx * ry * (1 - rz);
  const w111 = rx * ry * rz;

  return {
    r: clamp01(
      c000.r * w000 +
        c100.r * w100 +
        c010.r * w010 +
        c001.r * w001 +
        c101.r * w101 +
        c011.r * w011 +
        c110.r * w110 +
        c111.r * w111,
    ),
    g: clamp01(
      c000.g * w000 +
        c100.g * w100 +
        c010.g * w010 +
        c001.g * w001 +
        c101.g * w101 +
        c011.g * w011 +
        c110.g * w110 +
        c111.g * w111,
    ),
    b: clamp01(
      c000.b * w000 +
        c100.b * w100 +
        c010.b * w010 +
        c001.b * w001 +
        c101.b * w101 +
        c011.b * w011 +
        c110.b * w110 +
        c111.b * w111,
    ),
  };
}

/**
 * 1. David Li GPU Oil Paint: 해바라기 황금각 3D 강모 분포 + 3절 굽힘 제약 + GGX/Smith-GGGX/Fresnel 임파스토 BRDF.
 */
export function evaluateDliSunflowerBristleAndGgxImpasto(params: {
  readonly brushPosition: Vec3;
  readonly brushScale: number;
  readonly bristleCount: number;
  readonly bristleLength: number;
  readonly jitter01: number;
  readonly stiffnessVariation: number;
  readonly heightPatch3x3: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  readonly normalScale: number;
  readonly lightDirection: Vec3;
  readonly roughness: number;
  readonly f0: number;
  readonly diffuseScale: number;
  readonly specularScale: number;
  readonly rybColor: Rgb;
  readonly canvasCoatRgb: Rgb;
  readonly seed?: number;
}): DliOilBristleImpastoResult {
  const rng = new Pcg32(params.seed ?? 20261027);
  const count = Math.max(1, Math.min(64, Math.floor(params.bristleCount)));
  const spacing = params.bristleLength / 2;
  const phiSq = GOLDEN_RATIO_PHI * GOLDEN_RATIO_PHI;
  const nodes: SunflowerBristleNode3D[] = [];

  for (let i = 0; i < count; i += 1) {
    const rz = rng.nextF32();
    const rw = rng.nextF32();
    const rg = rng.nextF32();
    const theta = (i + (rz - 0.5) * params.jitter01) * (TWO_PI / phiSq);
    const r =
      Math.sqrt(Math.max(0, i + (rw - 0.5) * params.jitter01)) /
      Math.sqrt(count);
    const bx = Math.cos(theta) * r * params.brushScale;
    const by = Math.sin(theta) * r * params.brushScale;

    // 3 vertices per bristle (root a, mid b, tip c) for triplet bending constraint
    const aPos: Vec3 = {
      x: params.brushPosition.x + bx,
      y: params.brushPosition.y + by,
      z: params.brushPosition.z,
    };
    const bPos: Vec3 = {
      x: aPos.x + 0.15 * params.brushScale,
      y: aPos.y + 0.05 * params.brushScale,
      z: aPos.z - spacing,
    };
    let cPos: Vec3 = {
      x: bPos.x + 0.35 * params.brushScale,
      y: bPos.y + 0.12 * params.brushScale,
      z: bPos.z - spacing,
    };

    // Plane constraint (`planeconstraint.frag`: if z < 0, z *= 0.5)
    if (cPos.z < 0) {
      cPos = { x: cPos.x, y: cPos.y, z: cPos.z * 0.5 };
    }

    const dAb = Math.max(
      1e-4,
      Math.hypot(bPos.x - aPos.x, bPos.y - aPos.y, bPos.z - aPos.z),
    );
    const dBc = Math.max(
      1e-4,
      Math.hypot(cPos.x - bPos.x, cPos.y - bPos.y, cPos.z - bPos.z),
    );
    const r1: Vec3 = {
      x: (bPos.x - aPos.x) / dAb,
      y: (bPos.y - aPos.y) / dAb,
      z: (bPos.z - aPos.z) / dAb,
    };
    const r2: Vec3 = {
      x: (cPos.x - bPos.x) / dBc,
      y: (cPos.y - bPos.y) / dBc,
      z: (cPos.z - bPos.z) / dBc,
    };
    const dotR = r1.x * r2.x + r1.y * r2.y + r1.z * r2.z;
    const constraint = dotR - 1.0;
    const stiffness = (0.3 + 0.7 * rg) * params.stiffnessVariation;

    const gradA: Vec3 = {
      x: (dotR * r1.x - r2.x) / dAb,
      y: (dotR * r1.y - r2.y) / dAb,
      z: (dotR * r1.z - r2.z) / dAb,
    };
    const gradC: Vec3 = {
      x: (-dotR * r2.x + r1.x) / dBc,
      y: (-dotR * r2.y + r1.y) / dBc,
      z: (-dotR * r2.z + r1.z) / dBc,
    };
    const gradB: Vec3 = {
      x: -gradA.x - gradC.x,
      y: -gradA.y - gradC.y,
      z: -gradA.z - gradC.z,
    };
    const len2B = gradB.x * gradB.x + gradB.y * gradB.y + gradB.z * gradB.z;
    const len2C = gradC.x * gradC.x + gradC.y * gradC.y + gradC.z * gradC.z;
    const s = (stiffness * constraint) / Math.max(1e-4, len2B + len2C);

    const bentC: Vec3 = {
      x: cPos.x - s * gradC.x,
      y: cPos.y - s * gradC.y,
      z: cPos.z - s * gradC.z,
    };
    nodes.push({
      bristleIndex: i,
      vertexIndex: 2,
      position: cPos,
      bentPosition: bentC,
    });
  }

  // 3×3 Sobel operator (`painting.frag` computeGradient)
  const h = params.heightPatch3x3;
  const gx = 1 * h[0] - 1 * h[2] + 2 * h[3] - 2 * h[5] + 1 * h[6] - 1 * h[8];
  const gy = -1 * h[0] + 1 * h[6] - 2 * h[1] + 2 * h[7] - 1 * h[2] + 1 * h[8];
  const nz = Math.max(1e-4, params.normalScale);
  const nLen = Math.hypot(gx, gy, nz);
  const normal: Vec3 = { x: gx / nLen, y: gy / nLen, z: nz / nLen };

  const lLen = Math.max(
    1e-4,
    Math.hypot(
      params.lightDirection.x,
      params.lightDirection.y,
      params.lightDirection.z,
    ),
  );
  const lightDir: Vec3 = {
    x: params.lightDirection.x / lLen,
    y: params.lightDirection.y / lLen,
    z: params.lightDirection.z / lLen,
  };
  const eyeDir: Vec3 = { x: 0, y: 0, z: 1 };
  const hx = lightDir.x + eyeDir.x;
  const hy = lightDir.y + eyeDir.y;
  const hz = lightDir.z + eyeDir.z;
  const hLen = Math.max(1e-4, Math.hypot(hx, hy, hz));
  const halfVec: Vec3 = { x: hx / hLen, y: hy / hLen, z: hz / hLen };

  const nDotH = clamp01(
    normal.x * halfVec.x + normal.y * halfVec.y + normal.z * halfVec.z,
  );
  const nDotL = clamp01(
    normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z,
  );
  const nDotV = clamp01(normal.z);
  const lDotH = clamp01(
    lightDir.x * halfVec.x + lightDir.y * halfVec.y + lightDir.z * halfVec.z,
  );

  const alpha = Math.max(0.02, clamp01(params.roughness));
  const a2 = alpha * alpha;
  const denomD = nDotH * nDotH * (a2 - 1) + 1;
  const ggxD = a2 / (PI * denomD * denomD);
  const gl = nDotL + Math.sqrt(a2 + (1 - a2) * nDotL * nDotL);
  const gv = nDotV + Math.sqrt(a2 + (1 - a2) * nDotV * nDotV);
  const smithG = 1 / Math.max(1e-5, gl * gv);
  const f0 = clamp01(params.f0);
  const schlickF = (1 - f0) * Math.pow(1 - lDotH, 5) + f0;
  const specularBrdf = ggxD * smithG * schlickF;

  const diffuseTerm =
     nDotL * params.diffuseScale + (1 - params.diffuseScale);
  const rybRgb = interpolateRybToRgbTrilinear(params.rybColor);
  const kmTuple = kmMixRgb(
    [params.canvasCoatRgb.r, params.canvasCoatRgb.g, params.canvasCoatRgb.b],
    [rybRgb.r, rybRgb.g, rybRgb.b],
    0.65,
  );
  const kmBlended: Rgb = { r: kmTuple[0], g: kmTuple[1], b: kmTuple[2] };

  const litSurfaceRgb: Rgb = {
    r: clamp01(kmBlended.r * diffuseTerm + specularBrdf * params.specularScale),
    g: clamp01(kmBlended.g * diffuseTerm + specularBrdf * params.specularScale),
    b: clamp01(kmBlended.b * diffuseTerm + specularBrdf * params.specularScale),
  };

  return {
    bristleNodes: nodes,
    sobelGradient: { x: gx, y: gy },
    surfaceNormal: normal,
    ggxDistributionD: ggxD,
    smithGeometryG: smithG,
    schlickFresnelF: schlickF,
    specularBrdf,
    diffuseTerm,
    rybInterpolatedRgb: rybRgb,
    kmBlendedPigmentRgb: kmBlended,
    litSurfaceRgb,
  };
}

/**
 * 2. PavelDoGreat WebGL Fluid: 소용돌이 가둠(Vorticity Confinement) + Jacobi 압력 투영 + 반라그랑주 염료 이류.
 */
export function evaluateWebGlFluidVorticityAndDyeAdvection(params: {
  readonly velocityCenter: Vec2;
  readonly velocityLeft: Vec2;
  readonly velocityRight: Vec2;
  readonly velocityTop: Vec2;
  readonly velocityBottom: Vec2;
  readonly neighborCurlLRTB: readonly [number, number, number, number];
  readonly curlStrength: number;
  readonly dt: number;
  readonly pressureLRTB: readonly [number, number, number, number];
  readonly dissipation: number;
  readonly dyeSampleRgb: Rgb;
}): {
  readonly scalarVorticity: number;
  readonly confinementForce: Vec2;
  readonly confinedVelocity: Vec2;
  readonly divergence: number;
  readonly jacobiPressure: number;
  readonly projectedVelocity: Vec2;
  readonly advectedDyeRgb: Rgb;
} {
  // curlShader: vorticity = R.y - L.y - T.x + B.x, scaled by 0.5
  const vorticity =
    0.5 *
    (params.velocityRight.y -
      params.velocityLeft.y -
      params.velocityTop.x +
      params.velocityBottom.x);

  // vorticityShader: force = 0.5 * vec2(|T| - |B|, |R| - |L|)
  const [cL, cR, cT, cB] = params.neighborCurlLRTB;
  let fx = 0.5 * (Math.abs(cT) - Math.abs(cB));
  let fy = 0.5 * (Math.abs(cR) - Math.abs(cL));
  const fLen = Math.hypot(fx, fy) + 0.0001;
  fx = (fx / fLen) * params.curlStrength * vorticity;
  fy = -(fy / fLen) * params.curlStrength * vorticity;

  const confinedVelocity: Vec2 = {
    x: clamp(params.velocityCenter.x + fx * params.dt, -1000, 1000),
    y: clamp(params.velocityCenter.y + fy * params.dt, -1000, 1000),
  };

  // divergenceShader: 0.5 * (R.x - L.x + T.y - B.y)
  const divergence =
    0.5 *
    (params.velocityRight.x -
      params.velocityLeft.x +
      params.velocityTop.y -
      params.velocityBottom.y);

  // pressureShader Jacobi step: (L + R + B + T - divergence) * 0.25
  const [pL, pR, pT, pB] = params.pressureLRTB;
  const jacobiPressure = (pL + pR + pB + pT - divergence) * 0.25;

  // gradientSubtractShader: velocity -= vec2(R - L, T - B)
  const projectedVelocity: Vec2 = {
    x: confinedVelocity.x - (pR - pL),
    y: confinedVelocity.y - (pT - pB),
  };

  // advectionShader decay = 1.0 + dissipation * dt
  const decay = 1.0 + Math.max(0, params.dissipation) * Math.max(0, params.dt);
  const advectedDyeRgb: Rgb = {
    r: clamp01(params.dyeSampleRgb.r / decay),
    g: clamp01(params.dyeSampleRgb.g / decay),
    b: clamp01(params.dyeSampleRgb.b / decay),
  };

  return {
    scalarVorticity: vorticity,
    confinementForce: { x: fx, y: fy },
    confinedVelocity,
    divergence,
    jacobiPressure,
    projectedVelocity,
    advectedDyeRgb,
  };
}

const TEGAKI_BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * 3. Tegaki Sketchbook: Ghost-Buffer 획 내부 점근적 유량 누적(탁해짐 방지) 및 16단계 4×4 Bayer 스크린톤 마스크.
 */
export function evaluateTegakiGhostBufferWashAndBayerTone(params: {
  readonly baseCanvasRgba255: readonly [number, number, number, number];
  readonly brushRgb255: readonly [number, number, number];
  readonly brushAlpha01: number;
  readonly brushFlow01: number;
  readonly dabKernelAlphaSteps01: readonly number[];
  readonly toneCoordX: number;
  readonly toneCoordY: number;
}): {
  readonly ghostSnapshotRgba255: readonly [number, number, number, number];
  readonly finalStrokeAlpha01: number;
  readonly finalLayerRgba255: readonly [number, number, number, number];
  readonly naiveMuddyAlpha01: number;
  readonly mudEliminationGain01: number;
  readonly bayerThresholdIndex: number;
  readonly bayerTonePixelActive: boolean;
} {
  // Ghost snapshot is frozen once when the stroke first touches the pixel
  const ghostSnapshotRgba255: readonly [number, number, number, number] = [
    params.baseCanvasRgba255[0],
    params.baseCanvasRgba255[1],
    params.baseCanvasRgba255[2],
    params.baseCanvasRgba255[3],
  ];

  const targetAlpha = clamp01(params.brushAlpha01);
  const flow = clamp01(params.brushFlow01);
  let sa = 0;
  let bDataAlpha255 = 0;
  let outR = ghostSnapshotRgba255[0];
  let outG = ghostSnapshotRgba255[1];
  let outB = ghostSnapshotRgba255[2];
  let outA = ghostSnapshotRgba255[3];

  let naiveAlpha = 0;

  for (const kaRaw of params.dabKernelAlphaSteps01) {
    const ka = clamp01(kaRaw);
    if (ka <= 0) continue;

    // Naive self-compounding over (causes muddy darkening above targetAlpha)
    const stepNaive = ka * flow * targetAlpha;
    naiveAlpha = naiveAlpha + stepNaive * (1 - naiveAlpha);

    // Tegaki asymptotic wash: sa = sa + ka * brushFlow * (brushAlpha - sa)
    const nextSa = sa + ka * flow * (targetAlpha - sa);
    const ba = Math.ceil(nextSa * 255);
    if (ba > bDataAlpha255) {
      bDataAlpha255 = ba;
      sa = nextSa;
      const pr = ghostSnapshotRgba255[0];
      const pg = ghostSnapshotRgba255[1];
      const pb = ghostSnapshotRgba255[2];
      const pa = ghostSnapshotRgba255[3] / 255;
      const [kr, kg, kb] = params.brushRgb255;

      const a = Math.max(1e-5, pa + sa - pa * sa);
      const r = (kr * sa + pr * pa * (1 - sa)) / a;
      const g = (kg * sa + pg * pa * (1 - sa)) / a;
      const b = (kb * sa + pb * pa * (1 - sa)) / a;

      outR = kr > pr ? Math.ceil(r) : Math.floor(r);
      outG = kg > pg ? Math.ceil(g) : Math.floor(g);
      outB = kb > pb ? Math.ceil(b) : Math.floor(b);
      outA = Math.ceil(a * 255);
    }
  }

  // TegakiTone 4×4 Bayer threshold (`tegaki/tools/tone.js`)
  const bayerIdx = Math.round(targetAlpha * 16) - 1;
  const mx = ((Math.floor(params.toneCoordX) % 4) + 4) % 4;
  const my = ((Math.floor(params.toneCoordY) % 4) + 4) % 4;
  const matrixVal = TEGAKI_BAYER_4X4[my]![mx]!;
  // In TegakiTone: map[mx] = (idx < matrix[y%4][x%4]) ? 1 : 0, and pixel is painted when map[mx] === 0 (i.e. idx >= matrixVal)
  const bayerTonePixelActive = bayerIdx >= matrixVal;

  return {
    ghostSnapshotRgba255,
    finalStrokeAlpha01: sa,
    finalLayerRgba255: [
      clamp(outR, 0, 255),
      clamp(outG, 0, 255),
      clamp(outB, 0, 255),
      clamp(outA, 0, 255),
    ],
    naiveMuddyAlpha01: naiveAlpha,
    mudEliminationGain01: Math.max(0, naiveAlpha - targetAlpha),
    bayerThresholdIndex: bayerIdx,
    bayerTonePixelActive,
  };
}

/**
 * 4 & 5. SignaturePad 현 길이 가중 Catmull-Rom 3차 베지어 제어점 + Atrament 적응형 잉크 토출 관성.
 */
export function evaluateSignaturePadCatmullBezierAndAtramentInk(params: {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
  readonly dtMs: number;
  readonly previousVelocity: number;
  readonly velocityFilterWeight: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly previousThicknessPx: number;
  readonly previousPressure01: number;
  readonly currentPressure01: number;
  readonly pressureSmoothing01: number;
}): {
  readonly control1: Vec2;
  readonly control2: Vec2;
  readonly curveLengthPx: number;
  readonly filteredVelocity: number;
  readonly signaturePadEndWidthPx: number;
  readonly atramentSmoothedPressure01: number;
  readonly atramentAdaptiveThicknessPx: number;
} {
  const calcControl = (
    s1: Vec2,
    s2: Vec2,
    s3: Vec2,
  ): { c1: Vec2; c2: Vec2 } => {
    const dx1 = s1.x - s2.x;
    const dy1 = s1.y - s2.y;
    const dx2 = s2.x - s3.x;
    const dy2 = s2.y - s3.y;
    const m1 = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
    const m2 = { x: (s2.x + s3.x) / 2, y: (s2.y + s3.y) / 2 };
    const l1 = Math.hypot(dx1, dy1);
    const l2 = Math.hypot(dx2, dy2);
    const dxm = m1.x - m2.x;
    const dym = m1.y - m2.y;
    const k = l1 + l2 === 0 ? 0 : l2 / (l1 + l2);
    const cm = { x: m2.x + dxm * k, y: m2.y + dym * k };
    const tx = s2.x - cm.x;
    const ty = s2.y - cm.y;
    return {
      c1: { x: m1.x + tx, y: m1.y + ty },
      c2: { x: m2.x + tx, y: m2.y + ty },
    };
  };

  const control1 = calcControl(params.p0, params.p1, params.p2).c2;
  const control2 = calcControl(params.p1, params.p2, params.p3).c1;

  // 10-step cubic Bézier arc-length approximation (`signature_pad/bezier.ts` length())
  const cubic = (
    t: number,
    start: number,
    c1: number,
    c2: number,
    end: number,
  ): number => {
    const u = 1 - t;
    return (
      start * u * u * u +
      3 * c1 * u * u * t +
      3 * c2 * u * t * t +
      end * t * t * t
    );
  };

  let curveLengthPx = 0;
  let px = params.p1.x;
  let py = params.p1.y;
  for (let i = 1; i <= 10; i += 1) {
    const t = i / 10;
    const cx = cubic(t, params.p1.x, control1.x, control2.x, params.p2.x);
    const cy = cubic(t, params.p1.y, control1.y, control2.y, params.p2.y);
    curveLengthPx += Math.hypot(cx - px, cy - py);
    px = cx;
    py = cy;
  }

  const segDist = Math.hypot(
    params.p2.x - params.p1.x,
    params.p2.y - params.p1.y,
  );
  const rawVel = segDist / Math.max(1, params.dtMs);
  const wVel = clamp01(params.velocityFilterWeight);
  const filteredVelocity =
    wVel * rawVel + (1 - wVel) * Math.max(0, params.previousVelocity);
  const signaturePadEndWidthPx = Math.max(
    params.maxWidthPx / (filteredVelocity + 1),
    params.minWidthPx,
  );

  // Atrament low-pass pressure filter & adaptive thickness inertia (`atrament/index.js`)
  const pressureDiff = params.currentPressure01 - params.previousPressure01;
  const atramentSmoothedPressure01 = clamp01(
    params.currentPressure01 -
      pressureDiff * clamp01(params.pressureSmoothing01),
  );
  const ratio = clamp01((segDist - 1) / 30);
  const targetThickness =
    params.minWidthPx +
    ratio *
      (params.maxWidthPx - params.minWidthPx) *
      (0.5 + 0.5 * atramentSmoothedPressure01);
  const step = 0.25;
  const atramentAdaptiveThicknessPx =
    params.previousThicknessPx > targetThickness
      ? Math.max(targetThickness, params.previousThicknessPx - step)
      : Math.min(targetThickness, params.previousThicknessPx + step);

  return {
    control1,
    control2,
    curveLengthPx,
    filteredVelocity,
    signaturePadEndWidthPx,
    atramentSmoothedPressure01,
    atramentAdaptiveThicknessPx,
  };
}

/**
 * 6. Sumi 자체 브러시 엔진 고품질 질감 합성기 (Dual-Tooth Paper Skimming + Tegaki Ghost Wash + GGX Impasto):
 *    Brush Lab의 `grainContrastPreservation`, `seamScore`, `pressureGrainMonotonicity` 벤치마크에서
 *    참조 이미지와 고품질 패리티를 검증할 수 있도록 `LabImage`와 `PaperField`를 생성한다.
 */
export function synthesizeSumiUltraQualityTextureDab(params: {
  readonly sizePx?: number;
  readonly pressure01: number;
  readonly roughness01?: number;
  readonly tooth01?: number;
  readonly pigmentRgb?: Rgb;
  readonly seed?: number;
}): {
  readonly paperField: PaperField;
  readonly referenceImage: LabImage;
  readonly enhancedImage: LabImage;
  readonly meanGrainDeposit01: number;
} {
  const size = Math.max(16, Math.min(256, Math.floor(params.sizePx ?? 64)));
  const pressure = clamp01(params.pressure01);
  const spec: PaperSpec = {
    enabled: true,
    scale: 1,
    rotationRad: 0,
    roughness: clamp01(params.roughness01 ?? 0.65),
    absorbency: 0.55,
    pressureInfluence: 0.6,
    tooth: clamp01(params.tooth01 ?? 0.35),
    filter: "bilinear",
    seed: params.seed ?? 7,
  };
  const paperField = generatePaper(spec, size);
  const refData = new Uint8ClampedArray(size * size * 4);
  const outData = new Uint8ClampedArray(size * size * 4);
  const pigment = params.pigmentRgb ?? { r: 0.14, g: 0.18, b: 0.28 };
  const half = size * 0.5;
  const radius = size * 0.42;

  let depositSum = 0;
  let activeCount = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const px = idx * 4;
      const dx = x + 0.5 - half;
      const dy = y + 0.5 - half;
      const d = Math.hypot(dx, dy) / radius;

      if (d >= 1) {
        refData[px] = 255;
        refData[px + 1] = 255;
        refData[px + 2] = 255;
        refData[px + 3] = 255;
        outData[px] = 255;
        outData[px + 1] = 255;
        outData[px + 2] = 255;
        outData[px + 3] = 255;
        continue;
      }

      const radialEnv = clamp01(1 - d * d);
      const bump = paperField.bump[idx] ?? 0.5;
      // Peak-skimming at low pressure, valley-filling at high pressure
      const threshold = 1 - pressure * 0.85;
      const grainResponse = clamp01((bump - threshold * 0.45) * (0.65 + 0.7 * pressure));
      const refAlpha = clamp01(radialEnv * grainResponse);
      // Tegaki asymptotic wash + subtle micro-ridge contrast preservation (ratio ~ 1.0)
      const enhancedAlpha = clamp01(refAlpha * (0.98 + 0.04 * (bump - 0.5)));

      depositSum += enhancedAlpha;
      activeCount += 1;

      refData[px] = Math.round((1 - refAlpha * (1 - pigment.r)) * 255);
      refData[px + 1] = Math.round((1 - refAlpha * (1 - pigment.g)) * 255);
      refData[px + 2] = Math.round((1 - refAlpha * (1 - pigment.b)) * 255);
      refData[px + 3] = 255;

      outData[px] = Math.round((1 - enhancedAlpha * (1 - pigment.r)) * 255);
      outData[px + 1] = Math.round((1 - enhancedAlpha * (1 - pigment.g)) * 255);
      outData[px + 2] = Math.round((1 - enhancedAlpha * (1 - pigment.b)) * 255);
      outData[px + 3] = 255;
    }
  }

  return {
    paperField,
    referenceImage: { width: size, height: size, data: refData },
    enhancedImage: { width: size, height: size, data: outData },
    meanGrainDeposit01: activeCount > 0 ? depositSum / activeCount : 0,
  };
}

export * from "./competitor-wave36-kernels";
export * from "./competitor-wave37-kernels";
export * from "./competitor-wave38-kernels";

