/**
 * 가상 스튜디오 화려한 연출(Dramatic VFX) 20종 카탈로그 · 바닥 재질별 발자국 파문 ·
 * 체조/댄스 전용 연출 및 웹툰 마감 실무 유틸리티(50분 작업 → 30초 손목 체조 리마인더 · 원고 상태 자동 연동).
 *
 * - 모든 연출 색상은 OKLCH 조화 팔레트와 Canvas/SVG/Three.js용 HEX/수치 값을 함께 제공한다.
 * - `prefers-reduced-motion` 환경에서는 동적 입자를 0으로 감쇠하고 정적 배지·미세 글로우로 우아하게 전환한다.
 */

import type { StudioExtendedFootstepSurface } from "./studio-virtual-space-footsteps";

/** 화려한 연출 20종 식별자. */
export type StudioDramaticVfxId =
  | "dash-speedlines"
  | "wood-step-ripple"
  | "marble-starlight-ripple"
  | "grass-petal-ripple"
  | "neon-tile-pulse"
  | "deadline-confetti-fireworks"
  | "eureka-spark-aura"
  | "martial-fantasy-magic-circle"
  | "rofan-rose-petals"
  | "highfive-shockwave"
  | "focus-flame-aura"
  | "coffee-healing-steam"
  | "entrance-spotlight-beam"
  | "cyber-holo-grid"
  | "ink-calligraphy-slash"
  | "mascot-clover-blessing"
  | "rhythm-note-wave"
  | "stage-spotlight-ring"
  | "mint-healing-spark"
  | "team-harmony-wave";

export type StudioDramaticVfxCategory =
  | "movement"
  | "emotion"
  | "genre"
  | "deadline"
  | "wellness-gymnastics"
  | "dance-party";

export type StudioDramaticVfxShape =
  | "speedline"
  | "afterimage"
  | "ripple-ring"
  | "magic-circle"
  | "confetti"
  | "starburst"
  | "spark"
  | "rose-petal"
  | "shockwave"
  | "flame"
  | "steam-heart"
  | "spotlight-beam"
  | "holo-grid"
  | "ink-slash"
  | "clover"
  | "music-note"
  | "mint-spark"
  | "harmony-wave";

export interface StudioDramaticVfxReducedFallback {
  readonly mode: "static-badge-glow";
  readonly badgeEmoji: string;
  readonly glowColorOklch: string;
  readonly glowColorHex: string;
  readonly glowOpacity: number;
  readonly staticRingScale: number;
  readonly particleMultiplier: 0;
}

export interface StudioDramaticVfxSpec {
  readonly id: StudioDramaticVfxId;
  readonly category: StudioDramaticVfxCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly badgeEmoji: string;
  readonly descriptionKo: string;
  readonly primaryOklch: string;
  readonly secondaryOklch: string;
  readonly accentOklch: string;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly accentHex: string;
  readonly threeColorHex: number;
  readonly threeSecondaryHex: number;
  readonly shapes: readonly StudioDramaticVfxShape[];
  readonly burstCount: number;
  readonly ringCount: number;
  readonly durationMs: number;
  readonly afterimageTrail: number;
  readonly reducedMotionFallback: StudioDramaticVfxReducedFallback;
}

function vfxSpec(spec: Omit<StudioDramaticVfxSpec, "reducedMotionFallback">): StudioDramaticVfxSpec {
  return Object.freeze({
    ...spec,
    shapes: Object.freeze([...spec.shapes]),
    reducedMotionFallback: Object.freeze({
      mode: "static-badge-glow" as const,
      badgeEmoji: spec.badgeEmoji,
      glowColorOklch: spec.primaryOklch,
      glowColorHex: spec.primaryHex,
      glowOpacity: 0.32,
      staticRingScale: 1.0,
      particleMultiplier: 0 as const,
    }),
  });
}

