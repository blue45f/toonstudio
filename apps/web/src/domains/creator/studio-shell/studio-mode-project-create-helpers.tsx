/* eslint-disable react-refresh/only-export-components -- 분리된 프로젝트 생성 헬퍼 컴포넌트와 정적 선택지 빌더를 함께 소유한다 */
import {
  Box,
  BriefcaseBusiness,
  Clapperboard,
  FileImage,
  FileText,
  LayoutTemplate,
  Lightbulb,
  Presentation,
  Upload,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type {
  StudioProjectCollaboration,
  StudioProjectFormat,
  StudioProjectPurpose,
  StudioProjectStartPoint,
} from "../studio-project-definition";
import {
  STUDIO_AUXILIARY_WORKSPACE_OPTIONS,
  STUDIO_PROJECT_FORMAT_PROFILES,
  STUDIO_PROJECT_START_POINT_OPTIONS,
  studioProjectFormatFromLegacy,
  type StudioAuxiliaryWorkspaceOption,
} from "../studio-project-format-catalog";
import type { StudioProjectKind } from "../studio-project-library-store";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type {
  WebtoonOnboardingGoalId,
  WebtoonStartingPointId,
  WebtoonTeamModelId,
} from "@/shared/lib/webtoon-production-onboarding";

export type Choice<T extends string> = {
  readonly id: T;
  readonly labelKo: string;
  readonly labelEn: string;
};

export type AuxiliaryKind = StudioAuxiliaryWorkspaceOption["id"];

export const AUXILIARY_ICONS: Readonly<Record<AuxiliaryKind, LucideIcon>> = {
  storyboard: Clapperboard,
  image: FileImage,
  "three-d": Box,
  design: LayoutTemplate,
  slides: Presentation,
};

export const START_POINT_ICONS: Readonly<Record<StudioProjectStartPoint, LucideIcon>> = {
  idea: Lightbulb,
  script: FileText,
  storyboard: Clapperboard,
  files: Upload,
};

export const COLLABORATION_ICONS: Readonly<Record<StudioProjectCollaboration, LucideIcon>> = {
  solo: UserRound,
  team: UsersRound,
  client: BriefcaseBusiness,
};

export const CREATE_DISABLED_REASON_ID = "studio-create-disabled-reason";
export const CREATE_SIZE_REASON_ID = "studio-create-size-reason";
export const PROJECT_TITLE_INPUT_ID = "studio-mode-project-title";
export const CANVAS_WIDTH_INPUT_ID = "studio-mode-canvas-width";
export const CANVAS_HEIGHT_INPUT_ID = "studio-mode-canvas-height";
/** 문서 저장소가 허용하는 캔버스 한 변의 범위(studio-project-document-store의 positiveDimension과 동일). */
export const CANVAS_DIMENSION_MIN = 1;
export const CANVAS_DIMENSION_MAX = 1_000_000;

export function parseCanvasDimension(raw: string): number | null {
  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value) || value < CANVAS_DIMENSION_MIN || value > CANVAS_DIMENSION_MAX) {
    return null;
  }
  return value;
}

/** 가져온 아이디어 칩에서 제목 입력칸으로 바로 이동한다(모션 감소 설정을 따른다). */
export function focusProjectTitle(): void {
  const input = document.getElementById(PROJECT_TITLE_INPUT_ID);
  if (!(input instanceof HTMLInputElement)) return;
  const reduceMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  input.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  input.focus({ preventScroll: true });
  input.select();
}

export function requestedFormat(
  format: string | null,
  kind: string | null,
  templateId: string | null,
): StudioProjectFormat {
  const explicit = STUDIO_PROJECT_FORMAT_PROFILES.find((profile) => profile.id === format)?.id;
  return explicit ?? studioProjectFormatFromLegacy(kind, templateId) ?? "vertical-webtoon";
}

export function requestedAuxiliary(
  format: string | null,
  kind: string | null,
  templateId: string | null,
): StudioAuxiliaryWorkspaceOption | null {
  if (format || studioProjectFormatFromLegacy(kind, templateId)) return null;
  return STUDIO_AUXILIARY_WORKSPACE_OPTIONS.find((option) => option.id === kind) ?? null;
}

export function normalizedRequestedTemplate(
  format: StudioProjectFormat,
  templateId: string | null,
): string | null {
  if (format === "cuttoon" && templateId === "webtoon-four-cut") return "cuttoon-square-4";
  if (format === "page-comic" && templateId === "webtoon-page") return "page-comic-digital-8";
  if (format === "motion-toon" && (templateId === "motion-webtoon" || templateId === "animation-short")) {
    return "motion-toon-vertical";
  }
  return templateId;
}

/** `?start=`로 넘어온 시작점(작품 홈의 한 줄 아이디어 등). 모르는 값은 무시한다. */
export function requestedStartPoint(value: string | null): StudioProjectStartPoint | null {
  return STUDIO_PROJECT_START_POINT_OPTIONS.find((option) => option.id === value)?.id ?? null;
}

export function projectStartPointFromOnboarding(
  value: WebtoonStartingPointId | undefined,
): StudioProjectStartPoint {
  if (value === "script") return "script";
  if (value === "storyboard") return "storyboard";
  if (value === "finished-art" || value === "serializing") return "files";
  return "idea";
}

export function onboardingStartPointFromProject(
  value: StudioProjectStartPoint,
): WebtoonStartingPointId {
  if (value === "script") return "script";
  if (value === "storyboard") return "storyboard";
  if (value === "files") return "finished-art";
  return "idea";
}

export function projectPurposeFromOnboarding(
  value: WebtoonOnboardingGoalId | undefined,
): StudioProjectPurpose {
  if (value === "pitch") return "portfolio";
  if (value === "contracted") return "client-work";
  return "serial";
}

export function projectCollaborationFromOnboarding(
  value: WebtoonTeamModelId | undefined,
): StudioProjectCollaboration {
  return value && value !== "solo" ? "team" : "solo";
}

export function standaloneDocumentTitle(
  kind: StudioProjectKind,
  title: string,
  locale: "ko" | "en",
): string {
  if (kind === "slides") return locale === "ko" ? "발표 자료" : "Presentation";
  if (kind === "storyboard") return locale === "ko" ? "첫 스토리보드" : "First storyboard";
  if (kind === "three-d") return locale === "ko" ? "첫 3D 장면" : "First 3D scene";
  return locale === "ko" ? `${title} 작업 문서` : `${title} working document`;
}

export function hrefWithFormat(href: string, format: StudioProjectFormat): string {
  const [pathname = href, rawSearch = ""] = href.split("?", 2);
  const search = new URLSearchParams(rawSearch);
  search.set("format", format);
  return `${pathname}?${search.toString()}`;
}

export function OnboardingSelect<T extends string>({
  id,
  label,
  value,
  choices,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];
  readonly onChange: (next: T) => void;
}) {
  const bt = useBilingual("StudioModeProjectCreatePage.onboardingSelect");
  return (
    <label className="text-xs font-bold text-fg-2" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg outline-none focus:border-accent"
      >
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {bt(choice.labelKo, choice.labelEn)}
          </option>
        ))}
      </select>
    </label>
  );
}
