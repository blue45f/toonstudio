/**
 * 12대 브러시 매체별 물리 렌더링 전략 정본, 실시간 안료·수분 갈필 고갈 모델,
 * 붓모 방향 관성 및 종이 마찰 손떨림 감쇠 필터.
 */

export const BRUSH_MEDIA_CATEGORY_IDS = [
  "pencil", "crayon", "charcoal", "pastel", "gpen-ink", "watercolor",
  "oil-impasto", "acrylic-gouache", "marker", "airbrush", "blending-stump", "kneaded-eraser",
] as const;

export type BrushMediaCategoryId = (typeof BRUSH_MEDIA_CATEGORY_IDS)[number];
export type BrushPaperGrainPresetId =
  | "smooth-kent" | "sketchbook-tooth" | "cold-press-medium"
  | "cold-press-rough" | "rough-cotton" | "linen-canvas";
export type BrushGrainTransferMode = "none" | "fixed-world" | "rolling-tip";
export type BrushOperationKind = "paint" | "smudge" | "erase";

/** 10차원 정규화 물리 특징 벡터(전 축 0..1). */
export interface BrushPhysicalFeatureVector {
  readonly toothContrast: number;
  readonly edgeRoughness: number;
  readonly edgeSharpness: number;
  readonly wetBleed: number;
  readonly impastoHeight: number;
  readonly opacityCoverage: number;
  readonly multiplyStacking: number;
  readonly smudgePickup: number;
  readonly liftStrength: number;
  readonly bristleSpread: number;
}

export const BRUSH_FEATURE_KEYS: readonly (keyof BrushPhysicalFeatureVector)[] = Object.freeze([
  "toothContrast", "edgeRoughness", "edgeSharpness", "wetBleed", "impastoHeight",
  "opacityCoverage", "multiplyStacking", "smudgePickup", "liftStrength", "bristleSpread",
]);

export interface FeatureNumericRange { readonly min: number; readonly max: number; }
export type BrushFeatureBounds = Readonly<Partial<Record<keyof BrushPhysicalFeatureVector, FeatureNumericRange>>>;

export interface BrushDryoutProfile {
  readonly initialPaintLoad01: number;
  readonly initialMoistureLoad01: number;
  readonly paintDepletionPer1000Px: number;
  readonly moistureEvapPer1000Px: number;
  readonly drySplitThreshold01: number;
  readonly minFloorPaint01: number;
}

export interface BrushInertiaProfile {
  readonly angularStiffness01: number;
  readonly angularDamping01: number;
  readonly fixedAngleLock01: number;
  readonly lockedAngleDeg: number;
  readonly paperFrictionDamp01: number;
  readonly basePositionAlpha01: number;
}

export interface BrushCategoryPhysicalStrategy {
  readonly id: BrushMediaCategoryId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly operation: BrushOperationKind;
  readonly paperGrainPreset: BrushPaperGrainPresetId;
  readonly grainMode: BrushGrainTransferMode;
  readonly defaultBristleCount: number;
  readonly tipAspectRatio: number;
  readonly tipAngleDeg: number;
  readonly tiltThresholdDeg: number;
  readonly tiltWidthGain: number;
  readonly velocityTaper01: number;
  readonly waxResistRepulsion01: number;
  readonly kmOpticalMix01: number;
  readonly sobelReliefLighting01: number;
  readonly wetEdgeBackrunRing01: number;
  readonly gaussianFalloff01: number;
  readonly peakFirstLift01: number;
  readonly targetFeatures: BrushPhysicalFeatureVector;
  readonly expectedBounds: BrushFeatureBounds;
  readonly dryout: BrushDryoutProfile;
  readonly inertia: BrushInertiaProfile;
  readonly signatureMechanismsKo: readonly string[];
  readonly csp200AdvantageKo: string;
}

type FeatureTuple = readonly [
  toothContrast: number, edgeRoughness: number, edgeSharpness: number, wetBleed: number,
  impastoHeight: number, opacityCoverage: number, multiplyStacking: number,
  smudgePickup: number, liftStrength: number, bristleSpread: number,
];
type DryoutTuple = readonly [initPaint: number, initMoist: number, paintDep: number, moistEvap: number, splitThr: number, floor: number];
type InertiaTuple = readonly [stiff: number, damp: number, lock: number, lockDeg: number, friction: number, alpha: number];
type TipTuple = readonly [bristles: number, aspect: number, angleDeg: number, tiltDeg: number, tiltGain: number, velTaper: number];
type OpticalTuple = readonly [waxResist: number, kmMix: number, sobelRelief: number, wetRing: number, gaussFalloff: number, peakLift: number];

