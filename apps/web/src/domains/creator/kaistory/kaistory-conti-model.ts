/**
 * kaistory-conti-model.ts — KAISTORY `conti.kaistory.net` (콘티 저작 도구) 정밀 이식 순수 모듈.
 *
 * REA 역공학 근거:
 * - Evidence: `ev_c24e694f490ffef18df5d31420990ec96f2bf73a6a726491f871679895acfc08`
 * - 번들: `conti.kaistory.net/main.dart.js` 및 `/api/v1` REST 스키마
 *
 * 핵심 기능:
 * 1. 작품(시놉시스·로그라인·세계관·기획의도·작품묶음·권표기·연재주기·화자표시방식) → 회차 → 페이지(템플릿·2페이지 펼침·B5 가이드·테두리 크롭) → 컷 계층
 * 2. 등장인물 레지스트리(순서 기반 자동 색, 연령대 자동 분류, 화자 말풍선 색 개별 오버라이드, 학습카드용 배경 투명 인물 스프라이트, 차림별 시트 프롬프트)
 * 3. 장소 레지스트리(전경·중경·디테일 슬롯, 시간대, 장소 시트 프롬프트)
 * 4. 컷 연출·감정 14종 동의어 매칭·대사/보이스오버 6종 표현 컴파일러
 * 5. 16:9 애니메이션 첫 장면 리프레이밍 프롬프트 및 모션 프롬프트 컴파일러(10초 초과 클립 분할 경고 포함)
 * 6. 학습카드 인물 일관성 프롬프트 생성기
 * 7. 역할 기반 멤버 권한(소유자·관리자·스토리작가·만화가·읽기전용) 및 오프라인 우선 LWW(Last-Write-Wins) 버전 동기화
 */

export type KaistoryLangCode = "ko" | "en" | "ja" | "zh" | "ru";

export const KAISTORY_LANG_CODES: readonly KaistoryLangCode[] = Object.freeze([
  "ko",
  "en",
  "ja",
  "zh",
  "ru",
]);

export const KAISTORY_LANG_LABELS: Readonly<Record<KaistoryLangCode, string>> = Object.freeze({
  ko: "한국어",
  en: "영어",
  ja: "일본어",
  zh: "중국어",
  ru: "러시아어",
});

export type KaistorySpeakerDisplayMode = "name" | "color" | "outline";

export type KaistoryCharacterBubbleColorOverride =
  | "project_default"
  | "fill_and_stroke"
  | "stroke_only";

export type KaistoryCharacterGender = "female" | "male" | "none";

export type KaistoryAgeGroup = "child" | "teen" | "young" | "adult" | "senior";

export type KaistoryScheduleCycle =
  | "weekly_1"
  | "weekly_2"
  | "weekly_3"
  | "biweekly"
  | "monthly_1"
  | "irregular"
  | "unspecified";

export const KAISTORY_SCHEDULE_LABELS: Readonly<Record<KaistoryScheduleCycle, string>> =
  Object.freeze({
    weekly_1: "주 1회",
    weekly_2: "주 2회",
    weekly_3: "주 3회",
    biweekly: "격주",
    monthly_1: "월 1회",
    irregular: "비정기",
    unspecified: "미지정",
  });

/** 등장인물 등록 순서대로 배정되는 기본 자동 색상 팔레트. */
export const KAISTORY_AUTO_CHARACTER_COLORS: readonly string[] = Object.freeze([
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#F7B731",
  "#A55EEA",
  "#26DE81",
  "#FD9644",
  "#EC4899",
  "#3B82F6",
  "#10B981",
]);

export interface KaistoryStudyCardCharacterSprite {
  readonly id: string;
  readonly imageUrl: string;
  /** 표정·동작·소품 태그 — 예: ["기쁨", "가리킴", "우산"]. */
  readonly tags: readonly string[];
  readonly transparentBackground: boolean;
}

export interface KaistoryCharacterOutfitSheet {
  readonly label: string;
  readonly prompt: string;
  readonly imageUrl?: string;
}

