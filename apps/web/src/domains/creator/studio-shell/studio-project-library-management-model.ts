import { getActiveI18nLocale, translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import { studioProjectFormatProfile } from "../studio-project-format-catalog";
import {
  studioSaveProfileNeedsDestination,
  type StudioSaveProfile,
} from "../save-first/studio-save-profile";
import type {
  StudioProjectKind,
  StudioProjectLibraryEntry,
} from "../studio-project-library-store";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("studio-project-library-management-model", ko, en);

export type StudioProjectLibraryLocale = string;
type StudioProjectLibraryAuthoredLocale = "ko" | "en";
export type StudioProjectLibraryManagementView = "active" | "archived" | "trash";
export type StudioProjectLibrarySortMode = "recent" | "name" | "created";

export const STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS: Readonly<
  Record<StudioProjectLibraryManagementView, Readonly<Record<StudioProjectLibraryAuthoredLocale, string>>>
> = {
  active: { ko: "내 작업", en: "My work" },
  archived: { ko: "보관함", en: "Archive" },
  trash: { ko: "휴지통", en: "Trash" },
};

export const STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS: Readonly<
  Record<StudioProjectLibraryManagementView, Readonly<Record<StudioProjectLibraryAuthoredLocale, string>>>
> = {
  active: {
    ko: "임시 자동저장 작업과 정식 저장한 프로젝트를 한곳에서 이어서 관리합니다.",
    en: "Continue temporary autosaves and formally saved projects from one place.",
  },
  archived: {
    ko: "잠시 치워 둔 프로젝트를 선택하거나 한꺼번에 내 작업으로 복구합니다.",
    en: "Restore selected or all archived projects to My work.",
  },
  trash: {
    ko: "삭제한 프로젝트를 복구하거나, 확인 후 선택 삭제·휴지통 비우기를 실행합니다.",
    en: "Restore deleted projects or permanently remove selected items after confirmation.",
  },
};

export const STUDIO_PROJECT_KIND_LABELS: Readonly<
  Record<StudioProjectKind, Readonly<Record<StudioProjectLibraryAuthoredLocale, string>>>
> = {
  webtoon: { ko: "웹툰", en: "Webtoon" },
  illustration: { ko: "일러스트", en: "Illustration" },
  image: { ko: "이미지 편집", en: "Image editing" },
  design: { ko: "디자인", en: "Design" },
  slides: { ko: "발표 자료", en: "Presentation" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  "three-d": { ko: "3D 장면", en: "3D scene" },
  animation: { ko: "애니메이션", en: "Animation" },
};

export function studioProjectLibraryTypeLabel(project: StudioProjectLibraryEntry): string {
  if (project.definition) {
    const profile = studioProjectFormatProfile(project.definition.format);
    return bi(profile.titleKo, profile.titleEn);
  }
  return bi(STUDIO_PROJECT_KIND_LABELS[project.kind].ko, STUDIO_PROJECT_KIND_LABELS[project.kind].en);
}

export function studioProjectLibraryLocale(_language: string): StudioProjectLibraryLocale {
  return getActiveI18nLocale();
}

export function resolveStudioProjectLibraryManagementView(
  value: string | null,
): StudioProjectLibraryManagementView {
  if (value === "archived" || value === "trash") return value;
  return "active";
}

export function studioProjectLibraryManagementViewHref(
  view: StudioProjectLibraryManagementView,
): string {
  return view === "active" ? "/studio" : `/studio?view=${view}`;
}

const dateTimeFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = dateTimeFormatterByLocale.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    dateTimeFormatterByLocale.set(locale, formatter);
  }
  return formatter;
}

export function studioProjectLibraryDateLabel(
  value: string | null,
  _locale: string,
): string {
  if (!value) {
    return bi("아직 없음", "Not yet");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return bi("아직 없음", "Not yet");
  }
  return getDateTimeFormatter(getActiveI18nLocale()).format(new Date(timestamp));
}

export function studioProjectIsTemporaryWork(profile: StudioSaveProfile): boolean {
  return studioSaveProfileNeedsDestination(profile);
}

export function studioProjectLibrarySearchText(
  project: StudioProjectLibraryEntry,
  _locale: string,
): string {
  return [
    project.title,
    project.description,
    studioProjectLibraryTypeLabel(project),
  ]
    .join(" ")
    .normalize("NFC")
    .toLocaleLowerCase();
}

export function sortStudioProjectLibraryProjects(
  projects: readonly StudioProjectLibraryEntry[],
  sort: StudioProjectLibrarySortMode,
): readonly StudioProjectLibraryEntry[] {
  if (projects.length <= 1) return projects;
  if (sort === "name") {
    return [...projects].sort((left, right) => left.title.localeCompare(right.title));
  }
  if (sort === "created") {
    return projects
      .map((project) => ({ project, createdMs: Date.parse(project.createdAt) || 0 }))
      .sort((left, right) => right.createdMs - left.createdMs || left.project.title.localeCompare(right.project.title))
      .map((entry) => entry.project);
  }
  return projects
    .map((project) => ({
      project,
      lastOpenedMs: Date.parse(project.lastOpenedAt) || 0,
      updatedMs: Date.parse(project.updatedAt) || 0,
    }))
    .sort(
      (left, right) =>
        right.lastOpenedMs - left.lastOpenedMs
        || right.updatedMs - left.updatedMs
        || left.project.title.localeCompare(right.project.title),
    )
    .map((entry) => entry.project);
}
