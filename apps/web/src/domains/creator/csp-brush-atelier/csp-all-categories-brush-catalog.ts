/**
 * Clip Studio Paint 전 9대 카테고리 × 36종 풀 프로 브러시 클린룸 물리 파라미터 정본 카탈로그.
 *
 * 각 브러시는 종이 요철(황목/중목/한지/캔버스/켄트지), 필압·틸트 곡선, 붓모 갈라짐(비등방성),
 * 수채 가장자리 다크닝, 임파스토 부조 깊이, 데코레이션 리본/산포, 지우개·혼색 모드를
 * 결정론적 물리 파라미터로 정의한다.
 */

export const CSP_BRUSH_CATEGORY_IDS = [
  "pen",
  "pencil",
  "pastel-crayon",
  "watercolor",
  "thick-paint",
  "india-ink",
  "airbrush",
  "decoration",
  "eraser-blend",
] as const;

export type CspBrushCategoryId = (typeof CSP_BRUSH_CATEGORY_IDS)[number];
export type CspBrushCategoryFilter = "all" | CspBrushCategoryId;

export type CspPaperGrainId =
  | "smooth-kent"
  | "cold-press-rough"
  | "cold-press-medium"
  | "hanji-fiber"
  | "canvas-weave"
  | "none";

export type CspTextureKernelId =
  | "ink-nib"
  | "ink-rough"
  | "graphite-tooth"
  | "wax-crayon"
  | "oil-pastel"
  | "chalk-powder"
  | "charcoal-grit"
  | "watercolor-wash"
  | "watercolor-bloom"
  | "oil-impasto"
  | "gouache-matte"
  | "palette-knife"
  | "sumi-dry-rake"
  | "sumi-wet-bleed"
  | "airbrush-mist"
  | "tone-scrape"
  | "decor-lace"
  | "decor-petals"
  | "decor-sparkle"
  | "decor-chain"
  | "eraser-kneaded"
  | "eraser-vector"
  | "blend-smudge"
  | "blend-painterly";

export type CspRibbonRepeatMode =
  | "none"
  | "scallop-lace"
  | "petal-scatter"
  | "starlight-burst"
  | "chain-vine";

export type CspBrushOperationMode = "paint" | "erase" | "vector-erase" | "blend";

export type CspBrushId =
  | "csp-g-pen"
  | "csp-real-g-pen"
  | "csp-mapping-pen"
  | "csp-turnip-pen"
  | "csp-textured-pen"
  | "csp-darker-pencil"
  | "csp-lighter-pencil"
  | "csp-real-pencil"
  | "csp-design-pencil"
  | "csp-wax-crayon"
  | "csp-oil-pastel"
  | "csp-chalk"
  | "csp-charcoal"
  | "csp-transparent-wc"
  | "csp-opaque-wc"
  | "csp-dense-wc"
  | "csp-watery-brush"
  | "csp-oil-paint"
  | "csp-gouache"
  | "csp-palette-knife"
  | "csp-flat-oil-blender"
  | "csp-dry-sumi"
  | "csp-wet-sumi"
  | "csp-rough-wash"
  | "csp-calligraphy-fude"
  | "csp-soft-airbrush"
  | "csp-hard-airbrush"
  | "csp-tone-scraping"
  | "csp-rofan-lace-frill"
  | "csp-sakura-petals"
  | "csp-sparkle-starlight"
  | "csp-chain-foliage"
  | "csp-kneaded-eraser"
  | "csp-vector-intersect-eraser"
  | "csp-fingertip-smudge"
  | "csp-painterly-blender";

export interface CspBrushCategoryMeta {
  readonly id: CspBrushCategoryId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly expectedCount: number;
  readonly accentOklch: string;
}

export interface CspProBrushSpec {
  readonly id: CspBrushId;
  readonly category: CspBrushCategoryId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly summaryKo: string;
  readonly paperGrain: CspPaperGrainId;
  readonly paperGrainLabelKo: string;
  readonly textureKernel: CspTextureKernelId;
  readonly defaultSizePx: number;
  readonly spacingRatio: number;
  readonly hardness01: number;
  readonly opacity01: number;
  readonly pressureSizeRange: readonly [number, number];
  readonly pressureOpacityRange: readonly [number, number];
  readonly pressureGamma: number;
  readonly tiltExpandMax: number;
  readonly taperStart01: number;
  readonly taperEnd01: number;
  readonly stabilizerLevel: number;
  readonly paperToothStrength01: number;
  readonly bristleCount: number;
  readonly bristleAnisotropy: number;
  readonly wetEdgeDarkening01: number;
  readonly impastoRidge01: number;
  readonly colorMixStrength01: number;
  readonly scatterDensity01: number;
  readonly ribbonRepeatMode: CspRibbonRepeatMode;
  readonly operationMode: CspBrushOperationMode;
  readonly previewInkOklch: string;
  readonly previewInkRgb: readonly [number, number, number];
  readonly tags: readonly string[];
}

export const CSP_BRUSH_CATEGORIES: readonly CspBrushCategoryMeta[] = Object.freeze([
  {
    id: "pen", labelKo: "펜", labelEn: "Pen", expectedCount: 5,
    descriptionKo: "만화 정선화·극세선·거친 잉크 결을 담당하는 강약 탄성 펜촉 5종",
    accentOklch: "oklch(0.56 0.14 258)",
  },
  {
    id: "pencil", labelKo: "연필", labelEn: "Pencil", expectedCount: 4,
    descriptionKo: "흑연 입자 밀착·종이 산 걸림·기울기 면 쉐이딩 연필 4종",
    accentOklch: "oklch(0.54 0.05 250)",
  },
  {
    id: "pastel-crayon", labelKo: "파스텔·크레용", labelEn: "Pastel & Crayon", expectedCount: 4,
    descriptionKo: "2옥타브 냉압지 산/골 씹힘·꾸덕한 유성 혼색·건식 분말·목탄 4종",
    accentOklch: "oklch(0.64 0.17 44)",
  },
  {
    id: "watercolor", labelKo: "수채", labelEn: "Watercolor", expectedCount: 4,
    descriptionKo: "모세관 가장자리 다크닝·안료 과립 침전·젖은 종이 블룸 수채 4종",
    accentOklch: "oklch(0.62 0.15 215)",
  },
  {
    id: "thick-paint", labelKo: "유화·두꺼운 채색", labelEn: "Thick Paint / Oil", expectedCount: 4,
    descriptionKo: "임파스토 하이라이트 리지·브리슬 갈라짐·나이프 색 긁기 4종",
    accentOklch: "oklch(0.60 0.16 28)",
  },
  {
    id: "india-ink", labelKo: "먹·동양화 붓", labelEn: "India Ink / Sumi", expectedCount: 4,
    descriptionKo: "한지 섬유 위 비백 갈필·화선지 먹 번짐·서예 탄성 붓펜 4종",
    accentOklch: "oklch(0.45 0.04 260)",
  },
  {
    id: "airbrush", labelKo: "에어브러시", labelEn: "Airbrush", expectedCount: 3,
    descriptionKo: "가우시안 안개 그라데이션·광원 코어·만화 톤 깎기 3종",
    accentOklch: "oklch(0.66 0.12 232)",
  },
  {
    id: "decoration", labelKo: "데코레이션·웹툰 패턴", labelEn: "Decoration", expectedCount: 4,
    descriptionKo: "로판 레이스 프릴 리본·꽃잎 산포·반짝이 별빛·사슬/덩굴 4종",
    accentOklch: "oklch(0.66 0.16 340)",
  },
  {
    id: "eraser-blend", labelKo: "지우개·혼색 블렌더", labelEn: "Eraser & Blend", expectedCount: 4,
    descriptionKo: "떡지우개 부분 밝힘·벡터 교차점 삭제·손가락/유화 블렌더 4종",
    accentOklch: "oklch(0.62 0.14 156)",
  },
]);

