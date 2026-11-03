/**
 * higgsfield-mangaka-types.ts
 *
 * REA 역공학 기반 Higgsfield Mangaka (https://higgsfield.ai/mangaka) 정본 타입, 상수,
 * 결정론적 FNV-1a 시드/간격 계산기, CJK 단어 수 측정기 및 6인 캐릭터 캐스트 잠금.
 */

export type MangakaVisualStyleId = "manga-bw" | "manga-color" | "comics" | "webtoon";
export type MangakaReadingDirection = "rtl" | "ltr" | "ttb";
export type MangakaColourTreatment = "cel" | "watercolour";
export type MangakaRegisterId =
  | "shonen"
  | "shojo"
  | "seinen"
  | "mainstream"
  | "graphic-novel"
  | "action"
  | "romance"
  | "fantasy"
  | "drama"
  | "horror"
  | "comedy";

export type MangakaPortalPresetId =
  | "webtoon"
  | "tapas"
  | "line"
  | "naver"
  | "comico"
  | "daum"
  | "kr700"
  | "kr720";

export type MangakaPanelAspectId =
  | "16:9"
  | "3:2"
  | "4:3"
  | "5:4"
  | "1:1"
  | "4:5"
  | "3:4"
  | "2:3"
  | "9:16"
  | "16:27"
  | "21:9";

export type MangakaPanelRoleId =
  | "hook"
  | "establishing"
  | "action"
  | "impact"
  | "reveal"
  | "dialogue"
  | "reaction"
  | "insert"
  | "vignette"
  | "cliffhanger"
  | "textOnly";

export type MangakaGapClassId =
  | "action"
  | "beat"
  | "pause"
  | "scene"
  | "reveal"
  | "timeSkip";

export type MangakaPanelAlignId =
  | "left"
  | "center"
  | "right"
  | "bleedLeft"
  | "bleedRight";

export type MangakaBackgroundTreatmentId =
  | "detailed"
  | "simplified"
  | "motion"
  | "gradient"
  | "decorative"
  | "none";

export type MangakaLetterKind = "speech" | "thought" | "caption" | "sfx";
export type MangakaBalloonStyleId = "oval" | "burst" | "dashed" | "cloud" | "box" | "none";
export type MangakaLetterPlaceId =
  | "gutterAbove"
  | "gutterSide"
  | "gutterBelow"
  | "overlapTop"
  | "overlapBottom"
  | "inPanel"
  | "free";

export type MangakaWidthStyleId = "auto" | "full" | "inset" | "mixed";
export type MangakaGutterFillId = "auto" | "white" | "dark";
export type MangakaBorderStyleId = "none" | "thin" | "fade";
export type MangakaAnchorAngleId =
  | "front"
  | "left-34"
  | "left"
  | "back"
  | "right"
  | "right-34";

/** Higgsfield Mangaka 캐릭터 참조 최대 인원 (`IDEA_PEOPLE_MAX = 6`) */
export const MANGAKA_IDEA_PEOPLE_MAX = 6 as const;
/** 이미지 업로드 최대 크기 (20 MiB) */
export const MANGAKA_MAX_PHOTO_BYTES = 20_971_520 as const;
/** 대본 업로드 최대 크기 (25 MiB) */
export const MANGAKA_MAX_SCRIPT_BYTES = 26_214_400 as const;
/** 1개 스크린 기준 높이 (`gt = 1600`) */
export const MANGAKA_SCREEN_HEIGHT_PX = 1600 as const;

export interface MangakaStyleConfig {
  readonly id: MangakaVisualStyleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly unit: "page" | "panel";
  readonly reading: {
    readonly defaultDirection: MangakaReadingDirection;
    readonly userMayFlip: boolean;
  };
  readonly defaultAspectRatio: "2:3" | "9:16";
  readonly registers: readonly MangakaRegisterId[];
  readonly colourTreatments?: {
    readonly defaultTreatment: MangakaColourTreatment;
    readonly options: readonly MangakaColourTreatment[];
  };
}

export const MANGAKA_STYLE_CONFIGS: Readonly<
  Record<MangakaVisualStyleId, MangakaStyleConfig>
