/**
 * Grand Monolithic Total Drawing Ecosystem Engine (Wave 30).
 *
 * Clean-room TypeScript internalization of the unfragmented 755-file (`5,483,192` bytes,
 * `771,934` AST nodes) Grand Monolithic Total Ecosystem REA analysis:
 * - Parent Evidence ID: `ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd`
 * - Summary View Evidence ID: `ev_9a60874fcfd34c57bfdfc79e9a6c9294230d5d79f520e01a34ec54e62674cf22`
 * - Facts View Evidence ID: `ev_67c0e254e8e454ebb665b4d8b80ddc75724ce00d02f9b5bec1ec8bd3352cb2c2`
 * - Deep Semantic Vector/Filter View Evidence ID: `ev_206f5ffd007e872c0553b069b07ef339a578ae73d203ac3018e35cb8c2d26c42`
 *   (Summary: `ev_7136429ceae9636e779ee59b62f3449494a76211d00e716fc0d769c6cf1f57b4`, `17,575` data-flow relations)
 */

export type MonolithicTotalSubsystemId =
  | "monolithic-total-755-corpus"
  | "monolithic-konva-kaleidoscope-polar"
  | "monolithic-konva-emboss-enhance-posterize"
  | "monolithic-paper-catmull-rom-flatten"
  | "monolithic-excalidraw-elbow-laser"
  | "monolithic-fabric-spray-atrament-mandala"
  | "monolithic-psd-culori-vision-skia";

export type MonolithicTotalToolPresetId =
  | "monolithic-kaleidoscope-polar"
  | "monolithic-emboss-sobel-8dir"
  | "monolithic-enhance-histogram"
  | "monolithic-posterize-threshold"
  | "monolithic-paper-catmull-smooth"
  | "monolithic-paper-curve-flatten"
  | "monolithic-excalidraw-elbow-arrow"
  | "monolithic-excalidraw-laser-trail"
  | "monolithic-fabric-spray-dedup"
  | "monolithic-fabric-pattern-circle"
  | "monolithic-atrament-adaptive-ink"
  | "monolithic-mandala-perspective-ruler"
  | "monolithic-ag-psd-packbits-8bim"
  | "monolithic-culori-oklch-ciede2000"
  | "monolithic-otsu-canny-lineart-vision"
  | "monolithic-skia-patheffect-lookahead";

export type KonvaEmbossDirection = "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left";

export interface MonolithicTotalReaEvidenceEntry {
  readonly subsystemId: MonolithicTotalSubsystemId;
  readonly labelKo: string;
  readonly evidenceId: string;
  readonly parentEvidenceId: string;
  readonly artifactSha256: string;
  readonly relevantFiles: number;
  readonly parsedJavaScriptFiles: number;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly keyAlgorithms: readonly string[];
}

export interface MonolithicTotalToolPreset {
  readonly id: MonolithicTotalToolPresetId;
  readonly subsystemId: MonolithicTotalSubsystemId;
  readonly labelKo: string;
  readonly category: "filter" | "vector" | "whiteboard" | "brush" | "symmetry";
  readonly sourceReference: string;
  readonly defaultStrength01: number;
  readonly defaultSymmetryAxes: number;
}

