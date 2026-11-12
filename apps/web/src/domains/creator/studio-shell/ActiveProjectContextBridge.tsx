import { ArrowRight, ChevronDown, FolderOpen, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { useLocation } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import {
  activeProjectIdFromLocation,
  contextualProjectHref,
  readActiveProjectContext,
  supportsActiveProjectBridge,
  writeActiveProjectContext,
} from "./active-project-context";
import { EXAMPLE_PROJECT_ID } from "../studio-example-project-content";
import { SAMPLE_PROJECT_ID } from "../studio-sample-manuscript-content";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";

const DISMISS_KEY_PREFIX = "toonstudio:active-project-bridge:dismissed:";
const RETURN_KEY = "toonstudio:active-project-bridge:return:v1";
type ReturnAction = "project" | "contextual";
interface ReturnMarker {
  readonly historyKey: string;
  readonly pathname: string;
  readonly routeProjectId: string | null;
  readonly projectId: string;
  readonly action: ReturnAction;
}

function contextStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

function readReturnMarker(): ReturnMarker | null {
  try {
    const raw = contextStorage()?.getItem(RETURN_KEY);
    if (!raw || raw.length > 2048) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object"
      || !("historyKey" in value) || typeof value.historyKey !== "string" || value.historyKey.length > 256
      || !("pathname" in value) || typeof value.pathname !== "string" || value.pathname.length > 512
      || !("routeProjectId" in value) || (value.routeProjectId !== null && (typeof value.routeProjectId !== "string" || value.routeProjectId.length > 160))
      || !("projectId" in value) || typeof value.projectId !== "string" || !value.projectId || value.projectId.length > 160
      || !("action" in value) || (value.action !== "project" && value.action !== "contextual")) return null;
    return { historyKey: value.historyKey, pathname: value.pathname, routeProjectId: value.routeProjectId, projectId: value.projectId, action: value.action };
  } catch { return null; }
}

function isNativeProjectHistoryReturn(): boolean {
  return globalThis.performance?.getEntriesByType?.("navigation").some((entry) => "type" in entry && entry.type === "back_forward") ?? false;
}

function dismissKey(pathname: string, projectId: string): string {
  const area = pathname.split("/").filter(Boolean)[0] ?? "home";
  return `${DISMISS_KEY_PREFIX}${area}:${projectId}`;
}