> = Object.freeze({
  "manga-bw": {
    id: "manga-bw",
    labelKo: "흑백 만화 (B&W Manga)",
    labelEn: "B&W manga",
    unit: "page",
    reading: { defaultDirection: "rtl", userMayFlip: true },
    defaultAspectRatio: "2:3",
    registers: ["shonen", "shojo", "seinen"],
  },
  "manga-color": {
    id: "manga-color",
    labelKo: "컬러 만화 (Color Manga)",
    labelEn: "Color manga",
    unit: "page",
    reading: { defaultDirection: "rtl", userMayFlip: true },
    defaultAspectRatio: "2:3",
    registers: ["shonen", "shojo", "seinen"],
    colourTreatments: {
      defaultTreatment: "cel",
      options: ["cel", "watercolour"],
    },
  },
  comics: {
    id: "comics",
    labelKo: "웨스턴 코믹스 (Western Comics)",
    labelEn: "Western comics",
    unit: "page",
    reading: { defaultDirection: "ltr", userMayFlip: false },
    defaultAspectRatio: "2:3",
    registers: ["mainstream", "graphic-novel"],
  },
  webtoon: {
    id: "webtoon",
    labelKo: "세로 스크롤 웹툰 (Webtoon)",
    labelEn: "Webtoon",
    unit: "panel",
    reading: { defaultDirection: "ttb", userMayFlip: false },
    defaultAspectRatio: "9:16",
    registers: ["action", "romance", "fantasy", "drama", "horror", "comedy"],
  },
});

export interface MangakaPortalSpec {
  readonly id: MangakaPortalPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly widthPx: number;
  readonly sliceMaxPx: number;
  readonly fileMaxBytes?: number;
  readonly maxImages?: number;
}

export const MANGAKA_PORTAL_SPECS: Readonly<
  Record<MangakaPortalPresetId, MangakaPortalSpec>
> = Object.freeze({
  webtoon: {
    id: "webtoon",
    labelKo: "WEBTOON Canvas (800px)",
    labelEn: "WEBTOON Canvas",
    widthPx: 800,
    sliceMaxPx: 1280,
    fileMaxBytes: 2_000_000,
    maxImages: 100,
  },
  tapas: {
    id: "tapas",
    labelKo: "Tapas (940px)",
    labelEn: "Tapas",
    widthPx: 940,
    sliceMaxPx: 1280,
    fileMaxBytes: 2_000_000,
  },
  line: {
    id: "line",
    labelKo: "LINE Manga Indies (800px)",
    labelEn: "LINE Manga Indies",
    widthPx: 800,
    sliceMaxPx: 1280,
  },
  naver: {
    id: "naver",
    labelKo: "네이버 웹툰 KR (690px)",
    labelEn: "Naver (KR)",
    widthPx: 690,
    sliceMaxPx: 1280,
    fileMaxBytes: 5_000_000,
  },
  comico: {
    id: "comico",
    labelKo: "comico JP (690px)",
    labelEn: "comico (JP)",
    widthPx: 690,
    sliceMaxPx: 1280,
    maxImages: 100,
  },
  daum: {
    id: "daum",
    labelKo: "다음 / 카카오웹툰 (760px)",
    labelEn: "Daum / Kakao",
    widthPx: 760,
    sliceMaxPx: 1280,
    fileMaxBytes: 4_000_000,
  },
  kr700: {
    id: "kr700",
    labelKo: "한국 오리지널 표준 (700px)",
    labelEn: "KR-origin look (700 px)",
    widthPx: 700,
    sliceMaxPx: 1280,
  },
  kr720: {
    id: "kr720",
    labelKo: "한국 포털 공용 (720px)",
    labelEn: "KR portals (720 px)",
    widthPx: 720,
    sliceMaxPx: 1280,
  },
});

export const MANGAKA_PANEL_ASPECT_RESOLUTIONS: Readonly<
  Record<
    MangakaPanelAspectId,
    { readonly "1k": readonly [number, number]; readonly "2k": readonly [number, number] }
  >
