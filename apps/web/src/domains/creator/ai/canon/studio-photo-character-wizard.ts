/**
 * 사진→캐릭터 생성 위저드의 순수 로직 — 단계 정의, 스타일 카탈로그, 생성 실행, 캐논 draft 조립.
 *
 * 재료는 전부 기존재다: 스타일은 사진→웹툰 프리셋(studio-photo-webtoon-preset.ts) 3종을 그대로
 * 쓰고, 생성은 BYOK 이미지 편집(generateConsistentCharacterImage), 저장은 캐릭터 캐논
 * (studio-character-canon.ts)으로 간다. 이 모듈이 새로 만드는 것은 "넷을 한 동선으로 묶는"
 * 단계 계약뿐이다 — 없는 스타일을 지어내지 않고, 프리셋 카탈로그가 늘면 스타일 선택지도
 * 같은 id 집합으로 따라 늘어난다.
 *
 * 프리셋의 patch는 Konva 필터 전용 값이라 이미지 생성 프롬프트로 쓸 수 없다. 그래서 스타일마다
 * 생성용 지시문을 따로 두되, 문구는 프리셋 tip이 설명하는 결과(카툰 잉크선·셀셰이딩·망점)와
 * 어긋나지 않게 맞췄다 — 필터 결과와 생성 결과가 같은 스타일 이름 아래에서 크게 다르게
 * 느껴지지 않도록 하기 위해서다.
 */
import {
  PHOTO_WEBTOON_PRESETS,
  type PhotoWebtoonPresetId,
} from "../../studio-photo-webtoon-preset";
import {
  isStudioAiConfigured,
  type StudioAiResult,
  type StudioAiSettings,
} from "../studio-ai-client";
import type { CanonSheetDraft } from "./studio-character-canon";

// ---------------------------------------------------------------------------
// 단계
// ---------------------------------------------------------------------------

export const PHOTO_CHARACTER_WIZARD_STEPS = [
  { id: "photo", ko: "사진 올리기", en: "Add a photo" },
  { id: "style", ko: "스타일 고르기", en: "Pick a style" },
  { id: "generate", ko: "캐릭터 생성", en: "Generate" },
  { id: "details", ko: "이름·설명", en: "Name & describe" },
] as const;

export type PhotoCharacterWizardStepId =
  (typeof PHOTO_CHARACTER_WIZARD_STEPS)[number]["id"];

// ---------------------------------------------------------------------------
// 스타일 카탈로그 — 프리셋 3종 재사용 + 생성용 지시문
// ---------------------------------------------------------------------------

export interface PhotoCharacterStyleOption {
  readonly id: PhotoWebtoonPresetId;
  readonly label: string;
  readonly tip: string;
  readonly swatch: string;
  /** generateConsistentCharacterImage의 상황 프롬프트로 들어가는 스타일 지시문. */
  readonly generationPrompt: string;
}

const GENERATION_PROMPTS: Record<PhotoWebtoonPresetId, string> = {
  "vivid-cartoon":
    "사진 속 인물을 선명한 컬러 웹툰 캐릭터 일러스트로 다시 그려 주세요. 색 경계에 옅은 잉크 선을 넣고 색을 단순하고 화사하게 정리한 카툰 스타일로, 인물의 얼굴과 헤어스타일, 옷차림이 사진과 닮게 유지해 주세요.",
  "soft-cel-shade":
    "사진 속 인물을 부드러운 셀셰이딩의 로맨스 웹툰 캐릭터 일러스트로 다시 그려 주세요. 은은한 색 계단과 따뜻한 톤으로 피부와 머리카락을 폭신하게 표현하고, 인물의 얼굴과 헤어스타일, 옷차림이 사진과 닮게 유지해 주세요.",
  "mono-screentone":
    "사진 속 인물을 흑백 만화 원고 스타일 일러스트로 다시 그려 주세요. 잉크 선화와 고운 망점(스크린톤)으로 흑백 웹툰 컷처럼 표현하고, 인물의 얼굴과 헤어스타일, 옷차림이 사진과 닮게 유지해 주세요.",
};

export const PHOTO_CHARACTER_STYLE_OPTIONS: readonly PhotoCharacterStyleOption[] =
  PHOTO_WEBTOON_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    tip: preset.tip,
    swatch: preset.swatch,
    generationPrompt: GENERATION_PROMPTS[preset.id],
  }));

