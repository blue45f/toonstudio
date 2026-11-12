import { ArrowUpRight, Box, FileUp, LayoutPanelTop, ScrollText } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryFastStartStrip", ko, en);

const FAST_START_ITEMS = [
  {
    id: "webtoon-vertical",
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    icon: ScrollText,
    labelKo: "세로 웹툰 시작",
    labelEn: "Start a webtoon",
    hintKo: "위아래로 읽는 웹툰",
    hintEn: "A story readers scroll through",
    primary: true,
  },
  {
    id: "four-cut-classic",
    href: "/studio/new?kind=four-cut&template=four-cut-classic",
    icon: LayoutPanelTop,
    labelKo: "4컷 만화 시작",
    labelEn: "Start a 4-panel comic",
    hintKo: "네 칸으로 만드는 이야기",
    hintEn: "Tell a story in four panels",
    primary: false,
  },
  {
    id: "bg3d-stage",
    href: "/studio/bg3d",
    icon: Box,
    labelKo: "3D 장면 만들기",
    labelEn: "Build a 3D scene",
    hintKo: "배경과 캐릭터 배치",
    hintEn: "Arrange backgrounds and characters",
    primary: false,
  },
  {
    id: "psd-clip-import",
    href: "/studio/import",
    icon: FileUp,
    labelKo: "원고 파일 불러오기",
    labelEn: "Import a manuscript",
    hintKo: "PSD·CLIP 파일 가져오기",
    hintEn: "Bring in a PSD or CLIP file",
    primary: false,
  },
] as const;

export function StudioProjectLibraryFastStartStrip({
  className,
}: {
  readonly className?: string;
} = {}) {
  useBilingualI18nRevision();

  return (
    <nav
      aria-label={bi("작업 시작 방식", "Ways to start creating")}
      data-studio-fast-start-strip="true"
      className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2", className)}
    >
      {FAST_START_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            data-studio-fast-start-item={item.id}
            className={cn(
              "group flex min-h-11 items-center gap-3 rounded-xl border p-3.5 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
              item.primary
                ? "border-accent/45 bg-accent-soft hover:border-accent"
                : "border-line bg-card hover:border-line-strong hover:bg-raised",
            )}
          >
            <Icon size={20} className={cn("shrink-0", item.primary ? "text-accent" : "text-fg-2")} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block break-keep text-sm font-semibold text-fg">
                {bi(item.labelKo, item.labelEn)}
              </span>
              <span className="mt-1 block break-keep text-xs leading-5 text-fg-2">
                {bi(item.hintKo, item.hintEn)}
              </span>
            </span>
            <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-fg-3" />
          </Link>
        );
      })}
    </nav>
  );
}
