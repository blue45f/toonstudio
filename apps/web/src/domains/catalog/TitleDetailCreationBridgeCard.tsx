import { Brush, Layers, MessageSquareText } from "lucide-react";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleDetailCreationBridgeCard", ko, en);

export function TitleDetailCreationBridgeCard({
  slug,
  titleName,
}: {
  readonly slug: string;
  readonly titleName: string;
}) {
  useBilingualI18nRevision();

  return (
    <section
      aria-label={bi("창작 및 공간 감상 연결", "Creation and spatial reader bridge")}
      data-testid="title-detail-creation-bridge"
      className="mt-6 rounded-2xl border border-accent/30 bg-panel/65 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-accent">
            SPECTRUM TO STUDIO · IMMERSIVE BRIDGE
          </p>
          <p className="mt-1 text-sm font-bold text-fg">
            {formatI18nTemplate(
              bi(
                "「{v0}」의 호흡에서 영감을 얻었나요? 바로 3컷 연출이나 공간 뷰어로 이어가세요.",
                "Inspired by {v0}? Jump straight into a 3-panel storyboard or spatial reader.",
              ),
              { v0: titleName },
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/create"
            className={buttonClass({ variant: "solid", size: "sm", className: "min-h-11 gap-1.5 px-3.5" })}
          >
            <Brush size={15} aria-hidden="true" />
            {bi("이 연출 템플릿으로 3컷 시작", "Start 3-panel story")}
          </Link>
          <Link
            href="/read/spatial"
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5 px-3" })}
          >
            <Layers size={15} aria-hidden="true" />
            {bi("2.5D 공간 리더 체험", "2.5D Spatial Reader")}
          </Link>
          <Link
            href={`/character-chat?work=${encodeURIComponent(slug)}`}
            className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5 px-3" })}
          >
            <MessageSquareText size={15} aria-hidden="true" />
            {bi("캐릭터와 대화하기", "Character Talk")}
          </Link>
        </div>
      </div>
    </section>
  );
}
