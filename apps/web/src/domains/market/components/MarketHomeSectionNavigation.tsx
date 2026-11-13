import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { MARKET_HOME_SECTIONS, type MarketHomeSection } from "./market-home-section";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/** 한 번에 한 목적만 보여 주고 이동·뒤로가기는 실제 URL 기록으로 처리한다. */
export function MarketHomeSectionNavigation({ section }: { readonly section: MarketHomeSection }) {
  const t = useBilingual("MarketHomeSectionNavigation");
  const { search } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(section);
  const selected = MARKET_HOME_SECTIONS.find((item) => item.id === section) ?? MARKET_HOME_SECTIONS[0];
  const hrefFor = (target: MarketHomeSection) => {
    const params = new URLSearchParams(search);
    if (target === "buy") params.delete("section");
    else params.set("section", target);
    return `/market${params.size ? `?${params.toString()}` : ""}`;
  };

  useEffect(() => {
    if (previous.current === section) return;
    previous.current = section;
    const target = root.current?.querySelector<HTMLElement>("h1, [aria-current='page']");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: "start" });
  }, [section]);

  return <Container size="wide" className="py-4 sm:py-6">
    <div ref={root}>
      {section !== "buy" ? <header className="mb-5">
        <Link href={hrefFor("buy")} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ArrowLeft size={16} aria-hidden="true" />{t("소재 찾기로", "Back to materials")}
        </Link>
        <h1 tabIndex={-1} className="text-2xl font-bold tracking-tight text-fg outline-none focus-visible:outline-2 focus-visible:outline-accent">{t(selected.title[0], selected.title[1])}</h1>
        <p className="mt-2 text-sm leading-6 text-fg-2">{t("필요한 작업을 골라 한 화면씩 살펴보세요.", "Choose a task and explore one screen at a time.")}</p>
      </header> : null}
      <nav aria-label={t("마켓 작업 선택", "Choose a market task")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MARKET_HOME_SECTIONS.map((item) => <Link key={item.id} href={hrefFor(item.id)}
          aria-current={section === item.id ? "page" : undefined}
          className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2.5 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${section === item.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg"}`}>
          {t(item.label[0], item.label[1])}
        </Link>)}
      </nav>
    </div>
  </Container>;
}
