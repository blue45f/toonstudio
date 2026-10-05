/**
 * AI 슈퍼 스위트의 선택지 카탈로그 — 탭 정의와 화풍·조명·장르 선택지, 입력 필드 클래스.
 *
 * StudioAiSuperSuiteModal.tsx에서 분리했다(파일 크기 래칫 해소). 선택지의 id 집합이 곧
 * 워크벤치 환경설정에 저장 가능한 값의 경계라, 모달 본체와 분리해도 한곳에서만 정의한다.
 */
import {
  Clapperboard,
  MessageCircle,
  Palette,
  Sun,
  Zap,
} from "lucide-react";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
} from "../studio-panel-ui";

import type { StudioWorkbenchTab } from "../studio-workbench-tabs";
import type { PromptGenreHint } from "./studio-ai-prompt-enhancer";
import type {
  AmbientLightingTemperature,
  LightDirectionPreset,
} from "./studio-ai-shading-assist";
import type { WebtoonArtStyleId } from "./studio-ai-webtoon-style-filter";

import { cn } from "@/shared/lib/utils";

export const AI_SUPER_SUITE_TAB_IDS = [
  "style-filter",
  "shading-assist",
  "prompt-enhancer",
  "storyboard-director",
  "emotion-bubble",
] as const;

export type AiSuperSuiteTab = (typeof AI_SUPER_SUITE_TAB_IDS)[number];

export const AI_SUPER_SUITE_TABS: readonly (StudioWorkbenchTab & { readonly id: AiSuperSuiteTab })[] = [
  { id: "style-filter", label: "화풍 변환 툰필터", icon: Palette },
  { id: "shading-assist", label: "AI 음영 어시스트", icon: Sun },
  { id: "prompt-enhancer", label: "프롬프트 증강기", icon: Zap },
  { id: "storyboard-director", label: "콘티 자동 디렉터", icon: Clapperboard },
  { id: "emotion-bubble", label: "감정-말풍선 매처", icon: MessageCircle },
];

export const WEBTOON_ART_STYLE_IDS = [
  "romance-manhwa",
  "action-shonen-ink",
  "fantasy-noble-cel",
  "thriller-noir-grit",
  "anime-cel",
] as const satisfies readonly WebtoonArtStyleId[];

export const LIGHT_DIRECTION_BUTTONS = [
  { id: "top-left", label: "↖ 좌상단" },
  { id: "top", label: "↑ 상단 정면" },
  { id: "top-right", label: "↗ 우상단" },
  { id: "left", label: "← 좌측광" },
  { id: "backlight-rim", label: "☼ 역광/림" },
  { id: "right", label: "→ 우측광" },
  { id: "bottom-left", label: "↙ 좌하단" },
  { id: "bottom", label: "↓ 하단 언더" },
  { id: "bottom-right", label: "↘ 우하단" },
] as const satisfies readonly { id: LightDirectionPreset; label: string }[];

export const LIGHT_DIRECTION_IDS = LIGHT_DIRECTION_BUTTONS.map((button) => button.id);

export const AMBIENT_TEMPERATURE_BUTTONS = [
  { id: "warm-dawn", label: "새벽 웜톤" },
  { id: "neutral-day", label: "대낮 뉴트럴" },
  { id: "cool-moon", label: "달빛 쿨톤" },
  { id: "sunset-golden", label: "석양 골든" },
] as const satisfies readonly { id: AmbientLightingTemperature; label: string }[];

export const AMBIENT_TEMPERATURE_IDS = AMBIENT_TEMPERATURE_BUTTONS.map((button) => button.id);

/** 빈 문자열 = "자동 감지". 엔진의 detectGenre 에 맡긴다는 뜻이라 정당한 저장 값이다. */
export const GENRE_HINT_CHOICES = [
  { id: "", label: "자동 감지" },
  { id: "action", label: "액션" },
  { id: "romance", label: "로맨스" },
  { id: "fantasy", label: "판타지" },
  { id: "slice-of-life", label: "일상" },
  { id: "horror", label: "호러" },
] as const satisfies readonly { id: PromptGenreHint | ""; label: string }[];

export type GenreHintChoice = (typeof GENRE_HINT_CHOICES)[number]["id"];

export const GENRE_HINT_IDS = GENRE_HINT_CHOICES.map((choice) => choice.id);

/**
 * 아이디어 입력의 최소 길이. 이보다 짧으면 화풍 키워드만 남은 "주어 없는 프롬프트"가 나와서
 * 생성기에 넣어도 쓸 수 없다 — 결과를 만들어 보여주는 대신 입력을 요구한다.
 */
export const MIN_IDEA_LENGTH = 2;

export const PANEL_CARD_CLASS = "flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3";
export const TEXT_FIELD_CLASS = cn(
  "w-full rounded-md border border-line bg-card px-3 py-2 text-xs text-fg",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  "aria-[invalid=true]:border-bad/60"
);
