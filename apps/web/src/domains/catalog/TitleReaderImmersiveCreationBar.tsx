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
      className="relative mt-4 flex flex-wrap items-center justify-center gap-2 overflow-hidden rounded-2xl border border-accent/35 bg-reader-panel/85 p-3.5 shadow-sm backdrop-blur-md"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-cool to-accent-2" />
      <Link
        href="/read/spatial"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 text-xs font-semibold text-white transition-colors hover:border-accent/60 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <Layers size={14} aria-hidden />
        {bi("2.5D 공간 리더 체험", "Try 2.5D Spatial Reader")}
      </Link>
      <Link
        href="/create"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/55 bg-accent px-4 text-xs font-bold text-on-accent shadow-xs transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <Brush size={14} aria-hidden />
        {bi("이 감성으로 3컷 창작", "Create 3-panel story")}
      </Link>
      <Link
        href="/product-tour"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 text-xs font-semibold text-white/90 transition-colors hover:border-accent/60 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <PlayCircle size={14} aria-hidden />
        {bi("인터랙티브 제품 투어", "Interactive Product Tour")}
      </Link>
    </nav>
  );
}