/** 20종 가상 스튜디오 화려한 연출 카탈로그 (이동 5 · 감정/장르/마감 11 · 체조/댄스 4). */
export const STUDIO_DRAMATIC_VFX_CATALOG: readonly StudioDramaticVfxSpec[] = Object.freeze([
  vfxSpec({ id: "dash-speedlines", category: "movement", labelKo: "대시 스피드라인·잔상", labelEn: "Dash Speedlines & Afterimage", badgeEmoji: "💨", descriptionKo: "전력 질주 시 방사형 스피드라인과 3단 크로마 잔상이 따라붙는다.", primaryOklch: "oklch(0.78 0.16 230)", secondaryOklch: "oklch(0.88 0.14 95)", accentOklch: "oklch(0.95 0.04 230)", primaryHex: "#38bdf8", secondaryHex: "#fde047", accentHex: "#e0f2fe", threeColorHex: 0x38bdf8, threeSecondaryHex: 0xfde047, shapes: ["speedline", "afterimage", "ripple-ring"], burstCount: 10, ringCount: 1, durationMs: 420, afterimageTrail: 3 }),
  vfxSpec({ id: "wood-step-ripple", category: "movement", labelKo: "원목 나뭇결 발자국 파문", labelEn: "Oak Wood Footstep Ripple", badgeEmoji: "🪵", descriptionKo: "아틀리에 원목 바닥을 디딜 때 따뜻한 나무 먼지와 미세 파문이 피어난다.", primaryOklch: "oklch(0.81 0.08 74)", secondaryOklch: "oklch(0.9 0.05 80)", accentOklch: "oklch(0.72 0.1 65)", primaryHex: "#dec8a6", secondaryHex: "#f4e8d4", accentHex: "#c9a06a", threeColorHex: 0xdec8a6, threeSecondaryHex: 0xc9a06a, shapes: ["ripple-ring", "spark"], burstCount: 5, ringCount: 1, durationMs: 520, afterimageTrail: 0 }),
  vfxSpec({ id: "marble-starlight-ripple", category: "movement", labelKo: "대리석 별빛 물결 파문", labelEn: "Marble Starlight Ripple", badgeEmoji: "💎", descriptionKo: "로비 대리석·석재 홀 위를 걸을 때 맑은 물결 링과 은빛 별빛이 번진다.", primaryOklch: "oklch(0.87 0.07 240)", secondaryOklch: "oklch(0.79 0.14 255)", accentOklch: "oklch(0.96 0.02 245)", primaryHex: "#bfdbfe", secondaryHex: "#818cf8", accentHex: "#f1f5f9", threeColorHex: 0xbfdbfe, threeSecondaryHex: 0x818cf8, shapes: ["ripple-ring", "starburst", "spark"], burstCount: 7, ringCount: 2, durationMs: 640, afterimageTrail: 0 }),
  vfxSpec({ id: "grass-petal-ripple", category: "movement", labelKo: "잔디·테라스 꽃잎 파문", labelEn: "Meadow Petal Ripple", badgeEmoji: "🌿", descriptionKo: "야외 테라스와 잔디를 밟을 때 산뜻한 잎사귀와 분홍 꽃잎이 흩날린다.", primaryOklch: "oklch(0.82 0.14 148)", secondaryOklch: "oklch(0.84 0.12 350)", accentOklch: "oklch(0.92 0.08 135)", primaryHex: "#86efac", secondaryHex: "#fbcfe8", accentHex: "#dcfce7", threeColorHex: 0x86efac, threeSecondaryHex: 0xfbcfe8, shapes: ["ripple-ring", "rose-petal", "clover"], burstCount: 7, ringCount: 1, durationMs: 780, afterimageTrail: 0 }),
  vfxSpec({ id: "neon-tile-pulse", category: "movement", labelKo: "네온타일 사이버 펄스", labelEn: "Neon Tile Cyber Pulse", badgeEmoji: "🔷", descriptionKo: "3D 스테이지·네온 타일 바닥에서 보라-시안 디지털 파문과 착지 링이 울린다.", primaryOklch: "oklch(0.75 0.19 295)", secondaryOklch: "oklch(0.8 0.15 205)", accentOklch: "oklch(0.91 0.08 280)", primaryHex: "#a855f7", secondaryHex: "#22d3ee", accentHex: "#e9d5ff", threeColorHex: 0xa855f7, threeSecondaryHex: 0x22d3ee, shapes: ["ripple-ring", "holo-grid", "shockwave"], burstCount: 8, ringCount: 2, durationMs: 560, afterimageTrail: 1 }),
  vfxSpec({ id: "deadline-confetti-fireworks", category: "deadline", labelKo: "마감 완료 컨페티·별빛 폭죽", labelEn: "Deadline Confetti & Starlight Fireworks", badgeEmoji: "🎆", descriptionKo: "회차 출고·컷 승인 순간 다채로운 색종이와 별빛 폭죽이 화면을 수놓는다.", primaryOklch: "oklch(0.84 0.17 88)", secondaryOklch: "oklch(0.76 0.18 350)", accentOklch: "oklch(0.8 0.15 220)", primaryHex: "#facc15", secondaryHex: "#f472b6", accentHex: "#38bdf8", threeColorHex: 0xfacc15, threeSecondaryHex: 0xf472b6, shapes: ["confetti", "starburst", "shockwave"], burstCount: 22, ringCount: 2, durationMs: 1650, afterimageTrail: 1 }),
  vfxSpec({ id: "eureka-spark-aura", category: "emotion", labelKo: "영감 폭발 전구·스파크 오라", labelEn: "Eureka Bulb & Spark Aura", badgeEmoji: "💡", descriptionKo: "명장면 콘티가 번뜩이는 순간 황금빛 전구 링과 전기 스파크가 튀어 오른다.", primaryOklch: "oklch(0.88 0.17 95)", secondaryOklch: "oklch(0.8 0.15 225)", accentOklch: "oklch(0.97 0.05 95)", primaryHex: "#fde047", secondaryHex: "#38bdf8", accentHex: "#fef9c3", threeColorHex: 0xfde047, threeSecondaryHex: 0x38bdf8, shapes: ["spark", "starburst", "ripple-ring"], burstCount: 14, ringCount: 2, durationMs: 1100, afterimageTrail: 0 }),
  vfxSpec({ id: "martial-fantasy-magic-circle", category: "genre", labelKo: "무협·판타지 다중 마법진 링", labelEn: "Fantasy & Murim Magic Circle", badgeEmoji: "🔮", descriptionKo: "발밑에 이중 룬 문자 마법진이 회전하며 아스트랄 광채가 솟아오른다.", primaryOklch: "oklch(0.74 0.17 245)", secondaryOklch: "oklch(0.71 0.19 280)", accentOklch: "oklch(0.92 0.08 215)", primaryHex: "#38bdf8", secondaryHex: "#818cf8", accentHex: "#bae6fd", threeColorHex: 0x38bdf8, threeSecondaryHex: 0x818cf8, shapes: ["magic-circle", "starburst", "ripple-ring"], burstCount: 16, ringCount: 3, durationMs: 1500, afterimageTrail: 1 }),
  vfxSpec({ id: "rofan-rose-petals", category: "genre", labelKo: "로판 장미 꽃잎 흩날림", labelEn: "Rofan Rose Petal Drift", badgeEmoji: "🌹", descriptionKo: "로맨스 판타지 주인공 등장처럼 진홍·분홍 장미 꽃잎과 금빛 가루가 흩날린다.", primaryOklch: "oklch(0.72 0.2 12)", secondaryOklch: "oklch(0.84 0.12 355)", accentOklch: "oklch(0.88 0.13 85)", primaryHex: "#fb7185", secondaryHex: "#fda4af", accentHex: "#fde68a", threeColorHex: 0xfb7185, threeSecondaryHex: 0xfde68a, shapes: ["rose-petal", "starburst", "ripple-ring"], burstCount: 16, ringCount: 2, durationMs: 1800, afterimageTrail: 0 }),
  vfxSpec({ id: "highfive-shockwave", category: "emotion", labelKo: "하이파이브 충격파·공명", labelEn: "High-Five Resonance Shockwave", badgeEmoji: "🙌", descriptionKo: "팀원과 손바닥을 마주칠 때 경쾌한 이중 충격파와 시너지 불꽃이 퍼진다.", primaryOklch: "oklch(0.79 0.16 168)", secondaryOklch: "oklch(0.82 0.15 225)", accentOklch: "oklch(0.93 0.08 92)", primaryHex: "#34d399", secondaryHex: "#38bdf8", accentHex: "#fef08a", threeColorHex: 0x34d399, threeSecondaryHex: 0x38bdf8, shapes: ["shockwave", "spark", "starburst"], burstCount: 14, ringCount: 2, durationMs: 850, afterimageTrail: 1 }),
  vfxSpec({ id: "focus-flame-aura", category: "deadline", labelKo: "집중 작업 불꽃 오라", labelEn: "Deep Focus Flame Aura", badgeEmoji: "🔥", descriptionKo: "마감 몰입 모드에서 타오르는 주황·크림슨 불꽃 오라가 캐릭터를 감싼다.", primaryOklch: "oklch(0.71 0.2 38)", secondaryOklch: "oklch(0.65 0.22 18)", accentOklch: "oklch(0.88 0.16 90)", primaryHex: "#f97316", secondaryHex: "#f43f5e", accentHex: "#fde047", threeColorHex: 0xf97316, threeSecondaryHex: 0xf43f5e, shapes: ["flame", "spark", "speedline"], burstCount: 16, ringCount: 2, durationMs: 1200, afterimageTrail: 2 }),
  vfxSpec({ id: "coffee-healing-steam", category: "emotion", labelKo: "커피 힐링 스팀 하트", labelEn: "Coffee Healing Steam Hearts", badgeEmoji: "☕", descriptionKo: "따뜻한 커피 향기와 함께 부드러운 스팀과 분홍 하트가 천천히 피어오른다.", primaryOklch: "oklch(0.78 0.13 62)", secondaryOklch: "oklch(0.83 0.12 350)", accentOklch: "oklch(0.96 0.02 75)", primaryHex: "#f59e0b", secondaryHex: "#fbcfe8", accentHex: "#fef3c7", threeColorHex: 0xf59e0b, threeSecondaryHex: 0xfbcfe8, shapes: ["steam-heart", "ripple-ring"], burstCount: 10, ringCount: 1, durationMs: 1700, afterimageTrail: 0 }),
  vfxSpec({ id: "entrance-spotlight-beam", category: "genre", labelKo: "등장 스포트라이트 빔", labelEn: "Entrance Spotlight Beam", badgeEmoji: "🌟", descriptionKo: "새 구역 입장이나 주인공 등장을 빛기둥 스포트라이트와 별빛 샤워로 강조한다.", primaryOklch: "oklch(0.9 0.14 96)", secondaryOklch: "oklch(0.76 0.17 305)", accentOklch: "oklch(0.98 0.02 95)", primaryHex: "#fef08a", secondaryHex: "#c084fc", accentHex: "#ffffff", threeColorHex: 0xfef08a, threeSecondaryHex: 0xc084fc, shapes: ["spotlight-beam", "starburst", "ripple-ring"], burstCount: 15, ringCount: 2, durationMs: 1350, afterimageTrail: 0 }),
  vfxSpec({ id: "cyber-holo-grid", category: "genre", labelKo: "사이버 홀로그램 매트릭스", labelEn: "Cyber Hologram Matrix", badgeEmoji: "🖥️", descriptionKo: "3D 모델링·해커 캐릭터 주변으로 반투명 와이어프레임과 시안 데이터 링이 공전한다.", primaryOklch: "oklch(0.79 0.15 188)", secondaryOklch: "oklch(0.74 0.16 250)", accentOklch: "oklch(0.93 0.06 195)", primaryHex: "#2dd4bf", secondaryHex: "#60a5fa", accentHex: "#ccfbf1", threeColorHex: 0x2dd4bf, threeSecondaryHex: 0x60a5fa, shapes: ["holo-grid", "magic-circle", "spark"], burstCount: 12, ringCount: 2, durationMs: 1300, afterimageTrail: 1 }),
  vfxSpec({ id: "ink-calligraphy-slash", category: "genre", labelKo: "먹물 캘리그래피 검기", labelEn: "Ink Calligraphy Slash", badgeEmoji: "⚔️", descriptionKo: "펜선과 검기가 교차하며 묵직한 먹물 튐과 크림슨 호광을 남긴다.", primaryOklch: "oklch(0.65 0.22 15)", secondaryOklch: "oklch(0.32 0.08 275)", accentOklch: "oklch(0.84 0.12 10)", primaryHex: "#f43f5e", secondaryHex: "#1e1b4b", accentHex: "#fda4af", threeColorHex: 0xf43f5e, threeSecondaryHex: 0x312e81, shapes: ["ink-slash", "speedline", "spark"], burstCount: 14, ringCount: 1, durationMs: 780, afterimageTrail: 2 }),
  vfxSpec({ id: "mascot-clover-blessing", category: "emotion", labelKo: "반려 마스코트 행운 클로버", labelEn: "Companion Mascot Clover Glow", badgeEmoji: "🍀", descriptionKo: "치즈냥·웰시코기 동행 캐릭터가 팀원 옆을 지나갈 때 네잎클로버 글로우를 뿌린다.", primaryOklch: "oklch(0.82 0.16 150)", secondaryOklch: "oklch(0.9 0.13 92)", accentOklch: "oklch(0.95 0.05 150)", primaryHex: "#4ade80", secondaryHex: "#fde68a", accentHex: "#dcfce7", threeColorHex: 0x4ade80, threeSecondaryHex: 0xfde68a, shapes: ["clover", "starburst", "ripple-ring"], burstCount: 12, ringCount: 1, durationMs: 1450, afterimageTrail: 0 }),
  vfxSpec({ id: "rhythm-note-wave", category: "dance-party", labelKo: "리듬 음표 파동", labelEn: "Rhythm Note Wave", badgeEmoji: "🎵", descriptionKo: "리듬 댄스에 맞춰 8분음표와 바이올렛-시안 이퀄라이저 파동이 탄력 있게 퍼진다.", primaryOklch: "oklch(0.73 0.2 300)", secondaryOklch: "oklch(0.8 0.16 210)", accentOklch: "oklch(0.86 0.16 340)", primaryHex: "#a855f7", secondaryHex: "#38bdf8", accentHex: "#f472b6", threeColorHex: 0xa855f7, threeSecondaryHex: 0x38bdf8, shapes: ["music-note", "ripple-ring", "starburst"], burstCount: 16, ringCount: 2, durationMs: 1400, afterimageTrail: 1 }),
  vfxSpec({ id: "stage-spotlight-ring", category: "dance-party", labelKo: "무대 스포트라이트 링", labelEn: "Stage Spotlight Ring", badgeEmoji: "🪩", descriptionKo: "마감 축하 댄스 시 무대 빛기둥과 회전 스포트라이트 링, 축하 컨페티가 쏟아진다.", primaryOklch: "oklch(0.87 0.16 92)", secondaryOklch: "oklch(0.76 0.19 335)", accentOklch: "oklch(0.81 0.15 215)", primaryHex: "#fde047", secondaryHex: "#f472b6", accentHex: "#38bdf8", threeColorHex: 0xfde047, threeSecondaryHex: 0xf472b6, shapes: ["spotlight-beam", "confetti", "shockwave"], burstCount: 20, ringCount: 3, durationMs: 1600, afterimageTrail: 2 }),
  vfxSpec({ id: "mint-healing-spark", category: "wellness-gymnastics", labelKo: "민트 힐링 스파크", labelEn: "Fresh Mint Healing Sparks", badgeEmoji: "🌿", descriptionKo: "손목 풀기·목·어깨·전신 스트레칭 체조 시 상쾌한 민트 리커버리 스파크와 호흡 링이 감싼다.", primaryOklch: "oklch(0.82 0.14 172)", secondaryOklch: "oklch(0.88 0.11 155)", accentOklch: "oklch(0.96 0.04 175)", primaryHex: "#2dd4bf", secondaryHex: "#6ee7b7", accentHex: "#ccfbf1", threeColorHex: 0x2dd4bf, threeSecondaryHex: 0x6ee7b7, shapes: ["mint-spark", "ripple-ring", "clover"], burstCount: 14, ringCount: 2, durationMs: 1500, afterimageTrail: 0 }),
  vfxSpec({ id: "team-harmony-wave", category: "dance-party", labelKo: "팀 댄스 하모니 웨이브", labelEn: "Team Sync Harmony Wave", badgeEmoji: "🌈", descriptionKo: "팀 동기화 군무 시 동료 사이를 잇는 동심원 하모니 파동과 음표 별빛이 공명한다.", primaryOklch: "oklch(0.8 0.16 175)", secondaryOklch: "oklch(0.77 0.18 320)", accentOklch: "oklch(0.87 0.15 88)", primaryHex: "#34d399", secondaryHex: "#e879f9", accentHex: "#fde047", threeColorHex: 0x34d399, threeSecondaryHex: 0xe879f9, shapes: ["harmony-wave", "music-note", "shockwave"], burstCount: 18, ringCount: 3, durationMs: 1550, afterimageTrail: 2 }),
]);

