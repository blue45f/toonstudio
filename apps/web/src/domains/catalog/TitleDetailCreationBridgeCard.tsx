import { Brush, Layers, MessageSquareText, Sparkles } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { spectrumGradient } from "@/shared/lib/genre-color";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { GENRES } from "@/shared/lib/taxonomy";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleDetailCreationBridgeCard", ko, en);

const BRIDGE_RIBBON = spectrumGradient(GENRES);

/**
 * 시안 E · M (Title Detail -> Studio & Spatial Reader Bridge) — 감상 직후 3컷 연출·2.5D 공간 뷰어·캐릭터 토크로 직행하는 브리지 카드.
 */
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
      className="mt-6 overflow-hidden rounded-2xl border border-accent/35 bg-[linear-gradient(155deg,color-mix(in_oklch,var(--color-accent)_10%,var(--color-panel)),var(--color-card))] shadow-sm"
    >
      <div aria-hidden="true" className="h-[3px] w-full" style={{ background: BRIDGE_RIBBON }} />
      <div className="flex flex-col gap-3.5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent">
            <Sparkles size={13} aria-hidden="true" />
            <span>SPECTRUM TO STUDIO · IMMERSIVE BRIDGE</span>
          </p>
          <p className="mt-1 text-sm font-bold text-fg sm:text-base">
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
