import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from "react";

import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

import { StudioProjectStartPanel } from "./StudioProjectStartPanel";
import { StudioRolePersonalizationCenter } from "./StudioRolePersonalizationCenter";
import { StudioRoleWorkspacePanel } from "./StudioRoleWorkspacePanel";

import { buttonClass } from "@/shared/components/ui/button-utils";

type PlanningPanel = ComponentType<{ readonly locale: "ko" | "en" }>;
const planningLoader = createStudioIntentLazyLoader<{ default: PlanningPanel }>(() =>
  import("./StudioWorkflowPlanningPanel").then((module) => ({ default: module.StudioWorkflowPlanningPanel })),
);

/**
 * 작업 방식·직무 설정 묶음. 작품 홈에서는 접힌 상태가 기본이므로 펼칠 때만 청크와
 * 프로필 요청을 시작한다.
 */
export function StudioLibraryPersonalizePanels({ locale }: { readonly locale: string }) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  const [open, setOpen] = useState(false);
  const [Panel, setPanel] = useState<PlanningPanel | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const ko = locale === "ko";
  useEffect(() => () => { requestVersion.current += 1; }, []);

  const loadPanel = async () => {
    const version = ++requestVersion.current;
    setLoadState("loading");
    try {
      const module = await planningLoader.load();
      if (requestVersion.current !== version) return;
      setPanel(() => module.default);
      setLoadState("ready");
    } catch {
      if (requestVersion.current === version) setLoadState("error");
    }
  };
  const closePanel = useCallback(() => {
    requestVersion.current += 1;
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !(event.target instanceof Node)
        || !panelRef.current?.contains(event.target)) return;
      event.preventDefault();
      closePanel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closePanel, open]);

  return (
    <>
      <StudioRoleWorkspacePanel locale={locale} />
      <StudioProjectStartPanel locale={locale === "ko" ? "ko" : "en"} />
      <StudioRolePersonalizationCenter locale={locale} />
      <section className="rounded-2xl border border-line bg-panel/40 p-4 sm:p-5">
        <button type="button" ref={triggerRef} aria-expanded={open} aria-controls={panelId}
          className={buttonClass({ variant: "outline", className: "h-auto min-h-10 max-w-full whitespace-normal py-2 text-left leading-5 pointer-coarse:h-auto pointer-coarse:min-h-11" })}
          onFocus={planningLoader.preload} onPointerEnter={planningLoader.preload}
          onClick={() => {
            if (open) { closePanel(); return; }
            setOpen(true);
            if (loadState !== "ready") void loadPanel();
          }}>
          {ko ? `분업 계획·만화 프리셋 ${open ? "접기" : "펼치기"}` : `${open ? "Close" : "Open"} production planning and comic presets`}
        </button>
        {open ? (
          <div ref={panelRef} id={panelId} role="region" aria-label={ko ? "분업 계획 도구" : "Production planning tools"} tabIndex={-1} className="mt-4">
            {loadState === "loading" ? <p role="status">{ko ? "분업 계획 도구를 불러오는 중…" : "Loading planning tools…"}</p> : null}
            {loadState === "error" ? (
              <div role="alert" className="space-y-2 text-sm text-fg-2">
                <p>{ko ? "분업 계획 도구를 불러오지 못했습니다." : "Could not load the planning tools."}</p>
                <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => { void loadPanel(); }}>
                  {ko ? "다시 불러오기" : "Try again"}
                </button>
              </div>
            ) : null}
            {loadState === "ready" && Panel ? <Panel locale={ko ? "ko" : "en"} /> : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
