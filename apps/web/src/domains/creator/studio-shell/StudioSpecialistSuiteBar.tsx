import { ChevronDown, Cpu, FileSpreadsheet } from "lucide-react";

import { useId, useState } from "react";

import { StudioToolArtwork, type StudioArtworkTool } from "../studio-tool-art/StudioToolArtwork";
import type { LucideIcon } from "lucide-react";

import { studioRoutePath } from "@/domains/creator/studio-route-registry";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

type SuiteItem = { id: string; href: string; ko: string; en: string } & (
  { art: StudioArtworkTool } | { icon: LucideIcon }
);

const SUITE_ITEMS: readonly SuiteItem[] = [
  { id: "dcc-modeler", href: "/studio/3d/dcc/model", art: "model", ko: "정밀 3D 모델러", en: "Precision 3D Modeler" },
  { id: "bg3d-stage", href: "/studio/bg3d", art: "environment", ko: "3D 배경 편집기", en: "3D Background Stage" },
  { id: "character-shaper", href: studioRoutePath("asset-character-new"), art: "performer", ko: "3D 캐릭터 셰이퍼", en: "3D Character Shaper" },
  { id: "poser-studio", href: studioRoutePath("poser"), art: "mannequin", ko: "3D 포즈 스튜디오", en: "3D Pose Studio" },
  { id: "virtual-space", href: studioRoutePath("personal-space"), art: "space", ko: "가상 스튜디오", en: "Virtual studio" },
  { id: "lift-3d", href: "/studio/lift3d", art: "layers", ko: "2D → 3D 리프트", en: "2D → 3D Lift" },
  { id: "brush-lab", href: studioRoutePath("asset-brush-new"), art: "drawingDesk", ko: "브러시 스튜디오 V6", en: "Brush Studio V6" },
  { id: "audio-bgm", href: studioRoutePath("asset-audio"), art: "sound", ko: "장면 BGM · 오디오", en: "Scene BGM & Audio" },
  { id: "motion-webtoon", href: studioRoutePath("motion-webtoon"), art: "animation", ko: "모션 웹툰 타임라인", en: "Motion Webtoon" },
  { id: "luna-ai", href: studioRoutePath("ai-lab"), icon: Cpu, ko: "Luna AI · 엔진 큐", en: "Luna AI & Engine Queue" },
  { id: "pdf-workbench", href: studioRoutePath("pdf-workbench"), icon: FileSpreadsheet, ko: "PDF 원고 워크벤치", en: "PDF Manuscript Workbench" },
];

export function StudioSpecialistSuiteBar({
  projectId,
}: {
  readonly projectId?: string | null;
}) {
  const bt = useBilingual("StudioSpecialistSuiteBar");

  const listId = useId();
  const [expanded, setExpanded] = useState(false);

  function toolHref(item: SuiteItem): string {
    if (!projectId) return item.href;
    const encoded = encodeURIComponent(projectId);
    if (item.id === "virtual-space") {
      return projectId === "." || projectId === ".." ? item.href : studioRoutePath("project-space").replace(":projectId", encoded);
    }
    return `${item.href}?project=${encoded}`;
  }

  return (
    <nav
      aria-label={bt("전문 크리에이터 보조 도구 스위트", "Specialist creator tool suite")}
      data-testid="studio-specialist-suite-bar"
      className="min-w-0 border-b border-line bg-panel"
    >
      <div className="mx-auto max-w-[90rem]">
        <button type="button" aria-expanded={expanded} aria-controls={listId}
          onClick={() => setExpanded(value => !value)}
          className="flex min-h-11 w-full items-center justify-between px-4 text-start text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:hidden">
          {bt("전문 도구 전체", "All specialist tools")}
          <ChevronDown size={18} aria-hidden className={expanded ? "rotate-180" : ""} />
        </button>
        <div id={listId} className={`gap-1 px-3 pb-2 sm:flex sm:items-center sm:overflow-x-auto sm:px-5 sm:pt-2 [scrollbar-width:thin] ${expanded ? "grid grid-cols-2" : "flex items-center overflow-x-auto overscroll-x-contain"}`}>
          <span className="hidden shrink-0 border-r border-line pr-3 sm:inline text-xs font-semibold text-fg-2">
            {bt("보조 도구", "Specialist tools")}
          </span>
          {SUITE_ITEMS.map((item) => {
            const icon = "art" in item
              ? <StudioToolArtwork tool={item.art} />
              : <item.icon size={21} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-2" />;
            return (
              <Link
                key={item.id}
                href={toolHref(item)}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
                className="inline-flex min-h-11 min-w-0 shrink-0 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              >
                {icon}
                {bt(item.ko, item.en)}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
