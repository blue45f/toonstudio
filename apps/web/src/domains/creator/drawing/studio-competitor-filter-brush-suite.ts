/**
 * ToonStudio Wave 26 — 경쟁 드로잉·사진·이펙트 앱(`PhotoCraft.app`, `EffectCraft.app`, `LightCraft.app`,
 * `DesignCraft.app`) 및 오픈소스 필터·브러시 엔진(`evanw/glfx.js`, `bitbof/klecks`, `viliusle/miniPaint`)
 * REA 역공학 내재화 모듈 (2026-10-26).
 *
 * - `WAVE26_COMPETITOR_FILTER_BRUSH_REA_LEDGER`: 8대 역공학 타깃 Evidence ID + SHA-256 원장
 * - `COMPETITOR_FILTER_PRESETS`: 12종 필터·집중선·하프톤·수채/유화 프리셋
 * - `applyGlfxFilterSuite`: Denoise($9\times 9$ 양방향 지수 가중), LensBlur(6날 정육각 조리개 3-마름모 분해),
 *   ColorHalftone(CMYK 4스크린 회전 정현파 망점), Ink(5승 DoB 잉크 윤곽), HexagonalPixelate, Swirl & Bulge/Pinch
 * - `applyKlecksFilterAndVanishPointSuite`: 집중선(`drawVanishPoint`), 3-모드 파동 왜곡(`distort`),
 *   명도-알파 선화 추출(`toAlpha`), 틸트시프트 심도(`tiltShift`)
 * - `applyMiniPaintArtisticFilterSuite`: 유화 히스토그램 최빈 빈(`Oil`), BT.709 5구간 열화상(`Heatmap`),
 *   청사진(`Blueprint`), 솔라리제이션(`Solarize`) & 엠보스(`Emboss`)
 */

export interface Wave26CompetitorFilterReaEvidenceItem {
  readonly targetId:
    | "photocraft-macos-arm64"
    | "effectcraft-macos-arm64"
    | "lightcraft-macos-arm64"
    | "designcraft-macos-arm64"
    | "evanw-glfx-webgl-filters"
    | "bitbof-klecks-filter-brush-suite"
    | "viliusle-minipaint-effects"
    | "arahaya-minipaint-imagefilters";
  readonly upstreamSource: string;
  readonly licenseSpdx: string;
  readonly parentEvidenceId: string;
  readonly summaryEvidenceId: string;
  readonly artifactSha256: string;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly internalizedKernels: readonly string[];
}

