/**
 * 웹툰 형식의 3D/2.5D 컷 모델러 및 AI 이미지 생성 통합 파이프라인 모델.
 *
 * 웹툰 세로 스크롤(9:16, 4:5, 1:1) 컷 구도에서 캐릭터 위치·포즈·표정·카메라 앵글·조명과
 * 장르 화풍 프리셋을 모델링하고, 일관성 시드(Character Consistency Token)가 보존된
 * 이미지 생성 요청 페이로드 및 로컬 툰 셰이딩 SVG 컷 프리뷰를 생성한다.
 */

export type WebtoonArtStyleId =
  | "rofan-glow"
  | "hunter-action"
  | "murim-ink"
  | "modern-romance"
  | "thriller-noir"
  | "slice-of-life-pastel"
  | "shonen-cel"
  | "monochrome-manga";

export type WebtoonCutAspectRatio = "9:16" | "4:5" | "1:1" | "16:9";

export type WebtoonCameraShot =
  | "extreme-closeup"
  | "bust-shot"
  | "waist-shot"
  | "full-body"
  | "low-angle-hero"
  | "high-angle-dramatic"
  | "over-the-shoulder";

export type WebtoonLightingPreset =
  | "sunlit-window"
  | "golden-hour-rim"
  | "moonlit-blue"
  | "neon-cyber"
  | "dramatic-chiaroscuro"
  | "soft-studio-flat";

export interface WebtoonModelerCharacterSlot {
  readonly id: string;
  readonly name: string;
  readonly consistencySeed: string;
  readonly pose: string;
  readonly expression: string;
  /** 정규화 X (0~1) */
  readonly x: number;
  /** 정규화 Y (0~1) */
  readonly y: number;
  /** 크기 배율 (0.4~2.0) */
  readonly scale: number;
}

export type Modular3dKitbashId =
  | "none"
  | "seoul-rooftop-kit"
  | "modern-cafe-interior"
  | "rofan-palace-hall"
  | "school-corridor-kit";

export interface Modular3dKitbashPreset {
  readonly id: Modular3dKitbashId;
  readonly labelKo: string;
  readonly snapGridMeters: number;
  readonly manifoldVerified: boolean;
  readonly promptTokens: string;
}

export const WEBTOON_MODULAR_3D_SETS: readonly Modular3dKitbashPreset[] = Object.freeze([
  {
    id: "none",
    labelKo: "자유 배경 (모듈 미사용)",
    snapGridMeters: 1,
    manifoldVerified: true,
    promptTokens: "",
  },
  {
    id: "seoul-rooftop-kit",
    labelKo: "서울 옥상 조립형 3D 세트 (1m 스냅)",
    snapGridMeters: 1,
    manifoldVerified: true,
    promptTokens: "modular 3D Seoul concrete rooftop parapet, water tank, dusk skyline perspective",
  },
  {
    id: "modern-cafe-interior",
    labelKo: "모던 카페 인테리어 키트 (1m 스냅)",
    snapGridMeters: 1,
    manifoldVerified: true,
    promptTokens: "modular 3D modern Korean cafe interior, sunlit floor-to-ceiling windows, timber counter",
  },
  {
    id: "rofan-palace-hall",
    labelKo: "로판 궁전 아치 회랑 키트 (1m 스냅)",
    snapGridMeters: 1,
    manifoldVerified: true,
    promptTokens: "modular 3D baroque fantasy palace corridor, marble columns, arched stained glass",
  },
  {
    id: "school-corridor-kit",
    labelKo: "학원 복도·교실 표준 키트 (1m 스냅)",
    snapGridMeters: 1,
    manifoldVerified: true,
    promptTokens: "modular 3D Korean high school hallway, lockers, afternoon window light beams",
  },
]);

