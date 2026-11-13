import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

export interface TaskScreenItem {
  readonly id: string;
  readonly label: string;
}

/** 정본 경로 안에서 한 번에 하나의 작업 화면만 선택하는 URL 메뉴. */
export function TaskScreenNavigation({ label, items, activeScreen, defaultScreen, param = "view", headingId }: {
  readonly label: string;
  readonly items: readonly TaskScreenItem[];
  readonly activeScreen: string;
  readonly defaultScreen: string;
  readonly param?: string;
  readonly headingId?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previousScreen = useRef(activeScreen);
  useEffect(() => {
    if (previousScreen.current === activeScreen) return;
    previousScreen.current = activeScreen;
    const heading = headingId ? document.getElementById(headingId) : document.querySelector<HTMLElement>("main h1, h1");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }, [activeScreen, headingId]);

  return (
    <nav aria-label={label} className="my-5">
      <label className="flex flex-col gap-2 text-xs font-bold text-fg-2 sm:hidden">
        {label}
        <select aria-label={label} value={activeScreen} className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onChange={(event) => {
            const next = new URLSearchParams(searchParams);
            if (event.target.value === defaultScreen) next.delete(param);
            else next.set(param, event.target.value);
            navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { state: location.state });
          }}>
          {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="hidden flex-wrap gap-2 sm:flex">
      {items.map((item) => {
        const next = new URLSearchParams(searchParams);
        if (item.id === defaultScreen) next.delete(param);
        else next.set(param, item.id);
        return <Link key={item.id} to={{ pathname: location.pathname, search: next.toString(), hash: location.hash }} state={location.state}
          aria-current={activeScreen === item.id ? "page" : undefined}
          className={`inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${activeScreen === item.id ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:bg-raised"}`}>
          {item.label}
        </Link>;
      })}
      </div>
    </nav>
  );
}