export function photoCharacterStyleOption(
  id: string,
): PhotoCharacterStyleOption | undefined {
  return PHOTO_CHARACTER_STYLE_OPTIONS.find((option) => option.id === id);
}

// ---------------------------------------------------------------------------
// 단계 전이 가드
// ---------------------------------------------------------------------------

export function canLeavePhotoStep(photoDataUrl: string | null): boolean {
  return Boolean(photoDataUrl);
}

export function canLeaveStyleStep(styleId: string | null): boolean {
  return styleId !== null && photoCharacterStyleOption(styleId) !== undefined;
}

/**
 * 최종 저장에 쓸 이미지 — 생성 결과가 있으면 그것, 없고 "원본으로 계속"을 골랐으면 원본 사진.
 * 둘 다 없으면 아직 저장할 이미지가 없는 것이다.
 */
export function resolvePhotoCharacterResultImage(input: {
  readonly generatedDataUrl: string | null;
  readonly photoDataUrl: string | null;
  readonly useOriginalPhoto: boolean;
}): string | null {
  if (input.generatedDataUrl) return input.generatedDataUrl;
  if (input.useOriginalPhoto) return input.photoDataUrl;
  return null;
}

// ---------------------------------------------------------------------------
// 생성 — generateConsistentCharacterImage와 같은 계약의 함수를 주입받아 테스트 가능하게 둔다
// ---------------------------------------------------------------------------

export type PhotoCharacterGenerateFn = (
  settings: StudioAiSettings,
  referenceImageSrc: string,
  situationPrompt: string,
  opts?: { readonly signal?: AbortSignal },
) => Promise<StudioAiResult<{ dataUrl: string }>>;

/** 스타일 지시문 + 사용자가 덧붙인 메모를 하나의 상황 프롬프트로 조립한다. */
export function buildPhotoCharacterGenerationPrompt(
  styleId: string,
  note?: string,
): string | null {
  const option = photoCharacterStyleOption(styleId);
  if (!option) return null;
  const trimmedNote = (note ?? "").trim();
  return trimmedNote
    ? `${option.generationPrompt}\n추가 요청: ${trimmedNote}`
    : option.generationPrompt;
}

/**
 * 생성 실행 — 클라이언트(generateConsistentCharacterImage)와 같은 실패 계약을 호출 전에
 * 먼저 검사해, UI가 버튼을 잘못 활성화해도 키 없이 유료 요청이 나가지 않게 한다.
 */
export async function runPhotoCharacterGeneration(
  input: {
    readonly settings: StudioAiSettings;
    readonly photoDataUrl: string | null;
    readonly styleId: string | null;
    readonly note?: string;
    readonly signal?: AbortSignal;
  },
  generate: PhotoCharacterGenerateFn,
): Promise<StudioAiResult<{ dataUrl: string }>> {
  if (!input.photoDataUrl) {
    return { ok: false, code: "invalid_input", error: "먼저 사진을 올려 주세요." };
  }
  const prompt = input.styleId
    ? buildPhotoCharacterGenerationPrompt(input.styleId, input.note)
    : null;
  if (!prompt) {
    return { ok: false, code: "invalid_input", error: "스타일을 골라 주세요." };
  }
  if (!isStudioAiConfigured(input.settings)) {
    return {
      ok: false,
      code: "not_configured",
      error: "설정에서 API 키를 등록하세요.",
    };
  }
  return generate(input.settings, input.photoDataUrl, prompt, {
    signal: input.signal,
  });
}

// ---------------------------------------------------------------------------
// 캐논 draft 조립 — 저장은 캐논 라이브러리가 담당하고, 여기서는 입력 변환만 한다
// ---------------------------------------------------------------------------

export function buildPhotoCharacterCanonDraft(input: {
  readonly name: string;
  readonly description: string;
  readonly imageDataUrl: string | null;
  readonly styleId: string | null;
  readonly usedOriginalPhoto: boolean;
}): CanonSheetDraft {
  const option = input.styleId
    ? photoCharacterStyleOption(input.styleId)
    : undefined;
  return {
    name: input.name,
    appearance: input.description,
    outfit: "",
    tags: [
      input.usedOriginalPhoto ? "사진 등록" : "사진 생성",
      ...(option ? [option.label] : []),
    ],
    referenceImage: input.imageDataUrl,
    referenceSource: "upload",
    referenceLabel: option
      ? `사진으로 만든 캐릭터 · ${option.label}`
      : "사진으로 만든 캐릭터",
  };
}