const PAPER_GRAIN_LABELS: Readonly<Record<CspPaperGrainId, string>> = Object.freeze({
  "smooth-kent": "켄트지(미세 결)",
  "cold-press-rough": "황목 냉압지",
  "cold-press-medium": "중목 수채지",
  "hanji-fiber": "한지·화선지 섬유",
  "canvas-weave": "캔버스 직조",
  none: "무결(매끈함)",
});

type BrushSeedInput = Omit<CspProBrushSpec, "paperGrainLabelKo">;

function defineBrush(seed: BrushSeedInput): CspProBrushSpec {
  return Object.freeze({ ...seed, paperGrainLabelKo: PAPER_GRAIN_LABELS[seed.paperGrain] });
}

export const CSP_ALL_36_BRUSH_CATALOG: readonly CspProBrushSpec[] = Object.freeze([
  // 1. 펜 (Pen, 5종)
  defineBrush({
    id: "csp-g-pen", category: "pen", nameKo: "G펜", nameEn: "G-Pen",
    summaryKo: "필압 강약이 선명하고 끝맺음이 예리한 만화·웹툰 표준 정선화 펜촉",
    paperGrain: "smooth-kent", textureKernel: "ink-nib",
    defaultSizePx: 12, spacingRatio: 0.06, hardness01: 0.98, opacity01: 1,
    pressureSizeRange: [0.12, 1.38], pressureOpacityRange: [0.82, 1], pressureGamma: 0.96,
    tiltExpandMax: 1.18, taperStart01: 0.88, taperEnd01: 0.92, stabilizerLevel: 52,
    paperToothStrength01: 0.06, bristleCount: 0, bristleAnisotropy: 1.12,
    wetEdgeDarkening01: 0.04, impastoRidge01: 0, colorMixStrength01: 0, scatterDensity01: 0,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.24 0.03 262)", previewInkRgb: [28, 32, 44],
    tags: ["펜", "G펜", "선화", "만화", "g-pen", "ink"],
  }),
  defineBrush({
    id: "csp-real-g-pen", category: "pen", nameKo: "리얼 G펜", nameEn: "Real G-Pen",
    summaryKo: "원고지 미세 결에 잉크가 살짝 걸리고 긁히는 아날로그 펜촉 감각",
    paperGrain: "cold-press-medium", textureKernel: "ink-rough",
    defaultSizePx: 13, spacingRatio: 0.07, hardness01: 0.92, opacity01: 0.98,
    pressureSizeRange: [0.15, 1.4], pressureOpacityRange: [0.72, 1], pressureGamma: 0.92,
    tiltExpandMax: 1.28, taperStart01: 0.84, taperEnd01: 0.88, stabilizerLevel: 44,
    paperToothStrength01: 0.44, bristleCount: 6, bristleAnisotropy: 1.38,
    wetEdgeDarkening01: 0.14, impastoRidge01: 0.04, colorMixStrength01: 0, scatterDensity01: 0.18,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.26 0.04 252)", previewInkRgb: [34, 38, 50],
    tags: ["펜", "리얼 G펜", "거친 잉크", "아날로그", "real-g-pen"],
  }),
  defineBrush({
    id: "csp-mapping-pen", category: "pen", nameKo: "둥근펜 (마루펜)", nameEn: "Mapping Pen",
    summaryKo: "머리카락·속눈썹·장신구 극세선 묘사에 맞춘 초정밀 탄력 펜촉",
    paperGrain: "smooth-kent", textureKernel: "ink-nib",
    defaultSizePx: 6, spacingRatio: 0.055, hardness01: 0.99, opacity01: 1,
    pressureSizeRange: [0.08, 1.18], pressureOpacityRange: [0.85, 1], pressureGamma: 1.08,
    tiltExpandMax: 1.1, taperStart01: 0.94, taperEnd01: 0.96, stabilizerLevel: 60,
    paperToothStrength01: 0.04, bristleCount: 0, bristleAnisotropy: 1.08,
    wetEdgeDarkening01: 0.02, impastoRidge01: 0, colorMixStrength01: 0, scatterDensity01: 0,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.22 0.03 268)", previewInkRgb: [22, 26, 38],
    tags: ["펜", "둥근펜", "마루펜", "극세선", "mapping-pen"],
  }),
  defineBrush({
    id: "csp-turnip-pen", category: "pen", nameKo: "순무펜 (카부라펜)", nameEn: "Turnip Pen",
    summaryKo: "필압 변화가 부드럽고 균일한 선폭을 유지하는 배경·소품·외곽선 펜",
    paperGrain: "smooth-kent", textureKernel: "ink-nib",
    defaultSizePx: 11, spacingRatio: 0.065, hardness01: 0.96, opacity01: 1,
    pressureSizeRange: [0.46, 1.16], pressureOpacityRange: [0.9, 1], pressureGamma: 0.88,
    tiltExpandMax: 1.14, taperStart01: 0.42, taperEnd01: 0.48, stabilizerLevel: 56,
    paperToothStrength01: 0.08, bristleCount: 0, bristleAnisotropy: 1.06,
    wetEdgeDarkening01: 0.04, impastoRidge01: 0, colorMixStrength01: 0, scatterDensity01: 0,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.28 0.04 245)", previewInkRgb: [38, 44, 58],
    tags: ["펜", "순무펜", "카부라펜", "균일 선폭", "turnip-pen"],
  }),
  defineBrush({
    id: "csp-textured-pen", category: "pen", nameKo: "질감 펜", nameEn: "Textured Pen",
    summaryKo: "잉크가 종이 요철에 살짝 마르며 손그림 맛을 살리는 텍스처 선화 펜",
    paperGrain: "cold-press-rough", textureKernel: "ink-rough",
    defaultSizePx: 14, spacingRatio: 0.08, hardness01: 0.86, opacity01: 0.96,
    pressureSizeRange: [0.22, 1.32], pressureOpacityRange: [0.58, 0.98], pressureGamma: 0.88,
    tiltExpandMax: 1.38, taperStart01: 0.72, taperEnd01: 0.78, stabilizerLevel: 38,
    paperToothStrength01: 0.68, bristleCount: 10, bristleAnisotropy: 1.52,
    wetEdgeDarkening01: 0.12, impastoRidge01: 0.06, colorMixStrength01: 0, scatterDensity01: 0.28,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.30 0.05 32)", previewInkRgb: [62, 46, 40],
    tags: ["펜", "질감 펜", "손그림", "텍스처", "textured-pen"],
  }),

  // 2. 연필 (Pencil, 4종)
  defineBrush({
    id: "csp-darker-pencil", category: "pencil", nameKo: "진한 연필", nameEn: "Darker Pencil",
    summaryKo: "2B~4B 흑연이 종이 결에 묵직하게 밀착되는 러프·명암 스케치 연필",
    paperGrain: "cold-press-medium", textureKernel: "graphite-tooth",
    defaultSizePx: 14, spacingRatio: 0.1, hardness01: 0.74, opacity01: 0.92,
    pressureSizeRange: [0.3, 1.24], pressureOpacityRange: [0.28, 0.95], pressureGamma: 0.78,
    tiltExpandMax: 2.05, taperStart01: 0.64, taperEnd01: 0.72, stabilizerLevel: 26,
    paperToothStrength01: 0.78, bristleCount: 12, bristleAnisotropy: 1.82,
    wetEdgeDarkening01: 0, impastoRidge01: 0.05, colorMixStrength01: 0.08, scatterDensity01: 0.34,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.32 0.02 255)", previewInkRgb: [52, 55, 62],
    tags: ["연필", "진한 연필", "2B", "러프", "darker-pencil"],
  }),
  defineBrush({
    id: "csp-lighter-pencil", category: "pencil", nameKo: "연한 연필", nameEn: "Lighter Pencil",
    summaryKo: "2H~HB 단단한 흑연 심으로 가볍게 밑그림을 잡는 투명 스케치 연필",
    paperGrain: "cold-press-medium", textureKernel: "graphite-tooth",
    defaultSizePx: 10, spacingRatio: 0.11, hardness01: 0.82, opacity01: 0.62,
    pressureSizeRange: [0.24, 1.12], pressureOpacityRange: [0.14, 0.68], pressureGamma: 0.92,
    tiltExpandMax: 1.75, taperStart01: 0.72, taperEnd01: 0.78, stabilizerLevel: 30,
    paperToothStrength01: 0.66, bristleCount: 8, bristleAnisotropy: 1.56,
    wetEdgeDarkening01: 0, impastoRidge01: 0, colorMixStrength01: 0.04, scatterDensity01: 0.22,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.50 0.02 255)", previewInkRgb: [96, 102, 112],
    tags: ["연필", "연한 연필", "HB", "밑그림", "lighter-pencil"],
  }),
  defineBrush({
    id: "csp-real-pencil", category: "pencil", nameKo: "리얼 연필", nameEn: "Real Pencil",
    summaryKo: "황목 종이 산봉우리만 거칠게 긁고 지나가는 진짜 흑연 가루 질감",
    paperGrain: "cold-press-rough", textureKernel: "graphite-tooth",
    defaultSizePx: 15, spacingRatio: 0.11, hardness01: 0.68, opacity01: 0.86,
    pressureSizeRange: [0.26, 1.28], pressureOpacityRange: [0.18, 0.9], pressureGamma: 0.82,
    tiltExpandMax: 2.25, taperStart01: 0.62, taperEnd01: 0.7, stabilizerLevel: 22,
    paperToothStrength01: 0.92, bristleCount: 14, bristleAnisotropy: 1.96,
    wetEdgeDarkening01: 0, impastoRidge01: 0.08, colorMixStrength01: 0.06, scatterDensity01: 0.48,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.36 0.02 248)", previewInkRgb: [64, 67, 74],
    tags: ["연필", "리얼 연필", "흑연", "종이 결", "real-pencil"],
  }),
  defineBrush({
    id: "csp-design-pencil", category: "pencil", nameKo: "디자인 연필", nameEn: "Design Pencil",
    summaryKo: "펜을 눕힐수록 심 옆면이 넓게 펼쳐져 부드럽게 명암을 까는 틸트 쉐이딩 연필",
    paperGrain: "cold-press-rough", textureKernel: "graphite-tooth",
    defaultSizePx: 20, spacingRatio: 0.12, hardness01: 0.62, opacity01: 0.84,
    pressureSizeRange: [0.34, 1.36], pressureOpacityRange: [0.2, 0.88], pressureGamma: 0.8,
    tiltExpandMax: 2.75, taperStart01: 0.52, taperEnd01: 0.58, stabilizerLevel: 24,
    paperToothStrength01: 0.86, bristleCount: 16, bristleAnisotropy: 2.18,
    wetEdgeDarkening01: 0, impastoRidge01: 0.06, colorMixStrength01: 0.12, scatterDensity01: 0.36,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.38 0.03 240)", previewInkRgb: [68, 74, 84],
    tags: ["연필", "디자인 연필", "틸트", "쉐이딩", "design-pencil"],
  }),

  // 3. 파스텔·크레용 (Pastel & Crayon, 4종)
  defineBrush({
    id: "csp-wax-crayon", category: "pastel-crayon", nameKo: "왁스 크레용", nameEn: "Wax Crayon",
    summaryKo: "2옥타브 황목 산/골 씹힘·저필압 갈필 스킵·외곽 왁스 부스러기를 재현한 크레용",
    paperGrain: "cold-press-rough", textureKernel: "wax-crayon",
    defaultSizePx: 28, spacingRatio: 0.11, hardness01: 0.72, opacity01: 0.94,
    pressureSizeRange: [0.36, 1.38], pressureOpacityRange: [0.22, 0.98], pressureGamma: 0.84,
    tiltExpandMax: 1.92, taperStart01: 0.44, taperEnd01: 0.56, stabilizerLevel: 24,
    paperToothStrength01: 0.96, bristleCount: 18, bristleAnisotropy: 2.35,
    wetEdgeDarkening01: 0, impastoRidge01: 0.38, colorMixStrength01: 0.22, scatterDensity01: 0.88,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.56 0.18 32)", previewInkRgb: [198, 78, 52],
    tags: ["크레용", "왁스", "파스텔", "산골 씹힘", "wax-crayon"],
  }),
  defineBrush({
    id: "csp-oil-pastel", category: "pastel-crayon", nameKo: "오일 파스텔", nameEn: "Oil Pastel",
    summaryKo: "꾸덕한 유성 안료가 두텁게 밀리며 아래 색과 진하게 섞이는 오일 파스텔",
    paperGrain: "cold-press-rough", textureKernel: "oil-pastel",
    defaultSizePx: 30, spacingRatio: 0.1, hardness01: 0.76, opacity01: 0.96,
    pressureSizeRange: [0.42, 1.36], pressureOpacityRange: [0.34, 0.98], pressureGamma: 0.82,
    tiltExpandMax: 1.98, taperStart01: 0.38, taperEnd01: 0.48, stabilizerLevel: 28,
    paperToothStrength01: 0.82, bristleCount: 20, bristleAnisotropy: 2.12,
    wetEdgeDarkening01: 0.04, impastoRidge01: 0.66, colorMixStrength01: 0.62, scatterDensity01: 0.52,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.64 0.17 62)", previewInkRgb: [212, 134, 42],
    tags: ["파스텔", "오일 파스텔", "꾸덕한 혼색", "oil-pastel"],
  }),
  defineBrush({
    id: "csp-chalk", category: "pastel-crayon", nameKo: "분필", nameEn: "Chalk",
    summaryKo: "건조 다공질 분말이 거칠게 흩뿌려지고 칠판·황목 결을 선명하게 드러내는 초크",
    paperGrain: "cold-press-rough", textureKernel: "chalk-powder",
    defaultSizePx: 26, spacingRatio: 0.12, hardness01: 0.64, opacity01: 0.88,
    pressureSizeRange: [0.38, 1.34], pressureOpacityRange: [0.22, 0.94], pressureGamma: 0.8,
    tiltExpandMax: 1.94, taperStart01: 0.42, taperEnd01: 0.52, stabilizerLevel: 24,
    paperToothStrength01: 0.94, bristleCount: 14, bristleAnisotropy: 1.78,
    wetEdgeDarkening01: 0, impastoRidge01: 0.18, colorMixStrength01: 0.16, scatterDensity01: 0.82,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.62 0.12 204)", previewInkRgb: [86, 152, 168],
    tags: ["분필", "초크", "건식 파스텔", "chalk"],
  }),
  defineBrush({
    id: "csp-charcoal", category: "pastel-crayon", nameKo: "목탄", nameEn: "Charcoal",
    summaryKo: "고주파 흑탄 가루 입자와 깊은 벨벳 명암 대비를 만드는 소묘 목탄",
    paperGrain: "cold-press-rough", textureKernel: "charcoal-grit",
    defaultSizePx: 32, spacingRatio: 0.12, hardness01: 0.58, opacity01: 0.92,
    pressureSizeRange: [0.34, 1.44], pressureOpacityRange: [0.2, 0.96], pressureGamma: 0.74,
    tiltExpandMax: 2.38, taperStart01: 0.46, taperEnd01: 0.56, stabilizerLevel: 20,
    paperToothStrength01: 0.95, bristleCount: 16, bristleAnisotropy: 2.04,
    wetEdgeDarkening01: 0, impastoRidge01: 0.14, colorMixStrength01: 0.3, scatterDensity01: 0.86,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.25 0.02 250)", previewInkRgb: [36, 38, 42],
    tags: ["목탄", "소묘", "건식", "charcoal"],
  }),

  // 4. 수채 (Watercolor, 4종)
  defineBrush({
    id: "csp-transparent-wc", category: "watercolor", nameKo: "투명 수채", nameEn: "Transparent Watercolor",
    summaryKo: "맑은 중첩 발색과 건조 경계에 안료가 모이는 물 번짐 엣지 다크닝 수채",
    paperGrain: "cold-press-medium", textureKernel: "watercolor-wash",
    defaultSizePx: 36, spacingRatio: 0.095, hardness01: 0.46, opacity01: 0.68,
    pressureSizeRange: [0.36, 1.32], pressureOpacityRange: [0.18, 0.78], pressureGamma: 0.88,
    tiltExpandMax: 1.64, taperStart01: 0.54, taperEnd01: 0.62, stabilizerLevel: 38,
    paperToothStrength01: 0.56, bristleCount: 10, bristleAnisotropy: 1.24,
    wetEdgeDarkening01: 0.82, impastoRidge01: 0.04, colorMixStrength01: 0.58, scatterDensity01: 0.18,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.58 0.15 224)", previewInkRgb: [56, 134, 186],
    tags: ["수채", "투명 수채", "물 번짐", "엣지 다크닝", "transparent-wc"],
  }),
  defineBrush({
    id: "csp-opaque-wc", category: "watercolor", nameKo: "불투명 수채", nameEn: "Opaque Watercolor",
    summaryKo: "밑색을 부드럽게 덮으면서도 수채 특유의 촉촉한 경계를 남기는 불투명 워시",
    paperGrain: "cold-press-medium", textureKernel: "watercolor-wash",
    defaultSizePx: 34, spacingRatio: 0.09, hardness01: 0.64, opacity01: 0.88,
    pressureSizeRange: [0.38, 1.28], pressureOpacityRange: [0.38, 0.92], pressureGamma: 0.86,
    tiltExpandMax: 1.54, taperStart01: 0.48, taperEnd01: 0.56, stabilizerLevel: 36,
    paperToothStrength01: 0.48, bristleCount: 14, bristleAnisotropy: 1.38,
    wetEdgeDarkening01: 0.48, impastoRidge01: 0.16, colorMixStrength01: 0.52, scatterDensity01: 0.14,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.60 0.14 172)", previewInkRgb: [54, 148, 128],
    tags: ["수채", "불투명 수채", "포스터", "opaque-wc"],
  }),
  defineBrush({
    id: "csp-dense-wc", category: "watercolor", nameKo: "진한 수채", nameEn: "Dense Watercolor",
    summaryKo: "안료 농도가 진하고 과립 침전과 어두운 물 테두리가 또렷한 깊이 채색 수채",
    paperGrain: "cold-press-rough", textureKernel: "watercolor-wash",
    defaultSizePx: 32, spacingRatio: 0.09, hardness01: 0.54, opacity01: 0.84,
    pressureSizeRange: [0.34, 1.3], pressureOpacityRange: [0.28, 0.9], pressureGamma: 0.84,
    tiltExpandMax: 1.62, taperStart01: 0.52, taperEnd01: 0.6, stabilizerLevel: 38,
    paperToothStrength01: 0.68, bristleCount: 12, bristleAnisotropy: 1.32,
    wetEdgeDarkening01: 0.88, impastoRidge01: 0.08, colorMixStrength01: 0.66, scatterDensity01: 0.22,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.48 0.16 266)", previewInkRgb: [68, 86, 178],
    tags: ["수채", "진한 수채", "안료 침전", "dense-wc"],
  }),
  defineBrush({
    id: "csp-watery-brush", category: "watercolor", nameKo: "물 많은 붓", nameEn: "Watery Brush",
    summaryKo: "젖은 수채지 위에서 물기가 꽃잎처럼 밀려나며 백런 블룸을 만드는 습식 붓",
    paperGrain: "cold-press-medium", textureKernel: "watercolor-bloom",
    defaultSizePx: 44, spacingRatio: 0.105, hardness01: 0.34, opacity01: 0.56,
    pressureSizeRange: [0.4, 1.4], pressureOpacityRange: [0.14, 0.68], pressureGamma: 0.9,
    tiltExpandMax: 1.78, taperStart01: 0.5, taperEnd01: 0.58, stabilizerLevel: 42,
    paperToothStrength01: 0.62, bristleCount: 8, bristleAnisotropy: 1.18,
    wetEdgeDarkening01: 0.96, impastoRidge01: 0.02, colorMixStrength01: 0.78, scatterDensity01: 0.28,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.62 0.15 200)", previewInkRgb: [58, 154, 176],
    tags: ["수채", "물 많은 붓", "백런", "블룸", "watery-brush"],
  }),

  // 5. 유화·두꺼운 채색 (Thick Paint / Oil, 4종)
  defineBrush({
    id: "csp-oil-paint", category: "thick-paint", nameKo: "유화 평붓", nameEn: "Oil Paint Flat Brush",
    summaryKo: "뻣뻣한 돈모 브리슬 자국과 두꺼운 임파스토 하이라이트 리지를 남기는 유화 평붓",
    paperGrain: "canvas-weave", textureKernel: "oil-impasto",
    defaultSizePx: 34, spacingRatio: 0.085, hardness01: 0.74, opacity01: 0.96,
    pressureSizeRange: [0.38, 1.34], pressureOpacityRange: [0.42, 0.98], pressureGamma: 0.88,
    tiltExpandMax: 1.84, taperStart01: 0.42, taperEnd01: 0.54, stabilizerLevel: 34,
    paperToothStrength01: 0.62, bristleCount: 34, bristleAnisotropy: 2.72,
    wetEdgeDarkening01: 0.08, impastoRidge01: 0.94, colorMixStrength01: 0.68, scatterDensity01: 0.14,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.54 0.17 24)", previewInkRgb: [188, 68, 48],
    tags: ["유화", "평붓", "임파스토", "브리슬", "oil-paint"],
  }),
  defineBrush({
    id: "csp-gouache", category: "thick-paint", nameKo: "과슈", nameEn: "Gouache",
    summaryKo: "불투명 매트 피복력과 잔잔한 붓결을 동시에 살리는 일러스트 과슈 붓",
    paperGrain: "cold-press-medium", textureKernel: "gouache-matte",
    defaultSizePx: 30, spacingRatio: 0.09, hardness01: 0.78, opacity01: 0.95,
    pressureSizeRange: [0.36, 1.28], pressureOpacityRange: [0.48, 0.98], pressureGamma: 0.9,
    tiltExpandMax: 1.66, taperStart01: 0.46, taperEnd01: 0.54, stabilizerLevel: 36,
    paperToothStrength01: 0.54, bristleCount: 24, bristleAnisotropy: 2.15,
    wetEdgeDarkening01: 0.18, impastoRidge01: 0.54, colorMixStrength01: 0.46, scatterDensity01: 0.12,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.58 0.14 142)", previewInkRgb: [72, 146, 94],
    tags: ["과슈", "두꺼운 채색", "매트", "gouache"],
  }),
  defineBrush({
    id: "csp-palette-knife", category: "thick-paint", nameKo: "팔레트 나이프", nameEn: "Palette Knife",
    summaryKo: "금속 칼날로 물감을 긁어 밀어내며 한쪽 턱에 두터운 물감 능선을 세우는 나이프",
    paperGrain: "canvas-weave", textureKernel: "palette-knife",
    defaultSizePx: 38, spacingRatio: 0.095, hardness01: 0.88, opacity01: 0.94,
    pressureSizeRange: [0.44, 1.38], pressureOpacityRange: [0.36, 0.98], pressureGamma: 0.86,
    tiltExpandMax: 2.45, taperStart01: 0.28, taperEnd01: 0.36, stabilizerLevel: 30,
    paperToothStrength01: 0.72, bristleCount: 28, bristleAnisotropy: 3.05,
    wetEdgeDarkening01: 0.06, impastoRidge01: 0.98, colorMixStrength01: 0.74, scatterDensity01: 0.2,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.66 0.16 74)", previewInkRgb: [212, 152, 54],
    tags: ["유화", "팔레트 나이프", "색 긁기", "임파스토", "palette-knife"],
  }),
  defineBrush({
    id: "csp-flat-oil-blender", category: "thick-paint", nameKo: "유화 혼색 평붓", nameEn: "Flat Oil Blender",
    summaryKo: "캔버스 위 물감을 붓모 스트릭 결을 유지한 채 부드럽게 끌고 섞는 유화 혼색 붓",
    paperGrain: "canvas-weave", textureKernel: "blend-painterly",
    defaultSizePx: 36, spacingRatio: 0.085, hardness01: 0.62, opacity01: 0.82,
    pressureSizeRange: [0.4, 1.32], pressureOpacityRange: [0.24, 0.88], pressureGamma: 0.86,
    tiltExpandMax: 1.9, taperStart01: 0.44, taperEnd01: 0.52, stabilizerLevel: 36,
    paperToothStrength01: 0.52, bristleCount: 30, bristleAnisotropy: 2.55,
    wetEdgeDarkening01: 0.05, impastoRidge01: 0.58, colorMixStrength01: 0.92, scatterDensity01: 0.1,
    ribbonRepeatMode: "none", operationMode: "blend",
    previewInkOklch: "oklch(0.56 0.13 48)", previewInkRgb: [168, 112, 68],
    tags: ["유화", "혼색 평붓", "색섞기", "flat-oil-blender"],
  }),

  // 6. 먹·동양화 붓 (India Ink / Sumi, 4종)
  defineBrush({
    id: "csp-dry-sumi", category: "india-ink", nameKo: "갈필 먹붓", nameEn: "Dry Sumi Brush",
    summaryKo: "한지 섬유 위에서 붓모가 갈라지며 날카로운 비백 스트릭을 남기는 갈필 먹붓",
    paperGrain: "hanji-fiber", textureKernel: "sumi-dry-rake",
    defaultSizePx: 30, spacingRatio: 0.09, hardness01: 0.78, opacity01: 0.96,
    pressureSizeRange: [0.22, 1.42], pressureOpacityRange: [0.28, 0.98], pressureGamma: 0.8,
    tiltExpandMax: 2.25, taperStart01: 0.78, taperEnd01: 0.86, stabilizerLevel: 30,
    paperToothStrength01: 0.9, bristleCount: 38, bristleAnisotropy: 3.35,
    wetEdgeDarkening01: 0.1, impastoRidge01: 0.16, colorMixStrength01: 0.12, scatterDensity01: 0.54,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.22 0.02 255)", previewInkRgb: [24, 26, 30],
    tags: ["먹붓", "갈필", "비백", "동양화", "dry-sumi"],
  }),
  defineBrush({
    id: "csp-wet-sumi", category: "india-ink", nameKo: "번짐 먹붓", nameEn: "Wet Sumi Brush",
    summaryKo: "화선지 섬유를 따라 먹물이 촉촉하게 스며들며 농담 테두리가 번지는 수묵 붓",
    paperGrain: "hanji-fiber", textureKernel: "sumi-wet-bleed",
    defaultSizePx: 34, spacingRatio: 0.09, hardness01: 0.42, opacity01: 0.84,
    pressureSizeRange: [0.3, 1.44], pressureOpacityRange: [0.22, 0.9], pressureGamma: 0.84,
    tiltExpandMax: 2.0, taperStart01: 0.7, taperEnd01: 0.78, stabilizerLevel: 36,
    paperToothStrength01: 0.64, bristleCount: 22, bristleAnisotropy: 1.72,
    wetEdgeDarkening01: 0.76, impastoRidge01: 0.04, colorMixStrength01: 0.64, scatterDensity01: 0.24,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.28 0.02 250)", previewInkRgb: [40, 44, 50],
    tags: ["먹붓", "번짐", "화선지", "수묵", "wet-sumi"],
  }),
  defineBrush({
    id: "csp-rough-wash", category: "india-ink", nameKo: "거친 먹 워시", nameEn: "Rough Sumi Wash",
    summaryKo: "탄소 그을음 입자가 한지 요철에 거칠게 가라앉는 수묵 배경·산수 워시",
    paperGrain: "hanji-fiber", textureKernel: "sumi-wet-bleed",
    defaultSizePx: 42, spacingRatio: 0.105, hardness01: 0.48, opacity01: 0.74,
    pressureSizeRange: [0.38, 1.4], pressureOpacityRange: [0.18, 0.82], pressureGamma: 0.82,
    tiltExpandMax: 2.15, taperStart01: 0.5, taperEnd01: 0.62, stabilizerLevel: 30,
    paperToothStrength01: 0.86, bristleCount: 26, bristleAnisotropy: 2.2,
    wetEdgeDarkening01: 0.62, impastoRidge01: 0.08, colorMixStrength01: 0.5, scatterDensity01: 0.46,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.36 0.02 248)", previewInkRgb: [62, 66, 72],
    tags: ["먹붓", "거친 먹 워시", "산수", "rough-wash"],
  }),
  defineBrush({
    id: "csp-calligraphy-fude", category: "india-ink", nameKo: "서예 붓펜", nameEn: "Calligraphy Fude Pen",
    summaryKo: "기필과 수필의 강약 탄성이 극대화되어 효과음·캘리그라피에 쓰이는 서예 붓펜",
    paperGrain: "hanji-fiber", textureKernel: "sumi-dry-rake",
    defaultSizePx: 24, spacingRatio: 0.065, hardness01: 0.9, opacity01: 0.99,
    pressureSizeRange: [0.1, 1.48], pressureOpacityRange: [0.68, 1], pressureGamma: 0.94,
    tiltExpandMax: 1.85, taperStart01: 0.94, taperEnd01: 0.96, stabilizerLevel: 48,
    paperToothStrength01: 0.36, bristleCount: 24, bristleAnisotropy: 2.48,
    wetEdgeDarkening01: 0.14, impastoRidge01: 0.06, colorMixStrength01: 0.08, scatterDensity01: 0.16,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.20 0.02 260)", previewInkRgb: [18, 20, 26],
    tags: ["먹붓", "서예", "붓펜", "효과음", "calligraphy-fude"],
  }),

  // 7. 에어브러시 (Airbrush, 3종)
  defineBrush({
    id: "csp-soft-airbrush", category: "airbrush", nameKo: "부드러운 에어브러시", nameEn: "Soft Airbrush",
    summaryKo: "경계 계단 현상 없이 피부 홍조·대기광·그라데이션을 부드럽게 분사하는 안개 붓",
    paperGrain: "none", textureKernel: "airbrush-mist",
    defaultSizePx: 64, spacingRatio: 0.12, hardness01: 0.12, opacity01: 0.64,
    pressureSizeRange: [0.46, 1.32], pressureOpacityRange: [0.12, 0.76], pressureGamma: 0.92,
    tiltExpandMax: 1.48, taperStart01: 0.4, taperEnd01: 0.44, stabilizerLevel: 34,
    paperToothStrength01: 0.06, bristleCount: 0, bristleAnisotropy: 1.05,
    wetEdgeDarkening01: 0, impastoRidge01: 0, colorMixStrength01: 0.18, scatterDensity01: 0.24,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.66 0.16 14)", previewInkRgb: [224, 118, 126],
    tags: ["에어브러시", "부드러운", "홍조", "그라데이션", "soft-airbrush"],
  }),
  defineBrush({
    id: "csp-hard-airbrush", category: "airbrush", nameKo: "단단한 에어브러시", nameEn: "Hard Airbrush",
    summaryKo: "중심 코어 밀도가 높고 외곽이 깔끔하게 떨어지는 셀 채색 광원·림라이트용 에어브러시",
    paperGrain: "none", textureKernel: "airbrush-mist",
    defaultSizePx: 48, spacingRatio: 0.1, hardness01: 0.28, opacity01: 0.88,
    pressureSizeRange: [0.42, 1.28], pressureOpacityRange: [0.24, 0.94], pressureGamma: 0.9,
    tiltExpandMax: 1.36, taperStart01: 0.44, taperEnd01: 0.48, stabilizerLevel: 38,
    paperToothStrength01: 0.08, bristleCount: 0, bristleAnisotropy: 1.08,
    wetEdgeDarkening01: 0, impastoRidge01: 0, colorMixStrength01: 0.12, scatterDensity01: 0.16,
    ribbonRepeatMode: "none", operationMode: "paint",
    previewInkOklch: "oklch(0.62 0.16 244)", previewInkRgb: [68, 132, 224],
    tags: ["에어브러시", "단단한", "림라이트", "hard-airbrush"],
  }),
  defineBrush({
    id: "csp-tone-scraping", category: "airbrush", nameKo: "톤 깎기", nameEn: "Tone Scraping",
    summaryKo: "만화 스크린톤과 그림자를 미세 입자·사선 스크래치로 깎아내는 아날로그 톤 커터",
    paperGrain: "smooth-kent", textureKernel: "tone-scrape",
    defaultSizePx: 36, spacingRatio: 0.16, hardness01: 0.84, opacity01: 0.9,
    pressureSizeRange: [0.38, 1.32], pressureOpacityRange: [0.22, 0.92], pressureGamma: 0.88,
    tiltExpandMax: 1.56, taperStart01: 0.56, taperEnd01: 0.64, stabilizerLevel: 26,
    paperToothStrength01: 0.42, bristleCount: 16, bristleAnisotropy: 2.1,
    wetEdgeDarkening01: 0, impastoRidge01: 0, colorMixStrength01: 0, scatterDensity01: 0.94,
    ribbonRepeatMode: "none", operationMode: "erase",
    previewInkOklch: "oklch(0.50 0.04 252)", previewInkRgb: [94, 102, 118],
    tags: ["에어브러시", "톤 깎기", "스크래치", "스크린톤", "tone-scraping"],
  }),

  // 8. 데코레이션·웹툰 패턴 (Decoration, 4종)
  defineBrush({
    id: "csp-rofan-lace-frill", category: "decoration", nameKo: "로판 레이스·프릴 리본", nameEn: "Rofan Lace & Frill Ribbon",
    summaryKo: "획 경로를 따라 스캘럽 아치·아일릿 구멍·자수 리브를 연속 생성하는 의상 리본 브러시",
    paperGrain: "none", textureKernel: "decor-lace",
    defaultSizePx: 42, spacingRatio: 0.24, hardness01: 0.94, opacity01: 0.98,
    pressureSizeRange: [0.58, 1.24], pressureOpacityRange: [0.76, 1], pressureGamma: 0.92,
    tiltExpandMax: 1.22, taperStart01: 0.18, taperEnd01: 0.18, stabilizerLevel: 54,
    paperToothStrength01: 0.08, bristleCount: 0, bristleAnisotropy: 1.68,
    wetEdgeDarkening01: 0.16, impastoRidge01: 0.24, colorMixStrength01: 0, scatterDensity01: 0.42,
    ribbonRepeatMode: "scallop-lace", operationMode: "paint",
    previewInkOklch: "oklch(0.62 0.16 346)", previewInkRgb: [198, 92, 138],
    tags: ["데코레이션", "로판", "레이스", "프릴", "리본", "rofan-lace-frill"],
  }),
  defineBrush({
    id: "csp-sakura-petals", category: "decoration", nameKo: "벚꽃·장미 꽃잎 산포", nameEn: "Sakura & Rose Petals",
    summaryKo: "회전 각도와 원근 크기가 자연스럽게 흩날리는 웹툰 감정 연출용 꽃잎 산포 브러시",
    paperGrain: "none", textureKernel: "decor-petals",
    defaultSizePx: 48, spacingRatio: 0.34, hardness01: 0.88, opacity01: 0.94,
    pressureSizeRange: [0.48, 1.38], pressureOpacityRange: [0.54, 0.98], pressureGamma: 0.9,
    tiltExpandMax: 1.44, taperStart01: 0.24, taperEnd01: 0.28, stabilizerLevel: 28,
    paperToothStrength01: 0.06, bristleCount: 0, bristleAnisotropy: 1.32,
    wetEdgeDarkening01: 0.2, impastoRidge01: 0.1, colorMixStrength01: 0.16, scatterDensity01: 0.94,
    ribbonRepeatMode: "petal-scatter", operationMode: "paint",
    previewInkOklch: "oklch(0.70 0.15 354)", previewInkRgb: [232, 132, 162],
    tags: ["데코레이션", "벚꽃", "장미", "꽃잎", "산포", "sakura-petals"],
  }),
  defineBrush({
    id: "csp-sparkle-starlight", category: "decoration", nameKo: "웹툰 반짝이·별빛", nameEn: "Webtoon Sparkle Starlight",
    summaryKo: "4각·8각 광선 플레어와 미세 성운 가루를 한 번에 흩뿌리는 웹툰 하이라이트 브러시",
    paperGrain: "none", textureKernel: "decor-sparkle",
    defaultSizePx: 46, spacingRatio: 0.38, hardness01: 0.92, opacity01: 0.98,
    pressureSizeRange: [0.42, 1.42], pressureOpacityRange: [0.58, 1], pressureGamma: 0.88,
    tiltExpandMax: 1.3, taperStart01: 0.2, taperEnd01: 0.22, stabilizerLevel: 26,
    paperToothStrength01: 0, bristleCount: 0, bristleAnisotropy: 1.45,
    wetEdgeDarkening01: 0, impastoRidge01: 0.32, colorMixStrength01: 0, scatterDensity01: 0.96,
    ribbonRepeatMode: "starlight-burst", operationMode: "paint",
    previewInkOklch: "oklch(0.76 0.16 86)", previewInkRgb: [236, 186, 52],
    tags: ["데코레이션", "반짝이", "별빛", "웹툰 효과", "sparkle-starlight"],
  }),
  defineBrush({
    id: "csp-chain-foliage", category: "decoration", nameKo: "사슬·덩굴 패턴", nameEn: "Chain & Foliage Ribbon",
    summaryKo: "진행 각도를 따라 교차 사슬 고리와 덩굴 잎맥을 끊김 없이 이어 붙이는 패턴 리본",
    paperGrain: "none", textureKernel: "decor-chain",
    defaultSizePx: 38, spacingRatio: 0.26, hardness01: 0.94, opacity01: 0.98,
    pressureSizeRange: [0.54, 1.28], pressureOpacityRange: [0.78, 1], pressureGamma: 0.94,
    tiltExpandMax: 1.2, taperStart01: 0.2, taperEnd01: 0.2, stabilizerLevel: 50,
    paperToothStrength01: 0.1, bristleCount: 0, bristleAnisotropy: 1.88,
    wetEdgeDarkening01: 0.12, impastoRidge01: 0.36, colorMixStrength01: 0, scatterDensity01: 0.56,
    ribbonRepeatMode: "chain-vine", operationMode: "paint",
    previewInkOklch: "oklch(0.56 0.14 148)", previewInkRgb: [62, 138, 86],
    tags: ["데코레이션", "사슬", "덩굴", "패턴", "chain-foliage"],
  }),

  // 9. 지우개·혼색 블렌더 (Eraser & Blend, 4종)
  defineBrush({
    id: "csp-kneaded-eraser", category: "eraser-blend", nameKo: "떡지우개", nameEn: "Kneaded Eraser",
    summaryKo: "연필·목탄 명암을 완전히 지우지 않고 종이 결대로 부드럽게 들어 올려 밝히는 지우개",
    paperGrain: "cold-press-medium", textureKernel: "eraser-kneaded",
    defaultSizePx: 32, spacingRatio: 0.1, hardness01: 0.38, opacity01: 0.62,
    pressureSizeRange: [0.42, 1.34], pressureOpacityRange: [0.16, 0.72], pressureGamma: 0.86,
    tiltExpandMax: 1.72, taperStart01: 0.4, taperEnd01: 0.46, stabilizerLevel: 32,
    paperToothStrength01: 0.64, bristleCount: 0, bristleAnisotropy: 1.22,
    wetEdgeDarkening01: 0, impastoRidge01: 0.12, colorMixStrength01: 0.18, scatterDensity01: 0.24,
    ribbonRepeatMode: "none", operationMode: "erase",
    previewInkOklch: "oklch(0.72 0.04 248)", previewInkRgb: [164, 172, 184],
    tags: ["지우개", "떡지우개", "밝힘", "하이라이트", "kneaded-eraser"],
  }),
  defineBrush({
    id: "csp-vector-intersect-eraser", category: "eraser-blend", nameKo: "벡터 교차점 지우개", nameEn: "Vector Intersect Eraser",
    summaryKo: "선화 교차 지점까지 튀어나온 잉크 꼬리를 1픽셀 오차 없이 끊어내는 정밀 벡터 지우개",
    paperGrain: "none", textureKernel: "eraser-vector",
    defaultSizePx: 18, spacingRatio: 0.07, hardness01: 0.99, opacity01: 1,
    pressureSizeRange: [0.65, 1.15], pressureOpacityRange: [0.96, 1], pressureGamma: 1,
    tiltExpandMax: 1.05, taperStart01: 0.1, taperEnd01: 0.1, stabilizerLevel: 58,
    paperToothStrength01: 0, bristleCount: 0, bristleAnisotropy: 1.02,
    wetEdgeDarkening01: 0, impastoRidge01: 0, colorMixStrength01: 0, scatterDensity01: 0,
    ribbonRepeatMode: "none", operationMode: "vector-erase",
    previewInkOklch: "oklch(0.58 0.15 26)", previewInkRgb: [204, 88, 74],
    tags: ["지우개", "벡터", "교차점", "선화 정리", "vector-intersect-eraser"],
  }),
  defineBrush({
    id: "csp-fingertip-smudge", category: "eraser-blend", nameKo: "손가락 문지르기", nameEn: "Fingertip Smudge",
    summaryKo: "진행 방향으로 안료를 부드럽게 끌어당기며 파스텔·피부 음영 경계를 문지르는 도구",
    paperGrain: "cold-press-medium", textureKernel: "blend-smudge",
    defaultSizePx: 30, spacingRatio: 0.085, hardness01: 0.44, opacity01: 0.84,
    pressureSizeRange: [0.38, 1.32], pressureOpacityRange: [0.24, 0.9], pressureGamma: 0.88,
    tiltExpandMax: 1.65, taperStart01: 0.42, taperEnd01: 0.56, stabilizerLevel: 34,
    paperToothStrength01: 0.32, bristleCount: 12, bristleAnisotropy: 1.92,
    wetEdgeDarkening01: 0.04, impastoRidge01: 0.14, colorMixStrength01: 0.94, scatterDensity01: 0.08,
    ribbonRepeatMode: "none", operationMode: "blend",
    previewInkOklch: "oklch(0.62 0.11 190)", previewInkRgb: [78, 146, 152],
    tags: ["혼색", "블렌더", "손가락", "문지르기", "fingertip-smudge"],
  }),
  defineBrush({
    id: "csp-painterly-blender", category: "eraser-blend", nameKo: "유화 색섞기 블렌더", nameEn: "Painterly Color Blender",
    summaryKo: "붓모 결을 지우지 않고 두 가지 색 경계를 회화적으로 융합하는 브리슬 블렌더",
    paperGrain: "canvas-weave", textureKernel: "blend-painterly",
    defaultSizePx: 34, spacingRatio: 0.085, hardness01: 0.58, opacity01: 0.88,
    pressureSizeRange: [0.36, 1.34], pressureOpacityRange: [0.28, 0.92], pressureGamma: 0.86,
    tiltExpandMax: 1.88, taperStart01: 0.46, taperEnd01: 0.54, stabilizerLevel: 36,
    paperToothStrength01: 0.56, bristleCount: 32, bristleAnisotropy: 2.64,
    wetEdgeDarkening01: 0.06, impastoRidge01: 0.52, colorMixStrength01: 0.96, scatterDensity01: 0.12,
    ribbonRepeatMode: "none", operationMode: "blend",
    previewInkOklch: "oklch(0.58 0.14 156)", previewInkRgb: [68, 148, 110],
    tags: ["혼색", "블렌더", "유화 색섞기", "회화", "painterly-blender"],
  }),
]);

const BRUSH_BY_ID: ReadonlyMap<string, CspProBrushSpec> = new Map(
  CSP_ALL_36_BRUSH_CATALOG.map((brush) => [brush.id, brush]),
);

export function getCspBrushById(id: string): CspProBrushSpec | undefined {
  return BRUSH_BY_ID.get(id);
}

function normalizeSearchToken(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim();
}

export function filterCspBrushes(
  category: CspBrushCategoryFilter,
  rawQuery: string,
): readonly CspProBrushSpec[] {
  const tokens = normalizeSearchToken(rawQuery).split(/\s+/).filter(Boolean);
  return CSP_ALL_36_BRUSH_CATALOG.filter((brush) => {
    if (category !== "all" && brush.category !== category) return false;
    if (tokens.length === 0) return true;
    const haystack = normalizeSearchToken(
      `${brush.id} ${brush.nameKo} ${brush.nameEn} ${brush.summaryKo} ${brush.paperGrainLabelKo} ${brush.tags.join(" ")}`,
    );
    return tokens.every((token) => haystack.includes(token));
  });
}