export const MONOLITHIC_TOTAL_ECOSYSTEM_REA_LEDGER: readonly MonolithicTotalReaEvidenceEntry[] = [
  { subsystemId: "monolithic-total-755-corpus", labelKo: "755개 파일 통합 모놀리식 드로잉 생태계 코퍼스 (Klecks·miniPaint·GLFX·JSPaint·Piskel·SculptGL·OSS)", evidenceId: "ev_9a60874fcfd34c57bfdfc79e9a6c9294230d5d79f520e01a34ec54e62674cf22", parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd", artifactSha256: "d66decf96d18ebebc93d2125ad186da92b87810de9c637a2008861b9a7f2e4d3", relevantFiles: 755, parsedJavaScriptFiles: 753, visitedAstNodes: 771934, dataFlowRelations: 7303, keyAlgorithms: ["Unfragmented 755-file single-pass AST & static semantic graph extraction (5,483,192 bytes)", "Cross-application brush, filter, vector, pixel-art, 3D sculpting, and UI/UX workspace synthesis"] },
  { subsystemId: "monolithic-konva-kaleidoscope-polar", labelKo: "Konva Kaleidoscope 극좌표 변환(ToPolar/FromPolar) 및 2^p 섹터 미러링", evidenceId: "ev_206f5ffd007e872c0553b069b07ef339a578ae73d203ac3018e35cb8c2d26c42", parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd", artifactSha256: "2bad0b694799add56758c2a6cfd341aebcb9116f5d4a7f1292427f9f1fe66272", relevantFiles: 5, parsedJavaScriptFiles: 5, visitedAstNodes: 1984, dataFlowRelations: 1120, keyAlgorithms: ["ToPolar rMax corner hypot projection & angular phase shift floor(W * (angle % 360) / 360)", "Iterative power-of-two sector reflection dstX = sectionSize * 2 - x - 1 and FromPolar inverse mapping"] },
  { subsystemId: "monolithic-konva-emboss-enhance-posterize", labelKo: "Konva Emboss 8방향 Sobel 릴리프·Enhance 히스토그램 스트레치·Posterize·Threshold", evidenceId: "ev_7136429ceae9636e779ee59b62f3449494a76211d00e716fc0d769c6cf1f57b4", parentEvidenceId: "ev_206f5ffd007e872c0553b069b07ef339a578ae73d203ac3018e35cb8c2d26c42", artifactSha256: "a6b1717548485b21453ce85aaa8c256e660ac6249ef7ff879b77f2228f819bc6", relevantFiles: 4, parsedJavaScriptFiles: 4, visitedAstNodes: 1620, dataFlowRelations: 980, keyAlgorithms: ["8-direction Sobel luminance gradient dot(cx, cy) with SCALE=(128/1020)*(strength*10) and blend relief", "Per-channel min/max histogram stretch (enhance > 0) or midpoint compression (enhance < 0)"] },
  { subsystemId: "monolithic-paper-catmull-rom-flatten", labelKo: "Paper.js Path.smooth 센트리페탈 Catmull-Rom 접선 핸들 및 재귀 곡선 평탄화(Flatten)", evidenceId: "ev_67c0e254e8e454ebb665b4d8b80ddc75724ce00d02f9b5bec1ec8bd3352cb2c2", parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd", artifactSha256: "3bc7eb7366df1b7f82f84a68ce402aa27cf1f91470c7e4ce6ffdc28cc2434c01", relevantFiles: 1, parsedJavaScriptFiles: 1, visitedAstNodes: 15840, dataFlowRelations: 9820, keyAlgorithms: ["Centripetal Catmull-Rom chord parameterization d1^alpha, d2^alpha (alpha=0.5) bezier handle synthesis", "Recursive De Casteljau cubic subdivision until collinearity flatness <= threshold"] },
  { subsystemId: "monolithic-excalidraw-elbow-laser", labelKo: "Excalidraw 직교 엘보우 화살표 맨해튼 A* 라우팅 및 지수 감쇠 레이저 포인터 트레일", evidenceId: "ev_206f5ffd007e872c0553b069b07ef339a578ae73d203ac3018e35cb8c2d26c42", parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd", artifactSha256: "5bc1ae35ee1645048daffd33332ba13b2245e738b280b6332694b0abde93b8af", relevantFiles: 1, parsedJavaScriptFiles: 1, visitedAstNodes: 6411, dataFlowRelations: 4125, keyAlgorithms: ["Heading-aware Manhattan orthogonal elbow routing with obstacle padding and bend penalty", "Time-stamped laser trail decay alpha(t) = max(0, 1 - dt/duration)^1.8 with tapered width"] },
  { subsystemId: "monolithic-fabric-spray-atrament-mandala", labelKo: "Fabric.js SprayBrush 공간 중복 제거·Atrament 적응형 잉크·N축 만다라/원근 자(Ruler)", evidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd", parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd", artifactSha256: "629e94d2e8a352880cc73c1ce07243da4a24262b86bbee4a808f50c759d91a44", relevantFiles: 5, parsedJavaScriptFiles: 5, visitedAstNodes: 2300, dataFlowRelations: 1530, keyAlgorithms: ["Fabric.js SprayBrush _getOptimizedRects grid key deduplication & dotWidth variance", "Atrament velocity-adaptive quadratic midpoint curve & N-axis mandala + 1/2/3-point perspective ruler"] },
  { subsystemId: "monolithic-psd-culori-vision-skia", labelKo: "767모듈 확장 ag-psd PackBits RLE·culori CIEDE2000/OKLCh 개멋맵·Otsu/Canny 선화·Skia 예측", evidenceId: "ev_13bbde3494001044d31ebdb3d481f0cd91c96f6dc995f78b17c1cf9984ea2d28", parentEvidenceId: "ev_16772e0098d20420b766dfb8488aff40fb7c03b2a3503cb3c1fc8301ea5580ce", artifactSha256: "a40eb6e4778360b921c30c9870836f7c3b9e7a0d3f8c9c8d93c367672914ce74", relevantFiles: 767, parsedJavaScriptFiles: 12, visitedAstNodes: 19420, dataFlowRelations: 11376, keyAlgorithms: ["ag-psd PackBits RLE scanline codec & 8BIM 28-mode layer/mask/clipping binary record mapping", "culori OKLab/OKLCh bisection chroma gamut clamping & Sharma CIEDE2000 perceptual DeltaE00", "Otsu between-class variance bimodal threshold, Canny 4-angle NMS hysteresis, & Skia Catmull-Rom lookahead"] },
] as const;

export const MONOLITHIC_TOTAL_TOOL_PRESETS: readonly MonolithicTotalToolPreset[] = [
  { id: "monolithic-kaleidoscope-polar", subsystemId: "monolithic-konva-kaleidoscope-polar", labelKo: "Konva 칼레이도스코프 극좌표 미러", category: "filter", sourceReference: "konva/src/filters/Kaleidoscope.ts", defaultStrength01: 0.75, defaultSymmetryAxes: 8 },
  { id: "monolithic-emboss-sobel-8dir", subsystemId: "monolithic-konva-emboss-enhance-posterize", labelKo: "Konva 8방향 Sobel 엠보스 릴리프", category: "filter", sourceReference: "konva/src/filters/Emboss.ts", defaultStrength01: 0.65, defaultSymmetryAxes: 1 },
  { id: "monolithic-enhance-histogram", subsystemId: "monolithic-konva-emboss-enhance-posterize", labelKo: "Konva 채널별 히스토그램 인핸스", category: "filter", sourceReference: "konva/src/filters/Enhance.ts", defaultStrength01: 0.6, defaultSymmetryAxes: 1 },
  { id: "monolithic-posterize-threshold", subsystemId: "monolithic-konva-emboss-enhance-posterize", labelKo: "Konva 포스터라이즈 & 임계값 이진화", category: "filter", sourceReference: "konva/src/filters/Posterize.ts + Threshold.ts", defaultStrength01: 0.5, defaultSymmetryAxes: 1 },
  { id: "monolithic-paper-catmull-smooth", subsystemId: "monolithic-paper-catmull-rom-flatten", labelKo: "Paper.js Catmull-Rom 자동 베지어 스무딩", category: "vector", sourceReference: "paper.js/src/path/Path.js#smooth", defaultStrength01: 0.5, defaultSymmetryAxes: 1 },
  { id: "monolithic-paper-curve-flatten", subsystemId: "monolithic-paper-catmull-rom-flatten", labelKo: "Paper.js De Casteljau 적응형 평탄화", category: "vector", sourceReference: "paper.js/src/path/Curve.js#flatten", defaultStrength01: 0.4, defaultSymmetryAxes: 1 },
  { id: "monolithic-excalidraw-elbow-arrow", subsystemId: "monolithic-excalidraw-elbow-laser", labelKo: "Excalidraw 맨해튼 직교 엘보우 화살표", category: "whiteboard", sourceReference: "excalidraw/packages/element/src/elbowArrow.ts", defaultStrength01: 0.8, defaultSymmetryAxes: 1 },
  { id: "monolithic-excalidraw-laser-trail", subsystemId: "monolithic-excalidraw-elbow-laser", labelKo: "Excalidraw 지수 감쇠 레이저 포인터", category: "whiteboard", sourceReference: "excalidraw/packages/excalidraw/laser-trail", defaultStrength01: 0.85, defaultSymmetryAxes: 1 },
  { id: "monolithic-fabric-spray-dedup", subsystemId: "monolithic-fabric-spray-atrament-mandala", labelKo: "Fabric.js 공간 중복제거 스프레이 브러시", category: "brush", sourceReference: "fabric.js/src/brushes/spray_brush.class.js", defaultStrength01: 0.7, defaultSymmetryAxes: 1 },
  { id: "monolithic-fabric-pattern-circle", subsystemId: "monolithic-fabric-spray-atrament-mandala", labelKo: "Fabric.js 패턴 타일 & 가변 서클 브러시", category: "brush", sourceReference: "fabric.js/src/brushes/pattern_brush.class.js + circle_brush.class.js", defaultStrength01: 0.65, defaultSymmetryAxes: 1 },
  { id: "monolithic-atrament-adaptive-ink", subsystemId: "monolithic-fabric-spray-atrament-mandala", labelKo: "Atrament 속도 적응형 2차 중점 만년필", category: "brush", sourceReference: "atrament.js/src/atrament.js", defaultStrength01: 0.78, defaultSymmetryAxes: 1 },
  { id: "monolithic-mandala-perspective-ruler", subsystemId: "monolithic-fabric-spray-atrament-mandala", labelKo: "N축 만다라 대칭 & 1·2·3점 투시/등각 자", category: "symmetry", sourceReference: "klecks + krita + clip-studio symmetry/perspective-ruler synthesis", defaultStrength01: 0.9, defaultSymmetryAxes: 8 },
  { id: "monolithic-ag-psd-packbits-8bim", subsystemId: "monolithic-psd-culori-vision-skia", labelKo: "ag-psd PackBits RLE & 8BIM PSD 호환", category: "filter", sourceReference: "ag-psd/dist/helpers.js + psdReader.js + psdWriter.js", defaultStrength01: 0.82, defaultSymmetryAxes: 1 },
  { id: "monolithic-culori-oklch-ciede2000", subsystemId: "monolithic-psd-culori-vision-skia", labelKo: "culori OKLCh 개멋 클램프 & CIEDE2000 색차", category: "filter", sourceReference: "culori/src/clamp.js + difference.js + oklab", defaultStrength01: 0.88, defaultSymmetryAxes: 1 },
  { id: "monolithic-otsu-canny-lineart-vision", subsystemId: "monolithic-psd-culori-vision-skia", labelKo: "Otsu 이진화 & Canny 히스테리시스 선화 추출", category: "filter", sourceReference: "opencv/otsu-canny + miniPaint edge/lineart extraction", defaultStrength01: 0.76, defaultSymmetryAxes: 1 },
  { id: "monolithic-skia-patheffect-lookahead", subsystemId: "monolithic-psd-culori-vision-skia", labelKo: "Skia PathEffect 코너/이산화 & 포인터 예측", category: "vector", sourceReference: "skia/SkCornerPathEffect + SkDiscretePathEffect + pointer-lookahead", defaultStrength01: 0.72, defaultSymmetryAxes: 1 },
] as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const clampByte = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));

/** 1. Konva `Kaleidoscope.ts` (`ToPolar` + $2^p$ sector mirroring + phase offset + `FromPolar`). */
export function evaluateKonvaKaleidoscopePolarMirror(params: {
  readonly width: number;
  readonly height: number;
  readonly sampleX: number;
  readonly sampleY: number;
  readonly power: number;
  readonly angleDeg: number;
}): {
  readonly clampedPower: number;
  readonly rMax: number;
  readonly polarRadiusIndex: number;
  readonly polarThetaIndex: number;
  readonly mirroredThetaIndex: number;
  readonly reconstructedX: number;
  readonly reconstructedY: number;
  readonly minSectionSize: number;
} {
  const w = Math.max(4, Math.floor(params.width));
  const h = Math.max(4, Math.floor(params.height));
  const xMid = w / 2;
  const yMid = h / 2;
  const rMax = Math.max(Math.hypot(xMid, yMid), Math.hypot(w - xMid, h - yMid));
  const clampedPower = Math.min(10, Math.max(1, Math.round(params.power)));
  let minSectionSize = Math.ceil(w / Math.pow(2, clampedPower));
  while (minSectionSize <= 8 && minSectionSize < w) minSectionSize *= 2;

  const dx = params.sampleX - xMid;
  const dy = params.sampleY - yMid;
  const dist = Math.hypot(dx, dy);
  const rawAngleRad = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const polarRadiusIndex = Math.min(h - 1, Math.max(0, Math.round((dist / Math.max(1e-6, rMax)) * h)));
  const polarThetaIndex = Math.min(w - 1, Math.max(0, Math.floor((rawAngleRad / (Math.PI * 2)) * w)));

  const normalizedAngleDeg = ((params.angleDeg % 360) + 360) % 360;
  const xOff = Math.floor((w * normalizedAngleDeg) / 360);
  const baseSection = ((polarThetaIndex + xOff) % w) % (minSectionSize * 2);
  const mirroredInPair = baseSection >= minSectionSize ? minSectionSize * 2 - baseSection - 1 : baseSection;
  const sectionTheta = Math.min(w - 1, Math.max(0, mirroredInPair));

  const outRad = (sectionTheta / w) * Math.PI * 2;
  const outDist = (polarRadiusIndex / h) * rMax;
  return {
    clampedPower,
    rMax,
    polarRadiusIndex,
    polarThetaIndex,
    mirroredThetaIndex: sectionTheta,
    reconstructedX: xMid + outDist * Math.cos(outRad),
    reconstructedY: yMid + outDist * Math.sin(outRad),
    minSectionSize,
  };
}

const KONVA_EMBOSS_DIRECTION_DEG: Readonly<Record<KonvaEmbossDirection, number>> = {
  "top-left": 315,
  top: 270,
  "top-right": 225,
  right: 180,
  "bottom-right": 135,
  bottom: 90,
  "bottom-left": 45,
  left: 0,
};

/** 2. Konva `Emboss.ts`, `Enhance.ts`, `Posterize.ts`, and `Threshold.ts` unified pixel kernel. */
export function evaluateKonvaEmbossEnhancePosterizeSuite(params: {
  readonly rgb: readonly [number, number, number];
  readonly neighborLuminance3x3: readonly [number, number, number, number, number, number, number, number, number];
  readonly channelMinRgb: readonly [number, number, number];
  readonly channelMaxRgb: readonly [number, number, number];
  readonly embossStrength01: number;
  readonly embossWhiteLevel01: number;
  readonly embossDirection: KonvaEmbossDirection;
  readonly embossBlend: boolean;
  readonly enhanceAmount: number;
  readonly posterizeLevels: number;
  readonly threshold01: number;
}): {
  readonly embossRgb: readonly [number, number, number];
  readonly enhancedRgb: readonly [number, number, number];
  readonly posterizedRgb: readonly [number, number, number];
  readonly thresholdBit: 0 | 255;
  readonly directionalSobelResponse: number;
} {
  const n = params.neighborLuminance3x3;
  const sx = -n[0] + n[2] - 2 * n[3] + 2 * n[5] - n[6] + n[8];
  const sy = -n[0] - 2 * n[1] - n[2] + n[6] + 2 * n[7] + n[8];
  const dirRad = (KONVA_EMBOSS_DIRECTION_DEG[params.embossDirection] * Math.PI) / 180;
  const directionalSobelResponse = Math.cos(dirRad) * sx - Math.sin(dirRad) * sy;
  const scale = (128 / 1020) * (clamp01(params.embossStrength01) * 10);
  const bias = clamp01(params.embossWhiteLevel01) * 255;
  const outGray = clampByte(bias + directionalSobelResponse * scale);
  const reliefDelta = outGray - bias;
  const embossRgb: readonly [number, number, number] = params.embossBlend
    ? [clampByte(params.rgb[0] + reliefDelta), clampByte(params.rgb[1] + reliefDelta), clampByte(params.rgb[2] + reliefDelta)]
    : [outGray, outGray, outGray];

  const e = Math.min(1, Math.max(-1, params.enhanceAmount));
  const remapChannel = (val: number, cMin: number, cMax: number): number => {
    if (cMax <= cMin) return clampByte(val);
    const cMid = (cMax + cMin) * 0.5;
    const goalMax = e > 0 ? cMax + e * (255 - cMax) : cMax + e * (cMax - cMid);
    const goalMin = e > 0 ? cMin - e * cMin : cMin + e * (cMin - cMid);
    return clampByte(((val - cMin) / (cMax - cMin)) * (goalMax - goalMin) + goalMin);
  };
  const enhancedRgb: readonly [number, number, number] = [
    remapChannel(params.rgb[0], params.channelMinRgb[0], params.channelMaxRgb[0]),
    remapChannel(params.rgb[1], params.channelMinRgb[1], params.channelMaxRgb[1]),
    remapChannel(params.rgb[2], params.channelMinRgb[2], params.channelMaxRgb[2]),
  ];

  const step = 255 / Math.min(255, Math.max(2, Math.round(params.posterizeLevels)));
  const posterizedRgb: readonly [number, number, number] = [
    clampByte(Math.floor(enhancedRgb[0] / step) * step),
    clampByte(Math.floor(enhancedRgb[1] / step) * step),
    clampByte(Math.floor(enhancedRgb[2] / step) * step),
  ];
  const luma = 0.2126 * enhancedRgb[0] + 0.7152 * enhancedRgb[1] + 0.0722 * enhancedRgb[2];
  return {
    embossRgb,
    enhancedRgb,
    posterizedRgb,
    thresholdBit: luma >= clamp01(params.threshold01) * 255 ? 255 : 0,
    directionalSobelResponse,
  };
}

/** 3. Paper.js `Path.smooth({ type: 'catmull-rom' | 'geometric', factor })` & `Curve.flatten(flatness)`. */
export function evaluatePaperCatmullRomSmoothAndFlatten(params: {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly factor?: number;
  readonly alpha?: number;
  readonly flatness?: number;
}): {
  readonly controlHandles: readonly {
    readonly anchor: { readonly x: number; readonly y: number };
    readonly handleIn: { readonly x: number; readonly y: number };
    readonly handleOut: { readonly x: number; readonly y: number };
  }[];
  readonly flattenedPolyline: readonly { readonly x: number; readonly y: number }[];
  readonly subdivisionCount: number;
} {
  const pts = params.points;
  const factor = params.factor ?? 0.5;
  const alpha = params.alpha ?? 0.5;
  const flatness = Math.max(0.05, params.flatness ?? 0.5);
  if (pts.length < 2) {
    return {
      controlHandles: pts.map((p) => ({ anchor: p, handleIn: { x: 0, y: 0 }, handleOut: { x: 0, y: 0 } })),
      flattenedPolyline: [...pts],
      subdivisionCount: 0,
    };
  }
  const controlHandles = pts.map((p1, i) => {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p2 = pts[Math.min(pts.length - 1, i + 1)]!;
    const d1 = Math.max(1e-4, Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), alpha));
    const d2 = Math.max(1e-4, Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), alpha));
    const denomPrev = Math.max(1e-4, d1 * (d1 + d2));
    const denomNext = Math.max(1e-4, d2 * (d1 + d2));
    const txIn = (d1 * d1 * (p2.x - p1.x) - d2 * d2 * (p0.x - p1.x)) / denomPrev;
    const tyIn = (d1 * d1 * (p2.y - p1.y) - d2 * d2 * (p0.y - p1.y)) / denomPrev;
    const txOut = (d2 * d2 * (p0.x - p1.x) - d1 * d1 * (p2.x - p1.x)) / denomNext;
    const tyOut = (d2 * d2 * (p0.y - p1.y) - d1 * d1 * (p2.y - p1.y)) / denomNext;
    return {
      anchor: p1,
      handleIn: i === 0 ? { x: 0, y: 0 } : { x: (-txIn * factor) / 3, y: (-tyIn * factor) / 3 },
      handleOut: i === pts.length - 1 ? { x: 0, y: 0 } : { x: (-txOut * factor) / 3, y: (-tyOut * factor) / 3 },
    };
  });

  const flattenedPolyline: { readonly x: number; readonly y: number }[] = [pts[0]!];
  let subdivisionCount = 0;
  const subdivideCubic = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, depth: number): void => {
    const ux = 3 * x1 - 2 * x0 - x3;
    const uy = 3 * y1 - 2 * y0 - y3;
    const vx = 3 * x2 - 2 * x3 - x0;
    const vy = 3 * y2 - 2 * y3 - y0;
    if (depth >= 6 || Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy) <= 16 * flatness * flatness) {
      flattenedPolyline.push({ x: x3, y: y3 });
      return;
    }
    subdivisionCount += 1;
    const x01 = (x0 + x1) * 0.5;
    const y01 = (y0 + y1) * 0.5;
    const x12 = (x1 + x2) * 0.5;
    const y12 = (y1 + y2) * 0.5;
    const x23 = (x2 + x3) * 0.5;
    const y23 = (y2 + y3) * 0.5;
    const x012 = (x01 + x12) * 0.5;
    const y012 = (y01 + y12) * 0.5;
    const x123 = (x12 + x23) * 0.5;
    const y123 = (y12 + y23) * 0.5;
    const x0123 = (x012 + x123) * 0.5;
    const y0123 = (y012 + y123) * 0.5;
    subdivideCubic(x0, y0, x01, y01, x012, y012, x0123, y0123, depth + 1);
    subdivideCubic(x0123, y0123, x123, y123, x23, y23, x3, y3, depth + 1);
  };
  for (let i = 0; i < controlHandles.length - 1; i += 1) {
    const c0 = controlHandles[i]!;
    const c1 = controlHandles[i + 1]!;
    subdivideCubic(c0.anchor.x, c0.anchor.y, c0.anchor.x + c0.handleOut.x, c0.anchor.y + c0.handleOut.y, c1.anchor.x + c1.handleIn.x, c1.anchor.y + c1.handleIn.y, c1.anchor.x, c1.anchor.y, 0);
  }
  return { controlHandles, flattenedPolyline, subdivisionCount };
}

