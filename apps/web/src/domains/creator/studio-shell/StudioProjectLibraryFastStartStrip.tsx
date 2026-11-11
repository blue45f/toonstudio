import { Box, FileUp, LayoutPanelTop, ScrollText } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryFastStartStrip", ko, en);

const FAST_START_ITEMS = [
  {
    id: "webtoon-vertical",
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    icon: ScrollText,
    labelKo: "세로 웹툰 바로 시작",
    labelEn: "Start vertical webtoon",
    hintKo: "800×무한 스크롤 캔버스",
    hintEn: "800×infinite scroll canvas",
  },
  {
    id: "four-cut-classic",
    href: "/studio/new?kind=four-cut&template=four-cut-classic",
    icon: LayoutPanelTop,
    labelKo: "4컷 만화 바로 시작",
    labelEn: "Start 4-panel strip",
    hintKo: "SNS·일상툰 정사각 규격",
    hintEn: "SNS & daily strip layout",
  },
  {
    id: "bg3d-stage",
    href: "/studio/bg3d",
    icon: Box,
    labelKo: "3D 배경·캐릭터 열기",
    labelEn: "Open 3D stage & character",
    hintKo: "공간 배치 후 선화 추출",
    hintEn: "Block stage & extract lineart",
  },
  {
    id: "psd-clip-import",
    href: "/studio/import",
    icon: FileUp,
    labelKo: "PSD·CLIP 원고 변환",
    labelEn: "Convert PSD & CLIP",
    hintKo: "레이어 보존 즉시 복원",
    hintEn: "Layer-preserving import",
  },
] as const;

export function StudioProjectLibraryFastStartStrip() {
  useBilingualI18nRevision();

  return (
    <nav
      aria-label={bi("1초 포맷 빠른 시작", "1-second format fast start")}
      data-studio-fast-start-strip="true"
      className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"
    >
      {FAST_START_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            data-studio-fast-start-item={item.id}
            className="group flex min-h-11 items-center gap-2.5 rounded-2xl border border-line bg-card/85 px-3 py-2 text-left transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black text-fg group-hover:text-accent">
                {bi(item.labelKo, item.labelEn)}
              </span>
              <span className="hidden truncate text-[0.65rem] text-fg-3 sm:block">
                {bi(item.hintKo, item.hintEn)}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
