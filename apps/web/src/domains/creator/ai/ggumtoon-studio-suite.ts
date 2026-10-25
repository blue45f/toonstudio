/**
 * ggumtoon-studio-suite.ts
 *
 * https://www.ggumtoon.com/ (꿈툰 - AI 웹툰·웹소설 창작 스튜디오 `/studio`) REA 역공학 분석 결과를
 * ToonStudio 웹스튜디오 도메인 엔진으로 100% 내재화한 모듈.
 */

export type GgumtoonWorkType = "webtoon" | "novel";
export type GgumtoonViewMode = "scroll" | "cut";
export type GgumtoonSerialType = "free" | "regular" | "twice_weekly";
export type GgumtoonWeekday = "월" | "화" | "수" | "목" | "금" | "토" | "일";
export type GgumtoonOpenAiSizeId = "1024x1536" | "1024x1024" | "1536x1024";
export type GgumtoonSceneQualityMode = "normal" | "highlight";
export type GgumtoonSceneTextMode = "no_text" | "with_text";

export type GgumtoonGenre =
  | "판타지"
  | "로맨스"
  | "액션"
  | "스릴러"
  | "일상"
  | "무협"
  | "이세계"
  | "공포"
  | "코미디"
  | "학원물";

export const GGUMTOON_GENRES: readonly GgumtoonGenre[] = [
  "판타지",
  "로맨스",
  "액션",
  "스릴러",
  "일상",
  "무협",
  "이세계",
  "공포",
  "코미디",
  "학원물",
] as const;

export const GGUMTOON_WEEKDAYS: readonly GgumtoonWeekday[] = [
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
  "일",
] as const;

export interface GgumtoonOpenAiSizeSpec {
  readonly id: GgumtoonOpenAiSizeId;
  readonly label: string;
  readonly desc: string;
  readonly ratio: "2:3" | "1:1" | "3:2";
  readonly width: number;
  readonly height: number;
}

/** 0n5493b7spg.s.js 모듈 85149에서 관측된 OPENAI_SIZES 정본 */
export const GGUMTOON_OPENAI_SIZES: readonly GgumtoonOpenAiSizeSpec[] = [
  { id: "1024x1536", label: "세로형", desc: "세로 스크롤 웹툰에 최적", ratio: "2:3", width: 1024, height: 1536 },
  { id: "1024x1024", label: "정방형", desc: "좌우로 넘기는 컷툰에 최적", ratio: "1:1", width: 1024, height: 1024 },
  { id: "1536x1024", label: "와이드", desc: "영화적 장면, 배경 묘사에 최적", ratio: "3:2", width: 1536, height: 1024 },
] as const;

export interface GgumtoonSerialPolicySpec {
  readonly id: GgumtoonSerialType;
  readonly label: string;
  readonly creatorSharePercent: number;
  readonly platformSharePercent: number;
  readonly requiredUploadsPerWeek: number;
  readonly minLockDays: number;
  readonly description: string;
  readonly warningNotice: string;
}

/** 0-du3dytc8ifq.js 작품 등록 위저드 및 0_qdehbuvn5r3.js 수익 정산에서 관측된 연재 방식 정책 */
export const GGUMTOON_SERIAL_POLICIES: readonly GgumtoonSerialPolicySpec[] = [
  {
    id: "free",
    label: "자유 연재",
    creatorSharePercent: 40,
    platformSharePercent: 60,
    requiredUploadsPerWeek: 0,
    minLockDays: 30,
    description: "작가 40% / 플랫폼 60% · 요일 제약 없이 자유롭게 업로드",
    warningNotice: "자유 연재이신 경우 다음 에피소드 업로드에 대한 일정을 작가의 말에 간략히 알려주세요.",
  },
  {
    id: "regular",
    label: "정기 연재",
    creatorSharePercent: 60,
    platformSharePercent: 40,
    requiredUploadsPerWeek: 1,
    minLockDays: 30,
    description: "작가 60% / 플랫폼 40% · 선택한 요일에 주 1회 필수 업로드",
    warningNotice:
      "선택한 요일에 23시 59분까지 업로드가 되지 않을 시 수익 배분에 영향이 있을 수 있으며, 지속적으로 업로드 요일을 지키지 않을 시 자유 연재로 자동 변경될 수 있습니다.",
  },
  {
    id: "twice_weekly",
    label: "주 2회 연재",
    creatorSharePercent: 80,
    platformSharePercent: 20,
    requiredUploadsPerWeek: 2,
    minLockDays: 30,
    description: "작가 80% / 플랫폼 20% · 선택한 2개 요일에 매주 필수 업로드",
    warningNotice:
      "주 2회 연재를 지키지 않을 시 정산 비율은 자동 조정될 수 있습니다. 주 2회 연재 단순 달성을 위해 작품의 퀄리티가 낮아지거나 분량이 급격히 적어질 경우 작품 연재가 조정될 수 있습니다.",
  },
] as const;