export interface KaistoryCharacter {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly gender: KaistoryCharacterGender;
  readonly ageText: string;
  readonly ageGroup: KaistoryAgeGroup;
  readonly appearance: string;
  readonly speechStyle: string;
  readonly autoColor: string;
  readonly customColor?: string;
  readonly bubbleColorOverride: KaistoryCharacterBubbleColorOverride;
  readonly ttsVoiceIds: Readonly<Partial<Record<KaistoryLangCode, string>>>;
  /** 만화 그림체 인물 그림(배경 투명). 학습카드 삽화에 일반인 대신 쓴다. */
  readonly studyCardSprites: readonly KaistoryStudyCardCharacterSprite[];
  readonly outfitSheets: readonly KaistoryCharacterOutfitSheet[];
}

export type KaistoryTimeOfDay = "morning" | "afternoon" | "evening" | "dawn";

export const KAISTORY_TIME_OF_DAY_LABELS: Readonly<Record<KaistoryTimeOfDay, string>> =
  Object.freeze({
    morning: "아침",
    afternoon: "오후",
    evening: "저녁",
    dawn: "새벽",
  });

export type KaistoryLocationSlotKind = "foreground" | "midground" | "detail";

export interface KaistoryLocationSlot {
  readonly kind: KaistoryLocationSlotKind;
  readonly label: string;
  readonly sketchUrl?: string;
  readonly prompt?: string;
}

export interface KaistoryLocation {
  readonly id: string;
  readonly name: string;
  readonly mood: string;
  readonly description: string;
  readonly timeOfDay: KaistoryTimeOfDay;
  readonly slots: readonly KaistoryLocationSlot[];
}

export type KaistoryPageTemplateId =
  | "A/B1-2_2row"
  | "A/B/C_3row"
  | "A/B1-2/C_3row"
  | "custom";

export const KAISTORY_PAGE_TEMPLATE_LABELS: Readonly<Record<KaistoryPageTemplateId, string>> =
  Object.freeze({
    "A/B1-2_2row": "A/B1-2 2단",
    "A/B/C_3row": "A/B/C 3단",
    "A/B1-2/C_3row": "A/B1-2/C 3단",
    custom: "커스텀 템플릿",
  });

/**
 * 2페이지 펼침 모드:
 * - `merge_webtoon`: 합치기 — 웹툰에서 두 페이지를 하나로 이어 표시(나레이션·캡션 유지)
 * - `hide_webtoon`: 숨김 — 웹툰에서 두 페이지를 숨김(만화 전용 펼침, 좌/우 절반 분할)
 */
export type KaistorySpreadMode = "none" | "merge_webtoon" | "hide_webtoon";

export type KaistoryShotType = "full" | "half" | "close";

export const KAISTORY_SHOT_LABELS: Readonly<Record<KaistoryShotType, string>> = Object.freeze({
  full: "풀샷",
  half: "하프샷",
  close: "클로즈샷",
});

export type KaistoryBodyDirection = "front" | "side" | "back";

export const KAISTORY_BODY_DIRECTION_LABELS: Readonly<Record<KaistoryBodyDirection, string>> =
  Object.freeze({
    front: "정면",
    side: "측면",
    back: "후면",
  });

export type KaistoryEmotionCategory =
  | "love"
  | "shy"
  | "tired"
  | "doubt"
  | "neutral_cold"
  | "flustered"
  | "smug"
  | "joy"
  | "sadness"
  | "anger"
  | "surprise"
  | "worry"
  | "fear"
  | "normal";

export const KAISTORY_EMOTION_SYNONYMS: Readonly<
  Record<KaistoryEmotionCategory, readonly string[]>
> = Object.freeze({
  love: ["사랑", "설렘", "반함", "하트", "두근"],
  shy: ["부끄", "수줍", "쑥스", "민망", "윙크", "부끄럼"],
  tired: ["피곤", "지침", "지친", "나른", "노곤"],
  doubt: ["의심", "의아", "미심", "떨떠름"],
  neutral_cold: ["무표정", "덤덤", "냉담", "시큰둥"],
  flustered: ["당황", "허둥", "쩔쩔", "안절부절", "난처", "진땀"],
  smug: ["잘난척", "잘난", "으스", "거만", "우쭐", "득의", "의기양양"],
  joy: ["기쁨", "미소", "행복", "신남"],
  sadness: ["슬픔", "슬프", "우울", "눈물"],
  anger: ["화남", "화난", "분노", "짜증", "성난", "격분"],
  surprise: ["놀람", "놀란", "경악", "충격"],
  worry: ["걱정", "불안", "긴장", "초조"],
  fear: ["두려"],
  normal: ["보통"],
});

