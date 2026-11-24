/**
 * 문맥 기반 스마트 ToonStudio 브러시 Top-3 · Wave 37A 물리 마찰음 매체·종이결 추천기.
 *
 * - 스트로크 속도(px/s) · 필압 분산 · 곡률(0..1) · 캔버스 줌(%) · 작업 레이어 단계(`rough|lineart|flat|shading|fx`)를
 *   온디바이스 결정론적 다요인 스코어링으로 분석한다.
 * - Wave 37A 물리 마찰음 6종 매체(`BrushFrictionMediumId`) · 5종 종이결(`StudioPaperTextureId`) ·
 *   Foley 오디오 프리셋을 자동 페어링한다.
 */

export type BrushLayerStage = "rough" | "lineart" | "flat" | "shading" | "fx";

/** Wave 37A 물리 마찰음 합성기(`brush-friction-audio-synth.ts`)와 동일한 6종 매체 계약. */
export type Wave37aFrictionMediumId =
  | "graphite-pencil"
  | "charcoal-pastel"
  | "watercolor-brush"
  | "oil-palette-knife"
  | "gpen-nib"
  | "alcohol-marker";

/** Wave 37A 종이결 물리 프로필(`studio-paper-and-pigment-physics.ts`)과 동일한 5종 종이결 계약. */
export type Wave37aPaperTextureId =
  | "smooth-bristol"
  | "cold-press-watercolor"
  | "rough-cotton"
  | "manga-kent"
  | "linen-canvas";

export type Wave37aFoleySoundId =
  | "graphite-pencil"
  | "charcoal-pastel"
  | "gpen-ink"
  | "watercolor-sable"
  | "oil-impasto"
  | "alcohol-marker"
  | "airbrush"
  | "sumi-ink-brush";

export type Wave37aFoleyPresetId = "quiet-atelier" | "lively-asmr" | "silent-focus";

export interface SmartBrushTelemetryInput {
  readonly layerStage: BrushLayerStage;
  /** 스트로크 평균 속도 (px/s, 20..3000). */
  readonly strokeSpeedPxPerSec: number;
  /** 필압 표준편차/분산 지표 (0..0.40, 높을수록 강약 폭이 큼). */
  readonly pressureVariance: number;
  /** 정규화 스트로크 곡률 (0..1, 높을수록 급커브·세밀 디테일). */
  readonly meanCurvature: number;
  /** 현재 캔버스 확대율 (%, 25..800). */
  readonly canvasZoomPct: number;
}

export interface RawStrokeTelemetryPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestampMs: number;
}

export interface Wave37aAudioPaperPairing {
  readonly frictionMediumId: Wave37aFrictionMediumId;
  readonly frictionMediumLabelKo: string;
  readonly foleySoundId: Wave37aFoleySoundId;
  readonly paperTextureId: Wave37aPaperTextureId;
  readonly paperTextureLabelKo: string;
  readonly paperRoughness01: number;
  readonly wetness01: number;
  readonly foleyPresetId: Wave37aFoleyPresetId;
  readonly foleyPresetLabelKo: string;
  readonly pairingRationaleKo: string;
}

export interface ToonStudioBrushProfile {
  readonly brushId: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly renderFamily: string;
  readonly primaryStages: readonly BrushLayerStage[];
  readonly secondaryStages: readonly BrushLayerStage[];
  readonly idealSpeedPxPerSec: number;
  readonly idealPressureVariance: number;
  readonly idealCurvature: number;
  readonly idealZoomPct: number;
  readonly baseSizePx: number;
  readonly baseStabilizationPct: number;
  readonly baseOpacityPct: number;
  readonly pairing: Wave37aAudioPaperPairing;
  readonly strengthSummaryKo: string;
}

export interface SmartBrushDynamicSettings {
  readonly sizePx: number;
  readonly stabilizationPct: number;
  readonly opacityPct: number;
}

