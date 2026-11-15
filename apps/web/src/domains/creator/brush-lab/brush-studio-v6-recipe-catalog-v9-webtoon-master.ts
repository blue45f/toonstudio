import type {
  BrushStudioV6InputPolicy,
  BrushStudioV6QualityGoal,
  BrushStudioV6Slots,
  BrushStudioV6Tuning,
} from "./brush-studio-v6-engine";
import { defineBrushStudioV6RecipeSeed, type BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

/**
 * ToonStudio 마스터 웹툰 아틀리에 브러시 물리·다이내믹스 확장 메타데이터.
 * V6 프로그램 슬롯·튜닝과 함께 필압 응답, 입·출필 서브픽셀 테이퍼, 혼색·과립·에지 선명도를 명세한다.
 */
export interface BrushStudioV9WebtoonMasterPhysicsProfile {
  readonly size: number;
  readonly opacity: number;
  readonly flow: number;
  readonly spacing: number;
  readonly stabilizer: number;
  readonly pressureSize: number;
  readonly pressureOpacity: number;
  readonly taperIn: number;
  readonly taperOut: number;
  readonly wetMix: number;
  readonly colorStretch: number;
  readonly pigmentGranulation: number;
  readonly bristleCount: number;
  readonly edgeCrispness: number;
}

export interface BrushStudioV9WebtoonMasterSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly group: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly qualityGoal: BrushStudioV6QualityGoal;
  readonly slots: Partial<BrushStudioV6Slots>;
  readonly input?: Partial<BrushStudioV6InputPolicy>;
  readonly tuning: Partial<BrushStudioV6Tuning>;
  readonly masterPhysics: BrushStudioV9WebtoonMasterPhysicsProfile;
}

