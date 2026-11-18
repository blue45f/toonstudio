import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

export function HeroBannerBadge() {
  const label = translateBilingualValueForActiveLocale("hero-banner-badge", "이 주의 발견", "Featured this week");
  return (
    <div className="absolute -top-3 left-4 z-20">
      <span className="inline-flex items-center rounded-md border border-line-strong bg-panel px-2.5 py-1 text-xs font-medium text-fg">
        {label}
      </span>
    </div>
  );
}