export interface SmartBrushRecommendationItem {
  readonly rank: 1 | 2 | 3;
  readonly brush: ToonStudioBrushProfile;
  readonly matchScore: number;
  readonly stageFitScore: number;
  readonly telemetryFitScore: number;
  readonly dynamicSettings: SmartBrushDynamicSettings;
  readonly wave37aPairing: Wave37aAudioPaperPairing;
  readonly reasonKo: string;
}

export interface BrushLayerStageMeta {
  readonly id: BrushLayerStage;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly goalKo: string;
}

export interface SmartBrushRecommendationReport {
  readonly input: SmartBrushTelemetryInput;
  readonly layerStageMeta: BrushLayerStageMeta;
  readonly top3: readonly [
    SmartBrushRecommendationItem,
    SmartBrushRecommendationItem,
    SmartBrushRecommendationItem,
  ];
  readonly detectedStyleSummaryKo: string;
}

export const BRUSH_LAYER_STAGES: readonly BrushLayerStageMeta[] = Object.freeze([
  Object.freeze<BrushLayerStageMeta>({ id: "rough", labelKo: "러프·콘티", labelEn: "Rough", goalKo: "빠른 구도 탐색과 제스처 스케치" }),
  Object.freeze<BrushLayerStageMeta>({ id: "lineart", labelKo: "선화·잉킹", labelEn: "Lineart", goalKo: "강약이 또렷한 웹툰 외곽선 정선화" }),
  Object.freeze<BrushLayerStageMeta>({ id: "flat", labelKo: "밑색·채우기", labelEn: "Flat", goalKo: "틈 없는 균일 채색과 빠른 면 분할" }),
  Object.freeze<BrushLayerStageMeta>({ id: "shading", labelKo: "명암·채색", labelEn: "Shading", goalKo: "입체 음영과 자연스러운 회화 질감" }),
  Object.freeze<BrushLayerStageMeta>({ id: "fx", labelKo: "효과·마감", labelEn: "FX", goalKo: "발광 림라이트·입자·스크린톤 마감" }),
]);

export const SMART_BRUSH_TELEMETRY_PRESETS: Readonly<Record<BrushLayerStage, SmartBrushTelemetryInput>> = Object.freeze({
  rough: Object.freeze({
    layerStage: "rough",
    strokeSpeedPxPerSec: 1180,
    pressureVariance: 0.14,
    meanCurvature: 0.42,
    canvasZoomPct: 75,
  }),
  lineart: Object.freeze({
    layerStage: "lineart",
    strokeSpeedPxPerSec: 340,
    pressureVariance: 0.22,
    meanCurvature: 0.68,
    canvasZoomPct: 220,
  }),
  flat: Object.freeze({
    layerStage: "flat",
    strokeSpeedPxPerSec: 880,
    pressureVariance: 0.04,
    meanCurvature: 0.25,
    canvasZoomPct: 100,
  }),
  shading: Object.freeze({
    layerStage: "shading",
    strokeSpeedPxPerSec: 460,
    pressureVariance: 0.16,
    meanCurvature: 0.48,
    canvasZoomPct: 140,
  }),
  fx: Object.freeze({
    layerStage: "fx",
    strokeSpeedPxPerSec: 760,
    pressureVariance: 0.19,
    meanCurvature: 0.56,
    canvasZoomPct: 130,
  }),
});

const WAVE37A_MEDIUM_LABELS: Readonly<Record<Wave37aFrictionMediumId, string>> = Object.freeze({
  "graphite-pencil": "연필 (흑연 사각거림)",
  "charcoal-pastel": "목탄·파스텔 (거친 긁힘)",
  "watercolor-brush": "수채 붓 (부드러운 스침)",
  "oil-palette-knife": "유화 나이프 (끈적한 저항)",
  "gpen-nib": "G펜 촉 (금속 잉크 스크래치)",
  "alcohol-marker": "알코올 마커 (촉촉한 펠트 글라이드)",
});

