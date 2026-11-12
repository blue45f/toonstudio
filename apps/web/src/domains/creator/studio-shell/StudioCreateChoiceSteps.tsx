import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { FormStepSection } from "@/shared/components/layout/FormStepSection";
import { cn } from "@/shared/lib/utils";
import { STUDIO_AUXILIARY_WORKSPACE_OPTIONS, STUDIO_PROJECT_FORMAT_PROFILES, STUDIO_PROJECT_START_POINT_OPTIONS,
  type StudioAuxiliaryWorkspaceOption, type StudioProjectFormatProfile } from "../studio-project-format-catalog";
import type { StudioProjectStartPoint } from "../studio-project-definition";
import { AUXILIARY_ICONS, START_POINT_ICONS } from "./studio-mode-project-create-helpers";
import { StudioProjectFormatVisual } from "./StudioProjectFormatPreview";

/** 형식 선택 UI만 분리한다. 생성·템플릿·착지 상태의 권위는 부모에 남긴다. */
export function StudioCreateFormatStep({ format, auxiliary, locale, onFormat, onAuxiliary }: {
  readonly format: StudioProjectFormatProfile; readonly auxiliary: StudioAuxiliaryWorkspaceOption | null;
  readonly locale: "ko" | "en"; readonly onFormat: (profile: StudioProjectFormatProfile) => void;
  readonly onAuxiliary: (option: StudioAuxiliaryWorkspaceOption) => void;
}) {
  const bt = useBilingual("StudioModeProjectCreatePage");
  return (
          <FormStepSection
            step={1}
            titleId="studio-format-title"
            title={bt("만들 작품 형식을 골라 주세요", "Choose the format to create")}
            description={bt("독자가 보게 될 화면 형태를 고르면 알맞은 캔버스 크기를 자동으로 맞춰 드려요.", "Choose how readers will view your work and we will set the right canvas size.")}
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
                    <span className="studio-format-illustration" data-format={profile.id} aria-hidden="true">
                      <span>{bt("안내 일러스트", "Guide illustration")}</span>
                    </span>
                    <StudioProjectFormatVisual profile={profile} active={active} className="h-32" />
                    <strong className="mt-3 block break-words text-sm text-fg">{bt(profile.titleKo, profile.titleEn)}</strong>
                    <span className="mt-1 block min-h-5 text-xs font-bold text-accent">{active ? bt("✓ 선택됨", "✓ Selected") : null}</span>


                  </button>
                );
              })}
            </div>

            <p className="studio-create-format-description" role="status" aria-atomic="true">
              {auxiliary ? bt(auxiliary.descriptionKo, auxiliary.descriptionEn) : bt(format.descriptionKo, format.descriptionEn)}
              {!auxiliary ? ` · ${(locale === "ko" ? format.outputsKo : format.outputsEn).slice(0, 2).join(" · ")}` : null}
            </p>

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
                      onClick={() => onAuxiliary(option)}
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

export function StudioCreateStartStep({ effectiveStartPoint, onStartPoint }: {
  readonly effectiveStartPoint: StudioProjectStartPoint; readonly onStartPoint: (value: StudioProjectStartPoint) => void;
}) {
  const bt = useBilingual("StudioModeProjectCreatePage");
  return (
          <FormStepSection
            step={3}
            titleId="studio-start-point-title"
            title={bt("지금 어디서부터 시작할까요?", "Where would you like to start?")}
            description={bt("고른 단계에 맞춰 가장 먼저 필요한 작업 화면으로 바로 안내해 드려요.", "Jump straight to the first workspace that matches what you have ready.")}
          >
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {STUDIO_PROJECT_START_POINT_OPTIONS.map((option) => {
                const Icon = START_POINT_ICONS[option.id];
                const active = effectiveStartPoint === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    data-studio-start-point={option.id}
                    onClick={() => onStartPoint(option.id)}
                    className={cn(
                      "flex min-h-24 min-w-0 flex-col items-start gap-2 rounded-2xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:flex-row sm:gap-3",
                      active ? "border-accent bg-accent-soft/45" : "border-line bg-panel/45 hover:bg-raised",
                    )}
                  >
                    <span className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl",
                      active ? "bg-accent text-on-accent" : "bg-card text-fg-2",
                    )}>
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 break-words">
                      <strong className="block text-sm text-fg">{bt(option.titleKo, option.titleEn)}</strong>
                      <span className="mt-1 block text-xs leading-5 text-fg-2">
                        {bt(option.descriptionKo, option.descriptionEn)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </FormStepSection>
  );
}