const VFX_BY_ID: ReadonlyMap<StudioDramaticVfxId, StudioDramaticVfxSpec> = new Map(
  STUDIO_DRAMATIC_VFX_CATALOG.map((spec) => [spec.id, spec] as const),
);

export function getStudioDramaticVfxSpec(id: StudioDramaticVfxId): StudioDramaticVfxSpec {
  return VFX_BY_ID.get(id) ?? STUDIO_DRAMATIC_VFX_CATALOG[0];
}

export interface StudioDramaticVfxRenderPlan {
  readonly spec: StudioDramaticVfxSpec;
  readonly reducedMotion: boolean;
  readonly effectiveBurstCount: number;
  readonly effectiveRingCount: number;
  readonly effectiveAfterimageTrail: number;
  readonly badgeEmoji: string;
  readonly glowColorOklch: string;
  readonly glowColorHex: string;
  readonly glowOpacity: number;
}

/** `prefers-reduced-motion`을 반영해 실제 렌더러가 쓸 연출 강도와 정적 배지/글로우 폴백을 계산한다. */
export function resolveDramaticVfxRenderPlan(
  id: StudioDramaticVfxId,
  options: { readonly reducedMotion: boolean; readonly intensityScale?: number },
): StudioDramaticVfxRenderPlan {
  const spec = getStudioDramaticVfxSpec(id);
  const scale = Number.isFinite(options.intensityScale)
    ? Math.max(0.25, Math.min(2, options.intensityScale ?? 1))
    : 1;
  if (options.reducedMotion) {
    return Object.freeze({
      spec,
      reducedMotion: true,
      effectiveBurstCount: 0,
      effectiveRingCount: 1,
      effectiveAfterimageTrail: 0,
      badgeEmoji: spec.reducedMotionFallback.badgeEmoji,
      glowColorOklch: spec.reducedMotionFallback.glowColorOklch,
      glowColorHex: spec.reducedMotionFallback.glowColorHex,
      glowOpacity: spec.reducedMotionFallback.glowOpacity,
    });
  }
  return Object.freeze({
    spec,
    reducedMotion: false,
    effectiveBurstCount: Math.max(1, Math.round(spec.burstCount * scale)),
    effectiveRingCount: spec.ringCount,
    effectiveAfterimageTrail: spec.afterimageTrail,
    badgeEmoji: spec.badgeEmoji,
    glowColorOklch: spec.primaryOklch,
    glowColorHex: spec.primaryHex,
    glowOpacity: 0.68,
  });
}