/** 0-du3dytc8ifq.js 스타일 생성기(O)에서 관측된 5대 빠른 시작 그림체 프리셋 */
export const GGUMTOON_STYLE_QUICK_PRESETS: readonly string[] = [
  "밝은 파스텔 색감, 청춘 로맨스, 가느다란 선, 깔끔한 배경",
  "강렬한 색대비, 역동적인 액션, 두꺼운 아웃라인, 선명한 컬러",
  "어둡고 섬세한 공포 분위기, 세밀한 명암, 모노크롬",
  "동화풍, 밝은 색감, 귀여운 캐릭터, 단순화된 배경",
  "사실적인 묘사, 세밀한 배경, 영화적 구도, 차가운 색감",
] as const;

/** 0n5493b7spg.s.js 및 0-du3dytc8ifq.js에서 관측된 크레딧 비용 상수 */
export const GGUMTOON_STUDIO_CREDIT_COSTS = {
  novel_generate: 3,
  webtoon_normal: 3,
  webtoon_highlight: 5,
  cover_generate: 3,
  style_generate_initial: 3,
  style_regenerate: 1,
  character_sheet: 9,
  character_sheet_min_gate: 3,
  inpaint_modify: 3,
} as const;

const AUTHOR_NAME_REGEX = /^[가-힣a-zA-Z0-9]{2,12}$/;

export interface GgumtoonAuthorValidationResult {
  readonly valid: boolean;
  readonly normalizedName: string;
  readonly status: "idle" | "invalid" | "available" | "taken";
  readonly message: string;
}

/** 작가 이름 검증기 (`/api/author/check-name` 및 `eb.test(e)` 규칙: 한글/영문/숫자 2~12자, 변경 불가) */
export function validateGgumtoonAuthorName(
  rawName: string,
  takenNames: readonly string[] = [],
): GgumtoonAuthorValidationResult {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedName: "",
      status: "idle",
      message: "한글, 영문, 숫자 조합 2~12자. 등록 후 변경 불가.",
    };
  }
  if (!AUTHOR_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      normalizedName: trimmed,
      status: "invalid",
      message: "한글/영문/숫자 2~12자로 입력해주세요.",
    };
  }
  const lowerTaken = new Set(takenNames.map((n) => n.trim().toLowerCase()));
  if (lowerTaken.has(trimmed.toLowerCase())) {
    return {
      valid: false,
      normalizedName: trimmed,
      status: "taken",
      message: "이미 사용 중인 이름이에요.",
    };
  }
  return {
    valid: true,
    normalizedName: trimmed,
    status: "available",
    message: "사용 가능한 이름이에요!",
  };
}

export interface GgumtoonWorkRegistrationDraft {
  readonly type: GgumtoonWorkType;
  readonly title: string;
  readonly titleEn?: string;
  readonly genres: readonly GgumtoonGenre[];
  readonly serialType: GgumtoonSerialType;
  readonly serialDays: readonly GgumtoonWeekday[];
  readonly viewMode: GgumtoonViewMode;
  readonly description: string;
  readonly agreeAdPromotion: boolean;
  readonly agreeOperationPolicy: boolean;
  readonly coverUrl?: string | null;
  readonly bannerUrl?: string | null;
  readonly serialTypeLockedUntil?: string | null;
}

export interface GgumtoonWorkValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly payload: {
    readonly type: GgumtoonWorkType;
    readonly title: string;
    readonly title_en: string | null;
    readonly genre: GgumtoonGenre;
    readonly genre_sub: GgumtoonGenre | null;
    readonly serial_type: GgumtoonSerialType;
    readonly serial_day: string | null;
    readonly view_mode: GgumtoonViewMode;
    readonly description: string;
    readonly cover_emoji: string;
    readonly cover_bg: string;
    readonly is_ai_created: true;
  } | null;
}