export interface KaistoryPanelCharacterPlacement {
  readonly characterId: string;
  /** 0..1 정규화 좌표 (좌/우/상/하). */
  readonly xRatio: number;
  readonly yRatio: number;
  readonly gazeHorizontal: "left" | "center" | "right";
  readonly gazeVertical: "up" | "middle" | "down";
  readonly bodyDirection: KaistoryBodyDirection;
  readonly emotion: KaistoryEmotionCategory;
  readonly expressionMood: string;
  readonly action: string;
}

export type KaistoryDialogueDeliveryMode =
  | "normal"
  | "shout"
  | "broadcast"
  | "thought_vo"
  | "narration_vo"
  | "sfx_silent";

export type KaistoryDialogueKind =
  | "dialogue"
  | "monologue"
  | "narration"
  | "sfx"
  | "caption";

export interface KaistoryContiDialogue {
  readonly id: string;
  readonly speakerName: string;
  readonly speakerId?: string;
  readonly kind: KaistoryDialogueKind;
  readonly deliveryMode: KaistoryDialogueDeliveryMode;
  readonly text: string;
  readonly translations: Readonly<Partial<Record<KaistoryLangCode, string>>>;
}

export type KaistoryColorReferenceMode = "like_sheet" | "like_original";

export interface KaistoryPanelCut {
  readonly id: string;
  readonly cutNumber: number;
  readonly shotType: KaistoryShotType;
  readonly locationId?: string;
  readonly timeText: string;
  readonly directorNote: string;
  readonly colorReferenceMode: KaistoryColorReferenceMode;
  readonly aiColorDirective: string;
  readonly keywords: readonly string[];
  readonly placements: readonly KaistoryPanelCharacterPlacement[];
  readonly dialogues: readonly KaistoryContiDialogue[];
  /** 컷 밖까지 표시되는 캐릭터 컷아웃(흰 배경 투명 처리). */
  readonly outOfFrameCharacterImageUrls: readonly string[];
  readonly webtoonDedicatedCutCountAfter: number;
  readonly aspectRatioWidth: number;
  readonly aspectRatioHeight: number;
}

export interface KaistoryContiPage {
  readonly id: string;
  readonly pageNumber: number;
  readonly templateId: KaistoryPageTemplateId;
  readonly keywords: readonly string[];
  readonly b5GuideEnabled: boolean;
  readonly borderCropPx: number;
  readonly spreadMode: KaistorySpreadMode;
  readonly isSpreadHost: boolean;
  readonly cuts: readonly KaistoryPanelCut[];
}

export type KaistoryMemberRole =
  | "owner"
  | "admin"
  | "story_writer"
  | "cartoonist"
  | "viewer";

export const KAISTORY_MEMBER_ROLE_LABELS: Readonly<Record<KaistoryMemberRole, string>> =
  Object.freeze({
    owner: "소유자",
    admin: "관리자",
    story_writer: "스토리작가",
    cartoonist: "만화가",
    viewer: "읽기 전용",
  });

export interface KaistoryProjectSynopsisMeta {
  readonly projectId: string;
  readonly title: string;
  readonly bundleName: string;
  readonly volumeNumber: number | null;
  readonly volumeLabel: string;
  readonly genre: string;
  readonly targetAge: "10s" | "20s" | "30s" | "40s_plus";
  readonly targetGender: "female" | "male" | "all";
  readonly plannedEpisodes: number;
  readonly scheduleCycle: KaistoryScheduleCycle;
  readonly logline: string;
  readonly synopsis: string;
  readonly worldview: string;
  readonly intent: string;
  readonly speakerDisplayMode: KaistorySpeakerDisplayMode;
}