interface StrategyRowSpec {
  readonly id: BrushMediaCategoryId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly operation: BrushOperationKind;
  readonly paperGrainPreset: BrushPaperGrainPresetId;
  readonly grainMode: BrushGrainTransferMode;
  readonly tip: TipTuple;
  readonly optical: OpticalTuple;
  readonly features: FeatureTuple;
  readonly bounds: BrushFeatureBounds;
  readonly dryout: DryoutTuple;
  readonly inertia: InertiaTuple;
  readonly mechanismsKo: readonly string[];
  readonly csp200AdvantageKo: string;
}

function buildStrategy(s: StrategyRowSpec): BrushCategoryPhysicalStrategy {
  const [bristles, aspect, angleDeg, tiltDeg, tiltGain, velTaper] = s.tip;
  const [waxResist, kmMix, sobelRelief, wetRing, gaussFalloff, peakLift] = s.optical;
  const [
    toothContrast, edgeRoughness, edgeSharpness, wetBleed, impastoHeight,
    opacityCoverage, multiplyStacking, smudgePickup, liftStrength, bristleSpread,
  ] = s.features;
  const [initP, initM, depP, evapM, splitThr, floorP] = s.dryout;
  const [stiff, damp, lock, lockDeg, friction, alpha] = s.inertia;
  return Object.freeze({
    id: s.id, labelKo: s.labelKo, labelEn: s.labelEn, operation: s.operation,
    paperGrainPreset: s.paperGrainPreset, grainMode: s.grainMode,
    defaultBristleCount: bristles, tipAspectRatio: aspect, tipAngleDeg: angleDeg,
    tiltThresholdDeg: tiltDeg, tiltWidthGain: tiltGain, velocityTaper01: velTaper,
    waxResistRepulsion01: waxResist, kmOpticalMix01: kmMix, sobelReliefLighting01: sobelRelief,
    wetEdgeBackrunRing01: wetRing, gaussianFalloff01: gaussFalloff, peakFirstLift01: peakLift,
    targetFeatures: Object.freeze({
      toothContrast, edgeRoughness, edgeSharpness, wetBleed, impastoHeight,
      opacityCoverage, multiplyStacking, smudgePickup, liftStrength, bristleSpread,
    }),
    expectedBounds: Object.freeze(s.bounds),
    dryout: Object.freeze({
      initialPaintLoad01: initP, initialMoistureLoad01: initM,
      paintDepletionPer1000Px: depP, moistureEvapPer1000Px: evapM,
      drySplitThreshold01: splitThr, minFloorPaint01: floorP,
    }),
    inertia: Object.freeze({
      angularStiffness01: stiff, angularDamping01: damp, fixedAngleLock01: lock,
      lockedAngleDeg: lockDeg, paperFrictionDamp01: friction, basePositionAlpha01: alpha,
    }),
    signatureMechanismsKo: Object.freeze(s.mechanismsKo),
    csp200AdvantageKo: s.csp200AdvantageKo,
  });
}

export const BRUSH_CATEGORY_PHYSICAL_STRATEGIES: Readonly<
  Record<BrushMediaCategoryId, BrushCategoryPhysicalStrategy>