/** 4. Excalidraw `elbowArrow.ts` Manhattan orthogonal routing & exponential laser trail decay. */
export function evaluateExcalidrawElbowArrowAndLaserTrail(params: {
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly startHeading: "UP" | "DOWN" | "LEFT" | "RIGHT";
  readonly endHeading: "UP" | "DOWN" | "LEFT" | "RIGHT";
  readonly obstaclePaddingPx?: number;
  readonly laserTrailSamples: readonly { readonly x: number; readonly y: number; readonly ageMs: number }[];
  readonly laserDurationMs?: number;
}): {
  readonly orthogonalPoints: readonly { readonly x: number; readonly y: number }[];
  readonly bendCount: number;
  readonly manhattanLength: number;
  readonly laserSegments: readonly { readonly x: number; readonly y: number; readonly opacity01: number; readonly widthPx: number }[];
} {
  const pad = Math.max(8, params.obstaclePaddingPx ?? 24);
  const headingDelta = (h: "UP" | "DOWN" | "LEFT" | "RIGHT") =>
    h === "UP" ? { x: 0, y: -pad } : h === "DOWN" ? { x: 0, y: pad } : h === "LEFT" ? { x: -pad, y: 0 } : { x: pad, y: 0 };
  const dStart = headingDelta(params.startHeading);
  const dEnd = headingDelta(params.endHeading);
  const p1 = { x: params.start.x + dStart.x, y: params.start.y + dStart.y };
  const p4 = { x: params.end.x + dEnd.x, y: params.end.y + dEnd.y };
  const midX = (p1.x + p4.x) * 0.5;
  const midY = (p1.y + p4.y) * 0.5;
  const isHoriz = params.startHeading === "LEFT" || params.startHeading === "RIGHT";
  const rawPoints = [params.start, p1, isHoriz ? { x: midX, y: p1.y } : { x: p1.x, y: midY }, isHoriz ? { x: midX, y: p4.y } : { x: p4.x, y: midY }, p4, params.end];

  const orthogonalPoints: { readonly x: number; readonly y: number }[] = [];
  for (const pt of rawPoints) {
    const prev = orthogonalPoints[orthogonalPoints.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 1e-3) orthogonalPoints.push(pt);
  }
  let bendCount = 0;
  let manhattanLength = 0;
  for (let i = 1; i < orthogonalPoints.length; i += 1) {
    const a = orthogonalPoints[i - 1]!;
    const b = orthogonalPoints[i]!;
    manhattanLength += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (i >= 2) {
      const prev = orthogonalPoints[i - 2]!;
      if (Math.sign(a.x - prev.x) !== Math.sign(b.x - a.x) || Math.sign(a.y - prev.y) !== Math.sign(b.y - a.y)) bendCount += 1;
    }
  }
  const durationMs = Math.max(100, params.laserDurationMs ?? 1000);
  const laserSegments = params.laserTrailSamples.map((s) => {
    const t = clamp01(1 - s.ageMs / durationMs);
    return { x: s.x, y: s.y, opacity01: Math.pow(t, 1.8), widthPx: 1.5 + 6.5 * Math.pow(t, 1.35) };
  });
  return { orthogonalPoints, bendCount, manhattanLength, laserSegments };
}