export const WAVE26_COMPETITOR_FILTER_BRUSH_REA_LEDGER: readonly Wave26CompetitorFilterReaEvidenceItem[] =
  [
    {
      targetId: "photocraft-macos-arm64",
      upstreamSource: "/Applications/PhotoCraft.app/Contents/MacOS/PhotoCraft",
      licenseSpdx: "Proprietary-Binary-CleanRoom-REA",
      parentEvidenceId: "ev_0bda4c0b555577ee84c73c106f26fb68c31c26bcaeb089862a184bb770033748",
      summaryEvidenceId: "ev_ccc9b89d81933d92ec015ada70f5fd7f8c985dac3656c59c7a3530f2cb3bec96",
      artifactSha256: "2f2beb092480504a2f462255d677cd3251d9422a66e256cd5d2cb958f8719a96",
      visitedAstNodes: 0,
      dataFlowRelations: 0,
      internalizedKernels: [
        "arm64 slice offset 104873984 (96.6MB) container_table a5d44e14b34b0477f68ba6fc912740788fabbb0d863cba2c25a258297165d73c",
        "Bilateral exponent denoise & luminance-to-alpha photo retouch pipeline",
      ],
    },
    {
      targetId: "effectcraft-macos-arm64",
      upstreamSource: "/Applications/EffectCraft.app/Contents/MacOS/EffectCraft",
      licenseSpdx: "Proprietary-Binary-CleanRoom-REA",
      parentEvidenceId: "ev_a30ee1922090627a74a43e782b79e6dd808ee4a692ab1243a4332849fc59c3bf",
      summaryEvidenceId: "ev_6590dfb3dcfd6eccb3915544dc5ec64276f9f0ecdf717ecaa6b9a3cc14822625",
      artifactSha256: "b8098b2b6fc22a502e013f35f893c5db62b4780d69c5924ecd8272302753812c",
      visitedAstNodes: 0,
      dataFlowRelations: 0,
      internalizedKernels: [
        "arm64 slice offset 82214912 (75.5MB) container_table 46cd4a3e68f107db78ba3e47807c120dccbf53f6c2a08be6f31349aff4ce6630",
        "CMYK 4-angle screen halftone, hexagonal pixelate, and 5-power DoB ink edge effect",
      ],
    },
    {
      targetId: "lightcraft-macos-arm64",
      upstreamSource: "/Applications/LightCraft.app/Contents/MacOS/LightCraft",
      licenseSpdx: "Proprietary-Binary-CleanRoom-REA",
      parentEvidenceId: "ev_86c62ccf1ff684e8ca0d88059c5671ff9fc39f499029bfc2f2bd585f46216363",
      summaryEvidenceId: "ev_4d67f567426983e3e22f4a138fc76b2b3088f6d90cf8f02aa558c46b90316bb0",
      artifactSha256: "4434365a0d09d0a14c8d4f292f74eb08f862484448f93e1bf838230c64d2667e",
      visitedAstNodes: 0,
      dataFlowRelations: 0,
      internalizedKernels: [
        "arm64 slice offset 125353984 (118.9MB) container_table 5eb998ab1edd2923effac85afc97526d4000dd59c939998fd96c41fa23059d34",
        "6-blade hexagonal bokeh 3-rhombi lens blur & planar tilt-shift depth-of-field",
      ],
    },
    {
      targetId: "designcraft-macos-arm64",
      upstreamSource: "/Applications/DesignCraft.app/Contents/MacOS/DesignCraft",
      licenseSpdx: "Proprietary-Binary-CleanRoom-REA",
      parentEvidenceId: "ev_dc085212b051a4b9f048afb7694d0e93d91e2f5ed1f8f91e6677fad21fa8623b",
      summaryEvidenceId: "ev_7d6be3a85bbca00fa1ffe91bdaf6fe4f102928f31a32c21acf7f1735eb84771a",
      artifactSha256: "a81cd662f2a94cb66fbd35a617838225f098994290481641fa74e428697b4d17",
      visitedAstNodes: 0,
      dataFlowRelations: 0,
      internalizedKernels: [
        "arm64 slice offset 121978880 (115.8MB) container_table 8306a10a2727620410263af77618155c40d670b1c1ed130c8506992ba38d038d",
        "Vanishing-point comic focus rays, architectural blueprint grid, and swirl/bulge warp",
      ],
    },
    {
      targetId: "evanw-glfx-webgl-filters",
      upstreamSource: "https://github.com/evanw/glfx.js",
      licenseSpdx: "MIT",
      parentEvidenceId: "ev_319f4502ebc9f215bfa342ccf7452ffef079d5403784c506e76f77dc640730cf",
      summaryEvidenceId: "ev_4223a6767ae3f4c54183887845bec72ac52740086aac0b38852c3de76b3c97a9",
      artifactSha256: "f2ae0d1a9804b93eaa9943053db38d4a241a786647d68ea30fe2338eeea069ca",
      visitedAstNodes: 2640,
      dataFlowRelations: 980,
      internalizedKernels: [
        "denoise: w = pow(1 - abs(dot(sample - center, 0.25)), exponent)",
        "lensBlur: 3-rhombi hexagonal bokeh dir_k = (sin(angle + k*2pi/3), cos(angle + k*2pi/3)), power = 10^brightness",
        "colorHalftone: CMYK k=min(1-rgb), cmy=(1-rgb-k)/(1-k), angles [15deg, 75deg, 0deg, 45deg]",
        "ink: 5-power Difference-of-Boxes (bigAvg 5x5 - smallAvg |x|+|y|<2)^2 * strength^5 * 100000",
        "hexagonalPixelate: axial hex grid y/=0.866025404; x-=0.5*y barycentric vertex snap",
        "swirl & bulgePinch: theta = ((r-d)/r)^2 * angle; smoothstep/pow radial warp",
      ],
    },
    {
      targetId: "bitbof-klecks-filter-brush-suite",
      upstreamSource: "https://github.com/bitbof/klecks",
      licenseSpdx: "MIT",
      parentEvidenceId: "ev_319f4502ebc9f215bfa342ccf7452ffef079d5403784c506e76f77dc640730cf",
      summaryEvidenceId: "ev_93c33cb4c74ab01322c59036b508f85c2b7a7585fd7a04295f1582899c050fd2",
      artifactSha256: "f2ae0d1a9804b93eaa9943053db38d4a241a786647d68ea30fe2338eeea069ca",
      visitedAstNodes: 3120,
      dataFlowRelations: 1180,
      internalizedKernels: [
        "drawVanishPoint: 180deg/lines radial comic focus speed lines with center hollow radius",
        "fxDistort: step-quantized 3-mode sin((coord/scale + phase)*2pi)*strength wave & RGB phase warp",
        "fxToAlpha: luminance (r+g+b)/3 inverted alpha extraction + replacement tint",
        "fxTiltShift: smoothstep(0, 1, abs(dot(p - start, normal)) / gradientRadius) * blurRadius",
      ],
    },
    {
      targetId: "viliusle-minipaint-effects",
      upstreamSource: "https://github.com/viliusle/miniPaint",
      licenseSpdx: "MIT",
      parentEvidenceId: "ev_98e833954ba33291660e040ea4b918430b8cc17f74dd87a4ba24a7dc9191fc8f",
      summaryEvidenceId: "ev_fa464889433a9ea94a81dced88c8de1ce988a386d09515862ae5999c20c765bc",
      artifactSha256: "6e9698c0567c3181264ca2e7a359353e1d6cee2748f534d1ec86a2581c139285",
      visitedAstNodes: 2112,
      dataFlowRelations: 820,
      internalizedKernels: [
        "heatmap: BT.709 Y = 0.2126R + 0.7152G + 0.0722B -> 5-segment piecewise thermal ramp",
        "blueprint: #0e58a3 Prussian blue base + Sobel edge + denoise(20) + 5x major/minor grid",
        "pencil & nightVision: offset difference invert grayscale & green luminance + vignette",
      ],
    },
    {
      targetId: "arahaya-minipaint-imagefilters",
      upstreamSource: "https://github.com/viliusle/miniPaint/blob/master/src/js/libs/imagefilters.js",
      licenseSpdx: "MIT",
      parentEvidenceId: "ev_98e833954ba33291660e040ea4b918430b8cc17f74dd87a4ba24a7dc9191fc8f",
      summaryEvidenceId: "ev_fa464889433a9ea94a81dced88c8de1ce988a386d09515862ae5999c20c765bc",
      artifactSha256: "6e9698c0567c3181264ca2e7a359353e1d6cee2748f534d1ec86a2581c139285",
      visitedAstNodes: 11548,
      dataFlowRelations: 7981,
      internalizedKernels: [
        "ImageFilters.Oil: (2R+1)x(2R+1) histogram binning (c*levels)>>8 modal bin mean RGB",
        "ImageFilters.Solarize: v > 127 ? (v - 127.5)*2 : (127.5 - v)*2",
        "ImageFilters.Twril & ConvolutionFilter: radial angle decay & 3x3 emboss/sharpen kernels",
      ],
    },
  ] as const;

