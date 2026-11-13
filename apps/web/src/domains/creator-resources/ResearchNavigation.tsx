import { ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { RESOURCE_MENU_GROUPS, RESOURCE_PAGES, resourceMenuGroupPages } from "./navigation";

import { translateCurrentStaticSourceText, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 자료를 찾는 본문 앞에는 현재 위치와 메뉴 진입점 하나만 둔다. */
export function ResearchNavigation({ pathname }: { readonly pathname: string }) {
  const bt = useBilingual("ResearchNavigation");
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !element.open) return;
      event.preventDefault();
      event.stopPropagation();
      element.open = false;
      element.querySelector("summary")?.focus({ preventScroll: true });
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, []);
  const tx = (value: string) => translateCurrentStaticSourceText("domains.creator.resources.ResourceLayout", "ko", value);
  const current = RESOURCE_PAGES.filter((page) => pathname === page.path || pathname.startsWith(`${page.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0];
  const initial = RESOURCE_MENU_GROUPS.find((group) => group.paths.includes(current?.path ?? "")) ?? RESOURCE_MENU_GROUPS[0];
  const [groupId, setGroupId] = useState(initial.id);
  const group = RESOURCE_MENU_GROUPS.find((item) => item.id === groupId) ?? initial;
  return (
    <details ref={menu} className="research-task-menu group/research" data-research-task-menu data-resource-search-menu>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2"><Search size={17} aria-hidden="true" />{bt("리서치 메뉴", "Research menu")}</span>
        <span className="ml-auto truncate text-xs font-medium text-fg-2">{current ? tx(current.title) : null}</span>
        <ChevronDown size={16} className="shrink-0 transition-transform group-open/research:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <nav aria-label={bt("창작 리서치 메뉴", "Creative research menu")} className="mt-2 rounded-xl border border-line bg-panel p-3">
        <Link to="/research" aria-current={pathname === "/research" ? "page" : undefined} className="mb-3 flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-accent hover:bg-accent-soft">{bt("리서치 데스크", "Research desk")}</Link>
        <div role="group" aria-label={bt("리서치 메뉴 묶음", "Research menu groups")} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {RESOURCE_MENU_GROUPS.map((item) => <button key={item.id} type="button" aria-pressed={group.id === item.id} onClick={() => setGroupId(item.id)} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-bold ${group.id === item.id ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-raised"}`}>{bt(...item.title)}</button>)}
        </div>
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
          {resourceMenuGroupPages(group).map((page) => <Link key={page.path} to={page.path} aria-current={current?.path === page.path ? "page" : undefined} className={`flex min-h-12 items-center rounded-lg border px-3 py-2 text-sm ${current?.path === page.path ? "border-accent bg-accent-soft font-bold text-accent" : "border-line text-fg-2 hover:bg-raised"}`}>{tx(page.title)}</Link>)}
        </div>
      </nav>
    </details>
  );
}