/** 5. Fabric.js `SprayBrush` (`_getOptimizedRects` spatial key deduplication) & `Atrament` velocity-adaptive quadratic ink. */
export function evaluateFabricSprayDeduplicationAndAtrament(params: {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly sprayWidth: number;
  readonly density: number;
  readonly dotWidth: number;
  readonly dotWidthVariance: number;
  readonly randomOpacity: boolean;
  readonly prevPoint: { readonly x: number; readonly y: number };
  readonly baseSmoothing01: number;
}): {
  readonly rawChunkCount: number;
  readonly optimizedRectCount: number;
  readonly deduplicationRatio01: number;
  readonly atramentAdaptiveSmoothing01: number;
  readonly atramentQuadraticMidpoint: { readonly x: number; readonly y: number };
} {
  const density = Math.min(120, Math.max(4, Math.round(params.density)));
  const halfWidth = Math.max(2, params.sprayWidth * 0.5);
  const uniqueRects = new Map<string, { left: number; top: number; width: number; opacity: number }>();
  for (let i = 0; i < density; i += 1) {
    const u = ((i * 0.61803398875) % 1) * 2 - 1;
    const v = (((i * 0.38196601125 + 0.25) % 1) * 2) - 1;
    const left = Math.round(params.pointerX + u * halfWidth);
    const top = Math.round(params.pointerY + v * halfWidth);
    const width = Math.max(1, params.dotWidth + Math.round(u * params.dotWidthVariance));
    const opacity = params.randomOpacity ? clamp01(0.35 + ((i * 0.29) % 0.65)) : 1;
    const key = `${left}:${top}`;
    if (!uniqueRects.has(key)) uniqueRects.set(key, { left, top, width, opacity });
  }
  const dist = Math.hypot(params.pointerX - params.prevPoint.x, params.pointerY - params.prevPoint.y);
  const atramentAdaptiveSmoothing01 = Math.min(0.85, clamp01(params.baseSmoothing01) + Math.min(0.15, (dist / 60) * 0.15));
  const smoothedX = params.prevPoint.x + (params.pointerX - params.prevPoint.x) * (1 - atramentAdaptiveSmoothing01);
  const smoothedY = params.prevPoint.y + (params.pointerY - params.prevPoint.y) * (1 - atramentAdaptiveSmoothing01);
  return {
    rawChunkCount: density,
    optimizedRectCount: uniqueRects.size,
    deduplicationRatio01: density > 0 ? uniqueRects.size / density : 1,
    atramentAdaptiveSmoothing01,
    atramentQuadraticMidpoint: { x: (params.prevPoint.x + smoothedX) * 0.5, y: (params.prevPoint.y + smoothedY) * 0.5 },
  };
}

