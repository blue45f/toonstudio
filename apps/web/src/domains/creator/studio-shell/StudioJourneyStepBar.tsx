import { ArrowRight, Brush, Check, Download, Sparkles, type LucideIcon } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type StudioJourneyStepId = "start" | "edit" | "export";

interface StepConfig {
  readonly id: StudioJourneyStepId;
  readonly index: number;
  readonly icon: LucideIcon;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
}

const JOURNEY_STEPS: readonly StepConfig[] = [
  {
    id: "start",
    index: 1,
    icon: Sparkles,
    labelKo: "시작·기획",
    labelEn: "Start & Plan",
    hintKo: "장르·형식 선택과 줄거리 초안",
    hintEn: "Pick genre, format & story outline",
  },
  {
    id: "edit",
    index: 2,
    icon: Brush,
    labelKo: "원고 편집",
    labelEn: "Edit Manuscript",
    hintKo: "드로잉 · 말풍선 · 컷 연출",
    hintEn: "Draw · speech balloons · panels",
  },
  {
    id: "export",
    index: 3,
    icon: Download,
    labelKo: "저장·내보내기",
    labelEn: "Save & Export",
    hintKo: "플랫폼 규격 자동 맞춤 · 파일 저장",
    hintEn: "Auto-match platform specs & export",
  },
] as const;

const STEP_ORDER: Readonly<Record<StudioJourneyStepId, number>> = {
  start: 1,
  edit: 2,
  export: 3,
};

export interface StudioJourneyStepBarProps {
  readonly currentStep: StudioJourneyStepId;
  readonly startHref?: string;
  readonly editHref?: string;
  readonly exportHref?: string;
  readonly className?: string;
}

/**
 * 초보 창작자가 현재 어느 단계에 있고 다음 단계가 무엇인지 한눈에 파악하도록 돕는
 * 반응형 3단계 진행 표시줄(데스크톱 가로 카드 · 모바일 44px 터치 대응).
 */
export function StudioJourneyStepBar({
  currentStep,
  startHref,
  editHref,
  exportHref,
  className,
}: StudioJourneyStepBarProps) {
  const bt = useBilingual("StudioJourneyStepBar");
  const activeOrder = STEP_ORDER[currentStep];
  const progressPercent = Math.round((activeOrder / JOURNEY_STEPS.length) * 100);
  const hrefByStep: Readonly<Record<StudioJourneyStepId, string | undefined>> = {
    start: startHref,
    edit: editHref,
    export: exportHref,
  };

  return (
    <nav
      aria-label={bt("창작 3단계 진행 흐름", "3-step creation flow")}
      data-testid="studio-journey-step-bar"
      data-current-step={currentStep}
      className={cn(
        "overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent-soft to-panel p-3 shadow-sm",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-extrabold tracking-wider text-accent">
          <Sparkles size={12} aria-hidden="true" />
          {bt("초보자 3단계 완성 가이드", "3-Step Guided Flow")}
        </span>
        <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.65rem] font-bold text-fg-2">
          {bt(`${activeOrder} / 3 단계 진행 중`, `Step ${activeOrder} of 3`)}
        </span>
      </div>

      <div
        aria-hidden="true"
        className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-card"
      >
        <div
          style={{ width: `${progressPercent}%` }}
          className="h-full rounded-full bg-accent transition-all duration-300 motion-reduce:transition-none"
        />
      </div>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {JOURNEY_STEPS.map((step) => {
          const isCurrent = step.id === currentStep;
          const isCompleted = step.index < activeOrder;
          const href = hrefByStep[step.id];
          const isLinked = Boolean(href && !isCurrent);
          const Icon = step.icon;
          const stepTitle = `${step.index}. ${bt(step.labelKo, step.labelEn)}`;
          const stepHint = bt(step.hintKo, step.hintEn);
          const itemClassName = cn(
            "group flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all motion-reduce:transition-none motion-reduce:transform-none",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            isCurrent
              ? "border-accent bg-card text-fg shadow-sm"
              : isCompleted
                ? "border-success/35 bg-card/70 text-fg-2 hover:-translate-y-0.5 hover:border-accent/50 hover:text-fg"
                : "border-line/80 bg-panel/60 text-fg-2 hover:-translate-y-0.5 hover:border-accent/50 hover:text-fg",
          );

          const badge = (
            <span
              aria-hidden="true"
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-xl text-xs font-black",
                isCurrent
                  ? "bg-accent text-on-accent"
                  : isCompleted
                    ? "bg-success/15 text-success"
                    : "bg-card text-fg-3",
              )}
            >
              {isCompleted ? <Check size={15} /> : <Icon size={15} />}
            </span>
          );

          const body = (
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <strong className="break-words text-xs font-extrabold text-fg sm:text-sm">
                  {stepTitle}
                </strong>
                {isCurrent ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                    {bt("현재 단계", "Current")}
                  </span>
                ) : isCompleted ? (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                    {bt("완료", "Done")}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-[0.68rem] text-fg-3">
                {stepHint}
              </span>
            </span>
          );

          const trailing = isLinked ? (
            <ArrowRight
              size={14}
              aria-hidden="true"
              className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transform-none"
            />
          ) : null;

          return (
            <li key={step.id} className="min-w-0">
              {href && !isCurrent ? (
                <Link
                  href={href}
                  data-journey-step={step.id}
                  className={itemClassName}
                >
                  {badge}
                  {body}
                  {trailing}
                </Link>
              ) : (
                <div
                  aria-current={isCurrent ? "step" : undefined}
                  data-journey-step={step.id}
                  className={itemClassName}
                >
                  {badge}
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