/** 작품 등록·수정 입력 검증 및 페이로드 생성 (`/api/work/create`, `/api/work/update`) */
export function validateAndBuildGgumtoonWorkPayload(
  draft: GgumtoonWorkRegistrationDraft,
  nowIso: string = "2026-10-26T00:00:00.000Z",
  previousSerialType?: GgumtoonSerialType,
): GgumtoonWorkValidationResult {
  const errors: string[] = [];
  const title = draft.title.trim();

  if (!title) errors.push("제목을 입력해주세요.");
  if (draft.genres.length < 1 || draft.genres.length > 2) {
    errors.push("장르는 최소 1개 필수 · 최대 2개 선택 가능합니다.");
  }
  if (draft.serialType === "regular" && draft.serialDays.length !== 1) {
    errors.push("정기 연재 요일을 선택해주세요.");
  }
  if (draft.serialType === "twice_weekly" && draft.serialDays.length !== 2) {
    errors.push("주 2회 연재 요일을 2개 선택해주세요.");
  }
  if (!draft.agreeAdPromotion || !draft.agreeOperationPolicy) {
    errors.push("작품 등록 전 확인사항(광고 활용 동의 및 운영 정책 동의)에 모두 동의해주세요.");
  }

  if (previousSerialType && previousSerialType !== draft.serialType && draft.serialTypeLockedUntil) {
    const lockDate = new Date(draft.serialTypeLockedUntil);
    const now = new Date(nowIso);
    if (lockDate.getTime() > now.getTime()) {
      const formatted = lockDate.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      errors.push(`연재 방식은 ${formatted}까지 변경할 수 없습니다.`);
    }
  }

  if (errors.length > 0 || draft.genres.length === 0) {
    return { valid: false, errors, payload: null };
  }

  const serialDay =
    draft.serialType === "regular"
      ? draft.serialDays[0]!
      : draft.serialType === "twice_weekly"
        ? draft.serialDays.slice(0, 2).join(",")
        : null;

  return {
    valid: true,
    errors: [],
    payload: {
      type: draft.type,
      title,
      title_en: draft.titleEn?.trim() ? draft.titleEn.trim() : null,
      genre: draft.genres[0]!,
      genre_sub: draft.genres[1] ?? null,
      serial_type: draft.serialType,
      serial_day: serialDay,
      view_mode: draft.type === "novel" ? "scroll" : draft.viewMode,
      description: draft.description.trim(),
      cover_emoji: "🔥",
      cover_bg: "#2d1b4e",
      is_ai_created: true,
    },
  };
}

export interface GgumtoonCropArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: "5:7" | "3:1";
}

/** 0-du3dytc8ifq.js (reactEasyCrop B/$/q/X 수식) 기반 표지(800×1120) 및 상세 배너(3:1, 800×400) 노출 영역 계산기 */
export function computeGgumtoonCoverOrBannerCrop(params: {
  readonly role: "cover" | "banner";
  readonly mediaWidth: number;
  readonly mediaHeight: number;
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly rotationDeg?: number;
}): GgumtoonCropArea {
  const zoom = Math.max(1, Math.min(3, params.zoom));
  const rotRad = ((params.rotationDeg ?? 0) * Math.PI) / 180;
  const rotatedW =
    Math.abs(Math.cos(rotRad) * params.mediaWidth) + Math.abs(Math.sin(rotRad) * params.mediaHeight);
  const rotatedH =
    Math.abs(Math.sin(rotRad) * params.mediaWidth) + Math.abs(Math.cos(rotRad) * params.mediaHeight);

  const targetRatio = params.role === "cover" ? 800 / 1120 : 3 / 1;
  let baseCropW = rotatedW;
  let baseCropH = rotatedW / targetRatio;
  if (baseCropH > rotatedH) {
    baseCropH = rotatedH;
    baseCropW = rotatedH * targetRatio;
  }

  const cropW = Math.round(baseCropW / zoom);
  const cropH = Math.round(baseCropH / zoom);
  const maxOffsetX = Math.max(0, (rotatedW - cropW) / 2);
  const maxOffsetY = Math.max(0, (rotatedH - cropH) / 2);
  const clampedPanX = Math.min(Math.max(params.panX, -maxOffsetX), maxOffsetX);
  const clampedPanY = Math.min(Math.max(params.panY, -maxOffsetY), maxOffsetY);

  return {
    x: Math.round((rotatedW - cropW) / 2 + clampedPanX),
    y: Math.round((rotatedH - cropH) / 2 + clampedPanY),
    width: Math.max(1, cropW),
    height: Math.max(1, cropH),
    aspectRatio: params.role === "cover" ? "5:7" : "3:1",
  };
}