/** 바닥 재질(나무·대리석·잔디·네온타일 + 기본 5종 표면)별 발자국·파문 VFX 레시피. */
export type StudioFloorMaterialKind =
  | StudioExtendedFootstepSurface
  | "marble"
  | "grass"
  | "neon-tile";

export interface StudioFloorFootstepVfxRecipe {
  readonly material: StudioFloorMaterialKind;
  readonly soundSurface: StudioExtendedFootstepSurface;
  readonly dramaticVfxId: StudioDramaticVfxId;
  readonly rippleKind: "warm-dust" | "starlight-wave" | "petal-dew" | "neon-pulse" | "soft-lint";
  readonly primaryOklch: string;
  readonly primaryHex: string;
  readonly secondaryHex: string;
  readonly threeTintHex: number;
  readonly ringRadiusScale: number;
  readonly sparkCount: number;
  readonly dustCount: number;
}

const FLOOR_VFX_RECIPES: Readonly<Record<StudioFloorMaterialKind, StudioFloorFootstepVfxRecipe>> = Object.freeze({
  wood: { material: "wood", soundSurface: "wood", dramaticVfxId: "wood-step-ripple", rippleKind: "warm-dust", primaryOklch: "oklch(0.81 0.08 74)", primaryHex: "#dec8a6", secondaryHex: "#c9a06a", threeTintHex: 0xdec8a6, ringRadiusScale: 0.95, sparkCount: 1, dustCount: 3 },
  marble: { material: "marble", soundSurface: "stone", dramaticVfxId: "marble-starlight-ripple", rippleKind: "starlight-wave", primaryOklch: "oklch(0.87 0.07 240)", primaryHex: "#bfdbfe", secondaryHex: "#818cf8", threeTintHex: 0xbfdbfe, ringRadiusScale: 1.25, sparkCount: 3, dustCount: 2 },
  stone: { material: "stone", soundSurface: "stone", dramaticVfxId: "marble-starlight-ripple", rippleKind: "starlight-wave", primaryOklch: "oklch(0.85 0.05 240)", primaryHex: "#d4dce6", secondaryHex: "#93c5fd", threeTintHex: 0xd4dce6, ringRadiusScale: 1.15, sparkCount: 2, dustCount: 3 },
  grass: { material: "grass", soundSurface: "terrace", dramaticVfxId: "grass-petal-ripple", rippleKind: "petal-dew", primaryOklch: "oklch(0.82 0.14 148)", primaryHex: "#86efac", secondaryHex: "#fbcfe8", threeTintHex: 0x86efac, ringRadiusScale: 1.1, sparkCount: 3, dustCount: 3 },
  terrace: { material: "terrace", soundSurface: "terrace", dramaticVfxId: "grass-petal-ripple", rippleKind: "petal-dew", primaryOklch: "oklch(0.83 0.1 105)", primaryHex: "#d9c9ad", secondaryHex: "#86efac", threeTintHex: 0xd9c9ad, ringRadiusScale: 1.1, sparkCount: 2, dustCount: 4 },
  "neon-tile": { material: "neon-tile", soundSurface: "tile", dramaticVfxId: "neon-tile-pulse", rippleKind: "neon-pulse", primaryOklch: "oklch(0.75 0.19 295)", primaryHex: "#a855f7", secondaryHex: "#22d3ee", threeTintHex: 0xa855f7, ringRadiusScale: 1.32, sparkCount: 4, dustCount: 2 },
  tile: { material: "tile", soundSurface: "tile", dramaticVfxId: "neon-tile-pulse", rippleKind: "neon-pulse", primaryOklch: "oklch(0.88 0.05 215)", primaryHex: "#e0f2fe", secondaryHex: "#38bdf8", threeTintHex: 0xe0f2fe, ringRadiusScale: 1.12, sparkCount: 2, dustCount: 3 },
  carpet: { material: "carpet", soundSurface: "carpet", dramaticVfxId: "wood-step-ripple", rippleKind: "soft-lint", primaryOklch: "oklch(0.87 0.03 80)", primaryHex: "#e6dfd3", secondaryHex: "#d8cfc2", threeTintHex: 0xe6dfd3, ringRadiusScale: 0.78, sparkCount: 0, dustCount: 2 },
});