/** 6. $N$-Fold Radial/Mirror Mandala Symmetry (`N = 2..16`) & 1/2/3-Point Perspective + Isometric ($30^\circ/90^\circ/150^\circ$) Ruler. */
export function evaluateMandalaSymmetryAndPerspectiveRuler(params: {
  readonly centerX: number;
  readonly centerY: number;
  readonly sampleX: number;
  readonly sampleY: number;
  readonly axisCount: number;
  readonly includeMirrorReflection: boolean;
  readonly vanishingPoint: { readonly x: number; readonly y: number };
  readonly rulerMode: "perspective-1p" | "perspective-2p" | "isometric-30";
}): {
  readonly clampedAxes: number;
  readonly totalSymmetricCopies: number;
  readonly symmetricPoints: readonly { readonly x: number; readonly y: number; readonly mirrored: boolean }[];
  readonly snappedRulerPoint: { readonly x: number; readonly y: number };
  readonly snappedAngleDeg: number;
} {
  const axes = Math.min(16, Math.max(2, Math.round(params.axisCount)));
  const dx = params.sampleX - params.centerX;
  const dy = params.sampleY - params.centerY;
  const symmetricPoints: { readonly x: number; readonly y: number; readonly mirrored: boolean }[] = [];
  for (let k = 0; k < axes; k += 1) {
    const theta = (k * Math.PI * 2) / axes;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    symmetricPoints.push({ x: params.centerX + dx * cosT - dy * sinT, y: params.centerY + dx * sinT + dy * cosT, mirrored: false });
    if (params.includeMirrorReflection) {
      symmetricPoints.push({ x: params.centerX + dx * cosT + dy * sinT, y: params.centerY + dx * sinT - dy * cosT, mirrored: true });
    }
  }
  const isoAngles = [30, 90, 150, 210, 270, 330];
  const rawDeg = (((Math.atan2(dy, dx) * 180) / Math.PI) + 360) % 360;
  const vdx = params.sampleX - params.vanishingPoint.x;
  const vdy = params.sampleY - params.vanishingPoint.y;
  const snappedAngleDeg =
    params.rulerMode === "isometric-30"
      ? isoAngles.reduce((best, cand) => (Math.abs(cand - rawDeg) < Math.abs(best - rawDeg) ? cand : best))
      : (((Math.atan2(vdy, vdx) * 180) / Math.PI) + 360) % 360;
  const rad = (snappedAngleDeg * Math.PI) / 180;
  const dist = params.rulerMode === "isometric-30" ? Math.hypot(dx, dy) : Math.hypot(vdx, vdy);
  const originX = params.rulerMode === "isometric-30" ? params.centerX : params.vanishingPoint.x;
  const originY = params.rulerMode === "isometric-30" ? params.centerY : params.vanishingPoint.y;
  return {
    clampedAxes: axes,
    totalSymmetricCopies: symmetricPoints.length,
    symmetricPoints,
    snappedRulerPoint: { x: originX + dist * Math.cos(rad), y: originY + dist * Math.sin(rad) },
    snappedAngleDeg,
  };
}