export interface GgumtoonDetectedCharacterCandidate {
  readonly appearancePrompt: string;
  readonly faceImageUrl: string | null;
  readonly name: string;
  readonly saved: boolean;
}

export interface GgumtoonConfirmedStyle {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly referenceImageUrl: string;
  readonly candidateImages: readonly string[];
  readonly detectedCharacters: readonly GgumtoonDetectedCharacterCandidate[];
}

/** `/api/studio/generate-style` + `/api/studio/detect-characters` 결정론적 시뮬레이션 및 데이터 빌더 */
export function generateGgumtoonStyleCandidates(params: {
  readonly workId: string;
  readonly genre: GgumtoonGenre;
  readonly prompt: string;
  readonly currentCredits: number;
  readonly isRegeneration?: boolean;
  readonly referenceImageB64?: string | null;
}):
  | {
      readonly ok: true;
      readonly styleId: string;
      readonly images: readonly [string, string, string];
      readonly creditsUsed: number;
      readonly creditsRemaining: number;
      readonly detectedCharacters: readonly GgumtoonDetectedCharacterCandidate[];
    }
  | {
      readonly ok: false;
      readonly error: "empty_prompt" | "no_credits";
      readonly message: string;
    } {
  const cleanPrompt = params.prompt.trim();
  if (!cleanPrompt) {
    return { ok: false, error: "empty_prompt", message: "그림체 설명을 입력해주세요." };
  }
  const cost = params.isRegeneration
    ? GGUMTOON_STUDIO_CREDIT_COSTS.style_regenerate
    : GGUMTOON_STUDIO_CREDIT_COSTS.style_generate_initial;
  if (params.currentCredits < cost) {
    return { ok: false, error: "no_credits", message: "크레딧이 부족합니다." };
  }

  const slug = encodeURIComponent(cleanPrompt.slice(0, 24));
  const styleId = `style-${params.workId}-${slug.length}`;
  const images: readonly [string, string, string] = [
    `https://cdn.toonstudio.local/ggumtoon/styles/${styleId}-cand-1.webp`,
    `https://cdn.toonstudio.local/ggumtoon/styles/${styleId}-cand-2.webp`,
    `https://cdn.toonstudio.local/ggumtoon/styles/${styleId}-cand-3.webp`,
  ];

  const detectedCharacters: GgumtoonDetectedCharacterCandidate[] = [];
  if (/여성|소녀|황녀|여주|그녀/.test(cleanPrompt)) {
    detectedCharacters.push({
      appearancePrompt: `${params.genre} 스타일의 여성 캐릭터, ${cleanPrompt.slice(0, 48)}`,
      faceImageUrl: `https://cdn.toonstudio.local/ggumtoon/faces/${styleId}-female.webp`,
      name: "",
      saved: false,
    });
  }
  if (/남성|소년|대공|남주|그가|청년/.test(cleanPrompt)) {
    detectedCharacters.push({
      appearancePrompt: `${params.genre} 스타일의 남성 캐릭터, ${cleanPrompt.slice(0, 48)}`,
      faceImageUrl: `https://cdn.toonstudio.local/ggumtoon/faces/${styleId}-male.webp`,
      name: "",
      saved: false,
    });
  }
  if (detectedCharacters.length === 0) {
    detectedCharacters.push({
      appearancePrompt: `${params.genre} 주인공, ${cleanPrompt.slice(0, 48)}`,
      faceImageUrl: `https://cdn.toonstudio.local/ggumtoon/faces/${styleId}-lead.webp`,
      name: "",
      saved: false,
    });
  }

  return {
    ok: true,
    styleId,
    images,
    creditsUsed: cost,
    creditsRemaining: params.currentCredits - cost,
    detectedCharacters,
  };
}

