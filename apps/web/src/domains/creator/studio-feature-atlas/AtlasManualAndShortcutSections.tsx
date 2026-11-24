/**
 * 역할별 10분 인터랙티브 실습 매뉴얼 섹션 · 단축키 치트시트 및 맥락별 빠른 문제 해결 FAQ 섹션.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 리터럴 0건).
 * - React Router 비의존 `<a href>` 링크 + 선택적 `onNavigate` 핸들러로 단독 렌더링을 보장한다.
 */

import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  Keyboard,
  RotateCcw,
} from "lucide-react";
import { useId, useState, type MouseEvent, type ReactElement } from "react";

import {
  CREATOR_ROLE_MANUALS,
  computeRoleManualProgress,
  getRoleManualById,
  getTroubleshootingFaqsForContext,
  type CreatorRoleId,
} from "./interactive-manual-engine";
import {
  STUDIO_SHORTCUT_CHEATSHEET,
  type AtlasRoutePath,
  type ShortcutCategoryId,
} from "./studio-feature-catalog";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;
const LINK_BTN = `inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised [word-break:keep-all] ${FOCUS_RING}`;

const SHORTCUT_CATEGORIES: readonly { readonly id: ShortcutCategoryId | "all"; readonly labelKo: string }[] = [
  { id: "all", labelKo: "전체 단축키" },
  { id: "draw", labelKo: "드로잉·채색" },
  { id: "select", labelKo: "선택·변형" },
  { id: "view-cut", labelKo: "화면·연출" },
  { id: "collab-flow", labelKo: "말풍선·협업" },
];

export interface AtlasRouteLinkProps {
  readonly href: AtlasRoutePath;
  readonly labelKo: string;
  readonly className?: string;
  readonly testId?: string;
  readonly onNavigate?: (route: AtlasRoutePath) => void;
}

export function AtlasRouteLink({
  href,
  labelKo,
  className = LINK_BTN,
  testId,
  onNavigate,
}: AtlasRouteLinkProps): ReactElement {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (onNavigate) {
      event.preventDefault();
      onNavigate(href);
    }
  };
  return (
    <a href={href} onClick={handleClick} className={className} data-testid={testId}>
      <span>{labelKo}</span>
      <ArrowUpRight size={14} aria-hidden />
    </a>
  );
}

export interface AtlasRoleManualSectionProps {
  readonly selectedRoleId: CreatorRoleId;
  readonly completedByRole: Readonly<Record<CreatorRoleId, readonly string[]>>;
  readonly onSelectRole: (roleId: CreatorRoleId) => void;
  readonly onToggleStep: (roleId: CreatorRoleId, stepId: string) => void;
  readonly onResetRole: (roleId: CreatorRoleId) => void;
  readonly onNavigate?: (route: AtlasRoutePath) => void;
}