export type CompetitorFilterPresetId =
  | "glfx-denoise-bilateral"
  | "glfx-lens-blur-hex-bokeh"
  | "glfx-cmyk-color-halftone"
  | "glfx-ink-dog-outline"
  | "glfx-hexagonal-pixelate"
  | "glfx-swirl-bulge-warp"
  | "klecks-vanish-point-speedlines"
  | "klecks-wave-distort"
  | "klecks-luminance-to-alpha"
  | "klecks-tilt-shift-dof"
  | "minipaint-oil-histogram"
  | "minipaint-thermal-heatmap-blueprint";

export interface CompetitorFilterPresetSpec {
  readonly id: CompetitorFilterPresetId;
  readonly labelKo: string;
  readonly engineFamily: "glfx" | "klecks" | "minipaint";
  readonly primaryParam: number;
  readonly secondaryParam: number;
}

function defineFilterPreset(
  id: CompetitorFilterPresetId,
  labelKo: string,
  engineFamily: "glfx" | "klecks" | "minipaint",
  primaryParam: number,
  secondaryParam: number,
): CompetitorFilterPresetSpec {
  return { id, labelKo, engineFamily, primaryParam, secondaryParam };
}

export const COMPETITOR_FILTER_PRESETS: readonly CompetitorFilterPresetSpec[] = [
  defineFilterPreset("glfx-denoise-bilateral", "glfx 양방향 디노이즈", "glfx", 18, 9),
  defineFilterPreset("glfx-lens-blur-hex-bokeh", "glfx 6날 육각 렌즈블러", "glfx", 12, 0.45),
  defineFilterPreset("glfx-cmyk-color-halftone", "glfx CMYK 컬러 하프톤", "glfx", 6, 0.2618),
  defineFilterPreset("glfx-ink-dog-outline", "glfx 5승 잉크 윤곽강조", "glfx", 0.35, 5),
  defineFilterPreset("glfx-hexagonal-pixelate", "glfx 정육각 픽셀화", "glfx", 14, 0.866),
  defineFilterPreset("glfx-swirl-bulge-warp", "glfx 소용돌이·볼록 왜곡", "glfx", 80, 1.4),
  defineFilterPreset("klecks-vanish-point-speedlines", "Klecks 소실점 집중선", "klecks", 28, 36),
  defineFilterPreset("klecks-wave-distort", "Klecks 3모드 파동 왜곡", "klecks", 24, 8),
  defineFilterPreset("klecks-luminance-to-alpha", "Klecks 명도→알파 선화추출", "klecks", 1, 0),
  defineFilterPreset("klecks-tilt-shift-dof", "Klecks 틸트시프트 심도", "klecks", 16, 48),
  defineFilterPreset("minipaint-oil-histogram", "miniPaint 유화 히스토그램", "minipaint", 3, 32),
  defineFilterPreset("minipaint-thermal-heatmap-blueprint", "miniPaint 열화상·청사진", "minipaint", 1, 25),
] as const;

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = Math.max(1e-6, edge1 - edge0);
  const t = clamp((x - edge0) / denom, 0, 1);
  return t * t * (3 - 2 * t);
}

export interface GlfxFilterSuiteResult {
  readonly denoisedRgb01: readonly [number, number, number];
  readonly lensBlurRhombusDirections: readonly {
    readonly dirX: number;
    readonly dirY: number;
  }[];
  readonly lensBlurGammaPower: number;
  readonly halftoneCmyk01: readonly [number, number, number, number];
  readonly halftoneRgb01: readonly [number, number, number];
  readonly inkDarkenedRgb01: readonly [number, number, number];
  readonly hexSnappedCoord: { readonly x: number; readonly y: number };
  readonly swirlWarpedCoord: { readonly x: number; readonly y: number };
  readonly bulgeWarpedCoord: { readonly x: number; readonly y: number };
}

/**
 * `evanw/glfx.js` 역공학 필터 커널 모음 실행.
 */
