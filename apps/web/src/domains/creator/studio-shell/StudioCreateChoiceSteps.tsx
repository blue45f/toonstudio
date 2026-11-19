import type { ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { StudioToolArtwork, type StudioArtworkTool } from "../studio-tool-art/StudioToolArtwork";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { FormStepSection } from "@/shared/components/layout/FormStepSection";
import { cn } from "@/shared/lib/utils";
import { STUDIO_AUXILIARY_WORKSPACE_OPTIONS, STUDIO_PROJECT_FORMAT_PROFILES, STUDIO_PROJECT_START_POINT_OPTIONS,
  type StudioAuxiliaryWorkspaceOption, type StudioProjectFormatProfile } from "../studio-project-format-catalog";
import type { StudioProjectStartPoint } from "../studio-project-definition";
import { AUXILIARY_ICONS } from "./studio-mode-project-create-helpers";
import { StudioProjectFormatVisual } from "./StudioProjectFormatPreview";

const FORMAT_ART: Readonly<Record<StudioProjectFormatProfile["id"], string>> = {
  "vertical-webtoon": "/brand/illustrated-20260928/canvas-noir-320.webp",
  cuttoon: "/brand/illustrated-20260928/project-romance-320.webp",
  "page-comic": "/brand/illustrated-20260928/project-crimson-320.webp",
  "motion-toon": "/brand/illustrated-20260928/character-blue-320.webp",
  illustration: "/brand/illustrated-20260928/character-pink-320.webp",
};

/** 형식 선택 UI만 분리한다. 생성·템플릿·착지 상태의 권위는 부모에 남긴다. */
export function StudioCreateFormatStep({ format, auxiliary, locale, onFormat, onAuxiliary, primaryAction }: {
  readonly format: StudioProjectFormatProfile; readonly auxiliary: StudioAuxiliaryWorkspaceOption | null;
  readonly locale: "ko" | "en"; readonly onFormat: (profile: StudioProjectFormatProfile) => void;
  readonly onAuxiliary: (option: StudioAuxiliaryWorkspaceOption) => void;
  readonly primaryAction: ReactNode;
}) {
  const bt = useBilingual("StudioModeProjectCreatePage");
  return (
          <FormStepSection
            step={1}
            titleId="studio-format-title"
            title={bt("만들 작품 형식을 골라 주세요", "Choose the format to create")}
            className="studio-create-format-section"
          >
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" data-studio-format-count={STUDIO_PROJECT_FORMAT_PROFILES.length}>
              {STUDIO_PROJECT_FORMAT_PROFILES.map((profile) => {
                const active = !auxiliary && profile.id === format.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={active}
                    data-studio-create-format={profile.id}
                    onClick={() => onFormat(profile)}
                    className={cn(
                      "min-w-0 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                      active
                        ? "border-accent bg-accent-soft/45"
                        : "border-line bg-panel/45 hover:border-line-strong hover:bg-raised",
                    )}
                  >
                    <span className="studio-create-format-art" aria-hidden="true">
                      <img src={FORMAT_ART[profile.id]} alt="" width={320} height={180} decoding="async" />
                      <StudioProjectFormatVisual profile={profile} active={active} className="studio-create-format-preview" />
                    </span>
                    <strong className="mt-3 block break-words text-sm text-fg">{bt(profile.titleKo, profile.titleEn)}</strong>
                    {active ? <span className="studio-create-format-selected">{bt("✓ 선택됨", "✓ Selected")}</span> : null}
                  </button>
                );
              })}
            </div>

            <p className="studio-create-format-description" role="status" aria-atomic="true">
              {auxiliary ? `${bt(auxiliary.titleKo, auxiliary.titleEn)} · ${bt(auxiliary.descriptionKo, auxiliary.descriptionEn)}` : bt(format.descriptionKo, format.descriptionEn)}
              {!auxiliary ? ` · ${(locale === "ko" ? format.outputsKo : format.outputsEn).slice(0, 2).join(" · ")}` : null}
            </p>

            {primaryAction}

            <details className="mt-4 rounded-2xl border border-line bg-panel/35" open={Boolean(auxiliary) || undefined} data-studio-auxiliary-workspaces="true">
              <summary className="min-h-12 cursor-pointer content-center px-4 text-sm font-bold text-fg-2">
                {bt("작품 프로젝트가 아닌 단일 작업실로 시작", "Start with a standalone workspace")}
                <span className="ml-2 text-xs font-medium text-fg-2">
                  {bt("스토리보드·이미지 편집·3D·홍보·발표", "Storyboard, image, 3D, promotion or slides")}
                </span>
              </summary>
              <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-5">
                {STUDIO_AUXILIARY_WORKSPACE_OPTIONS.map((option) => {
                  const Icon = AUXILIARY_ICONS[option.id];
                  const active = auxiliary?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      data-studio-auxiliary-kind={option.id}
                      onClick={(event) => {
                        onAuxiliary(option);
                        event.currentTarget.closest("section")?.querySelector<HTMLElement>("[data-studio-create-step-next]")?.focus();
                      }}
                      className={cn(
                        "min-h-24 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                        active ? "border-accent bg-accent-soft/45" : "border-line bg-card hover:bg-raised",
                      )}
                    >
                      <Icon size={18} className={active ? "text-accent" : "text-fg-2"} aria-hidden="true" />
                      <strong className="mt-2 block text-xs text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                      <span className="mt-1 line-clamp-2 block text-[0.68rem] leading-5 text-fg-2">
                        {bt(option.descriptionKo, option.descriptionEn)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>
          </FormStepSection>
  );
}

export type StudioCreateStartChoice = StudioProjectStartPoint | "editor";

const EDITOR_START = {
  id: "editor", titleKo: "편집기에서 바로 시작", titleEn: "Start in the editor",
  descriptionKo: "선택한 크기로 첫 문서를 엽니다.", descriptionEn: "Open the first document at the selected size.",
} as const;

const START_WORKSPACES: Record<StudioCreateStartChoice, { art: StudioArtworkTool; ko: string; en: string }> = {
  editor: { art: "drawingDesk", ko: EDITOR_START.titleKo, en: EDITOR_START.titleEn },
  idea: { art: "bubble", ko: "이야기 기획", en: "Story planning" },
  script: { art: "manuscript", ko: "대본 작성", en: "Script writing" },
  storyboard: { art: "storyboard", ko: "콘티·이미지 배치", en: "Storyboard and image layout" },
  files: { art: "projects", ko: "파일 가져오기", en: "Import files" },
};

export function StudioCreateStartStep({ selected, editorEntry, onStartPoint }: {
  readonly selected: StudioCreateStartChoice;
  readonly editorEntry: boolean;
  readonly onStartPoint: (value: StudioCreateStartChoice) => void;
}) {
  const bt = useBilingual("StudioModeProjectCreatePage");
  const options = editorEntry ? [EDITOR_START, ...STUDIO_PROJECT_START_POINT_OPTIONS] : STUDIO_PROJECT_START_POINT_OPTIONS;
  const choices = (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" data-studio-start-options>
      {options.map((option) => (
        <button
          key={option.id} type="button" aria-pressed={selected === option.id} data-studio-start-point={option.id}
          onClick={() => onStartPoint(option.id)}
          className={cn(
            "flex min-h-12 min-w-0 items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-accent",
            selected === option.id ? "border-accent bg-accent-soft/45" : "border-line bg-card hover:bg-raised",
          )}
        >
          <StudioToolArtwork tool={START_WORKSPACES[option.id].art} />
          <span className="min-w-0 flex-1">
            <strong className="block text-sm text-fg">
              {editorEntry ? bt(START_WORKSPACES[option.id].ko, START_WORKSPACES[option.id].en) : bt(option.titleKo, option.titleEn)}
            </strong>
            <span className="mt-0.5 block text-xs leading-5 text-fg-2">{bt(option.descriptionKo, option.descriptionEn)}</span>
          </span>
          {selected === option.id && <Check size={17} className="shrink-0 text-accent" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
  const choice = options.find((option) => option.id === selected);
  return (
    <FormStepSection step={3} titleId="studio-start-point-title"
      title={editorEntry ? bt("첫 작업 화면", "First workspace") : bt("지금 어디서부터 시작할까요?", "Where would you like to start?")}>
      {editorEntry && choice ? (
        <details data-studio-start-disclosure className="group mt-2">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl border border-line bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-accent">
            <StudioToolArtwork tool={START_WORKSPACES[choice.id].art} />
            <strong className="min-w-0 flex-1 text-fg">{bt(START_WORKSPACES[choice.id].ko, START_WORKSPACES[choice.id].en)}</strong>
            <span className="text-xs font-semibold text-fg-2">{bt("변경", "Change")}</span>
            <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180 motion-safe:transition-transform" />
          </summary>
          {choices}
        </details>
      ) : choices}
    </FormStepSection>
  );
}