export function AtlasRoleManualSection({
  selectedRoleId,
  completedByRole,
  onSelectRole,
  onToggleStep,
  onResetRole,
  onNavigate,
}: AtlasRoleManualSectionProps): ReactElement {
  const uid = useId();
  const activeManual = getRoleManualById(selectedRoleId) ?? CREATOR_ROLE_MANUALS[0]!;
  const activeCompletedIds = completedByRole[activeManual.roleId] ?? [];
  const progress = computeRoleManualProgress(activeManual.roleId, activeCompletedIds);
  const roleFaqs = getTroubleshootingFaqsForContext({ roleId: activeManual.roleId });

  return (
    <div className="space-y-5" data-testid="atlas-manual-section">
      {/* 4대 역할 선택 바 */}
      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        role="group"
        aria-label="창작자 역할 선택"
      >
        {CREATOR_ROLE_MANUALS.map((manual) => {
          const isSelected = manual.roleId === activeManual.roleId;
          const roleProgress = computeRoleManualProgress(
            manual.roleId,
            completedByRole[manual.roleId] ?? [],
          );
          return (
            <button
              key={manual.roleId}
              type="button"
              aria-pressed={isSelected}
              data-testid={`atlas-role-btn-${manual.roleId}`}
              onClick={() => onSelectRole(manual.roleId)}
              className={`flex min-h-11 cursor-pointer flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                isSelected
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
              }`}
            >
              <span className="text-xs font-bold text-fg">{manual.shortLabelKo}</span>
              <span className="flex w-full items-center justify-between text-[0.72rem] text-fg-2 tabular-nums">
                <span>{manual.totalMinutes}분 코스</span>
                <span className={roleProgress.isAllDone ? "font-semibold text-good" : "font-medium"}>
                  {roleProgress.completedCount}/{roleProgress.totalCount} 완료
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 역할 요약 + 실시간 진행률 */}
      <div className="grid gap-4 rounded-xl border border-line bg-card p-4 lg:grid-cols-[220px_1fr]">
        <div className="overflow-hidden rounded-lg border border-line bg-raised">
          <img
            src={activeManual.previewImageSrc}
            alt={activeManual.previewImageAltKo}
            loading="lazy"
            decoding="async"
            className="aspect-video h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-fg [word-break:keep-all]">
                {activeManual.roleLabelKo}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-1 text-xs font-semibold text-fg-2 tabular-nums">
                <Clock size={13} aria-hidden />
                <span data-testid="atlas-manual-remaining-min">
                  남은 시간 {progress.remainingMinutes}분
                </span>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
              {activeManual.goalKo}
            </p>
            <p className="text-xs text-fg-3 [word-break:keep-all]">
              추천 대상: {activeManual.audienceKo}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg tabular-nums" data-testid="atlas-manual-progress-text">
                진행률 {progress.completionPct}% ({progress.completedCount}/{progress.totalCount}단계)
              </span>
              <div className="flex items-center gap-2">
                <AtlasRouteLink
                  href={activeManual.targetRoute}
                  labelKo="실습 화면 바로 열기"
                  onNavigate={onNavigate}
                />
                <button
                  type="button"
                  data-testid="atlas-manual-reset-btn"
                  disabled={progress.completedCount === 0}
                  onClick={() => onResetRole(activeManual.roleId)}
                  className={`${CHIP_BASE} border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <RotateCcw size={14} aria-hidden />
                  <span>진행 초기화</span>
                </button>
              </div>
            </div>
            <div
              role="progressbar"
              aria-label={`${activeManual.shortLabelKo} 실습 진행률`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.completionPct}
              data-testid="atlas-manual-progressbar"
              className="h-2.5 w-full overflow-hidden rounded-full bg-raised"
            >
              <div
                className={`h-full transition-all motion-reduce:transition-none ${
                  progress.isAllDone ? "bg-good" : "bg-accent"
                }`}
                style={{ width: `${progress.completionPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 단계별 인터랙티브 체크리스트 */}
      <ol className="space-y-2.5" aria-label="10분 실습 단계 체크리스트">
        {activeManual.steps.map((step) => {
          const checked = progress.completedStepIds.includes(step.id);
          const checkboxId = `${uid}-step-${step.id}`;
          return (
            <li
              key={step.id}
              className={`rounded-xl border p-3.5 transition-colors motion-reduce:transition-none ${
                checked ? "border-good/40 bg-good/15" : "border-line bg-card"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-h-11 flex-1 items-start gap-3">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={checked}
                    data-testid={`atlas-step-checkbox-${step.id}`}
                    onChange={() => onToggleStep(activeManual.roleId, step.id)}
                    className="mt-1 size-5 shrink-0 cursor-pointer accent-accent"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[0.7rem] font-bold text-fg-2 tabular-nums">
                        {step.order}단계 · {step.durationMinutes}분
                      </span>
                      <label
                        htmlFor={checkboxId}
                        className={`cursor-pointer text-sm font-bold [word-break:keep-all] ${
                          checked ? "text-fg line-through" : "text-fg"
                        }`}
                      >
                        {step.titleKo}
                      </label>
                      {step.shortcutHint ? (
                        <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.72rem] font-semibold text-fg-2">
                          {step.shortcutHint}
                        </kbd>
                      ) : null}
                      {checked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-good">
                          <CheckCircle2 size={14} aria-hidden />
                          완료
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                      {step.actionGuideKo}
                    </p>
                    <p className="text-xs text-fg-3 [word-break:keep-all]">
                      완료 결과: {step.expectedResultKo}
                    </p>
                  </div>
                </div>
                <AtlasRouteLink
                  href={step.route}
                  labelKo="바로 가기"
                  onNavigate={onNavigate}
                />
              </div>
            </li>
          );
        })}
      </ol>

      {/* 역할 맥락별 빠른 문제 해결 FAQ */}
      <section className="space-y-2.5 rounded-xl border border-line bg-panel p-4" aria-label="이 역할에서 자주 묻는 문제 해결">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <HelpCircle size={15} aria-hidden className="text-accent" />
          <span>{activeManual.shortLabelKo} 실습 중 자주 막히는 순간</span>
        </h4>
        <div className="grid gap-3 md:grid-cols-2">
          {roleFaqs.map((faq) => (
            <article key={faq.id} className="flex flex-col justify-between gap-2.5 rounded-lg border border-line bg-card p-3">
              <div className="space-y-1.5">
                <span className="inline-block rounded-full border border-line bg-raised px-2 py-0.5 text-[0.7rem] font-semibold text-fg-2">
                  {faq.symptomTagKo}
                </span>
                <h5 className="text-xs font-bold leading-snug text-fg [word-break:keep-all]">
                  {faq.questionKo}
                </h5>
                <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                  {faq.quickFixStepsKo.map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ol>
              </div>
              <div>
                <AtlasRouteLink
                  href={faq.actionRoute}
                  labelKo={faq.actionLabelKo}
                  onNavigate={onNavigate}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export interface AtlasShortcutsAndFaqSectionProps {
  readonly onNavigate?: (route: AtlasRoutePath) => void;
}

export function AtlasShortcutsAndFaqSection({
  onNavigate,
}: AtlasShortcutsAndFaqSectionProps): ReactElement {
  const [shortcutCategory, setShortcutCategory] = useState<ShortcutCategoryId | "all">("all");
  const visibleShortcuts =
    shortcutCategory === "all"
      ? STUDIO_SHORTCUT_CHEATSHEET
      : STUDIO_SHORTCUT_CHEATSHEET.filter((entry) => entry.categoryId === shortcutCategory);
  const allFaqs = getTroubleshootingFaqsForContext();

  return (
    <div className="space-y-6" data-testid="atlas-shortcuts-section">
      {/* 단축키 치트시트 */}
      <section className="space-y-3" aria-label="툰스튜디오 단축키 치트시트">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Keyboard size={16} aria-hidden className="text-accent" />
            <span>실전 단축키 치트시트</span>
          </h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="단축키 분류 필터">
            {SHORTCUT_CATEGORIES.map((category) => {
              const active = shortcutCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`atlas-shortcut-cat-${category.id}`}
                  onClick={() => setShortcutCategory(category.id)}
                  className={`${CHIP_BASE} ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                  }`}
                >
                  {category.labelKo}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {visibleShortcuts.map((shortcut) => (
            <div
              key={shortcut.id}
              data-testid={`atlas-shortcut-card-${shortcut.id}`}
              className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-card p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-bold text-fg [word-break:keep-all]">
                  {shortcut.actionKo}
                </span>
                <kbd className="shrink-0 rounded-md border border-line-strong bg-raised px-2 py-0.5 text-xs font-bold text-fg">
                  {shortcut.keys}
                </kbd>
              </div>
              <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                {shortcut.tipKo}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 전체 맥락별 빠른 문제 해결 FAQ */}
      <section className="space-y-3" aria-label="빠른 문제 해결 FAQ">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <HelpCircle size={16} aria-hidden className="text-accent" />
          <span>막혔을 때 바로 푸는 문제 해결 FAQ</span>
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {allFaqs.map((faq) => (
            <article
              key={faq.id}
              className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-4"
            >
              <div className="space-y-2">
                <span className="inline-block rounded-full border border-line bg-raised px-2.5 py-0.5 text-[0.72rem] font-semibold text-fg-2">
                  {faq.symptomTagKo}
                </span>
                <h4 className="text-sm font-bold text-fg [word-break:keep-all]">
                  {faq.questionKo}
                </h4>
                <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                  {faq.quickFixStepsKo.map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ol>
              </div>
              <div>
                <AtlasRouteLink
                  href={faq.actionRoute}
                  labelKo={faq.actionLabelKo}
                  onNavigate={onNavigate}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