export interface WebtoonModelerSceneSpec {
  readonly cutTitle: string;
  readonly aspectRatio: WebtoonCutAspectRatio;
  readonly artStyle: WebtoonArtStyleId;
  readonly cameraShot: WebtoonCameraShot;
  readonly lighting: WebtoonLightingPreset;
  readonly modular3dKit?: Modular3dKitbashId;
  readonly sceneAnchorId?: string;
  readonly partialInpaintRegion?: "full-cut" | "character-face" | "background-only" | "props-only";
  readonly directorReviewRequired?: boolean;
  readonly backgroundPrompt: string;
  readonly lineWeight: "thin" | "medium" | "bold";
  readonly celShadingSteps: 2 | 3 | 4;
  readonly preserveLineartPass: boolean;
  readonly characters: readonly WebtoonModelerCharacterSlot[];
  readonly negativePrompt: string;
  readonly seed: number;
}

export interface WebtoonArtStyleMeta {
  readonly id: WebtoonArtStyleId;
  readonly labelKo: string;
  readonly promptTokens: string;
  readonly paletteHex: readonly [string, string, string];
}

export interface CompiledWebtoonImageGenRequest {
  readonly positivePrompt: string;
  readonly negativePrompt: string;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly artStyle: WebtoonArtStyleId;
  readonly renderPasses: readonly ("lineart" | "flat-color" | "cel-shade" | "composite")[];
  readonly characterConsistencyTokens: readonly {
    readonly characterId: string;
    readonly name: string;
    readonly token: string;
  }[];
  readonly previewSvg: string;
}

export const WEBTOON_ART_STYLES: readonly WebtoonArtStyleMeta[] = Object.freeze([
  {
    id: "rofan-glow",
    labelKo: "로맨스판타지 (화사한 글로우)",
    promptTokens: "Korean webtoon romance fantasy, crisp delicate lineart, luminous rim light, jeweled details, painterly soft bloom",
    paletteHex: ["#FCE7F3", "#F472B6", "#3B0764"],
  },
  {
    id: "hunter-action",
    labelKo: "현대판타지 · 헌터 액션",
    promptTokens: "Korean action webtoon, sharp dynamic ink lineart, high-contrast cel shading, glowing mana aura, cinematic speed composition",
    paletteHex: ["#0F172A", "#38BDF8", "#F97316"],
  },
  {
    id: "murim-ink",
    labelKo: "무협 · 수묵 담채",
    promptTokens: "Korean martial arts murim webtoon, expressive brush ink strokes, atmospheric mist, traditional ink-wash shading",
    paletteHex: ["#F5F5F4", "#57534E", "#991B1B"],
  },
  {
    id: "modern-romance",
    labelKo: "현대 로맨스 (청량 웹툰)",
    promptTokens: "Modern Korean romance webtoon, clean thin lineart, warm daylight palette, soft skin tone gradients, expressive eyes",
    paletteHex: ["#FFF7ED", "#FB923C", "#1E293B"],
  },
  {
    id: "thriller-noir",
    labelKo: "스릴러 · 느와르",
    promptTokens: "Korean thriller webtoon, heavy dramatic shadows, desaturated cold palette, tense camera angle, gritty texture",
    paletteHex: ["#18181B", "#52525B", "#DC2626"],
  },
  {
    id: "slice-of-life-pastel",
    labelKo: "일상 · 힐링 파스텔",
    promptTokens: "Warm slice-of-life webtoon, cozy pastel color palette, gentle rounded lineart, clean flat shading",
    paletteHex: ["#FEFCE8", "#86EFAC", "#475569"],
  },
  {
    id: "shonen-cel",
    labelKo: "학원 · 소년만화 셀채색",
    promptTokens: "Dynamic shonen webtoon, crisp bold outlines, 3-step anime cel shading, vivid saturated colors",
    paletteHex: ["#EFF6FF", "#2563EB", "#F59E0B"],
  },
  {
    id: "monochrome-manga",
    labelKo: "흑백 만화 · 스크린톤",
    promptTokens: "Monochrome manga style, black G-pen ink, clean screentone halftones, high contrast stark whites",
    paletteHex: ["#FFFFFF", "#9CA3AF", "#111827"],
  },
]);

