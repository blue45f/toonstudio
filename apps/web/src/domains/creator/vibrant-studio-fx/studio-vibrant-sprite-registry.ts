/**
 * 44종 주얼 아틀리에 투명 WebP 스프라이트 · 도구 ID 매핑 · 4종 OKLCH 테마 정본 레지스트리.
 *
 * - 실제 에셋 위치: `apps/web/public/assets/studio/vibrant-sprites/*.webp`
 * - 모든 색상은 원시 hex/rgb 없이 CSS OKLCH 커스텀 프로퍼티 토큰명과 클래스로만 참조한다.
 */

import type { StudioFoleySoundId } from "./studio-procedural-foley-audio";

export const STUDIO_VIBRANT_SPRITE_BASE_PATH = "/assets/studio/vibrant-sprites";

export type StudioVibrantSpriteCategory = "tool" | "brush" | "emblem" | "device" | "tech";

export type StudioVibrantAccentKey =
  | "ink"
  | "water"
  | "coral"
  | "mint"
  | "amber"
  | "violet"
  | "cobalt"
  | "rose"
  | "teal"
  | "gold";

export type StudioVibrantAccentToken = `--ts-vibrant-accent-${StudioVibrantAccentKey}`;
export type StudioVibrantAccentClass = `ts-accent-${StudioVibrantAccentKey}`;

export type StudioVibrantThemeId =
  | "sunlight-atelier"
  | "coral-pop"
  | "botanical-mint"
  | "midnight-ink";

export interface StudioVibrantThemeMeta {
  readonly id: StudioVibrantThemeId;
  readonly labelKo: string;
  readonly taglineKo: string;
  readonly mode: "light" | "dark";
  readonly swatchClass: string;
}

export const STUDIO_VIBRANT_THEMES: readonly StudioVibrantThemeMeta[] = Object.freeze([
  Object.freeze({
    id: "sunlight-atelier",
    labelKo: "선라이트 아틀리에",
    taglineKo: "따뜻한 햇살 화실 종이 톤과 코발트·앰버 잉크 액센트",
    mode: "light",
    swatchClass: "ts-theme-swatch--sunlight-atelier",
  }),
  Object.freeze({
    id: "coral-pop",
    labelKo: "코랄 팝",
    taglineKo: "생동감 있는 코랄·망고·터콰이즈 주얼 컬러 팔레트",
    mode: "light",
    swatchClass: "ts-theme-swatch--coral-pop",
  }),
  Object.freeze({
    id: "botanical-mint",
    labelKo: "보태니컬 민트",
    taglineKo: "장시간 드로잉에 편안한 세이지 민트·포레스트 톤",
    mode: "light",
    swatchClass: "ts-theme-swatch--botanical-mint",
  }),
  Object.freeze({
    id: "midnight-ink",
    labelKo: "미드나잇 잉크",
    taglineKo: "야간 채색 집중을 돕는 딥 인디고·시안·골드 다크 아틀리에",
    mode: "dark",
    swatchClass: "ts-theme-swatch--midnight-ink",
  }),
]);

export const STUDIO_VIBRANT_THEME_IDS: readonly StudioVibrantThemeId[] = Object.freeze(
  STUDIO_VIBRANT_THEMES.map((theme) => theme.id),
);

export function isStudioVibrantThemeId(value: unknown): value is StudioVibrantThemeId {
  return (
    value === "sunlight-atelier" ||
    value === "coral-pop" ||
    value === "botanical-mint" ||
    value === "midnight-ink"
  );
}

export function resolveStudioVibrantTheme(
  value: unknown,
  fallback: StudioVibrantThemeId = "sunlight-atelier",
): StudioVibrantThemeId {
  return isStudioVibrantThemeId(value) ? value : fallback;
}

export function applyStudioVibrantTheme(
  target: HTMLElement | null | undefined,
  theme: StudioVibrantThemeId,
): StudioVibrantThemeId {
  const resolved = resolveStudioVibrantTheme(theme);
  if (target) {
    target.dataset.studioVibrantTheme = resolved;
  }
  return resolved;
}

type RawSpriteTuple = readonly [
  id: string,
  category: StudioVibrantSpriteCategory,
  accent: StudioVibrantAccentKey,
  labelKo: string,
  shortBadgeKo: string,
  foleySoundId: StudioFoleySoundId,
  aliases: readonly string[],
];

