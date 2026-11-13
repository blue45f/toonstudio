import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { MARKET_HOME_SECTIONS, type MarketHomeSection } from "./market-home-section";

import { Container } from "@/shared/components/section";
import { TaskScreenNavigation } from "@/shared/components/task-screen-navigation";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 한 번에 한 목적만 보여 주고 이동·뒤로가기는 실제 URL 기록으로 처리한다. */
export function MarketHomeSectionNavigation({ section }: { readonly section: MarketHomeSection }) {
  const t = useBilingual("MarketHomeSectionNavigation");
  const location = useLocation();
  const selected = MARKET_HOME_SECTIONS.find((item) => item.id === section) ?? MARKET_HOME_SECTIONS[0];
  const hrefFor = (target: MarketHomeSection) => {
    const params = new URLSearchParams(location.search);
    if (target === "buy") params.delete("section");
    else params.set("section", target);
    return { pathname: location.pathname, search: params.toString(), hash: location.hash };
  };
  return <Container size="wide" className="market-home-purpose">
    <div>
      {section !== "buy" ? <header className="mb-5">
        <Link to={hrefFor("buy")} state={location.state} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <ArrowLeft size={16} aria-hidden="true" />{t("소재 찾기로", "Back to materials")}
        </Link>
        <h1 tabIndex={-1} className="text-2xl font-bold tracking-tight text-fg outline-none focus-visible:outline-2 focus-visible:outline-accent">{t(selected.title[0], selected.title[1])}</h1>
        <p className="mt-2 text-sm leading-6 text-fg-2">{t("필요한 작업을 골라 한 화면씩 살펴보세요.", "Choose a task and explore one screen at a time.")}</p>
      </header> : null}
      <TaskScreenNavigation label={t("마켓 작업 선택", "Choose a market task")} param="section"
        activeScreen={section} defaultScreen="buy" items={MARKET_HOME_SECTIONS.map((item) => ({ id: item.id, label: t(item.label[0], item.label[1]) }))} />
    </div>
  </Container>;
}