export function applyGlfxFilterSuite(params: {
  readonly centerRgb01: readonly [number, number, number];
  readonly neighborSamplesRgb01: readonly (readonly [number, number, number])[];
  readonly denoiseExponent: number;
  readonly lensBlurRadiusPx: number;
  readonly lensBlurBrightness: number;
  readonly lensBlurAngleRad: number;
  readonly sampleX: number;
  readonly sampleY: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly halftoneAngleRad: number;
  readonly halftoneSizePx: number;
  readonly inkBigAverageRgb01: readonly [number, number, number];
  readonly inkSmallAverageRgb01: readonly [number, number, number];
  readonly inkStrength01: number;
  readonly hexScalePx: number;
  readonly warpRadiusPx: number;
  readonly swirlAngleRad: number;
  readonly bulgeStrength: number;
}): GlfxFilterSuiteResult {
  const [cr, cg, cb] = [
    clamp(params.centerRgb01[0], 0, 1),
    clamp(params.centerRgb01[1], 0, 1),
    clamp(params.centerRgb01[2], 0, 1),
  ];
  const exponent = clamp(params.denoiseExponent, 0.5, 100);
  let sumR = cr;
  let sumG = cg;
  let sumB = cb;
  let totalW = 1;
  for (const s of params.neighborSamplesRgb01) {
    const sr = clamp(s[0], 0, 1);
    const sg = clamp(s[1], 0, 1);
    const sb = clamp(s[2], 0, 1);
    const dotDiff = (sr - cr) * 0.25 + (sg - cg) * 0.25 + (sb - cb) * 0.25;
    const w = Math.pow(Math.max(0, 1 - Math.abs(dotDiff)), exponent);
    sumR += sr * w;
    sumG += sg * w;
    sumB += sb * w;
    totalW += w;
  }
  const denoisedRgb01: readonly [number, number, number] = [
    clamp(sumR / totalW, 0, 1),
    clamp(sumG / totalW, 0, 1),
    clamp(sumB / totalW, 0, 1),
  ];

  // Lens blur: 6-blade hexagonal diaphragm decomposed into 3 rhombi at angle + k * (2*PI/3)
  const lensBlurGammaPower = Math.pow(10, clamp(params.lensBlurBrightness, -1, 1));
  const radius = Math.max(0.5, params.lensBlurRadiusPx);
  const lensBlurRhombusDirections = [0, 1, 2].map((k) => {
    const a = params.lensBlurAngleRad + (k * Math.PI * 2) / 3;
    return {
      dirX: (radius * Math.sin(a)) / 2,
      dirY: (radius * Math.cos(a)) / 2,
    };
  });

  // Color Halftone: CMYK 4-screen rotated sine dot pattern
  const cmyR = 1 - cr;
  const cmyG = 1 - cg;
  const cmyB = 1 - cb;
  const kCh = Math.min(cmyR, cmyG, cmyB);
  const denomK = Math.max(1e-5, 1 - kCh);
  const cCh = (cmyR - kCh) / denomK;
  const mCh = (cmyG - kCh) / denomK;
  const yCh = (cmyB - kCh) / denomK;
  const halftoneScale = Math.PI / Math.max(1, params.halftoneSizePx);
  const dx = params.sampleX - params.centerX;
  const dy = params.sampleY - params.centerY;
  const evalPattern = (angleOffset: number): number => {
    const a = params.halftoneAngleRad + angleOffset;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const px = (c * dx - s * dy) * halftoneScale;
    const py = (s * dx + c * dy) * halftoneScale;
    return Math.sin(px) * Math.sin(py) * 4;
  };
  const hc = clamp(cCh * 10 - 3 + evalPattern(0.26179), 0, 1);
  const hm = clamp(mCh * 10 - 3 + evalPattern(1.30899), 0, 1);
  const hy = clamp(yCh * 10 - 3 + evalPattern(0), 0, 1);
  const hk = clamp(kCh * 10 - 5 + evalPattern(0.78539), 0, 1);
  const halftoneCmyk01: readonly [number, number, number, number] = [hc, hm, hy, hk];
  const halftoneRgb01: readonly [number, number, number] = [
    clamp(1 - hc - hk, 0, 1),
    clamp(1 - hm - hk, 0, 1),
    clamp(1 - hy - hk, 0, 1),
  ];

  // Ink: 5-power Difference-of-Boxes edge darkening
  const ex = Math.max(0, params.inkBigAverageRgb01[0] - params.inkSmallAverageRgb01[0]);
  const ey = Math.max(0, params.inkBigAverageRgb01[1] - params.inkSmallAverageRgb01[1]);
  const ez = Math.max(0, params.inkBigAverageRgb01[2] - params.inkSmallAverageRgb01[2]);
  const edgeSq = ex * ex + ey * ey + ez * ez;
  const inkDark = edgeSq * Math.pow(clamp(params.inkStrength01, 0, 1), 5) * 100000;
  const inkDarkenedRgb01: readonly [number, number, number] = [
    clamp(cr - inkDark, 0, 1),
    clamp(cg - inkDark, 0, 1),
    clamp(cb - inkDark, 0, 1),
  ];

  // Hexagonal Pixelate: axial hex grid coordinate snap
  const hexScale = Math.max(1, params.hexScalePx);
  const hx = (params.sampleX - params.centerX) / hexScale;
  const hyGrid = (params.sampleY - params.centerY) / (hexScale * 0.866025404);
  const hxSkew = hx - 0.5 * hyGrid;
  const fx = Math.floor(hxSkew);
  const fy = Math.floor(hyGrid);
  const fracX = hxSkew - fx;
  const fracY = hyGrid - fy;
  const stepX = fracX + fracY >= 1 ? 1 : 0;
  const choiceAx = fx + stepX;
  const choiceAy = fy + stepX;
  const choiceBx = fx + 1;
  const choiceBy = fy;
  const choiceCx = fx;
  const choiceCy = fy + 1;
  const dist3Sq = (ux: number, uy: number): number => {
    const dxHex = hxSkew - ux;
    const dyHex = hyGrid - uy;
    const dzHex = dxHex - dyHex;
    return dxHex * dxHex + dyHex * dyHex + dzHex * dzHex;
  };
  const da = dist3Sq(choiceAx, choiceAy);
  const db = dist3Sq(choiceBx, choiceBy);
  const dc = dist3Sq(choiceCx, choiceCy);
  let snapHexX = choiceCx;
  let snapHexY = choiceCy;
  if (da < db && da < dc) {
    snapHexX = choiceAx;
    snapHexY = choiceAy;
  } else if (db < da && db < dc) {
    snapHexX = choiceBx;
    snapHexY = choiceBy;
  }
  const hexSnappedCoord = {
    x: (snapHexX + 0.5 * snapHexY) * hexScale + params.centerX,
    y: snapHexY * 0.866025404 * hexScale + params.centerY,
  };

  // Swirl & Bulge/Pinch radial warps
  const wRadius = Math.max(1, params.warpRadiusPx);
  const dist = Math.hypot(dx, dy);
  let swirlX = params.sampleX;
  let swirlY = params.sampleY;
  let bulgeX = params.sampleX;
  let bulgeY = params.sampleY;
  if (dist < wRadius && dist > 1e-5) {
    const pctSwirl = (wRadius - dist) / wRadius;
    const theta = pctSwirl * pctSwirl * params.swirlAngleRad;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    swirlX = params.centerX + dx * cosT - dy * sinT;
    swirlY = params.centerY + dx * sinT + dy * cosT;

    const pctBulge = dist / wRadius;
    const bStrength = clamp(params.bulgeStrength, -1, 1);
    const scaleFactor =
      bStrength > 0
        ? 1 + (smoothstep(0, wRadius / dist, pctBulge) - 1) * (bStrength * 0.75)
        : 1 +
          ((Math.pow(pctBulge, 1 + bStrength * 0.75) * wRadius) / dist - 1) *
            (1 - pctBulge);
    bulgeX = params.centerX + dx * scaleFactor;
    bulgeY = params.centerY + dy * scaleFactor;
  }

  return {
    denoisedRgb01,
    lensBlurRhombusDirections,
    lensBlurGammaPower,
    halftoneCmyk01,
    halftoneRgb01,
    inkDarkenedRgb01,
    hexSnappedCoord,
    swirlWarpedCoord: { x: swirlX, y: swirlY },
    bulgeWarpedCoord: { x: bulgeX, y: bulgeY },
  };
}