export const BRUSH_STUDIO_V9_WEBTOON_MASTER_SPECS: readonly BrushStudioV9WebtoonMasterSpec[] =
  Object.freeze([
    {
      id: "v9-webtoon-razor-gpen",
      labelKo: "마스터 면도날 G펜 · 서브픽셀 칼끝 테이퍼 선화",
      labelEn: "Master Razor G-Pen · Subpixel Blade-Taper Lineart",
      group: "웹툰 마스터",
      descriptionKo:
        "구심 Catmull 곡률 적응 스탬프와 펜촉 갈라짐 고임, 서브픽셀 SDF 안티앨리어싱을 결합해 출필 끝단이 면도날처럼 예리하게 빠지는 주력 선화 G펜.",
      descriptionEn:
        "Flagship webtoon lineart G-Pen combining centripetal adaptive stamping, dip-pen nib pooling, and subpixel SDF anti-aliasing for razor-sharp exit tapers.",
      qualityGoal: "responsive",
      slots: {
        motion: "motion-adaptive-ema",
        carrier: "carrier-webgpu-centerline",
        tip: "tip-round-sdf",
        surface: "surface-kent",
        deposition: "deposit-ink",
        pickup: "pickup-none",
        pigment: "pigment-spectral",
        physics: ["physics-centripetal-adaptive-stamp", "physics-nib-split-pooling"],
        pattern: "pattern-none",
        finish: ["finish-subpixel-sdf-aa"],
        output: "output-contact-canvas-svg",
      },
      input: {
        pressureOnset: 0.02,
        pressureSaturation: 0.92,
        pressureGamma: 0.74,
        pressureHysteresis: 0.015,
        film: "paperlike-fine",
      },
      tuning: {
        size: 9,
        opacity: 1,
        flow: 0.96,
        spacing: 0.055,
        stabilization: 0.24,
        primaryColor: "#0f172a",
        secondaryColor: "#334155",
      },
      masterPhysics: {
        size: 9,
        opacity: 1,
        flow: 0.96,
        spacing: 0.055,
        stabilizer: 3,
        pressureSize: 0.92,
        pressureOpacity: 0.08,
        taperIn: 0.68,
        taperOut: 0.94,
        wetMix: 0,
        colorStretch: 0,
        pigmentGranulation: 0.02,
        bristleCount: 1,
        edgeCrispness: 0.99,
      },
    },
    {
      id: "v9-manhwa-emotional-maru",
      labelKo: "순정·로판 세밀 마루펜 · 속눈썹·머리카락 극세선",
      labelEn: "Manhwa Emotional Maru Pen · Eyelash & Hair Micro-Line",
      group: "웹툰 마스터",
      descriptionKo:
        "견인줄 보정과 Perfect Freehand 외곽선, 서브픽셀 SDF 마감을 결합해 속눈썹·잔머리·보석 하이라이트를 떨림 없이 뽑아내는 극세 마루펜.",
      descriptionEn:
        "Ultra-fine Maru pen pairing lazy-leash stabilization with subpixel SDF outline precision for eyelashes, hair strands, and jewelry highlights.",
      qualityGoal: "responsive",
      slots: {
        motion: "motion-lazy-leash",
        carrier: "carrier-perfect-outline",
        tip: "tip-round-sdf",
        surface: "surface-smooth",
        deposition: "deposit-ink",
        pickup: "pickup-none",
        pigment: "pigment-rgb",
        physics: ["physics-centripetal-adaptive-stamp"],
        pattern: "pattern-none",
        finish: ["finish-subpixel-sdf-aa"],
        output: "output-contact-canvas-svg",
      },
      input: {
        pressureOnset: 0.01,
        pressureSaturation: 0.88,
        pressureGamma: 0.66,
        pressureHysteresis: 0.01,
        film: "glass",
      },
      tuning: {
        size: 4,
        opacity: 0.98,
        flow: 0.94,
        spacing: 0.045,
        stabilization: 0.34,
        primaryColor: "#1e1b4b",
        secondaryColor: "#4338ca",
      },
      masterPhysics: {
        size: 4,
        opacity: 0.98,
        flow: 0.94,
        spacing: 0.045,
        stabilizer: 4,
        pressureSize: 0.96,
        pressureOpacity: 0.14,
        taperIn: 0.82,
        taperOut: 0.97,
        wetMix: 0,
        colorStretch: 0,
        pigmentGranulation: 0,
        bristleCount: 1,
        edgeCrispness: 0.98,
      },
    },
    {
      id: "v9-cel-shadow-hard-fill",
      labelKo: "웹툰 셀 음영 칼단면 브러시 · 번짐 0% 하드 에지",
      labelEn: "Webtoon Cel Shadow Hard-Fill · Zero-Bleed Crisp Edge",
      group: "웹툰 마스터",
      descriptionKo:
        "3D 배럴 트위스트 치즐 촉과 균일 잉크 침착으로 경계 번짐 없이 애니메이션풍 칼단면 셀 그림자와 옷주름 면을 빠르게 구축하는 브러시.",
      descriptionEn:
        "Zero-bleed cel-shading chisel brush delivering crisp, stepped anime/webtoon shadow planes and garment folds in a single pass.",
      qualityGoal: "balanced",
      slots: {
        motion: "motion-adaptive-ema",
        carrier: "carrier-webgpu-ribbon",
        tip: "tip-chisel-sdf",
        surface: "surface-smooth",
        deposition: "deposit-ink",
        pickup: "pickup-none",
        pigment: "pigment-open-km",
        physics: ["physics-centripetal-adaptive-stamp", "physics-barrel-twist-chisel"],
        pattern: "pattern-none",
        finish: ["finish-subpixel-sdf-aa"],
        output: "output-contact-canvas-svg",
      },
      input: {
        pressureOnset: 0.03,
        pressureSaturation: 0.95,
        pressureGamma: 0.9,
        tiltEnabled: true,
        tiltSmoothing: 0.22,
      },
      tuning: {
        size: 28,
        opacity: 0.92,
        flow: 1,
        spacing: 0.065,
        stabilization: 0.2,
        friction: 0.24,
        primaryColor: "#312e81",
        secondaryColor: "#6366f1",
      },
      masterPhysics: {
        size: 28,
        opacity: 0.92,
        flow: 1,
        spacing: 0.065,
        stabilizer: 2,
        pressureSize: 0.54,
        pressureOpacity: 0,
        taperIn: 0.28,
        taperOut: 0.42,
        wetMix: 0,
        colorStretch: 0,
        pigmentGranulation: 0,
        bristleCount: 1,
        edgeCrispness: 1,
      },
    },
    {
      id: "v9-romance-petal-glow",
      labelKo: "로판 꽃잎 보케·안광 글로우 브러시",
      labelEn: "Romance Fantasy Petal Bokeh & Eye-Glow Brush",
      group: "웹툰 마스터",
      descriptionKo:
        "모티프 아틀라스 입자 스트림과 분광 안료, 네온 발광 마감을 결합해 로맨스판타지 하이라이트 컷의 꽃잎 보케와 눈동자 안광을 연출하는 브러시.",
      descriptionEn:
        "Luminous motif-particle brush with spectral pigment bloom for romance-fantasy petal bokeh, rim highlights, and starlight eye glow.",
      qualityGoal: "cinematic",
      slots: {
        motion: "motion-spring",
        carrier: "carrier-webgpu-particles",
        tip: "tip-motif-atlas",
        surface: "surface-v7-vellum",
        deposition: "deposit-particles",
        pickup: "pickup-none",
        pigment: "pigment-spectral-js",
        physics: ["physics-particles"],
        pattern: "pattern-none",
        finish: ["finish-neon"],
        output: "output-contact-canvas-svg",
      },
      tuning: {
        size: 42,
        opacity: 0.86,
        flow: 0.74,
        spacing: 0.14,
        particleCount: 1120,
        patternJitter: 0.54,
        primaryColor: "#f472b6",
        secondaryColor: "#fef08a",
      },
      masterPhysics: {
        size: 42,
        opacity: 0.86,
        flow: 0.74,
        spacing: 0.14,
        stabilizer: 2,
        pressureSize: 0.72,
        pressureOpacity: 0.84,
        taperIn: 0.35,
        taperOut: 0.62,
        wetMix: 0.18,
        colorStretch: 0.24,
        pigmentGranulation: 0.12,
        bristleCount: 12,
        edgeCrispness: 0.44,
      },
    },
    {
      id: "v9-action-speed-rake",
      labelKo: "소년만화 액션 속도선·집중선 레이크 브러시",
      labelEn: "Action Manhwa Speed-Line & Focus Rake Brush",
      group: "웹툰 마스터",
      descriptionKo:
        "강모 다발 분리·병합과 원심 부채꼴 벌어짐을 결합해 한 번의 빠른 스와이프로 날카로운 다중 속도선과 타격 잔상을 긋는 액션 전용 레이크.",
      descriptionEn:
        "Multi-strand centrifugal bristle rake engineered for high-velocity action speed lines, impact streaks, and dynamic motion slashes.",
      qualityGoal: "responsive",
      slots: {
        motion: "motion-brush-inertia",
        carrier: "carrier-webgpu-ribbon",
        tip: "tip-chisel-sdf",
        surface: "surface-printmaking",
        deposition: "deposit-ink",
        pickup: "pickup-none",
        pigment: "pigment-rgb",
        physics: [
          "physics-bristle",
          "physics-bristle-split-merge",
          "physics-centrifugal-bristle-turn",
          "physics-dry-contact",
        ],
        pattern: "pattern-none",
        finish: ["finish-subpixel-sdf-aa", "finish-grain"],
        output: "output-contact-canvas-svg",
      },
      tuning: {
        size: 44,
        opacity: 0.96,
        flow: 0.9,
        spacing: 0.06,
        surfaceTooth: 0.62,
        friction: 0.86,
        viscosity: 0.32,
        reservoir: 0.64,
        bristleStrands: 64,
        bristleIterations: 4,
        relief: 0.28,
        gloss: 0.24,
        primaryColor: "#09090b",
        secondaryColor: "#52525b",
      },
      masterPhysics: {
        size: 44,
        opacity: 0.96,
        flow: 0.9,
        spacing: 0.06,
        stabilizer: 1,
        pressureSize: 0.68,
        pressureOpacity: 0.22,
        taperIn: 0.76,
        taperOut: 0.95,
        wetMix: 0,
        colorStretch: 0.08,
        pigmentGranulation: 0.28,
        bristleCount: 64,
        edgeCrispness: 0.94,
      },
    },
    {
      id: "v9-bg3d-freestyle-liner",
      labelKo: "3D 배경 프리스타일 외곽선 잉크 펜 · 일정 필압 + 끝단 날카로움",
      labelEn: "3D Background Freestyle Contour Ink Pen · Uniform Pressure + Sharp Exit",
      group: "웹툰 마스터",
      descriptionKo:
        "3D 배경·소품 렌더링 외곽선과 자연스럽게 어우러지도록 몸통 두께는 균일하게 유지하면서 끝단만 날카롭게 정리하는 건축·배경 전용 라이너.",
      descriptionEn:
        "Architectural liner tuned to match 3D background Freestyle contours with steady mid-stroke weight, subtle paper tooth, and crisp exit taper.",
      qualityGoal: "balanced",
      slots: {
        motion: "motion-lazy-leash",
        carrier: "carrier-webgpu-centerline",
        tip: "tip-round-sdf",
        surface: "surface-kent",
        deposition: "deposit-ink",
        pickup: "pickup-none",
        pigment: "pigment-rgb",
        physics: ["physics-centripetal-adaptive-stamp", "physics-dual-mask-boolean"],
        pattern: "pattern-none",
        finish: ["finish-subpixel-sdf-aa"],
        output: "output-contact-canvas-svg",
      },
      input: {
        pressureOnset: 0.04,
        pressureSaturation: 0.96,
        pressureGamma: 1.35,
        tiltEnabled: false,
      },
      tuning: {
        size: 6,
        opacity: 1,
        flow: 0.98,
        spacing: 0.06,
        stabilization: 0.42,
        surfaceTooth: 0.24,
        granulation: 0.18,
        primaryColor: "#18181b",
        secondaryColor: "#3f3f46",
      },
      masterPhysics: {
        size: 6,
        opacity: 1,
        flow: 0.98,
        spacing: 0.06,
        stabilizer: 4,
        pressureSize: 0.22,
        pressureOpacity: 0.04,
        taperIn: 0.48,
        taperOut: 0.88,
        wetMix: 0,
        colorStretch: 0,
        pigmentGranulation: 0.06,
        bristleCount: 1,
        edgeCrispness: 0.97,
      },
    },
    {
      id: "v9-granulating-sky-wash",
      labelKo: "감성 웹툰 수채 하늘 그래뉼레이션 워시",
      labelEn: "Emotional Webtoon Granulating Sky Wash",
      group: "웹툰 마스터",
      descriptionKo:
        "콜드프레스 수채지 골을 따라 모세관 백런과 합성 분광 K/S 안료 침전이 동시에 일어나 서정적인 하늘·노을 배경을 만드는 대면적 수채 워시.",
      descriptionEn:
        "Large-wash watercolor brush combining capillary backrun and spectral K/S pigment sedimentation across rough paper valleys for atmospheric skies.",
      qualityGoal: "material",
      slots: {
        motion: "motion-brush-inertia",
        carrier: "carrier-hokusai-dabs",
        tip: "tip-grain-exemplar",
        surface: "surface-v7-rough-watercolor",
        deposition: "deposit-watercolor",
        pickup: "pickup-pigment-reservoir",
        pigment: "pigment-open-km-spectral",
        physics: [
          "physics-porous-paper",
          "physics-backrun-capillary",
          "physics-pigment-sedimentation",
        ],
        pattern: "pattern-none",
        finish: ["finish-edge-bloom", "finish-wet-sheen"],
        output: "output-contact-canvas-svg",
      },
      tuning: {
        size: 64,
        opacity: 0.72,
        flow: 0.56,
        spacing: 0.11,
        absorbency: 0.68,
        granulation: 0.92,
        edgeDarkening: 0.64,
        wetness: 0.86,
        diffusion: 0.78,
        advection: 0.58,
        evaporation: 0.66,
        primaryColor: "#38bdf8",
        secondaryColor: "#818cf8",
      },
      masterPhysics: {
        size: 64,
        opacity: 0.72,
        flow: 0.56,
        spacing: 0.11,
        stabilizer: 2,
        pressureSize: 0.48,
        pressureOpacity: 0.76,
        taperIn: 0.24,
        taperOut: 0.36,
        wetMix: 0.86,
        colorStretch: 0.68,
        pigmentGranulation: 0.92,
        bristleCount: 28,
        edgeCrispness: 0.32,
      },
    },
    {
      id: "v9-skin-blush-soft-air",
      labelKo: "웹툰 피부 홍조·투명 스킨 벨벳 에어브러시",
      labelEn: "Webtoon Skin Blush & Velvet Airbrush",
      group: "웹툰 마스터",
      descriptionKo:
        "미세 입자 분사와 자체 잠재 안료 혼색을 결합해 색 띠 현상(밴딩) 없이 볼·귀·손끝의 투명한 혈색과 벨벳 피부 톤을 올리는 소프트 에어브러시.",
      descriptionEn:
        "Band-free micro-particle velvet airbrush with latent pigment mixing for translucent cheek blush, fingertips, and soft skin gradients.",
      qualityGoal: "material",
      slots: {
        motion: "motion-spring",
        carrier: "carrier-webgpu-particles",
        tip: "tip-round-sdf",
        surface: "surface-smooth",
        deposition: "deposit-particles",
        pickup: "pickup-none",
        pigment: "pigment-latent",
        physics: ["physics-particles"],
        pattern: "pattern-none",
        finish: [],
        output: "output-contact-canvas-svg",
      },
      tuning: {
        size: 54,
        opacity: 0.36,
        flow: 0.24,
        spacing: 0.055,
        particleCount: 1680,
        patternJitter: 0.64,
        primaryColor: "#fb7185",
        secondaryColor: "#fda4af",
      },
      masterPhysics: {
        size: 54,
        opacity: 0.36,
        flow: 0.24,
        spacing: 0.055,
        stabilizer: 3,
        pressureSize: 0.38,
        pressureOpacity: 0.88,
        taperIn: 0.18,
        taperOut: 0.26,
        wetMix: 0.64,
        colorStretch: 0.58,
        pigmentGranulation: 0.04,
        bristleCount: 16,
        edgeCrispness: 0.18,
      },
    },
  ]);

export const BRUSH_STUDIO_V9_WEBTOON_MASTER_RECIPE_SEEDS: readonly BrushStudioV6RecipeSeed[] =
  Object.freeze(
    BRUSH_STUDIO_V9_WEBTOON_MASTER_SPECS.map((spec) =>
      defineBrushStudioV6RecipeSeed(spec.id, spec.labelKo, spec.group, spec.descriptionKo, {
        qualityGoal: spec.qualityGoal,
        ...(spec.input ? { input: spec.input } : {}),
        slots: spec.slots,
        tuning: spec.tuning,
      }),
    ),
  );