const WAVE37A_PAPER_LABELS: Readonly<Record<Wave37aPaperTextureId, string>> = Object.freeze({
  "smooth-bristol": "스무스 브리스톨",
  "cold-press-watercolor": "중목 수채화지",
  "rough-cotton": "황목 코튼 300g",
  "manga-kent": "만화 원고 켄트지",
  "linen-canvas": "리넨 유화 캔버스",
});

const WAVE37A_PRESET_LABELS: Readonly<Record<Wave37aFoleyPresetId, string>> = Object.freeze({
  "quiet-atelier": "차분한 아틀리에",
  "lively-asmr": "생생한 ASMR",
  "silent-focus": "무음 집중",
});

function makePairing(
  frictionMediumId: Wave37aFrictionMediumId,
  foleySoundId: Wave37aFoleySoundId,
  paperTextureId: Wave37aPaperTextureId,
  paperRoughness01: number,
  wetness01: number,
  foleyPresetId: Wave37aFoleyPresetId,
  pairingRationaleKo: string,
): Wave37aAudioPaperPairing {
  return Object.freeze({
    frictionMediumId,
    frictionMediumLabelKo: WAVE37A_MEDIUM_LABELS[frictionMediumId],
    foleySoundId,
    paperTextureId,
    paperTextureLabelKo: WAVE37A_PAPER_LABELS[paperTextureId],
    paperRoughness01,
    wetness01,
    foleyPresetId,
    foleyPresetLabelKo: WAVE37A_PRESET_LABELS[foleyPresetId],
    pairingRationaleKo,
  });
}

