/**
 * 드로잉 스튜디오 컬러 스프라이트 정본 카탈로그 및 도구·브러시·모드 매핑.
 *
 * `apps/web/public/assets/studio/vibrant-sprites/*.webp`에 배포된 44종 투명 WebP 스프라이트를
 * 좌측 도구 레일, 브러시 피커, 5-모드 적응형 크롬 바, 방사형 퀵 휠, 제작 모드 런처에서
 * 일관되게 참조한다. 원시 색상은 포함하지 않으며 OKLCH 액센트 키만 반환한다.
 */

export const STUDIO_VIBRANT_SPRITE_BASE_PATH = "/assets/studio/vibrant-sprites" as const;

export const STUDIO_VIBRANT_TOOL_SPRITE_IDS = [
  "tool-ai-compass",
  "tool-bg3d",
  "tool-bubble-sfx",
  "tool-eraser",
  "tool-eyedropper",
  "tool-fill",
  "tool-gpen",
  "tool-lasso",
  "tool-layers",
  "tool-marker",
  "tool-ruler",
  "tool-screentone",
  "tool-vector",
  "tool-vrm",
  "tool-wand",
  "tool-watercolor",
] as const;

export const STUDIO_VIBRANT_BRUSH_SPRITE_IDS = [
  "brush-airbrush",
  "brush-calligraphy",
  "brush-fx-ribbon",
  "brush-halftone",
  "brush-ink",
  "brush-oil",
  "brush-pastel",
  "brush-watercolor",
] as const;

export const STUDIO_VIBRANT_EMBLEM_SPRITE_IDS = [
  "emblem-benchmark",
  "emblem-bg3d-stage",
  "emblem-character",
  "emblem-community",
  "emblem-discover",
  "emblem-guide-map",
  "emblem-library",
  "emblem-market",
  "emblem-pricing",
  "emblem-production",
  "emblem-studio",
  "emblem-tech-lab",
] as const;

export const STUDIO_VIBRANT_DEVICE_SPRITE_IDS = [
  "device-ar-glasses",
  "device-dial-pad",
  "device-digitizer",
  "device-tv",
  "device-vr-headset",
  "device-watch",
] as const;

export const STUDIO_VIBRANT_TECH_SPRITE_IDS = [
  "tech-remotion",
  "tech-webgpu",
] as const;

export const STUDIO_VIBRANT_ALL_44_SPRITE_IDS = [
  ...STUDIO_VIBRANT_TOOL_SPRITE_IDS,
  ...STUDIO_VIBRANT_BRUSH_SPRITE_IDS,
  ...STUDIO_VIBRANT_EMBLEM_SPRITE_IDS,
  ...STUDIO_VIBRANT_DEVICE_SPRITE_IDS,
  ...STUDIO_VIBRANT_TECH_SPRITE_IDS,
] as const;

export type StudioVibrantSpriteId = (typeof STUDIO_VIBRANT_ALL_44_SPRITE_IDS)[number];

export type StudioVibrantAccentKind =
  | "ink"
  | "brush"
  | "color"
  | "select"
  | "lettering"
  | "bg3d"
  | "vrm"
  | "ai"
  | "layers"
  | "neutral";

export interface StudioVibrantSpriteBinding {
  readonly spriteId: StudioVibrantSpriteId;
  readonly accent: StudioVibrantAccentKind;
  readonly labelKo: string;
}

export function getVibrantSpriteSrc(spriteId: StudioVibrantSpriteId): string {
  return `${STUDIO_VIBRANT_SPRITE_BASE_PATH}/${spriteId}.webp`;
}