export function ActiveProjectContextBridge() {
  const { pathname, search, key: historyKey } = useLocation();
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const locale = korean ? "ko" : "en";
  const library = useStudioProjectLibrary(locale, "active");
  const [dismissed, setDismissed] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const routeKey = `${pathname}${search}`;
  const explicitProjectId = useMemo(
    () => activeProjectIdFromLocation(pathname, search),
    [pathname, search],
  );
  // 탭·검색 조건은 작품 선택을 바꾸지 않는다. URL이 다른 작품을 명시하면 기존 우선순위를 따른다.
  const selectionKey = `${pathname}\n${explicitProjectId ?? ""}`;
  const [manualSelection, setManualSelection] = useState<{ selectionKey: string; projectId: string } | null>(() => {
    const marker = readReturnMarker();
    return isNativeProjectHistoryReturn() && marker?.historyKey === historyKey && marker.pathname === pathname
      && marker.routeProjectId === explicitProjectId ? { selectionKey, projectId: marker.projectId } : null;
  });
  const manualProjectId = manualSelection?.selectionKey === selectionKey ? manualSelection.projectId : null;
  const storedProjectId = readActiveProjectContext(contextStorage());
  const projectOptions = useMemo(() => [...library.projects]
    .sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt)), [library.projects]);
  const recentProject = projectOptions[0] ?? null;
  const selectedProject = projectOptions.find((project) => project.id === manualProjectId)
    ?? projectOptions.find((project) => project.id === explicitProjectId)
    ?? projectOptions.find((project) => project.id === storedProjectId)
    ?? recentProject;

  useEffect(() => {
    if (!selectedProject || typeof window === "undefined") return;
    writeActiveProjectContext(contextStorage(), selectedProject.id);
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject || typeof window === "undefined") {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey(pathname, selectedProject.id)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [pathname, selectedProject]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || !details.open) return;
      details.open = false;
      summaryRef.current?.focus();
      event.preventDefault();
      event.stopPropagation();
    };
    details.addEventListener("keydown", onKeyDown);
    return () => details.removeEventListener("keydown", onKeyDown);
  }, [dismissed, routeKey, selectedProject?.id]);

  useEffect(() => {
    const restore = (historyReturn: boolean) => {
      const marker = readReturnMarker();
      if (!marker || marker.historyKey !== historyKey || marker.pathname !== pathname
        || marker.routeProjectId !== explicitProjectId || marker.projectId !== selectedProject?.id) return;
      const details = detailsRef.current;
      if (!details || dismissed) return;
      try { contextStorage()?.removeItem(RETURN_KEY); } catch { /* 저장이 막혀도 현재 화면은 유지한다. */ }
      if (!historyReturn) return;
      const focused = document.activeElement;
      // 일반 진입과 외부 입력의 초점은 건드리지 않고, 표식을 만든 native 복귀에만 적용한다.
      if (focused && focused !== document.body && focused !== document.documentElement
        && focused.id !== "main-content" && !asideRef.current?.contains(focused)) return;
      const target = details.querySelector<HTMLAnchorElement>(`[data-active-project-return-action="${marker.action}"]`);
      if (!target) return;
      details.open = true;
      target.focus({ preventScroll: true });
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) restore(true); };
    restore(isNativeProjectHistoryReturn());
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [dismissed, explicitProjectId, historyKey, pathname, selectedProject?.id]);

  if (!supportsActiveProjectBridge(pathname) || !selectedProject || dismissed) return null;

  const contextual = contextualProjectHref(pathname, selectedProject.id);
  const projectHref = `/studio/p/${encodeURIComponent(selectedProject.id)}/overview`;
  const close = () => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(dismissKey(pathname, selectedProject.id), "1");
      } catch {
        // Dismiss in memory when storage is unavailable.
      }
    }
    if (asideRef.current?.contains(document.activeElement)) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    }
    setDismissed(true);
  };
  const selectProject = (projectId: string) => {
    setManualSelection({ selectionKey, projectId });
    setDismissed(false);
    if (typeof window !== "undefined") {
      writeActiveProjectContext(contextStorage(), projectId);
    }
  };

  const rememberReturn = (event: MouseEvent<HTMLAnchorElement>, action: ReturnAction) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = event.currentTarget.getAttribute("href");
    if (!href || !(href === "/studio" || href.startsWith("/studio/"))) return;
    // 문서 경계를 넘는 출발만 기록하며 주소 query·원고·저장 상태는 복제하지 않는다.
    try {
      contextStorage()?.setItem(RETURN_KEY, JSON.stringify({ historyKey, pathname, routeProjectId: explicitProjectId, projectId: selectedProject.id, action }));
    } catch { /* 복귀 표식이 없어도 기존 링크 이동은 계속한다. */ }
  };

  const sampleKind = selectedProject.id === EXAMPLE_PROJECT_ID
    ? "example"
    : selectedProject.id === SAMPLE_PROJECT_ID ? "sample" : null;

  return (
    <aside
      ref={asideRef}
      data-active-project-context="true"
      aria-label={korean ? "현재 작품 연결" : "Current work connection"}
      className="relative z-30 mx-auto mt-3 w-[min(100%-1.5rem,88rem)] overflow-hidden rounded-2xl border border-accent/30 bg-panel/95 text-fg shadow-lg backdrop-blur-xl"
    >
      <details
        key={routeKey}
        ref={detailsRef}
        className="group"
        onToggle={(event) => {
          if (event.currentTarget !== detailsRef.current || event.currentTarget.open) return;
          if (menuRef.current?.contains(document.activeElement)) summaryRef.current?.focus();
        }}
      >
        <summary
          ref={summaryRef}
          aria-controls={menuId}
          className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent sm:px-4 [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3.5">
            <span className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] leading-[18px] text-fg-2">
              {korean ? "현재 작품" : "Current work"}
              {sampleKind && (
                <span data-active-project-sample={sampleKind} className="rounded-md border border-accent/35 bg-accent-soft px-1.5 text-[0.625rem] font-bold text-accent">
                  {sampleKind === "example" ? korean ? "예제" : "Example" : korean ? "샘플" : "Sample"}
                </span>
              )}
            </span>
            <strong title={selectedProject.title} data-active-project-title="true" className="block min-w-0 truncate text-sm font-black leading-[22px]">
              {selectedProject.title}
            </strong>
          </span>
          <span className="flex min-h-11 shrink-0 items-center justify-center gap-2 text-xs font-bold text-accent">
            <span className="group-open:hidden">{korean ? "더 보기" : "More"}</span>
            <span className="hidden group-open:inline">{korean ? "접기" : "Collapse"}</span>
            <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <div ref={menuRef} id={menuId} role="region" aria-label={korean ? "현재 작품 메뉴" : "Current work menu"} className="grid gap-3.5 border-t border-line p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-4 sm:p-4">
          <div className="min-w-0">
            {projectOptions.length > 1 ? (
              <label className="block min-w-0 text-xs font-bold sm:max-w-lg">
                {korean ? "작품 바꾸기" : "Change work"}
                <select
                  data-active-project-selector="true"
                  value={selectedProject.id}
                  onChange={(event) => selectProject(event.target.value)}
                  className="mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-line bg-card px-3 text-sm font-black text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                </select>
              </label>
            ) : (
              <p className="break-words text-sm font-bold [overflow-wrap:anywhere]">{selectedProject.title}</p>
            )}
            <p className="mt-2 text-xs leading-5 text-fg-2">
              {korean ? "실습과 자료 찾기를 선택한 작품으로 이어가세요." : "Continue practice and finding resources for the selected work."}
            </p>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <Link href={projectHref} data-active-project-return-action="project" onClick={(event) => rememberReturn(event, "project")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition hover:border-line-strong hover:text-fg motion-reduce:transition-none">
              <FolderOpen size={15} aria-hidden="true" />
              {korean ? "프로젝트" : "Project"}
            </Link>
            <Link href={contextual.href} data-active-project-return-action="contextual" onClick={(event) => rememberReturn(event, "contextual")} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-on-accent shadow-sm transition hover:bg-accent-2 motion-reduce:transition-none">
              {korean ? contextual.labelKo : contextual.labelEn}
              <ArrowRight size={15} aria-hidden="true" className="shrink-0" />
            </Link>
            <button type="button" onClick={close} className="col-span-2 inline-flex min-h-11 items-center justify-self-start gap-1.5 rounded-xl px-2 text-xs font-semibold text-fg-3 transition hover:bg-raised hover:text-fg motion-reduce:transition-none">
              <X size={15} aria-hidden="true" />
              {korean ? "이 작품 안내 숨기기" : "Hide work notice"}
            </button>
          </div>
        </div>
      </details>
    </aside>
  );
}

export default ActiveProjectContextBridge;