export interface GgumtoonCharacterSheetRecord {
  readonly id: string;
  readonly workId: string;
  readonly name: string;
  readonly appearancePrompt: string;
  readonly description: string;
  readonly frontImageUrl: string;
  readonly candidateImageUrls: readonly [string, string, string];
}

/** `/api/character/create-sheet` 및 `/api/character/regenerate-sheet` 캐릭터 시트 3장 생성기 */
export function generateGgumtoonCharacterSheetCandidates(params: {
  readonly workId: string;
  readonly name: string;
  readonly appearancePrompt: string;
  readonly description?: string;
  readonly currentCredits: number;
  readonly creditCost?: number;
}):
  | {
      readonly ok: true;
      readonly imageUrls: readonly [string, string, string];
      readonly creditsUsed: number;
      readonly creditsRemaining: number;
    }
  | {
      readonly ok: false;
      readonly error: "missing_fields" | "no_credits";
      readonly message: string;
    } {
  const name = params.name.trim();
  const appearance = params.appearancePrompt.trim();
  if (!name || !appearance) {
    return { ok: false, error: "missing_fields", message: "이름과 외모 설명을 입력해주세요." };
  }
  const cost = params.creditCost ?? GGUMTOON_STUDIO_CREDIT_COSTS.character_sheet;
  if (params.currentCredits < GGUMTOON_STUDIO_CREDIT_COSTS.character_sheet_min_gate || params.currentCredits < cost) {
    return { ok: false, error: "no_credits", message: "크레딧이 부족합니다." };
  }

  const safeName = encodeURIComponent(name);
  return {
    ok: true,
    imageUrls: [
      `https://cdn.toonstudio.local/ggumtoon/characters/${params.workId}/${safeName}-sheet-1.webp`,
      `https://cdn.toonstudio.local/ggumtoon/characters/${params.workId}/${safeName}-sheet-2.webp`,
      `https://cdn.toonstudio.local/ggumtoon/characters/${params.workId}/${safeName}-sheet-3.webp`,
    ],
    creditsUsed: cost,
    creditsRemaining: params.currentCredits - cost,
  };
}

export interface GgumtoonSpacerTextPanelGradient {
  readonly angle: number;
  readonly colorStart: string;
  readonly colorStop: string;
}

export interface GgumtoonSpacerTextPanel {
  readonly height: number;
  readonly backgroundColor: string;
  readonly backgroundGradient?: GgumtoonSpacerTextPanelGradient;
  readonly bubbles: readonly Record<string, unknown>[];
  readonly mergedImageUrl?: string;
}

/** 여백 패널(textPanel) 높이 클램핑(80~2000px) 및 삼각함수 선형 그라디언트 벡터 계산기 */
export function clampGgumtoonSpacerPanelHeight(rawHeight: number): number {
  if (!Number.isFinite(rawHeight)) return 240;
  return Math.max(80, Math.min(2000, Math.round(rawHeight)));
}

export function computeGgumtoonSpacerGradientCoordinates(
  width: number,
  height: number,
  gradient: GgumtoonSpacerTextPanelGradient,
): {
  readonly cssBackground: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
} {
  const rad = (gradient.angle * Math.PI) / 180;
  const x0 = ((1 - Math.sin(rad)) / 2) * width;
  const y0 = ((1 + Math.cos(rad)) / 2) * height;
  const x1 = ((1 + Math.sin(rad)) / 2) * width;
  const y1 = ((1 - Math.cos(rad)) / 2) * height;
  return {
    cssBackground: `linear-gradient(${gradient.angle}deg, ${gradient.colorStart}, ${gradient.colorStop})`,
    x0: Math.round(x0 * 100) / 100,
    y0: Math.round(y0 * 100) / 100,
    x1: Math.round(x1 * 100) / 100,
    y1: Math.round(y1 * 100) / 100,
  };
}

