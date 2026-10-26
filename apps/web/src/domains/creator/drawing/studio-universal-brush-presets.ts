/**
 * ToonStudio 범용 브러시·드로잉 생태계 프리셋 카탈로그 및 REA 증거 원장 (Wave 21).
 */

export interface UniversalBrushReaEvidenceEntry {
  readonly targetId: string;
  readonly targetName: string;
  readonly category: "github-oss" | "web-drawing-app" | "commercial-painting-app";
  readonly captureEvidenceId?: string;
  readonly exportEvidenceId?: string;
  readonly astEvidenceId: string;
  readonly parentAstEvidenceId: string;
  readonly artifactSha256: string;
  readonly visitedAstNodes: number;
  readonly parsedJavaScriptFiles: number;
  readonly internalizedBrushCount: number;
  readonly summaryKo: string;
}

/**
 * 2026-10-26 REA 실측 역공학 증거 원장 (Evidence Ledger).
 */
export const UNIVERSAL_BRUSH_REA_EVIDENCE_LEDGER: readonly UniversalBrushReaEvidenceEntry[] = [
  {
    targetId: "oss-brush-sources",
    targetName: "GitHub OSS Brush Suite (Harmony 11 / p5.brush 11 / Rough / SignaturePad / Atrament / Drauu)",
    category: "github-oss",
    astEvidenceId: "ev_65fa507705d8e84f227eda0e5097e313ea7de54220f7fc174f116a98120e40b0",
    parentAstEvidenceId: "ev_5fede536bd56d48bc9ce7e2509cf9bb1252d07508d47c548b19c848b71870e79",
    artifactSha256: "1d782c41bc1d732428906f347480ad6c3497b9c406bc311509e1f0bef3a2f295",
    visitedAstNodes: 45055,
    parsedJavaScriptFiles: 16,
    internalizedBrushCount: 36,
    summaryKo:
      "mrdoob/harmony 11종 절차적 코드·털·웹 브러시, p5.brush 11종 프리셋·7종 벡터장·다각형 번짐·해칭, Rough.js 7종 채움, SignaturePad/Atrament/Drauu 커널",
  },
  {
    targetId: "sketchpad-web",
    targetName: "Sketchpad 5.1 Web Studio (sketch.io/sketchpad)",
    category: "web-drawing-app",
    captureEvidenceId: "ev_7e6688ce67d040e9ab482dd4ae3487efa6e1e762835db4092da91e94171422a6",
    exportEvidenceId: "ev_265c5085049b9eec690e8761517f7107a37e805cc25fbb0fa37b680df42314c1",
    astEvidenceId: "ev_6b3563eadf2d1858e5af86ff1cb2553192f776348d4fb439c57804f8028c9fd4",
    parentAstEvidenceId: "ev_22383efbcf1b7552d0bcb14a1f25b47cb33b21592272575a731aee9a8cce0dfe",
    artifactSha256: "0d4029137ef3f3beb8a06332f06b646485b156a9bd7954401b3a64f979e31eb0",
    visitedAstNodes: 10847,
    parsedJavaScriptFiles: 2,
    internalizedBrushCount: 18,
    summaryKo:
      "Mirror, Tile, Calligraphy, Crayon, Streamer, Fur, Sketchy, Web, Shaded, Chrome, Spirograph, Arrow, Pencil, Highlighter, Eraser, Stamp, Spraypaint, Rainbow 18종 브러시",
  },
  {
    targetId: "jspaint-pixel-studio",
    targetName: "JS Paint & Pixel Art Suite (jspaint.app / Pixilart / Aseprite)",
    category: "web-drawing-app",
    captureEvidenceId: "ev_6fd2d5a3e1fd6f6d9fc0210e17df9c4abd11fc0256201f00e0d7019f71397e68",
    exportEvidenceId: "ev_c2e6127c08c529c0db1d93e038ea2126dd3605fea7b6829f769bc1be2509d1cd",
    astEvidenceId: "ev_ccb57ca836a3d3f25ebe9464c91d72df7924325ccdbaaf4b7b646c0371cd62bc",
    parentAstEvidenceId: "ev_3ce3e1e2b7ab82d6db1dee8c87629431d78e3801bdc104ca5d0d6b719f8a6641",
    artifactSha256: "dcd0e1649a4cb38db9baf74c0c6ccb3859aaf70e348c9df1db1f5cd16246171b",
    visitedAstNodes: 102956,
    parsedJavaScriptFiles: 42,
    internalizedBrushCount: 16,
    summaryKo:
      "4형태×3크기 비트맵 브러시 마스크, 4-연결 조밀 브레젠험, 주기적 에어브러시 분사, Pixel-Perfect L-코너 제거, 4×4 Bayer 디더 브러시, Jumble 픽셀 셔플, 인덱스 셰이딩",
  },
  {
    targetId: "ibispaint-webtoon",
    targetName: "ibisPaint X Webtoon & QR Brush Ecosystem (ibispaint.com)",
    category: "commercial-painting-app",
    captureEvidenceId: "ev_a516d528a8f77e80ffe06ead86b37d29d8e637c261023ff8c88e3a9693440f93",
    exportEvidenceId: "ev_be3b394af4e52c95c9b50d02948605f0cfa48d5b83fcdaeb1132bb52d1417f9e",
    astEvidenceId: "ev_7caa80e493b3f8cd5ed8c330007d429541002fc4573b69fb50b9be2d80084629",
    parentAstEvidenceId: "ev_58a0d3eb23c5d369893fc5311ddd509139a0ea53fe53f8c8aa07e51700b89139",
    artifactSha256: "8e67ed1914d03dc3589232b48b1efd3b478a23031f8c193d4ce815ea466103ee",
    visitedAstNodes: 9176,
    parsedJavaScriptFiles: 9,
    internalizedBrushCount: 12,
    summaryKo:
      "딥펜(경질·연질·번짐), 사인펜, 디지털펜, 사다리꼴 에어브러시, 부채꼴 브러시, 평붓, 아크릴, 리본 체인 스탬프, 클린룸 QR/JSON 브러시 공유 코덱",
  },
  {
    targetId: "medibang-cloud-brushes",
    targetName: "MediBang Paint / FireAlpaca Multi-Brush Suite (medibangpaint.com)",
    category: "commercial-painting-app",
    captureEvidenceId: "ev_331ca47f8685d449ee8f1725303e04bd48c7187df2f51a73956edfcf5e0e7eb6",
    exportEvidenceId: "ev_73109f9ee1937f99d6bea5cd205de36f01af6d810d7e8731db1009509533712e",
    astEvidenceId: "ev_a781ea653ff05d051f2411b5420d870cd38bc9249f092fab76737c4bc574fd97",
    parentAstEvidenceId: "ev_719930d8d7a8e9f0d50b68f0f5447a1fffbb62839d5d0a1786480613bccbe9b2",
    artifactSha256: "bd74f0320df8a7dd55bd886d027d1f3b5184375df19052fcee0b66e5951c5665",
    visitedAstNodes: 78366,
    parsedJavaScriptFiles: 15,
    internalizedBrushCount: 10,
    summaryKo:
      "꽃잎·구름·반짝이·나뭇잎·금속사슬·레이스·스크린톤 리본·집중선 멀티스탬프 체인 브러시 및 수채·묵화 번짐 커널",
  },
  {
    targetId: "photopea-abr-mixer",
    targetName: "Photopea / Photoshop .ABR Dynamics & Mixer Brush + Pro Apps (SAI Ver.2 / HeavyPaint / Concepts / Fresco)",
    category: "commercial-painting-app",
    captureEvidenceId: "ev_20b66c56a3a07d89aa27f4486a608ba67f1ec73e3f8d783339bb1802ba595e6b",
    exportEvidenceId: "ev_0b3590ceddbfa5e86f4d4a96fb21124d752736bcb6388fa9430910a2bca5bf7a",
    astEvidenceId: "ev_2c7410e9b58c4f01ae624554a7a2be12f78edef48545916effd56e0f06970312",
    parentAstEvidenceId: "ev_7274f767d2399b8ce09969ad8fc486c8be733e05081e48048d70768ab8333831",
    artifactSha256: "79c4fff49fec275b640238bf5f81fcbde473235363bf72a882511017cc5af3b5",
    visitedAstNodes: 10137,
    parsedJavaScriptFiles: 1,
    internalizedBrushCount: 14,
    summaryKo:
      "Photoshop .ABR 6단계 다이내믹스, Mixer Brush(Wet/Load/Mix/Flow), SAI Ver.2 저필압 블러·고필압 착색 수채화, HeavyPaint Rake/Lasso Fill, Concepts Nudge/Slice, Fresco Live Watercolor & Vector Trim",
  },
] as const;