> = Object.freeze({
  pencil: buildStrategy({
    id: "pencil", labelKo: "흑연 연필", labelEn: "Graphite Pencil",
    operation: "paint", paperGrainPreset: "sketchbook-tooth", grainMode: "fixed-world",
    tip: [1, 0.72, -28, 28, 2.35, 0.28], optical: [0, 0.12, 0.04, 0, 0.18, 0],
    features: [0.74, 0.44, 0.56, 0, 0, 0.72, 0.46, 0.08, 0, 0.12],
    bounds: {
      toothContrast: { min: 0.25, max: 1 }, edgeSharpness: { min: 0.25, max: 0.92 },
      wetBleed: { min: 0, max: 0.14 }, impastoHeight: { min: 0, max: 0.16 }, liftStrength: { min: 0, max: 0.05 },
    },
    dryout: [1, 0.02, 0.22, 0.5, 0.65, 0.48], inertia: [0.68, 0.84, 0.35, -28, 0.58, 0.62],
    mechanismsKo: [
      "종이 봉우리 우선 흑연 포착(Fixed-World Tooth)",
      "28° 스타일러스 기울기 사이드 셰이딩 타원 확장",
      "고주파 흑연 입자 분포와 필압 비례 공극 충전",
    ],
    csp200AdvantageKo: "월드 고정 이중 주파수 종이 봉우리 포착과 28° 틸트 면음영을 1패스 연산으로 결합해 격자 반복 없이 4B/6B 흑연 결을 재현한다.",
  }),
  crayon: buildStrategy({
    id: "crayon", labelKo: "크레파스·오일파스텔", labelEn: "Wax Crayon & Oil Pastel",
    operation: "paint", paperGrainPreset: "cold-press-rough", grainMode: "fixed-world",
    tip: [1, 0.66, -18, 32, 1.85, 0.12], optical: [0.94, 0.28, 0.36, 0, 0.06, 0],
    features: [0.86, 0.78, 0.64, 0, 0.34, 0.91, 0.22, 0.16, 0, 0.22],
    bounds: {
      toothContrast: { min: 0.35, max: 1 }, edgeRoughness: { min: 0.3, max: 1 },
      wetBleed: { min: 0, max: 0.16 }, opacityCoverage: { min: 0.5, max: 1 },
    },
    dryout: [1, 0.05, 0.42, 0.3, 0.68, 0.28], inertia: [0.54, 0.86, 0.25, -18, 0.72, 0.56],
    mechanismsKo: [
      "문턱값 왁스 리지(골짜기 흰 종이 공극 보존)",
      "외곽 왁스 크럼 파편 산란",
      "수채 덧칠을 튕겨내는 왁스 레지스트 발수 마스크",
    ],
    csp200AdvantageKo: "문턱값 왁스 리지·외곽 왁스 크럼·수채 발수 마스크를 일체화해 실물 크레파스 압착감을 만든다.",
  }),
  charcoal: buildStrategy({
    id: "charcoal", labelKo: "목탄·콘테", labelEn: "Vine & Square Charcoal",
    operation: "paint", paperGrainPreset: "rough-cotton", grainMode: "rolling-tip",
    tip: [3, 0.46, -34, 24, 2.65, 0.34], optical: [0.08, 0.24, 0.08, 0, 0.32, 0],
    features: [0.92, 0.84, 0.38, 0.04, 0.05, 0.82, 0.52, 0.48, 0, 0.4],
    bounds: {
      toothContrast: { min: 0.35, max: 1 }, edgeRoughness: { min: 0.3, max: 1 },
      edgeSharpness: { min: 0.15, max: 0.84 }, wetBleed: { min: 0, max: 0.18 },
    },
    dryout: [1, 0, 0.62, 0.9, 0.72, 0.18], inertia: [0.48, 0.82, 0.42, -34, 0.78, 0.52],
    mechanismsKo: [
      "사각 각목탄 단면 파절 및 비대칭 모서리 날",
      "굵은 황목 코튼지 골 포착과 탄분 비산",
      "손가락·찰필 문지름에 민감한 스머지 반응성",
    ],
    csp200AdvantageKo: "한쪽 날은 칼처럼 끊기고 반대쪽은 탄분 안개로 풀리는 비대칭 사각 단면과 황목 마찰 감쇠를 구현했다.",
  }),
  pastel: buildStrategy({
    id: "pastel", labelKo: "소프트 파스텔", labelEn: "Soft Chalk Pastel",
    operation: "paint", paperGrainPreset: "cold-press-rough", grainMode: "rolling-tip",
    tip: [2, 0.62, -14, 26, 2.15, 0.18], optical: [0.12, 0.56, 0.06, 0, 0.54, 0],
    features: [0.68, 0.58, 0.26, 0.08, 0.06, 0.68, 0.3, 0.6, 0, 0.28],
    bounds: {
      toothContrast: { min: 0.25, max: 1 }, edgeSharpness: { min: 0.05, max: 0.78 },
      wetBleed: { min: 0, max: 0.22 },
    },
    dryout: [1, 0.04, 0.54, 0.6, 0.7, 0.22], inertia: [0.44, 0.85, 0.2, -14, 0.68, 0.54],
    mechanismsKo: [
      "다공성 분필 입자와 벨벳 외곽 확산",
      "붓 굴림(Rolling-Tip) 결 전이로 패턴 반복 제거",
      "부드러운 건식 분말 혼색과 겹침 채도 유지",
    ],
    csp200AdvantageKo: "고정 종이 결과 분리된 롤링 분필 입자 전이를 사용해 넓은 면을 문질러도 도장 타일감이 생기지 않는다.",
  }),
  "gpen-ink": buildStrategy({
    id: "gpen-ink", labelKo: "G펜·마루펜·만화 잉크", labelEn: "G-Pen & Manga Ink",
    operation: "paint", paperGrainPreset: "smooth-kent", grainMode: "none",
    tip: [1, 0.86, -12, 65, 1.08, 0.9], optical: [0, 0.02, 0, 0, 0.02, 0],
    features: [0.04, 0.05, 0.97, 0, 0, 1, 0.1, 0, 0, 0.04],
    bounds: {
      edgeSharpness: { min: 0.7, max: 1 }, wetBleed: { min: 0, max: 0.22 },
      opacityCoverage: { min: 0.72, max: 1 },
    },
    dryout: [1, 0.75, 0.16, 0.24, 0.42, 0.62], inertia: [0.92, 0.94, 0.1, -12, 0.22, 0.78],
    mechanismsKo: [
      "고대비 이진 에지 및 0% 번짐 켄트지 정착",
      "속도·필압 연동 탄성 인/아웃 테이퍼 끝빠짐",
      "고속 꺾임에서도 날이 살아있는 즉응 펜촉 추적",
    ],
    csp200AdvantageKo: "필압 감마와 속도 테이퍼를 92% 즉응 강성으로 묶어 빠른 웹툰 선화 꺾임에서도 끝선이 뭉개지지 않는다.",
  }),
  watercolor: buildStrategy({
    id: "watercolor", labelKo: "수채화", labelEn: "Capillary Watercolor",
    operation: "paint", paperGrainPreset: "cold-press-medium", grainMode: "fixed-world",
    tip: [4, 0.76, 0, 35, 1.45, 0.36], optical: [0, 0.92, 0, 0.88, 0.44, 0],
    features: [0.46, 0.34, 0.32, 0.88, 0, 0.46, 0.74, 0.34, 0, 0.32],
    bounds: {
      wetBleed: { min: 0.35, max: 1 }, impastoHeight: { min: 0, max: 0.22 },
      opacityCoverage: { min: 0.15, max: 0.85 },
    },
    dryout: [0.95, 1, 0.86, 1.05, 0.58, 0.1], inertia: [0.42, 0.88, 0, 0, 0.44, 0.58],
    mechanismsKo: [
      "종이 골짜기 모세관 스며들기 및 과립 침전",
      "건조 경계 안료 응집 웨트 엣지 백런 링",
      "쿠벨카-문크(KM) 분광 광학 혼색과 수분 고갈 갈필",
    ],
    csp200AdvantageKo: "모세관 골짜기 확산·웨트 엣지 백런·KM 분광 혼색·수분 고갈 갈필을 단일 파이프라인으로 통합했다.",
  }),
  "oil-impasto": buildStrategy({
    id: "oil-impasto", labelKo: "유화·임파스토", labelEn: "Oil & 48-Bristle Impasto",
    operation: "paint", paperGrainPreset: "linen-canvas", grainMode: "rolling-tip",
    tip: [48, 0.42, 0, 30, 1.55, 0.22], optical: [0, 0.86, 0.94, 0.08, 0.12, 0],
    features: [0.36, 0.48, 0.66, 0.18, 0.94, 0.96, 0.14, 0.72, 0, 0.96],
    bounds: { impastoHeight: { min: 0.25, max: 1 }, opacityCoverage: { min: 0.55, max: 1 } },
    dryout: [1, 0.72, 0.78, 0.45, 0.64, 0.12], inertia: [0.22, 0.9, 0, 0, 0.62, 0.48],
    mechanismsKo: [
      "48돈모 브리스틀 고랑과 방향 관성 회전",
      "2.5D 높이 버퍼 Sobel 법선 스페큘러·그림자 광원",
      "안료 잔량 고갈에 따른 후반부 돈모 갈필 분리",
    ],
    csp200AdvantageKo: "48돈모 고랑과 2.5D Sobel 법선 광원, 물리 관성 회전을 실시간으로 계산한다.",
  }),
  "acrylic-gouache": buildStrategy({
    id: "acrylic-gouache", labelKo: "아크릴·과슈", labelEn: "Opaque Acrylic & Gouache",
    operation: "paint", paperGrainPreset: "cold-press-medium", grainMode: "fixed-world",
    tip: [16, 0.54, 0, 34, 1.38, 0.28], optical: [0, 0.64, 0.46, 0.12, 0.1, 0],
    features: [0.24, 0.26, 0.8, 0.14, 0.44, 0.98, 0.08, 0.24, 0, 0.56],
    bounds: {
      opacityCoverage: { min: 0.72, max: 1 }, edgeSharpness: { min: 0.48, max: 0.96 },
      impastoHeight: { min: 0.14, max: 0.72 },
    },
    dryout: [1, 0.6, 0.7, 0.92, 0.6, 0.14], inertia: [0.4, 0.88, 0, 0, 0.48, 0.58],
    mechanismsKo: [
      "하층 색을 덮는 98% 매트 불투명 피복력",
      "유화보다 절제된 중간 임파스토와 16모 붓결",
      "빠른 건조로 형성되는 또렷한 매트 과슈 에지",
    ],
    csp200AdvantageKo: "수채 투명도와 유화 혼색 사이에서 매트 불투명 피복력과 빠른 건조 에지를 정밀하게 분리했다.",
  }),
  marker: buildStrategy({
    id: "marker", labelKo: "알코올 마커·코픽", labelEn: "Alcohol Chisel Marker",
    operation: "paint", paperGrainPreset: "smooth-kent", grainMode: "none",
    tip: [1, 0.34, 42, 55, 1.15, 0.16], optical: [0, 0.38, 0, 0.18, 0.08, 0],
    features: [0.08, 0.1, 0.78, 0.22, 0, 0.62, 0.94, 0.12, 0, 0.06],
    bounds: {
      multiplyStacking: { min: 0.45, max: 1 }, toothContrast: { min: 0, max: 0.3 },
      edgeSharpness: { min: 0.52, max: 0.96 }, impastoHeight: { min: 0, max: 0.1 },
    },
    dryout: [0.96, 0.88, 0.36, 0.66, 0.5, 0.32], inertia: [0.74, 0.92, 0.84, 42, 0.28, 0.72],
    mechanismsKo: [
      "42° 사선 펠트 치즐 닙 고정 각도 편향",
      "스트로크 교차 시 승산(Multiply) 농도 누적",
      "단일 패스 내부 톤 균일 플랫 워시 유지",
    ],
    csp200AdvantageKo: "단일 획 내부는 균일하게 깔리고 겹칠 구간만 승산 누적되는 코픽 알코올 염료 거동을 구현한다.",
  }),
  airbrush: buildStrategy({
    id: "airbrush", labelKo: "에어브러시·스프레이", labelEn: "Gaussian Airbrush & Spray",
    operation: "paint", paperGrainPreset: "smooth-kent", grainMode: "none",
    tip: [1, 1, 0, 70, 1.05, 0.1], optical: [0, 0.18, 0, 0, 0.98, 0],
    features: [0.03, 0.08, 0.08, 0.06, 0, 0.34, 0.36, 0, 0, 0.04],
    bounds: {
      edgeSharpness: { min: 0, max: 0.3 }, toothContrast: { min: 0, max: 0.24 },
      impastoHeight: { min: 0, max: 0.08 },
    },
    dryout: [1, 0.95, 0.06, 0.1, 0.25, 0.86], inertia: [0.85, 0.95, 0, 0, 0.15, 0.68],
    mechanismsKo: [
      "연속 가우시안 감쇠로 경계 단차 제거",
      "블루노이즈 미세 분무 디더링(0% 8비트 밴딩)",
      "지속 공압 분사 기준 일정 안료 공급 곡선",
    ],
    csp200AdvantageKo: "가우시안 감쇠에 미세 분무 디더링을 얹어 피부 홍조·역광 그라데이션에서 8비트 밴딩을 0%로 억제한다.",
  }),
  "blending-stump": buildStrategy({
    id: "blending-stump", labelKo: "찰필·스머지", labelEn: "Blending Stump & Smudge",
    operation: "smudge", paperGrainPreset: "sketchbook-tooth", grainMode: "fixed-world",
    tip: [1, 0.78, -20, 30, 1.7, 0.2], optical: [0, 0.72, 0, 0, 0.64, 0.08],
    features: [0.38, 0.32, 0.22, 0.24, 0, 0.12, 0.05, 0.94, 0.06, 0.14],
    bounds: {
      smudgePickup: { min: 0.45, max: 1 }, opacityCoverage: { min: 0, max: 0.45 },
      liftStrength: { min: 0, max: 0.2 },
    },
    dryout: [0.85, 0.25, 0.58, 0.42, 0.55, 0.15], inertia: [0.52, 0.88, 0.2, -20, 0.64, 0.56],
    mechanismsKo: [
      "주변 흑연·파스텔 안료 실시간 픽업 버퍼",
      "종이 골짜기 방향으로 결을 살리며 문지르는 부드러운 블러",
      "문지름 거리 증가에 따른 픽업 안료 자연 감쇠",
    ],
    csp200AdvantageKo: "종이 결을 뭉개는 단순 블러가 아니라 종이 골짜기 안으로 흑연을 밀어 넣는 실물 찰필 물리 연산을 적용한다.",
  }),
  "kneaded-eraser": buildStrategy({
    id: "kneaded-eraser", labelKo: "떡지우개·지우개", labelEn: "Kneaded & Precision Eraser",
    operation: "erase", paperGrainPreset: "sketchbook-tooth", grainMode: "fixed-world",
    tip: [1, 0.84, 0, 36, 1.5, 0.14], optical: [0, 0, 0, 0, 0.48, 0.92],
    features: [0.54, 0.36, 0.3, 0, 0, 0, 0, 0.1, 0.96, 0.08],
    bounds: {
      liftStrength: { min: 0.5, max: 1 }, opacityCoverage: { min: 0, max: 0.15 },
      wetBleed: { min: 0, max: 0.08 },
    },
    dryout: [1, 0, 0.26, 0.1, 0.62, 0.4], inertia: [0.62, 0.88, 0, 0, 0.54, 0.62],
    mechanismsKo: [
      "저필압에서 종이 봉우리 흑연부터 우선 들어올리는 피크 리프트",
      "고필압 전환 시 종이 골짜기까지 부드럽게 백지 복원",
      "문지름 번짐 없이 하이라이트 톤을 깎아내는 떡지우개 압착감",
    ],
    csp200AdvantageKo: "균일 알파 차감 지우개와 달리 종이 봉우리 흑연부터 단계적으로 들어 올려 연필화 하이라이트 질감을 살린다.",
  }),
});

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampRange(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function wrapAnglePi(rad: number): number {
  let angle = rad;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** 두 10차원 물리 특징 벡터 사이의 유클리드 거리 계산. */
export function computeFeatureVectorDistance(
  a: BrushPhysicalFeatureVector,
  b: BrushPhysicalFeatureVector,
): number {
  let sumSq = 0;
  for (const key of BRUSH_FEATURE_KEYS) {
    const diff = a[key] - b[key];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

export interface StrategyPairDistance {
  readonly a: BrushMediaCategoryId;
  readonly b: BrushMediaCategoryId;
  readonly distance: number;
}

export interface StrategySeparationSummary {
  readonly pairCount: number;
  readonly minDistance: number;
  readonly meanDistance: number;
  readonly maxDistance: number;
  readonly closestPair: StrategyPairDistance;
  readonly allMutuallyDistinct: boolean;
}

/** 12대 매체 전략 전체 쌍(66쌍)의 특징 벡터 상호 변별성 측정. */
export function evaluateStrategySeparation(): StrategySeparationSummary {
  let minDistance = Number.POSITIVE_INFINITY;
  let maxDistance = 0;
  let sum = 0;
  let pairCount = 0;
  let closestPair: StrategyPairDistance = { a: "pencil", b: "crayon", distance: Number.POSITIVE_INFINITY };

  for (let i = 0; i < BRUSH_MEDIA_CATEGORY_IDS.length; i += 1) {
    const idA = BRUSH_MEDIA_CATEGORY_IDS[i];
    const vecA = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[idA].targetFeatures;
    for (let j = i + 1; j < BRUSH_MEDIA_CATEGORY_IDS.length; j += 1) {
      const idB = BRUSH_MEDIA_CATEGORY_IDS[j];
      const dist = computeFeatureVectorDistance(vecA, BRUSH_CATEGORY_PHYSICAL_STRATEGIES[idB].targetFeatures);
      sum += dist;
      pairCount += 1;
      if (dist < minDistance) {
        minDistance = dist;
        closestPair = { a: idA, b: idB, distance: dist };
      }
      if (dist > maxDistance) maxDistance = dist;
    }
  }

  return Object.freeze({
    pairCount,
    minDistance,
    meanDistance: pairCount > 0 ? sum / pairCount : 0,
    maxDistance,
    closestPair,
    allMutuallyDistinct: minDistance > 0.25,
  });
}

export type BrushRefillEvent = "none" | "new-stroke" | "color-pick" | "water-dip";
export type BrushDryoutPhase = "saturated" | "balanced" | "dry-split" | "starved";

export interface BrushPaintLoadDryoutInput {
  readonly category: BrushMediaCategoryId;
  readonly strokeLengthPx: number;
  readonly pressure01: number;
  readonly paperRoughness01: number;
  readonly initialPaintLoad01?: number;
  readonly initialMoistureLoad01?: number;
  readonly refillEvent?: BrushRefillEvent;
}

export interface BrushPaintLoadDryoutResult {
  readonly category: BrushMediaCategoryId;
  readonly paintRemaining01: number;
  readonly moistureRemaining01: number;
  readonly drySplitFactor01: number;
  readonly activeBristleStrands: number;
  readonly toothBreakupBoost01: number;
  readonly effectiveOpacityScale: number;
  readonly phase: BrushDryoutPhase;
  readonly refilled: boolean;
}

/**
 * 실시간 안료·수분 잔량 및 갈필(Dry-Brush Split) 물리 게이지.
 * 획 길이·필압·종이 거칠기에 따라 단조 감소하며, 새 획(`new-stroke`) 또는 색상 피킹(`color-pick`) 시 리필된다.
 */
export function evaluateBrushPaintLoadDryout(
  input: BrushPaintLoadDryoutInput,
): BrushPaintLoadDryoutResult {
  const strategy = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[input.category];
  const profile = strategy.dryout;
  const initPaint = clamp01(input.initialPaintLoad01 ?? profile.initialPaintLoad01);
  const initMoisture = clamp01(input.initialMoistureLoad01 ?? profile.initialMoistureLoad01);
  const refillEvent = input.refillEvent ?? "none";

  if (refillEvent === "new-stroke" || refillEvent === "color-pick") {
    return Object.freeze({
      category: input.category, paintRemaining01: initPaint, moistureRemaining01: initMoisture,
      drySplitFactor01: 0, activeBristleStrands: strategy.defaultBristleCount,
      toothBreakupBoost01: 0, effectiveOpacityScale: clampRange(0.25 + 0.75 * initPaint, 0.25, 1),
      phase: "saturated", refilled: true,
    });
  }
  if (refillEvent === "water-dip") {
    const dilutedPaint = clamp01(initPaint * 0.86);
    return Object.freeze({
      category: input.category, paintRemaining01: dilutedPaint, moistureRemaining01: 1,
      drySplitFactor01: 0, activeBristleStrands: strategy.defaultBristleCount,
      toothBreakupBoost01: 0, effectiveOpacityScale: clampRange(0.3 + 0.7 * dilutedPaint, 0.25, 1),
      phase: "saturated", refilled: true,
    });
  }

  const lengthPx = Math.max(0, Number.isFinite(input.strokeLengthPx) ? input.strokeLengthPx : 0);
  const pressure = clamp01(input.pressure01);
  const roughness = clamp01(input.paperRoughness01);
  const effectiveDistK = (lengthPx * (0.45 + 0.95 * pressure) * (0.55 + 0.9 * roughness)) / 1000;
  const floorPaint = Math.min(initPaint, profile.minFloorPaint01);
  const paintRemaining01 = clamp01(
    floorPaint + (initPaint - floorPaint) * Math.exp(-profile.paintDepletionPer1000Px * effectiveDistK),
  );
  const moistureRemaining01 = clamp01(
    initMoisture * Math.exp(-profile.moistureEvapPer1000Px * effectiveDistK),
  );
  const threshold = Math.max(0.05, profile.drySplitThreshold01);
  const drySplitFactor01 =
    paintRemaining01 >= threshold
      ? 0
      : clamp01((threshold - paintRemaining01) / Math.max(0.05, threshold - floorPaint * 0.5));
  const activeBristleStrands = Math.max(
    1,
    Math.round(strategy.defaultBristleCount * clampRange(1 - drySplitFactor01 * 0.68, 0.25, 1)),
  );
  const phase: BrushDryoutPhase =
    paintRemaining01 >= 0.78 && drySplitFactor01 < 0.05
      ? "saturated"
      : drySplitFactor01 >= 0.72
        ? "starved"
        : drySplitFactor01 >= 0.15
          ? "dry-split"
          : "balanced";

  return Object.freeze({
    category: input.category,
    paintRemaining01,
    moistureRemaining01,
    drySplitFactor01,
    activeBristleStrands,
    toothBreakupBoost01: clamp01(drySplitFactor01 * (0.45 + 0.55 * roughness)),
    effectiveOpacityScale: clampRange(0.18 + 0.82 * Math.pow(paintRemaining01, 0.78), 0.18, 1),
    phase,
    refilled: false,
  });
}

export interface BristleInertiaState {
  readonly headingRad: number;
  readonly angularVelocityRadPerSec: number;
  readonly filteredX: number;
  readonly filteredY: number;
  readonly rawX: number;
  readonly rawY: number;
  readonly speedPxPerSec: number;
  readonly jitterSuppressedPx: number;
}

export interface BristleInertiaStepInput {
  readonly state: BristleInertiaState;
  readonly targetX: number;
  readonly targetY: number;
  readonly dtMs: number;
  readonly pressure01: number;
  readonly paperRoughness01: number;
  readonly category: BrushMediaCategoryId;
}

export function createInitialBristleInertiaState(
  x: number,
  y: number,
  initialHeadingRad = 0,
): BristleInertiaState {
  return Object.freeze({
    headingRad: wrapAnglePi(initialHeadingRad),
    angularVelocityRadPerSec: 0,
    filteredX: x,
    filteredY: y,
    rawX: x,
    rawY: y,
    speedPxPerSec: 0,
    jitterSuppressedPx: 0,
  });
}

/**
 * 붓모 방향 관성 및 종이 마찰 미세 손떨림 감쇠 스텝 필터.
 * 급회전 시 붓모 각도가 오버슈트 없이 부드럽게 수렴하며, 거친 종이 저속 드로잉에서 손떨림을 억제한다.
 */
export function stepBristleDirectionInertia(
  input: BristleInertiaStepInput,
): BristleInertiaState {
  const { state, targetX, targetY } = input;
  const inertia = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[input.category].inertia;
  const dtSec = clampRange(input.dtMs, 1, 250) / 1000;
  const pressure = clamp01(input.pressure01);
  const roughness = clamp01(input.paperRoughness01);

  const speedPxPerSec = Math.hypot(targetX - state.rawX, targetY - state.rawY) / dtSec;
  const speedFactor = 1 - Math.exp(-speedPxPerSec / 380);
  const slowFrictionPenalty =
    inertia.paperFrictionDamp01 * roughness * (1 - speedFactor) * (0.65 + 0.35 * pressure);
  const posAlpha = clampRange(
    inertia.basePositionAlpha01 * (0.45 + 0.55 * speedFactor) +
      0.34 * speedFactor -
      0.42 * slowFrictionPenalty,
    0.1,
    0.96,
  );

  const filteredX = state.filteredX + (targetX - state.filteredX) * posAlpha;
  const filteredY = state.filteredY + (targetY - state.filteredY) * posAlpha;
  const moveDx = filteredX - state.filteredX;
  const moveDy = filteredY - state.filteredY;
  const tangentHeading =
    Math.hypot(moveDx, moveDy) > 1e-4 ? Math.atan2(moveDy, moveDx) : state.headingRad;
  const lockedRad = (inertia.lockedAngleDeg * Math.PI) / 180;
  const desiredHeading = wrapAnglePi(
    tangentHeading + wrapAnglePi(lockedRad - tangentHeading) * inertia.fixedAngleLock01,
  );

  const angleError = wrapAnglePi(desiredHeading - state.headingRad);
  const effectiveStiffness = clampRange(
    inertia.angularStiffness01 * (1.08 - 0.22 * pressure),
    0.08,
    0.95,
  );
  const dampedVel =
    (state.angularVelocityRadPerSec + angleError * (6 + effectiveStiffness * 48) * dtSec) *
    Math.exp(-inertia.angularDamping01 * 14 * dtSec);
  const rawStep =
    angleError * (1 - Math.exp(-effectiveStiffness * 18 * dtSec)) * 0.72 + dampedVel * dtSec * 0.28;
  const clampedStep =
    angleError >= 0
      ? Math.min(angleError, Math.max(0, rawStep))
      : Math.max(angleError, Math.min(0, rawStep));

  return Object.freeze({
    headingRad: wrapAnglePi(state.headingRad + clampedStep),
    angularVelocityRadPerSec: clampedStep / dtSec,
    filteredX,
    filteredY,
    rawX: targetX,
    rawY: targetY,
    speedPxPerSec,
    jitterSuppressedPx: Math.hypot(targetX - filteredX, targetY - filteredY),
  });
}