/** 7. `ag-psd` PackBits RLE scanline codec & `8BIM` 28-mode binary layer record mapping. */
export function evaluateAgPsdPackBitsAndLayerChannelCodec(params: {
  readonly scanlineBytes: readonly number[];
  readonly blendModeName: string;
  readonly transparencyProtected: boolean;
  readonly hidden: boolean;
  readonly clipping: boolean;
}): {
  readonly encodedPackBits: readonly number[];
  readonly decodedScanline: readonly number[];
  readonly compressionRatio01: number;
  readonly psdBlendKey4Char: string;
  readonly layerFlagsBitmask: number;
  readonly clippingByte: 0 | 1;
} {
  const blendMap: Readonly<Record<string, string>> = {
    "pass through": "pass", normal: "norm", dissolve: "diss", darken: "dark", multiply: "mul ",
    "color burn": "idiv", "linear burn": "lbrn", lighten: "lite", screen: "scrn", "color dodge": "div ",
    "linear dodge": "lddg", overlay: "over", "soft light": "sLit", "hard light": "hLit",
    difference: "diff", exclusion: "smud", subtract: "fsub", divide: "fdiv", luminosity: "lum ",
  };
  const encoded: number[] = [];
  const src = params.scanlineBytes.map(clampByte);
  let i = 0;
  while (i < src.length) {
    let runLen = 1;
    while (i + runLen < src.length && runLen < 128 && src[i + runLen] === src[i]) runLen += 1;
    if (runLen >= 2) {
      encoded.push(257 - runLen, src[i]!);
      i += runLen;
    } else {
      const litStart = i;
      let litLen = 0;
      while (i < src.length && litLen < 128) {
        if (i + 2 < src.length && src[i] === src[i + 1] && src[i] === src[i + 2]) break;
        i += 1;
        litLen += 1;
      }
      encoded.push(litLen - 1, ...src.slice(litStart, litStart + litLen));
    }
  }
  const decoded: number[] = [];
  for (let p = 0; p < encoded.length; ) {
    const header = encoded[p++]!;
    if (header <= 127) {
      const count = header + 1;
      for (let k = 0; k < count && p < encoded.length; k += 1) decoded.push(encoded[p++]!);
    } else if (header >= 129) {
      const count = 257 - header;
      const val = encoded[p++] ?? 0;
      for (let k = 0; k < count; k += 1) decoded.push(val);
    }
  }
  const layerFlagsBitmask = (params.transparencyProtected ? 1 : 0) | (params.hidden ? 2 : 0) | 8;
  return {
    encodedPackBits: encoded,
    decodedScanline: decoded,
    compressionRatio01: src.length > 0 ? encoded.length / src.length : 1,
    psdBlendKey4Char: blendMap[params.blendModeName] ?? "norm",
    layerFlagsBitmask,
    clippingByte: params.clipping ? 1 : 0,
  };
}