export interface GgumtoonStudioSceneItem {
  readonly id: string;
  readonly prompt: string;
  readonly mode: GgumtoonSceneQualityMode;
  readonly size: GgumtoonOpenAiSizeId;
  readonly textMode: GgumtoonSceneTextMode;
  readonly selectedCharacterIds: readonly string[];
  readonly autoReferenceEnabled: boolean;
  readonly customReferenceImageB64: string | null;
  readonly candidateImages: readonly string[] | null;
  readonly selectedImageIndex: number | null;
  readonly savedSceneId: string | null;
  readonly confirmedImageUrl: string | null;
  readonly savedBubbles: readonly Record<string, unknown>[];
  readonly textPanel: GgumtoonSpacerTextPanel | null;
}

/** 장면 생성기 (`/api/studio/generate-webtoon` 및 자동 레퍼런스 체이닝) */
export function generateGgumtoonSceneImages(params: {
  readonly scene: GgumtoonStudioSceneItem;
  readonly workTitle: string;
  readonly workGenre: GgumtoonGenre;
  readonly isCuttoon: boolean;
  readonly lastConfirmedImageUrl: string | null;
  readonly currentCredits: number;
}):
  | {
      readonly ok: true;
      readonly effectiveSize: GgumtoonOpenAiSizeId;
      readonly effectiveReferenceSource: "custom_b64" | "previous_scene_url" | "none";
      readonly images: readonly string[];
      readonly creditsUsed: number;
      readonly creditsRemaining: number;
    }
  | {
      readonly ok: false;
      readonly error: "missing_input" | "no_credits";
      readonly message: string;
    } {
  if (!params.workTitle.trim() || !params.scene.prompt.trim()) {
    return { ok: false, error: "missing_input", message: "작품 제목과 장면 설명을 입력해주세요." };
  }
  const cost =
    params.scene.mode === "highlight"
      ? GGUMTOON_STUDIO_CREDIT_COSTS.webtoon_highlight
      : GGUMTOON_STUDIO_CREDIT_COSTS.webtoon_normal;
  if (params.currentCredits < cost) {
    return { ok: false, error: "no_credits", message: "크레딧이 부족합니다." };
  }

  const effectiveSize: GgumtoonOpenAiSizeId = params.isCuttoon ? "1024x1024" : params.scene.size;
  const effectiveReferenceSource: "custom_b64" | "previous_scene_url" | "none" =
    params.scene.customReferenceImageB64
      ? "custom_b64"
      : params.scene.autoReferenceEnabled && params.lastConfirmedImageUrl
        ? "previous_scene_url"
        : "none";

  const count = params.scene.mode === "highlight" ? 1 : 3;
  const images = Array.from(
    { length: count },
    (_, idx) =>
      `https://cdn.toonstudio.local/ggumtoon/scenes/${params.scene.id}-${params.scene.mode}-${effectiveSize}-${idx + 1}.webp`,
  );

  return {
    ok: true,
    effectiveSize,
    effectiveReferenceSource,
    images,
    creditsUsed: cost,
    creditsRemaining: params.currentCredits - cost,
  };
}

/** 부분 수정 (인페인팅, `/api/studio/inpaint`) 실행기 — 후보 3장 생성 (3크레딧) */
export function runGgumtoonSceneInpaint(params: {
  readonly sceneId: string;
  readonly baseImageUrl: string;
  readonly editPrompt: string;
  readonly size: GgumtoonOpenAiSizeId;
  readonly currentCredits: number;
}):
  | {
      readonly ok: true;
      readonly inpaintedImages: readonly [string, string, string];
      readonly creditsUsed: number;
      readonly creditsRemaining: number;
    }
  | {
      readonly ok: false;
      readonly error: "missing_input" | "no_credits";
      readonly message: string;
    } {
  if (!params.baseImageUrl.trim() || !params.editPrompt.trim()) {
    return { ok: false, error: "missing_input", message: "수정할 기준 이미지와 수정할 내용을 입력하세요." };
  }
  const cost = GGUMTOON_STUDIO_CREDIT_COSTS.inpaint_modify;
  if (params.currentCredits < cost) {
    return { ok: false, error: "no_credits", message: "크레딧이 부족합니다." };
  }
  return {
    ok: true,
    inpaintedImages: [
      `https://cdn.toonstudio.local/ggumtoon/inpaint/${params.sceneId}-edit-1.webp`,
      `https://cdn.toonstudio.local/ggumtoon/inpaint/${params.sceneId}-edit-2.webp`,
      `https://cdn.toonstudio.local/ggumtoon/inpaint/${params.sceneId}-edit-3.webp`,
    ],
    creditsUsed: cost,
    creditsRemaining: params.currentCredits - cost,
  };
}