/** ToonStudio 5단계 실전 브러시 15종 카탈로그 (Wave 37A 물리 마찰음·종이결 페어링 내장). */
export const TOONSTUDIO_SMART_BRUSH_CATALOG: readonly ToonStudioBrushProfile[] = Object.freeze([
  // 1) Rough (러프·콘티)
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "pencil-2b-rough",
    nameKo: "2B 콘티 연필",
    nameEn: "2B Conti Pencil",
    renderFamily: "pencil",
    primaryStages: ["rough"],
    secondaryStages: ["shading"],
    idealSpeedPxPerSec: 1100,
    idealPressureVariance: 0.14,
    idealCurvature: 0.44,
    idealZoomPct: 80,
    baseSizePx: 8,
    baseStabilizationPct: 22,
    baseOpacityPct: 82,
    pairing: makePairing("graphite-pencil", "graphite-pencil", "rough-cotton", 0.78, 0.05, "lively-asmr", "황목 코튼 요철과 흑연 사각거림으로 러프 선의 속도감을 살립니다."),
    strengthSummaryKo: "빠른 구도 탐색과 필압 강약 스케치에 최적화된 흑연 연필",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "charcoal-gesture",
    nameKo: "목탄 제스처 스틱",
    nameEn: "Charcoal Gesture Stick",
    renderFamily: "dry-media",
    primaryStages: ["rough"],
    secondaryStages: ["shading"],
    idealSpeedPxPerSec: 1550,
    idealPressureVariance: 0.2,
    idealCurvature: 0.28,
    idealZoomPct: 60,
    baseSizePx: 18,
    baseStabilizationPct: 12,
    baseOpacityPct: 78,
    pairing: makePairing("charcoal-pastel", "charcoal-pastel", "rough-cotton", 0.88, 0.02, "lively-asmr", "거친 황목 코튼 300g 표면에서 동세·덩어리감을 직관적으로 잡습니다."),
    strengthSummaryKo: "넓은 덩어리와 대담한 동세를 단번에 긋는 건식 목탄",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "blue-conti-lead",
    nameKo: "샤프 블루 러프심",
    nameEn: "Blue Mechanical Lead",
    renderFamily: "pencil",
    primaryStages: ["rough"],
    secondaryStages: ["lineart"],
    idealSpeedPxPerSec: 640,
    idealPressureVariance: 0.08,
    idealCurvature: 0.62,
    idealZoomPct: 125,
    baseSizePx: 4,
    baseStabilizationPct: 36,
    baseOpacityPct: 72,
    pairing: makePairing("graphite-pencil", "graphite-pencil", "manga-kent", 0.34, 0.04, "quiet-atelier", "만화 원고 켄트지의 경쾌한 흑연 마찰로 정교한 밑그림을 지원합니다."),
    strengthSummaryKo: "선화 직전 디테일 정리와 표정 구도 잡기에 강한 가는 샤프심",
  }),

  // 2) Lineart (선화·잉킹)
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "gpen",
    nameKo: "G펜 (강약 필압)",
    nameEn: "G-Pen Dynamic Ink",
    renderFamily: "gpen",
    primaryStages: ["lineart"],
    secondaryStages: ["fx"],
    idealSpeedPxPerSec: 360,
    idealPressureVariance: 0.24,
    idealCurvature: 0.66,
    idealZoomPct: 210,
    baseSizePx: 5,
    baseStabilizationPct: 64,
    baseOpacityPct: 100,
    pairing: makePairing("gpen-nib", "gpen-ink", "manga-kent", 0.24, 0.14, "lively-asmr", "135kg 만화 켄트지 위 금속 펜촉 스크래치로 필압 강약 피드백을 강화합니다."),
    strengthSummaryKo: "필압 변화에 따라 뾰족한 인입·인출 테이퍼가 살아나는 표준 만화 펜",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "maru-pen",
    nameKo: "둥근펜 (세밀 머리카락)",
    nameEn: "Maru Detail Nib",
    renderFamily: "pen",
    primaryStages: ["lineart"],
    secondaryStages: ["rough"],
    idealSpeedPxPerSec: 210,
    idealPressureVariance: 0.16,
    idealCurvature: 0.84,
    idealZoomPct: 320,
    baseSizePx: 2.5,
    baseStabilizationPct: 76,
    baseOpacityPct: 100,
    pairing: makePairing("gpen-nib", "gpen-ink", "smooth-bristol", 0.16, 0.12, "quiet-atelier", "매끄러운 브리스톨 표면에서 고배율 곡선 떨림 없이 세선을 긋습니다."),
    strengthSummaryKo: "속눈썹·머리카락 끝·장신구 등 고곡률 세밀 선화에 특화된 세필",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "perfect-ink-liner",
    nameKo: "매끈한 모노라인 잉크",
    nameEn: "Perfect Ink Liner",
    renderFamily: "perfect",
    primaryStages: ["lineart"],
    secondaryStages: ["flat"],
    idealSpeedPxPerSec: 520,
    idealPressureVariance: 0.05,
    idealCurvature: 0.35,
    idealZoomPct: 150,
    baseSizePx: 4,
    baseStabilizationPct: 82,
    baseOpacityPct: 100,
    pairing: makePairing("alcohol-marker", "alcohol-marker", "smooth-bristol", 0.14, 0.22, "quiet-atelier", "일정한 펠트 저항과 스무스 브리스톨 조합으로 균일한 모노라인을 유지합니다."),
    strengthSummaryKo: "배경 건축선·현대 일상툰의 균일한 외곽선을 안정적으로 그리는 라이너",
  }),

  // 3) Flat (밑색·채우기)
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "alcohol-marker-flat",
    nameKo: "알코올 마커 플랫",
    nameEn: "Alcohol Marker Flat",
    renderFamily: "marker",
    primaryStages: ["flat"],
    secondaryStages: ["shading"],
    idealSpeedPxPerSec: 900,
    idealPressureVariance: 0.04,
    idealCurvature: 0.24,
    idealZoomPct: 100,
    baseSizePx: 26,
    baseStabilizationPct: 30,
    baseOpacityPct: 100,
    pairing: makePairing("alcohol-marker", "alcohol-marker", "smooth-bristol", 0.15, 0.42, "quiet-atelier", "촉촉한 펠트 글라이드와 저흡수 브리스톨로 얼룩 없는 밑색을 채웁니다."),
    strengthSummaryKo: "필압 편차가 적은 빠른 면 채색에 최적화된 불투명 플랫 마커",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "solid-fill-pen",
    nameKo: "틈새 마감 채우기 펜",
    nameEn: "Gap-Safe Fill Pen",
    renderFamily: "pen",
    primaryStages: ["flat"],
    secondaryStages: ["lineart"],
    idealSpeedPxPerSec: 460,
    idealPressureVariance: 0.06,
    idealCurvature: 0.54,
    idealZoomPct: 185,
    baseSizePx: 12,
    baseStabilizationPct: 48,
    baseOpacityPct: 100,
    pairing: makePairing("alcohol-marker", "alcohol-marker", "manga-kent", 0.22, 0.3, "quiet-atelier", "켄트지의 선명한 경계 제어력으로 좁은 모서리 밑색 누락을 막습니다."),
    strengthSummaryKo: "머리카락 틈새·의상 디테일 경계를 꼼꼼히 메우는 안티앨리어싱 경계 펜",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "broad-flat-wash",
    nameKo: "광폭 배경 평붓",
    nameEn: "Broad Flat Wash",
    renderFamily: "brush",
    primaryStages: ["flat"],
    secondaryStages: ["shading"],
    idealSpeedPxPerSec: 1350,
    idealPressureVariance: 0.11,
    idealCurvature: 0.16,
    idealZoomPct: 65,
    baseSizePx: 46,
    baseStabilizationPct: 18,
    baseOpacityPct: 96,
    pairing: makePairing("watercolor-brush", "watercolor-sable", "cold-press-watercolor", 0.48, 0.58, "quiet-atelier", "부드러운 수채 붓 스침으로 넓은 하늘·배경 베이스 톤을 한 번에 깝니다."),
    strengthSummaryKo: "저배율 전체 컷 배경 밑색을 빠르게 덮는 넓은 평붓",
  }),

  // 4) Shading (명암·채색)
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "watercolor-sable",
    nameKo: "수채 세이블 혼색 붓",
    nameEn: "Watercolor Sable Blend",
    renderFamily: "watercolor",
    primaryStages: ["shading"],
    secondaryStages: ["flat"],
    idealSpeedPxPerSec: 440,
    idealPressureVariance: 0.17,
    idealCurvature: 0.5,
    idealZoomPct: 145,
    baseSizePx: 22,
    baseStabilizationPct: 42,
    baseOpacityPct: 68,
    pairing: makePairing("watercolor-brush", "watercolor-sable", "cold-press-watercolor", 0.56, 0.78, "quiet-atelier", "중목 수채화지의 모세관 번짐과 촉촉한 붓 마찰로 투명 음영을 쌓습니다."),
    strengthSummaryKo: "Kubelka-Munk 물리 혼색·웨트 엣지 표현이 살아나는 투명 수채 붓",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "oil-impasto-knife",
    nameKo: "유화 임파스토 브러시",
    nameEn: "Oil Impasto Brush",
    renderFamily: "oil",
    primaryStages: ["shading"],
    secondaryStages: ["fx"],
    idealSpeedPxPerSec: 320,
    idealPressureVariance: 0.23,
    idealCurvature: 0.42,
    idealZoomPct: 165,
    baseSizePx: 18,
    baseStabilizationPct: 35,
    baseOpacityPct: 92,
    pairing: makePairing("oil-palette-knife", "oil-impasto", "linen-canvas", 0.74, 0.36, "lively-asmr", "리넨 캔버스 교차 결의 끈적한 저항으로 붓터치 밀도를 체감합니다."),
    strengthSummaryKo: "강한 필압 대비로 유화 두께와 입체 음영을 조각하는 회화 브러시",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "soft-airbrush",
    nameKo: "소프트 그라데이션 에어브러시",
    nameEn: "Soft Gradient Airbrush",
    renderFamily: "airbrush",
    primaryStages: ["shading"],
    secondaryStages: ["fx"],
    idealSpeedPxPerSec: 780,
    idealPressureVariance: 0.08,
    idealCurvature: 0.28,
    idealZoomPct: 105,
    baseSizePx: 42,
    baseStabilizationPct: 26,
    baseOpacityPct: 38,
    pairing: makePairing("watercolor-brush", "airbrush", "smooth-bristol", 0.18, 0.32, "quiet-atelier", "매끄러운 브리스톨 위 저마찰 분사로 피부 홍조·부드러운 광원을 표현합니다."),
    strengthSummaryKo: "피부 톤 전환과 부드러운 분위기 그림자에 쓰는 저농도 에어브러시",
  }),

  // 5) FX (효과·마감)
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "neon-rim-glow",
    nameKo: "네온 림라이트 글로우",
    nameEn: "Neon Rim Glow",
    renderFamily: "neon",
    primaryStages: ["fx"],
    secondaryStages: ["shading"],
    idealSpeedPxPerSec: 680,
    idealPressureVariance: 0.15,
    idealCurvature: 0.58,
    idealZoomPct: 140,
    baseSizePx: 14,
    baseStabilizationPct: 58,
    baseOpacityPct: 88,
    pairing: makePairing("alcohol-marker", "airbrush", "smooth-bristol", 0.12, 0.4, "quiet-atelier", "마찰 간섭이 적은 매끄러운 글라이드로 역광 림라이트와 마법 발광선을 긋습니다."),
    strengthSummaryKo: "캐릭터 외곽 역광·스킬 발광 궤적을 한 번에 입히는 네온 글로우",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "ink-particle-splatter",
    nameKo: "입자 잉크 스플래터",
    nameEn: "Ink Particle Splatter",
    renderFamily: "ink-particle",
    primaryStages: ["fx"],
    secondaryStages: ["rough"],
    idealSpeedPxPerSec: 1280,
    idealPressureVariance: 0.25,
    idealCurvature: 0.44,
    idealZoomPct: 95,
    baseSizePx: 32,
    baseStabilizationPct: 16,
    baseOpacityPct: 90,
    pairing: makePairing("gpen-nib", "sumi-ink-brush", "manga-kent", 0.28, 0.64, "lively-asmr", "먹붓 분사 질감과 켄트지 마찰로 액션 타격 비말·파편 효과를 극대화합니다."),
    strengthSummaryKo: "고속 스트로크에 반응해 빗방울·먹물 튐·타격 파편을 뿌리는 입자 브러시",
  }),
  Object.freeze<ToonStudioBrushProfile>({
    brushId: "screentone-hatch-fx",
    nameKo: "스크린톤 해칭 피니셔",
    nameEn: "Screentone Hatch Finisher",
    renderFamily: "screentone",
    primaryStages: ["fx"],
    secondaryStages: ["shading"],
    idealSpeedPxPerSec: 420,
    idealPressureVariance: 0.12,
    idealCurvature: 0.68,
    idealZoomPct: 180,
    baseSizePx: 16,
    baseStabilizationPct: 50,
    baseOpacityPct: 84,
    pairing: makePairing("charcoal-pastel", "charcoal-pastel", "manga-kent", 0.32, 0.08, "lively-asmr", "켄트지 위 사각거리는 건식 톤 마찰로 만화 출판 감성의 해칭을 완성합니다."),
    strengthSummaryKo: "긴장감 있는 집중선·해칭 톤과 입자 질감을 덧입히는 마감 브러시",
  }),
]);

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function gaussianSim(diff: number, sigma: number): number {
  const ratio = diff / Math.max(1e-6, sigma);
  return Math.exp(-0.5 * ratio * ratio);
}