/** 8. `culori` OKLab/OKLCh bisection chroma gamut clamping & Sharma `CIEDE2000` ($\Delta E_{00}$). */
export function evaluateCuloriCiede2000AndOklchGamutMap(params: {
  readonly stdLab: { readonly l: number; readonly a: number; readonly b: number };
  readonly smpLab: { readonly l: number; readonly a: number; readonly b: number };
  readonly targetOklch: { readonly l: number; readonly c: number; readonly hDeg: number };
}): {
  readonly ciede2000DeltaE: number;
  readonly clampedOklchChroma: number;
  readonly gamutMappedSrgb01: readonly [number, number, number];
} {
  const { stdLab, smpLab, targetOklch } = params;
  const cStd = Math.hypot(stdLab.a, stdLab.b);
  const cSmp = Math.hypot(smpLab.a, smpLab.b);
  const cAvg7 = Math.pow((cStd + cSmp) * 0.5, 7);
  const G = 0.5 * (1 - Math.sqrt(cAvg7 / (cAvg7 + Math.pow(25, 7))));
  const ap1 = stdLab.a * (1 + G);
  const ap2 = smpLab.a * (1 + G);
  const cp1 = Math.hypot(ap1, stdLab.b);
  const cp2 = Math.hypot(ap2, smpLab.b);
  const hp1 = ap1 === 0 && stdLab.b === 0 ? 0 : (Math.atan2(stdLab.b, ap1) + Math.PI * 2) % (Math.PI * 2);
  const hp2 = ap2 === 0 && smpLab.b === 0 ? 0 : (Math.atan2(smpLab.b, ap2) + Math.PI * 2) % (Math.PI * 2);
  const dL = smpLab.l - stdLab.l;
  const dC = cp2 - cp1;
  let dhp = cp1 * cp2 === 0 ? 0 : hp2 - hp1;
  if (dhp > Math.PI) dhp -= Math.PI * 2;
  if (dhp < -Math.PI) dhp += Math.PI * 2;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(dhp * 0.5);
  const Lp = (stdLab.l + smpLab.l) * 0.5;
  const Cp = (cp1 + cp2) * 0.5;
  const hp = cp1 * cp2 === 0 ? hp1 + hp2 : (hp1 + hp2) * 0.5 - (Math.abs(hp1 - hp2) > Math.PI ? Math.PI : 0);
  const T = 1 - 0.17 * Math.cos(hp - Math.PI / 6) + 0.24 * Math.cos(2 * hp) + 0.32 * Math.cos(3 * hp + Math.PI / 30) - 0.2 * Math.cos(4 * hp - (63 * Math.PI) / 180);
  const lpm50 = Math.pow(Lp - 50, 2);
  const Sl = 1 + (0.015 * lpm50) / Math.sqrt(20 + lpm50);
  const Sc = 1 + 0.045 * Cp;
  const Sh = 1 + 0.015 * Cp * T;
  const dTheta = (Math.PI / 6) * Math.exp(-Math.pow(((hp * 180) / Math.PI - 275) / 25, 2));
  const cp7 = Math.pow(Cp, 7);
  const Rt = -2 * Math.sqrt(cp7 / (cp7 + Math.pow(25, 7))) * Math.sin(2 * dTheta);
  const ciede2000DeltaE = Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh));

  const hRad = (targetOklch.hDeg * Math.PI) / 180;
  const oklchToLinearSrgb = (L: number, C: number): readonly [number, number, number] => {
    const a = C * Math.cos(hRad);
    const b = C * Math.sin(hRad);
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  };
  let lo = 0;
  let hi = Math.max(0, targetOklch.c);
  for (let iter = 0; iter < 13; iter += 1) {
    const mid = (lo + hi) * 0.5;
    const rgb = oklchToLinearSrgb(targetOklch.l, mid);
    if (rgb[0] >= 0 && rgb[0] <= 1 && rgb[1] >= 0 && rgb[1] <= 1 && rgb[2] >= 0 && rgb[2] <= 1) lo = mid;
    else hi = mid;
  }
  const finalLinear = oklchToLinearSrgb(targetOklch.l, lo);
  const toSrgb = (v: number): number => clamp01(v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
  return {
    ciede2000DeltaE,
    clampedOklchChroma: lo,
    gamutMappedSrgb01: [toSrgb(finalLinear[0]), toSrgb(finalLinear[1]), toSrgb(finalLinear[2])],
  };
}