export function resolveFloorMaterialFootstepVfx(material: StudioFloorMaterialKind): StudioFloorFootstepVfxRecipe {
  return FLOOR_VFX_RECIPES[material] ?? FLOOR_VFX_RECIPES.wood;
}

/** 작가 건강 체조 3종 + 신나는 댄스 3종 공용 액션 ID. */
export type StudioWellnessOrDanceActionId =
  | "neck-shoulder-stretch"
  | "wrist-roll-break"
  | "standing-gymnastics"
  | "groove-dance"
  | "deadline-victory-dance"
  | "sync-group-dance";

export interface StudioWellnessOrDanceSpec {
  readonly id: StudioWellnessOrDanceActionId;
  readonly group: "wellness-gymnastics" | "dance";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly badgeEmoji: string;
  readonly recommendedSeconds: number;
  readonly dramaticVfxId: StudioDramaticVfxId;
  readonly workBenefitKo: string;
}

export const STUDIO_WELLNESS_GYMNASTICS_AND_DANCE_SPECS: readonly StudioWellnessOrDanceSpec[] = Object.freeze([
  { id: "neck-shoulder-stretch", group: "wellness-gymnastics", labelKo: "목·어깨 체조", labelEn: "Neck & Shoulder Stretch", badgeEmoji: "💆", recommendedSeconds: 30, dramaticVfxId: "mint-healing-spark", workBenefitKo: "거북목과 승모근 긴장을 풀어 선화 집중력을 되살린다." },
  { id: "wrist-roll-break", group: "wellness-gymnastics", labelKo: "손목 풀기 체조", labelEn: "Wrist Roll Recovery", badgeEmoji: "👐", recommendedSeconds: 30, dramaticVfxId: "mint-healing-spark", workBenefitKo: "50분 펜 작업 뒤 30초 손목 회전으로 터널 증후군을 예방한다." },
  { id: "standing-gymnastics", group: "wellness-gymnastics", labelKo: "전신 스트레칭 체조", labelEn: "Standing Full Stretch", badgeEmoji: "🤸", recommendedSeconds: 45, dramaticVfxId: "mint-healing-spark", workBenefitKo: "장시간 착석으로 굳은 허리와 어깨를 펴 마감 체력을 지킨다." },
  { id: "groove-dance", group: "dance", labelKo: "리듬 댄스", labelEn: "Groove Dance", badgeEmoji: "🎵", recommendedSeconds: 20, dramaticVfxId: "rhythm-note-wave", workBenefitKo: "콘티 막힘 구간에서 기분을 전환하고 리듬감을 끌어올린다." },
  { id: "deadline-victory-dance", group: "dance", labelKo: "마감 축하 댄스", labelEn: "Deadline Victory Dance", badgeEmoji: "🪩", recommendedSeconds: 25, dramaticVfxId: "stage-spotlight-ring", workBenefitKo: "회차 출고·컷 승인을 팀 전체와 화려하게 축하한다." },
  { id: "sync-group-dance", group: "dance", labelKo: "팀 동기화 댄스", labelEn: "Team Sync Group Dance", badgeEmoji: "🕺", recommendedSeconds: 30, dramaticVfxId: "team-harmony-wave", workBenefitKo: "합평 전후 동료들과 호흡을 맞춰 스튜디오 활력을 높인다." },
]);