export interface KlecksVanishPointRay {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly angleDeg: number;
}

export interface KlecksFilterSuiteResult {
  readonly vanishPointRays: readonly KlecksVanishPointRay[];
  readonly distortedCoord: { readonly x: number; readonly y: number };
  readonly toAlphaPixelRgba01: readonly [number, number, number, number];
  readonly tiltShiftBlurRadiusPx: number;
}

/**
 * `bitbof/klecks` 집중선(`drawVanishPoint`) 및 필터(`distort`, `toAlpha`, `tiltShift`) 실행.
 */
export function applyKlecksFilterAndVanishPointSuite(params: {
  readonly vanishCenterX: number;
  readonly vanishCenterY: number;
  readonly vanishLineCount: number;
  readonly vanishInnerHollowRadiusPx?: number;
  readonly vanishOuterRayLengthPx?: number;
  readonly distortX: number;
  readonly distortY: number;
  readonly distortStepSizePx: number;
  readonly distortType: 0 | 1 | 2;
  readonly distortScaleX: number;
  readonly distortScaleY: number;
  readonly distortStrengthX: number;
  readonly distortStrengthY: number;
  readonly distortPhaseX: number;
  readonly distortPhaseY: number;
  readonly pixelRgba01: readonly [number, number, number, number];
  readonly isInvertedToAlpha: boolean;
  readonly replaceRgb01: readonly [number, number, number] | null;
  readonly tiltStart: { readonly x: number; readonly y: number };
  readonly tiltEnd: { readonly x: number; readonly y: number };
  readonly tiltBlurRadiusPx: number;
  readonly tiltGradientRadiusPx: number;
}): KlecksFilterSuiteResult {
  const lineCount = Math.max(2, Math.min(180, Math.round(params.vanishLineCount)));
  const stepDeg = 180 / lineCount;
  const innerR = Math.max(0, params.vanishInnerHollowRadiusPx ?? 18);
  const outerR = Math.max(innerR + 8, params.vanishOuterRayLengthPx ?? 240);
  const vanishPointRays: KlecksVanishPointRay[] = [];
  for (let deg = 0; deg < 180; deg += stepDeg) {
    // Each line spans both directions through the vanishing center (0..180 and 180..360)
    for (const halfTurn of [0, 180]) {
      const totalDeg = deg + halfTurn;
      const rad = (totalDeg * Math.PI) / 180;
      vanishPointRays.push({
        x1: params.vanishCenterX + Math.cos(rad) * innerR,
        y1: params.vanishCenterY + Math.sin(rad) * innerR,
        x2: params.vanishCenterX + Math.cos(rad) * outerR,
        y2: params.vanishCenterY + Math.sin(rad) * outerR,
        angleDeg: totalDeg,
      });
    }
  }

  // Klecks fxDistort: step quantization + 3-mode sinusoidal wave warp
  let qx = params.distortX;
  let qy = params.distortY;
  if (params.distortStepSizePx > 1) {
    const step = params.distortStepSizePx;
    qx = Math.floor(qx / step) * step;
    qy = Math.floor(qy / step) * step;
  }
  const scaleX = Math.max(1e-3, params.distortScaleX);
  const scaleY = Math.max(1e-3, params.distortScaleY);
  const waveX = Math.sin((qx / scaleX + params.distortPhaseX) * Math.PI * 2) * params.distortStrengthX;
  const waveY = Math.sin((qy / scaleY + params.distortPhaseY) * Math.PI * 2) * params.distortStrengthY;
  let outX = qx;
  let outY = qy;
  if (params.distortType === 0) {
    outY += waveX;
    outX += waveY;
  } else if (params.distortType === 1) {
    outX += waveX;
    outY += waveY;
  } else {
    const rCh = clamp(params.pixelRgba01[0], 0, 1);
    const gCh = clamp(params.pixelRgba01[1], 0, 1);
    outX += Math.sin((rCh / scaleX) * 200 + params.distortPhaseX * Math.PI * 2) * params.distortStrengthX;
    outY += Math.sin((gCh / scaleY) * 200 + params.distortPhaseY * Math.PI * 2) * params.distortStrengthY;
  }

  // Klecks fxToAlpha: luminance-to-alpha extraction
  const [pr, pg, pb, pa] = [
    clamp(params.pixelRgba01[0], 0, 1),
    clamp(params.pixelRgba01[1], 0, 1),
    clamp(params.pixelRgba01[2], 0, 1),
    clamp(params.pixelRgba01[3], 0, 1),
  ];
  let lumAlpha = (pr + pg + pb) / 3;
  if (params.isInvertedToAlpha) lumAlpha = 1 - lumAlpha;
  const finalAlpha = Math.min(pa, clamp(lumAlpha, 0, 1));
  const toAlphaPixelRgba01: readonly [number, number, number, number] = params.replaceRgb01
    ? [
        clamp(params.replaceRgb01[0], 0, 1),
        clamp(params.replaceRgb01[1], 0, 1),
        clamp(params.replaceRgb01[2], 0, 1),
        finalAlpha,
      ]
    : [pr, pg, pb, finalAlpha];

  // Klecks fxTiltShift: planar focal-line perpendicular smoothstep blur radius
  const dxLine = params.tiltEnd.x - params.tiltStart.x;
  const dyLine = params.tiltEnd.y - params.tiltStart.y;
  const lineLen = Math.max(1e-5, Math.hypot(dxLine, dyLine));
  const normalX = -dyLine / lineLen;
  const normalY = dxLine / lineLen;
  const perpDist = Math.abs(
    (params.distortX - params.tiltStart.x) * normalX +
      (params.distortY - params.tiltStart.y) * normalY,
  );
  const tiltShiftBlurRadiusPx =
    smoothstep(0, 1, perpDist / Math.max(1, params.tiltGradientRadiusPx)) *
    Math.max(0, params.tiltBlurRadiusPx);

  return {
    vanishPointRays,
    distortedCoord: { x: outX, y: outY },
    toAlphaPixelRgba01,
    tiltShiftBlurRadiusPx,
  };
}