/** 원시 스타일러스 포인트 배열에서 속도·필압 분산·곡률 텔레메트리를 추출한다. */
export function extractStrokeTelemetryFromPoints(
  points: readonly RawStrokeTelemetryPoint[],
  canvasZoomPct: number,
  layerStage: BrushLayerStage,
): SmartBrushTelemetryInput {
  if (points.length < 2) {
    return {
      layerStage,
      strokeSpeedPxPerSec: 400,
      pressureVariance: 0.1,
      meanCurvature: 0.35,
      canvasZoomPct: clamp(canvasZoomPct, 25, 800),
    };
  }

  let totalDist = 0;
  let totalTimeSec = 0;
  let pressureSum = 0;
  for (let i = 0; i < points.length; i += 1) {
    pressureSum += clamp(points[i]!.pressure, 0, 1);
    if (i > 0) {
      const prev = points[i - 1]!;
      const curr = points[i]!;
      totalDist += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      totalTimeSec += Math.max(0.001, (curr.timestampMs - prev.timestampMs) / 1000);
    }
  }
  const meanPressure = pressureSum / points.length;
  let varSum = 0;
  for (const pt of points) {
    const d = clamp(pt.pressure, 0, 1) - meanPressure;
    varSum += d * d;
  }
  const pressureStd = Math.sqrt(varSum / points.length);

  let angleSum = 0;
  let angleCount = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const m1 = Math.hypot(v1x, v1y);
    const m2 = Math.hypot(v2x, v2y);
    if (m1 > 0.25 && m2 > 0.25) {
      const cosTheta = clamp((v1x * v2x + v1y * v2y) / (m1 * m2), -1, 1);
      angleSum += Math.acos(cosTheta) / Math.PI;
      angleCount += 1;
    }
  }

  const speed = clamp(totalDist / Math.max(0.01, totalTimeSec), 20, 3000);
  const meanCurvature = angleCount > 0 ? clamp((angleSum / angleCount) * 2.2, 0, 1) : 0.2;

  return {
    layerStage,
    strokeSpeedPxPerSec: Math.round(speed),
    pressureVariance: Math.round(clamp(pressureStd, 0, 0.4) * 1000) / 1000,
    meanCurvature: Math.round(meanCurvature * 1000) / 1000,
    canvasZoomPct: Math.round(clamp(canvasZoomPct, 25, 800)),
  };
}