/** 50분 작업 → 30초 손목/목·어깨 체조 리마인더 기준 상수. */
export const CREATOR_WORK_REMINDER_INTERVAL_MINUTES = 50;
export const CREATOR_STRETCH_BREAK_SECONDS = 30;

export interface CreatorWellnessReminderState {
  readonly status: "working" | "stretch-due" | "stretching" | "break-complete";
  readonly continuousWorkMinutes: number;
  readonly nextReminderInMinutes: number;
  readonly remainingBreakSeconds: number;
  readonly recommendedActionId: "wrist-roll-break" | "neck-shoulder-stretch" | "standing-gymnastics";
  readonly dramaticVfxId: StudioDramaticVfxId;
  readonly headlineKo: string;
  readonly actionLabelKo: string;
  readonly renderPlan: StudioDramaticVfxRenderPlan;
}

/**
 * 실제 웹툰 마감 실무용 건강 체조 리마인더 계산:
 * 50분 연속 작업 시 30초 손목 풀기(100분차 목·어깨, 150분+ 전신 스트레칭)를 안내하고 민트 힐링 VFX를 연동한다.
 */
export function evaluateCreatorWellnessReminder(input: {
  readonly continuousWorkMinutes: number;
  readonly secondsInBreak?: number;
  readonly reducedMotion?: boolean;
}): CreatorWellnessReminderState {
  const minutes = Number.isFinite(input.continuousWorkMinutes) ? Math.max(0, input.continuousWorkMinutes) : 0;
  const breakSec = Number.isFinite(input.secondsInBreak) ? Math.max(0, input.secondsInBreak ?? 0) : 0;
  const cycleIndex = Math.max(1, Math.floor(minutes / CREATOR_WORK_REMINDER_INTERVAL_MINUTES));
  const recommendedActionId: "wrist-roll-break" | "neck-shoulder-stretch" | "standing-gymnastics" =
    cycleIndex % 3 === 0 ? "standing-gymnastics" : cycleIndex % 2 === 0 ? "neck-shoulder-stretch" : "wrist-roll-break";
  const actionLabelKo =
    recommendedActionId === "wrist-roll-break"
      ? "30초 손목 풀기 체조"
      : recommendedActionId === "neck-shoulder-stretch"
        ? "30초 목·어깨 체조"
        : "30초 전신 스트레칭";
  const renderPlan = resolveDramaticVfxRenderPlan("mint-healing-spark", { reducedMotion: Boolean(input.reducedMotion) });

  if (breakSec >= CREATOR_STRETCH_BREAK_SECONDS) {
    return Object.freeze({
      status: "break-complete",
      continuousWorkMinutes: minutes,
      nextReminderInMinutes: CREATOR_WORK_REMINDER_INTERVAL_MINUTES,
      remainingBreakSeconds: 0,
      recommendedActionId,
      dramaticVfxId: "mint-healing-spark",
      headlineKo: "30초 체조 완료! 손목과 어깨가 상쾌해졌어요.",
      actionLabelKo: "원고 작업 재개",
      renderPlan,
    });
  }
  if (breakSec > 0) {
    const remaining = Math.ceil(CREATOR_STRETCH_BREAK_SECONDS - breakSec);
    return Object.freeze({
      status: "stretching",
      continuousWorkMinutes: minutes,
      nextReminderInMinutes: 0,
      remainingBreakSeconds: remaining,
      recommendedActionId,
      dramaticVfxId: "mint-healing-spark",
      headlineKo: `${actionLabelKo} 진행 중 · ${remaining}초 남음`,
      actionLabelKo,
      renderPlan,
    });
  }
  if (minutes >= CREATOR_WORK_REMINDER_INTERVAL_MINUTES) {
    return Object.freeze({
      status: "stretch-due",
      continuousWorkMinutes: minutes,
      nextReminderInMinutes: 0,
      remainingBreakSeconds: CREATOR_STRETCH_BREAK_SECONDS,
      recommendedActionId,
      dramaticVfxId: "mint-healing-spark",
      headlineKo: `${Math.floor(minutes)}분 연속 작업 완료 — 지금 ${actionLabelKo} 할 시간이에요!`,
      actionLabelKo,
      renderPlan,
    });
  }
  const untilNext = Math.ceil(CREATOR_WORK_REMINDER_INTERVAL_MINUTES - minutes);
  return Object.freeze({
    status: "working",
    continuousWorkMinutes: minutes,
    nextReminderInMinutes: untilNext,
    remainingBreakSeconds: CREATOR_STRETCH_BREAK_SECONDS,
    recommendedActionId: "wrist-roll-break",
    dramaticVfxId: "mint-healing-spark",
    headlineKo: `다음 손목 체조 리마인더까지 ${untilNext}분 남음`,
    actionLabelKo: "미리 손목 풀기",
    renderPlan,
  });
}