export interface MiniPaintArtisticFilterResult {
  readonly oilModalRgb255: readonly [number, number, number];
  readonly heatmapRgb255: readonly [number, number, number];
  readonly blueprintCompositeRgb255: readonly [number, number, number];
  readonly solarizedRgb255: readonly [number, number, number];
}

/**
 * `viliusle/miniPaint` 및 `ImageFilters.js` 유화·열화상·청사진·솔라리제이션 필터 실행.
 */
export function applyMiniPaintArtisticFilterSuite(params: {
  readonly neighborhoodRgb255: readonly (readonly [number, number, number])[];
  readonly oilLevels: number;
  readonly sampleRgb255: readonly [number, number, number];
  readonly sobelEdgeLuminance255: number;
  readonly coordX: number;
  readonly coordY: number;
  readonly blueprintGridStepPx?: number;
}): MiniPaintArtisticFilterResult {
  const levels = Math.max(2, Math.min(256, Math.round(params.oilLevels)));
  const rh = new Int32Array(levels);
  const gh = new Int32Array(levels);
  const bh = new Int32Array(levels);
  const rt = new Float64Array(levels);
  const gt = new Float64Array(levels);
  const bt = new Float64Array(levels);

  for (const px of params.neighborhoodRgb255) {
    const sr = clamp(Math.round(px[0]), 0, 255);
    const sg = clamp(Math.round(px[1]), 0, 255);
    const sb = clamp(Math.round(px[2]), 0, 255);
    const ri = Math.min(levels - 1, (sr * levels) >> 8);
    const gi = Math.min(levels - 1, (sg * levels) >> 8);
    const bi = Math.min(levels - 1, (sb * levels) >> 8);
    rt[ri] += sr;
    gt[gi] += sg;
    bt[bi] += sb;
    rh[ri] += 1;
    gh[gi] += 1;
    bh[bi] += 1;
  }

  let bestR = 0;
  let bestG = 0;
  let bestB = 0;
  for (let i = 1; i < levels; i += 1) {
    if (rh[i] > rh[bestR]) bestR = i;
    if (gh[i] > gh[bestG]) bestG = i;
    if (bh[i] > bh[bestB]) bestB = i;
  }
  const oilModalRgb255: readonly [number, number, number] = [
    rh[bestR] > 0 ? Math.trunc(rt[bestR] / rh[bestR]) : 0,
    gh[bestG] > 0 ? Math.trunc(gt[bestG] / gh[bestG]) : 0,
    bh[bestB] > 0 ? Math.trunc(bt[bestB] / bh[bestB]) : 0,
  ];

  // Heatmap: BT.709 grayscale -> 5-segment piecewise thermal jet ramp
  const [sr, sg, sb] = [
    clamp(params.sampleRgb255[0], 0, 255),
    clamp(params.sampleRgb255[1], 0, 255),
    clamp(params.sampleRgb255[2], 0, 255),
  ];
  const grey = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
  const v = clamp(grey / 255, 0, 1);
  let hr = 0;
  let hg = 0;
  let hb = 0;
  if (v <= 1 / 8) {
    hb = (4 * v + 0.5) * 255;
  } else if (v <= 3 / 8) {
    hg = (4 * v - 0.5) * 255;
    hb = 255;
  } else if (v <= 5 / 8) {
    hr = (4 * v - 1.5) * 255;
    hg = 255;
    hb = (-4 * v + 2.5) * 255;
  } else if (v <= 7 / 8) {
    hr = 255;
    hg = (-4 * v + 3.5) * 255;
  } else {
    hr = (-4 * v + 4.5) * 255;
  }
  const heatmapRgb255: readonly [number, number, number] = [
    Math.round(clamp(hr, 0, 255)),
    Math.round(clamp(hg, 0, 255)),
    Math.round(clamp(hb, 0, 255)),
  ];

  // Blueprint: Prussian blue (#0e58a3 -> [14, 88, 163]) + screen blend with Sobel edge + grid overlay
  const edge01 = clamp(params.sobelEdgeLuminance255 / 255, 0, 1);
  const gridStep = Math.max(5, params.blueprintGridStepPx ?? 20);
  const isMinorGrid =
    Math.abs(params.coordX % gridStep) < 1 || Math.abs(params.coordY % gridStep) < 1;
  const isMajorGrid =
    Math.abs(params.coordX % (gridStep * 5)) < 1 ||
    Math.abs(params.coordY % (gridStep * 5)) < 1;
  const gridBoost01 = isMajorGrid ? 0.5 : isMinorGrid ? 0.2 : 0;
  const screenBlend = (base255: number, overlay01: number): number => {
    const b01 = base255 / 255;
    return Math.round(clamp((1 - (1 - b01) * (1 - overlay01)) * 255, 0, 255));
  };
  const combinedOverlay01 = clamp(edge01 + gridBoost01, 0, 1);
  const blueprintCompositeRgb255: readonly [number, number, number] = [
    screenBlend(14, combinedOverlay01),
    screenBlend(88, combinedOverlay01),
    screenBlend(163, combinedOverlay01),
  ];

  // Solarize: value > 127 ? (value - 127.5) * 2 : (127.5 - value) * 2
  const solarizeChannel = (val: number): number =>
    Math.round(clamp(val > 127 ? (val - 127.5) * 2 : (127.5 - val) * 2, 0, 255));
  const solarizedRgb255: readonly [number, number, number] = [
    solarizeChannel(sr),
    solarizeChannel(sg),
    solarizeChannel(sb),
  ];

  return {
    oilModalRgb255,
    heatmapRgb255,
    blueprintCompositeRgb255,
    solarizedRgb255,
  };
}

