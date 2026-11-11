import { Brush, Cpu, FileSpreadsheet, Film, Music } from "lucide-react";

import { studioRoutePath } from "@/domains/creator/studio-route-registry";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const SUITE_ITEMS = [
  { id: "brush-lab", href: studioRoutePath("asset-brush-new"), icon: Brush, ko: "브러시 스튜디오 V6", en: "Brush Studio V6" },
  { id: "audio-bgm", href: studioRoutePath("asset-audio"), icon: Music, ko: "장면 BGM · 오디오", en: "Scene BGM & Audio" },
  { id: "motion-webtoon", href: studioRoutePath("motion-webtoon"), icon: Film, ko: "모션 웹툰 타임라인", en: "Motion Webtoon" },
  { id: "luna-ai", href: studioRoutePath("ai-lab"), icon: Cpu, ko: "Luna AI · 엔진 큐", en: "Luna AI & Engine Queue" },
  { id: "pdf-workbench", href: studioRoutePath("pdf-workbench"), icon: FileSpreadsheet, ko: "PDF 원고 워크벤치", en: "PDF Manuscript Workbench" },
] as const;

export function StudioSpecialistSuiteBar({
  projectId,
}: {
  readonly projectId?: string | null;
}) {
  const bt = useBilingual("StudioSpecialistSuiteBar");

  const withProject = (baseHref: string): string =>
    projectId ? `${baseHref}?project=${encodeURIComponent(projectId)}` : baseHref;

  return (
    <nav
      aria-label={bt("전문 크리에이터 보조 도구 스위트", "Specialist creator tool suite")}
      data-testid="studio-specialist-suite-bar"
      className="border-b border-line bg-canvas/80"
    >
      <div className="mx-auto flex max-w-[90rem] items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 [scrollbar-width:none]">
        <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wider text-accent">
          {bt("보조 도구 스위트", "SPECIALIST SUITE")}
        </span>
        {SUITE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={withProject(item.href)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-fg"
            >
              <Icon size={14} aria-hidden="true" className="text-accent" />
              {bt(item.ko, item.en)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