const MAX_KEYWORDS_PER_SCOPE = 30;
const MAX_KEYWORD_LENGTH = 100;

/**
 * 등장인물 나이 문자열에서 연령대(`child`/`teen`/`young`/`adult`/`senior`)를 자동 분류한다.
 */
export function classifyCharacterAgeGroup(ageText: string): KaistoryAgeGroup {
  const normalized = ageText.trim().toLowerCase();
  if (/어린이|초등|유아|아동|child|kid/u.test(normalized)) return "child";
  if (/10대|십대|중학생|고등학생|소녀|소년|teen/u.test(normalized)) return "teen";
  if (/노인|할머니|할아버지|원로|senior|elder/u.test(normalized)) return "senior";
  const numericMatch = normalized.match(/(\d{1,3})/u);
  if (numericMatch) {
    const age = Number(numericMatch[1]);
    if (age <= 12) return "child";
    if (age <= 19) return "teen";
    if (age <= 29) return "young";
    if (age <= 55) return "adult";
    return "senior";
  }
  if (/20대|청년|대학생/u.test(normalized)) return "young";
  return "adult";
}

/**
 * 등장인물 순번(0-based)에서 자동 색상을 결정적으로 반환한다.
 */
export function resolveCharacterAutoColor(index: number): string {
  const safeIndex = Math.max(0, Math.trunc(index));
  return KAISTORY_AUTO_CHARACTER_COLORS[safeIndex % KAISTORY_AUTO_CHARACTER_COLORS.length] ?? "#FF6B6B";
}

/**
 * 표정·분위기 텍스트에서 KAISTORY 14종 감정 카테고리를 매칭한다.
 */
export function matchContiEmotionCategory(text: string): KaistoryEmotionCategory {
  const trimmed = text.trim();
  if (!trimmed) return "normal";
  for (const [category, synonyms] of Object.entries(KAISTORY_EMOTION_SYNONYMS) as [
    KaistoryEmotionCategory,
    readonly string[],
  ][]) {
    if (synonyms.some((word) => trimmed.includes(word))) {
      return category;
    }
  }
  return "normal";
}

/**
 * 키워드 목록을 검증·정규화한다 (`키워드는 100자까지입니다`, `키워드는 30개까지입니다`).
 */
export function validateContiKeywords(rawKeywords: readonly string[]): {
  readonly ok: boolean;
  readonly keywords: readonly string[];
  readonly errorKo?: string;
} {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawKeywords) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_KEYWORD_LENGTH) {
      return {
        ok: false,
        keywords: Object.freeze(cleaned),
        errorKo: `키워드는 ${MAX_KEYWORD_LENGTH}자까지입니다`,
      };
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
  }
  if (cleaned.length > MAX_KEYWORDS_PER_SCOPE) {
    return {
      ok: false,
      keywords: Object.freeze(cleaned.slice(0, MAX_KEYWORDS_PER_SCOPE)),
      errorKo: `키워드는 ${MAX_KEYWORDS_PER_SCOPE}개까지입니다`,
    };
  }
  return { ok: true, keywords: Object.freeze(cleaned) };
}

/**
 * 2페이지 펼침 설정을 검증하고 적용한다.
 * `두 페이지 모두 컷이 있어야 펼침을 만들 수 있어요.` 규칙을 그대로 시행한다.
 */
