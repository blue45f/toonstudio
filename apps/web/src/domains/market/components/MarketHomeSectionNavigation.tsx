import { ArrowLeft } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { MARKET_HOME_SECTIONS, type MarketHomeSection } from "./market-home-section";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/** 한 번에 한 목적만 보여 주고 이동·뒤로가기는 실제 URL 기록으로 처리한다. */
export function MarketHomeSectionNavigation({ section }: { readonly section: MarketHomeSection }) {
  const t = useBilingual("MarketHomeSectionNavigation");
  const location = useLocation();
  const navigate = useNavigate();
  const previousScreen = useRef(section);
  const selected = MARKET_HOME_SECTIONS.find((item) => item.id === section) ?? MARKET_HOME_SECTIONS[0];
  const navLabel = t("마켓 작업 선택", "Choose a market task");

  useEffect(() => {
    if (previousScreen.current === section) return;
    previousScreen.current = section;
    const heading = document.querySelector<HTMLElement>("main h1, h1");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }, [section]);

  const hrefFor = (target: MarketHomeSection) => {
    const params = new URLSearchParams(location.search);
    if (target === "buy") params.delete("section");
    else params.set("section", target);
    return { pathname: location.pathname, search: params.toString(), hash: location.hash };
  };

  return (
    <div className="border-b border-line bg-canvas/90">
      <Container size="wide" className="market-home-purpose">
        {section !== "buy" ? (
          <header className=" pb-4 pt-5">
            <Link
              to={hrefFor("buy")}
              state={location.state}
              className="ink-arrow mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] text-xs font-medium text-fg-2 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {t("소재 찾기로", "Back to materials")}
            </Link>
            <h1
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight text-fg outline-none [word-break:keep-all] focus-visible:outline-2 focus-visible:outline-accent sm:text-3xl"
            >
              {t(selected.title[0], selected.title[1])}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-fg-2 [word-break:keep-all]">
              {t("필요한 작업을 골라 한 화면씩 살펴보세요", "Choose a task and explore one screen at a time")}
            </p>
          </header>
        ) : null}

        <nav aria-label={navLabel} className="py-2 sm:py-0">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2 sm:hidden">
            <span>{navLabel}</span>
            <select
              aria-label={navLabel}
              value={section}
              className="min-h-11 w-full rounded-[8px] border border-line bg-card px-3 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              onChange={(event) => {
                const target = event.target.value as MarketHomeSection;
                navigate(hrefFor(target), { state: location.state });
              }}
            >
              {MARKET_HOME_SECTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.label[0], item.label[1])}
                </option>
              ))}
            </select>
          </label>

          <div className="hidden items-center gap-1 sm:flex">
            {MARKET_HOME_SECTIONS.map((item, index) => {
              const active = section === item.id;
              return (
                <Fragment key={item.id}>
                  {index > 0 ? (
                    <span aria-hidden="true" className="select-none text-xs text-fg-3/50">
                      ·
                    </span>
                  ) : null}
                  <Link
                    to={hrefFor(item.id)}
                    state={location.state}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative inline-flex min-h-11 items-center px-3 text-sm transition-colors duration-150",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                      active
                        ? "font-medium text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:bg-accent"
                        : "font-normal text-fg-2 hover:text-fg",
                    )}
                  >
                    {t(item.label[0], item.label[1])}
                  </Link>
                </Fragment>
              );
            })}
          </div>
        </nav>
      </Container>
    </div>
  );
}
