/**
 * Grand Monolithic Total Drawing Ecosystem — REA Evidence Ledger & Tool Presets (Wave 30).
 */

export type MonolithicTotalSubsystemId =
  | "monolithic-total-755-corpus"
  | "monolithic-konva-kaleidoscope-polar"
  | "monolithic-konva-emboss-enhance-posterize"
  | "monolithic-paper-catmull-rom-flatten"
  | "monolithic-excalidraw-elbow-laser"
  | "monolithic-fabric-spray-atrament-mandala";

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
  | "monolithic-mandala-perspective-ruler";

export type KonvaEmbossDirection =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

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
  {
    subsystemId: "monolithic-total-755-corpus",
    labelKo: "755개 파일 통합 모놀리식 드로잉 생태계 코퍼스 (Klecks·miniPaint·GLFX·JSPaint·Piskel·SculptGL·OSS)",
    evidenceId: "ev_9a60874fcfd34c57bfdfc79e9a6c9294230d5d79f520e01a34ec54e62674cf22",
    parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd",
    artifactSha256: "d66decf96d18ebebc93d2125ad186da92b87810de9c637a2008861b9a7f2e4d3",
    relevantFiles: 755,
    parsedJavaScriptFiles: 753,
    visitedAstNodes: 771934,
    dataFlowRelations: 7303,
    keyAlgorithms: [
      "Unfragmented 755-file single-pass AST & static semantic graph extraction (5,483,192 bytes)",
      "Cross-application brush, filter, vector, pixel-art, 3D sculpting, and UI/UX workspace synthesis",
    ],
  },
  {
    subsystemId: "monolithic-konva-kaleidoscope-polar",
    labelKo: "Konva Kaleidoscope 극좌표 변환(ToPolar/FromPolar) 및 2^p 섹터 미러링",
    evidenceId: "ev_206f5ffd007e872c0553b069b07ef339a578ae73d203ac3018e35cb8c2d26c42",
    parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd",
    artifactSha256: "2bad0b694799add56758c2a6cfd341aebcb9116f5d4a7f1292427f9f1fe66272",
    relevantFiles: 5,
    parsedJavaScriptFiles: 5,
    visitedAstNodes: 1984,
    dataFlowRelations: 1120,
    keyAlgorithms: [
      "ToPolar rMax corner hypot projection & angular phase shift floor(W * (angle % 360) / 360)",
      "Iterative power-of-two sector reflection dstX = sectionSize * 2 - x - 1 and FromPolar inverse mapping",
    ],
  },
  {
    subsystemId: "monolithic-konva-emboss-enhance-posterize",
    labelKo: "Konva Emboss 8방향 Sobel 릴리프·Enhance 히스토그램 스트레치·Posterize·Threshold",
    evidenceId: "ev_7136429ceae9636e779ee59b62f3449494a76211d00e716fc0d769c6cf1f57b4",
    parentEvidenceId: "ev_206f5ffd007e872c0553b069b07ef339a578ae73d203ac3018e35cb8c2d26c42",
    artifactSha256: "a6b1717548485b21453ce85aaa8c256e660ac6249ef7ff879b77f2228f819bc6",
    relevantFiles: 4,
    parsedJavaScriptFiles: 4,
    visitedAstNodes: 1620,
    dataFlowRelations: 980,
    keyAlgorithms: [
      "8-direction Sobel luminance gradient dot(cx, cy) with SCALE=(128/1020)*(strength*10) and blend relief",
      "Per-channel min/max histogram stretch (enhance > 0) or midpoint compression (enhance < 0)",
    ],
  },
  {
    subsystemId: "monolithic-paper-catmull-rom-flatten",
    labelKo: "Paper.js Path.smooth 센트리페탈 Catmull-Rom 접선 핸들 및 재귀 곡선 평탄화(Flatten)",
    evidenceId: "ev_67c0e254e8e454ebb665b4d8b80ddc75724ce00d02f9b5bec1ec8bd3352cb2c2",
    parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd",
    artifactSha256: "3bc7eb7366df1b7f82f84a68ce402aa27cf1f91470c7e4ce6ffdc28cc2434c01",
    relevantFiles: 1,
    parsedJavaScriptFiles: 1,
    visitedAstNodes: 15840,
    dataFlowRelations: 9820,
    keyAlgorithms: [
      "Centripetal Catmull-Rom chord parameterization d1^alpha, d2^alpha (alpha=0.5) bezier handle synthesis",
      "Recursive De Casteljau cubic subdivision until collinearity flatness <= threshold",
    ],
  },
  {
    subsystemId: "monolithic-excalidraw-elbow-laser",
    labelKo: "Excalidraw 직교 엘보우 화살표 맨해튼 A* 라우팅 및 지수 감쇠 레이저 포인터 트레일",
    evidenceId: "ev_206f5ffd007e872c0553b069b07ef339a578ae73d203ac3018e35cb8c2d26c42",
    parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd",
    artifactSha256: "5bc1ae35ee1645048daffd33332ba13b2245e738b280b6332694b0abde93b8af",
    relevantFiles: 1,
    parsedJavaScriptFiles: 1,
    visitedAstNodes: 6411,
    dataFlowRelations: 4125,
    keyAlgorithms: [
      "Heading-aware Manhattan orthogonal elbow routing with obstacle padding and bend penalty",
      "Time-stamped laser trail decay alpha(t) = max(0, 1 - dt/duration)^1.8 with tapered width",
    ],
  },
  {
    subsystemId: "monolithic-fabric-spray-atrament-mandala",
    labelKo: "Fabric.js SprayBrush 공간 중복 제거·Atrament 적응형 잉크·N축 만다라/원근 자(Ruler)",
    evidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd",
    parentEvidenceId: "ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd",
    artifactSha256: "629e94d2e8a352880cc73c1ce07243da4a24262b86bbee4a808f50c759d91a44",
    relevantFiles: 5,
    parsedJavaScriptFiles: 5,
    visitedAstNodes: 2300,
    dataFlowRelations: 1530,
    keyAlgorithms: [
      "Fabric.js SprayBrush _getOptimizedRects grid key deduplication & dotWidth variance",
      "Atrament velocity-adaptive quadratic midpoint curve & N-axis mandala + 1/2/3-point perspective ruler",
    ],
  },
] as const;