export function configureContiPageSpread(
  pages: readonly KaistoryContiPage[],
  hostPageNumber: number,
  mode: Exclude<KaistorySpreadMode, "none">,
): {
  readonly ok: boolean;
  readonly pages: readonly KaistoryContiPage[];
  readonly messageKo: string;
} {
  const hostIndex = pages.findIndex((p) => p.pageNumber === hostPageNumber);
  const partnerPage = hostIndex >= 0 ? pages[hostIndex + 1] : undefined;
  const hostPage = hostIndex >= 0 ? pages[hostIndex] : undefined;
  if (!hostPage || !partnerPage) {
    return {
      ok: false,
      pages,
      messageKo: "펼침 설정 실패: 다음 페이지가 존재하지 않습니다.",
    };
  }
  if (hostPage.cuts.length === 0 || partnerPage.cuts.length === 0) {
    return {
      ok: false,
      pages,
      messageKo: "두 페이지 모두 컷이 있어야 펼침을 만들 수 있어요.",
    };
  }
  const updated = pages.map((page, idx) => {
    if (idx === hostIndex) {
      return { ...page, spreadMode: mode, isSpreadHost: true };
    }
    if (idx === hostIndex + 1) {
      return { ...page, spreadMode: mode, isSpreadHost: false };
    }
    return page;
  });
  const description =
    mode === "merge_webtoon"
      ? "쌍 설정 완료 — 웹툰뷰에서 합쳐 표시."
      : "쌍 설정 완료 — 웹툰뷰에서 두 페이지 숨김.";
  return {
    ok: true,
    pages: Object.freeze(updated),
    messageKo: `펼침 ${hostPage.pageNumber}-${partnerPage.pageNumber} ${description}`,
  };
}

/**
 * `conti.kaistory.net`의 대사·보이스오버·효과음 6종 연출 문장을 생성한다.
 */
export function formatContiDialogueDirective(dialogue: KaistoryContiDialogue): string {
  const speaker = dialogue.speakerName.trim() || "인물";
  const line = dialogue.text.trim();
  switch (dialogue.deliveryMode) {
    case "sfx_silent":
      return `효과음 「${line}」 소리가 난다 — 글자는 화면에 띄우지 않는다.`;
    case "thought_vo":
      return `${speaker} 속마음 보이스오버 — 입은 움직이지 않고 표정으로만: "${line}"`;
    case "narration_vo":
      return `${speaker} 내레이션 보이스오버(화면 밖): "${line}"`;
    case "shout":
      return `${speaker} — 한국어로 외친다: "${line}"`;
    case "broadcast":
      return `${speaker} — 스피커 방송처럼 울리는 목소리로 한국어로 말한다: "${line}"`;
    case "normal":
    default:
      return `${speaker} — 한국어로 말한다: "${line}"`;
  }
}

export type KaistoryAnimationCameraMotion =
  | "push_face"
  | "push_slow"
  | "breathing_hold"
  | "pan_side"
  | "wide_pull";

export const KAISTORY_CAMERA_MOTION_DESCRIPTIONS: Readonly<
  Record<KaistoryAnimationCameraMotion, string>
> = Object.freeze({
  push_face: "얼굴에 아주 천천히 밀어 들어간다",
  push_slow: "아주 천천히 밀어 들어간다",
  breathing_hold: "거의 고정, 숨 쉬듯 미세하게 흔들린다",
  pan_side: "천천히 옆으로 흐른다(패닝)",
  wide_pull: "넓게 천천히 옆으로 흐르거나 살짝 뒤로 물러난다",
});

/**
 * `conti.kaistory.net`의 16:9 애니메이션 영상용 첫 장면 리프레이밍 프롬프트를 생성한다.
 */
export function compileAnimationFirstFramePrompt(input: {
  readonly aspectRatioWidth: number;
  readonly aspectRatioHeight: number;
  readonly backgroundHint: string;
  readonly lightingMood: string;
}): {
  readonly already16By9: boolean;
  readonly prompt: string;
} {
  const ratio = input.aspectRatioWidth / Math.max(0.01, input.aspectRatioHeight);
  const targetRatio = 16 / 9;
  const already16By9 = Math.abs(ratio - targetRatio) < 0.06;
  const ratioLabel = `${input.aspectRatioWidth}:${input.aspectRatioHeight}`;
  const framingGuide = already16By9
    ? "원화가 이미 16:9 비율이므로 구도를 그대로 유지합니다."
    : ratio < targetRatio
      ? `원화는 세로(${ratioLabel})라 좌우가 모자랍니다. 인물과 구도는 가운데 그대로 두고, 왼쪽·오른쪽을 같은 배경으로 자연스럽게 이어 그려 넓히세요. 인물을 늘이거나 자르지 마세요.`
      : `원화 비율(${ratioLabel})에 맞춰, 모자라는 쪽은 같은 배경을 자연스럽게 이어 그려 채우고 남는 쪽은 인물을 자르지 않는 선에서만 덜어 냅니다.`;

  const prompt = [
    "첨부한 원화(웹툰 한 컷)를 가로 16:9 화면에 꼭 맞게 다시 그려 주세요 — 애니메이션 영상의 첫 장면으로 씁니다.",
    "원화의 그림체·가는 선·채색·인물의 얼굴·머리색·옷·표정·포즈는 그대로 두고 새로 디자인하지 마세요.",
    `[맞추는 법] ${framingGuide}`,
    `이어 그릴 배경: ${input.backgroundHint.trim() || "원화와 동일한 주변 배경"}`,
    `빛·분위기: ${input.lightingMood.trim() || "원화의 조명과 공기감 유지"}`,
    "[움직일 여유] 카메라가 천천히 밀어 들어가도 인물이 잘리지 않게, 인물 둘레와 화면 가장자리에 여유를 둡니다.",
  ].join("\n");

  return { already16By9, prompt };
}