export type HarmonyBrushKind =
  | "simple"
  | "sketchy"
  | "shaded"
  | "chrome"
  | "fur"
  | "longfur"
  | "web"
  | "ribbon"
  | "squares"
  | "grid"
  | "circles";

export const HARMONY_BRUSH_KINDS: readonly HarmonyBrushKind[] = [
  "simple",
  "sketchy",
  "shaded",
  "chrome",
  "fur",
  "longfur",
  "web",
  "ribbon",
  "squares",
  "grid",
  "circles",
] as const;

export type P5BrushPresetId =
  | "pen"
  | "rotring"
  | "2B"
  | "HB"
  | "2H"
  | "cpencil"
  | "pastel"
  | "crayon"
  | "charcoal"
  | "spray"
  | "marker";

export type P5BrushVectorFieldKind =
  | "hand"
  | "curved"
  | "zigzag"
  | "waves"
  | "seabed"
  | "spiral"
  | "columns";

export interface P5BrushPresetSpec {
  readonly id: P5BrushPresetId;
  readonly labelKo: string;
  readonly weight: number;
  readonly scatter: number;
  readonly sharpness: number;
  readonly grain: number;
  readonly opacity255: number;
  readonly spacing: number;
  readonly pressureCurve: readonly [number, number];
  readonly pressureMinMax: readonly [number, number];
  readonly tipType: "default" | "spray" | "marker";
  readonly markerTip: boolean;
  readonly noiseLevel: number;
}