const RAW_SPRITE_TUPLES = [
  // 16 Tools
  ["tool-gpen", "tool", "ink", "G펜 잉크 펜 도구", "G펜", "gpen-ink", ["pen", "draw", "gpen", "g-pen", "pixel", "pixel-pencil", "pencil", "ink-pen"]],
  ["tool-watercolor", "tool", "water", "수채 붓 도구", "수채", "watercolor-sable", ["wet-mix", "blend", "watercolor", "brush", "paint"]],
  ["tool-marker", "tool", "coral", "마커·명암 브러시 도구", "마커", "graphite-pencil", ["marker", "dodge-burn", "highlighter", "crayon", "pastel"]],
  ["tool-eraser", "tool", "rose", "지우개 도구", "지움", "eraser-scrub", ["eraser", "erase", "vector-erase", "eraser-blend"]],
  ["tool-fill", "tool", "amber", "색 채우기 버킷 도구", "채움", "bubble-pop", ["fill", "bucket", "flood-fill", "bgfill"]],
  ["tool-eyedropper", "tool", "teal", "스포이드 색 추출 도구", "색뽑", "magnetic-detent", ["eyedropper", "dropper", "color-picker", "pipette"]],
  ["tool-lasso", "tool", "violet", "올가미 자유 선택 도구", "올감", "magnetic-detent", ["lasso", "lasso-fill", "select", "marquee-rect", "marquee-circle", "selection"]],
  ["tool-wand", "tool", "gold", "자동 선택 마법봉 도구", "자동", "bubble-pop", ["wand", "magic-wand", "auto-select", "liquify", "smart-select"]],
  ["tool-vector", "tool", "cobalt", "벡터·도형 제어 도구", "벡터", "panel-snap", ["vector", "shape", "smart-shape", "shape-rect", "shape-ellipse", "transform"]],
  ["tool-ruler", "tool", "mint", "투시 자·대칭 가이드 도구", "투시", "panel-snap", ["ruler", "perspective", "guides", "crop", "symmetry", "zoom", "zoom-fit", "rotate-view", "hand"]],
  ["tool-bubble-sfx", "tool", "coral", "말풍선·식자·효과음 도구", "대사", "bubble-pop", ["bubble", "text", "sfx", "lettering", "comment", "speech-bubble"]],
  ["tool-screentone", "tool", "ink", "스크린톤·하프톤 패턴 도구", "톤", "graphite-pencil", ["screentone", "tone", "halftone", "pattern"]],
  ["tool-layers", "tool", "cobalt", "레이어 스택·합성 도구", "레이", "page-turn", ["layers", "layer", "frame-anim", "image", "reference", "clip"]],
  ["tool-bg3d", "tool", "teal", "3D 배경 스테이지 도구", "3D배", "panel-snap", ["bg3d", "bgscene", "scene", "3d-bg", "hybrid-dcc"]],
  ["tool-vrm", "tool", "violet", "VRM 캐릭터·포즈 도구", "VRM", "magnetic-detent", ["vrm", "vrm3d", "mannequin3d", "character-shaper", "pose", "char"]],
  ["tool-ai-compass", "tool", "gold", "AI 연출 컴퍼스 도구", "AI", "bubble-pop", ["ai", "aiassist", "ai-compass", "compass", "director"]],
  // 8 Brush Medallions
  ["brush-ink", "brush", "ink", "잉크 펜선 브러시 메달리온", "잉크", "gpen-ink", ["brush-pen", "csp-g-pen", "csp-real-g-pen", "csp-maru-pen", "ink"]],
  ["brush-watercolor", "brush", "water", "수채화 세이블 브러시 메달리온", "수채", "watercolor-sable", ["csp-transparent-watercolor", "csp-watery-brush", "sable"]],
  ["brush-oil", "brush", "amber", "유화 임파스토 브러시 메달리온", "유화", "oil-impasto", ["thick-paint", "oil", "impasto", "gouache", "csp-oil-paint"]],
  ["brush-pastel", "brush", "rose", "파스텔·크레용 브러시 메달리온", "파스", "graphite-pencil", ["marker-pastel", "csp-wax-crayon", "chalk", "charcoal"]],
  ["brush-airbrush", "brush", "teal", "에어브러시 분사 메달리온", "에어", "airbrush", ["airbrush", "spray", "csp-soft-airbrush"]],
  ["brush-calligraphy", "brush", "ink", "먹붓·서예 캘리그래피 메달리온", "먹붓", "watercolor-sable", ["calligraphy", "calligraphy-sumi", "sumi", "csp-dry-sumi"]],
  ["brush-halftone", "brush", "cobalt", "하프톤·망점 브러시 메달리온", "망점", "graphite-pencil", ["brush-tone", "dot-screen"]],
  ["brush-fx-ribbon", "brush", "violet", "데코·이펙트 리본 브러시 메달리온", "리본", "bubble-pop", ["decoration-fx", "fx-ribbon", "ribbon", "decoration", "csp-sakura-petals"]],
  // 12 Page & Hub Emblems
  ["emblem-studio", "emblem", "cobalt", "툰스튜디오 작업실 엠블럼", "작업", "page-turn", ["studio", "workspace", "editor"]],
  ["emblem-discover", "emblem", "coral", "작품 탐색 허브 엠블럼", "탐색", "page-turn", ["discover", "explore", "home"]],
  ["emblem-character", "emblem", "rose", "캐릭터 랩 엠블럼", "캐릭", "magnetic-detent", ["character", "avatar", "shaper"]],
  ["emblem-bg3d-stage", "emblem", "teal", "3D 배경 스테이지 엠블럼", "무대", "panel-snap", ["bg3d-stage", "stage-3d"]],
  ["emblem-market", "emblem", "amber", "소재 마켓플레이스 엠블럼", "마켓", "bubble-pop", ["market", "marketplace", "assets"]],
  ["emblem-community", "emblem", "coral", "창작자 커뮤니티 엠블럼", "소통", "bubble-pop", ["community", "cafe", "social"]],
  ["emblem-production", "emblem", "violet", "프로덕션 협업 허브 엠블럼", "협업", "panel-snap", ["production", "team", "pipeline"]],
  ["emblem-library", "emblem", "mint", "내 서재·프로젝트 보관함 엠블럼", "서재", "page-turn", ["library", "archive", "projects"]],
  ["emblem-pricing", "emblem", "gold", "요금제·멤버십 엠블럼", "요금", "magnetic-detent", ["pricing", "plan", "billing"]],
  ["emblem-guide-map", "emblem", "mint", "전체 메뉴·안내 지도 엠블럼", "안내", "page-turn", ["guide-map", "sitemap", "guide"]],
  ["emblem-benchmark", "emblem", "cobalt", "경쟁사 비교 벤치마크 엠블럼", "비교", "panel-snap", ["benchmark", "compare"]],
  ["emblem-tech-lab", "emblem", "violet", "차세대 기술 쇼케이스 엠블럼", "기술", "bubble-pop", ["tech-lab", "tech", "showcase"]],
  // 6 Hardware Devices
  ["device-watch", "device", "coral", "스마트워치 크라운 컴패니언", "워치", "magnetic-detent", ["watch", "smartwatch", "wearable"]],
  ["device-tv", "device", "cobalt", "스마트 TV 10피트 시어터", "TV", "panel-snap", ["tv", "smart-tv", "theater"]],
  ["device-digitizer", "device", "ink", "펜 디지타이저·액정 타블렛", "타블", "gpen-ink", ["digitizer", "stylus", "tablet", "wacom", "ipad"]],
  ["device-dial-pad", "device", "amber", "왼손 다이얼·WebHID 컨트롤러", "다이", "magnetic-detent", ["dial-pad", "dial", "tourbox", "loupedeck", "webhid", "midi", "gamepad"]],
  ["device-ar-glasses", "device", "teal", "AR 스마트 글라스 트레이싱", "AR", "bubble-pop", ["ar-glasses", "ar", "glasses"]],
  ["device-vr-headset", "device", "violet", "WebXR VR 공간 헤드셋", "VR", "panel-snap", ["vr-headset", "vr", "webxr", "headset"]],
  // 2 Next-Gen Tech
  ["tech-webgpu", "tech", "teal", "WebGPU 실시간 가속 엔진", "GPU", "panel-snap", ["webgpu", "gpu", "wasm", "wasm64"]],
  ["tech-remotion", "tech", "coral", "Remotion 웹툰 애니매틱 엔진", "영상", "bubble-pop", ["remotion", "video", "animatic", "shorts"]],
] as const satisfies readonly RawSpriteTuple[];