/**
 * `conti.kaistory.net`의 16:9 애니메이션 영상 모션 프롬프트를 생성한다.
 * 대사 예상 길이가 10초를 초과하면 클립 분할(`a·b`) 경고를 반환한다.
 */
export function compileAnimationMotionPrompt(input: {
  readonly durationSeconds?: number;
  readonly cameraMotion: KaistoryAnimationCameraMotion;
  readonly characterAction: string;
  readonly dialogues: readonly KaistoryContiDialogue[];
}): {
  readonly estimatedSeconds: number;
  readonly exceedsSingleClipLimit: boolean;
  readonly warningKo: string | null;
  readonly prompt: string;
} {
  const totalChars = input.dialogues.reduce((sum, d) => sum + d.text.trim().length, 0);
  const dialogueSeconds = Math.ceil(totalChars / 4.2);
  const estimatedSeconds = Math.max(input.durationSeconds ?? 5, dialogueSeconds, 4);
  const exceedsSingleClipLimit = estimatedSeconds > 10;
  const clipSeconds = Math.min(10, estimatedSeconds);

  const dialogueLines = input.dialogues.map((d) => formatContiDialogueDirective(d));
  const prompt = [
    `첨부한 웹툰 컷 그림을 첫 장면으로, ${clipSeconds}초짜리 일본 순정 애니메이션 한 장면으로 움직여 주세요. 화면비 16:9.`,
    "그림체·가는 선·파스텔 채색·인물의 얼굴과 머리색·옷은 첨부 그림 그대로 유지하고 새로 디자인하지 마세요.",
    "첨부 그림 구도. 한 장면으로 이어지고 컷 전환은 없다.",
    `[인물] 동작 — 첨부 그림 그대로. ${input.characterAction.trim() || "인물이 숨 쉬고 머리카락·옷자락·빛이 미세하게 움직인다."}`,
    `[카메라] ${KAISTORY_CAMERA_MOTION_DESCRIPTIONS[input.cameraMotion]}`,
    "[시간표] 바람·빛·흩날리는 것 등 배경이 천천히 움직인다. 마지막 표정을 잠시 유지한다.",
    ...dialogueLines,
    "말풍선·자막·캡션·효과음 글자·워터마크를 넣지 마세요. 대사는 한국어 음성으로만.",
  ].join("\n");

  return {
    estimatedSeconds,
    exceedsSingleClipLimit,
    warningKo: exceedsSingleClipLimit
      ? "⚠️ 대사가 10초를 넘어 한 클립에 안 들어간다(문서에서는 a·b 로 나눈다)"
      : null,
    prompt,
  };
}

/**
 * 학습카드 프롬프트에 등장인물 투명 스프라이트 일관성 지시문을 결합한다.
 */
export function compileStudyCardCharacterPrompt(input: {
  readonly basePrompt: string;
  readonly characterName?: string;
}): string {
  const base = input.basePrompt.trim();
  if (!input.characterName?.trim()) return base;
  return `${base}\n\n첨부한 인물 그림(${input.characterName.trim()})과 같은 얼굴·머리·옷·색으로 인물을 그려 줘.`;
}

