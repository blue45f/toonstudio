import { ArrowRight, GitBranch, Kanban, ShieldCheck } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const KANBAN_STAGE_STEPS = [
  { id: "storyboard", ko: "1. 콘티", en: "1. Storyboard" },
  { id: "bg3d", ko: "2. 3D세트", en: "2. 3D Set" },
  { id: "lineart", ko: "3. 선화", en: "3. Lineart" },
  { id: "coloring", ko: "4. 채색", en: "4. Coloring" },
  { id: "lettering", ko: "5. 식자·승인", en: "5. Typeset & Sign-off" },
] as const;

export function StudioProjectTeamKanbanBridge({
  projectId,
}: {
  readonly projectId: string;
}) {
  const bt = useBilingual("StudioProjectTeamKanbanBridge");
  const encodedId = encodeURIComponent(projectId);

  return (
    <section
      aria-label={bt("팀 프로덕션 5열 공정 칸반 브리지", "Team production 5-stage Kanban bridge")}
      data-testid="studio-project-team-kanban-bridge"
      className="mt-4 rounded-2xl border border-line bg-panel/55 p-3.5 sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-black text-accent">
              <Kanban size={12} aria-hidden="true" />
              {bt("통합 공정 칸반", "Unified Stage Kanban")}
            </span>
            <ul className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-fg-2" aria-label={bt("5열 제작 공정", "5 production stages")}>
              {KANBAN_STAGE_STEPS.map((step, index) => (
                <li key={step.id} className="inline-flex items-center gap-1">
                  <span className="rounded-md border border-line bg-card px-2 py-0.5">{bt(step.ko, step.en)}</span>
                  {index < KANBAN_STAGE_STEPS.length - 1 ? <span aria-hidden="true" className="text-fg-3">→</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/production/projects/${encodedId}/production`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 text-xs font-bold text-accent transition-colors hover:border-accent"
          >
            <Kanban size={14} aria-hidden="true" />
            {bt("회차 공정 칸반 열기", "Open Episode Kanban")}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
          <Link
            href={`/production/projects/${encodedId}/handoff`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <GitBranch size={14} aria-hidden="true" />
            {bt("공정 인계 (Handoff)", "Stage Handoff")}
          </Link>
          <Link
            href={`/production/projects/${encodedId}/rights`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
          >
            <ShieldCheck size={14} aria-hidden="true" />
            {bt("권리 BOM 원장", "Rights BOM Ledger")}
          </Link>
        </div>
      </div>
    </section>
  );
}
