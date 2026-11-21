import { Clapperboard, Compass, Library, MessageSquareText } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import { buildReaderCutsStudioHref } from "./title-reader-rhythm";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleReaderReaBridgeCard", ko, en);

/**
 * 회차 감상 직후 독자가 자연스럽게 이어갈 수 있는 후속 동선 카드.
 */
export function TitleReaderReaBridgeCard({
  title,
  episode,
}: {
  readonly title: Title;
  readonly episode: number;
}) {
  useBilingualI18nRevision();
  const detailPath = `/title/${encodeURIComponent(title.slug)}`;
  const pencafePath = `/pencafe/${encodeURIComponent(title.title)}`;
  const cutsPath = buildReaderCutsStudioHref({ slug: title.slug, episode });

  const bridges = [
    {
      id: "cuts",
      href: cutsPath,
      icon: Clapperboard,
      label: bi("숏폼 컷 만들기", "Create a short-form cut"),
      desc: bi("인상 깊은 장면을 짧은 세로 영상으로 편집해요", "Turn memorable scenes into a vertical clip"),
    },
    {
      id: "pencafe",
      href: pencafePath,
      icon: MessageSquareText,
      label: bi("작가 응원·소식", "Creator news & talk"),
      desc: formatI18nTemplate(bi("{v0}화 감상평과 팬아트를 독자들과 나눠요", "Share Episode {v0} reactions and fan art"), {
        v0: String(episode),
      }),
    },
    {
      id: "library",
      href: "/library?tab=diary",
      icon: Library,
      label: bi("감상 기록 남기기", "Save reading notes"),
      desc: bi("읽은 회차와 평점·메모를 내 서재에 남겨요", "Log episode progress and notes in your library"),
    },
    {
      id: "recommend",
      href: "/recommend",
      icon: Compass,
      label: bi("비슷한 작품 찾기", "Find similar stories"),
      desc: bi("장르와 분위기가 닮은 다음 작품을 둘러봐요", "Discover next reads with a similar mood"),
    },
  ] as const;

  return (
    <details
      aria-label={bi("회차 감상 후 이어지는 활동", "Post-episode next steps")}
      data-testid="reader-rea-finish-bridge"
      className="reader-bridge-panel mt-4 rounded-2xl p-4 sm:p-5"
    >
      <summary className="reader-bridge-summary min-h-11 cursor-pointer content-center rounded-lg text-sm font-semibold [word-break:keep-all]">
        {bi("감상 후 더 보기", "More after reading")}
      </summary>
      <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold [word-break:keep-all]">
          {formatI18nTemplate(bi("{v0}화 감상 후 이어가기", "After Episode {v0}"), {
            v0: String(episode),
          })}
        </h2>
        <Link
          href={`${detailPath}#title-reviews`}
          className="reader-ink-muted inline-flex min-h-11 items-center text-xs font-semibold transition-colors duration-150 underline-offset-4 hover:underline motion-reduce:transition-none"
        >
          {bi("작품 리뷰 남기기 →", "Write a review →")}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bridges.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="reader-bridge-card group flex min-h-11 items-start gap-3 rounded-xl p-3 text-left"
            >
              <span className="reader-bridge-icon grid size-9 shrink-0 place-items-center rounded-lg">
                <Icon size={16} strokeWidth={1.5} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold [word-break:keep-all] group-hover:underline">
                  {item.label}
                </span>
                <span className="reader-ink-subtle mt-0.5 block text-xs leading-snug [word-break:keep-all]">
                  {item.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}