/** 원고 제작 단계 → 자동 상태 표시 배지 & 연출 연동. */
export type CreatorManuscriptStageId =
  | "storyboard"
  | "line-art"
  | "coloring"
  | "bg-3d"
  | "lettering"
  | "review-waiting"
  | "deadline-sprint"
  | "episode-approved"
  | "wrist-recovery";

export interface CreatorManuscriptPresenceVfx {
  readonly stageId: CreatorManuscriptStageId;
  readonly statusBadgeKo: string;
  readonly shortTagKo: string;
  readonly dramaticVfxId: StudioDramaticVfxId;
  readonly recommendedMotionId: string;
  readonly statusColorOklch: string;
  readonly statusColorHex: string;
  readonly renderPlan: StudioDramaticVfxRenderPlan;
}

const MANUSCRIPT_STAGE_TABLE: Readonly<Record<CreatorManuscriptStageId, Omit<CreatorManuscriptPresenceVfx, "renderPlan">>> = Object.freeze({
  storyboard: { stageId: "storyboard", statusBadgeKo: "콘티 구상 중", shortTagKo: "콘티", dramaticVfxId: "eureka-spark-aura", recommendedMotionId: "whiteboard-laser-pitch", statusColorOklch: "oklch(0.84 0.16 92)", statusColorHex: "#eab308" },
  "line-art": { stageId: "line-art", statusBadgeKo: "선화 펜터치 중", shortTagKo: "선화", dramaticVfxId: "ink-calligraphy-slash", recommendedMotionId: "tablet-combo-draw", statusColorOklch: "oklch(0.65 0.22 15)", statusColorHex: "#f43f5e" },
  coloring: { stageId: "coloring", statusBadgeKo: "채색·후보정 중", shortTagKo: "채색", dramaticVfxId: "rofan-rose-petals", recommendedMotionId: "tablet-combo-draw", statusColorOklch: "oklch(0.7 0.2 350)", statusColorHex: "#ec4899" },
  "bg-3d": { stageId: "bg-3d", statusBadgeKo: "3D 배경 조형 중", shortTagKo: "3D배경", dramaticVfxId: "cyber-holo-grid", recommendedMotionId: "dcc-3d-sculpt", statusColorOklch: "oklch(0.73 0.16 225)", statusColorHex: "#0ea5e9" },
  lettering: { stageId: "lettering", statusBadgeKo: "식자·효과음 조율 중", shortTagKo: "식자", dramaticVfxId: "rhythm-note-wave", recommendedMotionId: "desk-draw", statusColorOklch: "oklch(0.68 0.2 295)", statusColorHex: "#8b5cf6" },
  "review-waiting": { stageId: "review-waiting", statusBadgeKo: "합평 검수 대기", shortTagKo: "검수대기", dramaticVfxId: "highfive-shockwave", recommendedMotionId: "highfive-team-sync", statusColorOklch: "oklch(0.76 0.16 170)", statusColorHex: "#10b981" },
  "deadline-sprint": { stageId: "deadline-sprint", statusBadgeKo: "마감 초집중 스퍼트", shortTagKo: "마감스퍼트", dramaticVfxId: "focus-flame-aura", recommendedMotionId: "sprint-afterimage", statusColorOklch: "oklch(0.7 0.2 35)", statusColorHex: "#f97316" },
  "episode-approved": { stageId: "episode-approved", statusBadgeKo: "회차 최종 승인 완료!", shortTagKo: "승인완료", dramaticVfxId: "deadline-confetti-fireworks", recommendedMotionId: "deadline-victory-dance", statusColorOklch: "oklch(0.84 0.17 88)", statusColorHex: "#facc15" },
  "wrist-recovery": { stageId: "wrist-recovery", statusBadgeKo: "30초 손목 체조 휴식", shortTagKo: "손목체조", dramaticVfxId: "mint-healing-spark", recommendedMotionId: "wrist-roll-break", statusColorOklch: "oklch(0.82 0.14 172)", statusColorHex: "#2dd4bf" },
});