export type StudioVibrantSpriteId = (typeof RAW_SPRITE_TUPLES)[number][0];

export interface StudioVibrantSpriteEntry {
  readonly id: StudioVibrantSpriteId;
  readonly fileName: string;
  readonly src: string;
  readonly category: StudioVibrantSpriteCategory;
  readonly accentToken: StudioVibrantAccentToken;
  readonly accentClass: StudioVibrantAccentClass;
  readonly labelKo: string;
  readonly shortBadgeKo: string;
  readonly foleySoundId: StudioFoleySoundId;
  readonly aliases: readonly string[];
}

export const STUDIO_VIBRANT_SPRITE_REGISTRY: readonly StudioVibrantSpriteEntry[] = Object.freeze(
  RAW_SPRITE_TUPLES.map(([id, category, accent, labelKo, shortBadgeKo, foleySoundId, aliases]) =>
    Object.freeze({
      id,
      fileName: `${id}.webp`,
      src: `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/${id}.webp`,
      category,
      accentToken: `--ts-vibrant-accent-${accent}` as StudioVibrantAccentToken,
      accentClass: `ts-accent-${accent}` as StudioVibrantAccentClass,
      labelKo,
      shortBadgeKo,
      foleySoundId,
      aliases,
    }),
  ),
);

export const STUDIO_VIBRANT_SPRITE_COUNT = STUDIO_VIBRANT_SPRITE_REGISTRY.length;