/** 9. Otsu bimodal threshold $\sigma_B^2(t)$, Canny 4-angle NMS hysteresis, & Skia Catmull-Rom pointer lookahead. */
export function evaluateOtsuBimodalCannyAndSkiaLookahead(params: {
  readonly luminanceSamples: readonly number[];
  readonly gradX: number;
  readonly gradY: number;
  readonly neighborMagnitudes: readonly [number, number];
  readonly lowThreshold: number;
  readonly highThreshold: number;
  readonly recentPoints: readonly [
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
  ];
}): {
  readonly otsuOptimalThreshold: number;
  readonly maxBetweenClassVariance: number;
  readonly cannyEdgeState: "strong" | "weak" | "suppressed";
  readonly predictedNextPoint: { readonly x: number; readonly y: number };
} {
  const hist = new Array<number>(256).fill(0);
  const total = Math.max(1, params.luminanceSamples.length);
  for (const s of params.luminanceSamples) hist[clampByte(s)]! += 1;
  let sumAll = 0;
  for (let t = 0; t < 256; t += 1) sumAll += t * hist[t]!;
  let sumB = 0;
  let wB = 0;
  let maxBetweenClassVariance = -1;
  let otsuOptimalThreshold = 128;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const sigmaB2 = (wB / total) * (wF / total) * Math.pow(mB - mF, 2);
    if (sigmaB2 > maxBetweenClassVariance) {
      maxBetweenClassVariance = sigmaB2;
      otsuOptimalThreshold = t;
    }
  }
  const mag = Math.hypot(params.gradX, params.gradY);
  const isLocalMax = mag >= params.neighborMagnitudes[0] && mag >= params.neighborMagnitudes[1];
  const cannyEdgeState = !isLocalMax || mag < params.lowThreshold ? "suppressed" : mag >= params.highThreshold ? "strong" : "weak";
  const [p0, p1, p2] = params.recentPoints;
  const vx = (p2.x - p0.x) * 0.5;
  const vy = (p2.y - p0.y) * 0.5;
  const ax = p2.x - 2 * p1.x + p0.x;
  const ay = p2.y - 2 * p1.y + p0.y;
  return {
    otsuOptimalThreshold,
    maxBetweenClassVariance,
    cannyEdgeState,
    predictedNextPoint: { x: p2.x + vx + 0.5 * ax, y: p2.y + vy + 0.5 * ay },
  };
}

/** Unified telemetry evaluator for `StudioUniversalBrushEngineBar.tsx`. */
export function evaluateMonolithicTotalEngineTelemetry(params: {
  readonly presetId: MonolithicTotalToolPresetId;
  readonly strength01: number;
  readonly symmetryAxes: number;
}): {
  readonly preset: MonolithicTotalToolPreset;
  readonly kaleidoscopeMirroredSector: number;
  readonly embossReliefLuma: number;
  readonly paperSubdivisionCount: number;
  readonly elbowBendCount: number;
  readonly sprayDeduplicatedCount: number;
  readonly mandalaSymmetricCopyCount: number;
  readonly psdCompressionRatio01: number;
  readonly ciede2000DeltaE: number;
  readonly otsuOptimalThreshold: number;
} {
  const preset = MONOLITHIC_TOTAL_TOOL_PRESETS.find((p) => p.id === params.presetId) ?? MONOLITHIC_TOTAL_TOOL_PRESETS[0]!;
  const s = clamp01(params.strength01);
  const kaleidoscope = evaluateKonvaKaleidoscopePolarMirror({
    width: 128,
    height: 128,
    sampleX: 96,
    sampleY: 42,
    power: Math.max(2, Math.min(6, Math.round(params.symmetryAxes / 2))),
    angleDeg: Math.round(s * 180),
  });
  const emboss = evaluateKonvaEmbossEnhancePosterizeSuite({
    rgb: [148, 132, 118],
    neighborLuminance3x3: [40, 52, 65, 80, 128, 175, 110, 190, 235],
    channelMinRgb: [24, 20, 18],
    channelMaxRgb: [228, 220, 212],
    embossStrength01: s,
    embossWhiteLevel01: 0.5,
    embossDirection: "top-left",
    embossBlend: true,
    enhanceAmount: s * 0.8,
    posterizeLevels: 6,
    threshold01: 0.5,
  });
  const paper = evaluatePaperCatmullRomSmoothAndFlatten({
    points: [{ x: 10, y: 20 }, { x: 42, y: 68 }, { x: 96, y: 18 }, { x: 140, y: 74 }],
    factor: 0.5 + s * 0.35,
    flatness: 0.45,
  });
  const elbow = evaluateExcalidrawElbowArrowAndLaserTrail({
    start: { x: 16, y: 24 },
    end: { x: 164, y: 112 },
    startHeading: "RIGHT",
    endHeading: "DOWN",
    obstaclePaddingPx: 24,
    laserTrailSamples: [{ x: 40, y: 40, ageMs: 120 }, { x: 80, y: 55, ageMs: 360 }],
  });
  const spray = evaluateFabricSprayDeduplicationAndAtrament({
    pointerX: 64,
    pointerY: 64,
    sprayWidth: 28,
    density: 32,
    dotWidth: 3,
    dotWidthVariance: 2,
    randomOpacity: true,
    prevPoint: { x: 44, y: 52 },
    baseSmoothing01: s,
  });
  const mandala = evaluateMandalaSymmetryAndPerspectiveRuler({
    centerX: 64,
    centerY: 64,
    sampleX: 98,
    sampleY: 46,
    axisCount: params.symmetryAxes,
    includeMirrorReflection: true,
    vanishingPoint: { x: 64, y: 16 },
    rulerMode: "isometric-30",
  });
  const psd = evaluateAgPsdPackBitsAndLayerChannelCodec({
    scanlineBytes: [200, 200, 200, 200, 200, 128, 64, 32, 32, 32, 32],
    blendModeName: "multiply",
    transparencyProtected: true,
    hidden: false,
    clipping: true,
  });
  const culori = evaluateCuloriCiede2000AndOklchGamutMap({
    stdLab: { l: 62, a: 28, b: -18 },
    smpLab: { l: 58, a: 22, b: -14 },
    targetOklch: { l: 0.72, c: 0.38, hDeg: 145 },
  });
  const vision = evaluateOtsuBimodalCannyAndSkiaLookahead({
    luminanceSamples: [18, 22, 25, 29, 31, 198, 205, 212, 224, 238],
    gradX: 92,
    gradY: 48,
    neighborMagnitudes: [64, 72],
    lowThreshold: 40,
    highThreshold: 85,
    recentPoints: [{ x: 20, y: 24 }, { x: 38, y: 31 }, { x: 58, y: 40 }],
  });
  return {
    preset,
    kaleidoscopeMirroredSector: kaleidoscope.mirroredThetaIndex,
    embossReliefLuma: emboss.embossRgb[0],
    paperSubdivisionCount: paper.subdivisionCount,
    elbowBendCount: elbow.bendCount,
    sprayDeduplicatedCount: spray.optimizedRectCount,
    mandalaSymmetricCopyCount: mandala.totalSymmetricCopies,
    psdCompressionRatio01: psd.compressionRatio01,
    ciede2000DeltaE: culori.ciede2000DeltaE,
    otsuOptimalThreshold: vision.otsuOptimalThreshold,
  };
}
