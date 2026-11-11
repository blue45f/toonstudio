import { ArrowRight, Box, Brush, CheckCircle2, FileText, GitBranch, Kanban, Palette, ShieldCheck } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const KANBAN_STAGE_STEPS = [
  {
    id: "storyboard",
    icon: FileText,
    ko: "1. 콘티",
    en: "1. Storyboard",
    roleKo: "컷 분할·대사 흐름",
    roleEn: "Cuts & pacing",
    hrefSuffix: "/studio/episode",
  },
  {
    id: "bg3d",
    icon: Box,
    ko: "2. 3D세트",
    en: "2. 3D Set",
    roleKo: "카메라·은선 추출",
    roleEn: "Camera & line extract",
    hrefSuffix: "/studio/bg3d",
  },
  {
    id: "lineart",
    icon: Brush,
    ko: "3. 선화",
    en: "3. Lineart",
    roleKo: "벡터·필압 펜선",
    roleEn: "Vector & ink strokes",
    hrefSuffix: "/studio/canvas",
  },
  {
    id: "coloring",
    icon: Palette,
    ko: "4. 채색",
    en: "4. Coloring",
    roleKo: "지정색·조명 LUT",
    roleEn: "Flats & lighting LUT",
    hrefSuffix: "/studio/characters",
  },
  {
    id: "lettering",
    icon: CheckCircle2,
    ko: "5. 식자·승인",
    en: "5. Typeset & Sign-off",
    roleKo: "규격 검수·출고 승인",
    roleEn: "Preflight & sign-off",
    hrefSuffix: "/studio/export",
  },
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
      className="mt-4 space-y-3 rounded-2xl border border-line bg-panel/60 p-3.5 sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-black text-accent">
              <Kanban size={12} aria-hidden="true" />
              {bt("통합 공정 칸반", "Unified Stage Kanban")}
            </span>
            <span className="text-xs font-semibold text-fg-2">
              {bt(
                "회차별 5열 공정 상태와 권리 BOM·인계 기록을 한 화면에서 이어갑니다.",
                "Track the 5-stage episode pipeline, handoffs, and Rights BOM in one view.",
              )}
            </span>
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

      <ol
        aria-label={bt("5열 제작 공정", "5 production stages")}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0"
      >
        {KANBAN_STAGE_STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              data-kanban-stage={step.id}
              data-testid={`studio-kanban-stage-card-${step.id}`}
              className="min-w-[164px] shrink-0 snap-start sm:min-w-0"
            >
              <Link
                href={step.hrefSuffix}
                className="flex min-h-11 h-full flex-col justify-between gap-1.5 rounded-xl border border-line bg-card p-2.5 text-left transition-colors hover:border-accent/55 hover:bg-raised/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Icon size={13} aria-hidden="true" className="shrink-0 text-accent" />
                  <span>{bt(step.ko, step.en)}</span>
                </span>
                <span className="text-[11px] leading-4 text-fg-2">
                  {bt(step.roleKo, step.roleEn)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