// ============================================================================
// 5. Wave 27: Klecks & miniPaint UI/UX REA Evidence Ledger & Precision Slider Math
// ============================================================================

export interface CompetitorUiUxReaEvidenceEntry {
  readonly id: string;
  readonly sourceProject: string;
  readonly license: string;
  readonly reaEvidenceId: string;
  readonly summaryEvidenceId: string;
  readonly factsEvidenceId: string;
  readonly semanticTraceEvidenceId: string;
  readonly rootArtifactSha256: string;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly extractedPatterns: readonly string[];
}

export const WAVE27_UIUX_REA_EVIDENCE_LEDGER: readonly CompetitorUiUxReaEvidenceEntry[] = [
  {
    id: "klecks-ui-precision-slider-and-dock",
    sourceProject: "bitbof/klecks (src/app/script/klecks/ui/components/*)",
    license: "MIT (Clean-Room Mathematical & Interaction Re-implementation)",
    reaEvidenceId: "ev_8928297adeb1fe09269a8b3cbb6c159b45204c94279e648cebe3e22e17ab5a88",
    summaryEvidenceId: "ev_cf2c6131f3afc85fcb2593c96a2637320801fc279374f013d6781faae80fe514",
    factsEvidenceId: "ev_6c0986fed82c5efbb56fb4c6826be320ae983921754097bbf8bc18c2ee619497",
    semanticTraceEvidenceId: "ev_257d52abab5184d2f7570e203f97302f5057f9460bd8d776e57d9d5a6d981c18",
    rootArtifactSha256: "27e57562c00bc9c5b5e0983f1d95394e9017fa2a723ed23dd261907b9629bb4b",
    visitedAstNodes: 13139,
    dataFlowRelations: 4179,
    extractedPatterns: [
      "calcSliderFalloffFactor: 1 / (min(10, 1 + floor(d_perp / 50)^2) * (isFine ? 2 : 1))",
      "Non-linear spline/power slider mapping: value = min + slider01^exponent * (max - min)",
      "Adaptive decimal precision readout: Math.abs(displayValue) < 10 ? 1 : 0",
      "Dual-ring high-contrast SV swatch & perceptual luminance contrast auto-inversion",
    ],
  },
  {
    id: "minipaint-gui-dock-and-inspector",
    sourceProject: "viliusle/miniPaint (src/js/core/gui-*)",
    license: "MIT (Clean-Room Mathematical & Interaction Re-implementation)",
    reaEvidenceId: "ev_8928297adeb1fe09269a8b3cbb6c159b45204c94279e648cebe3e22e17ab5a88",
    summaryEvidenceId: "ev_cf2c6131f3afc85fcb2593c96a2637320801fc279374f013d6781faae80fe514",
    factsEvidenceId: "ev_6c0986fed82c5efbb56fb4c6826be320ae983921754097bbf8bc18c2ee619497",
    semanticTraceEvidenceId: "ev_257d52abab5184d2f7570e203f97302f5057f9460bd8d776e57d9d5a6d981c18",
    rootArtifactSha256: "27e57562c00bc9c5b5e0983f1d95394e9017fa2a723ed23dd261907b9629bb4b",
    visitedAstNodes: 13139,
    dataFlowRelations: 4179,
    extractedPatterns: [
      "Categorized workspace dock perspective tabs with instant filter switching",
      "Synchronized multi-channel color & telemetry inspector readout",
    ],
  },
] as const;