const ASPECT_DIMENSIONS: Readonly<Record<WebtoonCutAspectRatio, { width: number; height: number }>> =
  Object.freeze({
    "9:16": { width: 800, height: 1424 },
    "4:5": { width: 800, height: 1000 },
    "1:1": { width: 960, height: 960 },
    "16:9": { width: 1280, height: 720 },
  });

const CAMERA_PROMPT_MAP: Readonly<Record<WebtoonCameraShot, string>> = Object.freeze({
  "extreme-closeup": "extreme close-up on eyes and facial expression, shallow depth of field",
  "bust-shot": "bust shot framing head and shoulders, vertical webtoon composition",
  "waist-shot": "waist-up medium shot, balanced dialogue headroom for speech balloons",
  "full-body": "full-body character shot with grounded perspective floor",
  "low-angle-hero": "dramatic low-angle heroic perspective looking upward",
  "high-angle-dramatic": "high-angle bird-eye dramatic perspective looking downward",
  "over-the-shoulder": "over-the-shoulder cinematic dialogue shot",
});

const LIGHTING_PROMPT_MAP: Readonly<Record<WebtoonLightingPreset, string>> = Object.freeze({
  "sunlit-window": "warm afternoon sunlight streaming through window blinds",
  "golden-hour-rim": "golden hour sunset backlight with warm rim lighting",
  "moonlit-blue": "cool silver moonlight with deep blue ambient shadows",
  "neon-cyber": "vibrant cyan and magenta neon rim lighting on wet surfaces",
  "dramatic-chiaroscuro": "high-contrast chiaroscuro key light from single side source",
  "soft-studio-flat": "clean even studio lighting optimized for webtoon readability",
});

export function createDefaultWebtoonModelerScene(): WebtoonModelerSceneSpec {
  return {
    cutTitle: "1화 12컷 — 주인공 각성",
    aspectRatio: "9:16",
    artStyle: "hunter-action",
    cameraShot: "low-angle-hero",
    lighting: "golden-hour-rim",
    modular3dKit: "seoul-rooftop-kit",
    sceneAnchorId: "ANCHOR-EP01-ROOFTOP",
    partialInpaintRegion: "full-cut",
    directorReviewRequired: true,
    backgroundPrompt: "부서진 서울 도심 옥상, 노을 지는 하늘과 떠다니는 파편",
    lineWeight: "medium",
    celShadingSteps: 3,
    preserveLineartPass: true,
    characters: [
      {
        id: "char-lead-1",
        name: "강지훈",
        consistencySeed: "CHAR-JIHUN-V1",
        pose: "검을 치켜든 전투 준비 자세",
        expression: "결연한 눈빛",
        x: 0.5,
        y: 0.58,
        scale: 1,
      },
    ],
    negativePrompt: "blurry, deformed hands, watermark, lowres, extra fingers, text artifacts",
    seed: 20261119,
  };
}

