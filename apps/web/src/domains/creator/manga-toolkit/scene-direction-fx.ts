/**
 * 웹툰 세로 스크롤 및 컷 전용 장면 연출 · 특수 효과(VFX) 결정적 엔진.
 *
 * 기존 페이지 모드 효과선(`effect-lines.ts`)을 확장하여 웹툰 컷/스크롤 연출에 필요한
 * 대기 파티클, 임팩트 프레임, 오라/마법진, 글리치/크로매틱, 시네마틱 레터박스,
 * 스크롤 트리거 키프레임을 결정적(deterministic) SVG/레이어 스펙으로 생성한다.
 */

import { createSeededRandom } from "./effect-lines";

export type SceneFxCategory =
  | "impact"
  | "atmosphere"
  | "emotion"
  | "cinematic"
  | "fantasy"
  | "glitch";

export type SceneFxBlendMode =
  | "normal"
  | "screen"
  | "multiply"
  | "overlay"
  | "add";

export type SceneFxPresetId =
  | "impact-frame-burst"
  | "shockwave-ring"
  | "speed-zoom-blur"
  | "cherry-blossom-drift"
  | "heavy-rain-streak"
  | "snowfall-soft"
  | "ember-sparks"
  | "romance-sparkle-bokeh"
  | "horror-vignette-noise"
  | "arcane-aura-circle"
  | "chromatic-glitch-split"
  | "cinematic-letterbox-flare";

export interface SceneFxKeyframe {
  /** 0~1 사이 스크롤 진행률 */
  readonly scrollProgress: number;
  /** 0~1 사이 불투명도 */
  readonly opacity: number;
  /** 확대/축소 배율 */
  readonly scale: number;
  /** 카메라 셰이크 진폭 (px) */
  readonly shakePx: number;
}

export interface SceneDirectionFxConfig {
  readonly presetId: SceneFxPresetId;
  readonly width: number;
  readonly height: number;
  /** 효과 강도 (0~100) */
  readonly intensity: number;
  /** 파티클/선 밀도 (0~100) */
  readonly density: number;
  /** 주 색상 (HEX) */
  readonly primaryColor: string;
  /** 보조 색상 (HEX) */
  readonly secondaryColor: string;
  /** 전체 불투명도 (0~1) */
  readonly opacity: number;
  readonly blendMode: SceneFxBlendMode;
  readonly seed: number;
  /** 초점 정규화 X (0~1) */
  readonly focusX: number;
  /** 초점 정규화 Y (0~1) */
  readonly focusY: number;
}

export interface SceneFxPresetMeta {
  readonly id: SceneFxPresetId;
  readonly nameKo: string;
  readonly category: SceneFxCategory;
  readonly descriptionKo: string;
  readonly recommendedBlendMode: SceneFxBlendMode;
  readonly defaultPrimaryColor: string;
  readonly defaultSecondaryColor: string;
  readonly defaultIntensity: number;
  readonly defaultDensity: number;
  readonly scrollKeyframes: readonly SceneFxKeyframe[];
}

export interface SceneFxRenderArtifact {
  readonly presetId: SceneFxPresetId;
  readonly blendMode: SceneFxBlendMode;
  readonly opacity: number;
  readonly svgMarkup: string;
  readonly elementCount: number;
  readonly scrollKeyframes: readonly SceneFxKeyframe[];
  readonly layerMetadata: {
    readonly layerName: string;
    readonly category: SceneFxCategory;
    readonly seed: number;
  };
}