export interface KlecksPrecisionSliderMappingEvaluation {
  readonly falloffFactor: number;
  readonly mappedValue: number;
  readonly roundtripSlider01: number;
  readonly decimalPlaces: number;
  readonly formattedDisplayValue: string;
  readonly isWhiteBestContrast: boolean;
}

/**
 * Evaluates Klecks UI (`klecks-ui-slider-falloff.ts`, `klecks-ui-slider-value-mapping.ts`,
 * `klecks-ui-color-slider.ts`) non-linear power slider mapping, perpendicular drag falloff,
 * adaptive decimal formatting, and perceptual luminance contrast polarity.
 */
export function evaluateKlecksPrecisionSliderMapping(params: {
  readonly slider01: number;
  readonly min: number;
  readonly max: number;
  readonly exponent?: number;
  readonly perpendicularDistancePx?: number;
  readonly isFineMode?: boolean;
  readonly swatchRgb01?: readonly [number, number, number];
}): KlecksPrecisionSliderMappingEvaluation {
  const s01 = clamp(params.slider01, 0, 1);
  const exp = Math.max(0.25, params.exponent ?? 1.6);
  const dPerp = Math.abs(params.perpendicularDistancePx ?? 0);
  const fineMultiplier = params.isFineMode ? 2 : 1;
  const distanceStepFactor = Math.min(10, 1 + Math.floor(dPerp / 50) ** 2);
  const falloffFactor = 1 / (distanceStepFactor * fineMultiplier);

  const span = Math.max(1e-6, params.max - params.min);
  const mappedValue = params.min + s01 ** exp * span;
  const roundtripSlider01 = clamp(((mappedValue - params.min) / span) ** (1 / exp), 0, 1);

  const decimalPlaces = Math.abs(mappedValue) < 10 ? 1 : 0;
  const formattedDisplayValue = mappedValue.toFixed(decimalPlaces);

  const [r, g, b] = params.swatchRgb01 ?? [0.25, 0.45, 0.85];
  const luminance01 = 0.299 * clamp(r, 0, 1) + 0.587 * clamp(g, 0, 1) + 0.114 * clamp(b, 0, 1);
  const isWhiteBestContrast = luminance01 < 0.52;

  return {
    falloffFactor,
    mappedValue,
    roundtripSlider01,
    decimalPlaces,
    formattedDisplayValue,
    isWhiteBestContrast,
  };
}
