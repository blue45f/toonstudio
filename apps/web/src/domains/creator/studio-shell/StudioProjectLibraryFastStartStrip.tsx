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
    index: "01",
    spec: "800×∞ PX",
    motif: "vertical",
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    icon: ScrollText,
    labelKo: "세로 웹툰 바로 시작",
    labelEn: "Start vertical webtoon",
    hintKo: "800×무한 스크롤 · 모바일 가독 안전선",
    hintEn: "800×infinite scroll · mobile safe-guide",
    primary: true,
  },
  {
    id: "four-cut-classic",
    index: "02",
    spec: "1:1 · 4-CUT",
    motif: "grid",
    href: "/studio/new?kind=four-cut&template=four-cut-classic",
    icon: LayoutPanelTop,
    labelKo: "4컷 만화 바로 시작",
    labelEn: "Start 4-panel strip",
    hintKo: "SNS·일상툰 정사각 2×2 규격 프리셋",
    hintEn: "SNS & daily strip 2×2 square preset",
    primary: false,
  },
  {
    id: "bg3d-stage",
    index: "03",
    spec: "WEBGPU 3D",
    motif: "stage3d",
    href: "/studio/bg3d",
    icon: Box,
    labelKo: "3D 배경·캐릭터 열기",
    labelEn: "Open 3D stage & character",
    hintKo: "공간 배치·포즈 후 2D 펜선 즉시 추출",
    hintEn: "Block stage & extract live 2D lineart",
    primary: false,
  },
  {
    id: "psd-clip-import",
    index: "04",
    spec: "PSD · CLIP",
    motif: "layers",
    href: "/studio/import",
    icon: FileUp,
    labelKo: "PSD·CLIP 원고 변환",
    labelEn: "Convert PSD & CLIP",
    hintKo: "레이어·말풍선 구조 무손실 즉시 복원",
    hintEn: "Lossless layer & balloon structure import",
    primary: false,
  },
] as const;

function FormatPreviewMotif({ motif }: { readonly motif: (typeof FAST_START_ITEMS)[number]["motif"] }) {
  if (motif === "vertical") {
    return (
      <span aria-hidden="true" className="grid h-9 w-7 shrink-0 grid-rows-3 gap-0.5 rounded-md border border-accent/45 bg-canvas/80 p-1">
        <span className="rounded-[2px] bg-accent/70" />
        <span className="rounded-[2px] bg-accent/45" />
        <span className="rounded-[2px] bg-cool/55" />
      </span>
    );
  }
  if (motif === "grid") {
    return (
      <span aria-hidden="true" className="grid size-8 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 rounded-md border border-line-strong bg-canvas/80 p-1">
        <span className="rounded-[2px] bg-fg/35" />
        <span className="rounded-[2px] bg-accent/55" />
        <span className="rounded-[2px] bg-cool/45" />
        <span className="rounded-[2px] bg-fg/35" />
      </span>
    );
  }
  if (motif === "stage3d") {
    return (
      <span aria-hidden="true" className="relative grid size-8 shrink-0 place-items-center rounded-md border border-cool/45 bg-canvas/80">
        <span className="size-4 rotate-12 rounded-[3px] border border-cool/80" />
        <span className="absolute size-2 rounded-[1px] bg-accent/80" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="relative grid size-8 shrink-0 place-items-center rounded-md border border-line-strong bg-canvas/80">
      <span className="h-2.5 w-4 -translate-y-1 rounded-[2px] border border-fg/45 bg-panel" />
      <span className="absolute h-2.5 w-4 translate-y-1 rounded-[2px] border border-accent/65 bg-accent-soft" />
    </span>
  );
}

export function StudioProjectLibraryFastStartStrip({
  className,
}: {
  readonly className?: string;
} = {}) {
  useBilingualI18nRevision();

  return (
    <nav
      aria-label={bi("1초 포맷 빠른 시작", "1-second format fast start")}
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
              "group flex min-h-11 flex-col justify-between gap-2.5 rounded-2xl border p-3.5 text-left transition-all duration-200 ease-out-expo hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transform-none",
              item.primary
                ? "border-accent/45 bg-gradient-to-br from-accent-soft/65 via-card to-panel hover:border-accent"
                : "border-line bg-card/90 hover:border-accent/50 hover:bg-raised/75",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-display text-xs font-extrabold tabular-nums text-accent">
                  {item.index}
                </span>
                <span className="rounded-md bg-panel px-2 py-0.5 font-display text-[0.62rem] font-bold tracking-wider text-fg-2">
                  {item.spec}
                </span>
              </div>
              <FormatPreviewMotif motif={item.motif} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs font-black text-fg group-hover:text-accent sm:text-sm">
                  <Icon size={14} className="shrink-0 text-accent" aria-hidden="true" />
                  <span className="truncate">{bi(item.labelKo, item.labelEn)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[0.68rem] text-fg-2">
                  {bi(item.hintKo, item.hintEn)}
                </span>
              </span>
              <ArrowUpRight
                size={15}
                aria-hidden="true"
                className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent"
              />
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