> = Object.freeze({
  "16:9": { "1k": [1344, 752], "2k": [2688, 1520] },
  "3:2": { "1k": [1248, 832], "2k": [2496, 1664] },
  "4:3": { "1k": [1168, 880], "2k": [2336, 1744] },
  "5:4": { "1k": [1120, 896], "2k": [2240, 1792] },
  "1:1": { "1k": [1024, 1024], "2k": [2048, 2048] },
  "4:5": { "1k": [896, 1120], "2k": [1792, 2240] },
  "3:4": { "1k": [880, 1168], "2k": [1744, 2336] },
  "2:3": { "1k": [688, 1024], "2k": [1360, 2048] },
  "9:16": { "1k": [752, 1344], "2k": [1520, 2688] },
  "16:27": { "1k": [768, 1296], "2k": [1536, 2592] },
  "21:9": { "1k": [1568, 672], "2k": [3136, 1344] },
});

export const MANGAKA_GAP_CLASS_BOUNDS: Readonly<
  Record<MangakaGapClassId, readonly [number, number, number]>
> = Object.freeze({
  action: [120, 200, 160],
  beat: [240, 400, 300],
  pause: [400, 600, 480],
  scene: [600, 1000, 800],
  reveal: [800, 1000, 900],
  timeSkip: [1000, 1600, 1200],
});

export const MANGAKA_LETTERING_CONSTANTS = Object.freeze({
  capDefaultPx: 26,
  capMinPx: 22,
  capMaxPx: 34,
  shoutScale: 1.15,
  pitch: 1.4,
  edgeMarginPx: 24,
  panelMarginPx: 40,
  stackGapPx: 14,
  cascadeDxPx: 70,
  orderStepPx: 16,
  sideMarginPx: 224,
  strokeWidthPx: 2.5,
  inkHex: "#111111",
  paperHex: "#FFFFFF",
  captionFillHex: "#FFF6D8",
  tailMinPx: 34,
  tailMaxPx: 120,
  tailReachRatio: 0.55,
  maxTextWidthPx: 400,
  captionTextWidthPx: 560,
  maxLinesPerBalloon: 5,
  maxBalloonsPerPanel: 3,
  maxWordsPerBalloon: 25,
  maxSfxPerPanel: 2,
  sfxCapByTier: Object.freeze({ 1: 48, 2: 72, 3: 110 }),
  sfxFillHex: "#FFD400",
  sfxOutlinePx: 4,
  sfxRotationDeg: 8,
});

export const MANGAKA_STRIP_CONSTANTS = Object.freeze({
  topSpacePx: 80,
  titleFadePx: 220,
  titleCardHeightPx: 640,
  endBeforeSpacePx: 700,
  endCardHeightPx: 260,
  endAfterSpacePx: 200,
  endSpaceNoCardPx: 400,
  fadeHeightPx: 220,
  textScreenHeightPx: 400,
  maxStripHeightPx: 120_000,
  maxPanelsPerEpisode: 100,
  stripCanvasWidthPx: 800,
});

export const ALLOWED_BALLOON_STYLES_BY_KIND: Readonly<
  Record<MangakaLetterKind, readonly MangakaBalloonStyleId[]>
> = Object.freeze({
  speech: ["oval", "burst", "dashed"],
  thought: ["cloud", "none"],
  caption: ["box"],
  sfx: ["none"],
});