export function resolveManuscriptStatusPresenceVfx(
  stageId: CreatorManuscriptStageId,
  reducedMotion = false,
): CreatorManuscriptPresenceVfx {
  const base = MANUSCRIPT_STAGE_TABLE[stageId];
  return Object.freeze({
    ...base,
    renderPlan: resolveDramaticVfxRenderPlan(base.dramaticVfxId, { reducedMotion }),
  });
}

/** 이모트·액션 ID 문자열을 대표 20종 Dramatic VFX ID로 매핑한다. */
export function resolveDramaticVfxForEmoteOrAction(kind: string): StudioDramaticVfxId {
  switch (kind) {
    case "neck-shoulder-stretch":
    case "wrist-roll-break":
    case "standing-gymnastics":
    case "calisthenics":
    case "neck-stretch":
    case "yoga":
    case "tai-chi":
      return "mint-healing-spark";
    case "groove-dance":
    case "shuffle":
    case "music":
    case "moonwalk":
      return "rhythm-note-wave";
    case "deadline-victory-dance":
    case "dance":
      return "stage-spotlight-ring";
    case "sync-group-dance":
    case "kpop-dance":
      return "team-harmony-wave";
    case "fireworks":
    case "party":
    case "cheers":
    case "victory-jump-cheer":
      return "deadline-confetti-fireworks";
    case "idea":
    case "sparkles":
    case "wow":
    case "exclaim":
      return "eureka-spark-aura";
    case "heart":
      return "rofan-rose-petals";
    case "coffee":
    case "espresso-power-charge":
      return "coffee-healing-steam";
    case "clap":
    case "clap-cheer":
    case "thumbs-up":
    case "wave":
    case "wave-greet":
    case "highfive-team-sync":
      return "highfive-shockwave";
    case "sprint":
    case "sprint-afterimage":
      return "dash-speedlines";
    case "tablet-combo-draw":
      return "ink-calligraphy-slash";
    case "dcc-3d-sculpt":
      return "cyber-holo-grid";
    case "awakening-skill-burst":
      return "martial-fantasy-magic-circle";
    default:
      return "entrance-spotlight-beam";
  }
}