export const SCENE_FX_PRESETS: readonly SceneFxPresetMeta[] = Object.freeze([
  {
    id: "impact-frame-burst",
    nameKo: "임팩트 프레임 버스트",
    category: "impact",
    descriptionKo: "타격 순간 흑백 고대비 섬광과 방사선으로 극적인 충격감을 연출합니다.",
    recommendedBlendMode: "overlay",
    defaultPrimaryColor: "#111827",
    defaultSecondaryColor: "#F9FAFB",
    defaultIntensity: 85,
    defaultDensity: 72,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.15, scale: 0.92, shakePx: 0 },
      { scrollProgress: 0.45, opacity: 1, scale: 1.04, shakePx: 14 },
      { scrollProgress: 1, opacity: 0.2, scale: 1, shakePx: 0 },
    ],
  },
  {
    id: "shockwave-ring",
    nameKo: "충격파 동심원 링",
    category: "impact",
    descriptionKo: "타격 중심점에서 바깥으로 퍼지는 다중 충격파 파동과 파편을 생성합니다.",
    recommendedBlendMode: "screen",
    defaultPrimaryColor: "#38BDF8",
    defaultSecondaryColor: "#E0F2FE",
    defaultIntensity: 78,
    defaultDensity: 60,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.2, scale: 0.75, shakePx: 2 },
      { scrollProgress: 0.5, opacity: 0.95, scale: 1.08, shakePx: 10 },
      { scrollProgress: 1, opacity: 0.1, scale: 1.2, shakePx: 0 },
    ],
  },
  {
    id: "speed-zoom-blur",
    nameKo: "스크롤 고속 줌 블러",
    category: "impact",
    descriptionKo: "세로 스크롤 돌진·낙하 장면에 속도감을 부여하는 수직/방사 가속선입니다.",
    recommendedBlendMode: "normal",
    defaultPrimaryColor: "#0F172A",
    defaultSecondaryColor: "#64748B",
    defaultIntensity: 70,
    defaultDensity: 80,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.4, scale: 1, shakePx: 3 },
      { scrollProgress: 0.6, opacity: 0.9, scale: 1.03, shakePx: 6 },
      { scrollProgress: 1, opacity: 0.4, scale: 1, shakePx: 2 },
    ],
  },
  {
    id: "cherry-blossom-drift",
    nameKo: "벚꽃 흩날림",
    category: "atmosphere",
    descriptionKo: "로맨스·학원물 컷에 깊이감을 더하는 원근 꽃잎 파티클입니다.",
    recommendedBlendMode: "normal",
    defaultPrimaryColor: "#F9A8D4",
    defaultSecondaryColor: "#FCE7F3",
    defaultIntensity: 62,
    defaultDensity: 55,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.65, scale: 1, shakePx: 0 },
      { scrollProgress: 1, opacity: 0.95, scale: 1.02, shakePx: 0 },
    ],
  },
  {
    id: "heavy-rain-streak",
    nameKo: "폭우 빗줄기 & 물보라",
    category: "atmosphere",
    descriptionKo: "사선 빗줄기와 지면 빗방울 튀김으로 비극·긴장 분위기를 강화합니다.",
    recommendedBlendMode: "screen",
    defaultPrimaryColor: "#BAE6FD",
    defaultSecondaryColor: "#E0F2FE",
    defaultIntensity: 75,
    defaultDensity: 82,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.7, scale: 1, shakePx: 1 },
      { scrollProgress: 1, opacity: 0.85, scale: 1, shakePx: 1 },
    ],
  },
  {
    id: "snowfall-soft",
    nameKo: "겨울 함박눈 보케",
    category: "atmosphere",
    descriptionKo: "전경 대형 보케와 원경 눈송이를 레이어링한 서정적 강설 효과입니다.",
    recommendedBlendMode: "screen",
    defaultPrimaryColor: "#FFFFFF",
    defaultSecondaryColor: "#DBEAFE",
    defaultIntensity: 68,
    defaultDensity: 65,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.75, scale: 1, shakePx: 0 },
      { scrollProgress: 1, opacity: 0.9, scale: 1.01, shakePx: 0 },
    ],
  },
  {
    id: "ember-sparks",
    nameKo: "불티 · 화염 스파크",
    category: "fantasy",
    descriptionKo: "전투·폭발·화재 컷 위로 상승하는 고휘도 불씨와 열기 입자입니다.",
    recommendedBlendMode: "add",
    defaultPrimaryColor: "#F97316",
    defaultSecondaryColor: "#FDE047",
    defaultIntensity: 82,
    defaultDensity: 68,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.6, scale: 1, shakePx: 2 },
      { scrollProgress: 0.5, opacity: 1, scale: 1.03, shakePx: 4 },
      { scrollProgress: 1, opacity: 0.7, scale: 1, shakePx: 1 },
    ],
  },
  {
    id: "romance-sparkle-bokeh",
    nameKo: "로판 샤랄라 스파클",
    category: "emotion",
    descriptionKo: "인물 등장·고백 컷에 빛망울과 십자 반짝임을 배치합니다.",
    recommendedBlendMode: "screen",
    defaultPrimaryColor: "#FDE68A",
    defaultSecondaryColor: "#FBCFE8",
    defaultIntensity: 72,
    defaultDensity: 50,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.4, scale: 0.98, shakePx: 0 },
      { scrollProgress: 0.5, opacity: 0.95, scale: 1.02, shakePx: 0 },
      { scrollProgress: 1, opacity: 0.6, scale: 1, shakePx: 0 },
    ],
  },
  {
    id: "horror-vignette-noise",
    nameKo: "스릴러 심연 비네트",
    category: "emotion",
    descriptionKo: "외곽 암전 비네팅과 불규칙 긁힘선으로 심리적 압박감을 조성합니다.",
    recommendedBlendMode: "multiply",
    defaultPrimaryColor: "#09090B",
    defaultSecondaryColor: "#7F1D1D",
    defaultIntensity: 84,
    defaultDensity: 64,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.5, scale: 1, shakePx: 0 },
      { scrollProgress: 0.7, opacity: 0.95, scale: 1.01, shakePx: 5 },
      { scrollProgress: 1, opacity: 0.9, scale: 1, shakePx: 3 },
    ],
  },
  {
    id: "arcane-aura-circle",
    nameKo: "마법진 · 각성 오라",
    category: "fantasy",
    descriptionKo: "기하학 마법진 링과 상승 에너지 기둥을 인물 배경에 합성합니다.",
    recommendedBlendMode: "add",
    defaultPrimaryColor: "#8B5CF6",
    defaultSecondaryColor: "#38BDF8",
    defaultIntensity: 80,
    defaultDensity: 58,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.3, scale: 0.85, shakePx: 0 },
      { scrollProgress: 0.5, opacity: 1, scale: 1.05, shakePx: 6 },
      { scrollProgress: 1, opacity: 0.75, scale: 1.02, shakePx: 2 },
    ],
  },
  {
    id: "chromatic-glitch-split",
    nameKo: "글리치 · RGB 수차 분리",
    category: "glitch",
    descriptionKo: "시스템 각성·기억 왜곡·사이버펑크 연출용 수평 스캔라인과 RGB 분리입니다.",
    recommendedBlendMode: "screen",
    defaultPrimaryColor: "#06B6D4",
    defaultSecondaryColor: "#EC4899",
    defaultIntensity: 76,
    defaultDensity: 62,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.2, scale: 1, shakePx: 0 },
      { scrollProgress: 0.5, opacity: 0.95, scale: 1.01, shakePx: 8 },
      { scrollProgress: 1, opacity: 0.3, scale: 1, shakePx: 0 },
    ],
  },
  {
    id: "cinematic-letterbox-flare",
    nameKo: "시네마틱 레터박스 & 렌즈플레어",
    category: "cinematic",
    descriptionKo: "상하 시네마 레터박스와 아나모픽 수평 플레어로 영화적 하이라이트를 만듭니다.",
    recommendedBlendMode: "screen",
    defaultPrimaryColor: "#020617",
    defaultSecondaryColor: "#60A5FA",
    defaultIntensity: 70,
    defaultDensity: 45,
    scrollKeyframes: [
      { scrollProgress: 0, opacity: 0.85, scale: 1, shakePx: 0 },
      { scrollProgress: 1, opacity: 0.95, scale: 1, shakePx: 0 },
    ],
  },
]);

