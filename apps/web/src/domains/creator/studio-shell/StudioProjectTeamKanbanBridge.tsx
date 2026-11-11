import { ArrowRight, Box, Brush, CheckCircle2, FileText, GitBranch, Kanban, Palette, ShieldCheck } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const KANBAN_STAGE_STEPS = [
  {
    id: "storyboard",
    stepCode: "STAGE 01",
    accentBarClass: "bg-accent",
    icon: FileText,
    ko: "1. 콘티",
    en: "1. Storyboard",
    roleKo: "컷 분할·대사 흐름",
    roleEn: "Cuts & pacing",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/story`,
  },
  {
    id: "bg3d",
    stepCode: "STAGE 02",
    accentBarClass: "bg-cool",
    icon: Box,
    ko: "2. 3D세트",
    en: "2. 3D Set",
    roleKo: "카메라·은선 추출",
    roleEn: "Camera & line extract",
    resolveHref: (encodedId: string) => `/studio/bg3d?project=${encodedId}`,
  },
  {
    id: "lineart",
    stepCode: "STAGE 03",
    accentBarClass: "bg-accent-2",
    icon: Brush,
    ko: "3. 선화",
    en: "3. Lineart",
    roleKo: "벡터·필압 펜선",
    roleEn: "Vector & ink strokes",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/production`,
  },
  {
    id: "coloring",
    stepCode: "STAGE 04",
    accentBarClass: "bg-warn",
    icon: Palette,
    ko: "4. 채색",
    en: "4. Coloring",
    roleKo: "지정색·조명 LUT",
    roleEn: "Flats & lighting LUT",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/assets`,
  },
  {
    id: "lettering",
    stepCode: "STAGE 05",
    accentBarClass: "bg-good",
    icon: CheckCircle2,
    ko: "5. 식자·승인",
    en: "5. Typeset & Sign-off",
    roleKo: "규격 검수·출고 승인",
    roleEn: "Preflight & sign-off",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/export`,
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
      className="relative mt-4 overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel/90 to-card shadow-sm"
    >
      <div aria-hidden="true" className="h-0.5 w-full bg-gradient-to-r from-accent via-cool to-accent-2" />
      <div className="space-y-3.5 p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 font-display text-[11px] font-black tracking-wide text-accent">
                <Kanban size={12} aria-hidden="true" />
                {bt("통합 공정 칸반", "Unified Stage Kanban")}
              </span>
              <span className="text-xs font-semibold text-fg-2">
                {bt(
                  "회차별 5열 공정 상태와 권리 BOM·인계 기록을 프로젝트 문맥 유지 채 이어갑니다.",
                  "Track the 5-stage episode pipeline, handoffs, and Rights BOM while keeping project context.",
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/production/projects/${encodedId}/production`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/45 bg-accent px-3.5 text-xs font-bold text-on-accent shadow-xs transition-colors hover:bg-accent/90"
            >
              <Kanban size={14} aria-hidden="true" />
              {bt("회차 공정 칸반 열기", "Open Episode Kanban")}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <Link
              href={`/production/projects/${encodedId}/handoff`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-fg"
            >
              <GitBranch size={14} aria-hidden="true" />
              {bt("공정 인계 (Handoff)", "Stage Handoff")}
            </Link>
            <Link
              href={`/production/projects/${encodedId}/rights`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-fg"
            >
              <ShieldCheck size={14} aria-hidden="true" />
              {bt("권리 BOM 원장", "Rights BOM Ledger")}
            </Link>
          </div>
        </div>

        <ol
          aria-label={bt("5열 제작 공정", "5 production stages")}
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0"
        >
          {KANBAN_STAGE_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li
                key={step.id}
                data-kanban-stage={step.id}
                data-testid={`studio-kanban-stage-card-${step.id}`}
                className="min-w-[168px] shrink-0 snap-start sm:min-w-0"
              >
                <Link
                  href={step.resolveHref(encodedId)}
                  className="group relative flex h-full min-h-11 flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-line-strong/70 bg-card/90 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:bg-raised/75 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none"
                >
                  <span
                    aria-hidden="true"
                    data-kanban-stage-accent="true"
                    className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 ${step.accentBarClass}`}
                  />
                  <span className="flex items-center justify-between gap-1.5">
                    <span className="font-mono text-[10px] font-bold tracking-wider text-fg-3">
                      {step.stepCode}
                    </span>
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent transition-colors group-hover:bg-accent group-hover:text-on-accent">
                      <Icon size={13} aria-hidden="true" />
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs font-extrabold text-fg group-hover:text-accent">
                      {bt(step.ko, step.en)}
                    </span>
                    <span className="text-[11px] leading-4 text-fg-2">
                      {bt(step.roleKo, step.roleEn)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