const RAIL_TOOL_SPRITE_MAP: Readonly<Record<string, StudioVibrantSpriteBinding>> = {
  select: { spriteId: "tool-vector", accent: "select", labelKo: "선택" },
  transform: { spriteId: "tool-vector", accent: "select", labelKo: "변형" },
  hand: { spriteId: "tool-ruler", accent: "neutral", labelKo: "화면 이동" },
  pen: { spriteId: "tool-gpen", accent: "ink", labelKo: "G펜" },
  "pixel-pencil": { spriteId: "tool-marker", accent: "ink", labelKo: "픽셀 펜" },
  eraser: { spriteId: "tool-eraser", accent: "neutral", labelKo: "지우개" },
  blend: { spriteId: "tool-watercolor", accent: "brush", labelKo: "스머지 혼색" },
  "wet-mix": { spriteId: "brush-watercolor", accent: "brush", labelKo: "웨트 믹스" },
  "dodge-burn": { spriteId: "brush-airbrush", accent: "color", labelKo: "닷지·번" },
  liquify: { spriteId: "tool-wand", accent: "brush", labelKo: "리퀴파이" },
  fill: { spriteId: "tool-fill", accent: "color", labelKo: "채우기" },
  "lasso-fill": { spriteId: "tool-lasso", accent: "color", labelKo: "올가미 채우기" },
  eyedropper: { spriteId: "tool-eyedropper", accent: "color", labelKo: "스포이드" },
  "marquee-rect": { spriteId: "tool-wand", accent: "select", labelKo: "사각 선택" },
  "marquee-circle": { spriteId: "tool-wand", accent: "select", labelKo: "원형 선택" },
  lasso: { spriteId: "tool-lasso", accent: "select", labelKo: "올가미 선택" },
  crop: { spriteId: "tool-ruler", accent: "select", labelKo: "자르기" },
  "smart-shape": { spriteId: "tool-vector", accent: "ink", labelKo: "스마트 도형" },
  "shape-rect": { spriteId: "tool-ruler", accent: "ink", labelKo: "사각형 도형" },
  "shape-ellipse": { spriteId: "tool-vector", accent: "ink", labelKo: "타원 도형" },
  text: { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "텍스트" },
  bubble: { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "말풍선" },
  image: { spriteId: "emblem-library", accent: "layers", labelKo: "이미지 추가" },
  comment: { spriteId: "emblem-community", accent: "lettering", labelKo: "댓글 핀" },
  perspective: { spriteId: "tool-ruler", accent: "bg3d", labelKo: "투시 자" },
  "frame-anim": { spriteId: "tech-remotion", accent: "ai", labelKo: "프레임 애니메이션" },
  mannequin3d: { spriteId: "tool-vrm", accent: "vrm", labelKo: "3D 데생 인형" },
  vrm3d: { spriteId: "tool-vrm", accent: "vrm", labelKo: "3D 캐릭터" },
  "character-shaper": { spriteId: "emblem-character", accent: "vrm", labelKo: "캐릭터 셰이퍼" },
  bg3d: { spriteId: "tool-bg3d", accent: "bg3d", labelKo: "3D 장면" },
  "hybrid-dcc": { spriteId: "emblem-bg3d-stage", accent: "bg3d", labelKo: "Hybrid 3D DCC" },
  reference: { spriteId: "emblem-discover", accent: "layers", labelKo: "참고 이미지" },
  zoom: { spriteId: "emblem-benchmark", accent: "neutral", labelKo: "확대·축소" },
  "zoom-fit": { spriteId: "emblem-guide-map", accent: "neutral", labelKo: "화면 맞춤" },
  "rotate-view": { spriteId: "device-dial-pad", accent: "neutral", labelKo: "캔버스 회전" },
};

export function resolveVibrantSpriteForRailTool(toolId: string): StudioVibrantSpriteBinding {
  return RAIL_TOOL_SPRITE_MAP[toolId] ?? {
    spriteId: "tool-gpen",
    accent: "ink",
    labelKo: toolId,
  };
}

export interface StudioVibrantBrushChipPreset {
  readonly brushId: string;
  readonly spriteId: (typeof STUDIO_VIBRANT_BRUSH_SPRITE_IDS)[number];
  readonly accent: StudioVibrantAccentKind;
  readonly labelKo: string;
}