/** Higgsfield Mangaka FNV-1a 해시 (`st`, `lt`) */
export function computeMangakaFnv1aHash(text: string, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function computeMangakaNormalizedSeed(key: string): number {
  return computeMangakaFnv1aHash(key, 2654435769) / 4294967296;
}

/** Higgsfield Mangaka 결정론적 컷 간격 계산 (`Uu`) */
export function computeMangakaDeterministicGapPx(
  gapClass: MangakaGapClassId,
  seedKey: string,
): number {
  const [minPx, maxPx, basePx] = MANGAKA_GAP_CLASS_BOUNDS[gapClass];
  const jitter = computeMangakaNormalizedSeed(`${seedKey}:gap`) * 0.2 - 0.1;
  const candidate = basePx * (1 + jitter);
  return Math.round(Math.min(maxPx, Math.max(minPx, candidate)));
}

/** 간격(px)으로부터 간격 클래스 분류 (`Wu`) */
export function classifyMangakaGapPx(px: number): MangakaGapClassId {
  if (px < 200) return "action";
  if (px < 400) return "beat";
  if (px < 600) return "pause";
  if (px < 1000) return "scene";
  return "timeSkip";
}

/** 패널 폭 클래스 분류 (`sd`: `full` | `inset` | `insert` | `tiny`) */
export function classifyMangakaPanelWidth(
  widthPx: number,
  stripWidthPx = 800,
): "full" | "inset" | "insert" | "tiny" {
  const ratio = widthPx / stripWidthPx;
  if (ratio > 0.985) return "full";
  if (ratio >= 0.6) return "inset";
  if (ratio >= 0.35) return "insert";
  return "tiny";
}

/** 한중일(CJK) 문자를 고려한 Higgsfield Mangaka 단어 수 계산 (`mt`) */
export function countMangakaWordsCjkAware(text: string): number {
  let latinWords = 0;
  let cjkChars = 0;
  for (const token of text.split(/\s+/u)) {
    if (!token) continue;
    const cjkInToken = Array.from(token).filter((ch) =>
      /[\u{2E80}-\u{9FFF}\u{AC00}-\u{D7AF}\u{F900}-\u{FAFF}\u{FF00}-\u{FFEF}]/u.test(ch),
    ).length;
    if (cjkInToken > 0) {
      cjkChars += cjkInToken;
    } else {
      latinWords += 1;
    }
  }
  return latinWords + Math.ceil(cjkChars / 2);
}

export interface MangakaCharacterCastSheet {
  readonly id: string;
  readonly name: string;
  readonly appearancePrompt: string;
  readonly baseLookLabel: string;
  readonly baseStateLabel: string;
  readonly sourcePhotoMime?: "image/png" | "image/jpeg" | "image/webp";
  readonly sourcePhotoBytes?: number;
  readonly lockedAnchorAngles: readonly MangakaAnchorAngleId[];
  readonly screenSidePreference: "left" | "right";
}

export interface MangakaCastLockResult {
  readonly acceptedCast: readonly MangakaCharacterCastSheet[];
  readonly ignoredOverflowCount: number;
  readonly rejectedPhotoReasons: readonly string[];
}

/** 최대 6인(`MANGAKA_IDEA_PEOPLE_MAX`) 캐릭터 레퍼런스 시트 & 룩 시트 잠금 생성 */
export function createMangakaCharacterCastLock(
  candidates: readonly {
    readonly id: string;
    readonly name: string;
    readonly appearancePrompt: string;
    readonly baseLookLabel?: string;
    readonly baseStateLabel?: string;
    readonly sourcePhotoMime?: string;
    readonly sourcePhotoBytes?: number;
  }[],
): MangakaCastLockResult {
  const accepted: MangakaCharacterCastSheet[] = [];
  const rejectedPhotoReasons: string[] = [];
  let ignoredOverflowCount = 0;

  for (const item of candidates) {
    if (accepted.length >= MANGAKA_IDEA_PEOPLE_MAX) {
      ignoredOverflowCount += 1;
      continue;
    }
    if (item.sourcePhotoMime !== undefined) {
      const validMime =
        item.sourcePhotoMime === "image/png" ||
        item.sourcePhotoMime === "image/jpeg" ||
        item.sourcePhotoMime === "image/webp";
      if (!validMime || (item.sourcePhotoBytes ?? 0) > MANGAKA_MAX_PHOTO_BYTES) {
        rejectedPhotoReasons.push(
          `${item.name}: Please choose a photo — JPEG, PNG or WebP up to 20 MB.`,
        );
        continue;
      }
    }
    accepted.push({
      id: item.id,
      name: item.name.trim() || `Character ${accepted.length + 1}`,
      appearancePrompt: item.appearancePrompt.trim(),
      baseLookLabel: item.baseLookLabel?.trim() || "Base look",
      baseStateLabel: item.baseStateLabel?.trim() || "Base state",
      sourcePhotoMime: item.sourcePhotoMime as
        | "image/png"
        | "image/jpeg"
        | "image/webp"
        | undefined,
      sourcePhotoBytes: item.sourcePhotoBytes,
      lockedAnchorAngles: ["front", "left-34", "left", "back", "right", "right-34"],
      screenSidePreference: accepted.length % 2 === 0 ? "left" : "right",
    });
  }

  return { acceptedCast: accepted, ignoredOverflowCount, rejectedPhotoReasons };
}

/** 3D 배경 카메라 Yaw(도)로부터 캐릭터 시트 앵글 매칭 */
export function matchMangakaCameraYawToAnchorAngle(yawDeg: number): MangakaAnchorAngleId {
  const norm = ((yawDeg % 360) + 360) % 360;
  if (norm >= 330 || norm < 30) return "front";
  if (norm >= 30 && norm < 75) return "left-34";
  if (norm >= 75 && norm < 135) return "left";
  if (norm >= 135 && norm < 225) return "back";
  if (norm >= 225 && norm < 285) return "right";
  return "right-34";
}

export interface MangakaScriptLineInput {
  readonly id: string;
  readonly kind: MangakaLetterKind;
  readonly text: string;
  readonly speaker?: string;
  readonly shout?: boolean;
}

export interface MangakaPanelInputSpec {
  readonly pageId: string;
  readonly sceneId: string;
  readonly role: MangakaPanelRoleId;
  readonly aspect: MangakaPanelAspectId;
  readonly widthClass?: "full" | "inset" | "insert";
  readonly align?: MangakaPanelAlignId;
  readonly gapBefore?: MangakaGapClassId;
  readonly background?: MangakaBackgroundTreatmentId;
  readonly border?: MangakaBorderStyleId;
  readonly keyBeat?: boolean;
  readonly memory?: boolean;
  readonly faceBoxes?: readonly {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[];
  readonly lines?: readonly MangakaScriptLineInput[];
}

export interface MangakaPlacedLetterItem {
  readonly id: string;
  readonly pageId: string;
  readonly lineIndex: number;
  readonly kind: MangakaLetterKind;
  readonly style: MangakaBalloonStyleId;
  readonly place: MangakaLetterPlaceId;
  readonly speaker?: string;
  readonly side?: "left" | "right" | "center";
  readonly text: string;
  readonly font: string;
  readonly textCase: "caps" | "as-written";
  readonly capHeightPx: number;
  readonly wordCount: number;
  readonly lineCount: number;
  readonly rotationDeg?: number;
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}

export interface MangakaStagedStripItem {
  readonly kind: "panel" | "card" | "space" | "gradient";
  readonly y: number;
  readonly h: number;
  readonly x?: number;
  readonly w?: number;
  readonly pageId?: string;
  readonly scene?: string;
  readonly role?: MangakaPanelRoleId;
  readonly background?: MangakaBackgroundTreatmentId;
  readonly border?: MangakaBorderStyleId;
  readonly keyBeat?: boolean;
  readonly memory?: boolean;
  readonly cardType?: "title" | "end";
  readonly gap?: MangakaGapClassId;
  readonly before?: string;
  readonly fill?: string;
  readonly from?: string;
  readonly to?: string;
  readonly text?: boolean;
}

export interface MangakaStagedEpisodeStrip {
  readonly width: number;
  readonly height: number;
  readonly bg: string;
  readonly settings: {
    readonly style: MangakaVisualStyleId;
    readonly portal: MangakaPortalPresetId;
    readonly widthStyle: MangakaWidthStyleId;
    readonly gutter: MangakaGutterFillId;
    readonly textCase: "caps" | "as-written";
    readonly capPx: number;
    readonly border: MangakaBorderStyleId;
    readonly titleCard: boolean;
    readonly endCard: boolean;
  };
  readonly items: readonly MangakaStagedStripItem[];
  readonly letters: readonly MangakaPlacedLetterItem[];
  readonly faces: readonly {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[];
  readonly scriptOrderIds: readonly string[];
  readonly safeSliceIntervals: readonly (readonly [number, number])[];
  readonly metrics: {
    readonly panels: number;
    readonly screens: number;
    readonly panelsPerScreen: number;
    readonly pxPerPanel: number;
    readonly gapMedianPx: number;
    readonly tallPanels: number;
    readonly letterboxPanels: number;
  };
}
