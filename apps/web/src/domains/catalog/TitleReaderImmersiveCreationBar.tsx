import { Brush, Layers, PlayCircle } from "lucide-react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleReaderImmersiveCreationBar", ko, en);

export function TitleReaderImmersiveCreationBar() {
  useBilingualI18nRevision();

  return (
    <nav
      aria-label={bi("몰입형 감상·창작 전환", "Immersive reader and creation bridge")}
      data-testid="reader-spatial-creation-bar"
      className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/12 bg-reader-panel/75 p-3"
    >
      <Link
        href="/read/spatial"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <Layers size={14} aria-hidden />
        {bi("2.5D 공간 리더 체험", "Try 2.5D Spatial Reader")}
      </Link>
      <Link
        href="/create"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/25 bg-white px-3.5 text-xs font-bold text-[oklch(0.16_0.02_265)] transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <Brush size={14} aria-hidden />
        {bi("이 감성으로 3컷 창작", "Create 3-panel story")}
      </Link>
      <Link
        href="/product-tour"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <PlayCircle size={14} aria-hidden />
        {bi("인터랙티브 제품 투어", "Interactive Product Tour")}
      </Link>
    </nav>
  );
}