export function getWebtoonArtStyle(styleId: WebtoonArtStyleId): WebtoonArtStyleMeta {
  return WEBTOON_ART_STYLES.find((s) => s.id === styleId) ?? WEBTOON_ART_STYLES[0];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * 웹툰 모델러 씬 스펙을 AI 이미지 생성 요청 페이로드와 로컬 툰 셰이딩 SVG 컷 프리뷰로 컴파일한다.
 */
export function compileWebtoonModelerToImageGen(
  scene: WebtoonModelerSceneSpec,
): CompiledWebtoonImageGenRequest {
  const style = getWebtoonArtStyle(scene.artStyle);
  const dim = ASPECT_DIMENSIONS[scene.aspectRatio];
  const characterClauses = scene.characters.map((ch) => {
    const posLabel = ch.x < 0.35 ? "left" : ch.x > 0.65 ? "right" : "center";
    return `${ch.name} (${ch.consistencySeed}) at ${posLabel}, pose: ${ch.pose}, expression: ${ch.expression}`;
  });

  const kitPreset = WEBTOON_MODULAR_3D_SETS.find((item) => item.id === scene.modular3dKit);
  const positiveParts = [
    style.promptTokens,
    CAMERA_PROMPT_MAP[scene.cameraShot],
    LIGHTING_PROMPT_MAP[scene.lighting],
    kitPreset?.promptTokens ?? "",
    scene.sceneAnchorId ? `3D scene anchor lock: ${scene.sceneAnchorId}` : "",
    scene.partialInpaintRegion && scene.partialInpaintRegion !== "full-cut"
      ? `partial inpaint target: ${scene.partialInpaintRegion}`
      : "",
    `${scene.lineWeight} ink weight, ${scene.celShadingSteps}-step cel shading`,
    scene.backgroundPrompt.trim() ? `background: ${scene.backgroundPrompt.trim()}` : "",
    ...characterClauses,
  ].filter(Boolean);

  const renderPasses: ("lineart" | "flat-color" | "cel-shade" | "composite")[] =
    scene.preserveLineartPass
      ? ["lineart", "flat-color", "cel-shade", "composite"]
      : ["composite"];

  const [bgHex, accentHex, inkHex] = style.paletteHex;
  const vw = 360;
  const vh = Math.round((vw * dim.height) / dim.width);
  const charShapes = scene.characters
    .map((ch) => {
      const cx = Math.round(Math.min(0.9, Math.max(0.1, ch.x)) * vw);
      const cy = Math.round(Math.min(0.88, Math.max(0.2, ch.y)) * vh);
      const rHead = Math.round(22 * ch.scale);
      const bodyW = Math.round(62 * ch.scale);
      const bodyH = Math.round(110 * ch.scale);
      return (
        `<g data-character-id="${escapeXml(ch.id)}">` +
        `<rect x="${cx - bodyW / 2}" y="${cy}" width="${bodyW}" height="${bodyH}" rx="18" fill="${accentHex}" stroke="${inkHex}" stroke-width="2.5" opacity="0.88" />` +
        `<circle cx="${cx}" cy="${cy - rHead - 4}" r="${rHead}" fill="${bgHex}" stroke="${inkHex}" stroke-width="2.5" />` +
        `<text x="${cx}" y="${cy + bodyH + 18}" text-anchor="middle" font-size="11" font-weight="600" fill="${inkHex}">${escapeXml(ch.name)}</text>` +
        `</g>`
      );
    })
    .join("");

  const previewSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">` +
    `<defs><linearGradient id="wt-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${bgHex}" /><stop offset="100%" stop-color="${accentHex}" stop-opacity="0.35" /></linearGradient></defs>` +
    `<rect x="0" y="0" width="${vw}" height="${vh}" fill="url(#wt-bg)" />` +
    `<line x1="0" y1="${Math.round(vh * 0.68)}" x2="${vw}" y2="${Math.round(vh * 0.68)}" stroke="${inkHex}" stroke-dasharray="6 4" opacity="0.35" />` +
    `${charShapes}` +
    `<rect x="10" y="10" width="${vw - 20}" height="28" rx="6" fill="${inkHex}" opacity="0.72" />` +
    `<text x="20" y="28" font-size="11" fill="#FFFFFF">${escapeXml(style.labelKo)} · ${scene.aspectRatio} · ${scene.cameraShot}</text>` +
    `</svg>`;

  return {
    positivePrompt: positiveParts.join(", "),
    negativePrompt: scene.negativePrompt.trim(),
    width: dim.width,
    height: dim.height,
    seed: scene.seed,
    artStyle: scene.artStyle,
    renderPasses,
    characterConsistencyTokens: scene.characters.map((ch) => ({
      characterId: ch.id,
      name: ch.name,
      token: ch.consistencySeed,
    })),
    previewSvg,
  };
}