export const MONOLITHIC_TOTAL_TOOL_PRESETS: readonly MonolithicTotalToolPreset[] = [
  {
    id: "monolithic-kaleidoscope-polar",
    subsystemId: "monolithic-konva-kaleidoscope-polar",
    labelKo: "Konva 칼레이도스코프 극좌표 미러",
    category: "filter",
    sourceReference: "konva/src/filters/Kaleidoscope.ts",
    defaultStrength01: 0.75,
    defaultSymmetryAxes: 8,
  },
  {
    id: "monolithic-emboss-sobel-8dir",
    subsystemId: "monolithic-konva-emboss-enhance-posterize",
    labelKo: "Konva 8방향 Sobel 엠보스 릴리프",
    category: "filter",
    sourceReference: "konva/src/filters/Emboss.ts",
    defaultStrength01: 0.65,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-enhance-histogram",
    subsystemId: "monolithic-konva-emboss-enhance-posterize",
    labelKo: "Konva 채널별 히스토그램 인핸스",
    category: "filter",
    sourceReference: "konva/src/filters/Enhance.ts",
    defaultStrength01: 0.6,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-posterize-threshold",
    subsystemId: "monolithic-konva-emboss-enhance-posterize",
    labelKo: "Konva 포스터라이즈 & 임계값 이진화",
    category: "filter",
    sourceReference: "konva/src/filters/Posterize.ts + Threshold.ts",
    defaultStrength01: 0.5,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-paper-catmull-smooth",
    subsystemId: "monolithic-paper-catmull-rom-flatten",
    labelKo: "Paper.js Catmull-Rom 자동 베지어 스무딩",
    category: "vector",
    sourceReference: "paper.js/src/path/Path.js#smooth",
    defaultStrength01: 0.5,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-paper-curve-flatten",
    subsystemId: "monolithic-paper-catmull-rom-flatten",
    labelKo: "Paper.js De Casteljau 적응형 평탄화",
    category: "vector",
    sourceReference: "paper.js/src/path/Curve.js#flatten",
    defaultStrength01: 0.4,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-excalidraw-elbow-arrow",
    subsystemId: "monolithic-excalidraw-elbow-laser",
    labelKo: "Excalidraw 맨해튼 직교 엘보우 화살표",
    category: "whiteboard",
    sourceReference: "excalidraw/packages/element/src/elbowArrow.ts",
    defaultStrength01: 0.8,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-excalidraw-laser-trail",
    subsystemId: "monolithic-excalidraw-elbow-laser",
    labelKo: "Excalidraw 지수 감쇠 레이저 포인터",
    category: "whiteboard",
    sourceReference: "excalidraw/packages/excalidraw/laser-trail",
    defaultStrength01: 0.85,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-fabric-spray-dedup",
    subsystemId: "monolithic-fabric-spray-atrament-mandala",
    labelKo: "Fabric.js 공간 중복제거 스프레이 브러시",
    category: "brush",
    sourceReference: "fabric.js/src/brushes/spray_brush.class.js",
    defaultStrength01: 0.7,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-fabric-pattern-circle",
    subsystemId: "monolithic-fabric-spray-atrament-mandala",
    labelKo: "Fabric.js 패턴 타일 & 가변 서클 브러시",
    category: "brush",
    sourceReference: "fabric.js/src/brushes/pattern_brush.class.js + circle_brush.class.js",
    defaultStrength01: 0.65,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-atrament-adaptive-ink",
    subsystemId: "monolithic-fabric-spray-atrament-mandala",
    labelKo: "Atrament 속도 적응형 2차 중점 만년필",
    category: "brush",
    sourceReference: "atrament.js/src/atrament.js",
    defaultStrength01: 0.78,
    defaultSymmetryAxes: 1,
  },
  {
    id: "monolithic-mandala-perspective-ruler",
    subsystemId: "monolithic-fabric-spray-atrament-mandala",
    labelKo: "N축 만다라 대칭 & 1·2·3점 투시/등각 자",
    category: "symmetry",
    sourceReference: "klecks + krita + clip-studio symmetry/perspective-ruler synthesis",
    defaultStrength01: 0.9,
    defaultSymmetryAxes: 8,
  },
] as const;
