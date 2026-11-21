import { ArrowRight, ChevronDown, Layers, ShieldCheck } from "lucide-react";
import { Suspense, useState } from "react";
import { Link } from "react-router-dom";

import { productionSurfacePath } from "./production-project-surfaces";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const LazyStudioSyncTimeMachinePanel = lazyRetry(
  () =>
    import("../sync-timemachine-os/StudioSyncTimeMachinePanel").then((module) => ({
      default: module.StudioSyncTimeMachinePanel,
    })),
  "StudioSyncTimeMachinePanel",
);

/** 제작 안내는 현재 업무 뒤에서 선택해서 열고, 실제 프로젝트 화면으로 이어진다. */
export function ProductionPlanningGuide({ projectId }: { readonly projectId: string }) {
  const bt = useBilingual("ProductionPlanningGuide");
  const [syncDisclosureOpen, setSyncDisclosureOpen] = useState(false);
  const steps = [
    {
      surface: "schedule",
      ko: "일정과 마감 확인",
      en: "Check schedules and deadlines",
      descriptionKo: "회차별 작업량과 연재 주기를 고려해 담당·마감·작업량을 확인하세요.",
      descriptionEn: "Review owners, deadlines and workload against each episode and release cadence.",
    },
    {
      surface: "control",
      ko: "운영과 작업 분배 확인",
      en: "Review operations and work allocation",
      descriptionKo: "막힌 작업, 근무 일정과 컷 분배를 확인하고 필요한 조정을 검토하세요.",
      descriptionEn: "Review blocked work, availability and cut allocation before making adjustments.",
    },
    {
      surface: "review",
      ko: "검수와 승인 확인",
      en: "Check reviews and approvals",
      descriptionKo: "수정 요청과 승인 상태를 확인한 뒤 다음 공정으로 넘겨 주세요.",
      descriptionEn: "Check revision requests and approval status before the next handoff.",
    },
  ] as const;

  return (
    <div className="space-y-3">
      <details className="group/production-guide mt-6 rounded-2xl border border-line bg-panel" aria-label={bt("제작 계획·검수 안내", "Production planning and review guide")}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          {bt("제작 계획·검수 안내", "Production planning and review guide")}
          <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform group-open/production-guide:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <p className="text-sm leading-6 text-fg-2">{bt("현재 프로젝트의 일정·운영·검수를 각 화면에서 확인하세요.", "Open the relevant screen to review this project's schedule, operations and approvals.")}</p>
          <ul className="grid gap-3 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.surface} className="rounded-xl border border-line bg-card p-3">
                <Link to={productionSurfacePath(projectId, step.surface)} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                  {bt(step.ko, step.en)}<ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
                <p className="mt-1 text-xs leading-5 text-fg-2">{bt(step.descriptionKo, step.descriptionEn)}</p>
              </li>
            ))}
          </ul>
          <Link data-testid="production-studio-workspace-link" to={`/studio/p/${encodeURIComponent(projectId)}/overview`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-bold text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
            <Layers className="size-4" aria-hidden="true" />{bt("Studio 작업실 열기", "Open Studio workspace")}
          </Link>
        </div>
      </details>

      <details
        data-testid="studio-sync-timemachine-disclosure"
        className="group/sync-timemachine rounded-2xl border border-line bg-panel"
        aria-label={bt("글로벌 차분 동기화 · 타임머신 복구 · 아트 바이블 화풍 락", "Global delta sync, time-machine recovery and Art Bible style-lock")}
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          setSyncDisclosureOpen(event.currentTarget.open);
        }}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
            {bt("글로벌 차분 동기화 · 타임머신 복구 · 아트 바이블 화풍 락", "Global delta sync · Time-machine recovery · Art Bible style-lock")}
          </span>
          <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform group-open/sync-timemachine:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        {syncDisclosureOpen ? (
          <div className="border-t border-line p-4">
            <Suspense
              fallback={
                <p className="text-xs text-fg-2">
                  {bt("동기화·타임머신·화풍 락 작업대를 불러오는 중...", "Loading sync, time-machine and style-lock console...")}
                </p>
              }
            >
              <LazyStudioSyncTimeMachinePanel projectId={projectId} />
            </Suspense>
          </div>
        ) : null}
      </details>
    </div>
  );
}