export const STUDIO_VIBRANT_SPRITE_IDS: readonly StudioVibrantSpriteId[] = Object.freeze(
  STUDIO_VIBRANT_SPRITE_REGISTRY.map((entry) => entry.id),
);

export const STUDIO_VIBRANT_SPRITE_SHEETS = Object.freeze([
  `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/tools-primary-sheet.webp`,
  `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/tools-3d-ai-sheet.webp`,
  `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/brush-medallions-sheet.webp`,
  `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/page-hub-emblems-sheet.webp`,
  `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/page-secondary-emblems-sheet.webp`,
  `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/hardware-tech-sheet.webp`,
] as const);

const SPRITE_BY_ID = new Map<StudioVibrantSpriteId, StudioVibrantSpriteEntry>(
  STUDIO_VIBRANT_SPRITE_REGISTRY.map((entry) => [entry.id, entry]),
);

const ALIAS_TO_SPRITE_ID = new Map<string, StudioVibrantSpriteId>();
for (const entry of STUDIO_VIBRANT_SPRITE_REGISTRY) {
  ALIAS_TO_SPRITE_ID.set(entry.id.toLowerCase(), entry.id);
  for (const alias of entry.aliases) {
    const key = alias.trim().toLowerCase();
    if (key && !ALIAS_TO_SPRITE_ID.has(key)) {
      ALIAS_TO_SPRITE_ID.set(key, entry.id);
    }
  }
}

const KEYWORD_FALLBACKS: readonly (readonly [readonly string[], StudioVibrantSpriteId])[] = [
  [["eraser", "erase"], "tool-eraser"],
  [["watercolor", "watery"], "brush-watercolor"],
  [["oil", "impasto", "gouache"], "brush-oil"],
  [["pastel", "crayon", "chalk"], "brush-pastel"],
  [["airbrush", "spray"], "brush-airbrush"],
  [["sumi", "calligraphy"], "brush-calligraphy"],
  [["halftone", "screentone"], "brush-halftone"],
  [["ribbon", "sakura", "decor"], "brush-fx-ribbon"],
  [["gpen", "g-pen", "ink"], "tool-gpen"],
  [["marker"], "tool-marker"],
  [["fill", "bucket"], "tool-fill"],
  [["dropper", "pipette"], "tool-eyedropper"],
  [["lasso"], "tool-lasso"],
  [["wand"], "tool-wand"],
  [["vector", "shape"], "tool-vector"],
  [["ruler", "perspective"], "tool-ruler"],
  [["bubble", "sfx", "text"], "tool-bubble-sfx"],
  [["layer"], "tool-layers"],
  [["bg3d"], "tool-bg3d"],
  [["vrm", "mannequin"], "tool-vrm"],
  [["ai", "compass"], "tool-ai-compass"],
  [["watch"], "device-watch"],
  [["tv"], "device-tv"],
  [["digitizer", "stylus"], "device-digitizer"],
  [["dial", "hid", "midi"], "device-dial-pad"],
  [["ar-"], "device-ar-glasses"],
  [["vr-", "webxr"], "device-vr-headset"],
  [["webgpu"], "tech-webgpu"],
  [["remotion"], "tech-remotion"],
];

export function isStudioVibrantSpriteId(value: unknown): value is StudioVibrantSpriteId {
  return typeof value === "string" && SPRITE_BY_ID.has(value as StudioVibrantSpriteId);
}

export function getStudioVibrantSprite(id: StudioVibrantSpriteId): StudioVibrantSpriteEntry {
  return SPRITE_BY_ID.get(id) ?? STUDIO_VIBRANT_SPRITE_REGISTRY[0]!;
}

export function listStudioVibrantSpritesByCategory(
  category: StudioVibrantSpriteCategory,
): readonly StudioVibrantSpriteEntry[] {
  return STUDIO_VIBRANT_SPRITE_REGISTRY.filter((entry) => entry.category === category);
}

/**
 * 스튜디오 도구 ID·브러시 카테고리/프리셋 ID·엠블럼/디바이스 별칭을 44종 정본 스프라이트 ID로 변환한다.
 */
export function resolveStudioToolSpriteId(
  toolOrBrushId: string | null | undefined,
  fallback: StudioVibrantSpriteId = "tool-gpen",
): StudioVibrantSpriteId {
  if (!toolOrBrushId) return fallback;
  const normalized = toolOrBrushId.trim().toLowerCase().replace(/[\s_]+/gu, "-");
  if (!normalized) return fallback;

  const exact = ALIAS_TO_SPRITE_ID.get(normalized);
  if (exact) return exact;

  for (const [keywords, spriteId] of KEYWORD_FALLBACKS) {
    if (keywords.some((kw) => normalized.includes(kw))) return spriteId;
  }
  return fallback;
}