export const P5_BRUSH_PRESET_CATALOG: readonly P5BrushPresetSpec[] = [
  { id: "pen", labelKo: "제도 펜 (Pen)", weight: 0.3, scatter: 0.15, sharpness: 0.9, grain: 0.7, opacity255: 150, spacing: 0.1, pressureCurve: [0.15, 0.2], pressureMinMax: [1.2, 1.0], tipType: "default", markerTip: false, noiseLevel: 0 },
  { id: "rotring", labelKo: "로트링 제도샤프 (Rotring)", weight: 0.15, scatter: 0.05, sharpness: 0.7, grain: 0.9, opacity255: 210, spacing: 0.1, pressureCurve: [0.35, 0.2], pressureMinMax: [1.3, 1.0], tipType: "default", markerTip: false, noiseLevel: 0 },
  { id: "2B", labelKo: "2B 흑연 연필", weight: 0.3, scatter: 0.75, sharpness: 0.45, grain: 0.8, opacity255: 180, spacing: 0.1, pressureCurve: [0.1, 0.3], pressureMinMax: [1.1, 0.9], tipType: "default", markerTip: false, noiseLevel: 0 },
  { id: "HB", labelKo: "HB 제도 연필", weight: 0.3, scatter: 0.6, sharpness: 0.3, grain: 0.7, opacity255: 170, spacing: 0.1, pressureCurve: [0.15, 0.2], pressureMinMax: [1.1, 0.9], tipType: "default", markerTip: false, noiseLevel: 0 },
  { id: "2H", labelKo: "2H 경질 연필", weight: 0.2, scatter: 0.6, sharpness: 0.3, grain: 0.75, opacity255: 120, spacing: 0.1, pressureCurve: [0.15, 0.2], pressureMinMax: [1.1, 0.9], tipType: "default", markerTip: false, noiseLevel: 0 },
  { id: "cpencil", labelKo: "색연필 (Colored Pencil)", weight: 0.35, scatter: 0.55, sharpness: 0.8, grain: 0.7, opacity255: 75, spacing: 0.1, pressureCurve: [0.15, 0.2], pressureMinMax: [0.95, 1.1], tipType: "default", markerTip: false, noiseLevel: 0 },
  { id: "pastel", labelKo: "오일 파스텔 (Pastel)", weight: 0.7, scatter: 5.0, sharpness: 0.91, grain: 1.0, opacity255: 30, spacing: 0.0283, pressureCurve: [0.4, 0.05], pressureMinMax: [1.09, 0.93], tipType: "default", markerTip: true, noiseLevel: 1 },
  { id: "crayon", labelKo: "크레용 (Crayon)", weight: 0.33, scatter: 1.9, sharpness: 0.75, grain: 2.0, opacity255: 159, spacing: 0.07, pressureCurve: [0.2, 0.2], pressureMinMax: [1.1, 0.9], tipType: "default", markerTip: true, noiseLevel: 1 },
  { id: "charcoal", labelKo: "건식 목탄 (Charcoal)", weight: 0.35, scatter: 1.5, sharpness: 0.68, grain: 2.0, opacity255: 120, spacing: 0.03, pressureCurve: [0.15, 0.4], pressureMinMax: [1.1, 0.95], tipType: "default", markerTip: false, noiseLevel: 0 },
  { id: "spray", labelKo: "에어 스프레이 (Spray)", weight: 0.2, scatter: 6.0, sharpness: 15.0, grain: 40.0, opacity255: 90, spacing: 0.5, pressureCurve: [0.2, 0.35], pressureMinMax: [0.7, 1.0], tipType: "spray", markerTip: false, noiseLevel: 0 },
  { id: "marker", labelKo: "알코올 마카 (Marker)", weight: 2.0, scatter: 0.2, sharpness: 0.85, grain: 0.25, opacity255: 140, spacing: 0.03, pressureCurve: [0.35, 0.25], pressureMinMax: [1.2, 0.85], tipType: "marker", markerTip: true, noiseLevel: 0 },
] as const;

