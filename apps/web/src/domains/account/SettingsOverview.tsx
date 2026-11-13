import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import type { SectionNavItem } from "@/shared/components/section-nav";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 설정 진입은 선택 화면, 실제 설정은 기존 URL별 단일 영역에서 편집한다. */
export function SettingsOverview({ items }: { readonly items: readonly SectionNavItem[] }) {
  const bt = useBilingual("SettingsOverview");
  const location = useLocation();
  return <nav aria-label={bt("바꾸려는 설정 선택", "Choose a settings area")} className="grid gap-3 sm:grid-cols-2">
    {items.map((item) => {
      const Icon = item.icon;
      const params = new URLSearchParams(location.search);
      params.set("view", item.id);
      return <Link key={item.id} to={`${location.pathname}?${params}`} className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-panel p-4 text-sm font-bold transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        {Icon ? <Icon size={21} className="text-accent" aria-hidden="true" /> : null}
        <span>{item.label}</span><ChevronRight size={17} className="ml-auto text-fg-2" aria-hidden="true" />
      </Link>;
    })}
  </nav>;
}