export const STUDIO_VIBRANT_BRUSH_FAMILY_CHIPS: readonly StudioVibrantBrushChipPreset[] = Object.freeze([
  { brushId: "pen", spriteId: "brush-ink", accent: "ink", labelKo: "잉크 펜" },
  { brushId: "gpen", spriteId: "brush-calligraphy", accent: "ink", labelKo: "캘리·G펜" },
  { brushId: "watercolor", spriteId: "brush-watercolor", accent: "brush", labelKo: "수채화" },
  { brushId: "oil", spriteId: "brush-oil", accent: "color", labelKo: "유화" },
  { brushId: "pastel", spriteId: "brush-pastel", accent: "brush", labelKo: "파스텔" },
  { brushId: "airbrush", spriteId: "brush-airbrush", accent: "color", labelKo: "에어브러시" },
  { brushId: "halftone", spriteId: "brush-halftone", accent: "select", labelKo: "스크린톤" },
  { brushId: "neon", spriteId: "brush-fx-ribbon", accent: "ai", labelKo: "FX 리본" },
]);

export function resolveVibrantSpriteForBrush(brushId: string): StudioVibrantSpriteBinding {
  const key = brushId.toLowerCase();
  if (key.includes("water") || key.includes("wash") || key.includes("wet")) {
    return { spriteId: "brush-watercolor", accent: "brush", labelKo: "수채 브러시" };
  }
  if (key.includes("oil") || key.includes("impasto") || key.includes("acrylic")) {
    return { spriteId: "brush-oil", accent: "color", labelKo: "유화 브러시" };
  }
  if (key.includes("pastel") || key.includes("chalk") || key.includes("pencil") || key.includes("charcoal")) {
    return { spriteId: "brush-pastel", accent: "brush", labelKo: "파스텔·건식" };
  }
  if (key.includes("air") || key.includes("soft") || key.includes("spray") || key.includes("blur")) {
    return { spriteId: "brush-airbrush", accent: "color", labelKo: "에어브러시" };
  }
  if (key.includes("calli") || key.includes("flat") || key.includes("marker") || key.includes("gpen")) {
    return { spriteId: "brush-calligraphy", accent: "ink", labelKo: "캘리·G펜" };
  }
  if (key.includes("tone") || key.includes("half") || key.includes("dot") || key.includes("screen")) {
    return { spriteId: "brush-halftone", accent: "select", labelKo: "하프톤" };
  }
  if (key.includes("fx") || key.includes("neon") || key.includes("glow") || key.includes("ribbon") || key.includes("stamp") || key.includes("particle")) {
    return { spriteId: "brush-fx-ribbon", accent: "ai", labelKo: "FX 리본" };
  }
  return { spriteId: "brush-ink", accent: "ink", labelKo: "잉크 펜" };
}

const ADAPTIVE_MODE_SPRITE_MAP: Readonly<Record<string, StudioVibrantSpriteBinding>> = {
  storyboard: { spriteId: "tool-ruler", accent: "select", labelKo: "콘티" },
  lineart: { spriteId: "tool-gpen", accent: "ink", labelKo: "선화" },
  coloring: { spriteId: "tool-watercolor", accent: "color", labelKo: "채색" },
  lettering: { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "식자" },
  "three-d": { spriteId: "tool-bg3d", accent: "bg3d", labelKo: "3D" },
};

export function resolveVibrantSpriteForAdaptiveMode(modeId: string): StudioVibrantSpriteBinding {
  return ADAPTIVE_MODE_SPRITE_MAP[modeId] ?? { spriteId: "tool-gpen", accent: "ink", labelKo: modeId };
}

