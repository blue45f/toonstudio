import { Box, Brush, Building2, Cpu, FileSpreadsheet, Film, Layers, Music, PersonStanding, UserRoundPlus } from "lucide-react";

import { studioRoutePath } from "@/domains/creator/studio-route-registry";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const SUITE_ITEMS = [
  { id: "dcc-modeler", href: "/studio/3d/dcc/model", icon: Box, ko: "정밀 3D 모델러", en: "Precision 3D Modeler" },
  { id: "bg3d-stage", href: "/studio/bg3d", icon: Building2, ko: "3D 배경 편집기", en: "3D Background Stage" },
  { id: "character-shaper", href: studioRoutePath("asset-character-new"), icon: UserRoundPlus, ko: "3D 캐릭터 셰이퍼", en: "3D Character Shaper" },
  { id: "poser-studio", href: studioRoutePath("poser"), icon: PersonStanding, ko: "3D 포즈 스튜디오", en: "3D Pose Studio" },
  { id: "lift-3d", href: "/studio/lift3d", icon: Layers, ko: "2D → 3D 리프트", en: "2D → 3D Lift" },
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
      className="relative overflow-hidden border-b border-line bg-panel/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[90rem] items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 [scrollbar-width:none]">
        <span className="inline-flex shrink-0 items-center rounded-md border border-line bg-card px-2.5 py-1 text-xs font-semibold text-fg-2">
          {bt("보조 도구", "Specialist tools")}
        </span>
        {SUITE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={withProject(item.href)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/85 px-3.5 text-xs font-semibold text-fg-2 shadow-2xs transition-colors hover:border-accent/60 hover:bg-accent-soft/40 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