/**
 * 차림별/장소 시트 프롬프트 태그(`〔차림별 시트 프롬프트 — 교복〕`, `〔장소 시트 프롬프트 — 야경〕`)를 파싱한다.
 */
export function parseSheetPromptsFromNote(note: string): readonly {
  readonly kind: "outfit" | "location" | "color";
  readonly variant: string;
  readonly prompt: string;
}[] {
  const results: { kind: "outfit" | "location" | "color"; variant: string; prompt: string }[] = [];
  const lines = note.split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const outfitMatch = line.match(/^〔차림별 시트 프롬프트\s*—\s*([^〕]+)〕\s*(.+)$/u);
    if (outfitMatch) {
      results.push({
        kind: "outfit",
        variant: (outfitMatch[1] ?? "").trim(),
        prompt: (outfitMatch[2] ?? "").trim(),
      });
      continue;
    }
    const locationMatch = line.match(/^〔장소 시트 프롬프트(?:\s*—\s*([^〕]+))?〕\s*(.+)$/u);
    if (locationMatch) {
      results.push({
        kind: "location",
        variant: (locationMatch[1] ?? "기본").trim(),
        prompt: (locationMatch[2] ?? "").trim(),
      });
      continue;
    }
    const colorMatch = line.match(/^\[(채색 프롬프트(?:\s*—\s*[^\]]+)?)\]\s*(.+)$/u);
    if (colorMatch) {
      results.push({
        kind: "color",
        variant: (colorMatch[1] ?? "채색 프롬프트").trim(),
        prompt: (colorMatch[2] ?? "").trim(),
      });
    }
  }
  return Object.freeze(results);
}

/**
 * 멤버 역할별 권한 판정 (`소유자`, `관리자`, `스토리작가`, `만화가`, `읽기 전용`).
 */
export function evaluateContiRolePermissions(role: KaistoryMemberRole): {
  readonly canManageMembers: boolean;
  readonly canEditSynopsisAndScript: boolean;
  readonly canEditDrawingAndLayers: boolean;
  readonly canExportAndRead: boolean;
} {
  switch (role) {
    case "owner":
    case "admin":
      return {
        canManageMembers: true,
        canEditSynopsisAndScript: true,
        canEditDrawingAndLayers: true,
        canExportAndRead: true,
      };
    case "story_writer":
      return {
        canManageMembers: false,
        canEditSynopsisAndScript: true,
        canEditDrawingAndLayers: false,
        canExportAndRead: true,
      };
    case "cartoonist":
      return {
        canManageMembers: false,
        canEditSynopsisAndScript: false,
        canEditDrawingAndLayers: true,
        canExportAndRead: true,
      };
    case "viewer":
    default:
      return {
        canManageMembers: false,
        canEditSynopsisAndScript: false,
        canEditDrawingAndLayers: false,
        canExportAndRead: true,
      };
  }
}

export interface KaistorySyncEnvelope<T> {
  readonly entityId: string;
  readonly baseVersion: number;
  readonly updatedAtMs: number;
  readonly deviceId: string;
  readonly payload: T;
}

/**
 * 오프라인 우선(Offline-First) Last-Write-Wins(LWW) 동기화 병합기.
 */
export function reconcileOfflineContiSync<T>(
  server: KaistorySyncEnvelope<T> | null,
  local: KaistorySyncEnvelope<T>,
): {
  readonly winner: "local" | "server";
  readonly nextVersion: number;
  readonly envelope: KaistorySyncEnvelope<T>;
} {
  if (!server) {
    return {
      winner: "local",
      nextVersion: local.baseVersion + 1,
      envelope: { ...local, baseVersion: local.baseVersion + 1 },
    };
  }
  const localWins =
    local.updatedAtMs > server.updatedAtMs ||
    (local.updatedAtMs === server.updatedAtMs && local.deviceId >= server.deviceId);
  const nextVersion = Math.max(server.baseVersion, local.baseVersion) + 1;
  if (localWins) {
    return {
      winner: "local",
      nextVersion,
      envelope: { ...local, baseVersion: nextVersion },
    };
  }
  return {
    winner: "server",
    nextVersion: server.baseVersion,
    envelope: server,
  };
}