export const P5_BRUSH_VECTOR_FIELDS: readonly P5BrushVectorFieldKind[] = [
  "hand",
  "curved",
  "zigzag",
  "waves",
  "seabed",
  "spiral",
  "columns",
] as const;

export type SketchpadBrushKind =
  | "mirror"
  | "tile"
  | "calligraphy"
  | "crayon"
  | "streamer"
  | "fur"
  | "sketchy"
  | "web"
  | "shaded"
  | "chrome"
  | "spirograph"
  | "arrow"
  | "pencil"
  | "highlighter"
  | "eraser"
  | "stamp"
  | "spraypaint"
  | "rainbow";

export const SKETCHPAD_BRUSH_KINDS: readonly SketchpadBrushKind[] = [
  "mirror",
  "tile",
  "calligraphy",
  "crayon",
  "streamer",
  "fur",
  "sketchy",
  "web",
  "shaded",
  "chrome",
  "spirograph",
  "arrow",
  "pencil",
  "highlighter",
  "eraser",
  "stamp",
  "spraypaint",
  "rainbow",
] as const;

export type ComicRibbonStampPresetId =
  | "dip-pen-hard"
  | "dip-pen-soft"
  | "dip-pen-bleed"
  | "felt-tip-pen"
  | "digital-pen"
  | "airbrush-trapezoid"
  | "fan-brush"
  | "flat-bristle"
  | "acrylic-opaque"
  | "watercolor-real"
  | "blur-smudge"
  | "ribbon-petal-chain"
  | "ribbon-cloud-cluster"
  | "ribbon-sparkle-star"
  | "ribbon-leaf-foliage"
  | "ribbon-metal-chain"
  | "ribbon-lace-frill"
  | "ribbon-halftone-strip"
  | "speed-line-flash";

export interface ComicRibbonStampPresetSpec {
  readonly id: ComicRibbonStampPresetId;
  readonly sourceApp: "ibisPaint" | "MediBang";
  readonly labelKo: string;
  readonly isRibbonChain: boolean;
  readonly nozzleCycleCount: number;
  readonly spacingRatio: number;
  readonly alignToTangent: boolean;
  readonly pressureSizeRange01: readonly [number, number];
}

