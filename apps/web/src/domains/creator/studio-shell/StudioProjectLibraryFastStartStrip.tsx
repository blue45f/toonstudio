import { ArrowUpRight } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectLibraryFastStartStrip", ko, en);

const FAST_START_ITEMS = [
  {
    id: "webtoon-vertical",
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    tool: "pen",
    domain: "draw",
    labelKo: "세로 웹툰 시작",
    labelEn: "Start a webtoon",
    hintKo: "위아래로 읽는 웹툰",
    hintEn: "A story readers scroll through",
    primary: true,
  },
  {
    id: "four-cut-classic",
    href: "/studio/new?kind=four-cut&template=four-cut-classic",
    tool: "frame",
    domain: "character",
    labelKo: "4컷 만화 시작",
    labelEn: "Start a 4-panel comic",
    hintKo: "네 칸으로 만드는 이야기",
    hintEn: "Tell a story in four panels",
    primary: false,
  },
  {
    id: "bg3d-stage",
    href: "/studio/bg3d",
    tool: "bg3d",
    domain: "3d",
    labelKo: "3D 장면 만들기",
    labelEn: "Build a 3D scene",
    hintKo: "배경과 캐릭터 배치",
    hintEn: "Arrange backgrounds and characters",
    primary: false,
  },
  {
    id: "psd-clip-import",
    href: "/studio/import",
    tool: "layers",
    domain: "collab",
    labelKo: "원고 파일 불러오기",
    labelEn: "Import a manuscript",
    hintKo: "PSD·CLIP 파일 가져오기",
    hintEn: "Bring in a PSD or CLIP file",
    primary: false,
  },
] as const;

export function StudioProjectLibraryFastStartStrip({
  className,
  columns = 2,
}: {
  readonly className?: string;
  readonly columns?: 2 | 4;
} = {}) {
  useBilingualI18nRevision();

  return (
    <nav
      aria-label={bi("작업 시작 방식", "Ways to start creating")}
      data-studio-fast-start-strip="true"
      className={cn(
        "studio-vivid-start-grid grid h-full auto-rows-fr grid-cols-2 gap-2.5",
        columns === 4 && "xl:grid-cols-4!",
        className,
      )}
    >
      {FAST_START_ITEMS.map((item) => {
        return (
          <Link
            key={item.id}
            href={item.href}
            data-studio-fast-start-item={item.id}
            data-spectrum-domain={item.domain}
            className={cn(
              "studio-vivid-start-tile group min-h-11 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              item.primary && "studio-vivid-start-tile--primary",
            )}
          >
            <span className="studio-vivid-start-icon" aria-hidden="true">
              <StudioToolArtwork tool={item.tool} variant="art" className="studio-library-start-tool" />
            </span>
            <span className="studio-vivid-start-copy">
              <span className="studio-vivid-start-label">
                {bi(item.labelKo, item.labelEn)}
              </span>
              <span className="studio-vivid-start-hint">
                {bi(item.hintKo, item.hintEn)}
              </span>
            </span>
            <ArrowUpRight size={16} aria-hidden="true" className="studio-vivid-start-arrow" />
          </Link>
        );
      })}
    </nav>
  );
}