/** 에피소드 회차별 무료/유료 자동 판정 규칙 (`1~3화 자동 무료, 4화부터 유료 고정`) */
export function isGgumtoonEpisodeAutomaticallyFree(
  episodeNumber: number,
  workType: GgumtoonWorkType = "webtoon",
  isChallengeWork: boolean = false,
): boolean {
  if (isChallengeWork) return true;
  if (workType === "novel") return episodeNumber === 1;
  return episodeNumber >= 1 && episodeNumber <= 3;
}

/** 직접 업로드 웹툰 원고 이미지 규격 검증기 (`세로 1,120px 이상`) */
export function validateGgumtoonUploadedWebtoonImage(params: {
  readonly fileName: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}): { readonly valid: boolean; readonly errorMessage: string | null } {
  if (params.naturalHeight < 1120) {
    return {
      valid: false,
      errorMessage: `${params.fileName}: 세로 1,120px 이상 이미지를 업로드해주세요. (현재 ${params.naturalHeight}px)`,
    };
  }
  return { valid: true, errorMessage: null };
}

/** 웹소설 파일 업로드 검증기 (`TXT, DOCX 파일만 업로드 가능 · 최대 10MB · 권장 5,000~20,000자`) */
export function validateGgumtoonNovelUploadFile(params: {
  readonly fileName: string;
  readonly byteSize: number;
  readonly extractedText: string;
}):
  | {
      readonly valid: true;
      readonly extension: "txt" | "docx";
      readonly charCount: number;
      readonly isWithinRecommendedLength: boolean;
    }
  | {
      readonly valid: false;
      readonly errorMessage: string;
    } {
  const ext = params.fileName.split(".").pop()?.toLowerCase();
  if (ext !== "txt" && ext !== "docx") {
    return { valid: false, errorMessage: "TXT, DOCX 파일만 업로드 가능합니다." };
  }
  if (params.byteSize > 0xa00000) {
    return { valid: false, errorMessage: "파일 크기가 10MB를 초과합니다." };
  }
  const trimmed = params.extractedText.trim();
  if (!trimmed) {
    return { valid: false, errorMessage: "파일에서 텍스트를 추출할 수 없습니다." };
  }
  const charCount = params.extractedText.length;
  return {
    valid: true,
    extension: ext,
    charCount,
    isWithinRecommendedLength: charCount >= 5000 && charCount <= 20000,
  };
}

/** `/api/studio/generate-novel` AI 웹소설 본문 생성기 (3크레딧) */
export function generateGgumtoonAiNovelEpisode(params: {
  readonly workTitle: string;
  readonly genre: GgumtoonGenre;
  readonly plotSummary: string;
  readonly currentCredits: number;
}):
  | {
      readonly ok: true;
      readonly formattedPrompt: string;
      readonly generatedText: string;
      readonly creditsUsed: number;
      readonly creditsRemaining: number;
    }
  | {
      readonly ok: false;
      readonly error: "empty_plot" | "no_credits";
      readonly message: string;
    } {
  const plot = params.plotSummary.trim();
  if (!plot) {
    return { ok: false, error: "empty_plot", message: "줄거리를 입력해주세요." };
  }
  const cost = GGUMTOON_STUDIO_CREDIT_COSTS.novel_generate;
  if (params.currentCredits < cost) {
    return { ok: false, error: "no_credits", message: "크레딧이 부족합니다." };
  }
  const formattedPrompt = `제목: ${params.workTitle}\n줄거리: ${plot}`;
  const generatedText = [
    `[${params.genre} · ${params.workTitle}]`,
    "",
    `${plot}`,
    "",
    `차가운 밤공기를 가르며 운명의 첫 장이 열렸다. 누구도 예상하지 못한 선택 앞에서 두 사람의 시선이 교차했고, 침묵 끝에 마침내 결단의 한마디가 울려 퍼졌다.`,
    `"여기서부터는 내 방식으로 끝을 보겠어."`,
  ].join("\n");

  return {
    ok: true,
    formattedPrompt,
    generatedText,
    creditsUsed: cost,
    creditsRemaining: params.currentCredits - cost,
  };
}