const ADAPTIVE_TOOL_SPRITE_MAP: Readonly<Record<string, StudioVibrantSpriteBinding>> = {
  "rough-pencil": { spriteId: "brush-pastel", accent: "ink", labelKo: "콘티 연필" },
  "panel-cut": { spriteId: "tool-ruler", accent: "select", labelKo: "컷 나누기" },
  "bubble-draft": { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "말풍선 초안" },
  "lasso-move": { spriteId: "tool-lasso", accent: "select", labelKo: "영역 옮기기" },
  "rough-eraser": { spriteId: "tool-eraser", accent: "neutral", labelKo: "지우개" },
  "fit-view": { spriteId: "emblem-guide-map", accent: "neutral", labelKo: "화면 맞춤" },
  "eye-flow-guide": { spriteId: "tool-ruler", accent: "select", labelKo: "시선 유도선" },
  "gutter-rhythm": { spriteId: "tool-layers", accent: "layers", labelKo: "컷 간격 정리" },
  "beat-memo": { spriteId: "emblem-production", accent: "lettering", labelKo: "장면 메모" },
  "ref-board": { spriteId: "emblem-discover", accent: "layers", labelKo: "참고 자료" },
  "g-pen": { spriteId: "tool-gpen", accent: "ink", labelKo: "G펜" },
  stabilizer: { spriteId: "tool-vector", accent: "ink", labelKo: "손떨림 보정" },
  "vector-eraser": { spriteId: "tool-eraser", accent: "neutral", labelKo: "선 지우개" },
  "line-weight": { spriteId: "brush-calligraphy", accent: "ink", labelKo: "선 굵기 조절" },
  "symmetry-ruler": { spriteId: "tool-ruler", accent: "select", labelKo: "대칭 자" },
  "undo-stroke": { spriteId: "device-dial-pad", accent: "neutral", labelKo: "되돌리기" },
  "canvas-rotate": { spriteId: "device-dial-pad", accent: "neutral", labelKo: "캔버스 회전" },
  "pressure-curve": { spriteId: "device-digitizer", accent: "ink", labelKo: "필압 곡선" },
  "cross-trim": { spriteId: "tool-vector", accent: "ink", labelKo: "교차선 정리" },
  "sketch-dim": { spriteId: "tool-layers", accent: "layers", labelKo: "밑그림 연하게" },
  "layer-lock": { spriteId: "tool-layers", accent: "layers", labelKo: "레이어 잠금" },
  "lasso-fill": { spriteId: "tool-lasso", accent: "color", labelKo: "올가미 채우기" },
  "close-fill": { spriteId: "tool-fill", accent: "color", labelKo: "틈새 막아 채우기" },
  "watercolor-brush": { spriteId: "tool-watercolor", accent: "brush", labelKo: "수채 브러시" },
  eyedropper: { spriteId: "tool-eyedropper", accent: "color", labelKo: "스포이드" },
  "spectral-mix": { spriteId: "brush-oil", accent: "color", labelKo: "분광 혼색" },
  "clip-mask": { spriteId: "tool-layers", accent: "layers", labelKo: "클리핑 마스크" },
  "multiply-shadow": { spriteId: "tool-screentone", accent: "layers", labelKo: "그림자 레이어" },
  "tone-adjust": { spriteId: "brush-airbrush", accent: "color", labelKo: "색감 미세 보정" },
  "screentone-pack": { spriteId: "tool-screentone", accent: "select", labelKo: "스크린톤" },
  "gradient-map": { spriteId: "brush-fx-ribbon", accent: "color", labelKo: "그라데이션 맵" },
  "colorblind-check": { spriteId: "emblem-benchmark", accent: "color", labelKo: "색약 미리보기" },
  "add-bubble": { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "말풍선 넣기" },
  "edit-dialogue": { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "대사 입력" },
  "tail-handle": { spriteId: "tool-vector", accent: "lettering", labelKo: "꼬리 방향" },
  "sfx-stamp": { spriteId: "brush-fx-ribbon", accent: "lettering", labelKo: "효과음 배치" },
  "font-scale": { spriteId: "tool-marker", accent: "lettering", labelKo: "글꼴·크기" },
  "line-align": { spriteId: "tool-ruler", accent: "lettering", labelKo: "줄바꿈 정렬" },
  "vertical-text": { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "세로쓰기 전환" },
  "outline-stroke": { spriteId: "brush-ink", accent: "lettering", labelKo: "글자 테두리" },
  "locale-reflow": { spriteId: "emblem-guide-map", accent: "lettering", labelKo: "다국어 대사 검수" },
  "batch-replace": { spriteId: "tool-wand", accent: "lettering", labelKo: "대사 일괄 수정" },
  "pose-preset": { spriteId: "tool-vrm", accent: "vrm", labelKo: "포즈 고르기" },
  "lookat-pin": { spriteId: "emblem-character", accent: "vrm", labelKo: "시선 고정 핀" },
  "camera-angle": { spriteId: "tool-bg3d", accent: "bg3d", labelKo: "카메라 구도" },
  "light-direction": { spriteId: "emblem-bg3d-stage", accent: "bg3d", labelKo: "빛 방향 조절" },
  "perspective-grid": { spriteId: "tool-ruler", accent: "bg3d", labelKo: "투시 눈금선" },
  "extract-lines": { spriteId: "tool-gpen", accent: "ink", labelKo: "선화 추출" },
  "joint-limit": { spriteId: "tool-vrm", accent: "vrm", labelKo: "관절 각도 제한" },
  "cloth-pushout": { spriteId: "emblem-character", accent: "vrm", labelKo: "의상 겹침 보정" },
  "prop-snap": { spriteId: "tool-bg3d", accent: "bg3d", labelKo: "소품 배치" },
  "render-quality": { spriteId: "tech-webgpu", accent: "bg3d", labelKo: "미리보기 화질" },
};