function buildDynamicSettings(
  brush: ToonStudioBrushProfile,
  input: SmartBrushTelemetryInput,
): SmartBrushDynamicSettings {
  // 고배율일수록 세밀한 굵기, 고곡률일수록 손떨림 보정 강화
  const zoomScale = clamp(Math.sqrt(brush.idealZoomPct / Math.max(25, input.canvasZoomPct)), 0.55, 1.75);
  const sizePx = Math.round(clamp(brush.baseSizePx * zoomScale, 1, 96) * 10) / 10;
  const curvatureBoost = (input.meanCurvature - 0.4) * 22;
  const speedDamp = input.strokeSpeedPxPerSec > 1200 ? -8 : 0;
  const stabilizationPct = Math.round(clamp(brush.baseStabilizationPct + curvatureBoost + speedDamp, 0, 96));
  const opacityPct = Math.round(
    clamp(brush.baseOpacityPct - (input.pressureVariance > 0.22 && brush.renderFamily === "watercolor" ? 8 : 0), 15, 100),
  );
  return { sizePx, stabilizationPct, opacityPct };
}

function buildRecommendationReasonKo(
  brush: ToonStudioBrushProfile,
  input: SmartBrushTelemetryInput,
  stageMeta: BrushLayerStageMeta,
): string {
  const speedDesc =
    input.strokeSpeedPxPerSec >= 1000
      ? "빠른 스트로크"
      : input.strokeSpeedPxPerSec <= 380
        ? "신중한 저속 필선"
        : "중속 안정 스트로크";
  const pressureDesc =
    input.pressureVariance >= 0.18
      ? "강약 폭이 큰 필압"
      : input.pressureVariance <= 0.07
        ? "균일한 필압"
        : "자연스러운 필압 변화";
  const curveDesc = input.meanCurvature >= 0.6 ? "세밀한 고곡률" : input.meanCurvature <= 0.3 ? "시원한 직선·완만 곡선" : "혼합 곡률";
  return `${stageMeta.labelKo} 단계의 ${speedDesc}(${Math.round(input.strokeSpeedPxPerSec)}px/s) · ${pressureDesc} · ${curveDesc} · ${Math.round(input.canvasZoomPct)}% 줌에 최적화된 ${brush.nameKo} 추천`;
}

