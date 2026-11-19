import { BookOpen, Brush, ChevronDown, Clapperboard, Layers, MessageSquareText } from "lucide-react";

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
      className="group mt-6 break-keep rounded-xl border border-line bg-panel text-fg [overflow-wrap:break-word]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        {bi("창작·뷰어 체험", "Create or try the viewer")}
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <nav
        aria-label={bi("창작·뷰어 체험", "Create or try the viewer")}
        className="space-y-3 border-t border-line p-4"
      >
        <p className="text-sm leading-[1.6] tracking-[-0.01em] text-fg-2">
          {formatI18nTemplate(
            bi("「{v0}」에서 얻은 영감을 이어가 보세요.", "Take your inspiration from {v0} further."),
            { v0: titleName },
          )}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Link
            href="/create"
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 w-full justify-start gap-2 rounded-lg px-3.5 sm:w-auto sm:justify-center",
            })}
          >
            <Brush size={15} strokeWidth={1.5} aria-hidden="true" />
            {bi("3컷 이야기 만들기", "Create a 3-panel story")}
          </Link>
          <Link
            href="/studio/growth-ip#rights"
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 w-full justify-start gap-2 rounded-lg px-3.5 sm:w-auto sm:justify-center",
            })}
          >
            <Clapperboard size={15} strokeWidth={1.5} aria-hidden="true" />
            {bi("3컷 파일럿·IP 확장", "3-cut pilot & IP expansion")}
          </Link>
          <Link
            href="/studio/storyworld"
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 w-full justify-start gap-2 rounded-lg px-3.5 sm:w-auto sm:justify-center",
            })}
          >
            <BookOpen size={15} strokeWidth={1.5} aria-hidden="true" />
            {bi("스토리월드·바이블", "Storyworld & IP bible")}
          </Link>
          <Link
            href="/read/spatial"
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 w-full justify-start gap-2 rounded-lg px-3.5 sm:w-auto sm:justify-center",
            })}
          >
            <Layers size={15} strokeWidth={1.5} aria-hidden="true" />
            {bi("공간 뷰어 체험", "Try the spatial viewer")}
          </Link>
          <Link
            href={`/character-chat?work=${encodeURIComponent(slug)}`}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: "min-h-11 w-full justify-start gap-2 rounded-lg px-3.5 sm:w-auto sm:justify-center",
            })}
          >
            <MessageSquareText size={15} strokeWidth={1.5} aria-hidden="true" />
            {bi("캐릭터와 대화하기", "Chat with characters")}
          </Link>
        </div>
      </nav>
    </details>
  );
}