export function getSceneFxPreset(presetId: SceneFxPresetId): SceneFxPresetMeta {
  return SCENE_FX_PRESETS.find((preset) => preset.id === presetId) ?? SCENE_FX_PRESETS[0];
}

export function createDefaultSceneFxConfig(
  presetId: SceneFxPresetId,
  width = 800,
  height = 1280,
): SceneDirectionFxConfig {
  const preset = getSceneFxPreset(presetId);
  return {
    presetId: preset.id,
    width: Math.max(64, Math.round(width)),
    height: Math.max(64, Math.round(height)),
    intensity: preset.defaultIntensity,
    density: preset.defaultDensity,
    primaryColor: preset.defaultPrimaryColor,
    secondaryColor: preset.defaultSecondaryColor,
    opacity: 0.9,
    blendMode: preset.recommendedBlendMode,
    seed: 20261119,
    focusX: 0.5,
    focusY: 0.45,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function r(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeHexColor(hex: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/u.test(hex) ? hex : fallback;
}

/**
 * 설정값을 기반으로 결정적(deterministic) SVG 특수효과 레이어 마크업을 생성한다.
 */
export function renderSceneDirectionFx(config: SceneDirectionFxConfig): SceneFxRenderArtifact {
  const preset = getSceneFxPreset(config.presetId);
  const w = clamp(Math.round(config.width), 64, 4096);
  const h = clamp(Math.round(config.height), 64, 16384);
  const intensity = clamp(config.intensity, 0, 100) / 100;
  const density = clamp(config.density, 1, 100) / 100;
  const opacity = clamp(config.opacity, 0, 1);
  const cx = clamp(config.focusX, 0, 1) * w;
  const cy = clamp(config.focusY, 0, 1) * h;
  const primary = sanitizeHexColor(config.primaryColor, preset.defaultPrimaryColor);
  const secondary = sanitizeHexColor(config.secondaryColor, preset.defaultSecondaryColor);
  const rand = createSeededRandom(config.seed);

  const elements: string[] = [];
  const defs: string[] = [];

  if (config.presetId === "impact-frame-burst" || config.presetId === "speed-zoom-blur") {
    const rayCount = Math.max(12, Math.round(24 + density * 64));
    const maxR = Math.hypot(w, h) * 0.72;
    const innerR = Math.min(w, h) * (0.14 + (1 - intensity) * 0.16);
    for (let i = 0; i < rayCount; i += 1) {
      const angle = (Math.PI * 2 * i) / rayCount + (rand() - 0.5) * 0.08;
      const spread = (0.008 + rand() * 0.022) * (0.6 + intensity * 0.8);
      const rIn = innerR * (0.75 + rand() * 0.5);
      const x1 = cx + Math.cos(angle) * rIn;
      const y1 = cy + Math.sin(angle) * rIn;
      const x2 = cx + Math.cos(angle - spread) * maxR;
      const y2 = cy + Math.sin(angle - spread) * maxR;
      const x3 = cx + Math.cos(angle + spread) * maxR;
      const y3 = cy + Math.sin(angle + spread) * maxR;
      const fill = i % 3 === 0 ? secondary : primary;
      elements.push(
        `<polygon points="${r(x1)},${r(y1)} ${r(x2)},${r(y2)} ${r(x3)},${r(y3)}" fill="${fill}" opacity="${r(0.45 + rand() * 0.5)}" />`,
      );
    }
  } else if (config.presetId === "shockwave-ring" || config.presetId === "arcane-aura-circle") {
    const rings = Math.max(2, Math.round(3 + density * 5));
    const baseR = Math.min(w, h) * (0.16 + intensity * 0.28);
    for (let i = 0; i < rings; i += 1) {
      const radius = baseR * (0.45 + (i / rings) * 0.9);
      const strokeW = r(1.5 + (rings - i) * 1.4 * intensity);
      const dash = config.presetId === "arcane-aura-circle" && i % 2 === 1 ? ` stroke-dasharray="${r(12 + i * 4)} ${r(8 + i * 2)}"` : "";
      elements.push(
        `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}" fill="none" stroke="${i % 2 === 0 ? primary : secondary}" stroke-width="${strokeW}" opacity="${r(0.4 + intensity * 0.55)}"${dash} />`,
      );
    }
    if (config.presetId === "arcane-aura-circle") {
      const pts = 6;
      const hexPts: string[] = [];
      for (let i = 0; i < pts; i += 1) {
        const a = (Math.PI * 2 * i) / pts - Math.PI / 2;
        hexPts.push(`${r(cx + Math.cos(a) * baseR * 0.72)},${r(cy + Math.sin(a) * baseR * 0.72)}`);
      }
      elements.push(
        `<polygon points="${hexPts.join(" ")}" fill="none" stroke="${secondary}" stroke-width="${r(2 + intensity * 2)}" opacity="0.85" />`,
      );
    }
  } else if (config.presetId === "heavy-rain-streak") {
    const count = Math.max(18, Math.round(28 + density * 90));
    for (let i = 0; i < count; i += 1) {
      const x1 = rand() * w;
      const y1 = rand() * h;
      const len = (40 + rand() * 110) * (0.6 + intensity * 0.7);
      const x2 = x1 - len * 0.24;
      const y2 = y1 + len;
      elements.push(
        `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${i % 2 === 0 ? primary : secondary}" stroke-width="${r(1 + rand() * 1.8)}" opacity="${r(0.35 + rand() * 0.5)}" stroke-linecap="round" />`,
      );
    }
  } else if (
    config.presetId === "cherry-blossom-drift" ||
    config.presetId === "snowfall-soft" ||
    config.presetId === "ember-sparks" ||
    config.presetId === "romance-sparkle-bokeh"
  ) {
    const count = Math.max(12, Math.round(16 + density * 60));
    for (let i = 0; i < count; i += 1) {
      const px = rand() * w;
      const py = rand() * h;
      const size = (4 + rand() * 18) * (0.6 + intensity * 0.6);
      const fill = i % 2 === 0 ? primary : secondary;
      const alpha = r(0.35 + rand() * 0.6);
      if (config.presetId === "cherry-blossom-drift") {
        const rot = r(rand() * 360);
        elements.push(
          `<ellipse cx="${r(px)}" cy="${r(py)}" rx="${r(size)}" ry="${r(size * 0.55)}" fill="${fill}" opacity="${alpha}" transform="rotate(${rot} ${r(px)} ${r(py)})" />`,
        );
      } else if (config.presetId === "romance-sparkle-bokeh") {
        const s = size * 1.1;
        elements.push(
          `<path d="M ${r(px)} ${r(py - s)} Q ${r(px)} ${r(py)} ${r(px + s)} ${r(py)} Q ${r(px)} ${r(py)} ${r(px)} ${r(py + s)} Q ${r(px)} ${r(py)} ${r(px - s)} ${r(py)} Q ${r(px)} ${r(py)} ${r(px)} ${r(py - s)} Z" fill="${fill}" opacity="${alpha}" />`,
        );
      } else {
        elements.push(
          `<circle cx="${r(px)}" cy="${r(py)}" r="${r(size * 0.5)}" fill="${fill}" opacity="${alpha}" />`,
        );
      }
    }
  } else if (config.presetId === "horror-vignette-noise") {
    defs.push(
      `<radialGradient id="fx-horror-vig" cx="50%" cy="50%" r="65%"><stop offset="35%" stop-color="${primary}" stop-opacity="0" /><stop offset="100%" stop-color="${primary}" stop-opacity="${r(0.45 + intensity * 0.5)}" /></radialGradient>`,
    );
    elements.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="url(#fx-horror-vig)" />`);
    const scratches = Math.max(8, Math.round(12 + density * 40));
    for (let i = 0; i < scratches; i += 1) {
      const sx = rand() * w;
      const sy = rand() * h;
      const len = 30 + rand() * 140;
      elements.push(
        `<line x1="${r(sx)}" y1="${r(sy)}" x2="${r(sx + (rand() - 0.5) * 18)}" y2="${r(sy + len)}" stroke="${secondary}" stroke-width="${r(0.8 + rand() * 1.4)}" opacity="${r(0.25 + rand() * 0.45)}" />`,
      );
    }
  } else if (config.presetId === "chromatic-glitch-split") {
    const slices = Math.max(6, Math.round(8 + density * 24));
    for (let i = 0; i < slices; i += 1) {
      const gy = rand() * h;
      const gh = 4 + rand() * 22 * intensity;
      const shift = (8 + rand() * 28) * intensity;
      elements.push(
        `<rect x="${r(-shift)}" y="${r(gy)}" width="${w}" height="${r(gh)}" fill="${primary}" opacity="${r(0.22 + rand() * 0.35)}" />`,
      );
      elements.push(
        `<rect x="${r(shift)}" y="${r(gy + 2)}" width="${w}" height="${r(gh * 0.8)}" fill="${secondary}" opacity="${r(0.22 + rand() * 0.35)}" />`,
      );
    }
  } else {
    // cinematic-letterbox-flare
    const barH = Math.round(h * (0.06 + intensity * 0.08));
    elements.push(`<rect x="0" y="0" width="${w}" height="${barH}" fill="${primary}" opacity="0.96" />`);
    elements.push(`<rect x="0" y="${h - barH}" width="${w}" height="${barH}" fill="${primary}" opacity="0.96" />`);
    defs.push(
      `<linearGradient id="fx-flare" x1="0%" y1="50%" x2="100%" y2="50%"><stop offset="0%" stop-color="${secondary}" stop-opacity="0" /><stop offset="50%" stop-color="${secondary}" stop-opacity="${r(0.45 + intensity * 0.5)}" /><stop offset="100%" stop-color="${secondary}" stop-opacity="0" /></linearGradient>`,
    );
    elements.push(
      `<rect x="0" y="${r(cy - 6)}" width="${w}" height="${r(12 + intensity * 14)}" fill="url(#fx-flare)" />`,
    );
  }

  const defsMarkup = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
  const svgMarkup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-fx-preset="${config.presetId}" data-blend="${config.blendMode}">` +
    `${defsMarkup}<g opacity="${r(opacity)}">${elements.join("")}</g></svg>`;

  return {
    presetId: config.presetId,
    blendMode: config.blendMode,
    opacity,
    svgMarkup,
    elementCount: elements.length,
    scrollKeyframes: preset.scrollKeyframes,
    layerMetadata: {
      layerName: `[FX] ${preset.nameKo}`,
      category: preset.category,
      seed: config.seed,
    },
  };
}