/** 스트로크 텔레메트리와 작업 레이어 단계를 분석해 최적 브러시 Top-3 및 Wave 37A 페어링을 반환한다. */
export function recommendSmartBrushes(rawInput: SmartBrushTelemetryInput): SmartBrushRecommendationReport {
  const input: SmartBrushTelemetryInput = {
    layerStage: rawInput.layerStage,
    strokeSpeedPxPerSec: clamp(rawInput.strokeSpeedPxPerSec, 20, 3000),
    pressureVariance: clamp(rawInput.pressureVariance, 0, 0.4),
    meanCurvature: clamp(rawInput.meanCurvature, 0, 1),
    canvasZoomPct: clamp(rawInput.canvasZoomPct, 25, 800),
  };

  const stageMeta =
    BRUSH_LAYER_STAGES.find((s) => s.id === input.layerStage) ?? BRUSH_LAYER_STAGES[0]!;

  const scored = TOONSTUDIO_SMART_BRUSH_CATALOG.map((brush) => {
    const isPrimary = brush.primaryStages.includes(input.layerStage);
    const isSecondary = brush.secondaryStages.includes(input.layerStage);
    const stageScore = isPrimary ? 1.0 : isSecondary ? 0.46 : 0.12;

    const speedSim = gaussianSim(
      Math.log2(input.strokeSpeedPxPerSec) - Math.log2(brush.idealSpeedPxPerSec),
      1.05,
    );
    const pressureSim = gaussianSim(input.pressureVariance - brush.idealPressureVariance, 0.095);
    const curvatureSim = gaussianSim(input.meanCurvature - brush.idealCurvature, 0.28);
    const zoomSim = gaussianSim(
      Math.log2(input.canvasZoomPct) - Math.log2(brush.idealZoomPct),
      0.95,
    );

    const telemetrySim = speedSim * 0.27 + pressureSim * 0.33 + curvatureSim * 0.22 + zoomSim * 0.18;
    const totalScore = Math.round(clamp((stageScore * 0.48 + telemetrySim * 0.52) * 100, 1, 99));

    return {
      brush,
      matchScore: totalScore,
      stageFitScore: Math.round(stageScore * 100),
      telemetryFitScore: Math.round(telemetrySim * 100),
      dynamicSettings: buildDynamicSettings(brush, input),
      wave37aPairing: brush.pairing,
      reasonKo: buildRecommendationReasonKo(brush, input, stageMeta),
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore || a.brush.brushId.localeCompare(b.brush.brushId));

  const first = scored[0]!;
  const second = scored[1]!;
  const third = scored[2]!;

  const top3: readonly [
    SmartBrushRecommendationItem,
    SmartBrushRecommendationItem,
    SmartBrushRecommendationItem,
  ] = [
    { rank: 1, ...first },
    { rank: 2, ...second },
    { rank: 3, ...third },
  ];

  const zoomTag = input.canvasZoomPct >= 200 ? "고배율 정밀 구간" : input.canvasZoomPct <= 85 ? "저배율 전체 구도" : "표준 작업 배율";
  const detectedStyleSummaryKo = `${stageMeta.labelKo} · ${zoomTag}(${Math.round(input.canvasZoomPct)}%) · 속도 ${Math.round(input.strokeSpeedPxPerSec)}px/s · 필압 분산 ${input.pressureVariance.toFixed(2)} · 곡률 ${input.meanCurvature.toFixed(2)}`;

  return {
    input,
    layerStageMeta: stageMeta,
    top3,
    detectedStyleSummaryKo,
  };
}