export const IBIS_MEDIBANG_BRUSH_PRESETS: readonly ComicRibbonStampPresetSpec[] = [
  { id: "dip-pen-hard", sourceApp: "ibisPaint", labelKo: "딥펜 (경질)", isRibbonChain: false, nozzleCycleCount: 1, spacingRatio: 0.04, alignToTangent: true, pressureSizeRange01: [0.12, 1.0] },
  { id: "dip-pen-soft", sourceApp: "ibisPaint", labelKo: "딥펜 (연질)", isRibbonChain: false, nozzleCycleCount: 1, spacingRatio: 0.04, alignToTangent: true, pressureSizeRange01: [0.05, 1.15] },
  { id: "dip-pen-bleed", sourceApp: "ibisPaint", labelKo: "번짐 딥펜", isRibbonChain: false, nozzleCycleCount: 2, spacingRatio: 0.05, alignToTangent: true, pressureSizeRange01: [0.18, 1.08] },
  { id: "felt-tip-pen", sourceApp: "ibisPaint", labelKo: "사인펜 (Felt Tip)", isRibbonChain: false, nozzleCycleCount: 1, spacingRatio: 0.05, alignToTangent: false, pressureSizeRange01: [0.35, 1.0] },
  { id: "digital-pen", sourceApp: "ibisPaint", labelKo: "디지털 픽셀 펜", isRibbonChain: false, nozzleCycleCount: 1, spacingRatio: 0.02, alignToTangent: false, pressureSizeRange01: [1.0, 1.0] },
  { id: "airbrush-trapezoid", sourceApp: "ibisPaint", labelKo: "사다리꼴 에어브러시 60%", isRibbonChain: false, nozzleCycleCount: 1, spacingRatio: 0.12, alignToTangent: false, pressureSizeRange01: [0.4, 1.2] },
  { id: "fan-brush", sourceApp: "ibisPaint", labelKo: "부채꼴 자연모 브러시", isRibbonChain: false, nozzleCycleCount: 5, spacingRatio: 0.08, alignToTangent: true, pressureSizeRange01: [0.5, 1.1] },
  { id: "flat-bristle", sourceApp: "ibisPaint", labelKo: "평붓 다중모", isRibbonChain: false, nozzleCycleCount: 3, spacingRatio: 0.05, alignToTangent: true, pressureSizeRange01: [0.3, 1.05] },
  { id: "acrylic-opaque", sourceApp: "ibisPaint", labelKo: "불투명 아크릴", isRibbonChain: false, nozzleCycleCount: 2, spacingRatio: 0.06, alignToTangent: true, pressureSizeRange01: [0.35, 1.0] },
  { id: "watercolor-real", sourceApp: "MediBang", labelKo: "플러피 수채 (Fluffy Watercolor)", isRibbonChain: false, nozzleCycleCount: 2, spacingRatio: 0.07, alignToTangent: false, pressureSizeRange01: [0.4, 1.15] },
  { id: "blur-smudge", sourceApp: "ibisPaint", labelKo: "문지르기·블러 브러시", isRibbonChain: false, nozzleCycleCount: 1, spacingRatio: 0.06, alignToTangent: true, pressureSizeRange01: [0.5, 1.0] },
  { id: "ribbon-petal-chain", sourceApp: "MediBang", labelKo: "벚꽃잎 멀티 스탬프", isRibbonChain: true, nozzleCycleCount: 6, spacingRatio: 0.42, alignToTangent: true, pressureSizeRange01: [0.6, 1.25] },
  { id: "ribbon-cloud-cluster", sourceApp: "MediBang", labelKo: "뭉게구름 클라우드 브러시", isRibbonChain: true, nozzleCycleCount: 4, spacingRatio: 0.35, alignToTangent: false, pressureSizeRange01: [0.5, 1.3] },
  { id: "ribbon-sparkle-star", sourceApp: "MediBang", labelKo: "순정만화 반짝이 성운", isRibbonChain: true, nozzleCycleCount: 5, spacingRatio: 0.55, alignToTangent: false, pressureSizeRange01: [0.4, 1.4] },
  { id: "ribbon-leaf-foliage", sourceApp: "MediBang", labelKo: "나뭇잎 수풀 멀티 브러시", isRibbonChain: true, nozzleCycleCount: 8, spacingRatio: 0.3, alignToTangent: true, pressureSizeRange01: [0.55, 1.2] },
  { id: "ribbon-metal-chain", sourceApp: "ibisPaint", labelKo: "금속 사슬 리본 체인", isRibbonChain: true, nozzleCycleCount: 2, spacingRatio: 0.65, alignToTangent: true, pressureSizeRange01: [0.85, 1.05] },
  { id: "ribbon-lace-frill", sourceApp: "ibisPaint", labelKo: "로맨스판타지 레이스 프릴", isRibbonChain: true, nozzleCycleCount: 4, spacingRatio: 0.5, alignToTangent: true, pressureSizeRange01: [0.8, 1.1] },
  { id: "ribbon-halftone-strip", sourceApp: "MediBang", labelKo: "망점 그라데이션 리본", isRibbonChain: true, nozzleCycleCount: 3, spacingRatio: 0.25, alignToTangent: true, pressureSizeRange01: [0.5, 1.15] },
  { id: "speed-line-flash", sourceApp: "MediBang", labelKo: "액션 집중선 플래시", isRibbonChain: true, nozzleCycleCount: 6, spacingRatio: 0.48, alignToTangent: true, pressureSizeRange01: [0.3, 1.35] },
] as const;
