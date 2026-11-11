import { Brush, ChevronDown, Layers, MessageSquareText } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleDetailCreationBridgeCard", ko, en);

/** 작품 감상 다음의 선택지는 사용자가 펼쳤을 때만 보여준다. */
export function TitleDetailCreationBridgeCard({
  slug,
  titleName,
}: {
  readonly slug: string;
  readonly titleName: string;
}) {
  useBilingualI18nRevision();

  return (
    <details
      data-testid="title-detail-creation-bridge"
      className="group mt-6 rounded-xl border border-line bg-panel text-fg"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-medium text-fg-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        {bi("창작·뷰어 체험", "Create or try the viewer")}
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
      </summary>
      <nav
        aria-label={bi("창작·뷰어 체험", "Create or try the viewer")}
        className="space-y-3 border-t border-line p-4"
      >
        <p className="text-sm text-fg-2">
          {formatI18nTemplate(
            bi("「{v0}」에서 얻은 영감을 이어가 보세요.", "Take your inspiration from {v0} further."),
            { v0: titleName },
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/create"
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-2 px-3" })}
          >
            <Brush size={15} aria-hidden="true" />
            {bi("3컷 이야기 만들기", "Create a 3-panel story")}
          </Link>
          <Link
            href="/read/spatial"
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5 px-3" })}
          >
            <Layers size={15} aria-hidden="true" />
            {bi("공간 뷰어 체험", "Try the spatial viewer")}
          </Link>
          <Link
            href={`/character-chat?work=${encodeURIComponent(slug)}`}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5 px-3" })}
          >
            <MessageSquareText size={15} aria-hidden="true" />
            {bi("캐릭터와 대화하기", "Chat with characters")}
          </Link>
        </div>
      </nav>
    </details>
  );
}
