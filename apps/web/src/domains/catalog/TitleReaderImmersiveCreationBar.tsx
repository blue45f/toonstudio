import { Brush, ChevronDown, Layers, PlayCircle } from "lucide-react";

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
    <details
      data-testid="reader-spatial-creation-bar"
      className="group mt-4 rounded-xl border border-current/20 bg-reader-panel/85 text-inherit"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        {bi("창작·뷰어 체험", "Create or try the viewer")}
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
      </summary>
      <nav
        aria-label={bi("창작·뷰어 체험", "Create or try the viewer")}
        className="flex flex-wrap gap-2 border-t border-current/20 p-3"
      >
        <Link
          href="/read/spatial"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-current/20 px-3 text-sm text-inherit hover:bg-reader-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Layers size={16} aria-hidden="true" />
          {bi("공간 뷰어 체험", "Try the spatial viewer")}
        </Link>
        <Link
          href="/create"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-current/20 px-3 text-sm text-inherit hover:bg-reader-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Brush size={16} aria-hidden="true" />
          {bi("3컷 이야기 만들기", "Create a 3-panel story")}
        </Link>
        <Link
          href="/product-tour"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-current/20 px-3 text-sm text-inherit hover:bg-reader-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <PlayCircle size={16} aria-hidden="true" />
          {bi("사용법 둘러보기", "Take a product tour")}
        </Link>
      </nav>
    </details>
  );
}