export function resolveVibrantSpriteForAdaptiveTool(toolId: string, modeId?: string): StudioVibrantSpriteBinding {
  return ADAPTIVE_TOOL_SPRITE_MAP[toolId] ?? resolveVibrantSpriteForAdaptiveMode(modeId ?? "lineart");
}

const QUICK_ACTION_SPRITE_MAP: Readonly<Record<string, StudioVibrantSpriteBinding>> = {
  undo: { spriteId: "device-dial-pad", accent: "neutral", labelKo: "실행 취소" },
  redo: { spriteId: "device-dial-pad", accent: "neutral", labelKo: "다시 실행" },
  "flip-canvas-h": { spriteId: "tool-ruler", accent: "select", labelKo: "좌우 반전" },
  "toggle-alpha-lock": { spriteId: "tool-layers", accent: "layers", labelKo: "알파 잠금" },
  "toggle-clipping-mask": { spriteId: "tool-layers", accent: "layers", labelKo: "클리핑 마스크" },
  "colordrop-fill": { spriteId: "tool-fill", accent: "color", labelKo: "채우기" },
  "fit-canvas": { spriteId: "emblem-guide-map", accent: "neutral", labelKo: "화면 맞춤" },
  eyedropper: { spriteId: "tool-eyedropper", accent: "color", labelKo: "스포이드" },
  "merge-down": { spriteId: "tool-layers", accent: "layers", labelKo: "아래 레이어 병합" },
  "clear-layer": { spriteId: "tool-eraser", accent: "neutral", labelKo: "레이어 비우기" },
};

export function resolveVibrantSpriteForQuickAction(actionId: string): StudioVibrantSpriteBinding {
  return QUICK_ACTION_SPRITE_MAP[actionId] ?? { spriteId: "tool-wand", accent: "ink", labelKo: actionId };
}

const CREATION_MODE_SPRITE_MAP: Readonly<Record<string, StudioVibrantSpriteBinding>> = {
  draw: { spriteId: "tool-gpen", accent: "ink", labelKo: "드로잉" },
  story: { spriteId: "tool-bubble-sfx", accent: "lettering", labelKo: "스토리" },
  character: { spriteId: "emblem-character", accent: "vrm", labelKo: "캐릭터" },
  background: { spriteId: "emblem-bg3d-stage", accent: "bg3d", labelKo: "배경" },
  assets: { spriteId: "emblem-library", accent: "color", labelKo: "에셋" },
  ai: { spriteId: "tool-ai-compass", accent: "ai", labelKo: "AI 디렉터" },
};

export function resolveVibrantSpriteForCreationMode(modeId: string): StudioVibrantSpriteBinding {
  return CREATION_MODE_SPRITE_MAP[modeId] ?? { spriteId: "emblem-studio", accent: "ink", labelKo: modeId };
}
